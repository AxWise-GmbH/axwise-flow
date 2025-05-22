"""
Base repository implementation.

This module provides a base implementation of the repository pattern that can be
extended by concrete repository implementations.
"""

import logging
from typing import Any, Dict, List, Optional, Type, TypeVar, Generic
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import inspect

# Type variable for SQLAlchemy model
T = TypeVar('T')

logger = logging.getLogger(__name__)

class BaseRepository(Generic[T]):
    """
    Base repository implementation.
    
    This class provides a base implementation of the repository pattern that can be
    extended by concrete repository implementations. It provides common CRUD operations
    for SQLAlchemy models.
    """
    
    def __init__(self, session: Session, model_class: Type[T]):
        """
        Initialize the repository.
        
        Args:
            session: SQLAlchemy session
            model_class: SQLAlchemy model class
        """
        self.session = session
        self.model_class = model_class
    
    def _get_primary_key_name(self) -> str:
        """
        Get the name of the primary key column for the model.
        
        Returns:
            Name of the primary key column
        """
        mapper = inspect(self.model_class)
        for column in mapper.columns:
            if column.primary_key:
                return column.name
        raise ValueError(f"No primary key found for model {self.model_class.__name__}")
    
    async def add(self, entity: T) -> T:
        """
        Add an entity to the repository.
        
        Args:
            entity: Entity to add
            
        Returns:
            The added entity
        """
        try:
            self.session.add(entity)
            self.session.flush()  # Flush to get the ID without committing
            return entity
        except SQLAlchemyError as e:
            logger.error(f"Error adding entity: {str(e)}")
            self.session.rollback()
            raise
    
    async def get_by_id(self, entity_id: Any) -> Optional[T]:
        """
        Get an entity by ID.
        
        Args:
            entity_id: ID of the entity to retrieve
            
        Returns:
            The entity if found, None otherwise
        """
        try:
            return self.session.query(self.model_class).get(entity_id)
        except SQLAlchemyError as e:
            logger.error(f"Error getting entity by ID: {str(e)}")
            raise
    
    async def get_all(self, limit: int = 100, offset: int = 0) -> List[T]:
        """
        Get all entities.
        
        Args:
            limit: Maximum number of entities to return
            offset: Number of entities to skip
            
        Returns:
            List of entities
        """
        try:
            return self.session.query(self.model_class).limit(limit).offset(offset).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting all entities: {str(e)}")
            raise
    
    async def update(self, entity: T) -> T:
        """
        Update an entity.
        
        Args:
            entity: Entity to update
            
        Returns:
            The updated entity
        """
        try:
            self.session.merge(entity)
            self.session.flush()
            return entity
        except SQLAlchemyError as e:
            logger.error(f"Error updating entity: {str(e)}")
            self.session.rollback()
            raise
    
    async def delete(self, entity_id: Any) -> bool:
        """
        Delete an entity by ID.
        
        Args:
            entity_id: ID of the entity to delete
            
        Returns:
            True if deletion was successful, False otherwise
        """
        try:
            entity = await self.get_by_id(entity_id)
            if entity:
                self.session.delete(entity)
                self.session.flush()
                return True
            return False
        except SQLAlchemyError as e:
            logger.error(f"Error deleting entity: {str(e)}")
            self.session.rollback()
            raise
    
    async def count(self) -> int:
        """
        Count the number of entities.
        
        Returns:
            Number of entities
        """
        try:
            return self.session.query(self.model_class).count()
        except SQLAlchemyError as e:
            logger.error(f"Error counting entities: {str(e)}")
            raise
    
    def to_dict(self, entity: T) -> Dict[str, Any]:
        """
        Convert an entity to a dictionary.
        
        Args:
            entity: Entity to convert
            
        Returns:
            Dictionary representation of the entity
        """
        if not entity:
            return {}
            
        result = {}
        for column in inspect(self.model_class).columns:
            result[column.name] = getattr(entity, column.name)
        return result
    
    def from_dict(self, data: Dict[str, Any]) -> T:
        """
        Create an entity from a dictionary.
        
        Args:
            data: Dictionary with entity data
            
        Returns:
            Created entity
        """
        return self.model_class(**data)
