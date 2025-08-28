"""Error handling for the application"""

import logging
import traceback
from typing import Dict, Any, Optional, Type, List
from datetime import datetime
from enum import Enum, auto

from backend.infrastructure.events.event_system import event_manager, EventType
from backend.infrastructure.state.state_manager import state_manager
from backend.infrastructure.events.processing_events import ProcessingStage

class ErrorSeverity(Enum):
    """Error severity levels"""
    LOW = auto()      # Non-critical errors that don't affect core functionality
    MEDIUM = auto()   # Errors that affect some functionality but allow continuing
    HIGH = auto()     # Critical errors that require immediate attention
    FATAL = auto()    # System-level errors that prevent operation

class ErrorCategory(Enum):
    """Error categories for better handling"""
    VALIDATION = auto()    # Data validation errors
    PROCESSING = auto()    # Processing pipeline errors
    STATE = auto()         # State management errors
    SYSTEM = auto()        # System-level errors
    EXTERNAL = auto()      # External service errors
    UI = auto()           # UI-related errors

class RecoveryStrategy(Enum):
    """Error recovery strategies"""
    RETRY = auto()         # Retry the operation
    SKIP = auto()          # Skip the failing operation
    ROLLBACK = auto()      # Rollback to previous state
    ALTERNATE = auto()     # Use alternate approach
    MANUAL = auto()        # Require manual intervention

class ErrorClassification:
    """Classification of an error for handling"""
    
    def __init__(self, 
                 error: Exception,
                 severity: ErrorSeverity,
                 category: ErrorCategory,
                 recovery: RecoveryStrategy):
        self.error = error
        self.severity = severity
        self.category = category
        self.recovery = recovery
        self.timestamp = datetime.now()

class ErrorHandler:
    """Handles errors and exceptions in the application"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.error_count = 0
        self.error_history: List[Dict[str, Any]] = []
        self.max_history = 100
        self.retry_counts: Dict[str, int] = {}
        self.max_retries = 3
        
        # Error classification rules
        self.error_rules = {
            ValueError: ErrorClassification(
                ValueError(""),
                ErrorSeverity.MEDIUM,
                ErrorCategory.VALIDATION,
                RecoveryStrategy.ALTERNATE
            ),
            RuntimeError: ErrorClassification(
                RuntimeError(""),
                ErrorSeverity.HIGH,
                ErrorCategory.SYSTEM,
                RecoveryStrategy.ROLLBACK
            ),
            # Add more error types as needed
        }
    
    def _classify_error(self, error: Exception) -> ErrorClassification:
        """Classify an error for handling"""
        for error_type, classification in self.error_rules.items():
            if isinstance(error, error_type):
                return ErrorClassification(
                    error,
                    classification.severity,
                    classification.category,
                    classification.recovery
                )
        
        # Default classification
        return ErrorClassification(
            error,
            ErrorSeverity.MEDIUM,
            ErrorCategory.PROCESSING,
            RecoveryStrategy.RETRY
        )
    
    async def handle_error(self, 
                         error: Exception,
                         context: Optional[Dict[str, Any]] = None,
                         retry_action: Optional[str] = None) -> bool:
        """
        Handle an error with context and optional retry action
        
        Args:
            error: The exception that occurred
            context: Optional context about where/why the error occurred
            retry_action: Optional description of how to retry/recover
            
        Returns:
            bool: True if error was handled, False if it should be re-raised
        """
        try:
            # Classify error
            classification = self._classify_error(error)
            
            # Log error details
            error_details = {
                'error_type': type(error).__name__,
                'error_message': str(error),
                'traceback': traceback.format_exc(),
                'context': context or {},
                'retry_action': retry_action,
                'timestamp': datetime.now().isoformat(),
                'severity': classification.severity.name,
                'category': classification.category.name,
                'recovery': classification.recovery.name,
                'handled': False
            }
            
            # Update stats
            self.error_count += 1
            self.error_history.append(error_details)
            if len(self.error_history) > self.max_history:
                self.error_history.pop(0)
            
            # Log error
            self.logger.error(
                f"Error: {error_details['error_message']}\n"
                f"Context: {error_details['context']}\n"
                f"Classification: {error_details['severity']}/{error_details['category']}\n"
                f"Recovery: {error_details['recovery']}\n"
                f"Traceback:\n{error_details['traceback']}"
            )
            
            # Update retry count
            operation_key = f"{context.get('stage', 'unknown')}:{type(error).__name__}"
            current_retries = self.retry_counts.get(operation_key, 0)
            
            # Check if we should retry
            can_retry = (
                classification.recovery == RecoveryStrategy.RETRY and
                current_retries < self.max_retries and
                classification.severity != ErrorSeverity.FATAL
            )
            
            if can_retry:
                self.retry_counts[operation_key] = current_retries + 1
                error_details['retry_count'] = current_retries + 1
                error_details['handled'] = True
            else:
                error_details['handled'] = (
                    classification.recovery in [RecoveryStrategy.SKIP, RecoveryStrategy.ALTERNATE]
                )
            
            # Emit error event
            await event_manager.emit(EventType.ERROR_OCCURRED, error_details)
            
            # Update state
            await state_manager.handle_event(
                Event(
                    type=EventType.ERROR_OCCURRED,
                    data=error_details,
                    metadata={
                        'stage': context.get('stage'),
                        'severity': classification.severity.name,
                        'recovery': classification.recovery.name
                    }
                )
            )
            
            # Handle based on recovery strategy
            if classification.recovery == RecoveryStrategy.ROLLBACK:
                # TODO: Implement state rollback
                pass
            
            elif classification.recovery == RecoveryStrategy.ALTERNATE:
                # TODO: Implement alternate processing
                pass
            
            return error_details['handled']
            
        except Exception as e:
            # If error handling fails, log it but don't raise
            self.logger.error(f"Error in error handler: {str(e)}\n{traceback.format_exc()}")
            return False
    
    def get_error_summary(self) -> Dict[str, Any]:
        """Get summary of errors that have occurred"""
        return {
            'total_errors': self.error_count,
            'recent_errors': self.error_history[-10:],  # Last 10 errors
            'error_types': {
                error['error_type']: sum(1 for e in self.error_history if e['error_type'] == error['error_type'])
                for error in self.error_history
            },
            'error_categories': {
                error['category']: sum(1 for e in self.error_history if e['category'] == error['category'])
                for error in self.error_history
            },
            'severity_counts': {
                error['severity']: sum(1 for e in self.error_history if e['severity'] == error['severity'])
                for error in self.error_history
            },
            'retry_counts': self.retry_counts.copy(),
            'handled_count': sum(1 for e in self.error_history if e['handled']),
            'recovery_stats': {
                error['recovery']: sum(1 for e in self.error_history if e['recovery'] == error['recovery'])
                for error in self.error_history
            }
        }
    
    def clear_history(self):
        """Clear error history"""
        self.error_history = []
        self.error_count = 0
        self.retry_counts = {}

# Global instance
error_handler = ErrorHandler()
