from __future__ import annotations

from typing import Any, Dict, List


def _is_number(x: Any) -> bool:
    try:
        float(x)
        return True
    except Exception:
        return False


def adjust_theme_frequencies_for_prevalence(
    themes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Normalize theme.frequency to prevalence when possible; else fix LLM weights.

    Priority 1 (coverage):
    - If themes[].statements contain document_id, compute
      frequency = unique_doc_ids_in_theme / unique_doc_ids_across_all_themes
      Round to 2 decimals, clamp to [0,1].

    Priority 2 (fallback heuristic):
    - If all frequencies look like normalized weights (sum≈1 and max<=0.2),
      rescale by dividing by max to map the top theme(s) to 1.0.
    """
    if not isinstance(themes, list) or not themes:
        return themes

    # Try coverage-based normalization first
    def _collect_doc_ids(item: Any) -> List[str]:
        ids: List[str] = []
        if isinstance(item, dict):
            # Direct document_id on the statement
            did = item.get("document_id")
            if isinstance(did, str) and did.strip():
                ids.append(did.strip())
            # Nested evidence arrays may carry document_id
            for k in ("evidence", "quotes", "support"):
                v = item.get(k)
                if isinstance(v, list):
                    for it in v:
                        if isinstance(it, dict):
                            d2 = it.get("document_id")
                            if isinstance(d2, str) and d2.strip():
                                ids.append(d2.strip())
        return ids

    all_docs: set[str] = set()
    per_theme_docs: List[set[str]] = []
    for t in themes:
        stmts = t.get("statements") if isinstance(t, dict) else None
        docs: set[str] = set()
        if isinstance(stmts, list):
            for s in stmts:
                if isinstance(s, dict):
                    for did in _collect_doc_ids(s):
                        docs.add(did)
                        all_docs.add(did)
        per_theme_docs.append(docs)

    if all_docs:
        total = max(1, len(all_docs))
        adjusted: List[Dict[str, Any]] = []
        for t, docs in zip(themes, per_theme_docs):
            nt = dict(t) if isinstance(t, dict) else {}
            freq = len(docs) / total
            nt["frequency"] = round(min(1.0, max(0.0, freq)) + 1e-8, 2)
            adjusted.append(nt)
        return adjusted

    # Fallback: fix LLM-normalized weights that sum to ~1.0
    freqs: List[float] = []
    for t in themes:
        if not isinstance(t, dict):
            return themes
        f = t.get("frequency")
        if not _is_number(f):
            return themes
        f = float(f)
        if not (0.0 <= f <= 1.0):
            return themes
        freqs.append(f)

    if not freqs:
        return themes

    sum_f = sum(freqs)
    max_f = max(freqs)
    if (0.95 <= sum_f <= 1.05) and (max_f <= 0.2):
        scale = 1.0 / max_f if max_f > 0 else 1.0
        adjusted: List[Dict[str, Any]] = []
        for t, f in zip(themes, freqs):
            new_f = min(1.0, f * scale)
            new_f = round(new_f + 1e-8, 2)
            nt = dict(t)
            nt["frequency"] = new_f
            adjusted.append(nt)
        return adjusted

    return themes


def adjust_theme_frequencies_with_persona_evidence(
    themes: List[Dict[str, Any]], personas_ssot: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Compute prevalence-based theme frequencies by matching theme statements to
    persona evidence quotes to infer document_id coverage when theme statements
    lack document_id. Falls back to adjust_theme_frequencies_for_prevalence.
    """
    try:
        if not themes or not personas_ssot:
            return themes

        # Build an index of evidence quotes -> document_id from personas
        ev_index: List[tuple[str, str]] = []  # (normalized_quote, document_id)

        def _normalize(s: str) -> str:
            try:
                return " ".join(s.lower().strip().split())
            except Exception:
                return s or ""

        for p in personas_ssot:
            if not isinstance(p, dict):
                continue
            for field in (
                "demographics",
                "goals_and_motivations",
                "challenges_and_frustrations",
                "key_quotes",
            ):
                trait = p.get(field)
                if isinstance(trait, dict):
                    ev = trait.get("evidence") or []
                    if isinstance(ev, list):
                        for item in ev:
                            if isinstance(item, dict):
                                q = item.get("quote")
                                did = item.get("document_id")
                                if (
                                    isinstance(q, str)
                                    and isinstance(did, str)
                                    and did.strip()
                                ):
                                    ev_index.append((_normalize(q), did.strip()))
                            elif isinstance(item, str):
                                # No doc id available, skip
                                continue

        if not ev_index:
            # Nothing to map, return original computation
            return adjust_theme_frequencies_for_prevalence(themes)

        # Collect coverage using mapping from statements to persona evidence
        all_docs: set[str] = set()
        per_theme_docs: List[set[str]] = []
        for t in themes:
            docs: set[str] = set()
            if isinstance(t, dict):
                stmts = t.get("statements")
                if isinstance(stmts, list):
                    for s in stmts:
                        # Extract statement text
                        if isinstance(s, dict):
                            q = s.get("quote") or s.get("text")
                        else:
                            q = s
                        if not isinstance(q, str) or not q.strip():
                            continue
                        qn = _normalize(q)
                        # Find any evidence that contains this text (or vice versa)
                        for ev_qn, did in ev_index:
                            if qn in ev_qn or ev_qn in qn:
                                docs.add(did)
            per_theme_docs.append(docs)
            all_docs.update(docs)

        if all_docs:
            total = max(1, len(all_docs))
            adjusted: List[Dict[str, Any]] = []
            for t, docs in zip(themes, per_theme_docs):
                nt = dict(t) if isinstance(t, dict) else {}
                freq = len(docs) / total
                nt["frequency"] = round(min(1.0, max(0.0, freq)) + 1e-8, 2)
                adjusted.append(nt)
            return adjusted

        return adjust_theme_frequencies_for_prevalence(themes)
    except Exception:
        # Fail safe
        return themes
