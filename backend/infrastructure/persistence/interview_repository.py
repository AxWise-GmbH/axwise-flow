"""
Interview repository implementation.

This module provides an implementation of the interview repository interface
using SQLAlchemy for database access.
"""

import json
import logging
from typing import List, Optional, Dict, Any, Union
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime

from backend.domain.repositories.interview_repository import IInterviewRepository
from backend.infrastructure.persistence.base_repository import BaseRepository
from backend.models import InterviewData

logger = logging.getLogger(__name__)

class InterviewRepository(BaseRepository[InterviewData], IInterviewRepository):
    """
    Implementation of the interview repository interface.
    
    This class provides an implementation of the interview repository interface
    using SQLAlchemy for database access.
    """
    
    def __init__(self, session: Session):
        """
        Initialize the repository.
        
        Args:
            session: SQLAlchemy session
        """
        super().__init__(session, InterviewData)
    
    async def save(self, user_id: str, filename: str, input_type: str, 
                  content: Union[str, Dict[str, Any], List[Dict[str, Any]]]) -> int:
        """
        Save interview data to the repository.
        
        Args:
            user_id: ID of the user who owns the data
            filename: Name of the uploaded file
            input_type: Type of data (free_text, json_array, json_object)
            content: The interview data content
            
        Returns:
            ID of the saved interview data
        """
        try:
            # Convert content to JSON string if it's not already a string
            if not isinstance(content, str):
                json_content = json.dumps(content)
            else:
                json_content = content
            
            # Create new InterviewData instance
            interview_data = InterviewData(
                user_id=user_id,
                filename=filename,
                input_type=input_type,
                original_data=json_content,
                upload_date=datetime.utcnow()
            )
            
            # Add to session
            await self.add(interview_data)
            
            # Return the ID
            return interview_data.data_id
        except SQLAlchemyError as e:
            logger.error(f"Error saving interview data: {str(e)}")
            raise
    
    async def get_by_id(self, data_id: int, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get interview data by ID.
        
        Args:
            data_id: ID of the interview data to retrieve
            user_id: ID of the user who owns the data
            
        Returns:
            Interview data if found, None otherwise
        """
        try:
            # Query for the interview data with user_id filter
            interview_data = self.session.query(InterviewData).filter(
                InterviewData.id == data_id,
                InterviewData.user_id == user_id
            ).first()
            
            if not interview_data:
                return None
            
            # Convert to dictionary
            result = self.to_dict(interview_data)
            
            # Parse original_data if it's a JSON string
            try:
                result['content'] = json.loads(interview_data.original_data)
            except json.JSONDecodeError:
                # If it's not valid JSON, keep it as a string
                result['content'] = interview_data.original_data
            
            return result
        except SQLAlchemyError as e:
            logger.error(f"Error getting interview data by ID: {str(e)}")
            raise
    
    async def list_by_user(self, user_id: str, limit: int = 100, 
                          offset: int = 0) -> List[Dict[str, Any]]:
        """
        List interview data for a user.
        
        Args:
            user_id: ID of the user who owns the data
            limit: Maximum number of records to return
            offset: Number of records to skip
            
        Returns:
            List of interview data records
        """
        try:
            # Query for interview data with user_id filter
            interview_data_list = self.session.query(InterviewData).filter(
                InterviewData.user_id == user_id
            ).order_by(InterviewData.upload_date.desc()).limit(limit).offset(offset).all()
            
            # Convert to list of dictionaries
            result = []
            for interview_data in interview_data_list:
                item = self.to_dict(interview_data)
                # Don't include the full content in the list
                item.pop('original_data', None)
                result.append(item)
            
            return result
        except SQLAlchemyError as e:
            logger.error(f"Error listing interview data for user: {str(e)}")
            raise
    
    async def delete(self, data_id: int, user_id: str) -> bool:
        """
        Delete interview data.
        
        Args:
            data_id: ID of the interview data to delete
            user_id: ID of the user who owns the data
            
        Returns:
            True if deletion was successful, False otherwise
        """
        try:
            # Query for the interview data with user_id filter
            interview_data = self.session.query(InterviewData).filter(
                InterviewData.id == data_id,
                InterviewData.user_id == user_id
            ).first()
            
            if not interview_data:
                return False
            
            # Delete the interview data
            self.session.delete(interview_data)
            self.session.flush()
            
            return True
        except SQLAlchemyError as e:
            logger.error(f"Error deleting interview data: {str(e)}")
            self.session.rollback()
            raise
    
    async def update_metadata(self, data_id: int, user_id: str, 
                             metadata: Dict[str, Any]) -> bool:
        """
        Update metadata for interview data.
        
        Args:
            data_id: ID of the interview data to update
            user_id: ID of the user who owns the data
            metadata: New metadata to set
            
        Returns:
            True if update was successful, False otherwise
        """
        try:
            # Query for the interview data with user_id filter
            interview_data = self.session.query(InterviewData).filter(
                InterviewData.id == data_id,
                InterviewData.user_id == user_id
            ).first()
            
            if not interview_data:
                return False
            
            # Update fields based on metadata
            if 'filename' in metadata:
                interview_data.filename = metadata['filename']
            
            if 'input_type' in metadata:
                interview_data.input_type = metadata['input_type']
            
            # Add more metadata fields as needed
            
            # Flush changes
            self.session.flush()
            
            return True
        except SQLAlchemyError as e:
            logger.error(f"Error updating interview data metadata: {str(e)}")
            self.session.rollback()
            raise
