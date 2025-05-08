from sqlalchemy.orm import Session
from backend.models import User
from typing import Dict, Any, Optional, Union
import logging

from backend.services.export.pdf_generator import PdfReportGenerator
from backend.services.export.markdown_generator import MarkdownReportGenerator

logger = logging.getLogger(__name__)


class ExportService:
    """
    Service for exporting analysis results in various formats.
    
    This service uses specialized generators for different export formats.
    """

    def __init__(self, db: Session, user: User):
        """
        Initialize the export service.
        
        Args:
            db: Database session
            user: User object
        """
        self.db = db
        self.user = user
        
        # Initialize generators
        self.pdf_generator = PdfReportGenerator(db, user)
        self.markdown_generator = MarkdownReportGenerator(db, user)

    async def generate_analysis_pdf(self, result_id: int) -> bytes:
        """
        Generate a PDF report for an analysis result.
        
        Args:
            result_id: ID of the analysis result
            
        Returns:
            bytes: PDF file content
        """
        try:
            logger.info(f"Generating PDF report for analysis result {result_id}")
            return await self.pdf_generator.generate(result_id)
        except Exception as e:
            logger.error(f"Error generating PDF report: {str(e)}")
            raise

    async def generate_analysis_markdown(self, result_id: int) -> str:
        """
        Generate a Markdown report for an analysis result.
        
        Args:
            result_id: ID of the analysis result
            
        Returns:
            str: Markdown content
        """
        try:
            logger.info(f"Generating Markdown report for analysis result {result_id}")
            return await self.markdown_generator.generate(result_id)
        except Exception as e:
            logger.error(f"Error generating Markdown report: {str(e)}")
            raise
