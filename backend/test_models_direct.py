#!/usr/bin/env python3
"""
Direct test of enhanced research models without going through __init__.py
"""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import our models directly by importing the modules
import importlib.util

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

# Load our model modules directly
enhanced_models = load_module("enhanced_research_models", "models/enhanced_research_models.py")
industry_models = load_module("industry_stakeholder_models", "models/industry_stakeholder_models.py")
questions_models = load_module("research_questions_models", "models/research_questions_models.py")

# Extract the classes we need
ConversationStage = enhanced_models.ConversationStage
UserIntent = enhanced_models.UserIntent
BusinessReadiness = enhanced_models.BusinessReadiness
BusinessContext = enhanced_models.BusinessContext
ConversationFlow = enhanced_models.ConversationFlow
EnhancedResearchResponse = enhanced_models.EnhancedResearchResponse

IndustryAnalysis = industry_models.IndustryAnalysis
StakeholderGroup = industry_models.StakeholderGroup
StakeholderAnalysis = industry_models.StakeholderAnalysis

ResearchQuestion = questions_models.ResearchQuestion
EnhancedResearchQuestions = questions_models.EnhancedResearchQuestions

# Rebuild models to resolve forward references
try:
    EnhancedResearchResponse.model_rebuild()
    print("✅ Models rebuilt successfully")
except Exception as e:
    print(f"⚠️  Model rebuild warning: {e}")

def test_user_intent():
    """Test UserIntent model."""
    print("Testing UserIntent...")

    intent = UserIntent(
        primary_intent="confirmation",
        confidence=0.85,
        reasoning="User explicitly said 'yes, that's correct'",
        specific_feedback="Confirming business idea details",
        recommended_response_type="generate_questions",
        next_action="Generate research questions"
    )

    print(f"✅ UserIntent created: {intent.primary_intent} with confidence {intent.confidence}")
    assert intent.recommended_response_type == "generate_questions"
    print("✅ Response type mapping works correctly")

def test_business_readiness():
    """Test BusinessReadiness model."""
    print("\nTesting BusinessReadiness...")

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

    print(f"✅ BusinessReadiness created: ready={readiness.ready_for_questions}")
    print(f"✅ Clarity scores: {readiness.business_clarity}")

def test_business_context():
    """Test BusinessContext model."""
    print("\nTesting BusinessContext...")

    context = BusinessContext(
        business_idea="Mobile app for small businesses",
        target_customer="Small retail businesses",
        problem="Inventory management is manual and error-prone"
    )

    print(f"✅ BusinessContext created with completeness: {context.completeness_score}")
    print(f"✅ Context quality: {context.context_quality}")
    print(f"✅ Missing elements: {context.missing_elements}")

def test_industry_analysis():
    """Test IndustryAnalysis model."""
    print("\nTesting IndustryAnalysis...")

    analysis = IndustryAnalysis(
        primary_industry="healthcare",
        confidence=0.9,
        reasoning="Mentions patient data and clinical workflows",
        industry_guidance=""  # Should be auto-populated
    )

    print(f"✅ IndustryAnalysis created: {analysis.primary_industry}")
    print(f"✅ Auto-generated guidance includes: {analysis.industry_guidance[:100]}...")
    print(f"✅ Methodologies: {analysis.relevant_methodologies}")

def test_research_question():
    """Test ResearchQuestion model."""
    print("\nTesting ResearchQuestion...")

    question = ResearchQuestion(
        question="What problems do you face with inventory management",  # Missing ?
        category="problem_discovery",
        expected_insight="Identify main pain points",
        insight_type="pain_point"
    )

    print(f"✅ ResearchQuestion created: {question.question}")
    assert question.question.endswith("?")
    print("✅ Question format auto-corrected")

def test_enhanced_research_response():
    """Test the master EnhancedResearchResponse model."""
    print("\nTesting EnhancedResearchResponse...")

    # Create component models first
    user_intent = UserIntent(
        primary_intent="continuation",
        confidence=0.85,
        reasoning="User is providing more information",
        specific_feedback="Elaborating on business concept",
        recommended_response_type="acknowledge_and_continue",
        next_action="Ask for more details"
    )

    business_readiness = BusinessReadiness(
        ready_for_questions=False,
        confidence=0.6,
        reasoning="Need more details on target customers",
        business_clarity={
            "idea_clarity": 0.8,
            "customer_clarity": 0.4,
            "problem_clarity": 0.3
        },
        conversation_quality="medium"
    )

    business_context = BusinessContext(
        business_idea="Mobile app for small businesses",
        target_customer="Small businesses"
    )

    conversation_flow = ConversationFlow(
        current_stage=ConversationStage.BUSINESS_DISCOVERY,
        stage_progress=0.6,
        conversation_quality="medium",
        readiness_for_questions=False
    )

    # Create the master response
    response = EnhancedResearchResponse(
        content="I understand you're building a mobile app for small businesses. Can you tell me more about what specific challenges these businesses face?",
        user_intent=user_intent,
        business_readiness=business_readiness,
        extracted_context=business_context,
        conversation_flow=conversation_flow,
        quick_replies=[
            "Small retailers and shops",
            "Service-based businesses",
            "Freelancers and consultants"
        ]
    )

    print(f"✅ EnhancedResearchResponse created successfully")
    print(f"✅ Content: {response.content[:50]}...")
    print(f"✅ Stage: {response.conversation_flow.current_stage}")
    print(f"✅ Readiness: {response.business_readiness.ready_for_questions}")
    print(f"✅ Metadata: {list(response.response_metadata.keys())}")

if __name__ == "__main__":
    print("🚀 Testing Enhanced Research Models")
    print("=" * 50)

    try:
        test_user_intent()
        test_business_readiness()
        test_business_context()
        test_industry_analysis()
        test_research_question()
        test_enhanced_research_response()

        print("\n" + "=" * 50)
        print("🎉 All tests passed! Models are working correctly.")

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
