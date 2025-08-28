"""Event system for application-wide communication"""
from enum import Enum, auto
import asyncio
from typing import Dict, Any, Optional, List, Callable, Awaitable
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class EventType(Enum):
    """Event types for the processing pipeline"""
    SYSTEM_STARTUP = auto()
    SYSTEM_SHUTDOWN = auto()
    PROCESSING_STARTED = auto()
    PROCESSING_STEP = auto()
    PROCESSING_COMPLETED = auto()
    ERROR_OCCURRED = auto()
    STATE_CHANGED = auto()
    TASK_COMPLETED = auto()
    CONFIG_LOADED = auto()

class Event:
    """Event data structure"""
    def __init__(self, type_: EventType, stage: str, data=None, source=None, metadata=None):
        self.type = type_
        self.stage = stage
        self.timestamp = datetime.now().isoformat()
        self.source = source
        self.metadata = metadata or {}
        self.task_id = int(datetime.now().timestamp() * 1000)
        self.data = data or {}

    def to_dict(self):
        """Convert event to dictionary"""
        return {
            'type': self.type.name,
            'stage': self.stage,
            'timestamp': self.timestamp,
            'source': self.source,
            'metadata': self.metadata,
            'task_id': self.task_id,
            'data': self.data
        }

class EventManager:
    """Manages event emission and handling"""
    
    def __init__(self):
        self._handlers: Dict[EventType, List[Callable[[Event], Awaitable[None]]]] = {}
        self._error_handlers: List[Callable[[Exception, Dict[str, Any]], Awaitable[None]]] = []
        self.logger = logging.getLogger(__name__)

    async def emit(self, event_type: EventType, data: Optional[Dict[str, Any]] = None) -> None:
        """Emit an event to all registered handlers"""
        try:
            event = Event(event_type, data.get('stage', 'unknown') if data else 'unknown', data)
            
            if event_type in self._handlers:
                tasks = []
                for handler in self._handlers[event_type]:
                    tasks.append(handler(event))
                if tasks:
                    await asyncio.gather(*tasks)
                    
        except Exception as e:
            self.logger.error(f"Error emitting event: {str(e)}")
            await self.emit_error(e, {'stage': 'event_emission'})

    async def emit_error(self, error: Exception, context: Optional[Dict[str, Any]] = None) -> None:
        """Emit an error event"""
        try:
            tasks = []
            for handler in self._error_handlers:
                tasks.append(handler(error, context or {}))
            if tasks:
                await asyncio.gather(*tasks)
                
        except Exception as e:
            self.logger.error(f"Error in error handler: {str(e)}")

    def on(self, event_type: EventType, handler: Callable[[Event], Awaitable[None]]) -> None:
        """Register an event handler"""
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)

    def on_error(self, handler: Callable[[Exception, Dict[str, Any]], Awaitable[None]]) -> None:
        """Register an error handler"""
        self._error_handlers.append(handler)

    def remove_handler(self, event_type: EventType, handler: Callable[[Event], Awaitable[None]]) -> None:
        """Remove an event handler"""
        if event_type in self._handlers:
            self._handlers[event_type].remove(handler)
            if not self._handlers[event_type]:
                del self._handlers[event_type]

    def remove_error_handler(self, handler: Callable[[Exception, Dict[str, Any]], Awaitable[None]]) -> None:
        """Remove an error handler"""
        self._error_handlers.remove(handler)

# Global event manager instance
event_manager = EventManager()

__all__ = ['EventType', 'Event', 'EventManager', 'event_manager']
