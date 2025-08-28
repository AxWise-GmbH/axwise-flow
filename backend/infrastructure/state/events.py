"""
Fallback implementation of the events module.
This file provides a minimal implementation of the EventManager and EventType classes
to avoid import errors when the main event system is not accessible.
"""

from enum import Enum
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class EventType(Enum):
    """Minimal event types needed for the application"""
    PROCESSING_STATUS = "PROCESSING_STATUS"
    PROCESSING_ERROR = "PROCESSING_ERROR"
    PROCESSING_STEP = "PROCESSING_STEP"
    PROCESSING_COMPLETED = "PROCESSING_COMPLETED"
    ERROR_OCCURRED = "ERROR_OCCURRED"
    
    # Additional event types that might be used in the application
    SYSTEM_STARTUP = "SYSTEM_STARTUP"
    SYSTEM_SHUTDOWN = "SYSTEM_SHUTDOWN"
    PROCESSING_STARTED = "PROCESSING_STARTED"
    STATE_CHANGED = "STATE_CHANGED"
    TASK_COMPLETED = "TASK_COMPLETED"
    CONFIG_LOADED = "CONFIG_LOADED"

class EventManager:
    """Minimal event manager implementation for fallback"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    async def emit(self, event_type: EventType, payload: Optional[Dict[str, Any]] = None) -> None:
        """Log the event instead of emitting it"""
        self.logger.info(f"Event: {event_type}, Payload: {payload}")
    
    async def emit_error(self, error: Exception, context: Optional[Dict[str, Any]] = None) -> None:
        """Log the error instead of emitting it"""
        self.logger.error(f"Error: {str(error)}, Context: {context}")

# Create a singleton instance for import
event_manager = EventManager() 