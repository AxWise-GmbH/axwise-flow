"""Data processing implementation"""

from typing import Dict, Any, Optional
import logging
from backend.domain.interfaces.nlp import INLPProcessor
from backend.domain.interfaces.llm_unified import ILLMService
from backend.infrastructure.data.config import SystemConfig
from backend.infrastructure.events.event_manager import event_manager, EventType

logger = logging.getLogger(__name__)


class DataProcessor:
    """Data processing implementation"""

    def __init__(
        self,
        config: SystemConfig,
        nlp_processor: INLPProcessor,
        llm_service: ILLMService,
    ):
        self.config = config
        self.nlp_processor = nlp_processor
        self.llm_service = llm_service

    async def process_interview_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process interview data through NLP and LLM analysis"""
        try:
            # Start processing
            await event_manager.emit(
                EventType.PROCESSING_STARTED,
                {"stage": "data_processing", "data_size": len(str(data))},
            )

            # Process with NLP
            nlp_results = await self.nlp_processor.process_interview_data(data)

            # Get LLM insights using analyze with interview_processing task
            llm_results = await self.llm_service.analyze(
                {"task": "interview_processing", "text": str(data)}
            )

            # Combine results
            results = {
                "nlp_analysis": nlp_results,
                "llm_analysis": llm_results,
                "metadata": {
                    "data_size": len(str(data)),
                    "processing_time": None,  # Will be set by event system
                },
            }

            # Emit completion
            await event_manager.emit(
                EventType.PROCESSING_COMPLETED,
                {"stage": "data_processing", "results": results},
            )

            return results

        except Exception as e:
            logger.error(f"Error processing interview data: {str(e)}")
            await event_manager.emit_error(e, {"stage": "data_processing"})
            raise

    async def validate_results(self, results: Dict[str, Any]) -> bool:
        """Validate processing results"""
        try:
            # Check required fields
            required_fields = ["nlp_analysis", "llm_analysis"]
            if not all(field in results for field in required_fields):
                logger.error("Missing required fields in results")
                return False

            # Validate NLP results
            nlp_required = ["entities", "patterns", "themes", "keywords"]
            if not all(field in results["nlp_analysis"] for field in nlp_required):
                logger.error("Missing required NLP analysis fields")
                return False

            # Validate LLM results
            llm_required = ["themes", "pain_points", "key_findings", "sentiment"]
            if not all(field in results["llm_analysis"] for field in llm_required):
                logger.error("Missing required LLM analysis fields")
                return False

            return True

        except Exception as e:
            logger.error(f"Error validating results: {str(e)}")
            return False

    async def extract_insights(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Extract key insights from processing results"""
        try:
            # Get themes from both analyses
            nlp_themes = results["nlp_analysis"].get("themes", [])
            llm_themes = results["llm_analysis"].get("themes", [])

            # Get patterns and pain points
            patterns = results["nlp_analysis"].get("patterns", {})
            pain_points = results["llm_analysis"].get("pain_points", [])

            # Combine insights
            insights = {
                "themes": list(set(nlp_themes + llm_themes)),
                "patterns": patterns,
                "pain_points": pain_points,
                "key_findings": results["llm_analysis"].get("key_findings", []),
                "sentiment": results["llm_analysis"].get("sentiment", {}),
                "metadata": {
                    "theme_count": len(nlp_themes) + len(llm_themes),
                    "pattern_count": len(patterns),
                    "pain_point_count": len(pain_points),
                },
            }

            return insights

        except Exception as e:
            logger.error(f"Error extracting insights: {str(e)}")
            await event_manager.emit_error(e, {"stage": "insight_extraction"})
            raise
