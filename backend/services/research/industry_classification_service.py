"""
Enhanced Industry Classification Service for Research API V3.

This service combines V1 industry classification logic with enhanced Pydantic models
and Instructor-based structured outputs for comprehensive industry analysis.
"""

import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from backend.models.industry_stakeholder_models import IndustryAnalysis
from backend.services.llm.instructor_gemini_client import EnhancedInstructorGeminiClient

logger = logging.getLogger(__name__)


@dataclass
class IndustryClassificationConfig:
    """Configuration for industry classification."""

    # V1 supported industries (preserved for compatibility)
    V1_INDUSTRIES = [
        "healthcare", "tech", "finance", "military", "education",
        "hospitality", "retail", "manufacturing", "legal",
        "insurance", "agriculture", "non_profit", "general"
    ]

    # Enhanced industry mapping (V1 -> V3)
    INDUSTRY_MAPPING = {
        "tech": "saas",
        "finance": "fintech",
        "military": "general",
        "hospitality": "general",
        "legal": "general",
        "insurance": "fintech",
        "agriculture": "general",
        "non_profit": "general"
    }

    # Keyword-based fallback detection (from V1)
    INDUSTRY_KEYWORDS = {
        "healthcare": [
            "patient", "clinical", "medical", "hospital", "healthcare", "doctor",
            "nurse", "treatment", "diagnosis", "hipaa", "ehr", "emr"
        ],
        "fintech": [
            "payment", "banking", "financial", "money", "transaction", "credit",
            "loan", "investment", "trading", "cryptocurrency", "blockchain"
        ],
        "saas": [
            "software", "platform", "api", "cloud", "subscription", "dashboard",
            "analytics", "integration", "workflow", "automation"
        ],
        "ecommerce": [
            "shop", "store", "product", "cart", "checkout", "inventory",
            "shipping", "order", "customer", "marketplace", "retail"
        ],
        "edtech": [
            "education", "learning", "student", "teacher", "course", "curriculum",
            "training", "skill", "knowledge", "academic", "university"
        ],
        "ux_research": [
            "ux", "user research", "design", "usability", "interface", "experience",
            "prototype", "wireframe", "user testing", "persona"
        ],
        "product_management": [
            "product", "feature", "roadmap", "backlog", "sprint", "agile",
            "requirements", "stakeholder", "launch", "metrics"
        ]
    }


class EnhancedIndustryClassificationService:
    """
    Enhanced industry classification service that combines V1 logic with V3 models.

    This service provides comprehensive industry analysis including:
    - LLM-based classification with fallback
    - Industry-specific guidance generation
    - Methodology recommendations
    - Regulatory considerations
    """

    def __init__(self, instructor_client: Optional[EnhancedInstructorGeminiClient] = None):
        """Initialize the industry classification service."""
        self.instructor_client = instructor_client or EnhancedInstructorGeminiClient()
        self.config = IndustryClassificationConfig()

    async def classify_industry_comprehensive(
        self,
        conversation_context: str,
        latest_input: str,
        business_context: Optional[Dict[str, Any]] = None
    ) -> IndustryAnalysis:
        """
        Perform comprehensive industry classification using enhanced models.

        Args:
            conversation_context: Full conversation context
            latest_input: Latest user input
            business_context: Optional business context for additional signals

        Returns:
            IndustryAnalysis model with comprehensive classification
        """
        logger.info("Starting comprehensive industry classification")

        # Build enhanced prompt with V1 logic integration
        prompt = self._build_classification_prompt(
            conversation_context, latest_input, business_context
        )

        system_instruction = self._get_classification_system_instruction()

        try:
            # Use Instructor for structured output
            industry_analysis = await self.instructor_client.generate_with_model_async(
                prompt=prompt,
                model_class=IndustryAnalysis,
                temperature=0.2,
                system_instruction=system_instruction,
                max_output_tokens=8000
            )

            logger.info(f"Successfully classified industry: {industry_analysis.primary_industry}")
            return industry_analysis

        except Exception as e:
            logger.error(f"LLM industry classification failed: {e}")
            # Fallback to V1-style classification
            return await self._fallback_classification(conversation_context, latest_input)

    def _build_classification_prompt(
        self,
        conversation_context: str,
        latest_input: str,
        business_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build comprehensive classification prompt."""

        context_info = ""
        if business_context:
            context_info = f"""
            Additional Business Context:
            - Business Idea: {business_context.get('business_idea', 'Not specified')}
            - Target Customer: {business_context.get('target_customer', 'Not specified')}
            - Problem: {business_context.get('problem', 'Not specified')}
            """

        return f"""
        Analyze this customer research conversation and provide comprehensive industry classification.

        Conversation Context:
        {conversation_context}

        Latest User Input:
        {latest_input}
        {context_info}

        Provide a detailed industry analysis including:
        1. Primary industry classification from the supported list
        2. Confidence level in the classification
        3. Detailed reasoning for the classification
        4. Specific sub-categories within the industry
        5. Key market characteristics
        6. Recommended research methodologies
        7. Industry-specific considerations
        8. Regulatory or compliance considerations if applicable

        Focus on identifying industry signals from:
        - Business model descriptions
        - Target customer characteristics
        - Problem domains mentioned
        - Solution approaches discussed
        - Technical terminology used
        - Regulatory or compliance mentions
        """

    def _get_classification_system_instruction(self) -> str:
        """Get system instruction for industry classification."""

        supported_industries = ", ".join([
            "healthcare", "fintech", "saas", "ecommerce", "edtech",
            "manufacturing", "automotive", "real_estate", "ux_research",
            "product_management", "consulting", "media", "gaming", "general"
        ])

        return f"""
        You are an expert industry analyst specializing in business classification and market analysis.

        Your task is to analyze customer research conversations and provide comprehensive industry classification.

        SUPPORTED INDUSTRIES: {supported_industries}

        CLASSIFICATION GUIDELINES:
        1. Use "general" only when no specific industry can be determined
        2. Consider the business model, not just the technology used
        3. Look for industry-specific terminology and concepts
        4. Consider regulatory and compliance mentions
        5. Analyze target customer characteristics for industry signals
        6. Evaluate the problem domain and solution approach

        CONFIDENCE SCORING:
        - 0.9-1.0: Clear industry indicators with specific terminology
        - 0.7-0.8: Strong indicators with some ambiguity
        - 0.5-0.6: Moderate indicators, some uncertainty
        - 0.3-0.4: Weak indicators, high uncertainty
        - 0.1-0.2: Very weak indicators, mostly guessing

        Always provide detailed reasoning for your classification and be conservative with confidence scores.
        """

    async def _fallback_classification(
        self,
        conversation_context: str,
        latest_input: str
    ) -> IndustryAnalysis:
        """Fallback classification using V1-style keyword matching."""

        logger.info("Using fallback industry classification")

        combined_text = f"{conversation_context} {latest_input}".lower()

        # Check each industry's keywords
        best_match = "general"
        best_score = 0
        matched_keywords = []

        for industry, keywords in self.config.INDUSTRY_KEYWORDS.items():
            score = sum(1 for keyword in keywords if keyword in combined_text)
            if score > best_score:
                best_score = score
                best_match = industry
                matched_keywords = [kw for kw in keywords if kw in combined_text]

        # Calculate confidence based on keyword matches
        confidence = min(0.8, best_score * 0.1) if best_score > 0 else 0.3

        # Generate reasoning
        if matched_keywords:
            reasoning = f"Detected {len(matched_keywords)} industry keywords: {', '.join(matched_keywords[:3])}"
        else:
            reasoning = "No specific industry keywords detected, using general classification"

        # Create fallback industry analysis
        return IndustryAnalysis(
            primary_industry=best_match,
            confidence=confidence,
            reasoning=reasoning,
            sub_categories=matched_keywords[:3] if matched_keywords else [],
            market_characteristics=[],
            relevant_methodologies=[],
            industry_specific_considerations=[],
            industry_guidance="",  # Will be auto-populated by the model
            regulatory_considerations=None
        )

    def get_v1_compatible_result(self, industry_analysis: IndustryAnalysis) -> Dict[str, Any]:
        """Convert IndustryAnalysis to V1-compatible format for backward compatibility."""

        return {
            "industry": industry_analysis.primary_industry,
            "confidence": industry_analysis.confidence,
            "reasoning": industry_analysis.reasoning,
            "sub_categories": industry_analysis.sub_categories,
            "relevant_methodologies": industry_analysis.relevant_methodologies
        }

    def map_v1_to_v3_industry(self, v1_industry: str) -> str:
        """Map V1 industry names to V3 industry names."""
        return self.config.INDUSTRY_MAPPING.get(v1_industry, v1_industry)

    async def classify_industry_v1_compatible(
        self,
        conversation_context: str,
        latest_input: str
    ) -> Dict[str, Any]:
        """
        V1-compatible industry classification method.

        This method provides the same interface as the original V1 classify_industry_with_llm
        function while using the enhanced V3 implementation under the hood.
        """

        try:
            # Use enhanced classification
            industry_analysis = await self.classify_industry_comprehensive(
                conversation_context, latest_input
            )

            # Convert to V1 format
            return self.get_v1_compatible_result(industry_analysis)

        except Exception as e:
            logger.error(f"Enhanced classification failed, using V1 fallback: {e}")

            # Use original V1 fallback logic
            return await self._v1_fallback_classification(conversation_context, latest_input)

    async def _v1_fallback_classification(
        self,
        conversation_context: str,
        latest_input: str
    ) -> Dict[str, Any]:
        """Original V1 fallback classification logic."""

        combined_text = f"{conversation_context} {latest_input}".lower()

        # V1 keyword detection logic (preserved exactly)
        if any(word in combined_text for word in ['ux', 'user research', 'design', 'usability']):
            return {
                "industry": "ux_research",
                "confidence": 0.7,
                "reasoning": "Detected UX/design keywords in conversation",
                "sub_categories": ["user research", "design"],
                "relevant_methodologies": ["usability_testing", "user_interviews", "design_thinking"]
            }
        elif any(word in combined_text for word in ['product', 'feature', 'roadmap']):
            return {
                "industry": "product_management",
                "confidence": 0.7,
                "reasoning": "Detected product management keywords",
                "sub_categories": ["product development", "features"],
                "relevant_methodologies": ["customer_development", "feature_validation", "roadmap_prioritization"]
            }
        else:
            return {
                "industry": "general",
                "confidence": 0.5,
                "reasoning": "No specific industry indicators found",
                "sub_categories": [],
                "relevant_methodologies": ["customer_development", "design_thinking", "lean_startup"]
            }
