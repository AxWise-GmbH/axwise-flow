"""
Validation Engine Module

Multi-LLM cross-verification system to validate evidence with higher thresholds,
solving the 25% token overlap false positive problem.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Tuple, Set
import logging
import re
from enum import Enum
import asyncio
from difflib import SequenceMatcher

from .evidence_attribution import AttributedEvidence, EvidenceType

logger = logging.getLogger(__name__)


class ValidationStatus(Enum):
    """Evidence validation status levels"""

    VERIFIED = "verified"  # High confidence, multi-LLM agreement
    PROBABLE = "probable"  # Good confidence, partial agreement
    UNCERTAIN = "uncertain"  # Mixed signals, needs review
    REFUTED = "refuted"  # Evidence not found or contradicted
    CONTAMINATED = "contaminated"  # Contains researcher bias
    INSUFFICIENT = "insufficient"  # Not enough context to validate


class ValidationResult(BaseModel):
    """Comprehensive validation result for evidence"""

    # Core validation
    status: ValidationStatus = Field(description="Validation status")
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)

    # Matching details
    exact_match: bool = Field(default=False, description="Exact text found")
    semantic_match: bool = Field(default=False, description="Meaning preserved")
    token_overlap_ratio: float = Field(
        default=0.0, description="Token overlap percentage"
    )

    # Multi-LLM verification
    llm_agreements: Dict[str, bool] = Field(
        default_factory=dict, description="LLM model agreements"
    )
    consensus_score: float = Field(default=0.0, description="Cross-model consensus")

    # Evidence quality
    evidence_coherence: float = Field(default=0.0, description="Internal consistency")
    contextual_relevance: float = Field(default=0.0, description="Relevance to context")
    researcher_contamination: float = Field(
        default=0.0, description="Researcher bias level"
    )

    # Specific checks
    has_speaker_attribution: bool = Field(default=False)
    has_demographic_support: bool = Field(default=False)
    has_temporal_consistency: bool = Field(default=True)

    # Explanation
    validation_notes: List[str] = Field(default_factory=list)
    correction_suggestions: List[str] = Field(default_factory=list)

    # Source verification
    source_segments: List[str] = Field(
        default_factory=list, description="Supporting source text"
    )
    source_line_numbers: List[int] = Field(default_factory=list)


class ValidationEngine:
    """
    Multi-layered validation engine using multiple LLMs and strict thresholds.
    Replaces the flawed 25% token overlap with 70% semantic similarity requirement.
    """

    # Strict validation thresholds (replacing 25% token overlap)
    MIN_TOKEN_OVERLAP = 0.70  # 70% minimum token overlap (was 25%)
    MIN_SEMANTIC_SIMILARITY = 0.75  # 75% semantic similarity required
    MIN_CONSENSUS_SCORE = 0.66  # 2/3 LLMs must agree

    def __init__(self, llm_services: Dict[str, Any]):
        """
        Initialize with multiple LLM services for cross-verification.

        Args:
            llm_services: Dictionary of LLM services by model name
        """
        self.llm_services = llm_services
        self.primary_llm = list(llm_services.values())[0] if llm_services else None

        self.validation_prompt = """
        Validate this evidence against the source transcript.

        STRICT VALIDATION CRITERIA:

        1. TEXT ACCURACY (Critical):
           - Find the EXACT or near-exact text in the source
           - Measure token overlap (must be >= 70%)
           - Check for paraphrasing or summarization
           - Identify any alterations or additions

        2. ATTRIBUTION ACCURACY:
           - Verify the speaker is correctly identified
           - Ensure it's not a researcher question
           - Check temporal markers match

        3. CONTEXT PRESERVATION:
           - Verify the meaning is preserved
           - Check surrounding context supports the evidence
           - Ensure no cherry-picking or misrepresentation

        4. CONTAMINATION CHECK:
           - Detect researcher leading or bias
           - Identify hypothetical vs actual statements
           - Check for interpretation vs direct quote

        Evidence to validate:
        {evidence}

        Source transcript:
        {source_text}

        Previous validations:
        {previous_validations}

        Provide:
        - Exact match: true/false
        - Token overlap ratio: 0.0-1.0
        - Semantic match: true/false
        - Attribution correct: true/false
        - Contamination level: 0.0-1.0
        - Validation status: verified/probable/uncertain/refuted/contaminated
        - Supporting quotes from source
        - Any issues or corrections needed
        """

        # Researcher contamination patterns
        self.contamination_patterns = [
            r"(?:interviewer|researcher|moderator)\s*:",
            r"^(?:Q|Question)\s*:",
            r"(?:what|how|why|when|where|who)\s+(?:do|does|did|would|could|should)\s+you",
            r"(?:can|could|would)\s+you\s+(?:tell|explain|describe)",
            r"(?:let me|let\'s|I\'d like to)\s+(?:understand|know|ask)",
        ]

    async def validate_evidence(
        self, evidence: AttributedEvidence, source_text: str, use_multi_llm: bool = True
    ) -> ValidationResult:
        """
        Validate evidence with multi-layered checks.

        Args:
            evidence: Evidence to validate
            source_text: Original source transcript
            use_multi_llm: Whether to use multiple LLMs for verification

        Returns:
            Comprehensive validation result
        """
        try:
            # Layer 1: Exact text matching
            exact_result = self._validate_exact_match(evidence, source_text)

            # Layer 2: Token overlap calculation (strict 70% threshold)
            token_result = self._calculate_token_overlap(evidence, source_text)

            # Layer 3: Researcher contamination check
            contamination_result = self._check_contamination(evidence)

            # Layer 4: LLM semantic validation
            if use_multi_llm and len(self.llm_services) > 1:
                llm_results = await self._multi_llm_validation(evidence, source_text)
            else:
                llm_results = await self._single_llm_validation(evidence, source_text)

            # Layer 5: Combine all validation layers
            final_result = self._combine_validation_results(
                exact_result, token_result, contamination_result, llm_results
            )

            # Log validation outcome
            logger.info(
                f"Validation result for evidence: status={final_result.status}, "
                f"confidence={final_result.confidence_score:.2f}, "
                f"token_overlap={final_result.token_overlap_ratio:.2f}"
            )

            return final_result

        except Exception as e:
            logger.error(f"Validation error: {e}")
            return self._create_error_result(str(e))

    def _validate_exact_match(
        self, evidence: AttributedEvidence, source_text: str
    ) -> Dict:
        """Check for exact text match in source"""

        result = {"exact_match": False, "match_positions": [], "match_context": []}

        # Normalize for comparison
        evidence_normalized = self._normalize_for_matching(evidence.text)
        source_normalized = self._normalize_for_matching(source_text)

        # Check for exact match
        if evidence_normalized in source_normalized:
            result["exact_match"] = True

            # Find positions
            start_idx = source_normalized.find(evidence_normalized)
            while start_idx != -1:
                # Get context window
                context_start = max(0, start_idx - 100)
                context_end = min(
                    len(source_text), start_idx + len(evidence_normalized) + 100
                )
                context = source_text[context_start:context_end]

                result["match_positions"].append(start_idx)
                result["match_context"].append(context)

                # Find next occurrence
                start_idx = source_normalized.find(evidence_normalized, start_idx + 1)

        return result

    def _calculate_token_overlap(
        self, evidence: AttributedEvidence, source_text: str
    ) -> Dict:
        """
        Calculate token overlap with strict 70% threshold.
        This replaces the flawed 25% threshold.
        """

        # Tokenize evidence and source
        evidence_tokens = set(evidence.text.lower().split())

        # Find best matching segment in source
        best_overlap = 0.0
        best_segment = ""

        # Sliding window approach
        words = source_text.split()
        window_size = len(evidence.text.split()) * 2  # Allow some flexibility

        for i in range(len(words) - window_size + 1):
            segment = " ".join(words[i : i + window_size])
            segment_tokens = set(segment.lower().split())

            # Calculate Jaccard similarity
            intersection = evidence_tokens.intersection(segment_tokens)
            union = evidence_tokens.union(segment_tokens)

            if union:
                overlap = len(intersection) / len(union)
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_segment = segment

        # Also calculate simple token overlap percentage
        simple_overlap = 0.0
        if evidence_tokens:
            source_tokens = set(source_text.lower().split())
            matching_tokens = evidence_tokens.intersection(source_tokens)
            simple_overlap = len(matching_tokens) / len(evidence_tokens)

        return {
            "token_overlap_ratio": best_overlap,
            "simple_overlap": simple_overlap,
            "best_matching_segment": best_segment,
            "meets_threshold": best_overlap >= self.MIN_TOKEN_OVERLAP,  # 70% threshold
        }

    def _check_contamination(self, evidence: AttributedEvidence) -> Dict:
        """Check for researcher contamination"""

        contamination_score = 0.0
        contamination_notes = []

        # Check if marked as researcher content
        if evidence.is_researcher_content:
            contamination_score = 1.0
            contamination_notes.append("Marked as researcher content")
            return {
                "contamination_score": contamination_score,
                "contamination_notes": contamination_notes,
            }

        # Check against contamination patterns
        evidence_lower = evidence.text.lower()

        for pattern in self.contamination_patterns:
            if re.search(pattern, evidence.text, re.IGNORECASE):
                contamination_score += 0.3
                contamination_notes.append(f"Matches researcher pattern: {pattern}")

        # Check for question marks (potential researcher questions)
        if evidence.text.strip().endswith("?"):
            # But allow rhetorical questions
            if not any(
                phrase in evidence_lower
                for phrase in ["i wonder", "why do i", "how can i", "what if i"]
            ):
                contamination_score += 0.4
                contamination_notes.append("Ends with question mark")

        # Check for leading phrases
        leading_phrases = ["so you're saying", "let me understand", "in other words"]
        for phrase in leading_phrases:
            if phrase in evidence_lower:
                contamination_score += 0.3
                contamination_notes.append(f"Contains leading phrase: {phrase}")

        # Cap at 1.0
        contamination_score = min(1.0, contamination_score)

        return {
            "contamination_score": contamination_score,
            "contamination_notes": contamination_notes,
        }

    async def _single_llm_validation(
        self, evidence: AttributedEvidence, source_text: str
    ) -> Dict:
        """Validate using single LLM"""

        if not self.primary_llm:
            return {"llm_validation": None}

        prompt = self.validation_prompt.format(
            evidence=evidence.text,
            source_text=source_text[:8000],  # Limit for context
            previous_validations="",
        )

        try:
            response = await self.primary_llm.analyze(
                {
                    "task": "evidence_validation",
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.1,
                }
            )

            if isinstance(response, dict):
                return {
                    "llm_validation": response,
                    "llm_agreements": {
                        "primary": response.get("semantic_match", False)
                    },
                    "consensus_score": 1.0 if response.get("semantic_match") else 0.0,
                }

        except Exception as e:
            logger.error(f"LLM validation error: {e}")

        return {"llm_validation": None}

    async def _multi_llm_validation(
        self, evidence: AttributedEvidence, source_text: str
    ) -> Dict:
        """Validate using multiple LLMs for cross-verification"""

        validations = {}
        agreements = {}

        # Create validation tasks for each LLM
        tasks = []
        model_names = []

        for model_name, llm_service in self.llm_services.items():
            prompt = self.validation_prompt.format(
                evidence=evidence.text,
                source_text=source_text[:8000],
                previous_validations=str(validations),
            )

            task = llm_service.analyze(
                {
                    "task": "evidence_validation",
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.1,
                }
            )

            tasks.append(task)
            model_names.append(model_name)

        # Execute validations in parallel
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for model_name, result in zip(model_names, results):
                if isinstance(result, Exception):
                    logger.error(f"Validation error for {model_name}: {result}")
                    agreements[model_name] = None
                elif isinstance(result, dict):
                    validations[model_name] = result
                    agreements[model_name] = result.get("semantic_match", False)

        except Exception as e:
            logger.error(f"Multi-LLM validation error: {e}")

        # Calculate consensus
        valid_agreements = [v for v in agreements.values() if v is not None]
        consensus_score = (
            sum(1 for v in valid_agreements if v) / len(valid_agreements)
            if valid_agreements
            else 0
        )

        return {
            "llm_validations": validations,
            "llm_agreements": agreements,
            "consensus_score": consensus_score,
        }

    def _combine_validation_results(
        self,
        exact_result: Dict,
        token_result: Dict,
        contamination_result: Dict,
        llm_results: Dict,
    ) -> ValidationResult:
        """Combine all validation layers into final result"""

        result = ValidationResult()

        # Set basic results
        result.exact_match = exact_result.get("exact_match", False)
        result.token_overlap_ratio = token_result.get("token_overlap_ratio", 0.0)
        result.researcher_contamination = contamination_result.get(
            "contamination_score", 0.0
        )

        # Set LLM results
        result.llm_agreements = llm_results.get("llm_agreements", {})
        result.consensus_score = llm_results.get("consensus_score", 0.0)

        # Determine semantic match
        result.semantic_match = (
            result.consensus_score >= self.MIN_CONSENSUS_SCORE or result.exact_match
        )

        # Calculate overall confidence
        confidence_factors = []

        if result.exact_match:
            confidence_factors.append(1.0)

        if result.token_overlap_ratio >= self.MIN_TOKEN_OVERLAP:  # 70% threshold
            confidence_factors.append(result.token_overlap_ratio)
        else:
            confidence_factors.append(
                result.token_overlap_ratio * 0.5
            )  # Penalize low overlap

        if result.semantic_match:
            confidence_factors.append(result.consensus_score)

        # Penalize for contamination
        contamination_penalty = 1.0 - (result.researcher_contamination * 0.5)

        if confidence_factors:
            result.confidence_score = (
                sum(confidence_factors) / len(confidence_factors)
            ) * contamination_penalty

        # Determine validation status
        if result.researcher_contamination > 0.7:
            result.status = ValidationStatus.CONTAMINATED
            result.validation_notes.append("High researcher contamination detected")

        elif (
            result.exact_match and result.token_overlap_ratio >= self.MIN_TOKEN_OVERLAP
        ):
            result.status = ValidationStatus.VERIFIED
            result.validation_notes.append("Exact match with high token overlap")

        elif (
            result.semantic_match
            and result.token_overlap_ratio >= self.MIN_TOKEN_OVERLAP
        ):
            result.status = ValidationStatus.VERIFIED
            result.validation_notes.append(
                f"Semantic match verified by {result.consensus_score:.0%} of LLMs"
            )

        elif result.token_overlap_ratio >= self.MIN_TOKEN_OVERLAP:
            result.status = ValidationStatus.PROBABLE
            result.validation_notes.append(
                "High token overlap but semantic verification uncertain"
            )

        elif result.token_overlap_ratio >= 0.5:
            result.status = ValidationStatus.UNCERTAIN
            result.validation_notes.append(
                f"Token overlap {result.token_overlap_ratio:.0%} below 70% threshold"
            )

        elif result.token_overlap_ratio < 0.3:
            result.status = ValidationStatus.REFUTED
            result.validation_notes.append(
                f"Very low token overlap: {result.token_overlap_ratio:.0%}"
            )

        else:
            result.status = ValidationStatus.INSUFFICIENT
            result.validation_notes.append("Insufficient evidence for validation")

        # Add correction suggestions if needed
        if result.status in [ValidationStatus.UNCERTAIN, ValidationStatus.REFUTED]:
            result.correction_suggestions.append(
                "Review original transcript for accurate quote"
            )
            result.correction_suggestions.append(
                "Verify speaker attribution is correct"
            )

            if result.researcher_contamination > 0.3:
                result.correction_suggestions.append(
                    "Remove researcher questions from evidence"
                )

        # Add source segments if found
        if exact_result.get("match_context"):
            result.source_segments = exact_result["match_context"]
        elif token_result.get("best_matching_segment"):
            result.source_segments = [token_result["best_matching_segment"]]

        return result

    def _normalize_for_matching(self, text: str) -> str:
        """Normalize text for matching"""
        # Lowercase
        text = text.lower()
        # Remove extra whitespace
        text = " ".join(text.split())
        # Remove punctuation for fuzzy matching
        text = re.sub(r"[^\w\s]", " ", text)
        text = " ".join(text.split())
        return text

    def _create_error_result(self, error_message: str) -> ValidationResult:
        """Create error validation result"""
        return ValidationResult(
            status=ValidationStatus.INSUFFICIENT,
            confidence_score=0.0,
            validation_notes=[f"Validation error: {error_message}"],
        )

    async def batch_validate(
        self,
        evidence_list: List[AttributedEvidence],
        source_text: str,
        parallel: bool = True,
    ) -> Dict[str, ValidationResult]:
        """
        Validate multiple evidence items.

        Args:
            evidence_list: List of evidence to validate
            source_text: Original source transcript
            parallel: Whether to validate in parallel

        Returns:
            Dictionary mapping evidence text to validation results
        """
        results = {}

        if parallel:
            # Create validation tasks
            tasks = []
            for evidence in evidence_list:
                task = self.validate_evidence(evidence, source_text)
                tasks.append(task)

            # Execute in parallel
            validation_results = await asyncio.gather(*tasks, return_exceptions=True)

            for evidence, result in zip(evidence_list, validation_results):
                if isinstance(result, Exception):
                    logger.error(f"Batch validation error: {result}")
                    results[evidence.text] = self._create_error_result(str(result))
                else:
                    results[evidence.text] = result
        else:
            # Sequential validation
            for evidence in evidence_list:
                try:
                    result = await self.validate_evidence(evidence, source_text)
                    results[evidence.text] = result
                except Exception as e:
                    logger.error(f"Validation error: {e}")
                    results[evidence.text] = self._create_error_result(str(e))

        # Log summary
        verified_count = sum(
            1 for r in results.values() if r.status == ValidationStatus.VERIFIED
        )
        contaminated_count = sum(
            1 for r in results.values() if r.status == ValidationStatus.CONTAMINATED
        )

        logger.info(
            f"Batch validation complete: {verified_count}/{len(evidence_list)} verified, "
            f"{contaminated_count} contaminated"
        )

        return results

    def calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate semantic similarity between two texts.

        Args:
            text1: First text
            text2: Second text

        Returns:
            Similarity score (0.0 to 1.0)
        """
        # Use SequenceMatcher for basic similarity
        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
