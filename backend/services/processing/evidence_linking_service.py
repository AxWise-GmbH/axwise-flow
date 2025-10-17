"""
Evidence linking service for persona formation.

This module provides functionality for:
1. Finding the most relevant quotes for persona attributes
2. Linking quotes directly to specific attributes
3. Including quote context when necessary
"""

from typing import Dict, Any, List, Optional, Tuple, Set
import logging
import re
import json
import os

try:
    # Try to import from backend structure
    from backend.domain.interfaces.llm_unified import ILLMService
    from backend.services.llm.prompts.tasks.evidence_linking import (
        EvidenceLinkingPrompts,
    )
except ImportError:
    try:
        # Try to import from regular structure
        from backend.domain.interfaces.llm_unified import ILLMService
        from backend.services.llm.prompts.tasks.evidence_linking import (
            EvidenceLinkingPrompts,
        )
    except ImportError:
        # Create a minimal interface if both fail
        class ILLMService:
            """Minimal LLM service interface"""

            async def analyze(self, *args, **kwargs):
                raise NotImplementedError("This is a minimal interface")

        # Create a minimal prompt class
        class EvidenceLinkingPrompts:
            """Minimal prompt class"""

            @staticmethod
            def get_prompt(data):
                return ""


# Configure logging
logger = logging.getLogger(__name__)


class EvidenceLinkingService:
    """
    Service for linking evidence to persona attributes.

    This service uses targeted LLM calls to find the most relevant quotes
    for each attribute in a persona.
    """

    def __init__(self, llm_service: ILLMService):
        """
        Initialize the evidence linking service.

        Args:
            llm_service: LLM service for finding relevant quotes
        """
        self.llm_service = llm_service
        # Feature flag to enable scoped, deterministic attribution with offsets/speaker
        # FORCE ENABLED: Always True to ensure consistent evidence quality across all analyses
        self.enable_v2 = True
        # Legacy env var check (kept for backward compatibility but overridden)
        env_flag = os.getenv("EVIDENCE_LINKING_V2", "true").lower()
        if env_flag in ("0", "false", "no", "off"):
            logger.warning(
                "EVIDENCE_LINKING_V2 is disabled via env var, but forcing enable_v2=True for data quality"
            )
        # Optional: LLM-based gating of evidence candidates (default ON; fail-open on errors)
        self.enable_llm_filter = os.getenv("EVIDENCE_LLM_FILTER", "true").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        logger.info("Initialized EvidenceLinkingService")

    async def link_evidence_to_attributes(
        self, attributes: Dict[str, Any], full_text: str
    ) -> Dict[str, Any]:
        """
        Link evidence to persona attributes.

        Args:
            attributes: Persona attributes (can be simple strings or nested dicts)
            full_text: Full text to extract evidence from

        Returns:
            Enhanced persona attributes with evidence
        """
        logger.info("Linking evidence to attributes")

        # List of trait fields to enhance with evidence
        trait_fields = [
            "demographics",
            "goals_and_motivations",
            "skills_and_expertise",
            "workflow_and_environment",
            "challenges_and_frustrations",
            "needs_and_desires",
            "technology_and_tools",
            "attitude_towards_research",
            "attitude_towards_ai",
            "key_quotes",
            "role_context",
            "key_responsibilities",
            "tools_used",
            "collaboration_style",
            "analysis_approach",
            "pain_points",
        ]

        # Create a new dictionary to store the enhanced attributes
        enhanced_attributes = attributes.copy()

        # Process each trait field
        for field in trait_fields:
            if field in attributes:
                try:
                    # Handle both simple string values and nested dict structures
                    trait_value = ""

                    if (
                        isinstance(attributes[field], dict)
                        and "value" in attributes[field]
                    ):
                        # Nested structure
                        trait_value = attributes[field]["value"]
                    elif isinstance(attributes[field], str):
                        # Simple string value
                        trait_value = attributes[field]

                    # Skip if the trait value is empty or default
                    if (
                        not trait_value
                        or trait_value.startswith("Unknown")
                        or trait_value.startswith("Default")
                    ):
                        continue

                    # Find relevant quotes for this trait
                    quotes = await self._find_relevant_quotes(
                        field, trait_value, full_text
                    )

                    # Update the evidence if quotes were found
                    if quotes:
                        # If the attribute is already a dict with evidence field, update it
                        if (
                            isinstance(enhanced_attributes[field], dict)
                            and "evidence" in enhanced_attributes[field]
                        ):
                            enhanced_attributes[field]["evidence"] = quotes
                            # Increase confidence slightly since we found supporting evidence
                            enhanced_attributes[field]["confidence"] = min(
                                enhanced_attributes[field].get("confidence", 0.7) + 0.1,
                                1.0,
                            )
                        else:
                            # For simple string values, convert to dict structure with evidence
                            enhanced_attributes[field] = {
                                "value": trait_value,
                                "confidence": 0.8,  # Good confidence since we have evidence
                                "evidence": quotes,
                            }

                        logger.info(
                            f"Added {len(quotes)} quotes as evidence for {field}"
                        )
                    else:
                        # If no quotes found but we need to maintain the dict structure
                        if not isinstance(enhanced_attributes[field], dict):
                            enhanced_attributes[field] = {
                                "value": trait_value,
                                "confidence": 0.7,
                                "evidence": [],
                            }

                        logger.warning(f"No relevant quotes found for {field}")
                except Exception as e:
                    logger.error(
                        f"Error linking evidence for {field}: {str(e)}", exc_info=True
                    )

        return enhanced_attributes

    async def _find_relevant_quotes(
        self, field: str, trait_value: str, full_text: str, retry_count: int = 0
    ) -> List[str]:
        """
        Find relevant quotes for a trait using LLM with retry logic.

        Args:
            field: Trait field name
            trait_value: Trait value
            full_text: Full text to extract quotes from
            retry_count: Current retry attempt

        Returns:
            List of relevant quotes with context
        """
        max_retries = 2

        try:
            # Create a prompt for finding relevant quotes
            prompt = self._create_quote_finding_prompt(field, trait_value)

            # Adaptive text length based on retry
            text_length_limit = 16000 if retry_count == 0 else 8000
            text_to_analyze = full_text
            if len(full_text) > text_length_limit:
                logger.info(
                    f"Text is very long ({len(full_text)} chars), using first {text_length_limit} chars (retry {retry_count})"
                )
                text_to_analyze = full_text[:text_length_limit]

            # Call LLM to find relevant quotes with timeout
            llm_response = await self.llm_service.analyze(
                {
                    "task": "evidence_linking",
                    "text": text_to_analyze,
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.0,  # Use deterministic output for consistent results
                    "timeout": 30,  # 30 second timeout
                }
            )

            # Parse the response
            quotes = self._parse_llm_response(llm_response)

            # Quality check: if quotes are generic, try different approach
            if quotes and self._are_quotes_generic(quotes):
                logger.warning(
                    f"Generated quotes for {field} appear generic, trying enhanced extraction"
                )
                if retry_count < max_retries:
                    enhanced_quotes = await self._find_quotes_enhanced_approach(
                        field, trait_value, full_text
                    )
                    if enhanced_quotes and not self._are_quotes_generic(
                        enhanced_quotes
                    ):
                        return enhanced_quotes[:3]

            # If LLM failed to find quotes, fall back to regex-based approach
            if not quotes:
                logger.info(
                    f"LLM failed to find quotes for {field}, falling back to regex approach"
                )
                quotes = self._find_quotes_with_regex(trait_value, full_text)

            # Final quality check
            if quotes and not self._are_quotes_generic(quotes):
                return quotes[:3]
            elif retry_count < max_retries:
                logger.info(
                    f"Retrying evidence extraction for {field} (attempt {retry_count + 1})"
                )
                return await self._find_relevant_quotes(
                    field, trait_value, full_text, retry_count + 1
                )
            else:
                # Return best available quotes even if not perfect
                return quotes[:3] if quotes else []

        except Exception as e:
            logger.error(
                f"Error finding quotes for {field} (attempt {retry_count + 1}): {str(e)}",
                exc_info=True,
            )

            # Retry on timeout or connection errors
            if retry_count < max_retries and any(
                error_type in str(e).lower()
                for error_type in ["timeout", "connection", "rate limit"]
            ):
                logger.info(
                    f"Retrying evidence extraction for {field} due to {type(e).__name__}"
                )
                await asyncio.sleep(1 * (retry_count + 1))  # Exponential backoff
                return await self._find_relevant_quotes(
                    field, trait_value, full_text, retry_count + 1
                )

            # Fall back to regex-based approach on error
            return self._find_quotes_with_regex(trait_value, full_text)

    def _create_quote_finding_prompt(self, field: str, trait_value: str) -> str:
        """
        Create a prompt for finding relevant quotes.

        Args:
            field: Trait field name
            trait_value: Trait value

        Returns:
            Prompt string
        """
        # Format field name for better readability
        formatted_field = field.replace("_", " ").title()

        # Use the prompt from the EvidenceLinkingPrompts class
        return EvidenceLinkingPrompts.get_prompt(
            {"field": field, "trait_value": trait_value}
        )

    def _parse_llm_response(self, llm_response: Any) -> List[str]:
        """
        Parse LLM response to extract quotes.

        Args:
            llm_response: Response from LLM

        Returns:
            List of quotes
        """
        try:
            # Handle different response types
            if isinstance(llm_response, list):
                # Response is already a list of quotes
                return [str(quote) for quote in llm_response if quote]
            elif isinstance(llm_response, dict) and "quotes" in llm_response:
                # Response is a dictionary with a "quotes" key (new format)
                quotes = llm_response["quotes"]
                if isinstance(quotes, list):
                    return [str(quote) for quote in quotes if quote]
            elif isinstance(llm_response, str):
                # Try to parse as JSON
                try:
                    parsed_json = json.loads(llm_response)
                    if isinstance(parsed_json, list):
                        # Old format: direct list of quotes
                        return [str(quote) for quote in parsed_json if quote]
                    elif isinstance(parsed_json, dict) and "quotes" in parsed_json:
                        # New format: dictionary with "quotes" key
                        quotes = parsed_json["quotes"]
                        if isinstance(quotes, list):
                            return [str(quote) for quote in quotes if quote]
                except json.JSONDecodeError:
                    # If not valid JSON, try to extract quotes using regex
                    return self._extract_quotes_from_text(llm_response)

            # Default empty list if parsing fails
            return []

        except Exception as e:
            logger.error(f"Error parsing LLM response: {str(e)}", exc_info=True)
            return []

    def _extract_quotes_from_text(self, text: str) -> List[str]:
        """
        Extract quotes from text using regex.

        Args:
            text: Text to extract quotes from

        Returns:
            List of quotes
        """
        # Try to extract quotes enclosed in quotation marks
        quotes = re.findall(r'"([^"]+)"', text)

        # If no quotes found, try to extract lines that look like quotes
        if not quotes:
            lines = text.split("\n")
            quotes = [
                line.strip()
                for line in lines
                if len(line.strip()) > 15
                and not line.startswith(("```", "#", "/*", "*/", "//"))
            ]

        return quotes

    def _find_quotes_with_regex(self, trait_value: str, full_text: str) -> List[str]:
        """
        Find quotes using regex pattern matching.

        Args:
            trait_value: Trait value to find evidence for
            full_text: Full text to search in

        Returns:
            List of quotes
        """
        # Extract key terms from the trait value
        key_terms = []

        # Split by common delimiters
        for delimiter in [",", ".", ";", ":", "-", "(", ")", "&"]:
            if delimiter in trait_value:
                key_terms.extend(
                    [term.strip() for term in trait_value.split(delimiter)]
                )

        # If no terms found with delimiters, use the whole trait value
        if not key_terms:
            key_terms = [trait_value]

        # Filter out short terms and duplicates
        key_terms = list(set([term for term in key_terms if len(term) > 5]))

        # Find sentences containing key terms
        quotes = []
        sentences = re.split(r"(?<=[.!?])\s+", full_text)

        for term in key_terms:
            term_quotes = []
            for i, sentence in enumerate(sentences):
                if term.lower() in sentence.lower():
                    # Get context (previous and next sentence if available)
                    start_idx = max(0, i - 1)
                    end_idx = min(len(sentences), i + 2)
                    context = " ".join(sentences[start_idx:end_idx])
                    term_quotes.append(context)

            # Sort by length (prefer longer quotes with more context)
            term_quotes.sort(key=len, reverse=True)

            # Take the top 1-2 quotes for this term
            quotes.extend(term_quotes[:3])

            # Limit to 6 quotes total
            if len(quotes) >= 6:
                break

        return quotes[:6]

    def _are_quotes_generic(self, quotes: List[str]) -> bool:
        """
        Check if quotes are generic placeholders rather than authentic evidence.

        Args:
            quotes: List of quotes to check

        Returns:
            True if quotes appear to be generic/placeholder content
        """
        if not quotes:
            return True

        generic_indicators = [
            "no specific",
            "generic placeholder",
            "inferred from",
            "contextual",
            "derived from",
            "using generic",
            "fallback due to",
            "not determined",
            "insufficient data",
            "limited information",
            "unclear from",
        ]

        generic_count = 0
        for quote in quotes:
            if any(indicator in quote.lower() for indicator in generic_indicators):
                generic_count += 1

        # If more than half the quotes are generic, consider the set generic
        return generic_count > len(quotes) / 2

    async def _find_quotes_enhanced_approach(
        self, field: str, trait_value: str, full_text: str
    ) -> List[str]:
        """
        Enhanced approach to find quotes using different strategies.

        Args:
            field: Trait field name
            trait_value: Trait value
            full_text: Full text to extract quotes from

        Returns:
            List of enhanced quotes
        """
        try:
            # Strategy 1: Look for direct speech patterns
            import re

            direct_quotes = []

            # Find quoted speech
            quote_patterns = [
                r'"([^"]{20,200})"',  # Double quotes
                r"'([^']{20,200})'",  # Single quotes
                r"I\s+([^.!?]{20,100}[.!?])",  # First person statements
                r"We\s+([^.!?]{20,100}[.!?])",  # First person plural
                r"My\s+([^.!?]{20,100}[.!?])",  # Possessive first person
            ]

            for pattern in quote_patterns:
                matches = re.findall(pattern, full_text, re.IGNORECASE | re.MULTILINE)
                for match in matches[:3]:  # Limit per pattern (raised from 2 to 3)
                    if len(match.strip()) > 15:
                        direct_quotes.append(f'"{match.strip()}"')

            # Strategy 2: Look for field-specific content
            field_keywords = {
                "demographics": [
                    "age",
                    "years",
                    "experience",
                    "background",
                    "family",
                    "location",
                ],
                "goals_and_motivations": [
                    "want",
                    "need",
                    "goal",
                    "objective",
                    "hope",
                    "aim",
                ],
                "challenges_and_frustrations": [
                    "difficult",
                    "problem",
                    "issue",
                    "challenge",
                    "frustrating",
                ],
                "skills_and_expertise": [
                    "skilled",
                    "expert",
                    "experienced",
                    "proficient",
                    "knowledge",
                ],
                "technology_and_tools": [
                    "use",
                    "tool",
                    "software",
                    "system",
                    "platform",
                    "application",
                ],
            }

            keywords = field_keywords.get(field, [])
            contextual_quotes = []

            sentences = re.split(r"[.!?]+", full_text)
            for sentence in sentences:
                sentence = sentence.strip()
                if len(sentence) > 30 and any(
                    keyword in sentence.lower() for keyword in keywords
                ):
                    # Check if it contains specific details (not generic)
                    if any(
                        detail in sentence.lower()
                        for detail in ["specific", "particular", "exactly", "precisely"]
                    ) or re.search(
                        r"\b\d+\b", sentence
                    ):  # Contains numbers
                        contextual_quotes.append(sentence)
                        if len(contextual_quotes) >= 3:
                            break

            # Combine and return best quotes
            all_quotes = direct_quotes + contextual_quotes
            return all_quotes[:3]

        except Exception as e:
            logger.error(f"Error in enhanced quote extraction for {field}: {str(e)}")
            return []

    # -------------------- V2: Scoped deterministic attribution with offsets --------------------
    def _tokenize(self, text: str) -> List[str]:
        if not text:
            return []
        return [t for t in re.findall(r"\b[\w-]+\b", text.lower()) if len(t) > 3]

    def _overlap_ok(self, a: str, b: str) -> Tuple[bool, float]:
        a_set = set(self._tokenize(a))
        b_set = set(self._tokenize(b))
        if not a_set or not b_set:
            return False, 0.0
        inter = a_set & b_set
        jacc = len(inter) / max(1, len(a_set | b_set))
        ok = len(inter) >= 2 or jacc >= 0.25
        return ok, jacc

    def _iter_sentences_with_spans(self, text: str) -> List[Tuple[int, int, str]]:
        if not text:
            return []
        # Sentence segmentation by punctuation with spans
        spans: List[Tuple[int, int, str]] = []
        for m in re.finditer(r"[^.!?\n]+[.!?]", text, flags=re.MULTILINE):
            s, e = m.span()
            sent = text[s:e].strip()
            if len(sent) >= 20:
                spans.append((s, e, sent))
        # Newline-aware fallback segmentation for sparse-punctuation texts
        # Use only when we found no sentence spans via punctuation; avoids duplicating
        # entire lines when proper sentence segmentation already worked.
        if len(spans) == 0:
            try:
                start = 0
                for line in text.splitlines(keepends=True):
                    raw = (line or "").rstrip("\n")
                    end = start + len(line)
                    if raw and len(raw.strip()) >= 20:
                        spans.append((start, end, raw.strip()))
                    start = end
            except Exception:
                pass
        # Final fallback: whole text
        if not spans:
            spans.append((0, len(text), (text or "").strip()))
        return spans

    def _span_overlaps(self, a: Tuple[int, int], b: Tuple[int, int]) -> bool:
        return not (a[1] <= b[0] or b[1] <= a[0])

    def _looks_like_metadata(self, sent: str) -> bool:
        """Heuristic: reject lines that look like metadata/labels or section headers.
        Examples: 'Primary Stakeholder Category: ...', '💡 Key Insights:', 'KEY THEMES IDENTIFIED'
        """
        if not sent:
            return False
        s = (sent or "").strip()
        ls = s.lower()
        # Common section headers (with or without emoji)
        heading_patterns = [
            r"^💡\s*key insights?:",
            r"^key insights?:",
            r"^key themes identified",
            r"^interview metadata",
            r"^interview dialogue",
            r"^simulation metadata",
            r"^stakeholder breakdown",
        ]
        for pat in heading_patterns:
            try:
                if re.match(pat, ls):
                    return True
            except Exception:
                pass
        # Label-style metadata with colon
        if ":" in s:
            prefix = s.split(":", 1)[0].strip().lower()
            meta_keys = {
                "primary stakeholder category",
                "stakeholder category",
                "category",
                "role",
                "age",
                "gender",
                "location",
                "department",
                "participant details",
                "interviewee",
                "interviewer",
                "overall sentiment",
                "interview id",
                "conducted",
                "duration",
            }
            if any(k in prefix for k in meta_keys):
                return True
        return False

    def _looks_like_question(self, sent: str) -> bool:
        """Heuristic: reject researcher-style questions as evidence.
        Handles timestamps and labels like "[20:04] Researcher: ..." and Q/Question prefixes.
        """
        if not sent:
            return False
        s = (sent or "").strip()
        # Strip leading timestamps in square brackets (up to 3 groups)
        s2 = re.sub(r"^\s*(\[[^\]]+\]\s*){1,3}", "", s)
        ls2 = s2.lower()
        # Explicit Q prefixes
        if re.match(r"^(q|question)\s*[:\-—–]\s*", ls2):
            return True
        # Interviewer/researcher/moderator labels after optional timestamp
        if re.match(r"^(interviewer|researcher|moderator)\s*:\s*", ls2):
            return True
        # Uppercase speaker label + colon (e.g., "INTERVIEWER:") after removing timestamp
        if re.match(r"^[A-Z][A-Z ]{1,20}:\s", s2):
            return True
        # Trailing question mark (ASCII or Unicode full-width)
        if s2.endswith("?") or s2.endswith("？"):
            return True
        return False

    def _select_candidate_spans(
        self,
        trait_value: str,
        scoped_text: str,
        used_spans: List[Tuple[int, int]],
        limit: int = 6,
        metrics: Optional[Dict[str, int]] = None,
    ) -> List[Tuple[int, int, str, float]]:
        """
        Return up to `limit` candidate sentence spans (start, end, text, score) in scoped_text
        that adequately overlap with the trait_value tokens and do not collide with used_spans.
        """
        candidates: List[Tuple[int, int, str, float]] = []
        for s, e, sent in self._iter_sentences_with_spans(scoped_text):
            if metrics is not None:
                metrics["checked_sentences"] = metrics.get("checked_sentences", 0) + 1
            ok, j = self._overlap_ok(trait_value or "", sent)
            if not ok:
                if metrics is not None:
                    metrics["rejected_low_overlap"] = (
                        metrics.get("rejected_low_overlap", 0) + 1
                    )
                continue
            # Additional hygiene filters: drop metadata-like lines and researcher-style questions
            if self._looks_like_metadata(sent) or self._looks_like_question(sent):
                if metrics is not None:
                    metrics["rejected_metadata_or_question"] = (
                        metrics.get("rejected_metadata_or_question", 0) + 1
                    )
                continue
            # Dedup against already used spans across traits
            if any(self._span_overlaps((s, e), u) for u in used_spans):
                if metrics is not None:
                    metrics["rejected_collision"] = (
                        metrics.get("rejected_collision", 0) + 1
                    )
                continue
            # Score could be Jaccard; sort later
            candidates.append((s, e, sent, j))
        # Sort best-first by score, then by length desc
        candidates.sort(key=lambda t: (t[3], len(t[2])), reverse=True)
        return candidates[:limit]

    def _evidence_item(
        self, quote: str, s: int, e: int, meta: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create an evidence item and resolve document/local offsets if doc_spans provided.
        meta may include:
          - document_id: single-doc id
          - doc_spans: list of {document_id, start, end} covering scoped_text ranges
        """
        doc_id = meta.get("document_id")
        ls, le = s, e
        try:
            spans = meta.get("doc_spans") or []
            if spans:
                for seg in spans:
                    ss = seg.get("start")
                    ee = seg.get("end")
                    if isinstance(ss, int) and isinstance(ee, int) and ss <= s < ee:
                        # Map to local offsets within this document
                        did = seg.get("document_id") or seg.get("doc_id")
                        if did:
                            doc_id = did
                            ls = s - ss
                            le = e - ss
                        break
        except Exception:
            pass
        return {
            "quote": quote,
            "start_char": ls,
            "end_char": le,
            "speaker": meta.get("speaker"),
            "speaker_role": meta.get("speaker_role"),
            "document_id": doc_id,
        }

    async def llm_filter_quotes(
        self,
        quotes: List[str],
        scope_meta: Optional[Dict[str, Any]] = None,
    ) -> Set[int]:
        """
        LLM-based gate to approve only participant/verbatim evidence lines.
        - Returns a set of approved indices into the provided quotes list.
        - Fail-open: on any error, approves all indices to avoid breaking pipeline/tests.
        """
        try:
            if not quotes or not getattr(self, "enable_llm_filter", False):
                return set(range(len(quotes)))

            speaker = (
                (scope_meta or {}).get("speaker")
                or (scope_meta or {}).get("speaker_role")
                or "participant"
            )
            numbered = "\n".join(
                f"{i}. " + (q or "").strip() for i, q in enumerate(quotes)
            )
            system_rules = (
                "You are filtering evidence lines for persona formation.\n"
                "Approve ONLY lines that are the participant's own statements (first-person voice, verbatim).\n"
                "REJECT all interviewer/researcher/moderator content, prompts, instructions, section headers, metadata, or summaries.\n"
                "Hard disallow: lines starting with timestamps + role labels (e.g., [12:34] Researcher: ...), any line containing 'Interviewer:' or 'Researcher:' anywhere,\n"
                "lines that are clearly questions (end with ?), lines that begin with 'Q:' or 'Question:', and lines starting 'As a <role>...' when it reads like a prompt rather than self-description.\n"
                "If uncertain, prefer REJECT. Return strict JSON ONLY."
            )
            prompt = (
                f"Speaker context: {speaker}. Select lines spoken by the participant only.\n\n"
                f"LINES:\n{numbered}\n\n"
                'Respond with JSON: {"approved_indices": [<int>, ...]} only.'
            )

            resp = await self.llm_service.analyze(
                {
                    "task": "classification",
                    "prompt": system_rules + "\n\n" + prompt,
                    "enforce_json": True,
                    "temperature": 0.0,
                    "timeout": 30,
                }
            )
            data = {}
            if isinstance(resp, dict):
                # Prefer parsed field if present; otherwise try direct usage
                data = resp.get("parsed") or resp.get("response") or resp
            approved = data.get("approved_indices") if isinstance(data, dict) else None
            if isinstance(approved, list):
                out: Set[int] = set()
                for i in approved:
                    try:
                        out.add(int(i))
                    except Exception:
                        continue
                # Clamp to valid range
                return {i for i in out if 0 <= i < len(quotes)} or set()
        except Exception as e:
            logger.warning(
                "LLM evidence gate failed; falling back to approve-all. err=%s", e
            )
        return set(range(len(quotes)))

    async def llm_clean_scoped_text(
        self,
        scoped_text: str,
        scope_meta: Optional[Dict[str, Any]] = None,
        max_chars: int = 12000,
    ) -> str:
        """
        LLM-based cleaner to keep only participant-verbatim lines from scoped_text.
        - Splits into lines, asks LLM to approve indices (same policy as llm_filter_quotes)
        - Returns the cleaned text joined with newlines, preserving original line order
        - Fail-open: on any error, returns the original scoped_text
        """
        try:
            if not scoped_text or not getattr(self, "enable_llm_filter", False):
                return scoped_text or ""

            text = scoped_text[: max(1000, max_chars)]
            # Prepare numbered lines (skip empty-only lines to reduce noise, but keep index mapping)
            raw_lines: List[str] = text.splitlines()
            indexed: List[tuple[int, str]] = [
                (i, (ln or "").strip()) for i, ln in enumerate(raw_lines)
            ]
            nonempty = [(i, ln) for i, ln in indexed if ln]
            if not nonempty:
                return scoped_text

            numbered = "\n".join(f"{i}. {ln}" for i, ln in nonempty)
            speaker = (
                (scope_meta or {}).get("speaker")
                or (scope_meta or {}).get("speaker_role")
                or "participant"
            )
            system_rules = (
                "You are cleaning a speaker-scoped transcript.\n"
                "Approve ONLY lines that are the participant's own statements (first-person voice, verbatim).\n"
                "REJECT all interviewer/researcher/moderator content, prompts, instructions, headers, or summaries.\n"
                "Reject lines that begin with role labels (even with timestamps), any questions (ending with ?), and section headers like 'Key Insights:'.\n"
                "If uncertain, prefer REJECT. Return strict JSON ONLY."
            )
            prompt = (
                f"Speaker context: {speaker}. Select participant-spoken lines only.\n\n"
                f"LINES:\n{numbered}\n\n"
                'Respond with JSON: {"approved_indices": [<int>, ...]} only.'
            )

            resp = await self.llm_service.analyze(
                {
                    "task": "classification",
                    "system": system_rules,
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.0,
                    "timeout": 45,
                    "response_schema": {
                        "type": "object",
                        "properties": {
                            "approved_indices": {
                                "type": "array",
                                "items": {"type": "integer"},
                            }
                        },
                    },
                }
            )
            try:
                data = resp if isinstance(resp, dict) else json.loads(str(resp))
            except Exception:
                data = {}
            approved = set(data.get("approved_indices") or [])
            # Map approved indices (indices refer to positions in `nonempty` list) back to raw line numbers
            keep_raw_indices = {
                nonempty[i][0] for i in approved if 0 <= i < len(nonempty)
            }
            cleaned_lines = [ln for i, ln in indexed if i in keep_raw_indices]
            return "\n".join(cleaned_lines) if cleaned_lines else scoped_text
        except Exception as e:
            logger.warning(
                "LLM scoped-text cleaner failed; returning original text. err=%s", e
            )
            return scoped_text or ""

    def link_evidence_to_attributes_v2(
        self,
        attributes: Dict[str, Any],
        scoped_text: str,
        scope_meta: Optional[Dict[str, Any]] = None,
        protect_key_quotes: bool = True,
    ) -> Tuple[Dict[str, Any], Dict[str, List[Dict[str, Any]]]]:
        """
        Deterministic, persona-scoped evidence attribution with offsets/speaker.
        - Searches only within scoped_text
        - Requires keyword overlap between trait value and sentence
        - Populates start_char/end_char and speaker/document_id (from scope_meta)
        - Tracks used spans across traits to avoid cross-field duplication
        - Optionally preserves existing key_quotes if present

        Returns: (enhanced_attributes, evidence_items_by_trait)
        """
        scope_meta = scope_meta or {}
        # Initialize metrics for A/B instrumentation
        metrics: Dict[str, int] = {
            "checked_sentences": 0,
            "rejected_low_overlap": 0,
            "rejected_collision": 0,
            "accepted_items": 0,
        }

        enhanced = dict(attributes) if attributes else {}
        used_spans: List[Tuple[int, int]] = []
        evidence_map: Dict[str, List[Dict[str, Any]]] = {}

        # Prioritize behavioral/usage fields before demographics to avoid consuming
        # the only good spans too early (ensures coverage for goals/tech_usage tests)
        trait_fields = [
            "goals_and_motivations",
            "challenges_and_frustrations",
            "technology_usage",
            # Rest of fields (order less critical)
            "skills_and_expertise",
            "workflow_and_environment",
            "technology_and_tools",
            "attitude_towards_research",
            "attitude_towards_ai",
            "role_context",
            "key_responsibilities",
            "tools_used",
            "collaboration_style",
            "analysis_approach",
            "pain_points",
            "needs_and_expectations",
            "decision_making_process",
            "communication_style",
            # Demographics later to leave room for behavior fields
            "demographics",
            # key_quotes handled specially below
        ]

        # Helper to get trait value string
        def get_value(field_data: Any) -> str:
            if isinstance(field_data, dict):
                return str(field_data.get("value", ""))
            if isinstance(field_data, str):
                return field_data
            return ""

        # Iterate traits and select candidate quotes
        def _is_first_person(sent: str) -> bool:
            ls = (sent or "").lower()
            fp = [
                " i ",
                " i'm ",
                " i’m ",
                " my ",
                " we ",
                " we're ",
                " we’re ",
                " our ",
            ]
            # add boundary padding
            padded = f" {ls} "
            return any(tok in padded for tok in fp)

        def _has_third_party_markers(sent: str) -> bool:
            ls = (sent or "").lower()
            padded = f" {ls} "
            tp = [
                " client",
                " clients",
                " policyholder",
                " policyholders",
                " customer",
                " customers",
                " they ",
                " their ",
                " them ",
            ]
            return any(tok in padded for tok in tp)

        for field in trait_fields:
            field_data = enhanced.get(field)
            if field_data is None:
                continue
            trait_value = get_value(field_data)
            if not scoped_text or not trait_value:
                # Nothing to do
                continue

            # Field-specific candidate limit (adaptive by text size)
            base_limit = 8 if field == "demographics" else 6
            if len(scoped_text) > 5000:
                base_limit += 2
            limit = base_limit
            candidates = self._select_candidate_spans(
                trait_value, scoped_text, used_spans, limit=limit, metrics=metrics
            )

            # Demographics pattern-based augmentation (age/location/experience) if still sparse
            if field == "demographics" and len(candidates) < limit:
                try:
                    import re as _re

                    seen = {(s, e) for (s, e, _t, _sc) in candidates}
                    for s2, e2, sent2 in self._iter_sentences_with_spans(scoped_text):
                        if any(self._span_overlaps((s2, e2), u) for u in used_spans):
                            continue
                        if (s2, e2) in seen:
                            continue
                        ls2 = (sent2 or "").lower()
                        has_age = bool(
                            _re.search(r"\b(\d{2})\s*(years old|y/o|yo)\b", ls2)
                        )
                        has_loc = bool(
                            _re.search(
                                r"\b(based in|from|in)\s+[A-Z][A-Za-z\- ]+\b", sent2
                            )
                        )
                        has_exp = bool(
                            _re.search(
                                r"\b(junior|mid[- ]level|senior|lead|principal)\b", ls2
                            )
                        )
                        if has_age or has_loc or has_exp:
                            candidates.append((s2, e2, sent2, 0.51))
                            seen.add((s2, e2))
                            if len(candidates) >= limit:
                                break
                except Exception:
                    pass

            # Focused anchor fallback for demographics when long summaries underperform
            if (
                field == "demographics"
                and not candidates
                and isinstance(field_data, dict)
            ):
                try:
                    anchors: List[str] = []
                    for sub in (
                        "roles",
                        "industry",
                        "professional_context",
                        "location",
                        "experience_level",
                        "age_range",
                    ):
                        v = field_data.get(sub)
                        if isinstance(v, dict) and v.get("value"):
                            anchors.append(str(v.get("value")))
                    if anchors:
                        concise_anchor = "; ".join([a for a in anchors if a])[:200]
                        if concise_anchor:
                            candidates = self._select_candidate_spans(
                                concise_anchor,
                                scoped_text,
                                used_spans,
                                limit=limit,
                                metrics=metrics,
                            )
                except Exception:
                    pass

            # Apply uniform soft first-person preference for demographics, goals, and challenges
            # Prefer first-person + no third-party markers, but fall back to original candidates if none qualify
            # This ensures we never starve a field of evidence due to overly strict filtering
            if (
                field
                in (
                    "demographics",
                    "goals_and_motivations",
                    "challenges_and_frustrations",
                )
                and candidates
            ):
                filtered = [
                    (s, e, sent, sc)
                    for (s, e, sent, sc) in candidates
                    if _is_first_person(sent) and not _has_third_party_markers(sent)
                ]
                if filtered:
                    candidates = filtered  # Use filtered if available
                # else: keep original candidates (soft preference, not hard requirement)

            items: List[Dict[str, Any]] = []
            field_spans: List[Tuple[int, int]] = []
            for s, e, sent, _score in candidates:
                span = (s, e)
                # Within-field de-duplication and diversity: avoid overlapping or very-nearby spans
                if any(
                    self._span_overlaps(span, fs) or abs(span[0] - fs[0]) < 20
                    for fs in field_spans
                ):
                    continue
                items.append(self._evidence_item(sent.strip(), s, e, scope_meta))
                metrics[f"accepted_{field}"] = metrics.get(f"accepted_{field}", 0) + 1
                field_spans.append(span)
                used_spans.append(span)

                # Write back evidence quotes as strings (back-compat) and collect structured items separately
                # Metrics: count accepted items per sentence
                metrics["accepted_items"] = metrics.get("accepted_items", 0) + 1

            # Hard gates: drop items with null offsets/speaker or interviewer speaker
            def _valid_item(it: Dict[str, Any]) -> bool:
                try:
                    if it.get("start_char") is None or it.get("end_char") is None:
                        return False
                    spk = (it.get("speaker") or "").strip()
                    if not spk:
                        role = (it.get("speaker_role") or "").strip().lower()
                        if role != "interviewee":
                            return False
                        # Accept items with correct role even if explicit speaker label missing
                        spk = "Interviewee"
                        it["speaker"] = spk
                    return spk.lower() != "researcher"
                except Exception:
                    return False

            filtered_items = [it for it in items if _valid_item(it)]
            # Ensure a minimum number of evidence items per field via controlled reuse if needed
            try:
                desired_min = 4 if field == "demographics" else 3
                if len(filtered_items) < desired_min:
                    # Re-run candidate selection ignoring cross-trait collisions to avoid starving this field
                    more_cands = self._select_candidate_spans(
                        trait_value, scoped_text, [], limit=limit, metrics=None
                    )
                    for s, e, sent, _ in more_cands:
                        span = (s, e)
                        # still avoid within-field duplicates
                        if any(self._span_overlaps(span, fs) for fs in field_spans):
                            continue
                        extra_item = self._evidence_item(sent.strip(), s, e, scope_meta)
                        metrics[f"accepted_{field}"] = (
                            metrics.get(f"accepted_{field}", 0) + 1
                        )
                        if _valid_item(extra_item):
                            filtered_items.append(extra_item)
                            field_spans.append(span)
                        if len(filtered_items) >= desired_min:
                            break
            except Exception:
                pass

            if filtered_items:
                # Use only deterministically linked, validated items (overwrite any pre-existing evidence)
                evidence_map[field] = filtered_items
                if isinstance(field_data, dict):
                    field_data = dict(field_data)
                    field_data["evidence"] = filtered_items  # preserve structured items
                    # Slightly boost confidence since grounded
                    conf = field_data.get("confidence", 0.7)
                    field_data["confidence"] = min(conf + 0.1, 1.0)
                    enhanced[field] = field_data
                else:
                    enhanced[field] = {
                        "value": trait_value,
                        "confidence": 0.8,
                        "evidence": filtered_items,  # preserve structured items
                    }
            else:
                # No deterministic valid matches found — explicitly clear evidence to prevent contamination
                if isinstance(field_data, dict):
                    field_copy = dict(field_data)
                    field_copy["evidence"] = []
                    enhanced[field] = field_copy
                else:
                    enhanced[field] = {
                        "value": trait_value,
                        "confidence": 0.7,
                        "evidence": [],
                    }

        # key_quotes: protect unless empty
        kq = enhanced.get("key_quotes")
        if isinstance(kq, dict):
            existing = kq.get("evidence")
            if not protect_key_quotes or not existing:
                # If empty (or not protecting), compose from top spans
                # Use first 5 non-overlapping items across prior map
                all_items = []
                for items in evidence_map.values():
                    all_items.extend(items)
                # Sort by length desc to prefer fuller quotes
                all_items.sort(key=lambda it: len(it["quote"]), reverse=True)
                kq_items = []
                kq_spans: List[Tuple[int, int]] = []
                for it in all_items:
                    span = (it["start_char"], it["end_char"])
                    if any(self._span_overlaps(span, u) for u in kq_spans):
                        continue
                    kq_items.append(it)
                    kq_spans.append(span)
                    if len(kq_items) >= 6:
                        break
                if kq_items:
                    evidence_map["key_quotes"] = kq_items
                    kq = dict(kq)
                    kq["evidence"] = kq_items  # preserve structured items
                    enhanced["key_quotes"] = kq

        # Compute and store V2 metrics
        total_items = sum(len(v) for v in evidence_map.values())
        complete = 0
        for items in evidence_map.values():
            for it in items:
                if (
                    it.get("start_char") is not None
                    and it.get("end_char") is not None
                    and it.get("speaker")
                ):
                    complete += 1
        offset_completeness = complete / max(1, total_items)

        # Cross-field duplicate ratio
        quote_to_fields: Dict[str, Set[str]] = {}
        for field, items in evidence_map.items():
            if field == "key_quotes":
                continue
            for it in items:
                q = it.get("quote", "")
                if not q:
                    continue
                if q not in quote_to_fields:
                    quote_to_fields[q] = set()
                quote_to_fields[q].add(field)
        multi_field_quotes = {q for q, fs in quote_to_fields.items() if len(fs) > 1}
        dup_items = 0
        for field, items in evidence_map.items():
            if field == "key_quotes":
                continue
            for it in items:
                if it.get("quote", "") in multi_field_quotes:
                    dup_items += 1
        cross_field_duplicate_ratio = dup_items / max(1, total_items)

        rejection_rate_overlap = metrics.get("rejected_low_overlap", 0) / max(
            1, metrics.get("checked_sentences", 0)
        )

        metrics.update(
            {
                "total_items": total_items,
                "offset_completeness": offset_completeness,
                "cross_field_duplicate_ratio": cross_field_duplicate_ratio,
                "rejection_rate_overlap": rejection_rate_overlap,
            }
        )
        # Expose last metrics for external inspection (e.g., tests/AB instrumentation)
        self.last_metrics_v2 = metrics

        return enhanced, evidence_map
