"""
Analysis repository implementation.

This module provides an implementation of the analysis repository interface
using SQLAlchemy for database access.
"""

import json
import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime

from backend.domain.repositories.analysis_repository import IAnalysisRepository
from backend.infrastructure.persistence.base_repository import BaseRepository
from backend.models import AnalysisResult

logger = logging.getLogger(__name__)

class AnalysisRepository(BaseRepository[AnalysisResult], IAnalysisRepository):
    """
    Implementation of the analysis repository interface.
    
    This class provides an implementation of the analysis repository interface
    using SQLAlchemy for database access.
    """
    
    def __init__(self, session: Session):
        """
        Initialize the repository.
        
        Args:
            session: SQLAlchemy session
        """
        super().__init__(session, AnalysisResult)
    
    async def create(self, user_id: str, data_id: int, llm_provider: str, 
                    llm_model: Optional[str] = None, 
                    industry: Optional[str] = None) -> int:
        """
        Create a new analysis record.
        
        Args:
            user_id: ID of the user who owns the analysis
            data_id: ID of the interview data being analyzed
            llm_provider: LLM provider used for analysis
            llm_model: Optional specific model used
            industry: Optional industry context for analysis
            
        Returns:
            ID of the created analysis record
        """
        try:
            # Create initial results dictionary
            initial_results = {
                "status": "processing",
                "progress": 0.0,
                "message": "Analysis started",
                "industry": industry
            }
            
            # Create new AnalysisResult instance
            analysis_result = AnalysisResult(
                data_id=data_id,
                user_id=user_id,
                analysis_date=datetime.utcnow(),
                llm_provider=llm_provider,
                llm_model=llm_model,
                status="processing",
                results=initial_results
            )
            
            # Add to session
            await self.add(analysis_result)
            
            # Return the ID
            return analysis_result.result_id
        except SQLAlchemyError as e:
            logger.error(f"Error creating analysis record: {str(e)}")
            raise
    
    async def get_by_id(self, result_id: int, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get analysis result by ID.
        
        Args:
            result_id: ID of the analysis result to retrieve
            user_id: ID of the user who owns the analysis
            
        Returns:
            Analysis result if found, None otherwise
        """
        try:
            # Query for the analysis result with user_id filter
            analysis_result = self.session.query(AnalysisResult).filter(
                AnalysisResult.result_id == result_id,
                AnalysisResult.user_id == user_id
            ).first()
            
            if not analysis_result:
                return None
            
            # Convert to dictionary
            result = self.to_dict(analysis_result)
            
            # Ensure results is a dictionary
            if isinstance(result.get('results'), str):
                try:
                    result['results'] = json.loads(result['results'])
                except json.JSONDecodeError:
                    result['results'] = {"error": "Invalid JSON in results"}
            
            return result
        except SQLAlchemyError as e:
            logger.error(f"Error getting analysis result by ID: {str(e)}")
            raise
    
    async def list_by_user(self, user_id: str, limit: int = 100, 
                          offset: int = 0) -> List[Dict[str, Any]]:
        """
        List analysis results for a user.
        
        Args:
            user_id: ID of the user who owns the analyses
            limit: Maximum number of records to return
            offset: Number of records to skip
            
        Returns:
            List of analysis result records
        """
        try:
            # Query for analysis results with user_id filter
            analysis_results = self.session.query(AnalysisResult).filter(
                AnalysisResult.user_id == user_id
            ).order_by(AnalysisResult.analysis_date.desc()).limit(limit).offset(offset).all()
            
            # Convert to list of dictionaries
            result = []
            for analysis_result in analysis_results:
                item = self.to_dict(analysis_result)
                
                # Parse results if it's a string
                if isinstance(item.get('results'), str):
                    try:
                        item['results'] = json.loads(item['results'])
                    except json.JSONDecodeError:
                        item['results'] = {"error": "Invalid JSON in results"}
                
                # Include only summary information in the list
                summary = {
                    "result_id": item.get("result_id"),
                    "data_id": item.get("data_id"),
                    "analysis_date": item.get("analysis_date"),
                    "status": item.get("status"),
                    "llm_provider": item.get("llm_provider"),
                    "llm_model": item.get("llm_model"),
                    "progress": item.get("results", {}).get("progress", 0.0),
                    "message": item.get("results", {}).get("message", ""),
                    "industry": item.get("results", {}).get("industry")
                }
                
                result.append(summary)
            
            return result
        except SQLAlchemyError as e:
            logger.error(f"Error listing analysis results for user: {str(e)}")
            raise
    
    async def update_status(self, result_id: int, user_id: str, status: str, 
                           progress: float = 0.0, message: Optional[str] = None) -> bool:
        """
        Update status of an analysis.
        
        Args:
            result_id: ID of the analysis result to update
            user_id: ID of the user who owns the analysis
            status: New status (processing, completed, failed)
            progress: Progress value between 0.0 and 1.0
            message: Optional status message
            
        Returns:
            True if update was successful, False otherwise
        """
        try:
            # Query for the analysis result with user_id filter
            analysis_result = self.session.query(AnalysisResult).filter(
                AnalysisResult.result_id == result_id,
                AnalysisResult.user_id == user_id
            ).first()
            
            if not analysis_result:
                return False
            
            # Update status
            analysis_result.status = status
            
            # Update completed_at if status is completed or failed
            if status in ["completed", "failed"]:
                analysis_result.completed_at = datetime.utcnow()
            
            # Update results dictionary
            results = analysis_result.results if isinstance(analysis_result.results, dict) else {}
            results["status"] = status
            results["progress"] = progress
            
            if message:
                results["message"] = message
            
            analysis_result.results = results
            
            # Flush changes
            self.session.flush()
            
            return True
        except SQLAlchemyError as e:
            logger.error(f"Error updating analysis status: {str(e)}")
            self.session.rollback()
            raise
    
    async def update_results(self, result_id: int, user_id: str, 
                            results: Dict[str, Any]) -> bool:
        """
        Update results of an analysis.
        
        Args:
            result_id: ID of the analysis result to update
            user_id: ID of the user who owns the analysis
            results: Analysis results data
            
        Returns:
            True if update was successful, False otherwise
        """
        try:
            # Query for the analysis result with user_id filter
            analysis_result = self.session.query(AnalysisResult).filter(
                AnalysisResult.result_id == result_id,
                AnalysisResult.user_id == user_id
            ).first()
            
            if not analysis_result:
                return False
            
            # Update results
            analysis_result.results = results
            
            # If results include status, update the status field
            if "status" in results:
                analysis_result.status = results["status"]
                
                # Update completed_at if status is completed or failed
                if results["status"] in ["completed", "failed"]:
                    analysis_result.completed_at = datetime.utcnow()
            
            # Flush changes
            self.session.flush()
            
            return True
        except SQLAlchemyError as e:
            logger.error(f"Error updating analysis results: {str(e)}")
            self.session.rollback()
            raise
    
    async def delete(self, result_id: int, user_id: str) -> bool:
        """
        Delete an analysis result.
        
        Args:
            result_id: ID of the analysis result to delete
            user_id: ID of the user who owns the analysis
            
        Returns:
            True if deletion was successful, False otherwise
        """
        try:
            # Query for the analysis result with user_id filter
            analysis_result = self.session.query(AnalysisResult).filter(
                AnalysisResult.result_id == result_id,
                AnalysisResult.user_id == user_id
            ).first()
            
            if not analysis_result:
                return False
            
            # Delete the analysis result
            self.session.delete(analysis_result)
            self.session.flush()
            
            return True
        except SQLAlchemyError as e:
            logger.error(f"Error deleting analysis result: {str(e)}")
            self.session.rollback()
            raise
    
    async def get_by_data_id(self, data_id: int, user_id: str) -> List[Dict[str, Any]]:
        """
        Get analysis results for a specific interview data.
        
        Args:
            data_id: ID of the interview data
            user_id: ID of the user who owns the analyses
            
        Returns:
            List of analysis results for the specified data
        """
        try:
            # Query for analysis results with data_id and user_id filters
            analysis_results = self.session.query(AnalysisResult).filter(
                AnalysisResult.data_id == data_id,
                AnalysisResult.user_id == user_id
            ).order_by(AnalysisResult.analysis_date.desc()).all()
            
            # Convert to list of dictionaries
            result = []
            for analysis_result in analysis_results:
                item = self.to_dict(analysis_result)
                
                # Parse results if it's a string
                if isinstance(item.get('results'), str):
                    try:
                        item['results'] = json.loads(item['results'])
                    except json.JSONDecodeError:
                        item['results'] = {"error": "Invalid JSON in results"}
                
                result.append(item)
            
            return result
        except SQLAlchemyError as e:
            logger.error(f"Error getting analysis results by data ID: {str(e)}")
            raise
