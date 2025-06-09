"""
Unit tests for Enhanced Research Models.

Tests all Pydantic models for validation, field validators, and model validators.
"""

import pytest
from pydantic import ValidationError
from models.enhanced_research_models import (
    ConversationStage, UserIntent, BusinessReadiness, BusinessContext,
    ConversationFlow, EnhancedResearchResponse
)
from models.industry_stakeholder_models import (
    IndustryAnalysis, StakeholderGroup, StakeholderAnalysis
)
from models.research_questions_models import (
    ResearchQuestion, EnhancedResearchQuestions
)


class TestUserIntent:
    """Test UserIntent model validation and logic."""

    def test_valid_user_intent(self):
        """Test creating a valid UserIntent."""
        intent = UserIntent(
            primary_intent="confirmation",
            confidence=0.85,
            reasoning="User explicitly said 'yes, that's correct'",
            specific_feedback="Confirming business idea details",
            recommended_response_type="generate_questions",
            next_action="Generate research questions"
        )

        assert intent.primary_intent == "confirmation"
        assert intent.confidence == 0.85
        assert intent.emotional_tone == "neutral"  # default
        assert intent.recommended_response_type == "generate_questions"

    def test_intent_response_type_mapping(self):
        """Test automatic response type determination."""
        intent = UserIntent(
            primary_intent="rejection",
            confidence=0.9,
            reasoning="User said no",
            specific_feedback="Rejecting the summary",
            recommended_response_type="ask_clarification",  # This should be auto-set
            next_action="Ask for clarification"
        )

        assert intent.recommended_response_type == "ask_clarification"

    def test_invalid_confidence(self):
        """Test validation of confidence score."""
        with pytest.raises(ValidationError):
            UserIntent(
                primary_intent="confirmation",
                confidence=1.5,  # Invalid: > 1.0
                reasoning="Test",
                specific_feedback="Test",
                recommended_response_type="generate_questions",
                next_action="Test"
            )


class TestBusinessReadiness:
    """Test BusinessReadiness model validation and logic."""

    def test_valid_business_readiness(self):
        """Test creating valid BusinessReadiness."""
        readiness = BusinessReadiness(
            ready_for_questions=True,
            confidence=0.8,
            reasoning="All core information is present",
            business_clarity={
                "idea_clarity": 0.9,
                "customer_clarity": 0.8,
                "problem_clarity": 0.7
            },
            conversation_quality="high"
        )

        assert readiness.ready_for_questions is True
        assert readiness.business_clarity["idea_clarity"] == 0.9

    def test_clarity_score_validation(self):
        """Test business clarity score validation."""
        # Test missing required aspects
        readiness = BusinessReadiness(
            ready_for_questions=True,
            confidence=0.8,
            reasoning="Test reasoning",
            business_clarity={
                "idea_clarity": 0.9
                # Missing customer_clarity and problem_clarity
            },
            conversation_quality="high"
        )

        # Should auto-fill missing aspects with 0.0
        assert readiness.business_clarity["customer_clarity"] == 0.0
        assert readiness.business_clarity["problem_clarity"] == 0.0

    def test_readiness_override_low_clarity(self):
        """Test readiness override when clarity is too low."""
        readiness = BusinessReadiness(
            ready_for_questions=True,  # Will be overridden
            confidence=0.8,
            reasoning="Test reasoning",
            business_clarity={
                "idea_clarity": 0.5,
                "customer_clarity": 0.4,
                "problem_clarity": 0.3  # Average = 0.4 < 0.7 threshold
            },
            conversation_quality="medium"
        )

        # Should be overridden to False due to low clarity
        assert readiness.ready_for_questions is False
        assert "insufficient_clarity" in readiness.missing_elements


class TestBusinessContext:
    """Test BusinessContext model validation and completeness scoring."""

    def test_completeness_calculation(self):
        """Test completeness score calculation."""
        context = BusinessContext(
            business_idea="Mobile app for small businesses",
            target_customer="Small retail businesses",
            problem="Inventory management is manual and error-prone"
            # Missing solution_approach, market_context, business_model
        )

        # Core fields: 3/3 filled = 1.0
        # Additional fields: 0/3 filled = 0.0
        # Score = (1.0 * 0.6 + 0.0 * 0.4) / (0.6 + 0.4) = 0.6
        assert context.completeness_score == 0.6
        assert context.context_quality == "medium"
        assert len(context.missing_elements) == 0  # No core fields missing

    def test_missing_core_elements(self):
        """Test identification of missing core elements."""
        context = BusinessContext(
            business_idea="Mobile app",
            # Missing target_customer and problem
            solution_approach="Use AI to automate processes"
        )

        assert "Target Customer" in context.missing_elements
        assert "Problem" in context.missing_elements
        assert context.context_quality == "low"


class TestConversationFlow:
    """Test ConversationFlow model and stage progression."""

    def test_stage_progression(self):
        """Test next stage determination."""
        flow = ConversationFlow(
            current_stage=ConversationStage.BUSINESS_DISCOVERY,
            stage_progress=0.8,
            conversation_quality="high",
            readiness_for_questions=False
        )

        assert flow.next_stage == ConversationStage.TARGET_CUSTOMER_DISCOVERY
        assert flow.stage_completion_criteria["business_idea_clear"] is True

    def test_final_stage(self):
        """Test final stage handling."""
        flow = ConversationFlow(
            current_stage=ConversationStage.COMPLETED,
            stage_progress=1.0,
            conversation_quality="high",
            readiness_for_questions=True
        )

        assert flow.next_stage is None  # No next stage after completed


class TestIndustryAnalysis:
    """Test IndustryAnalysis model and guidance generation."""

    def test_industry_guidance_generation(self):
        """Test automatic industry guidance generation."""
        analysis = IndustryAnalysis(
            primary_industry="healthcare",
            confidence=0.9,
            reasoning="Mentions patient data and clinical workflows",
            industry_guidance=""  # Should be auto-populated
        )

        assert "patient safety" in analysis.industry_guidance.lower()
        assert "regulatory compliance" in analysis.industry_guidance.lower()
        assert "healthcare" in analysis.industry_guidance.lower()

    def test_methodology_mapping(self):
        """Test methodology recommendations by industry."""
        analysis = IndustryAnalysis(
            primary_industry="fintech",
            confidence=0.85,
            reasoning="Financial services application",
            industry_guidance="Test guidance"
        )

        assert "security_validation" in analysis.relevant_methodologies
        assert "regulatory_compliance" in analysis.relevant_methodologies


class TestStakeholderAnalysis:
    """Test StakeholderAnalysis model and complexity determination."""

    def test_complexity_determination(self):
        """Test stakeholder complexity calculation."""
        primary_stakeholders = [
            StakeholderGroup(
                name="Decision Makers",
                description="C-level executives who approve purchases",
                influence_level="high",
                decision_power="final"
            ),
            StakeholderGroup(
                name="End Users",
                description="Daily users of the system",
                influence_level="medium",
                decision_power="user"
            )
        ]

        analysis = StakeholderAnalysis(
            primary_stakeholders=primary_stakeholders,
            multi_stakeholder_complexity="medium",  # Will be auto-determined
            decision_making_process="Hierarchical approval process",
            recommended_approach="Start with decision makers, then users",
            industry_context="Enterprise software context",
            detection_confidence=0.8,
            reasoning="Clear organizational structure"
        )

        assert analysis.multi_stakeholder_complexity == "medium"  # 2 stakeholders
        assert len(analysis.interview_sequence) > 0

    def test_interview_sequence_generation(self):
        """Test automatic interview sequence generation."""
        stakeholders = [
            StakeholderGroup(
                name="Users",
                description="End users",
                influence_level="low",
                decision_power="user"
            ),
            StakeholderGroup(
                name="Executives",
                description="Decision makers",
                influence_level="high",
                decision_power="final"
            )
        ]

        analysis = StakeholderAnalysis(
            primary_stakeholders=stakeholders,
            multi_stakeholder_complexity="medium",
            decision_making_process="Test",
            recommended_approach="Test",
            industry_context="Test",
            detection_confidence=0.8,
            reasoning="Test"
        )

        # Executives should come first (higher decision power)
        assert analysis.interview_sequence[0] == "Executives"
        assert analysis.interview_sequence[1] == "Users"


class TestResearchQuestion:
    """Test ResearchQuestion model validation."""

    def test_question_format_validation(self):
        """Test question format validation and auto-correction."""
        question = ResearchQuestion(
            question="What problems do you face with inventory management",  # Missing ?
            category="problem_discovery",
            expected_insight="Identify main pain points",
            insight_type="pain_point"
        )

        assert question.question.endswith("?")

    def test_invalid_question_format(self):
        """Test rejection of invalid question formats."""
        with pytest.raises(ValidationError):
            ResearchQuestion(
                question="Yes no",  # Too short, not a proper question
                category="problem_discovery",
                expected_insight="Test",
                insight_type="pain_point"
            )


class TestEnhancedResearchQuestions:
    """Test EnhancedResearchQuestions model and calculations."""

    def test_question_calculations(self):
        """Test automatic calculations for question metadata."""
        problem_questions = [
            ResearchQuestion(
                question="What challenges do you face?",
                category="problem_discovery",
                expected_insight="Identify challenges",
                insight_type="pain_point",
                estimated_time_minutes=3
            ),
            ResearchQuestion(
                question="How do you currently solve this?",
                category="problem_discovery",
                expected_insight="Current solutions",
                insight_type="workflow",
                estimated_time_minutes=2
            )
        ]

        solution_questions = [
            ResearchQuestion(
                question="Would this solution help?",
                category="solution_validation",
                expected_insight="Solution validation",
                insight_type="validation",
                estimated_time_minutes=2
            )
        ]

        follow_up_questions = [
            ResearchQuestion(
                question="Can you elaborate?",
                category="follow_up",
                expected_insight="More details",
                insight_type="behavior",
                estimated_time_minutes=1
            )
        ]

        questions = EnhancedResearchQuestions(
            problem_discovery=problem_questions,
            solution_validation=solution_questions,
            follow_up=follow_up_questions,
            total_questions=0,  # Will be calculated
            estimated_interview_time=0,  # Will be calculated
            industry_customization="General customization",
            stakeholder_considerations="Multiple stakeholders considered",
            interview_guidance="Standard interview guidance",
            analysis_framework="Thematic analysis"
        )

        assert questions.total_questions == 4
        # Base time: 3+2+2+1 = 8 minutes, with 30% buffer = ~10 minutes
        assert questions.estimated_interview_time >= 10
        assert questions.question_quality_score > 0.0
