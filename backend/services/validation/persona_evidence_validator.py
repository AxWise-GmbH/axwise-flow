"""
Persona evidence validator (Phase 0 skeleton)

Provides deterministic checks for:
- Quote matching with source (fill offsets when possible)
- Duplication detection across traits
- Speaker consistency when transcript is structured
- Validation summary and status computation

This version does NOT gate saving; it only computes metrics.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import re

# Types
StructuredTranscript = List[Dict[str, str]]  # [{speaker, dialogue}]


@dataclass
class EvidenceMatch:
    index: int
    match_type: str  # "verbatim" | "normalized" | "no_match"
    start_char: Optional[int]
    end_char: Optional[int]
    speaker: Optional[str]


class PersonaEvidenceValidator:
    """Validator for persona evidence items against source text/transcript."""

    def __init__(self, normalization: bool = True):
        self.normalization = normalization

    @staticmethod
    def _looks_like_metadata_line(q: str) -> bool:
        if not q:
            return False
        s = str(q).strip()
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
            }
            return any(k in prefix for k in meta_keys)
        return False

    @staticmethod
    def _looks_like_researcher_question(q: str) -> bool:
        if not q:
            return False
        s = str(q).strip()
        return s.endswith("?")

    @staticmethod
    def detect_contamination(personas_ssot: List[Dict[str, Any]]) -> Dict[str, Any]:
        cnt = 0
        examples: List[str] = []
        for p in personas_ssot or []:
            if not isinstance(p, dict):
                continue
            for field in [
                "goals_and_motivations",
                "challenges_and_frustrations",
                "key_quotes",
            ]:
                trait = p.get(field)
                if not isinstance(trait, dict):
                    continue
                for ev in trait.get("evidence", []) or []:
                    quote = (
                        ev.get("quote")
                        if isinstance(ev, dict)
                        else (ev if isinstance(ev, str) else None)
                    )
                    if not quote:
                        continue
                    if PersonaEvidenceValidator._looks_like_metadata_line(
                        quote
                    ) or PersonaEvidenceValidator._looks_like_researcher_question(
                        quote
                    ):
                        cnt += 1
                        if len(examples) < 5:
                            examples.append(str(quote)[:160])
        return {"metadata_or_question": cnt, "examples": examples}

    @staticmethod
    def _normalize(text: str) -> str:
        t = text or ""
        # Lowercase early for consistent comparisons
        t = t.lower().strip()

        # Remove leading bracketed timestamps like "[12:40]" (simple, non-regex)
        # Do it repeatedly in case of stacked prefixes
        def strip_leading_timestamp(s: str) -> str:
            s = s.lstrip()
            while s.startswith("["):
                close = s.find("]")
                if 0 < close <= 8:
                    inside = s[1:close]
                    parts = inside.split(":")
                    if (
                        len(parts) == 2
                        and all(p.isdigit() for p in parts)
                        and len(parts[1]) in (2,)
                    ):
                        s = s[close + 1 :].lstrip()
                        continue
                break
            return s

        t = strip_leading_timestamp(t)

        # Strip common speaker labels at the start (no heavy regex)
        labels = [
            "researcher",
            "interviewer",
            "moderator",
            "interviewee",
            "participant",
            "speaker",
            "user",
            "customer",
            "stakeholder",
        ]

        def strip_leading_label(s: str) -> str:
            s0 = s.lstrip()
            for lbl in labels:
                if s0.startswith(lbl + ":"):
                    return s0[len(lbl) + 1 :].lstrip()
                if s0.startswith(lbl + " -"):
                    return s0[len(lbl) + 2 :].lstrip()
            return s0

        t = strip_leading_label(t)

        # Normalize smart quotes/apostrophes
        t = t.replace("\u201c", '"').replace("\u201d", '"').replace("\u2019", "'")
        # Normalize dashes and ellipsis
        t = t.replace("\u2013", "-").replace("\u2014", "-").replace("\u2026", "...")
        # Remove zero-width and non-breaking spaces
        t = t.replace("\u200b", "").replace("\u00a0", " ")
        # Collapse whitespace
        t = re.sub(r"[\s\n\r\t]+", " ", t).strip()
        # Light punctuation normalization: remove surrounding quotes/brackets
        t = t.strip("\"'“”‘’[]()")
        return t

    def _fuzzy_contains(self, src: str, q: str) -> bool:
        a = self._normalize(src)
        b = self._normalize(q)
        at = set(a.split())
        bt = set(b.split())
        return len(bt) >= 2 and len(at & bt) / max(1, len(bt)) >= 0.25

    def _find_in_text(
        self, source: str, quote: str
    ) -> Tuple[str, Optional[int], Optional[int]]:
        """Try exact and normalized matching against a single source string."""
        if not source or not quote:
            return ("no_match", None, None)
        # Exact match
        idx = source.find(quote)
        if idx != -1:
            return ("verbatim", idx, idx + len(quote))
        # Normalized match
        if self.normalization:
            norm_src = self._normalize(source)
            norm_quote = self._normalize(quote)
            idx = norm_src.find(norm_quote)
            if idx != -1:
                # Best-effort: cannot easily map back to original offsets; leave None
                return ("normalized", None, None)
            # Fuzzy token overlap as last resort
            if self._fuzzy_contains(source, quote):
                return ("normalized", None, None)
        return ("no_match", None, None)

    def _find_in_transcript(
        self, transcript: StructuredTranscript, quote: str
    ) -> Tuple[str, Optional[int], Optional[int], Optional[str]]:
        """Search each segment's dialogue; return match type and speaker when found."""
        global_offset = 0
        for seg in transcript:
            dialogue = seg.get("dialogue", "")
            speaker = seg.get("speaker")
            mtype, s, e = self._find_in_text(dialogue, quote)
            if mtype != "no_match":
                # Map offsets to transcript-level by accumulating if needed
                if s is not None and e is not None:
                    return (mtype, global_offset + s, global_offset + e, speaker)
                return (mtype, None, None, speaker)
            global_offset += len(dialogue) + 1  # +1 for separator
        return ("no_match", None, None, None)

    def match_evidence(
        self,
        persona_ssot: Dict[str, Any],
        source_text: Optional[str] = None,
        transcript: Optional[StructuredTranscript] = None,
    ) -> List[EvidenceMatch]:
        """Match each evidence item across core traits and return matches with offsets."""
        matches: List[EvidenceMatch] = []

        def iter_evidence_items(trait: Optional[Dict[str, Any]]):
            if not isinstance(trait, dict):
                return []
            evd = trait.get("evidence") or []
            return [i for i in evd if isinstance(i, (dict, str))]

        evidence_pool: List[Tuple[int, Dict[str, Any]]] = []
        idx = 0
        for field in [
            "goals_and_motivations",
            "challenges_and_frustrations",
            "key_quotes",
        ]:
            for item in iter_evidence_items(persona_ssot.get(field)):
                if isinstance(item, str):
                    item = {"quote": item}
                evidence_pool.append((idx, item))
                idx += 1

        for index, item in evidence_pool:
            quote = item.get("quote", "")
            # Treat missing attribution metadata as a hard no-match
            missing_doc = not (item.get("document_id") or "").strip()
            missing_speaker = False
            if transcript is not None:
                missing_speaker = not (item.get("speaker") or "").strip()
            if missing_doc or missing_speaker:
                matches.append(
                    EvidenceMatch(
                        index=index,
                        match_type="no_match",
                        start_char=None,
                        end_char=None,
                        speaker=None,
                    )
                )
                continue
            if transcript:
                mtype, s, e, sp = self._find_in_transcript(transcript, quote)
            else:
                mtype, s, e = self._find_in_text(source_text or "", quote)
                sp = item.get("speaker")
            matches.append(
                EvidenceMatch(
                    index=index, match_type=mtype, start_char=s, end_char=e, speaker=sp
                )
            )
        return matches

    @staticmethod
    def detect_duplication(persona_ssot: Dict[str, Any]) -> Dict[str, Any]:
        """Detect duplicate quotes and cross-trait reuse."""
        seen: Dict[str, List[str]] = {}
        dup_info = {"duplicates": [], "cross_trait_reuse": []}

        def collect(field: str):
            trait = persona_ssot.get(field)
            if not isinstance(trait, dict):
                return
            for ev in trait.get("evidence", []) or []:
                quote = (
                    ev.get("quote")
                    if isinstance(ev, dict)
                    else (ev if isinstance(ev, str) else None)
                )
                if quote:
                    seen.setdefault(quote, []).append(field)

        for f in ["goals_and_motivations", "challenges_and_frustrations", "key_quotes"]:
            collect(f)

        for quote, fields in seen.items():
            if len(fields) > 1:
                dup_info["cross_trait_reuse"].append(
                    {"quote": quote, "fields": sorted(set(fields))}
                )
            # duplicates within same field
            if len(fields) != len(set(fields)):
                dup_info["duplicates"].append({"quote": quote})
        return dup_info

    @staticmethod
    def check_speaker_consistency(
        persona_ssot: Dict[str, Any], transcript: Optional[StructuredTranscript]
    ) -> Dict[str, Any]:
        """When transcript speakers are available, ensure evidence speaker fields align (if provided)."""
        if not transcript:
            return {"speaker_mismatches": []}
        speakers = {seg.get("speaker") for seg in transcript if seg.get("speaker")}

        mismatches: List[Dict[str, Any]] = []
        for field in [
            "goals_and_motivations",
            "challenges_and_frustrations",
            "key_quotes",
        ]:
            trait = persona_ssot.get(field)
            if not isinstance(trait, dict):
                continue
            for ev in trait.get("evidence", []) or []:
                if (
                    isinstance(ev, dict)
                    and ev.get("speaker")
                    and ev["speaker"] not in speakers
                ):
                    mismatches.append(
                        {
                            "field": field,
                            "quote": ev.get("quote"),
                            "speaker": ev.get("speaker"),
                        }
                    )
        return {"speaker_mismatches": mismatches}

    @staticmethod
    def summarize(
        matches: List[EvidenceMatch],
        duplication: Dict[str, Any],
        speaker_check: Dict[str, Any],
        contamination: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        total = len(matches)
        counts = {"verbatim": 0, "normalized": 0, "no_match": 0}
        for m in matches:
            counts[m.match_type] = counts.get(m.match_type, 0) + 1
        summary = {
            "counts": counts,
            "total": total,
            "duplication": duplication,
            "speaker_check": speaker_check,
            "contamination": contamination or {"metadata_or_question": 0},
        }
        return summary

    @staticmethod
    def compute_status(summary: Dict[str, Any]) -> str:
        total = max(1, summary.get("total", 0))
        no_match = summary.get("counts", {}).get("no_match", 0)
        ratio_no_match = no_match / total
        if ratio_no_match > 0.25:
            return "HARD_FAIL"
        # Soft fail if any contamination or speaker mismatches detected
        contamination = summary.get("contamination", {})
        if (contamination.get("metadata_or_question", 0) or 0) > 0:
            return "SOFT_FAIL"
        if summary.get("duplication", {}).get("cross_trait_reuse"):
            return "SOFT_FAIL"
        if summary.get("speaker_check", {}).get("speaker_mismatches"):
            return "SOFT_FAIL"
        return "PASS"

    @staticmethod
    def compute_confidence_components(summary: Dict[str, Any]) -> Dict[str, float]:
        total = max(1, summary.get("total", 0))
        counts = summary.get("counts", {})
        w_verbatim = 1.0
        w_normalized = 0.6
        w_no = 0.0
        score = (
            w_verbatim * counts.get("verbatim", 0)
            + w_normalized * counts.get("normalized", 0)
            + w_no * counts.get("no_match", 0)
        ) / total
        return {"evidence_match_score": round(score, 3)}
