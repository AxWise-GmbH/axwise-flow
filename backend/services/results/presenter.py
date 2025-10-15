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
            original_text = source_payload.get("original_text") if isinstance(source_payload, dict) else None
            if isinstance(original_text, str) and original_text.strip():
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
                        "document_id": source_payload.get("document_id") or "original_text",
                    }
                    hydrated = []
                    for p in flattened.get("personas", []):
                        if not isinstance(p, dict):
                            hydrated.append(p)
                            continue
                        if not p.get("_evidence_linking_v2"):
                            try:
                                enhanced, evmap = ev.link_evidence_to_attributes_v2(
                                    p, scoped_text=original_text, scope_meta=scope_meta, protect_key_quotes=True
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
