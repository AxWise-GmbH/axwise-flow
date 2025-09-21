from __future__ import annotations

from typing import Any, Dict, List


class PersonaDeduplicator:
    """
    Conservative deduplication for personas.

    - Groups by normalized name (case-insensitive)
    - Merges evidence for a small set of traits while preserving order
    - Keeps the longest non-empty value for each merged trait
    - Protects key_quotes: never removes unique quotes; merges them uniquely
    - Adds meta _dedup with merged_count per resulting persona

    Fail-open: any unexpected structure will be left as-is.
    """

    MERGE_TRAITS = {
        "demographics",
        "goals_and_motivations",
        "challenges_and_frustrations",
        "key_quotes",
    }

    def deduplicate(self, personas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not personas:
            return personas

        buckets: Dict[str, List[Dict[str, Any]]] = {}
        for p in personas:
            name = (p.get("name") or "").strip().lower()
            buckets.setdefault(name, []).append(p)

        result: List[Dict[str, Any]] = []
        for _, group in buckets.items():
            if len(group) == 1:
                result.append(group[0])
                continue

            base = group[0].copy()
            merged_count = 0
            for other in group[1:]:
                self._merge_into(base, other)
                merged_count += 1

            meta = dict(base.get("_dedup") or {})
            meta["merged_count"] = meta.get("merged_count", 0) + merged_count
            base["_dedup"] = meta
            result.append(base)

        return result

    def _merge_into(self, base: Dict[str, Any], other: Dict[str, Any]) -> None:
        for trait in self.MERGE_TRAITS:
            b = base.get(trait)
            o = other.get(trait)
            if not isinstance(b, dict) or not isinstance(o, dict):
                # Non-standard: skip merging to avoid schema regressions
                continue

            # Prefer longest non-empty string value
            b_val = b.get("value") or ""
            o_val = o.get("value") or ""
            if len(str(o_val)) > len(str(b_val)):
                b["value"] = o_val

            # Merge evidence arrays, preserving order and uniqueness by (text, speaker, offset)
            b_ev = b.get("evidence") or []
            o_ev = o.get("evidence") or []
            if isinstance(b_ev, list) and isinstance(o_ev, list):
                seen = set()
                merged = []
                for item in b_ev + o_ev:
                    key = (
                        (item or {}).get("text"),
                        (item or {}).get("speaker"),
                        (item or {}).get("offset"),
                    )
                    if key in seen:
                        continue
                    seen.add(key)
                    merged.append(item)
                # Protect against accidental evidence drops
                if merged:
                    b["evidence"] = merged
                elif b_ev:
                    b["evidence"] = b_ev
                else:
                    # leave as-is when nothing to merge
                    pass
