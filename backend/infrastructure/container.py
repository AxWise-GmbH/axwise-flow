"""
Dependency injection container.

This module provides a container for dependency injection, making it easy to
create and manage service instances.
"""

import logging
from typing import Callable, Optional, Dict, Any

from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.infrastructure.persistence.unit_of_work import UnitOfWork
from backend.models import User

logger = logging.getLogger(__name__)

class Container:
    """
    Dependency injection container.
    
    This class provides a container for dependency injection, making it easy to
    create and manage service instances. It acts as a factory for services and
    repositories, ensuring they are properly initialized with their dependencies.
    """
    
    def __init__(self):
        """
        Initialize the container.
        """
        self._session_factory = SessionLocal
        self._services = {}
        self._current_user = None
    
    def set_current_user(self, user: User):
        """
        Set the current user for the container.
        
        Args:
            user: Current authenticated user
        """
        self._current_user = user
    
    def get_current_user(self) -> Optional[User]:
        """
        Get the current user.
        
        Returns:
            Current authenticated user, or None if not set
        """
        return self._current_user
    
    def get_session_factory(self) -> Callable[[], Session]:
        """
        Get the session factory.
        
        Returns:
            Factory function that creates a new SQLAlchemy session
        """
        return self._session_factory
    
    def get_unit_of_work(self) -> UnitOfWork:
        """
        Get a new Unit of Work instance.
        
        Returns:
            New Unit of Work instance
        """
        return UnitOfWork(self.get_session_factory())
    
    def register_service(self, name: str, service_instance: Any):
        """
        Register a service instance with the container.
        
        Args:
            name: Name to register the service under
            service_instance: Service instance to register
        """
        self._services[name] = service_instance
        logger.debug(f"Registered service: {name}")
    
    def get_service(self, name: str) -> Any:
        """
        Get a service instance by name.
        
        Args:
            name: Name of the service to retrieve
            
        Returns:
            Service instance
            
        Raises:
            KeyError: If the service is not registered
        """
        if name not in self._services:
            raise KeyError(f"Service not registered: {name}")
        return self._services[name]
    
    def has_service(self, name: str) -> bool:
        """
        Check if a service is registered.
        
        Args:
            name: Name of the service to check
            
        Returns:
            True if the service is registered, False otherwise
        """
        return name in self._services
    
    # Factory methods for specific services will be added as they are implemented
    
    def get_interview_service(self):
        """
        Get the interview service.
        
        Returns:
            Interview service instance
        """
        # This will be implemented when the service is created
        raise NotImplementedError("Interview service not yet implemented")
    
    def get_analysis_service(self):
        """
        Get the analysis service.
        
        Returns:
            Analysis service instance
        """
        # This will be implemented when the service is created
        raise NotImplementedError("Analysis service not yet implemented")
    
    def get_persona_service(self):
        """
        Get the persona service.
        
        Returns:
            Persona service instance
        """
        # This will be implemented when the service is created
        raise NotImplementedError("Persona service not yet implemented")
    
    def get_prd_service(self):
        """
        Get the PRD service.
        
        Returns:
            PRD service instance
        """
        # This will be implemented when the service is created
        raise NotImplementedError("PRD service not yet implemented")
