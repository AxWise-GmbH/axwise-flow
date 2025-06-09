"""
Enhanced Stakeholder Detection Service for Research API V3.

This service combines V1 stakeholder detection logic with enhanced Pydantic models
and Instructor-based structured outputs for comprehensive stakeholder analysis.
"""

import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from backend.models.industry_stakeholder_models import StakeholderAnalysis, StakeholderGroup
from backend.models.enhanced_research_models import ResearchContext
from backend.services.llm.instructor_gemini_client import EnhancedInstructorGeminiClient

logger = logging.getLogger(__name__)


@dataclass
class StakeholderDetectionConfig:
    """Configuration for stakeholder detection."""

    # Industry-specific stakeholder templates (from V1 analysis)
    INDUSTRY_STAKEHOLDER_TEMPLATES = {
        "healthcare": {
            "primary": [
                {"name": "Healthcare Providers", "description": "Doctors, nurses, and clinical staff who use the solution"},
                {"name": "Patients", "description": "End users receiving healthcare services"},
                {"name": "Healthcare Administrators", "description": "Hospital and clinic management"}
            ],
            "secondary": [
                {"name": "IT Teams", "description": "Technical implementation and support"},
                {"name": "Compliance Officers", "description": "Ensure regulatory compliance"},
                {"name": "Procurement", "description": "Handle vendor relationships and purchasing"}
            ]
        },
        "saas": {
            "primary": [
                {"name": "End Users", "description": "Daily users of the software platform"},
                {"name": "Decision Makers", "description": "Executives who approve software purchases"},
                {"name": "IT Administrators", "description": "Manage software deployment and security"}
            ],
            "secondary": [
                {"name": "Procurement Teams", "description": "Handle vendor evaluation and contracts"},
                {"name": "Security Teams", "description": "Evaluate security and compliance requirements"},
                {"name": "Finance Teams", "description": "Budget approval and cost management"}
            ]
        },
        "ecommerce": {
            "primary": [
                {"name": "Customers", "description": "End consumers making purchases"},
                {"name": "Store Owners", "description": "Business owners managing the online store"},
                {"name": "Marketing Teams", "description": "Drive customer acquisition and retention"}
            ],
            "secondary": [
                {"name": "Fulfillment Teams", "description": "Handle order processing and shipping"},
                {"name": "Customer Support", "description": "Handle customer inquiries and issues"},
                {"name": "Analytics Teams", "description": "Track performance and optimize conversion"}
            ]
        }
    }

    # Keyword-based stakeholder detection (V1 fallback)
    STAKEHOLDER_KEYWORDS = {
        "decision_makers": ["ceo", "cto", "manager", "director", "executive", "decision maker", "approver"],
        "end_users": ["user", "employee", "staff", "worker", "operator", "customer"],
        "it_teams": ["it", "technical", "developer", "engineer", "admin", "system"],
        "procurement": ["procurement", "purchasing", "vendor", "contract", "budget"],
        "compliance": ["compliance", "regulatory", "legal", "audit", "security"],
        "support": ["support", "help desk", "customer service", "training"]
    }


class EnhancedStakeholderDetectionService:
    """
    Enhanced stakeholder detection service that combines V1 logic with V3 models.

    This service provides comprehensive stakeholder analysis including:
    - LLM-based stakeholder identification with fallback
    - Multi-stakeholder complexity assessment
    - Interview sequence recommendations
    - Industry-specific stakeholder considerations
    """

    def __init__(self, instructor_client: Optional[EnhancedInstructorGeminiClient] = None):
        """Initialize the stakeholder detection service."""
        self.instructor_client = instructor_client or EnhancedInstructorGeminiClient()
        self.config = StakeholderDetectionConfig()

    async def detect_stakeholders_comprehensive(
        self,
        context: ResearchContext,
        conversation_history: List[Dict[str, str]],
        industry: Optional[str] = None
    ) -> StakeholderAnalysis:
        """
        Perform comprehensive stakeholder detection using enhanced models.

        Args:
            context: Research context with business information
            conversation_history: List of conversation messages
            industry: Optional industry classification for context

        Returns:
            StakeholderAnalysis model with comprehensive stakeholder information
        """
        logger.info("Starting comprehensive stakeholder detection")

        # Build enhanced prompt with V1 logic integration
        prompt = self._build_stakeholder_prompt(context, conversation_history, industry)

        system_instruction = self._get_stakeholder_system_instruction(industry)

        try:
            # Use Instructor for structured output
            stakeholder_analysis = await self.instructor_client.generate_with_model_async(
                prompt=prompt,
                model_class=StakeholderAnalysis,
                temperature=0.3,
                system_instruction=system_instruction,
                max_output_tokens=12000
            )

            logger.info(f"Successfully detected {len(stakeholder_analysis.primary_stakeholders)} primary stakeholders")
            return stakeholder_analysis

        except Exception as e:
            logger.error(f"LLM stakeholder detection failed: {e}")
            # Fallback to V1-style detection
            return await self._fallback_stakeholder_detection(context, industry)

    def _build_stakeholder_prompt(
        self,
        context: ResearchContext,
        conversation_history: List[Dict[str, str]],
        industry: Optional[str] = None
    ) -> str:
        """Build comprehensive stakeholder detection prompt."""

        # Build conversation text for analysis
        conversation_text = "\n".join([
            f"{msg.get('role', 'user')}: {msg.get('content', '')}"
            for msg in conversation_history[-10:]  # Last 10 messages for context
        ])

        business_idea = getattr(context, 'businessIdea', None) or "Not specified"
        target_customer = getattr(context, 'targetCustomer', None) or "Not specified"
        problem = getattr(context, 'problem', None) or "Not specified"

        industry_context = ""
        if industry and industry in self.config.INDUSTRY_STAKEHOLDER_TEMPLATES:
            templates = self.config.INDUSTRY_STAKEHOLDER_TEMPLATES[industry]
            industry_context = f"""
            Industry Context ({industry}):
            Common stakeholders in this industry include:
            Primary: {', '.join([s['name'] for s in templates['primary']])}
            Secondary: {', '.join([s['name'] for s in templates['secondary']])}
            """

        return f"""
        Analyze this customer research conversation and identify the key stakeholders who would be involved in evaluating, purchasing, or using this solution.

        Business Context:
        - Business Idea: {business_idea}
        - Target Customer: {target_customer}
        - Problem Being Solved: {problem}
        {industry_context}

        Conversation History:
        {conversation_text}

        Provide a comprehensive stakeholder analysis including:

        1. PRIMARY STAKEHOLDERS (1-4 groups):
           - Decision makers who have final approval authority
           - Primary users who will use the solution daily
           - Key influencers who significantly impact the decision

        2. SECONDARY STAKEHOLDERS (0-4 groups):
           - Supporting roles in evaluation or implementation
           - Influencers with moderate impact
           - Gatekeepers who control access or processes

        For each stakeholder group, provide:
        - Clear name and description
        - Influence level (high/medium/low)
        - Decision power type (final/influencer/user/gatekeeper)
        - Research priority (primary/secondary/optional)
        - Known pain points and success metrics

        3. ANALYSIS:
        - Multi-stakeholder complexity assessment
        - Decision-making process description
        - Recommended research approach
        - Interview sequence recommendations
        - Industry-specific considerations
        - Organizational context if applicable

        Focus on stakeholders who would actually be involved in:
        - Evaluating the solution
        - Making purchase decisions
        - Using the solution
        - Implementing or supporting the solution
        - Being affected by the solution's outcomes
        """

    def _get_stakeholder_system_instruction(self, industry: Optional[str] = None) -> str:
        """Get system instruction for stakeholder detection."""

        industry_guidance = ""
        if industry:
            industry_guidance = f"""
            INDUSTRY-SPECIFIC GUIDANCE ({industry.upper()}):
            Consider the typical organizational structures and decision-making processes in {industry}.
            Pay attention to industry-specific roles, compliance requirements, and stakeholder hierarchies.
            """

        return f"""
        You are an expert stakeholder analyst specializing in B2B decision-making processes and organizational dynamics.

        Your task is to identify and analyze stakeholders who would be involved in evaluating, purchasing, or using a business solution.

        STAKEHOLDER IDENTIFICATION PRINCIPLES:
        1. Focus on roles, not individuals
        2. Consider the entire customer journey from awareness to adoption
        3. Identify both formal decision makers and informal influencers
        4. Consider implementation and ongoing usage stakeholders
        5. Account for organizational hierarchy and approval processes

        DECISION POWER TYPES:
        - final: Has ultimate approval authority
        - influencer: Significantly influences the decision
        - user: Primary user of the solution
        - gatekeeper: Controls access or processes

        INFLUENCE LEVELS:
        - high: Can make or break the decision
        - medium: Significant input but not decisive
        - low: Limited influence on final decision

        COMPLEXITY ASSESSMENT:
        - low: 1-2 stakeholders, simple decision process
        - medium: 3-4 stakeholders, moderate complexity
        - high: 5+ stakeholders or complex approval chains
        {industry_guidance}

        Always provide detailed reasoning for stakeholder identification and be specific about their roles and responsibilities.
        """

    async def _fallback_stakeholder_detection(
        self,
        context: ResearchContext,
        industry: Optional[str] = None
    ) -> StakeholderAnalysis:
        """Fallback stakeholder detection using V1-style logic."""

        logger.info("Using fallback stakeholder detection")

        business_idea = getattr(context, 'businessIdea', None) or ""
        target_customer = getattr(context, 'targetCustomer', None) or ""
        problem = getattr(context, 'problem', None) or ""

        all_text = f"{business_idea} {target_customer} {problem}".lower()

        # Use industry templates if available
        if industry and industry in self.config.INDUSTRY_STAKEHOLDER_TEMPLATES:
            templates = self.config.INDUSTRY_STAKEHOLDER_TEMPLATES[industry]

            primary_stakeholders = [
                StakeholderGroup(
                    name=s["name"],
                    description=s["description"],
                    influence_level="high",
                    decision_power="final" if "decision" in s["name"].lower() else "user",
                    research_priority="primary"
                )
                for s in templates["primary"][:2]  # Limit to 2 primary
            ]

            secondary_stakeholders = [
                StakeholderGroup(
                    name=s["name"],
                    description=s["description"],
                    influence_level="medium",
                    decision_power="influencer",
                    research_priority="secondary"
                )
                for s in templates["secondary"][:2]  # Limit to 2 secondary
            ]

        else:
            # Generic fallback based on keywords
            primary_stakeholders = [
                StakeholderGroup(
                    name="Decision Makers",
                    description="Executives and managers who approve purchases",
                    influence_level="high",
                    decision_power="final",
                    research_priority="primary"
                ),
                StakeholderGroup(
                    name="End Users",
                    description="People who will use the solution daily",
                    influence_level="medium",
                    decision_power="user",
                    research_priority="primary"
                )
            ]

            secondary_stakeholders = [
                StakeholderGroup(
                    name="IT Teams",
                    description="Technical implementation and support",
                    influence_level="medium",
                    decision_power="gatekeeper",
                    research_priority="secondary"
                )
            ]

        return StakeholderAnalysis(
            primary_stakeholders=primary_stakeholders,
            secondary_stakeholders=secondary_stakeholders,
            multi_stakeholder_complexity="medium",
            decision_making_process="Hierarchical approval with user input",
            recommended_approach="Start with decision makers, then validate with users",
            interview_sequence=[s.name for s in primary_stakeholders + secondary_stakeholders],
            industry_context=f"Standard {industry or 'business'} stakeholder structure",
            organizational_context="Typical organizational hierarchy",
            detection_confidence=0.6,
            reasoning="Fallback detection based on industry templates and keywords"
        )

    def get_v1_compatible_result(self, stakeholder_analysis: StakeholderAnalysis) -> Dict[str, Any]:
        """Convert StakeholderAnalysis to V1-compatible format for backward compatibility."""

        return {
            "primary": [
                {
                    "name": s.name,
                    "description": s.description
                }
                for s in stakeholder_analysis.primary_stakeholders
            ],
            "secondary": [
                {
                    "name": s.name,
                    "description": s.description
                }
                for s in stakeholder_analysis.secondary_stakeholders
            ],
            "industry": "general",  # V1 format
            "reasoning": stakeholder_analysis.reasoning
        }

    async def detect_stakeholders_v1_compatible(
        self,
        context: ResearchContext,
        conversation_history: List[Dict[str, str]],
        industry: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        V1-compatible stakeholder detection method.

        This method provides the same interface as the original V1 detect_stakeholders_with_llm
        function while using the enhanced V3 implementation under the hood.
        """

        try:
            # Use enhanced detection
            stakeholder_analysis = await self.detect_stakeholders_comprehensive(
                context, conversation_history, industry
            )

            # Convert to V1 format
            return self.get_v1_compatible_result(stakeholder_analysis)

        except Exception as e:
            logger.error(f"Enhanced stakeholder detection failed, using V1 fallback: {e}")

            # Use original V1 fallback logic
            return self._v1_fallback_detection(context)

    def _v1_fallback_detection(self, context: ResearchContext) -> Dict[str, Any]:
        """Original V1 fallback detection logic (preserved exactly)."""

        business_idea = getattr(context, 'businessIdea', None) or ""
        target_customer = getattr(context, 'targetCustomer', None) or ""
        problem = getattr(context, 'problem', None) or ""

        all_text = f"{business_idea} {target_customer} {problem}".lower()

        # V1 keyword detection logic (preserved exactly)
        if any(word in all_text for word in ['enterprise', 'company', 'organization', 'business']):
            return {
                "primary": [
                    {"name": "Decision Makers", "description": "Executives who approve purchases"},
                    {"name": "End Users", "description": "Employees who use the solution"}
                ],
                "secondary": [
                    {"name": "IT Teams", "description": "Technical implementation support"},
                    {"name": "Procurement", "description": "Handle vendor relationships"}
                ],
                "industry": "general",
                "reasoning": "Detected enterprise/business context"
            }
        else:
            return {
                "primary": [
                    {"name": "Primary Users", "description": "Main users of the solution"},
                    {"name": "Decision Makers", "description": "People who choose the solution"}
                ],
                "secondary": [],
                "industry": "general",
                "reasoning": "Generic stakeholder structure"
            }
