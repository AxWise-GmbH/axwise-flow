"""
Test script for the conversational analysis system.
Demonstrates how to use the conversational analysis agent and file processor.
"""

import asyncio
import os
import json
from datetime import datetime
from pydantic_ai.models.gemini import GeminiModel

from services.conversational_analysis_agent import ConversationalAnalysisAgent
from services.file_processor import SimulationFileProcessor, FileProcessingRequest


async def test_conversational_analysis():
    """Test the conversational analysis system with sample data"""

    print("🚀 Testing Conversational Analysis System")
    print("=" * 50)

    # Initialize components
    gemini_model = GeminiModel(
        model="gemini-2.0-flash-exp", api_key=os.getenv("GEMINI_API_KEY")
    )

    analysis_agent = ConversationalAnalysisAgent(gemini_model)
    file_processor = SimulationFileProcessor(gemini_model)

    # Sample simulation data (smaller for testing)
    sample_simulation_text = """
    --- Interview with Anja, Legal Document Analyst ---

    Researcher: What are your main concerns about implementing AI in document analysis?

    Anja: In the legal field, there's zero room for error. My absolute top concern is accuracy. We handle everything from complex commercial contracts to litigation discovery documents, and the biggest fear, always, is missing something critical – a specific clause, a deadline, a liability detail. Data security and privacy are paramount for any new AI solution, especially concerning GDPR compliance and preventing data leakage.

    Researcher: How much time do you currently spend on manual document processing?

    Anja: Easily, 60 to 70 percent of my week is dedicated to just reviewing, extracting, or analyzing these documents. It's incredibly repetitive. The biggest pain point, by far, is the sheer tedium and the time it consumes. It's time that isn't directly billable, which is the frustrating part.

    Researcher: What would you prefer to focus on instead?

    Anja: My first priority would be to dive deeper into the actual legal strategy of cases rather than getting bogged down in document processing. I'd want to shift my role from a document processor to a true legal strategist and advisor. I'd also spend more time directly with clients, understanding their needs and providing strategic guidance.

    --- Interview with Max, Audit Specialist ---

    Researcher: What challenges do you face in your current audit work?

    Max: I'd say easily 60 to 70 percent of my time is just spent sifting through documents, cross-referencing data, and ensuring compliance. Definitely tedium, first and foremost. The biggest bottleneck is cross-referencing – making sure that financial data aligns across multiple documents and systems.

    Researcher: What are your concerns about AI implementation?

    Max: Accuracy is non-negotiable. In auditing, even small discrepancies can have massive implications. I need to be confident that any AI solution can maintain the same level of precision that I would achieve manually, if not better.

    --- Interview with Senior Partner ---

    Researcher: What factors drive your technology adoption decisions?

    Senior Partner: They're the ones who control the budget and set the strategic direction. He's very focused on efficiency and cost-effectiveness. Mr. Schmidt's main priority would be to see a clear ROI – how this technology will either save money, generate more revenue, or improve client satisfaction.
    """

    print(f"📄 Sample data size: {len(sample_simulation_text)} characters")
    print()

    # Test 1: Direct text processing
    print("🧪 Test 1: Direct Text Processing")
    print("-" * 30)

    start_time = datetime.utcnow()

    try:
        processing_result = await file_processor.process_simulation_text_direct(
            simulation_text=sample_simulation_text,
            simulation_id="test_simulation_001",
            user_id="test_user_123",
            file_name="test_simulation.txt",
            save_to_database=False,  # Skip database for testing
        )

        processing_time = (datetime.utcnow() - start_time).total_seconds()

        if processing_result.success:
            print(f"✅ Processing successful!")
            print(f"⏱️  Processing time: {processing_time:.2f} seconds")
            print(f"📊 Analysis ID: {processing_result.analysis_id}")
            print(f"📈 File size: {processing_result.file_size_bytes} bytes")

            # Display key results
            if processing_result.analysis_result:
                result = processing_result.analysis_result
                print(f"🎯 Themes found: {len(result.themes)}")
                print(f"🔍 Patterns detected: {len(result.patterns)}")
                print(
                    f"👥 Stakeholders analyzed: {len(result.stakeholder_intelligence.detected_stakeholders) if result.stakeholder_intelligence else 0}"
                )

                # Show sample themes
                if result.themes:
                    print("\n📋 Sample Themes:")
                    for i, theme in enumerate(result.themes[:3]):  # Show first 3 themes
                        theme_data = theme if isinstance(theme, dict) else theme.dict()
                        print(f"  {i+1}. {theme_data.get('name', 'Unknown Theme')}")
                        print(f"     Frequency: {theme_data.get('frequency', 0):.2f}")
                        print(f"     Sentiment: {theme_data.get('sentiment', 0):.2f}")

                # Show sample stakeholders
                if (
                    result.stakeholder_intelligence
                    and result.stakeholder_intelligence.detected_stakeholders
                ):
                    print("\n👤 Sample Stakeholders:")
                    for i, stakeholder in enumerate(
                        result.stakeholder_intelligence.detected_stakeholders[:2]
                    ):
                        stakeholder_data = (
                            stakeholder
                            if isinstance(stakeholder, dict)
                            else stakeholder.dict()
                        )
                        print(
                            f"  {i+1}. {stakeholder_data.get('stakeholder_id', 'Unknown')}"
                        )
                        print(
                            f"     Type: {stakeholder_data.get('stakeholder_type', 'Unknown')}"
                        )
                        print(
                            f"     Confidence: {stakeholder_data.get('confidence_score', 0):.2f}"
                        )

        else:
            print(f"❌ Processing failed: {processing_result.error_message}")

    except Exception as e:
        print(f"❌ Test failed with exception: {str(e)}")

    print()

    # Test 2: Performance comparison
    print("🧪 Test 2: Performance Analysis")
    print("-" * 30)

    target_time = 420  # 7 minutes in seconds
    if processing_result.success:
        efficiency_score = (
            min(target_time / processing_time, 1.0) if processing_time > 0 else 1.0
        )
        target_met = processing_time <= target_time

        print(f"🎯 Target time: {target_time} seconds (7 minutes)")
        print(f"⏱️  Actual time: {processing_time:.2f} seconds")
        print(f"✅ Target met: {'Yes' if target_met else 'No'}")
        print(f"📊 Efficiency score: {efficiency_score:.2f}")

        if target_met:
            print("🎉 Performance target achieved!")
        else:
            improvement_needed = processing_time / target_time
            print(f"⚠️  Need {improvement_needed:.1f}x improvement to meet target")

    print()

    # Test 3: JSON Schema Validation
    print("🧪 Test 3: JSON Schema Validation")
    print("-" * 30)

    if processing_result.success and processing_result.analysis_result:
        try:
            # Convert to dict and validate structure
            result_dict = processing_result.analysis_result.dict()

            required_fields = [
                "id",
                "status",
                "createdAt",
                "fileName",
                "fileSize",
                "themes",
                "patterns",
                "sentimentOverview",
                "personas",
                "insights",
            ]

            missing_fields = []
            for field in required_fields:
                if field not in result_dict:
                    missing_fields.append(field)

            if not missing_fields:
                print("✅ JSON schema validation passed!")
                print("📋 All required fields present:")
                for field in required_fields:
                    value = result_dict.get(field)
                    if isinstance(value, list):
                        print(f"  - {field}: {len(value)} items")
                    elif isinstance(value, dict):
                        print(f"  - {field}: {len(value)} keys")
                    else:
                        print(f"  - {field}: {type(value).__name__}")
            else:
                print(f"❌ Missing required fields: {missing_fields}")

        except Exception as e:
            print(f"❌ Schema validation failed: {str(e)}")

    print()
    print("🏁 Testing completed!")
    print("=" * 50)


async def test_file_processing():
    """Test file processing with a sample file"""

    print("📁 Testing File Processing")
    print("-" * 30)

    # Create a sample file for testing
    sample_file_path = "/tmp/test_simulation.txt"

    sample_content = """
    --- Interview with Legal Analyst ---
    Researcher: What are your main concerns?
    Legal Analyst: Data security and privacy are paramount for any new AI solution.

    --- Interview with IT Director ---
    Researcher: What technical considerations are important?
    IT Director: System compatibility and security are our top priorities.
    """

    try:
        # Write sample file
        with open(sample_file_path, "w", encoding="utf-8") as f:
            f.write(sample_content)

        print(f"📝 Created sample file: {sample_file_path}")

        # Initialize file processor
        gemini_model = GeminiModel(
            model="gemini-2.0-flash-exp", api_key=os.getenv("GEMINI_API_KEY")
        )
        file_processor = SimulationFileProcessor(gemini_model)

        # Create processing request
        request = FileProcessingRequest(
            file_path=sample_file_path,
            simulation_id="test_file_simulation",
            user_id="test_user_456",
            save_to_database=False,
        )

        # Process file
        result = await file_processor.process_simulation_file(request)

        if result.success:
            print(f"✅ File processing successful!")
            print(f"⏱️  Processing time: {result.processing_time_seconds:.2f} seconds")
            print(f"📊 Analysis ID: {result.analysis_id}")
        else:
            print(f"❌ File processing failed: {result.error_message}")

        # Clean up
        os.remove(sample_file_path)
        print(f"🗑️  Cleaned up sample file")

    except Exception as e:
        print(f"❌ File processing test failed: {str(e)}")
        # Clean up on error
        if os.path.exists(sample_file_path):
            os.remove(sample_file_path)


if __name__ == "__main__":
    print("🧪 Conversational Analysis System Test Suite")
    print("=" * 60)
    print()

    # Check environment
    if not os.getenv("GEMINI_API_KEY"):
        print("❌ GEMINI_API_KEY environment variable not set")
        print("Please set your Gemini API key before running tests")
        print("Example: export GEMINI_API_KEY='your_api_key_here'")
        exit(1)

    print("✅ Environment check passed")
    print()

    # Run tests
    asyncio.run(test_conversational_analysis())
    print()
    asyncio.run(test_file_processing())

    print()
    print("🎉 All tests completed!")
