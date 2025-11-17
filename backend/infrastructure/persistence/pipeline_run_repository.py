"""
Repository for AxPersona pipeline run persistence.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import desc

from backend.models import PipelineRun
from backend.infrastructure.persistence.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class PipelineRunRepository(BaseRepository[PipelineRun]):
    """Repository for managing AxPersona pipeline run persistence."""

    def __init__(self, session):
        super().__init__(session, PipelineRun)

    async def create_pipeline_run(
        self,
        job_id: str,
        business_context: Dict[str, Any],
        user_id: Optional[str] = None,
    ) -> PipelineRun:
        """
        Create a new pipeline run record.
        
        Args:
            job_id: Unique job identifier
            business_context: Business context input
            user_id: Optional user who created the pipeline run
            
        Returns:
            Created pipeline run record
        """
        try:
            pipeline_run = PipelineRun(
                job_id=job_id,
                user_id=user_id,
                status="pending",
                business_context=business_context,
                created_at=datetime.utcnow()
            )
            
            await self.add(pipeline_run)
            logger.info(f"Created pipeline run record: {job_id}")
            return pipeline_run
            
        except SQLAlchemyError as e:
            logger.error(f"Error creating pipeline run: {str(e)}")
            raise

    async def update_pipeline_run_status(
        self,
        job_id: str,
        status: str,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        error: Optional[str] = None,
    ) -> Optional[PipelineRun]:
        """
        Update pipeline run status.
        
        Args:
            job_id: Job identifier
            status: New status (pending, running, completed, failed)
            started_at: Optional start timestamp
            completed_at: Optional completion timestamp
            error: Optional error message
            
        Returns:
            Updated pipeline run or None if not found
        """
        try:
            pipeline_run = await self.get_by_job_id(job_id)
            if not pipeline_run:
                logger.warning(f"Pipeline run not found: {job_id}")
                return None
            
            pipeline_run.status = status
            if started_at:
                pipeline_run.started_at = started_at
            if completed_at:
                pipeline_run.completed_at = completed_at
            if error:
                pipeline_run.error = error
            
            self.session.flush()
            logger.info(f"Updated pipeline run status: {job_id} -> {status}")
            return pipeline_run
            
        except SQLAlchemyError as e:
            logger.error(f"Error updating pipeline run status: {str(e)}")
            raise

    async def update_pipeline_run_results(
        self,
        job_id: str,
        execution_trace: List[Dict[str, Any]],
        total_duration_seconds: float,
        dataset: Optional[Dict[str, Any]] = None,
        questionnaire_stakeholder_count: Optional[int] = None,
        simulation_id: Optional[str] = None,
        analysis_id: Optional[str] = None,
        persona_count: Optional[int] = None,
        interview_count: Optional[int] = None,
    ) -> Optional[PipelineRun]:
        """
        Update pipeline run with execution results.
        
        Args:
            job_id: Job identifier
            execution_trace: List of stage execution traces
            total_duration_seconds: Total pipeline duration
            dataset: Optional generated dataset
            questionnaire_stakeholder_count: Number of stakeholders in questionnaire
            simulation_id: Reference to simulation
            analysis_id: Reference to analysis
            persona_count: Number of personas generated
            interview_count: Number of interviews conducted
            
        Returns:
            Updated pipeline run or None if not found
        """
        try:
            pipeline_run = await self.get_by_job_id(job_id)
            if not pipeline_run:
                logger.warning(f"Pipeline run not found: {job_id}")
                return None
            
            pipeline_run.execution_trace = execution_trace
            pipeline_run.total_duration_seconds = total_duration_seconds
            pipeline_run.dataset = dataset
            pipeline_run.questionnaire_stakeholder_count = questionnaire_stakeholder_count
            pipeline_run.simulation_id = simulation_id
            pipeline_run.analysis_id = analysis_id
            pipeline_run.persona_count = persona_count
            pipeline_run.interview_count = interview_count
            
            self.session.flush()
            logger.info(f"Updated pipeline run results: {job_id}")
            return pipeline_run

        except SQLAlchemyError as e:
            logger.error(f"Error updating pipeline run results: {str(e)}")
            raise

    async def get_by_job_id(self, job_id: str) -> Optional[PipelineRun]:
        """
        Get pipeline run by job ID.

        Args:
            job_id: Job identifier

        Returns:
            Pipeline run or None if not found
        """
        try:
            return self.session.query(PipelineRun).filter(
                PipelineRun.job_id == job_id
            ).first()
        except SQLAlchemyError as e:
            logger.error(f"Error getting pipeline run by job ID: {str(e)}")
            raise

    async def get_all_pipeline_runs(
        self,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[PipelineRun]:
        """
        Get all pipeline runs with optional filtering.

        Args:
            user_id: Optional user filter
            status: Optional status filter (pending, running, completed, failed)
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of pipeline runs ordered by creation date (newest first)
        """
        try:
            query = self.session.query(PipelineRun)

            if user_id:
                query = query.filter(PipelineRun.user_id == user_id)

            if status:
                query = query.filter(PipelineRun.status == status)

            return query.order_by(desc(PipelineRun.created_at)).limit(limit).offset(offset).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting pipeline runs: {str(e)}")
            raise

    async def get_completed_pipeline_runs(
        self,
        user_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[PipelineRun]:
        """
        Get completed pipeline runs.

        Args:
            user_id: Optional user filter
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of completed pipeline runs
        """
        try:
            query = self.session.query(PipelineRun).filter(
                PipelineRun.status == "completed"
            )

            if user_id:
                query = query.filter(PipelineRun.user_id == user_id)

            return query.order_by(desc(PipelineRun.completed_at)).limit(limit).offset(offset).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting completed pipeline runs: {str(e)}")
            raise

    async def count_pipeline_runs(
        self,
        user_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> int:
        """
        Count pipeline runs with optional filtering.

        Args:
            user_id: Optional user filter
            status: Optional status filter

        Returns:
            Count of matching pipeline runs
        """
        try:
            query = self.session.query(PipelineRun)

            if user_id:
                query = query.filter(PipelineRun.user_id == user_id)

            if status:
                query = query.filter(PipelineRun.status == status)

            return query.count()
        except SQLAlchemyError as e:
            logger.error(f"Error counting pipeline runs: {str(e)}")
            raise

