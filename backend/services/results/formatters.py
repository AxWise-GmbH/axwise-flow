from __future__ import annotations

from typing import Any, Dict, List


from .formatting import (
    extract_sentiment_statements_from_data,
    create_ui_safe_stakeholder_intelligence,
    filter_researcher_evidence_for_ssot,
    inject_age_ranges_from_source,
    assemble_flattened_results,
    build_source_payload,
    get_filename_for_data_id,
    compute_influence_metrics_for_persona,
    should_compute_influence_metrics,
    derive_detected_stakeholders_from_personas,
    adjust_theme_frequencies_for_prevalence,
)
from .formatting.themes import adjust_theme_frequencies_with_persona_evidence
