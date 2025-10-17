from __future__ import annotations

from typing import Any, Dict
import os
from sqlalchemy.orm import Session

from backend.services.results.dto import AnalysisResultRow
from backend.services.results.formatters import (
    assemble_flattened_results,
    build_source_payload,
    should_compute_influence_metrics,
    compute_influence_metrics_for_persona,
    derive_detected_stakeholders_from_personas,
    extract_sentiment_statements_from_data,
    create_ui_safe_stakeholder_intelligence,
    get_filename_for_data_id,
    filter_researcher_evidence_for_ssot,
    inject_age_ranges_from_source,
    adjust_theme_frequencies_for_prevalence,
)


def _parse_results(results_field: Any) -> Dict[str, Any]:
    if results_field is None:
        return {}
    if isinstance(results_field, dict):
        return results_field
    try:
        import json

        return json.loads(results_field)
    except Exception:
        return {}


def present_formatted_results(db: Session, row: AnalysisResultRow) -> Dict[str, Any]:
    """Assemble the formatted results payload using pure helpers.

    Restores legacy shaping that was missing in the presenter: SSoT personas,
    evidence filtering, age injection, validation summary, and correct keys.
    """
    results_dict = _parse_results(row.results)

    # Build SSoT personas via adapter
    personas_raw = results_dict.get("personas") or []
    personas_ssot = []
    try:
        from backend.services.adapters.persona_adapters import to_ssot_persona

        for p in personas_raw:
            if isinstance(p, dict):
                personas_ssot.append(to_ssot_persona(p))
    except Exception:
        personas_ssot = []

    # Attach source with priority: transcript > original_text > dataId
    source_payload = build_source_payload(results_dict, row.data_id)

    # Evidence attribution filtering and age injection (pure helpers)
    if personas_ssot:
        personas_ssot = filter_researcher_evidence_for_ssot(
            personas_ssot,
            source_payload.get("transcript"),
            source_payload.get("original_text"),
        )
        personas_ssot = inject_age_ranges_from_source(
            personas_ssot,
            transcript=source_payload.get("transcript"),
            original_text=source_payload.get("original_text"),
        )

    # Flatten main analysis fields (use legacy default sentiment overview)
    flattened = assemble_flattened_results(
        results_dict,
        personas_raw,
        sentiment_overview_default={
            "positive": 0.33,
            "neutral": 0.34,
            "negative": 0.33,
        },
    )

    # EV2 on-read hydration fallback for legacy results lacking instrumentation
    try:
        hydrate_ev2 = os.getenv("RESULTS_SERVICE_V2_PRESENTER", "false").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        if hydrate_ev2 and isinstance(flattened.get("personas"), list):
            # Helper: build concatenated text and doc_spans from transcript
            def _build_concat_and_spans(tx):
                try:
                    # Group by document_id preserving first-seen order
                    order = []
                    buckets = {}
                    for seg in tx or []:
                        if not isinstance(seg, dict):
                            continue
                        did = seg.get("document_id") or "original_text"
                        if did not in buckets:
                            buckets[did] = []
                            order.append(did)
                        # prefer 'dialogue' then 'text'
                        dlg = seg.get("dialogue") or seg.get("text") or ""
                        if dlg:
                            buckets[did].append(str(dlg))
                    # Assemble blocks and spans
                    pieces = []
                    spans = []
                    cursor = 0
                    sep = "\n\n"
                    for did in order:
                        block = "\n".join(buckets.get(did) or [])
                        start = cursor
                        end = start + len(block)
                        spans.append({"document_id": did, "start": start, "end": end})
                        pieces.append(block)
                        cursor = end + len(sep)
                    return sep.join(pieces), spans
                except Exception:
                    return "", []

            transcript = (
                source_payload.get("transcript")
                if isinstance(source_payload, dict)
                else None
            )
            scoped_text = None
            doc_spans = None
            if isinstance(transcript, list) and transcript:
                txt, spans = _build_concat_and_spans(transcript)
                if txt and spans:
                    scoped_text = txt
                    doc_spans = spans
            if not scoped_text:
                scoped_text = original_text

            # Choose scoped_text from transcript (with doc_spans) or fall back to original_text
            if isinstance(scoped_text, str) and scoped_text.strip():
                # Minimal no-op LLM for constructor compatibility
                class _NoOpLLM:
                    async def analyze(self, *_args, **_kwargs):
                        return {}

                try:
                    from backend.services.processing.evidence_linking_service import (
                        EvidenceLinkingService,
                    )

                    ev = EvidenceLinkingService(_NoOpLLM())
                    scope_meta = {
                        "speaker": "Interviewee",
                        "speaker_role": "Interviewee",
                        "document_id": source_payload.get("document_id")
                        or "original_text",
                    }
                    if doc_spans:
                        scope_meta["doc_spans"] = doc_spans
                    hydrated = []
                    for p in flattened.get("personas", []):
                        if not isinstance(p, dict):
                            hydrated.append(p)
                            continue
                        if not p.get("_evidence_linking_v2"):
                            try:
                                enhanced, evmap = ev.link_evidence_to_attributes_v2(
                                    p,
                                    scoped_text=scoped_text,
                                    scope_meta=scope_meta,
                                    protect_key_quotes=True,
                                )
                                p = enhanced if isinstance(enhanced, dict) else p
                                p["_evidence_linking_v2"] = {"evidence_map": evmap}
                            except Exception:
                                pass
                        # Backfill missing document_id on items if needed
                        try:
                            ev2 = p.get("_evidence_linking_v2") or {}
                            evidence_map = ev2.get("evidence_map") or {}
                            for items in evidence_map.values():
                                for it in items or []:
                                    if not it.get("document_id"):
                                        it["document_id"] = scope_meta["document_id"]
                        except Exception:
                            pass
                        hydrated.append(p)
                    flattened["personas"] = hydrated
                except Exception:
                    pass
    except Exception:
        pass

    # Fix mis-scaled theme frequencies that look like normalized weights (sum≈1)
    try:
        if isinstance(flattened.get("themes"), list):
            flattened["themes"] = adjust_theme_frequencies_for_prevalence(
                flattened["themes"]
            )
        if isinstance(flattened.get("enhanced_themes"), list):
            flattened["enhanced_themes"] = adjust_theme_frequencies_for_prevalence(
                flattened["enhanced_themes"]
            )
    except Exception:
        pass

    # Canonicalize themes: prefer single 'themes' section; promote enhanced if base missing
    try:
        themes = flattened.get("themes")
        enhanced = flattened.get("enhanced_themes")
        if isinstance(enhanced, list):
            if not isinstance(themes, list) or not themes:
                flattened["themes"] = enhanced
            # Remove redundant enhanced_themes from payload
            flattened.pop("enhanced_themes", None)
    except Exception:
        pass

    # Fallback extraction for sentimentStatements if missing/empty
    ss = flattened.get("sentimentStatements") or {
        "positive": [],
        "neutral": [],
        "negative": [],
    }
    if not any(ss.values()):
        ss = extract_sentiment_statements_from_data(
            flattened.get("themes", []), flattened.get("patterns", [])
        )
        flattened["sentimentStatements"] = ss

    # Optionally derive influence metrics per persona (nest under stakeholder_intelligence)
    # Preserve existing trait-level evidence; do not strip. Hydration below will only fill when missing.
    try:
        # Still drop any top-level legacy 'evidence' list if present to avoid duplication.
        cleaned_personas = []
        for p in flattened.get("personas", []):
            if not isinstance(p, dict):
                cleaned_personas.append(p)
                continue
            p2 = dict(p)
            if isinstance(p2.get("evidence"), list):
                p2.pop("evidence", None)
            cleaned_personas.append(p2)
        flattened["personas"] = cleaned_personas
    except Exception:
        pass
    # Rehydrate trait-level evidence arrays from EV2 for display (objects with quote/speaker/doc/offsets)
    try:
        hydrated_personas = []
        for p in flattened.get("personas", []):
            if not isinstance(p, dict):
                hydrated_personas.append(p)
                continue
            p2 = dict(p)
            ev2 = p2.get("_evidence_linking_v2") or {}
            ev_map = ev2.get("evidence_map") or {}
            # Backfill missing document_id inside ev_map items (safety)
            try:
                if isinstance(ev_map, dict):
                    for _items in ev_map.values():
                        for it in _items or []:
                            if not it.get("document_id"):
                                it["document_id"] = (
                                    source_payload.get("document_id") or "original_text"
                                )
            except Exception:
                pass
            if isinstance(ev_map, dict) and ev_map:
                for trait in (
                    "goals_and_motivations",
                    "challenges_and_frustrations",
                    "demographics",
                    "key_quotes",
                ):
                    items = ev_map.get(trait) or []
                    if isinstance(p2.get(trait), dict):
                        tv = dict(p2[trait])
                        # prefer EV2 items for UI when available; override legacy evidence
                        if items:
                            # Guardrail: coerce falsy document_id to "original_text"
                            safe_items = []
                            for it in items:
                                if isinstance(it, dict):
                                    it2 = dict(it)
                                    if not (it2.get("document_id") or "").strip():
                                        it2["document_id"] = "original_text"
                                    safe_items.append(it2)
                                else:
                                    safe_items.append(it)
                            tv["evidence"] = safe_items
                            p2[trait] = tv
                            # Also hydrate populated_traits if present (frontend may prefer this path)
                            try:
                                if isinstance(p2.get("populated_traits"), dict):
                                    pt = dict(p2.get("populated_traits") or {})
                                    if isinstance(pt.get(trait), dict):
                                        pt[trait] = dict(pt[trait])
                                        pt[trait]["evidence"] = safe_items
                                        p2["populated_traits"] = pt
                            except Exception:
                                pass
            hydrated_personas.append(p2)
        flattened["personas"] = hydrated_personas
    except Exception:
        pass

    # Strict persona EV2 gating: drop or flag personas lacking complete EV2 items
    try:
        strict_gate = os.getenv("STRICT_PERSONA_EV2_GATING", "true").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        if strict_gate:
            gated: list = []
            rejected: list = []

            def _is_complete_item(it: dict) -> bool:
                return (
                    isinstance(it.get("start_char"), int)
                    and isinstance(it.get("end_char"), int)
                    and isinstance((it.get("speaker") or "").strip(), str)
                )

            for p in flattened.get("personas", []):
                if not isinstance(p, dict):
                    continue
                ev2 = p.get("_evidence_linking_v2") or {}
                ev_map = ev2.get("evidence_map") or {}
                # Evaluate core traits only
                core = [
                    (ev_map.get("goals_and_motivations") or []),
                    (ev_map.get("challenges_and_frustrations") or []),
                    (ev_map.get("demographics") or []),
                ]
                has_any = any(len(lst) > 0 for lst in core)
                all_items_valid = all(
                    _is_complete_item(it) for lst in core for it in lst
                )
                if has_any and all_items_valid:
                    gated.append(p)
                else:
                    # Mark and drop
                    try:
                        p2 = dict(p)
                        p2["quality_status"] = "unverified_ev2"
                        rejected.append(p2)
                    except Exception:
                        rejected.append(p)
            if gated:
                flattened["personas"] = gated
            # expose debug metadata for observability
            flattened.setdefault("_debug", {})["ev2_rejected_personas"] = [
                (p.get("name") if isinstance(p, dict) else str(p)) for p in rejected
            ]
    except Exception:
        pass

    if isinstance(flattened.get("personas"), list):
        enriched_personas = []
        for p in flattened["personas"]:
            try:
                si = (
                    (p.get("stakeholder_intelligence") or {})
                    if isinstance(p, dict)
                    else {}
                )
                if should_compute_influence_metrics(si):
                    metrics = compute_influence_metrics_for_persona(p or {})
                    if not isinstance(si, dict):
                        si = {}
                    si["influence_metrics"] = metrics
                    p2 = dict(p or {})
                    p2["stakeholder_intelligence"] = si
                    enriched_personas.append(p2)
                else:
                    enriched_personas.append(p)
            except Exception:
                enriched_personas.append(p)
        flattened["personas"] = enriched_personas

    # Stakeholder intelligence (UI-safe)
    stakeholder_intelligence_src = getattr(
        row, "stakeholder_intelligence", None
    ) or results_dict.get("stakeholder_intelligence")
    enable_ms = os.getenv("ENABLE_MULTI_STAKEHOLDER", "false").lower() == "true"
    si = None
    if enable_ms:
        si = (
            create_ui_safe_stakeholder_intelligence(stakeholder_intelligence_src)
            if stakeholder_intelligence_src
            else None
        )
        if si is None and isinstance(flattened.get("personas"), list):
            si = {
                "detected_stakeholders": derive_detected_stakeholders_from_personas(
                    flattened["personas"]
                )
            }

    # Compute validation summary using PersonaEvidenceValidator
    validation_summary = None
    validation_status = None
    confidence_components = None
    try:
        if personas_ssot:
            from backend.services.validation.persona_evidence_validator import (
                PersonaEvidenceValidator,
            )

            validator = PersonaEvidenceValidator()
            all_matches = []
            all_dup = {"duplicates": [], "cross_trait_reuse": []}
            transcript = source_payload.get("transcript")
            original_text = source_payload.get("original_text") or ""

            for p in personas_ssot:
                if not isinstance(p, dict):
                    continue
                matches = validator.match_evidence(
                    persona_ssot=p,
                    source_text=original_text,
                    transcript=(transcript if isinstance(transcript, list) else None),
                )
                all_matches.extend(matches)
                dup = validator.detect_duplication(p)
                all_dup["duplicates"].extend(dup.get("duplicates", []))
                all_dup["cross_trait_reuse"].extend(dup.get("cross_trait_reuse", []))

            speaker_check = (
                validator.check_speaker_consistency(
                    p, transcript if isinstance(transcript, list) else None
                )
                if personas_ssot
                else {"speaker_mismatches": []}
            )
            contamination = validator.detect_contamination(personas_ssot)
            summary = validator.summarize(
                all_matches,
                duplication=all_dup,
                speaker_check=speaker_check,
                contamination=contamination,
            )
            validation_summary = {
                "counts": summary.get("counts", {}),
                "method": "persona_evidence_validator_v1",
                "speaker_mismatches": len(
                    summary.get("speaker_check", {}).get("speaker_mismatches", [])
                ),
                "contamination": summary.get("contamination", {}),
            }
            status = validator.compute_status(summary)
            validation_status = "pass" if status == "PASS" else "warning"
            confidence_components = validator.compute_confidence_components(summary)
    except Exception:
        pass

    # Assemble inner formatted payload (legacy-compatible shape)
    payload: Dict[str, Any] = {
        "status": row.status or results_dict.get("status", "completed"),
        "result_id": row.result_id,
        "id": str(row.result_id),
        "analysis_date": row.analysis_date,
        "createdAt": row.analysis_date,
        "fileName": get_filename_for_data_id(db, row.data_id),
        "fileSize": None,
        "llmProvider": row.llm_provider,
        "llmModel": row.llm_model,
        **flattened,
        "source": source_payload,
    }
    if si is not None and (
        os.getenv("ENABLE_MULTI_STAKEHOLDER", "false").lower() == "true"
    ):
        payload["stakeholder_intelligence"] = si
    if personas_ssot:
        payload["personas_ssot"] = personas_ssot
    if validation_summary is not None:
        payload["validation_summary"] = validation_summary
        payload["validation_status"] = validation_status
        payload["confidence_components"] = confidence_components

    # Wrap in ResultResponse envelope to preserve API contract
    return {
        "status": payload.get("status", "completed"),
        "result_id": row.result_id,
        "analysis_date": row.analysis_date,
        "results": payload,
        "llm_provider": row.llm_provider,
        "llm_model": row.llm_model,
    }
