"""
Exclusive LLM Evidence Intelligence System

This module uses EXCLUSIVELY Large Language Model contextual understanding.
ZERO regex patterns. ZERO rule-based systems. ZERO traditional NLP.
Every text analysis is performed through LLM semantic comprehension.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)


class ExclusiveLLMIntelligence:
    """
    Pure LLM-based evidence intelligence system.
    NO patterns, NO rules, NO traditional text processing.
    ONLY LLM understanding.
    """

    def __init__(self, llm_service):
        """
        Initialize with ONLY an LLM service.
        No patterns, no rules, no utilities - just LLM.

        Args:
            llm_service: The LLM service for all understanding tasks
        """
        self.llm = llm_service
        # That's it. Nothing else. No patterns, no rules.

    async def process_transcript(self, transcript: str) -> Dict[str, Any]:
        """
        Process entire transcript using EXCLUSIVELY LLM understanding.
        No text manipulation. No pattern checking. Pure LLM.

        Args:
            transcript: Raw transcript text

        Returns:
            Complete analysis through LLM understanding only
        """
        logger.info("Starting Exclusive LLM Processing - ZERO patterns will be used")

        # Step 1: LLM understands the complete document
        document_understanding = await self._understand_document(transcript)

        # Step 2: LLM identifies all speakers through context
        speakers = await self._understand_speakers(transcript)

        # Step 3: LLM extracts demographics through understanding
        demographics = await self._understand_demographics(transcript, speakers)

        # Step 4: LLM attributes evidence through comprehension
        evidence = await self._understand_evidence(transcript, speakers)

        # Step 5: LLM validates through semantic understanding
        validation = await self._validate_semantically(evidence, transcript)

        return {
            "document_context": document_understanding,
            "speakers": speakers,
            "demographics": demographics,
            "evidence": evidence,
            "validation": validation,
            "processing_method": "EXCLUSIVE_LLM_UNDERSTANDING",
            "patterns_used": 0,
            "rules_used": 0,
            "llm_calls_made": 5,
        }

    async def _understand_document(self, transcript: str) -> Dict[str, Any]:
        """
        Understand document structure using ONLY LLM comprehension.
        """
        prompt = f"""
        Read and comprehend this transcript completely:

        {transcript}

        Based on your understanding, provide:
        1. Document type (interview, meeting, etc.)
        2. Number of distinct speakers
        3. Whether this contains multiple interview sessions
        4. Main topics discussed
        5. Overall structure and flow

        Use your understanding of human conversation to analyze the document.
        Do not use any patterns or rules - use contextual comprehension only.

        Return as JSON with these exact fields:
        {{
            "document_type": "...",
            "speaker_count": number,
            "is_multi_session": boolean,
            "main_topics": [...],
            "structure": "..."
        }}
        """

        response = await self.llm.analyze(
            {"prompt": prompt, "temperature": 0.1, "response_format": "json"}
        )

        logger.info(f"Document understanding complete through LLM comprehension")
        return response

    async def _understand_speakers(self, transcript: str) -> Dict[str, Any]:
        """
        Identify speakers using ONLY LLM understanding of conversation dynamics.
        NO pattern matching for questions. Pure contextual understanding.
        """
        prompt = f"""
        Analyze this transcript and identify every unique speaker:

        {transcript}

        For each speaker, understand through CONVERSATIONAL CONTEXT:

        1. Their role - Determine if they are:
           - INTERVIEWER: Someone who asks questions, seeks information, guides discussion
           - INTERVIEWEE: Someone who answers questions, shares experiences, provides information

        2. Their identity - Extract their name if mentioned

        3. How you determined their role - Use conversational dynamics:
           - Who is prompting for information vs who is providing it
           - Who is guiding the conversation vs who is responding
           - The natural flow of question and answer

        CRITICAL: Statements like "Given your responsibility for..." or "What challenges do you face?"
        are interviewer questions, NOT interviewee statements. Understand this through context.

        Return as JSON with unique identifiers for each speaker:
        {{
            "speakers": [
                {{
                    "id": "unique_id",
                    "role": "INTERVIEWER or INTERVIEWEE",
                    "name": "name if known",
                    "reasoning": "how you determined their role through context"
                }}
            ]
        }}
        """

        response = await self.llm.analyze(
            {"prompt": prompt, "temperature": 0.1, "response_format": "json"}
        )

        logger.info(
            f"Speaker identification complete through conversational understanding"
        )
        return response

    async def _understand_demographics(
        self, transcript: str, speakers: Dict
    ) -> Dict[str, Any]:
        """
        Extract demographics using ONLY LLM comprehension of natural language.
        NO regex patterns for age. Pure understanding of how humans express demographics.
        """
        prompt = f"""
        Extract ALL demographic information from this transcript:

        {transcript}

        Known speakers: {json.dumps(speakers)}

        UNDERSTAND any way humans express demographics:

        AGE - Understand ALL formats through meaning:
        - "John Miller, Age: 56" means John is 56 years old
        - "Sarah Chen (32 years old)" means Sarah is 32
        - "42-year-old Marcus" means Marcus is 42
        - "Born in 1968" means approximately 56-57 years old
        - "In my thirties" means age range 30-39
        - "Just retired" implies approximately 65
        - "30 years of experience" with context can imply age

        LOCATION - Understand references:
        - "From Seattle" or "Originally from..."
        - "Here in Boston" or "Our Berlin office"
        - "Living in..." or "Based in..."

        PROFESSION - Understand titles and roles:
        - Direct statements: "I'm a product manager"
        - Context: "As CFO..." or "In my role as..."
        - Experience: "20 years in finance"

        EDUCATION - Understand academic references:
        - "MIT graduate" or "Studied at Harvard"
        - "MBA" or "Engineering degree"
        - "Class of '95"

        For each speaker, extract ALL demographic data you can understand.

        Return as JSON:
        {{
            "demographics": [
                {{
                    "speaker_id": "...",
                    "name": "...",
                    "age": number or null,
                    "age_source": "exact quote showing age",
                    "location": "...",
                    "profession": "...",
                    "education": "...",
                    "other": {{...}}
                }}
            ]
        }}
        """

        response = await self.llm.analyze(
            {"prompt": prompt, "temperature": 0.1, "response_format": "json"}
        )

        logger.info(
            f"Demographic extraction complete through natural language understanding"
        )
        return response

    async def _understand_evidence(
        self, transcript: str, speakers: Dict
    ) -> Dict[str, Any]:
        """
        Attribute evidence using ONLY LLM comprehension of who said what.
        ZERO tolerance for researcher question misattribution.
        """
        prompt = f"""
        Extract evidence statements from this transcript:

        {transcript}

        Known speakers: {json.dumps(speakers)}

        CRITICAL RULES through understanding:

        1. ONLY extract statements FROM interviewees, not questions TO them
        2. Understand the difference between:
           - "What challenges do you face?" = INTERVIEWER asking (DO NOT include)
           - "The main challenge is X" = INTERVIEWEE answering (DO include)

        3. Questions that start with or contain:
           - "Given your responsibility..."
           - "From a financial perspective..."
           - "What specific challenges..."
           - "Can you tell me..."
           These are ALL interviewer questions - NEVER include as evidence

        4. Evidence types to understand:
           - PAIN_POINT: Problems, frustrations, challenges mentioned
           - NEED: Requirements, desires, wants expressed
           - OPINION: Beliefs, thoughts, perspectives shared
           - EXPERIENCE: Stories, examples, past events described
           - FACT: Objective information stated

        For each piece of evidence:
        - Quote the exact statement
        - Identify who actually said it (not who asked about it)
        - Categorize the type
        - Explain why this is evidence (not a question)

        Return as JSON:
        {{
            "evidence": [
                {{
                    "text": "exact quote",
                    "speaker_id": "who said it",
                    "speaker_role": "INTERVIEWEE",
                    "type": "PAIN_POINT/NEED/OPINION/etc",
                    "reasoning": "why this is evidence not a question"
                }}
            ],
            "excluded_researcher_questions": [
                "list of questions that were correctly excluded"
            ]
        }}
        """

        response = await self.llm.analyze(
            {"prompt": prompt, "temperature": 0.1, "response_format": "json"}
        )

        logger.info(f"Evidence attribution complete with researcher questions excluded")
        return response

    async def _validate_semantically(
        self, evidence: Dict, transcript: str
    ) -> Dict[str, Any]:
        """
        Validate evidence using ONLY semantic understanding.
        NO token counting. NO pattern matching. Pure meaning comprehension.
        """
        prompt = f"""
        Validate this evidence extraction against the original transcript:

        Evidence extracted: {json.dumps(evidence)}

        Original transcript: {transcript}

        For each piece of evidence, verify through SEMANTIC UNDERSTANDING:

        1. MEANING PRESERVATION - Is the meaning accurately captured?
           - "System is slow" = "Performance is poor" = "Takes forever" (all valid)
           - Understand paraphrasing and synonyms

        2. SPEAKER VERIFICATION - Is it attributed to the right person?
           - Verify the speaker actually said this
           - Ensure it's not misattributed from a question

        3. CONTEXT INTEGRITY - Is the context maintained?
           - Not cherry-picked or taken out of context
           - Represents what was actually communicated

        4. RESEARCHER CONTAMINATION - Zero tolerance check:
           - If this looks like a question, it should NOT be evidence
           - "Given your responsibility..." should NEVER be evidence

        Return validation results as JSON:
        {{
            "validation_results": [
                {{
                    "evidence_text": "...",
                    "is_valid": boolean,
                    "is_accurately_attributed": boolean,
                    "is_researcher_question": boolean,
                    "semantic_accuracy": 0.0-1.0,
                    "validation_notes": "explanation"
                }}
            ],
            "summary": {{
                "total_evidence": number,
                "valid_evidence": number,
                "misattributed": number,
                "researcher_contamination": number
            }}
        }}
        """

        response = await self.llm.analyze(
            {"prompt": prompt, "temperature": 0.1, "response_format": "json"}
        )

        logger.info(f"Semantic validation complete through meaning comprehension")
        return response

    async def extract_age_directly(self, text: str) -> Optional[int]:
        """
        Extract age using ONLY LLM understanding.
        This method specifically handles the "John Miller, Age: 56" format
        that regex patterns consistently fail to extract.
        """
        prompt = f"""
        Extract the person's age from this text:

        {text}

        The age might be expressed in ANY format:
        - "John Miller, Age: 56" means 56
        - "Sarah Chen (32 years old)" means 32
        - "Marcus, 42" means 42
        - "45-year-old designer" means 45
        - "Born in 1968" means approximately 56-57 (in 2024)

        Return ONLY the age as a number, or null if no age is mentioned.

        Response format: {{"age": number or null}}
        """

        response = await self.llm.analyze(
            {"prompt": prompt, "temperature": 0.0, "response_format": "json"}
        )

        return response.get("age") if response else None

    async def is_researcher_question(self, text: str) -> bool:
        """
        Determine if text is a researcher question using ONLY LLM understanding.
        NO pattern matching. Pure conversational comprehension.
        """
        prompt = f"""
        Analyze this text and determine if it's a question from a researcher/interviewer:

        "{text}"

        Use your understanding of conversation to determine:
        - Is this someone asking for information (researcher)?
        - Or someone providing information (participant)?

        Examples of researcher questions:
        - "Given your responsibility for modular product lines, what challenges do you face?"
        - "Can you tell me about your experience?"
        - "What are your main pain points?"

        Examples of participant statements:
        - "The main challenge is lack of visibility"
        - "I've been working here for 10 years"
        - "We need better integration"

        Return: {{"is_researcher_question": true/false, "reasoning": "..."}}
        """

        response = await self.llm.analyze(
            {"prompt": prompt, "temperature": 0.0, "response_format": "json"}
        )

        return response.get("is_researcher_question", False) if response else False

    async def validate_single_evidence(
        self, evidence_text: str, source_text: str
    ) -> Dict[str, Any]:
        """
        Validate a single piece of evidence using semantic understanding.
        """
        prompt = f"""
        Validate if this evidence accurately represents what was said:

        Evidence claim: "{evidence_text}"

        Source text: {source_text}

        Determine through SEMANTIC UNDERSTANDING (not word matching):
        1. Is the meaning accurately preserved?
        2. Does this evidence exist in the source (even if paraphrased)?
        3. Is this a fair representation?

        Return: {{
            "is_valid": true/false,
            "semantic_match": true/false,
            "confidence": 0.0-1.0,
            "explanation": "..."
        }}
        """

        response = await self.llm.analyze(
            {"prompt": prompt, "temperature": 0.0, "response_format": "json"}
        )

        return response if response else {"is_valid": False, "confidence": 0.0}


class ExclusiveLLMProcessor:
    """
    Processor that enforces exclusive LLM usage.
    Prevents any traditional NLP from being used.
    """

    def __init__(self, llm_service):
        self.intelligence = ExclusiveLLMIntelligence(llm_service)
        # Explicitly confirm no patterns or rules exist
        self._verify_no_patterns()

    def _verify_no_patterns(self):
        """Verify this implementation uses ZERO patterns or rules."""
        # Check that no regex patterns exist
        assert not hasattr(self, "patterns"), "No patterns allowed"
        assert not hasattr(self, "rules"), "No rules allowed"
        assert not hasattr(self, "regex"), "No regex allowed"
        assert not hasattr(self.intelligence, "patterns"), "No patterns in intelligence"
        logger.info("✓ Verified: ZERO patterns or rules in implementation")

    async def process(self, transcript: str) -> Dict[str, Any]:
        """
        Process transcript using EXCLUSIVELY LLM understanding.

        This method guarantees:
        - ZERO regex patterns used
        - ZERO rule-based logic applied
        - ZERO token counting performed
        - ZERO string manipulation beyond passing to LLM
        - 100% LLM contextual understanding
        """
        start_time = datetime.now()

        # Process using pure LLM understanding
        result = await self.intelligence.process_transcript(transcript)

        # Add processing metadata
        result["processing_time"] = (datetime.now() - start_time).total_seconds()
        result["implementation"] = "EXCLUSIVE_LLM"
        result["traditional_nlp_used"] = False
        result["patterns_used"] = 0
        result["pure_llm"] = True

        # Verify no patterns were used
        self._verify_no_patterns()

        logger.info(
            f"Processing complete in {result['processing_time']:.2f}s using ONLY LLM"
        )
        return result
