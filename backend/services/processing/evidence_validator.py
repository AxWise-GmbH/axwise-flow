"""
Evidence Validator Service

This service validates the semantic alignment between persona trait descriptions
and their supporting evidence, ensuring that highlighted keywords are meaningful
and that evidence actually supports the claimed insights.
"""

import re
import logging
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of evidence validation."""

    is_valid: bool
    confidence_score: float
    issues: List[str]
    suggestions: List[str]
    semantic_alignment_score: float
    keyword_relevance_score: float


class EvidenceValidator:
    """Validates evidence-to-insight alignment and keyword highlighting quality."""

    # Generic words that should not be highlighted
    GENERIC_WORDS = {
        "with",
        "have",
        "their",
        "like",
        "and",
        "the",
        "is",
        "are",
        "was",
        "were",
        "but",
        "or",
        "so",
        "then",
        "when",
        "where",
        "this",
        "that",
        "these",
        "those",
        "a",
        "an",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "by",
        "from",
        "up",
        "about",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "among",
        "under",
        "over",
        "out",
        "off",
        "down",
        "can",
        "could",
        "should",
        "would",
        "will",
        "shall",
        "may",
        "might",
        "must",
        "do",
        "does",
        "did",
        "has",
        "had",
        "been",
        "being",
        "get",
        "got",
        "go",
        "went",
        "come",
        "came",
    }

    # Domain-specific keywords that should be prioritized
    DOMAIN_KEYWORDS = {
        "service_maintenance": {
            "maintenance",
            "cleaning",
            "repair",
            "safety",
            "equipment",
            "professional",
            "service",
            "fix",
            "install",
            "replace",
            "maintain",
            "clean",
            "wash",
        },
        "physical_aspects": {
            "physical",
            "climbing",
            "ladder",
            "roof",
            "driveway",
            "gutters",
            "dangerous",
            "height",
            "stairs",
            "heavy",
            "lifting",
            "balance",
            "fall",
            "injury",
        },
        "time_resources": {
            "time",
            "busy",
            "demanding",
            "schedule",
            "hours",
            "weekend",
            "availability",
            "urgent",
            "deadline",
            "priority",
            "quick",
            "fast",
            "slow",
            "delay",
        },
        "age_ability": {
            "elderly",
            "aging",
            "limitations",
            "difficult",
            "unable",
            "struggle",
            "health",
            "tired",
            "weak",
            "strong",
            "capable",
            "experience",
            "wisdom",
        },
        "quality_trust": {
            "reliable",
            "trustworthy",
            "professional",
            "quality",
            "experienced",
            "certified",
            "reputation",
            "skilled",
            "expert",
            "competent",
            "qualified",
        },
    }

    def __init__(self, keyword_highlighter=None):
        """Initialize the evidence validator."""
        self.all_domain_keywords = set()
        for category_keywords in self.DOMAIN_KEYWORDS.values():
            self.all_domain_keywords.update(category_keywords)

        # Store reference to keyword highlighter for dynamic domain keywords
        self.keyword_highlighter = keyword_highlighter

    def validate_persona_evidence(
        self, persona: Dict[str, Any]
    ) -> Dict[str, ValidationResult]:
        """
        Validate evidence for all traits in a persona.

        Args:
            persona: Persona dictionary with traits containing evidence

        Returns:
            Dictionary mapping trait names to validation results
        """
        results = {}

        trait_fields = [
            "demographics",
            "goals_and_motivations",
            "challenges_and_frustrations",
            "skills_and_expertise",
            "technology_and_tools",
            "workflow_and_environment",
            "key_quotes",
        ]

        for trait_name in trait_fields:
            trait_data = persona.get(trait_name, {})
            if (
                isinstance(trait_data, dict)
                and "value" in trait_data
                and "evidence" in trait_data
            ):
                result = self.validate_trait_evidence(
                    trait_name=trait_name,
                    trait_description=trait_data.get("value", ""),
                    evidence_quotes=trait_data.get("evidence", []),
                    confidence=trait_data.get("confidence", 0.0),
                )
                results[trait_name] = result

        return results

    def validate_trait_evidence(
        self,
        trait_name: str,
        trait_description: str,
        evidence_quotes: List[str],
        confidence: float,
    ) -> ValidationResult:
        """
        Validate evidence for a specific persona trait.

        Args:
            trait_name: Name of the trait being validated
            trait_description: Description of the trait
            evidence_quotes: List of supporting evidence quotes
            confidence: Confidence score for the trait

        Returns:
            ValidationResult with detailed validation information
        """
        issues = []
        suggestions = []

        # Validate keyword highlighting quality
        keyword_score = self._validate_keyword_highlighting(
            evidence_quotes, trait_name, issues, suggestions
        )

        # Validate semantic alignment between evidence and description
        semantic_score = self._validate_semantic_alignment(
            trait_description, evidence_quotes, trait_name, issues, suggestions
        )

        # Validate evidence quality
        evidence_quality = self._validate_evidence_quality(
            evidence_quotes, issues, suggestions
        )

        # Calculate overall validation score with stricter thresholds
        overall_score = (
            keyword_score * 0.4 + semantic_score * 0.4 + evidence_quality * 0.2
        )

        # Determine if validation passes - stricter criteria for quality
        is_valid = overall_score >= 0.7 and semantic_score >= 0.5 and len(issues) <= 2

        return ValidationResult(
            is_valid=is_valid,
            confidence_score=overall_score,
            issues=issues,
            suggestions=suggestions,
            semantic_alignment_score=semantic_score,
            keyword_relevance_score=keyword_score,
        )

    def _validate_keyword_highlighting(
        self,
        evidence_quotes: List[str],
        trait_name: str,
        issues: List[str],
        suggestions: List[str],
    ) -> float:
        """Validate the quality of keyword highlighting in evidence quotes."""
        if not evidence_quotes:
            issues.append("No evidence quotes provided")
            return 0.0

        total_score = 0.0
        highlighted_keywords = []
        generic_highlighted = []

        for quote in evidence_quotes:
            # Extract highlighted keywords
            keywords = re.findall(r"\*\*(.*?)\*\*", quote)
            highlighted_keywords.extend(keywords)

            # Check for generic word highlighting
            for keyword in keywords:
                if keyword.lower().strip() in self.GENERIC_WORDS:
                    generic_highlighted.append(keyword)

        if generic_highlighted:
            issues.append(
                f"Generic words highlighted: {', '.join(set(generic_highlighted))}"
            )
            suggestions.append("Remove highlighting from generic function words")

        # Calculate relevance score using both static and dynamic domain keywords
        if highlighted_keywords:
            # Get dynamic domain keywords from highlighter if available
            all_relevant_keywords = self.all_domain_keywords.copy()
            if self.keyword_highlighter:
                # Add dynamic domain keywords
                if hasattr(self.keyword_highlighter, "dynamic_domain_keywords"):
                    all_relevant_keywords.update(
                        self.keyword_highlighter.dynamic_domain_keywords
                    )
                if hasattr(self.keyword_highlighter, "domain_core_terms"):
                    all_relevant_keywords.update(
                        self.keyword_highlighter.domain_core_terms
                    )

            domain_relevant = sum(
                1
                for kw in highlighted_keywords
                if kw.lower().strip() in all_relevant_keywords
            )
            relevance_ratio = domain_relevant / len(highlighted_keywords)
            total_score = relevance_ratio

            if relevance_ratio < 0.3:
                issues.append("Most highlighted keywords are not domain-relevant")
                suggestions.append("Focus highlighting on domain-specific terms")
        else:
            issues.append("No keywords highlighted in evidence")
            suggestions.append("Add highlighting to key terms that support the trait")

        return total_score

    def _validate_semantic_alignment(
        self,
        trait_description: str,
        evidence_quotes: List[str],
        trait_name: str,
        issues: List[str],
        suggestions: List[str],
    ) -> float:
        """Validate semantic alignment between trait description and evidence."""
        if not trait_description or not evidence_quotes:
            issues.append("Missing trait description or evidence")
            return 0.0

        # Enhanced semantic alignment for demographics
        if trait_name == "demographics":
            return self._validate_demographics_alignment(
                trait_description, evidence_quotes, issues, suggestions
            )

        # Simple keyword overlap analysis for other traits
        description_words = set(re.findall(r"\b\w+\b", trait_description.lower()))
        evidence_text = " ".join(evidence_quotes).lower()
        evidence_words = set(re.findall(r"\b\w+\b", evidence_text))

        # Remove generic words for better analysis
        description_words -= self.GENERIC_WORDS
        evidence_words -= self.GENERIC_WORDS

        if not description_words:
            issues.append("Trait description lacks specific terms")
            return 0.0

        # Calculate overlap
        overlap = description_words.intersection(evidence_words)
        alignment_score = (
            len(overlap) / len(description_words) if description_words else 0.0
        )

        if alignment_score < 0.2:
            issues.append("Low semantic alignment between description and evidence")
            suggestions.append(
                "Ensure evidence quotes directly support the trait description"
            )

        return min(alignment_score * 2, 1.0)  # Scale to 0-1 range

    def _validate_demographics_alignment(
        self,
        trait_description: str,
        evidence_quotes: List[str],
        issues: List[str],
        suggestions: List[str],
    ) -> float:
        """Enhanced validation specifically for demographics traits."""
        # Demographics-specific indicators
        demographic_indicators = {
            "age": [
                "old",
                "young",
                "senior",
                "retired",
                "student",
                "college",
                "years",
                "age",
            ],
            "profession": [
                "business",
                "owner",
                "consultant",
                "developer",
                "professor",
                "work",
                "job",
            ],
            "experience": [
                "experienced",
                "expert",
                "beginner",
                "savvy",
                "proficient",
                "skilled",
            ],
            "location": ["francisco", "california", "city", "area", "location"],
            "income": [
                "fixed",
                "income",
                "budget",
                "money",
                "dollar",
                "financial",
                "afford",
            ],
            "family": [
                "family",
                "husband",
                "wife",
                "kids",
                "children",
                "niece",
                "nephew",
            ],
            "technology": [
                "tech",
                "apple",
                "android",
                "iphone",
                "ipad",
                "mac",
                "device",
            ],
        }

        evidence_text = " ".join(evidence_quotes).lower()
        description_lower = trait_description.lower()

        # Count demographic indicators present in evidence
        evidence_indicators = 0
        total_possible = 0

        for category, indicators in demographic_indicators.items():
            # Check if description mentions this category
            category_in_description = any(
                indicator in description_lower for indicator in indicators
            )
            if category_in_description:
                total_possible += 1
                # Check if evidence supports this category
                if any(indicator in evidence_text for indicator in indicators):
                    evidence_indicators += 1

        # Calculate alignment score
        if total_possible == 0:
            # No specific demographic claims to validate
            return 0.8  # Neutral score for generic demographics

        alignment_score = evidence_indicators / total_possible

        # Provide specific feedback with stricter thresholds
        if alignment_score < 0.5:
            issues.append(
                f"Demographics claims not supported by evidence (score: {alignment_score:.2f})"
            )
            suggestions.append(
                "Remove unsupported demographic claims or include quotes that directly demonstrate age, profession, experience, or background"
            )
        elif alignment_score < 0.8:
            issues.append(
                f"Weak demographic evidence support (score: {alignment_score:.2f})"
            )
            suggestions.append(
                "Strengthen evidence with more specific demographic indicators or remove unsupported claims"
            )

        # Additional check for specific problematic patterns
        if "san francisco" in description_lower and "francisco" not in evidence_text:
            issues.append("Location claim (San Francisco) not supported by evidence")
        if any(
            age_term in description_lower
            for age_term in ["20s", "30s", "40s", "50s", "60s"]
        ) and not any(
            age_indicator in evidence_text
            for age_indicator in ["old", "young", "age", "years"]
        ):
            issues.append("Specific age range claim not supported by evidence")
        if (
            "entry-level" in description_lower
            or "student" in description_lower
            and not any(
                exp_indicator in evidence_text
                for exp_indicator in ["student", "new", "beginner", "learning"]
            )
        ):
            issues.append("Experience level claim not supported by evidence")

        return alignment_score

    def _validate_evidence_quality(
        self, evidence_quotes: List[str], issues: List[str], suggestions: List[str]
    ) -> float:
        """Validate the overall quality of evidence quotes."""
        if not evidence_quotes:
            issues.append("No evidence quotes provided")
            return 0.0

        quality_score = 0.0

        # Check quote length and content
        valid_quotes = 0
        for quote in evidence_quotes:
            # Remove highlighting to check actual content
            clean_quote = re.sub(r"\*\*(.*?)\*\*", r"\1", quote)
            clean_quote = clean_quote.strip().strip("\"'")

            if len(clean_quote) >= 20:  # Minimum meaningful length
                valid_quotes += 1
            else:
                issues.append(f"Quote too short: {clean_quote[:30]}...")

        if valid_quotes > 0:
            quality_score = valid_quotes / len(evidence_quotes)

        if quality_score < 0.5:
            suggestions.append("Provide longer, more detailed evidence quotes")

        return quality_score

    def get_improvement_suggestions(
        self, validation_results: Dict[str, ValidationResult]
    ) -> List[str]:
        """
        Get consolidated improvement suggestions across all traits.

        Args:
            validation_results: Dictionary of validation results by trait

        Returns:
            List of improvement suggestions
        """
        all_suggestions = []
        common_issues = {}

        for trait_name, result in validation_results.items():
            all_suggestions.extend(result.suggestions)
            for issue in result.issues:
                common_issues[issue] = common_issues.get(issue, 0) + 1

        # Prioritize common issues
        priority_suggestions = []
        if common_issues.get("Generic words highlighted", 0) >= 2:
            priority_suggestions.append(
                "PRIORITY: Remove highlighting from generic function words across all traits"
            )

        if common_issues.get("Low semantic alignment", 0) >= 2:
            priority_suggestions.append(
                "PRIORITY: Improve alignment between trait descriptions and evidence quotes"
            )

        return priority_suggestions + list(set(all_suggestions))
