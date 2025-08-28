#!/usr/bin/env python3
"""
Test script to verify questionnaire parsing functionality.
"""

import asyncio
import sys
import os

# Add the project root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))


async def test_questionnaire_parsing():
    """Test the questionnaire parsing functionality."""

    try:
        # Import only what we need for parsing
        from backend.api.research.simulation_bridge.models import (
            SimulationConfig,
            SimulationDepth,
            ResponseStyle,
            BusinessContext,
            QuestionsData,
            Stakeholder,
            SimulationRequest,
        )
        from pydantic_ai import Agent
        from pydantic_ai.models.gemini import GeminiModel
        from pydantic import BaseModel
        from typing import List
        import os

        print("🧪 Testing Questionnaire Parsing")
        print("=" * 40)

        # Read the questionnaire file
        questionnaire_file = "research-questionnaire-2025-07-03 (5).txt"

        if not os.path.exists(questionnaire_file):
            print(f"❌ Questionnaire file not found: {questionnaire_file}")
            return

        with open(questionnaire_file, "r", encoding="utf-8") as f:
            content = f.read()

        print(f"📄 Loaded questionnaire file: {len(content)} characters")

        # Create config
        config = SimulationConfig(
            depth=SimulationDepth.DETAILED,
            people_per_stakeholder=5,
            response_style=ResponseStyle.REALISTIC,
            include_insights=True,
            temperature=0.7,
        )

        # Test parsing directly with PydanticAI
        print("\n🤖 Parsing questionnaire with PydanticAI...")

        # Check for API key
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("❌ GEMINI_API_KEY environment variable is required")
            return

        class ParsedQuestionnaire(BaseModel):
            business_idea: str
            target_customer: str
            problem: str
            questions: List[str]

        # Create PydanticAI agent for parsing
        model = GeminiModel("gemini-2.5-flash")
        parser_agent = Agent(
            model=model,
            result_type=ParsedQuestionnaire,
            system_prompt="""You are an expert at parsing customer research questionnaires.
            Extract the business context and all interview questions from the provided content.
            Clean up questions by removing numbering and formatting.
            Ensure business_idea is never empty - infer from context if needed.""",
        )

        prompt = f"""
        Parse this questionnaire file and extract:
        1. Business idea (main business concept)
        2. Target customer (who the business serves)
        3. Problem (what problem the business solves)
        4. All interview questions (clean, no numbering)

        Content:
        {content}
        """

        result = await parser_agent.run(prompt)
        parsed = result.output

        # Create structured data
        stakeholder = Stakeholder(
            id="primary_stakeholder",
            name=parsed.target_customer,
            description=f"Primary stakeholder for {parsed.business_idea}",
            questions=parsed.questions,
        )

        questions_data = QuestionsData(
            stakeholders={"primary": [stakeholder], "secondary": []},
            timeEstimate={"totalQuestions": len(parsed.questions)},
        )

        business_context = BusinessContext(
            business_idea=parsed.business_idea,
            target_customer=parsed.target_customer,
            problem=parsed.problem,
            industry="general",
        )

        parsed_request = SimulationRequest(
            questions_data=questions_data,
            business_context=business_context,
            config=config,
        )

        print("✅ Parsing successful!")
        print(f"📊 Business Context:")
        print(f"   - Business Idea: {parsed_request.business_context.business_idea}")
        print(
            f"   - Target Customer: {parsed_request.business_context.target_customer}"
        )
        print(f"   - Problem: {parsed_request.business_context.problem}")

        print(f"\n📋 Questions Data:")
        primary_stakeholders = parsed_request.questions_data.stakeholders.get(
            "primary", []
        )
        secondary_stakeholders = parsed_request.questions_data.stakeholders.get(
            "secondary", []
        )

        print(f"   - Primary Stakeholders: {len(primary_stakeholders)}")
        for i, stakeholder in enumerate(primary_stakeholders):
            print(
                f"     {i+1}. {stakeholder.name}: {len(stakeholder.questions)} questions"
            )

        print(f"   - Secondary Stakeholders: {len(secondary_stakeholders)}")
        for i, stakeholder in enumerate(secondary_stakeholders):
            print(
                f"     {i+1}. {stakeholder.name}: {len(stakeholder.questions)} questions"
            )

        total_questions = sum(
            len(s.questions) for s in primary_stakeholders + secondary_stakeholders
        )
        print(f"   - Total Questions: {total_questions}")

        print("\n🎯 Sample Questions:")
        if primary_stakeholders and primary_stakeholders[0].questions:
            for i, question in enumerate(primary_stakeholders[0].questions[:3]):
                print(f"   {i+1}. {question}")
            if len(primary_stakeholders[0].questions) > 3:
                print(f"   ... and {len(primary_stakeholders[0].questions) - 3} more")

        print("\n✅ Questionnaire parsing test completed successfully!")

    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_questionnaire_parsing())
