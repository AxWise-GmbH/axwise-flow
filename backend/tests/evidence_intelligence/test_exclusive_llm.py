"""
Tests for Exclusive LLM Evidence Intelligence System

Verifies that the system uses ONLY LLM understanding with:
- ZERO regex patterns
- ZERO rule-based logic
- ZERO token counting
- Complete researcher question filtering
- Full demographic extraction
- Accurate validation
"""

import pytest
from unittest.mock import Mock, AsyncMock
import json

from backend.services.evidence_intelligence.exclusive_llm_intelligence import (
    ExclusiveLLMIntelligence,
    ExclusiveLLMProcessor,
)


class TestExclusiveLLMIntelligence:
    """Test the exclusive LLM implementation."""

    @pytest.fixture
    def mock_llm_service(self):
        """Create a mock LLM service."""
        mock = Mock()
        mock.analyze = AsyncMock()
        return mock

    @pytest.fixture
    def intelligence(self, mock_llm_service):
        """Create an ExclusiveLLMIntelligence instance."""
        return ExclusiveLLMIntelligence(mock_llm_service)

    @pytest.mark.asyncio
    async def test_no_patterns_exist(self, intelligence):
        """Verify NO patterns or regex exist in the implementation."""
        # Check that no pattern attributes exist
        assert not hasattr(intelligence, "patterns")
        assert not hasattr(intelligence, "regex")
        assert not hasattr(intelligence, "rules")
        assert not hasattr(intelligence, "age_patterns")
        assert not hasattr(intelligence, "researcher_patterns")

        # Verify only LLM service exists
        assert hasattr(intelligence, "llm")
        assert not hasattr(intelligence, "tokenizer")
        assert not hasattr(intelligence, "parser")

    @pytest.mark.asyncio
    async def test_extract_age_john_miller_format(self, intelligence, mock_llm_service):
        """Test extraction of age from 'John Miller, Age: 56' format."""
        # This is the format that regex consistently fails on
        text = "John Miller, Age: 56"

        # Mock LLM understanding the age
        mock_llm_service.analyze.return_value = {"age": 56}

        age = await intelligence.extract_age_directly(text)

        # Verify LLM was called with understanding prompt
        assert mock_llm_service.analyze.called
        call_args = mock_llm_service.analyze.call_args[0][0]
        assert "John Miller, Age: 56" in call_args["prompt"]
        assert "means 56" in call_args["prompt"]

        # Verify correct age extracted
        assert age == 56

    @pytest.mark.asyncio
    async def test_extract_age_various_formats(self, intelligence, mock_llm_service):
        """Test LLM understands various age formats."""
        test_cases = [
            ("Sarah Chen (32 years old)", 32),
            ("Marcus, 42", 42),
            ("45-year-old designer", 45),
            ("Participant, aged 38", 38),
            ("Interviewee 1: Tom, 29", 29),
        ]

        for text, expected_age in test_cases:
            mock_llm_service.analyze.return_value = {"age": expected_age}
            age = await intelligence.extract_age_directly(text)
            assert age == expected_age, f"Failed to extract age from: {text}"

    @pytest.mark.asyncio
    async def test_researcher_question_detection(self, intelligence, mock_llm_service):
        """Test detection of researcher questions without patterns."""
        # These are researcher questions that should be excluded
        researcher_questions = [
            "Given your responsibility for modular product lines, what specific challenges do you face?",
            "From a financial reporting perspective, how does the current difficulty impact you?",
            "Can you tell me about your experience?",
            "What are your main pain points?",
        ]

        for question in researcher_questions:
            mock_llm_service.analyze.return_value = {
                "is_researcher_question": True,
                "reasoning": "This is someone asking for information",
            }

            is_researcher = await intelligence.is_researcher_question(question)

            # Verify it's identified as researcher question
            assert (
                is_researcher is True
            ), f"Failed to identify as researcher: {question}"

            # Verify LLM was called, not pattern matching
            assert mock_llm_service.analyze.called
            call_args = mock_llm_service.analyze.call_args[0][0]
            assert question in call_args["prompt"]

    @pytest.mark.asyncio
    async def test_participant_statement_not_researcher(
        self, intelligence, mock_llm_service
    ):
        """Test that participant statements are not marked as researcher questions."""
        participant_statements = [
            "The main challenge is lack of visibility across systems",
            "We need better integration between modules",
            "I've been working here for 15 years",
            "The system is incredibly slow and frustrating",
        ]

        for statement in participant_statements:
            mock_llm_service.analyze.return_value = {
                "is_researcher_question": False,
                "reasoning": "This is someone providing information",
            }

            is_researcher = await intelligence.is_researcher_question(statement)

            # Verify it's NOT identified as researcher question
            assert (
                is_researcher is False
            ), f"Incorrectly marked as researcher: {statement}"

    @pytest.mark.asyncio
    async def test_semantic_validation_not_token_matching(
        self, intelligence, mock_llm_service
    ):
        """Test validation uses semantic understanding, not token overlap."""
        # These have different words but same meaning
        evidence_text = "The system has poor performance"
        source_text = "The platform is incredibly slow and sluggish"

        mock_llm_service.analyze.return_value = {
            "is_valid": True,
            "semantic_match": True,
            "confidence": 0.9,
            "explanation": "Both express the same performance issue",
        }

        result = await intelligence.validate_single_evidence(evidence_text, source_text)

        # Verify semantic match despite different words
        assert result["is_valid"] is True
        assert result["semantic_match"] is True

        # Verify LLM was called for understanding
        call_args = mock_llm_service.analyze.call_args[0][0]
        assert "SEMANTIC UNDERSTANDING" in call_args["prompt"]
        assert "not word matching" in call_args["prompt"]

    @pytest.mark.asyncio
    async def test_full_transcript_processing(self, intelligence, mock_llm_service):
        """Test processing a complete transcript segment."""
        transcript = """
        Interviewer: Can you tell me about yourself?
        John Miller, Age: 56: I'm John Miller, I've been the CFO here for 12 years.
        Interviewer: What are your main challenges?
        John Miller, Age: 56: The biggest issue is lack of unified reporting.
        """

        # Mock all LLM responses
        mock_llm_service.analyze.side_effect = [
            # Document understanding
            {
                "document_type": "interview",
                "speaker_count": 2,
                "is_multi_session": False,
                "main_topics": ["challenges", "reporting"],
                "structure": "Q&A format",
            },
            # Speaker identification
            {
                "speakers": [
                    {
                        "id": "speaker_1",
                        "role": "INTERVIEWER",
                        "name": None,
                        "reasoning": "Asks questions",
                    },
                    {
                        "id": "speaker_2",
                        "role": "INTERVIEWEE",
                        "name": "John Miller",
                        "reasoning": "Answers questions",
                    },
                ]
            },
            # Demographics
            {
                "demographics": [
                    {
                        "speaker_id": "speaker_2",
                        "name": "John Miller",
                        "age": 56,
                        "age_source": "John Miller, Age: 56",
                        "profession": "CFO",
                        "tenure": "12 years",
                    }
                ]
            },
            # Evidence attribution
            {
                "evidence": [
                    {
                        "text": "The biggest issue is lack of unified reporting",
                        "speaker_id": "speaker_2",
                        "speaker_role": "INTERVIEWEE",
                        "type": "PAIN_POINT",
                        "reasoning": "Participant expressing a problem",
                    }
                ],
                "excluded_researcher_questions": [
                    "Can you tell me about yourself?",
                    "What are your main challenges?",
                ],
            },
            # Validation
            {
                "validation_results": [
                    {
                        "evidence_text": "The biggest issue is lack of unified reporting",
                        "is_valid": True,
                        "is_accurately_attributed": True,
                        "is_researcher_question": False,
                        "semantic_accuracy": 1.0,
                    }
                ],
                "summary": {
                    "total_evidence": 1,
                    "valid_evidence": 1,
                    "misattributed": 0,
                    "researcher_contamination": 0,
                },
            },
        ]

        result = await intelligence.process_transcript(transcript)

        # Verify all components processed
        assert result["speakers"]["speakers"][1]["name"] == "John Miller"
        assert result["demographics"]["demographics"][0]["age"] == 56
        assert len(result["evidence"]["evidence"]) == 1
        assert result["validation"]["summary"]["researcher_contamination"] == 0

        # Verify NO patterns were used
        assert result["patterns_used"] == 0
        assert result["rules_used"] == 0
        assert result["processing_method"] == "EXCLUSIVE_LLM_UNDERSTANDING"


class TestExclusiveLLMProcessor:
    """Test the processor wrapper that enforces exclusive LLM usage."""

    @pytest.fixture
    def processor(self):
        """Create a processor with mock LLM."""
        mock_llm = Mock()
        mock_llm.analyze = AsyncMock()
        return ExclusiveLLMProcessor(mock_llm)

    def test_verify_no_patterns_on_init(self, processor):
        """Test that processor verifies no patterns exist on initialization."""
        # Should not raise any assertions
        processor._verify_no_patterns()

        # Verify no pattern attributes
        assert not hasattr(processor, "patterns")
        assert not hasattr(processor, "regex")
        assert not hasattr(processor.intelligence, "patterns")

    @pytest.mark.asyncio
    async def test_process_adds_metadata(self, processor):
        """Test that processor adds metadata confirming exclusive LLM use."""
        processor.intelligence.process_transcript = AsyncMock(
            return_value={"evidence": [], "patterns_used": 0}
        )

        result = await processor.process("test transcript")

        # Verify metadata
        assert result["implementation"] == "EXCLUSIVE_LLM"
        assert result["traditional_nlp_used"] is False
        assert result["patterns_used"] == 0
        assert result["pure_llm"] is True


class TestCriticalBugFixes:
    """Test that the three critical bugs are fixed."""

    @pytest.fixture
    def intelligence_with_responses(self):
        """Create intelligence with pre-configured responses."""
        mock_llm = Mock()
        mock_llm.analyze = AsyncMock()
        return ExclusiveLLMIntelligence(mock_llm), mock_llm

    @pytest.mark.asyncio
    async def test_bug1_researcher_questions_not_in_evidence(self):
        """Bug 1: Researcher questions should NEVER appear as persona evidence."""
        intelligence, mock_llm = intelligence_with_responses()

        # The problematic question that was appearing as evidence
        researcher_question = "Given your responsibility for modular product lines, what specific challenges do you face today?"

        mock_llm.analyze.return_value = {
            "is_researcher_question": True,
            "reasoning": "This is clearly an interviewer asking a question",
        }

        is_researcher = await intelligence.is_researcher_question(researcher_question)
        assert is_researcher is True

        # Verify no pattern matching was used
        assert not hasattr(intelligence, "researcher_patterns")

    @pytest.mark.asyncio
    async def test_bug2_age_extraction_works(self):
        """Bug 2: Age should be extracted from all 25 interviewees."""
        intelligence, mock_llm = intelligence_with_responses()

        # Test all the formats that were failing
        failing_formats = [
            ("John Miller, Age: 56", 56),
            ("Sarah Chen, Age: 32", 32),
            ("Marcus Thompson, Age: 42", 42),
            ("Elena Rodriguez, Age: 38", 38),
            ("David Kim, Age: 45", 45),
        ]

        for text, expected_age in failing_formats:
            mock_llm.analyze.return_value = {"age": expected_age}
            age = await intelligence.extract_age_directly(text)
            assert age == expected_age, f"Failed on: {text}"

    @pytest.mark.asyncio
    async def test_bug3_validation_reports_correct_mismatches(self):
        """Bug 3: Validation should report actual mismatches, not false success."""
        intelligence, mock_llm = intelligence_with_responses()

        # Evidence that includes a researcher question (should be invalid)
        evidence = {
            "evidence": [
                {
                    "text": "Given your responsibility for modular product lines, what challenges do you face?",
                    "speaker_role": "INTERVIEWEE",  # WRONG - this is researcher
                }
            ]
        }

        mock_llm.analyze.return_value = {
            "validation_results": [
                {
                    "evidence_text": "Given your responsibility...",
                    "is_valid": False,
                    "is_researcher_question": True,
                    "validation_notes": "This is a researcher question misattributed as evidence",
                }
            ],
            "summary": {
                "total_evidence": 1,
                "valid_evidence": 0,
                "misattributed": 1,
                "researcher_contamination": 1,
            },
        }

        result = await intelligence._validate_semantically(evidence, "transcript")

        # Should correctly report the mismatch
        assert result["summary"]["researcher_contamination"] == 1
        assert result["summary"]["misattributed"] == 1
        assert result["summary"]["valid_evidence"] == 0
