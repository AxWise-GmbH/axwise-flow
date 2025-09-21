"""
Extractor modules for Persona Formation V2.

Each extractor can operate over pre-computed attributes to avoid duplicate
LLM calls. They return AttributedField-like dicts with value/evidence.
"""

from typing import Dict, Any, List


class BaseExtractor:
    target_field: str

    def from_attributes(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        data = attributes.get(self.target_field, {}) or {}
        if isinstance(data, str):
            return {"value": data, "confidence": 0.7, "evidence": []}
        if isinstance(data, dict):
            # Ensure required keys exist
            return {
                "value": data.get("value", ""),
                "confidence": float(data.get("confidence", 0.7) or 0.7),
                "evidence": list(data.get("evidence", []) or []),
            }
        return {"value": "", "confidence": 0.5, "evidence": []}


class DemographicsExtractor(BaseExtractor):
    target_field = "demographics"

    def _bucket_age_range(self, raw: str) -> str:
        """
        Normalize various age mentions to standard buckets: 18-24, 25-34, 35-44, 45-54, 55-64, 65+.
        Accepts inputs like "29", "25-35", "early thirties", "late 50s", "65+".
        """
        import re

        s = (raw or "").lower().strip()
        if not s:
            return ""
        # Numeric range like 25-35 or 30 – 40
        m = re.search(r"\b(\d{2})\s*[-–]\s*(\d{2})\b", s)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            mid = (a + b) // 2
            age = mid
        else:
            # Explicit 65+
            if re.search(r"\b65\s*\+\b", s):
                return "65+"
            # 60+
            if re.search(r"\b60\s*\+\b", s):
                # Map conservatively to 55-64 (closer bucket when evidence is open-ended 60+)
                return "55-64"
            # Explicit "I'm 29", "29 years old", "age 29"
            m2 = re.search(
                r"\b(?:i\s*am|i'm|age|aged|years?\s*old\s*[:,-]?|turned)\s*(\d{2})\b", s
            )
            if m2:
                age = int(m2.group(1))
            else:
                # Decade phrases: early/mid/late 30s
                m3 = re.search(r"\b(early|mid|late)\s*(\d{2})s\b", s)
                if m3:
                    phase, decade = m3.group(1), int(m3.group(2))
                    if phase == "early":
                        age = decade + 2  # ~32
                    elif phase == "mid":
                        age = decade + 5  # ~35
                    else:  # late
                        age = decade + 8  # ~38
                else:
                    # Worded decade with phase: early/mid/late thirties/forties/fifties/sixties
                    m3w = re.search(
                        r"\b(early|mid|late)\s*(thirties|forties|fifties|sixties)\b", s
                    )
                    if m3w:
                        phase, word = m3w.group(1), m3w.group(2)
                        base_decade = {
                            "thirties": 30,
                            "forties": 40,
                            "fifties": 50,
                            "sixties": 60,
                        }[word]
                        if phase == "early":
                            age = base_decade + 2
                        elif phase == "mid":
                            age = base_decade + 5
                        else:
                            age = base_decade + 8
                    else:
                        # Plain decade like "in my thirties"
                        m4 = re.search(r"\b(thirties|forties|fifties|sixties)\b", s)
                        if m4:
                            decade_word = m4.group(1)
                            base = {
                                "thirties": 35,
                                "forties": 45,
                                "fifties": 55,
                                "sixties": 65,
                            }[decade_word]
                            age = base
                        else:
                            # Senior 60+ descriptor – favor 55-64 bucket if ambiguous
                            if "senior" in s and ("60+" in s or "sixty" in s):
                                return "55-64"
                            return ""
        # Map single age to bucket
        if age < 18:
            return ""
        if 18 <= age <= 24:
            return "18-24"
        if 25 <= age <= 34:
            return "25-34"
        if 35 <= age <= 44:
            return "35-44"
        if 45 <= age <= 54:
            return "45-54"
        if 55 <= age <= 64:
            return "55-64"
        return "65+"

    def _try_extract_age_with_llm(self, context_text: str) -> str:
        """
        Best-effort LLM-based age extraction. Returns normalized age bucket or empty string.
        Never raises; on any failure returns "" so we can fall back to regex heuristics.
        """
        try:
            # Lazy import to avoid test-time overheads and circulars
            from backend.infrastructure.container import Container  # type: ignore
        except Exception:
            return ""
        try:
            llm = Container().get_llm_service("enhanced_gemini")
        except Exception:
            return ""
        try:
            prompt = (
                "Extract the participant's AGE RANGE from the quotes below. "
                "Consider first-person speaker context. Output exactly one token from this set: "
                '["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown"]. '
                'If uncertain, output "unknown".'
            )
            resp = llm.analyze(
                {
                    "task": "age_extraction",
                    "text": context_text[:16000],
                    "prompt": prompt,
                    "enforce_json": False,
                    "temperature": 0.0,
                    "timeout": 20,
                }
            )
            # Support both sync/async llm implementations
            if hasattr(resp, "__await__"):
                import asyncio

                resp = asyncio.get_event_loop().run_until_complete(resp)  # type: ignore
            if isinstance(resp, dict):
                candidate = str(
                    resp.get("age_range") or resp.get("age") or resp.get("value") or ""
                )
            else:
                candidate = str(resp or "")
            candidate = candidate.strip().strip('"').strip("'")
            if candidate.lower() == "unknown":
                return ""
            # Normalize with bucketing to keep consistency
            return self._bucket_age_range(candidate)
        except Exception:
            return ""

    def from_attributes(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Light normalization for demographics as AttributedField to keep parity while
        improving evidence hygiene. Full pattern extraction remains with V1 for now
        (PersonaBuilder), but V2 ensures clean inputs and stable types.
        Additionally, attempt age extraction from already-linked evidence (LLM-backed with safe fallback).
        - Trim value
        - Ensure evidence is list[str] (do NOT drop question-marked lines naively)
        - Trim and de-duplicate evidence preserving order
        - Confidence default/float coercion
        - If age bucket inferred, surface it in value to aid downstream structured extraction
        """
        base = super().from_attributes(attributes)
        # Normalize value
        val = base.get("value")
        if isinstance(val, str):
            base["value"] = val.strip()
        else:
            base["value"] = "" if val is None else str(val)
        # Normalize evidence (avoid naive filtering of '?')
        ev = base.get("evidence", [])
        if not isinstance(ev, list):
            ev = [ev] if ev else []
        seen = set()
        normalized: List[str] = []
        for item in ev:
            if not isinstance(item, str):
                continue
            s = item.strip()
            if not s or s in seen:
                continue
            seen.add(s)
            normalized.append(s)
        base["evidence"] = normalized

        # Attempt age extraction using LLM first, then regex fallback
        context_text = "\n".join([base.get("value", "")] + base.get("evidence", []))
        age_bucket = self._try_extract_age_with_llm(
            context_text
        ) or self._bucket_age_range(context_text)
        if age_bucket and age_bucket not in base.get("value", ""):
            prefix = f"Age: {age_bucket}"
            base["value"] = (
                prefix if not base["value"] else f"{prefix}. {base['value']}"
            )
            try:
                base["confidence"] = min(float(base.get("confidence", 0.7)) + 0.05, 1.0)
            except Exception:
                base["confidence"] = 0.75

        # Confidence
        try:
            base["confidence"] = float(base.get("confidence", 0.7) or 0.7)
        except Exception:
            base["confidence"] = 0.7
        return base


class GoalsExtractor(BaseExtractor):
    target_field = "goals_and_motivations"

    def from_attributes(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize goals_and_motivations as an AttributedField while keeping parity.
        - Trim value (string); coerce non-strings to string
        - Ensure evidence is list[str]
        - Trim and stable de-duplicate evidence
        - Confidence default/float coercion
        """
        base = super().from_attributes(attributes)
        # Normalize value
        val = base.get("value")
        if isinstance(val, str):
            base["value"] = val.strip()
        else:
            base["value"] = "" if val is None else str(val)
        # Normalize evidence
        ev = base.get("evidence", [])
        if not isinstance(ev, list):
            ev = [ev] if ev else []
        seen = set()
        normalized: List[str] = []
        for item in ev:
            if not isinstance(item, str):
                continue
            s = item.strip()
            if not s or s in seen:
                continue
            seen.add(s)
            normalized.append(s)
        base["evidence"] = normalized
        # Confidence
        try:
            base["confidence"] = float(base.get("confidence", 0.7) or 0.7)
        except Exception:
            base["confidence"] = 0.7
        return base


class ChallengesExtractor(BaseExtractor):
    target_field = "challenges_and_frustrations"

    def from_attributes(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize challenges_and_frustrations as an AttributedField while keeping parity.
        - Trim value (string); coerce non-strings to string
        - Ensure evidence is list[str]
        - Trim and stable de-duplicate evidence
        - Confidence default/float coercion
        """
        base = super().from_attributes(attributes)
        # Normalize value
        val = base.get("value")
        if isinstance(val, str):
            base["value"] = val.strip()
        else:
            base["value"] = "" if val is None else str(val)
        # Normalize evidence
        ev = base.get("evidence", [])
        if not isinstance(ev, list):
            ev = [ev] if ev else []
        seen = set()
        normalized: List[str] = []
        for item in ev:
            if not isinstance(item, str):
                continue
            s = item.strip()
            if not s or s in seen:
                continue
            seen.add(s)
            normalized.append(s)
        base["evidence"] = normalized
        # Confidence
        try:
            base["confidence"] = float(base.get("confidence", 0.7) or 0.7)
        except Exception:
            base["confidence"] = 0.7
        return base


class KeyQuotesExtractor(BaseExtractor):
    target_field = "key_quotes"

    def from_attributes(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize and harden key_quotes as an AttributedField while preserving
        original meaning. This mirrors the builder's safeguards but runs earlier
        in the V2 pipeline so downstream steps see a clean shape.
        - Ensure evidence is a list[str]
        - De-duplicate while preserving order
        - Trim and drop empty/None entries
        - Limit to max 7 items
        - Ensure value is a short summary or first quote fallback
        """
        base = super().from_attributes(attributes)
        ev = base.get("evidence", [])
        if not isinstance(ev, list):
            ev = [ev] if ev else []
        # Trim, drop empties, and de-duplicate preserving order
        seen: set = set()
        normalized: List[str] = []
        for item in ev:
            if not isinstance(item, str):
                continue
            s = item.strip()
            if not s:
                continue
            # Keep order, avoid dups
            key = s
            if key in seen:
                continue
            seen.add(key)
            normalized.append(s)
        # Cap to 7 items as a sensible upper bound
        if len(normalized) > 7:
            normalized = normalized[:7]
        base["evidence"] = normalized
        # Ensure value present: keep provided value if non-empty, otherwise use a concise summary or first quote
        if not isinstance(base.get("value"), str) or not base.get("value"):
            base["value"] = (
                "Key representative quotes that capture the persona's authentic voice and perspective"
                if normalized
                else "Representative quotes"
            )
        # Confidence default
        try:
            base["confidence"] = float(base.get("confidence", 0.7) or 0.7)
        except Exception:
            base["confidence"] = 0.7
        return base
