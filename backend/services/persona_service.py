from fastapi import HTTPException
from sqlalchemy.orm import Session
import logging
from typing import Dict, Any, List, Optional

from backend.models import User
from backend.services.llm import LLMServiceFactory
from backend.services.processing.persona_formation_service import PersonaFormationService
from infrastructure.config.settings import settings

# Configuration values
ENABLE_CLERK_...=***REMOVED***"enable_clerk_validation", False)

# Configure logging
logger = logging.getLogger(__name__)

class PersonaService:
    """
    Service class for handling persona generation from text.
    """

    def __init__(self, db: Session, user: User):
        """
        Initialize the PersonaService with database session and user.

        Args:
            db (Session): SQLAlchemy database session
            user (User): Current authenticated user
        """
        self.db = db
        self.user = user
        self._persona_formation_service = None

    async def generate_persona(self,
                        text: str,
                        llm_provider: str = "gemini",
                        llm_model: Optional[str] = None,
                        filename: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate a persona from interview text.

        Args:
            text: Raw interview text
            llm_provider: LLM provider to use (gemini or openai)
            llm_model: Specific model to use (optional)
            filename: Optional filename of the source file (for special handling)

        Returns:
            Generated persona data

        Raises:
            HTTPException: For invalid text or generation errors
        """
        try:
            # Validate input
            if not text:
                raise HTTPException(status_code=400, detail="No text provided for persona generation")

            # Log request
            logger.info(f"Generating persona from text ({len(text)} chars)")

            # If in development mode (not using clerk validation), return a mock persona
            if not ENABLE_CLERK_VALIDATION:
                logger.info("Development mode: Returning mock persona")
                return {
                    "success": True,
                    "message": "Mock persona generated successfully",
                    "persona": self._get_mock_persona()
                }

            # Initialize persona service if not already done
            if not self._persona_formation_service:
                self._persona_formation_service = self._create_persona_formation_service(
                    llm_provider=llm_provider,
                    llm_model=llm_model or settings.llm_providers[llm_provider]["model"]
                )

            # Generate personas
            context = {'original_text': text}

            # Add filename to context if provided
            if filename:
                context['filename'] = filename
                logger.info(f"Using filename in persona generation context: {filename}")

            personas = await self._persona_formation_service.generate_persona_from_text(
                text,
                context
            )

            if not personas or len(personas) == 0:
                logger.error("No personas were generated from text")
                raise HTTPException(status_code=500, detail="Failed to generate persona from text")

            # Return all generated personas
            return {
                "success": True,
                "message": f"Generated {len(personas)} personas successfully",
                "personas": personas,
                "persona": personas[0] if personas else None  # For backward compatibility
            }

        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            logger.error(f"Error generating persona: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Server error: {str(e)}"
            )

    def _create_persona_formation_service(self, llm_provider: str, llm_model: str) -> PersonaFormationService:
        """
        Create a properly configured PersonaFormationService.

        Args:
            llm_provider: LLM provider name
            llm_model: LLM model name

        Returns:
            Configured PersonaFormationService
        """
        try:
            # Update this line to use the create_llm_service method correctly
            llm_config = dict(settings.llm_providers[llm_provider])
            llm_config['model'] = llm_model
            llm_service = LLMServiceFactory.create(llm_provider, llm_config)

            # Create a minimal SystemConfig for the persona formation service
            class MinimalSystemConfig:
                def __init__(self):
                    self.llm = type('obj', (object,), {
                        'provider': llm_provider,
                        'model': llm_model,
                        'api_key': settings.llm_providers[llm_provider].get('api_key', ''),
                        'temperature': 0.3,
                        'max_tokens': 2000
                    })
                    self.processing = type('obj', (object,), {
                        'batch_size': 10,
                        'max_tokens': 2000
                    })
                    self.validation = type('obj', (object,), {
                        'min_confidence': 0.4
                    })

            system_config = MinimalSystemConfig()
            persona_service = PersonaFormationService(system_config, llm_service)

            return persona_service

        except Exception as e:
            logger.error(f"Error creating persona formation service: {str(e)}")
            raise

    def _get_mock_persona(self) -> Dict[str, Any]:
        """
        Generate a mock persona for development/testing.

        Returns:
            Mock persona data
        """
        return {
            "id": "mock-persona-1",
            "name": "Design Lead Alex",
            "description": "Alex is an experienced design leader who values user-centered processes and design systems. They struggle with ensuring design quality while meeting business demands and securing resources for proper research.",
            "confidence": 0.85,
            "evidence": [
                "Manages UX team of 5-7 designers",
                "Responsible for design system implementation"
            ],
            "role_context": {
                "value": "Design team lead at medium-sized technology company",
                "confidence": 0.9,
                "evidence": ["Manages UX team of 5-7 designers", "Responsible for design system implementation"]
            },
            "key_responsibilities": {
                "value": "Oversees design system implementation. Manages team of designers. Coordinates with product and engineering",
                "confidence": 0.85,
                "evidence": ["Mentioned regular design system review meetings", "Discussed designer performance reviews"]
            },
            "tools_used": {
                "value": "Figma, Sketch, Adobe Creative Suite, Jira, Confluence",
                "confidence": 0.8,
                "evidence": ["Referenced Figma components", "Mentioned Jira ticketing system"]
            },
            "collaboration_style": {
                "value": "Cross-functional collaboration with tight integration between design and development",
                "confidence": 0.75,
                "evidence": ["Weekly sync meetings with engineering", "Design hand-off process improvements"]
            },
            "analysis_approach": {
                "value": "Data-informed design decisions with emphasis on usability testing",
                "confidence": 0.7,
                "evidence": ["Conducts regular user testing sessions", "Analyzes usage metrics to inform design"]
            },
            "pain_points": {
                "value": "Limited resources for user research. Engineering-driven decision making. Maintaining design quality with tight deadlines",
                "confidence": 0.9,
                "evidence": ["Expressed frustration about research budget limitations", "Mentioned quality issues due to rushed timelines"]
            }
        }
