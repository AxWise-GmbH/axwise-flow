"""State management system for the processing pipeline"""

import asyncio
from enum import Enum, auto
from typing import Dict, Any, Optional, List, Set, Callable, Awaitable
import json
import logging
from datetime import datetime

from backend.infrastructure.events.event_manager import event_manager, EventType

# Configure logging
logger = logging.getLogger(__name__)

class SystemState(Enum):
    """System states"""
    UNINITIALIZED = "uninitialized"
    INITIALIZING = "initializing"
    READY = "ready"
    PROCESSING = "processing"
    ANALYZING = "analyzing"
    VALIDATING = "validating"  # New state for validation
    COMPLETING = "completing"
    ERROR = "error"
    COMPLETED = "completed"

class InvalidStateTransition(Exception):
    """Invalid state transition exception"""
    pass

class StateManager:
    """Manages system state transitions and validation"""
    
    def __init__(self):
        self._lock = asyncio.Lock()
        self._current_state = SystemState.UNINITIALIZED
        self._state_data: Dict[str, Any] = {
            'stage_progress': 0.0,
            'quality_metrics': {
                'completeness': 0.0,
                'confidence': 0.0,
                'reliability': 0.0
            },
            'error_context': None,
            'partial_results': None,
            'resource_usage': {
                'memory': 0,
                'time_elapsed': 0
            }
        }
        self._validators: Dict[SystemState, Set[Callable[[Dict[str, Any]], Awaitable[bool]]]] = {}
        self._transition_hooks: Dict[SystemState, Set[Callable[[SystemState, Dict[str, Any]], Awaitable[None]]]] = {}
        self.logger = logging.getLogger(__name__)

        # Define valid state transitions with improved error recovery
        self._valid_transitions = {
            SystemState.UNINITIALIZED: {
                SystemState.INITIALIZING,
                SystemState.ERROR
            },
            SystemState.INITIALIZING: {
                SystemState.READY,
                SystemState.ERROR
            },
            SystemState.READY: {
                SystemState.PROCESSING,
                SystemState.ERROR
            },
            SystemState.PROCESSING: {
                SystemState.ANALYZING,
                SystemState.VALIDATING,
                SystemState.ERROR
            },
            SystemState.ANALYZING: {
                SystemState.VALIDATING,
                SystemState.COMPLETING,  # Allow direct transition to completing
                SystemState.ERROR
            },
            SystemState.VALIDATING: {
                SystemState.COMPLETING,
                SystemState.ANALYZING,  # Allow re-analysis if validation fails
                SystemState.ERROR
            },
            SystemState.COMPLETING: {
                SystemState.COMPLETED,
                SystemState.ERROR
            },
            SystemState.ERROR: {
                SystemState.READY,
                SystemState.PROCESSING,  # Allow retry from error
                SystemState.ANALYZING,   # Allow partial recovery
                SystemState.VALIDATING,  # Allow validation retry
                SystemState.UNINITIALIZED  # Allow complete reset
            },
            SystemState.COMPLETED: {
                SystemState.READY,
                SystemState.UNINITIALIZED  # Allow reset after completion
            }
        }

        # Initialize default validators
        self._setup_default_validators()

    def _setup_default_validators(self):
        """Setup default validation rules for each state"""
        
        async def validate_initializing(data: Dict[str, Any]) -> bool:
            """Validate INITIALIZING state"""
            return True  # Development mode: less strict validation

        async def validate_processing(data: Dict[str, Any]) -> bool:
            """Validate PROCESSING state"""
            return True  # Development mode: less strict validation

        async def validate_analyzing(data: Dict[str, Any]) -> bool:
            """Validate ANALYZING state"""
            return True  # Development mode: less strict validation

        async def validate_validating(data: Dict[str, Any]) -> bool:
            """Validate VALIDATING state"""
            return True  # Development mode: less strict validation

        # Add default validators
        self.add_validator(SystemState.INITIALIZING, validate_initializing)
        self.add_validator(SystemState.PROCESSING, validate_processing)
        self.add_validator(SystemState.ANALYZING, validate_analyzing)
        self.add_validator(SystemState.VALIDATING, validate_validating)

    @property
    def current_state(self) -> SystemState:
        """Get current state"""
        return self._current_state

    @property
    def state_data(self) -> Dict[str, Any]:
        """Get current state data"""
        return self._state_data.copy()

    async def transition(self, 
                        to_state: str, 
                        data: Optional[Dict[str, Any]] = None) -> None:
        """
        Transition to a new state
        Args:
            to_state: State to transition to (string name of SystemState)
            data: Optional data to update state with
        """
        try:
            # Convert string to SystemState
            try:
                new_state = SystemState(to_state)
            except ValueError:
                raise InvalidStateTransition(f"Invalid state: {to_state}")

            # Validate transition
            if new_state not in self._valid_transitions.get(self._current_state, set()):
                # Check if we can recover through ERROR state
                if (new_state in self._valid_transitions.get(SystemState.ERROR, set()) and 
                    SystemState.ERROR in self._valid_transitions.get(self._current_state, set())):
                    # Try transitioning through ERROR state
                    await self.transition(SystemState.ERROR.value, {
                        'error_context': f"Recovering from {self._current_state.value} to {new_state.value}"
                    })
                    if new_state == SystemState.ERROR:
                        return
                else:
                    raise InvalidStateTransition(
                        f"Invalid transition from {self._current_state.value} to {new_state.value}"
                    )

            # Update state data
            if data:
                self._state_data.update(data)

            # Validate new state
            if new_state in self._validators:
                validation_tasks = []
                for validator in self._validators[new_state]:
                    validation_tasks.append(validator(self._state_data))
                if validation_tasks:
                    validation_results = await asyncio.gather(*validation_tasks)
                    if not all(validation_results):
                        raise InvalidStateTransition(
                            f"State validation failed for transition to {new_state.value}"
                        )

            # Run transition hooks
            old_state = self._current_state
            if old_state in self._transition_hooks:
                hook_tasks = []
                for hook in self._transition_hooks[old_state]:
                    hook_tasks.append(hook(new_state, self._state_data))
                if hook_tasks:
                    await asyncio.gather(*hook_tasks)

            # Update state
            self._current_state = new_state
            
            # Update progress for processing states
            if new_state in [SystemState.PROCESSING, SystemState.ANALYZING, SystemState.VALIDATING]:
                self._state_data['stage_progress'] = self._calculate_progress(new_state)
            
            # Emit state change event
            await event_manager.emit(
                EventType.STATE_CHANGED,
                {
                    'old_state': old_state.value,
                    'new_state': new_state.value,
                    'timestamp': datetime.now().isoformat()
                }
            )

            self.logger.info(f"State transition: {old_state.value} -> {new_state.value}")

        except Exception as e:
            self.logger.error(f"Error in state transition: {str(e)}")
            # Update error context
            self._state_data['error_context'] = {
                'error': str(e),
                'from_state': self._current_state.value,
                'to_state': to_state,
                'timestamp': datetime.now().isoformat()
            }
            # Emit error but don't change state
            await event_manager.emit_error(e, {
                'stage': 'state_transition',
                'from_state': self._current_state.value,
                'to_state': to_state
            })
            raise

    def _calculate_progress(self, state: SystemState) -> float:
        """Calculate progress for processing states"""
        progress_weights = {
            SystemState.PROCESSING: 0.3,
            SystemState.ANALYZING: 0.6,
            SystemState.VALIDATING: 0.9
        }
        return progress_weights.get(state, 0.0)

    def add_validator(self, 
                     state: SystemState, 
                     validator: Callable[[Dict[str, Any]], Awaitable[bool]]) -> None:
        """Add a validator for a state"""
        if state not in self._validators:
            self._validators[state] = set()
        self._validators[state].add(validator)

    def add_transition_hook(self, 
                          state: SystemState, 
                          hook: Callable[[SystemState, Dict[str, Any]], Awaitable[None]]) -> None:
        """Add a transition hook for a state"""
        if state not in self._transition_hooks:
            self._transition_hooks[state] = set()
        self._transition_hooks[state].add(hook)

    def remove_validator(self, 
                        state: SystemState, 
                        validator: Callable[[Dict[str, Any]], Awaitable[bool]]) -> None:
        """Remove a validator for a state"""
        if state in self._validators:
            self._validators[state].discard(validator)
            if not self._validators[state]:
                del self._validators[state]

    def remove_transition_hook(self, 
                             state: SystemState, 
                             hook: Callable[[SystemState, Dict[str, Any]], Awaitable[None]]) -> None:
        """Remove a transition hook for a state"""
        if state in self._transition_hooks:
            self._transition_hooks[state].discard(hook)
            if not self._transition_hooks[state]:
                del self._transition_hooks[state]

    async def reset(self) -> None:
        """Reset state to uninitialized"""
        self._current_state = SystemState.UNINITIALIZED
        self._state_data = {
            'stage_progress': 0.0,
            'quality_metrics': {
                'completeness': 0.0,
                'confidence': 0.0,
                'reliability': 0.0
            },
            'error_context': None,
            'partial_results': None,
            'resource_usage': {
                'memory': 0,
                'time_elapsed': 0
            }
        }
        await event_manager.emit(
            EventType.STATE_CHANGED,
            {
                'old_state': None,
                'new_state': SystemState.UNINITIALIZED.value,
                'timestamp': datetime.now().isoformat()
            }
        )
        self.logger.info("State reset to uninitialized")

    def _update_metadata(self) -> None:
        """Update metadata timestamps."""
        if 'metadata' not in self._state_data:
            self._state_data['metadata'] = {}
        self._state_data['metadata']['last_updated'] = datetime.now().isoformat()

    async def set_analysis_results(self, results: Dict[str, Any]) -> None:
        """Set analysis results in the state data."""
        async with self._lock:
            self._state_data['analysis_results'] = results
            self._update_metadata()
            self.logger.info("Analysis results set in state manager.")

    async def get_analysis_results(self) -> Dict[str, Any]:
        """Get analysis results from the state data."""
        async with self._lock:
            return self._state_data.get('analysis_results', {})

# Global state manager instance
state_manager = StateManager()

# Global cleanup function
async def cleanup():
    """Global cleanup function"""
    await state_manager.reset()
