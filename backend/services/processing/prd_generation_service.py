"""
PRD generation service.
"""

import logging
from typing import Dict, Any, List, Optional
import json

from backend.services.llm import LLMServiceFactory

logger = logging.getLogger(__name__)

class PRDGenerationService:
    """
    Service for generating Product Requirements Documents (PRDs) from analysis results.
    """

    def __init__(self, llm_service=None):
        """
        Initialize the PRD generation service.

        Args:
            llm_service: LLM service to use for PRD generation
        """
        self.llm_service = llm_service or LLMServiceFactory.create("enhanced_gemini")
        logger.info(f"Initialized PRDGenerationService with {self.llm_service.__class__.__name__}")

    async def generate_prd(
        self,
        analysis_results: Dict[str, Any],
        prd_type: str = "both",
        industry: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a PRD from analysis results.

        Args:
            analysis_results: Analysis results containing themes, patterns, insights, and personas
            prd_type: Type of PRD to generate ("operational", "technical", or "both")
            industry: Optional industry context

        Returns:
            Generated PRD
        """
        try:
            logger.info(f"Generating {prd_type} PRD from analysis results")

            # Extract relevant data from analysis results
            themes = analysis_results.get("themes", [])
            patterns = analysis_results.get("patterns", [])
            insights = analysis_results.get("insights", [])
            personas = analysis_results.get("personas", [])

            # Get original text if available
            original_text = analysis_results.get("original_text", "")

            # Prepare request data for LLM
            request_data = {
                "task": "prd_generation",
                "text": original_text,
                "themes": themes,
                "patterns": patterns,
                "insights": insights,
                "personas": personas,
                "prd_type": prd_type,
                "industry": industry,
                "enforce_json": True  # Flag to enforce JSON output
            }

            # Call LLM to generate PRD
            logger.info("Calling LLM to generate PRD")
            llm_response = await self.llm_service.analyze(request_data)

            # Parse and validate the response
            prd_data = self._parse_llm_response(llm_response)

            # Add metadata
            prd_data["metadata"] = {
                "generated_from": {
                    "themes_count": len(themes),
                    "patterns_count": len(patterns),
                    "insights_count": len(insights),
                    "personas_count": len(personas)
                },
                "prd_type": prd_type,
                "industry": industry
            }

            logger.info(f"Successfully generated PRD with type: {prd_type}")
            return prd_data

        except Exception as e:
            logger.error(f"Error generating PRD: {str(e)}")
            # Return a minimal error response
            return {
                "error": f"Failed to generate PRD: {str(e)}",
                "prd_type": prd_type,
                "operational_prd": {
                    "objectives": [{"title": "Error", "description": "Failed to generate PRD"}]
                } if prd_type in ["operational", "both"] else None,
                "technical_prd": {
                    "objectives": [{"title": "Error", "description": "Failed to generate PRD"}]
                } if prd_type in ["technical", "both"] else None
            }

    def _parse_llm_response(self, response: Any) -> Dict[str, Any]:
        """
        Parse LLM response into a PRD dictionary.

        Args:
            response: LLM response

        Returns:
            Parsed PRD dictionary
        """
        try:
            # Handle different response formats
            if isinstance(response, dict):
                # If response is already a dictionary
                if "prd_type" in response:
                    return response
                elif "text" in response:
                    # Try to parse JSON from text
                    try:
                        return json.loads(response["text"])
                    except json.JSONDecodeError:
                        logger.warning("Failed to parse JSON from response text")
                        return self._create_fallback_prd(response["text"])
            elif isinstance(response, str):
                # Try to parse JSON from string
                try:
                    return json.loads(response)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse JSON from response string")
                    return self._create_fallback_prd(response)

            # If we can't parse the response, return a fallback PRD
            logger.warning(f"Unexpected response format: {type(response)}")
            return self._create_fallback_prd(str(response))

        except Exception as e:
            logger.error(f"Error parsing LLM response: {str(e)}")
            return self._create_fallback_prd("Error parsing LLM response")

    def _create_fallback_prd(self, text: str) -> Dict[str, Any]:
        """
        Create a fallback PRD when parsing fails.

        Args:
            text: Raw text from LLM

        Returns:
            Fallback PRD dictionary
        """
        logger.info("Creating fallback PRD")

        # Try to extract some content from the text
        objectives = []
        lines = text.split("\n")
        for line in lines:
            if "objective" in line.lower() or "goal" in line.lower():
                objectives.append({
                    "title": "Extracted Objective",
                    "description": line.strip()
                })

        if not objectives:
            objectives = [{
                "title": "Fallback Objective",
                "description": "Improve user experience based on research insights"
            }]

        return {
            "prd_type": "both",
            "operational_prd": {
                "objectives": objectives,
                "scope": {
                    "included": ["Features based on user research"],
                    "excluded": ["Features not supported by research"]
                },
                "user_stories": [{
                    "story": "As a user, I want to accomplish my goals efficiently so that I can be more productive",
                    "acceptance_criteria": [
                        "Given I am using the application",
                        "When I perform an action",
                        "Then I should see the expected result"
                    ],
                    "what": "Efficient user interface",
                    "why": "Improves user productivity",
                    "how": "Implement based on research findings"
                }],
                "requirements": [{
                    "id": "REQ-001",
                    "title": "User-Centered Design",
                    "description": "The application should follow user-centered design principles",
                    "priority": "High",
                    "related_user_stories": ["US-001"]
                }],
                "success_metrics": [{
                    "metric": "User Satisfaction",
                    "target": "90% positive feedback",
                    "measurement_method": "User surveys"
                }]
            },
            "technical_prd": {
                "objectives": objectives,
                "scope": {
                    "included": ["Core functionality"],
                    "excluded": ["Advanced features for future releases"]
                },
                "architecture": {
                    "overview": "Standard web application architecture",
                    "components": [{
                        "name": "Frontend",
                        "purpose": "User interface",
                        "interactions": ["Communicates with backend API"]
                    }, {
                        "name": "Backend",
                        "purpose": "Business logic and data processing",
                        "interactions": ["Communicates with database"]
                    }],
                    "data_flow": "Frontend → Backend → Database"
                },
                "implementation_requirements": [{
                    "id": "TECH-001",
                    "title": "Performance Optimization",
                    "description": "Ensure application responds within 2 seconds",
                    "priority": "High",
                    "dependencies": []
                }],
                "testing_validation": [{
                    "test_type": "Performance Testing",
                    "description": "Measure response times under load",
                    "success_criteria": "95% of requests complete within 2 seconds"
                }],
                "success_metrics": [{
                    "metric": "Response Time",
                    "target": "< 2 seconds",
                    "measurement_method": "Automated performance tests"
                }]
            }
        }
