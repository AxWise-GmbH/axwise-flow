"""Integration tests for event system, state management, and error handling"""

import asyncio
import pytest
from typing import List, Dict, Any
from datetime import datetime

from backend.infrastructure.events.event_system import event_manager, EventType
from backend.infrastructure.state.state_manager import state_manager
from backend.infrastructure.reliability.reliability_manager import reliability_manager
from backend.infrastructure.reliability.error_handler import (
    error_handler,
    ErrorSeverity,
    ErrorCategory,
    RecoveryStrategy
)
from backend.infrastructure.events.processing_events import ProcessingStage, QualityMetrics

# Test data
TEST_PATTERN = {
    'type': 'behavioral',
    'description': 'Test pattern',
    'evidence': ['evidence1', 'evidence2'],
    'confidence': 0.8,
    'frequency': 0.7
}

TEST_PERSONA = {
    'name': 'Test Persona',
    'description': 'Test description',
    'traits': {
        'trait1': {'value': 'value1', 'confidence': 0.8},
        'trait2': {'value': 'value2', 'confidence': 0.9}
    },
    'patterns': [TEST_PATTERN],
    'confidence': 0.85
}

class EventCollector:
    """Collects events for testing"""
    
    def __init__(self):
        self.events: List[Dict[str, Any]] = []
    
    async def handle_event(self, event):
        """Event handler"""
        self.events.append({
            'type': event.type,
            'data': event.data,
            'timestamp': event.timestamp
        })

@pytest.fixture
async def event_collector():
    """Event collector fixture"""
    collector = EventCollector()
    for event_type in EventType:
        event_manager.subscribe(event_type, collector.handle_event)
    yield collector
    for event_type in EventType:
        event_manager.unsubscribe(event_type, collector.handle_event)

@pytest.mark.asyncio
async def test_event_propagation(event_collector):
    """Test event propagation through the system"""
    # Emit pattern discovered event
    await event_manager.emit(
        EventType.PATTERN_DISCOVERED,
        {'pattern': TEST_PATTERN}
    )
    
    # Verify event was collected
    assert len(event_collector.events) > 0
    event = event_collector.events[0]
    assert event['type'] == EventType.PATTERN_DISCOVERED
    assert event['data']['pattern'] == TEST_PATTERN

@pytest.mark.asyncio
async def test_state_synchronization():
    """Test state synchronization between components"""
    # Update state through event
    await state_manager.handle_event(
        Event(
            type=EventType.STATE_CHANGED,
            data={'test_key': 'test_value'}
        )
    )
    
    # Verify state was updated
    state = state_manager.get_state()
    assert 'test_key' in state['session_state']
    assert state['session_state']['test_key'] == 'test_value'

@pytest.mark.asyncio
async def test_error_handling():
    """Test error handling and recovery"""
    # Define test operation that fails
    async def failing_operation():
        raise ValueError("Test error")
    
    # Try operation with reliability manager
    with pytest.raises(ValueError):
        await reliability_manager.handle_operation(
            'test_operation',
            failing_operation,
            {'test': 'context'}
        )
    
    # Verify error was handled
    error_summary = error_handler.get_error_summary()
    assert error_summary['total_errors'] > 0
    assert any(
        error['error_type'] == 'ValueError'
        for error in error_summary['recent_errors']
    )

@pytest.mark.asyncio
async def test_processing_stages():
    """Test processing stage transitions"""
    # Start stage
    await state_manager.handle_event(
        Event(
            type=EventType.STEP_STARTED,
            data={
                'stage': ProcessingStage.PATTERN_RECOGNITION,
                'message': 'Starting pattern recognition'
            }
        )
    )
    
    # Verify stage started
    state = state_manager.get_state()
    assert state['process_state']['current_stage'] == ProcessingStage.PATTERN_RECOGNITION.name
    
    # Complete stage with quality metrics
    quality = QualityMetrics(
        completeness=0.9,
        confidence=0.85,
        reliability=0.95
    )
    
    await state_manager.handle_event(
        Event(
            type=EventType.STEP_COMPLETED,
            data={
                'stage': ProcessingStage.PATTERN_RECOGNITION,
                'message': 'Pattern recognition complete',
                'quality': quality
            }
        )
    )
    
    # Verify stage completed
    state = state_manager.get_state()
    assert state['process_state']['stage_states'][ProcessingStage.PATTERN_RECOGNITION.name]['status'] == 'completed'

@pytest.mark.asyncio
async def test_error_recovery_strategy():
    """Test error recovery strategies"""
    # Test retryable error
    retryable_error = ValueError("Retryable error")
    classification = error_handler._classify_error(retryable_error)
    assert classification.recovery == RecoveryStrategy.RETRY
    
    # Test non-retryable error
    fatal_error = SystemError("Fatal error")
    classification = error_handler._classify_error(fatal_error)
    assert classification.recovery != RecoveryStrategy.RETRY

@pytest.mark.asyncio
async def test_health_metrics():
    """Test system health metrics"""
    # Generate some test activity
    await reliability_manager.handle_operation(
        'test_success',
        lambda: "success",
        {'test': 'context'}
    )
    
    try:
        await reliability_manager.handle_operation(
            'test_failure',
            lambda: exec('raise ValueError("Test error")'),
            {'test': 'context'}
        )
    except ValueError:
        pass
    
    # Check health metrics
    health = reliability_manager.get_health_status()
    assert 'health_score' in health
    assert 'error_rate' in health
    assert 'success_rate' in health
    assert isinstance(health['health_score'], float)

@pytest.mark.asyncio
async def test_event_order():
    """Test event ordering and timing"""
    events = []
    
    async def collect_event(event):
        events.append(event)
    
    # Subscribe to events
    event_manager.subscribe(EventType.STEP_STARTED, collect_event)
    event_manager.subscribe(EventType.STEP_COMPLETED, collect_event)
    
    # Emit events in sequence
    await event_manager.emit(
        EventType.STEP_STARTED,
        {'stage': 'test', 'timestamp': datetime.now().isoformat()}
    )
    
    await asyncio.sleep(0.1)  # Small delay
    
    await event_manager.emit(
        EventType.STEP_COMPLETED,
        {'stage': 'test', 'timestamp': datetime.now().isoformat()}
    )
    
    # Verify event order
    assert len(events) == 2
    assert events[0].type == EventType.STEP_STARTED
    assert events[1].type == EventType.STEP_COMPLETED
    assert events[0].timestamp < events[1].timestamp

@pytest.mark.asyncio
async def test_state_validation():
    """Test state validation and conflict resolution"""
    # Set initial state
    await state_manager.handle_event(
        Event(
            type=EventType.STATE_CHANGED,
            data={'counter': 0}
        )
    )
    
    # Simulate concurrent updates
    update_events = [
        Event(
            type=EventType.STATE_CHANGED,
            data={'counter': i}
        )
        for i in range(1, 4)
    ]
    
    # Apply updates concurrently
    await asyncio.gather(
        *[state_manager.handle_event(event) for event in update_events]
    )
    
    # Verify final state is consistent
    state = state_manager.get_state()
    assert 'counter' in state['session_state']
    assert isinstance(state['session_state']['counter'], int)

@pytest.mark.asyncio
async def test_system_recovery():
    """Test system recovery after errors"""
    # Reset system state
    state_manager.reset()
    error_handler.clear_history()
    reliability_manager.reset_metrics()
    
    # Simulate system operation with errors
    operations = [
        ('success1', lambda: "success"),
        ('error1', lambda: exec('raise ValueError("Error 1")')),
        ('success2', lambda: "success"),
        ('error2', lambda: exec('raise RuntimeError("Error 2")')),
        ('success3', lambda: "success")
    ]
    
    for name, operation in operations:
        try:
            await reliability_manager.handle_operation(name, operation, {})
        except Exception:
            continue
    
    # Verify system health
    health = reliability_manager.get_health_status()
    metrics = reliability_manager.get_reliability_metrics()
    
    assert health['status'] in ['healthy', 'degraded', 'unhealthy']
    assert 'success_rate' in metrics
    assert 'error_rate' in metrics
    assert 'retry_counts' in metrics

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
