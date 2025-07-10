"""
Repository for simulation data persistence.
"""

import logging
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import desc

from backend.models import SimulationData
from backend.infrastructure.persistence.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class SimulationRepository(BaseRepository[SimulationData]):
    """Repository for managing simulation data persistence."""

    def __init__(self, session):
        super().__init__(session, SimulationData)

    async def create_simulation(
        self,
        simulation_id: str,
        user_id: str,
        business_context: Dict[str, Any],
        questions_data: Dict[str, Any],
        simulation_config: Dict[str, Any],
    ) -> SimulationData:
        """
        Create a new simulation record.
        
        Args:
            simulation_id: Unique simulation identifier
            user_id: User who created the simulation
            business_context: Business context data
            questions_data: Questions and stakeholder data
            simulation_config: Simulation configuration
            
        Returns:
            Created simulation data record
        """
        try:
            simulation_data = SimulationData(
                simulation_id=simulation_id,
                user_id=user_id,
                status="pending",
                business_context=business_context,
                questions_data=questions_data,
                simulation_config=simulation_config,
                created_at=datetime.utcnow()
            )
            
            await self.add(simulation_data)
            logger.info(f"Created simulation record: {simulation_id}")
            return simulation_data
            
        except SQLAlchemyError as e:
            logger.error(f"Error creating simulation: {str(e)}")
            raise

    async def update_simulation_results(
        self,
        simulation_id: str,
        personas: List[Dict[str, Any]],
        interviews: List[Dict[str, Any]],
        insights: Optional[Dict[str, Any]] = None,
        formatted_data: Optional[Dict[str, Any]] = None,
    ) -> Optional[SimulationData]:
        """
        Update simulation with results.
        
        Args:
            simulation_id: Simulation identifier
            personas: Generated personas
            interviews: Completed interviews
            insights: Generated insights
            formatted_data: Analysis-ready data
            
        Returns:
            Updated simulation data or None if not found
        """
        try:
            simulation = await self.get_by_simulation_id(simulation_id)
            if not simulation:
                logger.warning(f"Simulation not found: {simulation_id}")
                return None
            
            simulation.personas = personas
            simulation.interviews = interviews
            simulation.insights = insights
            simulation.formatted_data = formatted_data
            simulation.total_personas = len(personas)
            simulation.total_interviews = len(interviews)
            simulation.status = "completed"
            simulation.completed_at = datetime.utcnow()
            
            self.session.flush()
            logger.info(f"Updated simulation results: {simulation_id}")
            return simulation
            
        except SQLAlchemyError as e:
            logger.error(f"Error updating simulation results: {str(e)}")
            raise

    async def mark_simulation_failed(
        self,
        simulation_id: str,
        error_message: str
    ) -> Optional[SimulationData]:
        """
        Mark simulation as failed.
        
        Args:
            simulation_id: Simulation identifier
            error_message: Error description
            
        Returns:
            Updated simulation data or None if not found
        """
        try:
            simulation = await self.get_by_simulation_id(simulation_id)
            if not simulation:
                logger.warning(f"Simulation not found: {simulation_id}")
                return None
            
            simulation.status = "failed"
            simulation.error_message = error_message
            simulation.completed_at = datetime.utcnow()
            
            self.session.flush()
            logger.info(f"Marked simulation as failed: {simulation_id}")
            return simulation
            
        except SQLAlchemyError as e:
            logger.error(f"Error marking simulation as failed: {str(e)}")
            raise

    async def get_by_simulation_id(self, simulation_id: str) -> Optional[SimulationData]:
        """
        Get simulation by ID.
        
        Args:
            simulation_id: Simulation identifier
            
        Returns:
            Simulation data or None if not found
        """
        try:
            return self.session.query(SimulationData).filter(
                SimulationData.simulation_id == simulation_id
            ).first()
        except SQLAlchemyError as e:
            logger.error(f"Error getting simulation by ID: {str(e)}")
            raise

    async def get_user_simulations(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[SimulationData]:
        """
        Get user's simulations.
        
        Args:
            user_id: User identifier
            limit: Maximum number of results
            offset: Offset for pagination
            
        Returns:
            List of user's simulations
        """
        try:
            return self.session.query(SimulationData).filter(
                SimulationData.user_id == user_id
            ).order_by(desc(SimulationData.created_at)).limit(limit).offset(offset).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting user simulations: {str(e)}")
            raise

    async def get_completed_simulations(
        self,
        user_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[SimulationData]:
        """
        Get completed simulations.
        
        Args:
            user_id: Optional user filter
            limit: Maximum number of results
            offset: Offset for pagination
            
        Returns:
            List of completed simulations
        """
        try:
            query = self.session.query(SimulationData).filter(
                SimulationData.status == "completed"
            )
            
            if user_id:
                query = query.filter(SimulationData.user_id == user_id)
            
            return query.order_by(desc(SimulationData.completed_at)).limit(limit).offset(offset).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting completed simulations: {str(e)}")
            raise

    async def delete_simulation(self, simulation_id: str) -> bool:
        """
        Delete a simulation.
        
        Args:
            simulation_id: Simulation identifier
            
        Returns:
            True if deleted, False if not found
        """
        try:
            simulation = await self.get_by_simulation_id(simulation_id)
            if not simulation:
                return False
            
            self.session.delete(simulation)
            self.session.flush()
            logger.info(f"Deleted simulation: {simulation_id}")
            return True
            
        except SQLAlchemyError as e:
            logger.error(f"Error deleting simulation: {str(e)}")
            raise
