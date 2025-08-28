"""Reliability management for the application"""

import logging
import traceback
from typing import Dict, Any, Optional, List, Callable, TypeVar, Generic
from datetime import datetime
import asyncio

from .error_handler import (
    error_handler,
    ErrorSeverity,
    ErrorCategory,
    RecoveryStrategy
)
# from .progress_manager import progress_manager  # Removed - over-engineered
from backend.infrastructure.events.event_system import event_manager, EventType
from backend.infrastructure.state.state_manager import state_manager
from backend.infrastructure.events.processing_events import ProcessingStage, QualityMetrics

T = TypeVar('T')

class OperationMetrics:
    """Metrics for operation monitoring"""

    def __init__(self):
        self.start_time = datetime.now()
        self.end_time: Optional[datetime] = None
        self.success = False
        self.error: Optional[str] = None
        self.retry_count = 0
        self.duration: Optional[float] = None

    def complete(self, success: bool, error: Optional[str] = None):
        """Complete operation tracking"""
        self.end_time = datetime.now()
        self.success = success
        self.error = error
        self.duration = (self.end_time - self.start_time).total_seconds()

    def to_dict(self) -> Dict[str, Any]:
        """Convert metrics to dictionary"""
        return {
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'success': self.success,
            'error': self.error,
            'retry_count': self.retry_count,
            'duration': self.duration
        }

class Operation(Generic[T]):
    """Operation wrapper with monitoring"""

    def __init__(self,
                 name: str,
                 func: Callable[..., T],
                 context: Optional[Dict[str, Any]] = None):
        self.name = name
        self.func = func
        self.context = context or {}
        self.metrics = OperationMetrics()

    async def execute(self, **kwargs) -> T:
        """Execute the operation"""
        try:
            result = await self.func(**kwargs)
            self.metrics.complete(True)
            return result
        except Exception as e:
            self.metrics.complete(False, str(e))
            raise

class ReliabilityManager:
    """Manages reliability and error handling across the application"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.error_handler = error_handler
        # self.progress_manager = progress_manager  # Removed - over-engineered
        self.event_manager = event_manager
        self.state_manager = state_manager
        self.retry_attempts: Dict[str, int] = {}
        self.max_retries = 3
        self.operation_history: List[Operation] = []
        self.max_history = 1000

    async def handle_operation(self,
                             operation_name: str,
                             operation: Callable,
                             context: Optional[Dict[str, Any]] = None,
                             **kwargs) -> Any:
        """
        Handle an operation with error handling and retries

        Args:
            operation_name: Name of the operation for tracking
            operation: The operation to execute
            context: Optional context for error handling
            **kwargs: Additional arguments for the operation

        Returns:
            The result of the operation
        """
        # Create operation wrapper
        op = Operation(operation_name, operation, context)
        self.operation_history.append(op)
        if len(self.operation_history) > self.max_history:
            self.operation_history.pop(0)

        try:
            # Track attempt
            attempt = self.retry_attempts.get(operation_name, 0) + 1
            self.retry_attempts[operation_name] = attempt
            op.metrics.retry_count = attempt

            # Emit operation start event
            await self.event_manager.emit(
                EventType.STEP_STARTED,
                {
                    'operation': operation_name,
                    'attempt': attempt,
                    'context': context
                }
            )

            # Execute operation
            result = await op.execute(**kwargs)

            # Clear retry count on success
            self.retry_attempts.pop(operation_name, None)

            # Emit success event
            await self.event_manager.emit(
                EventType.STEP_COMPLETED,
                {
                    'operation': operation_name,
                    'duration': op.metrics.duration,
                    'context': context
                }
            )

            return result

        except Exception as e:
            error_context = {
                'operation': operation_name,
                'attempt': attempt,
                'context': context or {},
                'kwargs': kwargs,
                'metrics': op.metrics.to_dict()
            }

            # Handle error
            should_retry = await self.error_handler.handle_error(
                e,
                error_context,
                retry_action=f"Retry {operation_name}"
            )

            # Update state
            await self.state_manager.handle_event(
                Event(
                    type=EventType.ERROR_OCCURRED,
                    data={
                        'error': str(e),
                        'operation': operation_name,
                        'metrics': op.metrics.to_dict()
                    },
                    metadata=context
                )
            )

            if should_retry and attempt < self.max_retries:
                self.logger.info(f"Retrying {operation_name} (attempt {attempt + 1})")
                # Add delay between retries
                await asyncio.sleep(min(2 ** attempt, 30))  # Exponential backoff
                return await self.handle_operation(
                    operation_name,
                    operation,
                    context,
                    **kwargs
                )

            # Emit failure event
            await self.event_manager.emit(
                EventType.STEP_FAILED,
                {
                    'operation': operation_name,
                    'error': str(e),
                    'metrics': op.metrics.to_dict(),
                    'context': context
                }
            )

            raise

    def get_reliability_metrics(self) -> Dict[str, Any]:
        """Get reliability metrics across the system"""
        error_summary = self.error_handler.get_error_summary()
        progress_stats = self.progress_manager.get_progress()

        # Calculate operation metrics
        total_ops = len(self.operation_history)
        successful_ops = sum(1 for op in self.operation_history if op.metrics.success)
        failed_ops = total_ops - successful_ops
        avg_duration = (
            sum(op.metrics.duration or 0 for op in self.operation_history) / total_ops
            if total_ops > 0 else 0
        )

        return {
            'error_rate': error_summary['total_errors'] / (progress_stats['steps_completed'] + 1),
            'success_rate': progress_stats['success_rate'],
            'retry_counts': self.retry_attempts,
            'error_summary': error_summary,
            'progress_stats': progress_stats,
            'operations': {
                'total': total_ops,
                'successful': successful_ops,
                'failed': failed_ops,
                'success_rate': successful_ops / total_ops if total_ops > 0 else 1.0,
                'average_duration': avg_duration,
                'retry_rate': sum(op.metrics.retry_count for op in self.operation_history) / total_ops if total_ops > 0 else 0
            }
        }

    def get_health_status(self) -> Dict[str, Any]:
        """Get overall system health status"""
        metrics = self.get_reliability_metrics()

        # Calculate health score (0-1)
        health_score = (
            metrics['success_rate'] * 0.4 +  # Weight success rate heavily
            (1 - metrics['error_rate']) * 0.3 +  # Lower error rate is better
            (1 - metrics['operations']['retry_rate']) * 0.2 +  # Lower retry rate is better
            (1 if len(self.retry_attempts) == 0 else 0) * 0.1  # No active retries is good
        )

        # Determine status
        if health_score >= 0.9:
            status = 'healthy'
        elif health_score >= 0.7:
            status = 'degraded'
        else:
            status = 'unhealthy'

        return {
            'status': status,
            'health_score': health_score,
            'error_rate': metrics['error_rate'],
            'success_rate': metrics['success_rate'],
            'active_retries': len(self.retry_attempts),
            'operation_stats': metrics['operations'],
            'timestamp': datetime.now().isoformat()
        }

    def reset_metrics(self):
        """Reset all metrics"""
        self.retry_attempts.clear()
        self.operation_history.clear()
        self.error_handler.clear_history()
        # self.progress_manager.reset()  # Removed - over-engineered

# Global instance
reliability_manager = ReliabilityManager()
