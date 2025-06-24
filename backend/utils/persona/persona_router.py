"""
Persona Router - Intelligently routes interview data to the appropriate persona analyzer
based on the content and question patterns. Uses Pydantic-Instructor for structured output.
"""

import re
import logging
from typing import Dict, Any, List, Tuple, Optional
from backend.utils.persona.persona_analyzer import PersonaAnalyzer
from backend.utils.persona.customer_persona_analyzer import CustomerPersonaAnalyzer
from backend.models.persona_models import (
    BusinessPersona,
    CustomerPersona,
    HybridPersona,
    PersonaAnalysisResult,
    RoutingMetadata,
    PersonaType,
)

logger = logging.getLogger(__name__)


class PersonaRouter:
    """Routes interview data to the appropriate persona analyzer with Instructor support"""

    def __init__(self, use_instructor: bool = True):
        """
        Initialize the persona router.

        Args:
            use_instructor: Whether to use Instructor for structured output
        """
        self.use_instructor = use_instructor
        self.instructor_client = None

        if use_instructor:
            try:
                from backend.services.llm.instructor_gemini_client import (
                    InstructorGeminiClient,
                )

                self.instructor_client = InstructorGeminiClient()
                logger.info("🎯 Initialized PersonaRouter with Instructor support")
            except ImportError as e:
                logger.warning(
                    f"⚠️ Instructor not available, falling back to legacy mode: {e}"
                )
                self.use_instructor = False

    # Business workflow question patterns
    BUSINESS_PATTERNS = [
        "tool",
        "use",
        "process",
        "template",
        "checklist",
        "method",
        "approach",
        "customize",
        "collaborate",
        "share",
        "review",
        "standardization",
        "guidelines",
        "responsibility",
        "task",
        "ensure",
        "freedom",
        "personalize",
        "adapt",
        "balance",
        "align",
        "approve",
        "design",
        "create",
        "modify",
    ]

    # Customer experience question patterns
    CUSTOMER_PATTERNS = [
        "experience",
        "customer",
        "user",
        "client",
        "buyer",
        "purchase",
        "shop",
        "find",
        "look for",
        "search",
        "prefer",
        "like",
        "want",
        "need",
        "appealing",
        "frustrat",
        "annoying",
        "journey",
        "touchpoint",
        "authentic",
        "local",
        "unique",
        "special",
    ]

    @classmethod
    def analyze_data_type(cls, data: List[Dict[str, Any]]) -> Tuple[str, float]:
        """
        Analyze interview data to determine if it's business or customer focused.

        Args:
            data: List of interview data segments

        Returns:
            Tuple of (analysis_type, confidence_score)
            analysis_type: 'business' or 'customer'
            confidence_score: 0.0 to 1.0
        """
        business_score = 0
        customer_score = 0
        total_questions = 0

        for segment in data:
            if "respondents" in segment:
                for respondent in segment["respondents"]:
                    for answer in respondent.get("answers", []):
                        question = answer.get("question", "").lower()
                        total_questions += 1

                        # Count business patterns
                        business_matches = sum(
                            1
                            for pattern in cls.BUSINESS_PATTERNS
                            if pattern in question
                        )
                        business_score += business_matches

                        # Count customer patterns
                        customer_matches = sum(
                            1
                            for pattern in cls.CUSTOMER_PATTERNS
                            if pattern in question
                        )
                        customer_score += customer_matches

        if total_questions == 0:
            return "business", 0.0

        # Calculate confidence based on pattern density
        business_density = business_score / total_questions
        customer_density = customer_score / total_questions

        if business_density > customer_density:
            analysis_type = "business"
            confidence = min(business_density / 0.5, 1.0)  # Normalize to 0-1
        else:
            analysis_type = "customer"
            confidence = min(customer_density / 0.5, 1.0)  # Normalize to 0-1

        return analysis_type, confidence

    @classmethod
    def route_to_analyzer(cls, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Route data to the appropriate analyzer and return personas.

        Args:
            data: List of interview data segments

        Returns:
            List of generated personas
        """
        analysis_type, confidence = cls.analyze_data_type(data)

        print(f"Routing to {analysis_type} analyzer (confidence: {confidence:.2f})")

        personas = []

        for data_segment in data:
            try:
                if analysis_type == "customer":
                    # Use customer persona analyzer
                    analyzer = CustomerPersonaAnalyzer(
                        data_segment.get("respondents", []),
                        data_segment.get("persona_type", "Customer"),
                    )
                    persona = analyzer.generate_customer_persona_profile()
                else:
                    # Use business persona analyzer
                    analyzer = PersonaAnalyzer(data_segment)
                    persona = analyzer.generate_persona_profile()

                # Add routing metadata
                persona["routing_metadata"] = {
                    "analysis_type": analysis_type,
                    "confidence": confidence,
                    "analyzer_used": (
                        "customer" if analysis_type == "customer" else "business"
                    ),
                }

                personas.append(persona)

            except Exception as e:
                print(
                    f"Error processing persona {data_segment.get('persona_type', 'Unknown')}: {str(e)}"
                )
                continue

        return personas

    @classmethod
    def create_hybrid_analyzer(cls, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Create a hybrid analysis that tries both analyzers and combines results.

        Args:
            data: List of interview data segments

        Returns:
            List of generated personas with hybrid analysis
        """
        personas = []

        for data_segment in data:
            try:
                business_persona = None
                customer_persona = None

                # Try business analyzer
                try:
                    business_analyzer = PersonaAnalyzer(data_segment)
                    business_persona = business_analyzer.generate_persona_profile()
                except Exception as e:
                    print(f"Business analyzer failed: {e}")

                # Try customer analyzer
                try:
                    customer_analyzer = CustomerPersonaAnalyzer(
                        data_segment.get("respondents", []),
                        data_segment.get("persona_type", "Customer"),
                    )
                    customer_persona = (
                        customer_analyzer.generate_customer_persona_profile()
                    )
                except Exception as e:
                    print(f"Customer analyzer failed: {e}")

                # Combine results or use the best one
                if business_persona and customer_persona:
                    # Create hybrid persona
                    hybrid_persona = cls._merge_personas(
                        business_persona, customer_persona
                    )
                    personas.append(hybrid_persona)
                elif business_persona:
                    business_persona["routing_metadata"] = {
                        "analysis_type": "business_only",
                        "analyzer_used": "business",
                    }
                    personas.append(business_persona)
                elif customer_persona:
                    customer_persona["routing_metadata"] = {
                        "analysis_type": "customer_only",
                        "analyzer_used": "customer",
                    }
                    personas.append(customer_persona)
                else:
                    print(
                        f"Both analyzers failed for {data_segment.get('persona_type', 'Unknown')}"
                    )

            except Exception as e:
                print(
                    f"Error in hybrid analysis for {data_segment.get('persona_type', 'Unknown')}: {str(e)}"
                )
                continue

        return personas

    @classmethod
    def _merge_personas(
        cls, business_persona: Dict[str, Any], customer_persona: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Merge business and customer persona results into a hybrid persona.

        Args:
            business_persona: Results from business analyzer
            customer_persona: Results from customer analyzer

        Returns:
            Merged hybrid persona
        """
        hybrid = {
            "persona_type": business_persona.get("persona_type", "Hybrid"),
            "business_attributes": business_persona.get("core_attributes", {}),
            "customer_attributes": customer_persona.get("customer_attributes", {}),
            "business_pain_points": business_persona.get("pain_points", {}),
            "customer_pain_points": customer_persona.get("pain_points", {}),
            "collaboration_patterns": business_persona.get(
                "collaboration_patterns", {}
            ),
            "customer_journey": customer_persona.get("customer_journey", {}),
            "supporting_quotes": {
                "business": business_persona.get("supporting_quotes", {}),
                "customer": customer_persona.get("supporting_quotes", {}),
            },
            "metadata": {
                "business_metadata": business_persona.get("metadata", {}),
                "customer_metadata": customer_persona.get("metadata", {}),
                "analysis_type": "hybrid",
            },
            "routing_metadata": {
                "analysis_type": "hybrid",
                "analyzer_used": "both",
                "business_success": True,
                "customer_success": True,
            },
        }

        return hybrid


def create_smart_personas_from_interviews(
    interview_file: str, use_hybrid: bool = False
) -> List[Dict[str, Any]]:
    """
    Create personas using smart routing to determine the best analyzer.

    Args:
        interview_file: Path to interview data file
        use_hybrid: If True, use hybrid analysis; if False, use smart routing

    Returns:
        List of generated personas
    """
    import json
    from backend.utils.data.data_transformer import (
        transform_interview_data,
        validate_interview_data,
    )

    with open(interview_file, "r") as f:
        data = json.load(f)

    # Validate data format
    if not validate_interview_data(data):
        raise ValueError("Invalid interview data format")

    # Transform data if needed
    interview_data = transform_interview_data(data)

    # Route to appropriate analyzer
    if use_hybrid:
        return PersonaRouter.create_hybrid_analyzer(interview_data)
    else:
        return PersonaRouter.route_to_analyzer(interview_data)
