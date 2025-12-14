"""
Context-Aware Keyword Highlighter Service

This service provides intelligent keyword highlighting that considers the context
of persona traits and prioritizes domain-specific terms over generic words.
"""

import re
import logging
from typing import List, Dict, Set, Tuple, Optional, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class HighlightingContext:
    """Context information for keyword highlighting."""

    trait_name: str
    trait_description: str
    domain_keywords: Set[str]
    priority_keywords: Set[str]


class ContextAwareKeywordHighlighter:
    """Provides context-aware keyword highlighting for persona evidence."""

    # Trait-specific keyword categories
    TRAIT_KEYWORDS = {
        "demographics": {
            "age",
            "years",
            "old",
            "young",
            "senior",
            "junior",
            "experience",
            "background",
            "education",
            "degree",
            "university",
            "college",
            "location",
            "city",
            "region",
            "family",
            "married",
            "single",
            "children",
            "kids",
            "parent",
            "spouse",
        },
        "goals_and_motivations": {
            "goal",
            "want",
            "need",
            "desire",
            "hope",
            "aim",
            "objective",
            "target",
            "success",
            "achieve",
            "accomplish",
            "improve",
            "better",
            "growth",
            "priority",
            "important",
            "value",
            "matter",
            "care",
            "focus",
        },
        "challenges_and_frustrations": {
            "problem",
            "issue",
            "challenge",
            "difficulty",
            "struggle",
            "frustration",
            "obstacle",
            "barrier",
            "pain",
            "hard",
            "difficult",
            "impossible",
            "annoying",
            "stressful",
            "overwhelming",
            "complicated",
            "confusing",
        },
        "skills_and_expertise": {
            "skill",
            "ability",
            "expertise",
            "knowledge",
            "experience",
            "competent",
            "proficient",
            "expert",
            "qualified",
            "certified",
            "trained",
            "capable",
            "good",
            "excellent",
            "strong",
            "weak",
            "learning",
            "developing",
        },
        "technology_and_tools": {
            "software",
            "tool",
            "system",
            "platform",
            "application",
            "program",
            "technology",
            "tech",
            "digital",
            "online",
            "computer",
            "device",
            "equipment",
            "hardware",
            "mobile",
            "app",
            "website",
            "interface",
        },
        "workflow_and_environment": {
            "process",
            "workflow",
            "procedure",
            "method",
            "approach",
            "way",
            "environment",
            "office",
            "workspace",
            "team",
            "collaboration",
            "meeting",
            "communication",
            "remote",
            "onsite",
            "flexible",
        },
    }

    # Base domain keywords - will be dynamically expanded based on research context
    BASE_DOMAIN_KEYWORDS = set()  # Will be populated dynamically

    # Generic words that should never be highlighted
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
        # Additional problematic terms identified in analysis
        "they",
        "them",
        "it",
        "its",
        "very",
        "really",
        "just",
        "only",
        "also",
        "even",
        "good",
        "bad",
        "better",
        "best",
        "more",
        "most",
        "some",
        "many",
        "other",
        "thing",
        "stuff",
        "way",
        "time",
        "people",
        "person",
        # Generic experience terms (unless specifically relevant)
        "experience",
        "audience",
    }

    def __init__(self):
        """Initialize the keyword highlighter."""
        self.all_trait_keywords = set()
        for keywords in self.TRAIT_KEYWORDS.values():
            self.all_trait_keywords.update(keywords)

        # Dynamic domain keywords - populated based on research context
        self.dynamic_domain_keywords = set()
        self.research_domain = None
        self.domain_core_terms = set()

        # Initialize DOMAIN_KEYWORDS for compatibility
        self.DOMAIN_KEYWORDS = self.BASE_DOMAIN_KEYWORDS.copy()

    async def detect_research_domain_and_keywords(
        self, sample_content: str
    ) -> Dict[str, Any]:
        """
        Dynamically detect research domain and extract relevant keywords using LLM.

        Args:
            sample_content: Sample of interview/research content to analyze

        Returns:
            Dict containing domain info and keywords
        """
        from pydantic import BaseModel
        from typing import List

        try:
            from pydantic_ai import Agent
            from google import genai
            import os
        except ImportError:
            # Fallback if PydanticAI not available
            return self._fallback_domain_detection(sample_content)

        class DomainAnalysis(BaseModel):
            research_domain: str
            industry_context: str
            core_domain_terms: List[str]
            technical_terms: List[str]
            emotional_terms: List[str]
            quantitative_indicators: List[str]
            confidence_score: float

        # Use the new Google GenAI client with PydanticAI
        # PydanticAI automatically handles the google-genai integration
        domain_agent = Agent(
            model="gemini-2.5-pro",  # PydanticAI will use google-genai automatically
            output_type=DomainAnalysis,
            system_prompt="""You are an expert research analyst who identifies research domains and extracts relevant keywords for highlighting in user interviews.

Analyze the provided content and identify:

1. RESEARCH DOMAIN: The main topic/industry being studied (e.g., "price discrimination", "healthcare UX", "fintech onboarding", "e-commerce checkout")

2. INDUSTRY CONTEXT: Specific industry or sector (e.g., "technology/mobile apps", "healthcare/patient portals", "financial services")

3. CORE DOMAIN TERMS: 8-12 most important domain-specific terms that should be highlighted (e.g., for healthcare: "patient", "doctor", "appointment", "medical record")

4. TECHNICAL TERMS: 5-8 technical/platform-specific terms relevant to this domain (e.g., for fintech: "API", "authentication", "KYC", "compliance")

5. EMOTIONAL TERMS: 5-8 emotional descriptors specific to this domain's user experience (e.g., for healthcare: "anxious", "confused", "trusted", "overwhelmed")

6. QUANTITATIVE INDICATORS: Terms that indicate measurements, metrics, or quantities in this domain (e.g., "cost", "time", "rating", "percentage")

IMPORTANT: Extract only terms that actually appear in the provided content. Focus on domain-specific terminology that would be meaningful to highlight for researchers and product teams in this field.

Return terms in lowercase for consistency.""",
        )

        try:
            # Properly await the async agent call - no need for thread pools
            # since this method is now async
            result = await domain_agent.run(
                f"Analyze this research content and identify the domain and relevant keywords:\n\n{sample_content[:2000]}"
            )

            domain_data = result.data

            # Update internal state
            self.research_domain = domain_data.research_domain
            self.domain_core_terms = set(domain_data.core_domain_terms)

            # Combine all domain-specific terms - normalize to lowercase for consistent matching
            self.dynamic_domain_keywords = set()
            for term_list in [
                domain_data.core_domain_terms,
                domain_data.technical_terms,
                domain_data.emotional_terms,
                domain_data.quantitative_indicators,
            ]:
                for term in term_list:
                    if term and len(term.strip()) > 2:  # Filter out empty/short terms
                        self.dynamic_domain_keywords.add(term.lower().strip())

            # Also update the DOMAIN_KEYWORDS for immediate use in highlighting
            self.DOMAIN_KEYWORDS.update(self.dynamic_domain_keywords)

            return {
                "domain": domain_data.research_domain,
                "industry": domain_data.industry_context,
                "core_terms": domain_data.core_domain_terms,
                "technical_terms": domain_data.technical_terms,
                "emotional_terms": domain_data.emotional_terms,
                "quantitative_terms": domain_data.quantitative_indicators,
                "confidence": domain_data.confidence_score,
                "total_keywords": len(self.dynamic_domain_keywords),
                "all_keywords": list(
                    self.dynamic_domain_keywords
                ),  # Return for external use
            }

        except Exception as e:
            print(f"Error in domain detection: {str(e)}")
            return self._fallback_domain_detection(sample_content)

    def _fallback_domain_detection(self, sample_content: str) -> Dict[str, Any]:
        """Fallback domain detection using simple keyword analysis."""

        # Simple keyword frequency analysis
        words = re.findall(r"\b\w+\b", sample_content.lower())
        word_freq = {}
        for word in words:
            if len(word) > 3 and word not in self.GENERIC_WORDS:
                word_freq[word] = word_freq.get(word, 0) + 1

        # Get most frequent non-generic terms
        top_terms = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:20]
        domain_keywords = [term for term, freq in top_terms if freq >= 2]

        self.dynamic_domain_keywords = set(domain_keywords)
        self.research_domain = "general_research"

        return {
            "domain": "general_research",
            "industry": "unknown",
            "core_terms": domain_keywords[:8],
            "technical_terms": [],
            "emotional_terms": [],
            "quantitative_terms": [],
            "confidence": 0.5,
            "total_keywords": len(domain_keywords),
        }

    def enhance_evidence_highlighting(
        self, evidence_quotes: List[str], trait_name: str, trait_description: str
    ) -> List[str]:
        """
        Enhance keyword highlighting in evidence quotes based on context.

        Args:
            evidence_quotes: List of evidence quotes (may have existing highlighting)
            trait_name: Name of the persona trait
            trait_description: Description of the trait for context

        Returns:
            List of evidence quotes with improved highlighting
        """
        if not evidence_quotes:
            return evidence_quotes

        # Create highlighting context
        context = self._create_highlighting_context(trait_name, trait_description)

        enhanced_quotes = []
        for quote in evidence_quotes:
            enhanced_quote = self._enhance_quote_highlighting(quote, context)
            enhanced_quotes.append(enhanced_quote)

        return enhanced_quotes

    def _create_highlighting_context(
        self, trait_name: str, trait_description: str
    ) -> HighlightingContext:
        """Create highlighting context for a specific trait."""
        # Get trait-specific keywords
        trait_keywords = self.TRAIT_KEYWORDS.get(trait_name, set())

        # Extract keywords from trait description
        description_words = set(re.findall(r"\b\w+\b", trait_description.lower()))
        description_keywords = description_words - self.GENERIC_WORDS

        # Combine all relevant keywords
        domain_keywords = trait_keywords.union(self.DOMAIN_KEYWORDS).union(
            description_keywords
        )

        # Priority keywords are domain-specific and trait-specific
        priority_keywords = trait_keywords.intersection(self.DOMAIN_KEYWORDS)

        return HighlightingContext(
            trait_name=trait_name,
            trait_description=trait_description,
            domain_keywords=domain_keywords,
            priority_keywords=priority_keywords,
        )

    def _enhance_quote_highlighting(
        self, quote: str, context: HighlightingContext
    ) -> str:
        """Enhance highlighting for a single quote."""
        # Remove existing highlighting to start fresh
        clean_quote = re.sub(r"\*\*(.*?)\*\*", r"\1", quote)

        # Find words to highlight
        words_to_highlight = self._identify_highlight_words(clean_quote, context)

        # Apply highlighting
        enhanced_quote = self._apply_highlighting(clean_quote, words_to_highlight)

        return enhanced_quote

    def _identify_highlight_words(
        self, quote: str, context: HighlightingContext
    ) -> List[str]:
        """Identify which words in the quote should be highlighted."""
        words = re.findall(r"\b\w+\b", quote.lower())
        words_to_highlight = []

        # Score words based on relevance
        word_scores = {}
        for word in set(words):
            score = self._calculate_word_relevance(word, context)
            if score > 0:
                word_scores[word] = score

        # Select top words to highlight (max 3-4 per quote)
        sorted_words = sorted(word_scores.items(), key=lambda x: x[1], reverse=True)
        words_to_highlight = [word for word, score in sorted_words[:4] if score >= 0.5]

        return words_to_highlight

    def _calculate_word_relevance(
        self, word: str, context: HighlightingContext
    ) -> float:
        """Calculate relevance score for a word in the given context."""
        if word in self.GENERIC_WORDS:
            return 0.0  # Never highlight generic words

        score = 0.0

        # Dynamic core domain terms get maximum priority
        if word in self.domain_core_terms:
            score += 1.2  # Highest priority for core domain terms

        # Priority keywords get highest score
        elif word in context.priority_keywords:
            score += 1.0

        # Dynamic domain keywords get high score
        elif word in self.dynamic_domain_keywords:
            score += 0.8

        # Trait-specific keywords get medium score
        elif word in context.domain_keywords:
            score += 0.6

        # Check for quantitative indicators (numbers, percentages, currency)
        elif self._is_quantitative_term(word):
            score += 0.9

        # Words from trait description get lower score
        elif word in context.trait_description.lower():
            score += 0.4

        # Emotional or descriptive words get some score
        elif self._is_descriptive_word(word):
            score += 0.3

        return score

    def _is_quantitative_term(self, word: str) -> bool:
        """Check if a word represents quantitative data (numbers, currency, percentages)."""
        # Check for currency symbols and numbers
        if (
            re.match(r"^\$?\d+", word)
            or "%" in word
            or word.endswith("k")
            or word.endswith("m")
        ):
            return True

        # Check for common quantitative terms
        quantitative_indicators = {
            "percent",
            "percentage",
            "rate",
            "cost",
            "price",
            "fee",
            "dollar",
            "cents",
            "minutes",
            "hours",
            "days",
            "weeks",
            "months",
            "years",
            "times",
            "rating",
        }

        return word.lower() in quantitative_indicators

    def _is_descriptive_word(self, word: str) -> bool:
        """Check if a word is descriptive/emotional and worth highlighting."""
        descriptive_indicators = {
            "difficult",
            "easy",
            "hard",
            "simple",
            "complex",
            "complicated",
            "fast",
            "slow",
            "quick",
            "efficient",
            "effective",
            "useful",
            "important",
            "critical",
            "essential",
            "necessary",
            "required",
            "frustrated",
            "satisfied",
            "happy",
            "unhappy",
            "concerned",
            "worried",
            "confident",
            "uncertain",
            "sure",
            "unsure",
        }
        return word in descriptive_indicators

    def _apply_highlighting(self, quote: str, words_to_highlight: List[str]) -> str:
        """Apply bold highlighting to specified words in the quote."""
        if not words_to_highlight:
            return quote

        highlighted_quote = quote

        # Sort by length (longest first) to avoid partial replacements
        words_sorted = sorted(words_to_highlight, key=len, reverse=True)

        for word in words_sorted:
            # Use word boundaries to avoid partial matches
            pattern = r"\b" + re.escape(word) + r"\b"
            replacement = f"**{word}**"
            highlighted_quote = re.sub(
                pattern, replacement, highlighted_quote, flags=re.IGNORECASE
            )

        return highlighted_quote

    def validate_highlighting_quality(
        self, evidence_quotes: List[str]
    ) -> Dict[str, float]:
        """
        Validate the quality of highlighting in evidence quotes.

        Args:
            evidence_quotes: List of evidence quotes with highlighting

        Returns:
            Dictionary with quality metrics
        """
        if not evidence_quotes:
            return {"overall_score": 0.0, "generic_ratio": 1.0, "domain_ratio": 0.0}

        total_highlighted = 0
        generic_highlighted = 0
        domain_highlighted = 0

        for quote in evidence_quotes:
            keywords = re.findall(r"\*\*(.*?)\*\*", quote)
            total_highlighted += len(keywords)

            for keyword in keywords:
                keyword_lower = keyword.lower().strip()
                if keyword_lower in self.GENERIC_WORDS:
                    generic_highlighted += 1
                elif (
                    keyword_lower in self.dynamic_domain_keywords
                    or keyword_lower in self.BASE_DOMAIN_KEYWORDS
                ):
                    domain_highlighted += 1

        if total_highlighted == 0:
            return {"overall_score": 0.0, "generic_ratio": 0.0, "domain_ratio": 0.0}

        generic_ratio = generic_highlighted / total_highlighted
        domain_ratio = domain_highlighted / total_highlighted

        # Overall score: high domain ratio, low generic ratio
        overall_score = domain_ratio * (1 - generic_ratio)

        return {
            "overall_score": overall_score,
            "generic_ratio": generic_ratio,
            "domain_ratio": domain_ratio,
            "total_highlighted": total_highlighted,
        }

    def get_highlighting_suggestions(
        self, trait_name: str, evidence_quotes: List[str]
    ) -> List[str]:
        """
        Get suggestions for improving highlighting quality.

        Args:
            trait_name: Name of the persona trait
            evidence_quotes: List of evidence quotes

        Returns:
            List of improvement suggestions
        """
        suggestions = []
        quality_metrics = self.validate_highlighting_quality(evidence_quotes)

        if quality_metrics["generic_ratio"] > 0.3:
            suggestions.append("Remove highlighting from generic function words")

        if quality_metrics["domain_ratio"] < 0.3:
            suggestions.append("Focus highlighting on domain-specific terms")

        if quality_metrics["total_highlighted"] == 0:
            suggestions.append("Add highlighting to key terms that support the trait")

        if quality_metrics["overall_score"] < 0.5:
            suggestions.append(f"Improve highlighting relevance for {trait_name} trait")

        return suggestions
