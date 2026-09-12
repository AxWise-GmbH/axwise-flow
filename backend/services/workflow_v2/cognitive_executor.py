"""Cognitive operation dispatcher and provider adapters. Pure quality logic lives in cognitive/."""

from __future__ import annotations
import asyncio
import hashlib
import hmac
import logging
import os
import re
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Generic, Literal, Protocol, Sequence, TypeVar
from urllib.parse import unquote, urlparse
from uuid import NAMESPACE_URL, UUID, uuid5
from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent, ModelRetry, PromptedOutput, RunContext
from pydantic_ai.exceptions import ToolRetryError, UnexpectedModelBehavior
from backend.domain.workflow_v2.contracts import (
    ASSISTANT_CONTEXT_TRUNCATION_MARKER,
    AcceptedDeliverableProfileV1,
    AcceptedDeliverableRequirementV1,
    AdmitTranscriptCorpusInputV1,
    AnalyzeEvidenceInputV1,
    ArtifactFact,
    ArtifactRef,
    ArtifactSynthesizedResult,
    AssistantTurnInputV1,
    AxWiseOperationEnvelope,
    CompileScopeInputV2,
    CompileScopeInputV3,
    DeliverableAcceptanceCriterionV1,
    EvaluationArtifactFact,
    EvaluationCompletedResult,
    EvaluationResultV1,
    EvidenceAcquisitionPassV1,
    EvidenceClaimV1,
    EvidenceFinding,
    EvidenceRequirement,
    ExecuteResearchInputV2,
    FinalArtifactV1,
    FinalMarkdownArtifactFact,
    ImmutableArtifactContent,
    OperationMetrics,
    PlanningResultV2,
    PrepareSolutionCompletedResult,
    PrepareSolutionInputV1,
    PrepareSolutionInputV2,
    ReaderOutputContractV1,
    RequirementCoverageV1,
    ResearchArtifactFact,
    ResearchCompletedResult,
    ResearchResultV2,
    ResearchSourceV1,
    ReviseScopeInputV2,
    ScopeArtifactFact,
    ScopeArtifactV2,
    ScopeAuthority,
    ScopeCompiledResult,
    SimulateInputV1,
    SelectedEvidenceArtifactV1,
    SourceAppendixEntryV1,
    SourceSpan,
    SynthesizeArtifactInputV1,
    TaskCompletedResult,
    TaskResultArtifactFact,
    TaskResultV2,
    TopicAnchor,
    WorkflowOutputContractV1,
    WorkflowOutputContractV2,
    artifact_content_hash,
    canonical_hash,
    canonical_json,
    is_canonical_public_https_url,
    render_assistant_context_request,
    utf16_length,
    utf16_ordinal_sorted,
    utf16_slice,
)
from backend.services.llm.gemini_runtime import (
    RESEARCH_MODEL,
    exact_uniform_model_version_from_result,
    get_shared_workflow_model,
)
from backend.services.workflow_v2.assistant import (
    AssistantTurnService,
    PydanticAIConversationalAssistantRunner,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.analysis_service import (
    AnalysisGenerator,
    AnalysisOperationHandler,
)
from backend.services.workflow_v2.simulation_operation_handler import (
    SimulationOperationHandler,
)
from backend.services.workflow_v2.simulation_service import SimulationGenerator
from backend.services.workflow_v2.solution_preparation import (
    PydanticAINativeSolutionPreparer,
    PydanticAISolutionPreparer,
)

# Explicit compatibility exports keep existing integrations and fixtures stable.
from backend.services.workflow_v2.cognitive.evidence import (
    _assertions_share_explicit_polarity as _assertions_share_explicit_polarity,
    _claims_align_with_assertion as _claims_align_with_assertion,
    _complete_internal_acceptance_fixture as _complete_internal_acceptance_fixture,
    _deterministic_evidence_integrity_defects as _deterministic_evidence_integrity_defects,
    _evidence_clause_fragments as _evidence_clause_fragments,
    _expanded_support_tokens as _expanded_support_tokens,
    _handled_task_evidence_defect as _handled_task_evidence_defect,
    _internal_specification_language as _internal_specification_language,
    _is_bounded_specific_verification_action as _is_bounded_specific_verification_action,
    _is_bounded_unresolved_requirement_action as _is_bounded_unresolved_requirement_action,
    _is_hard_task_evidence_defect as _is_hard_task_evidence_defect,
    _is_pure_artifact_draft_withholding as _is_pure_artifact_draft_withholding,
    _is_pure_evidence_status_or_withholding as _is_pure_evidence_status_or_withholding,
    _is_pure_statutory_locator as _is_pure_statutory_locator,
    _is_safe_nonauthority_planning_directive as _is_safe_nonauthority_planning_directive,
    _launch_claim_is_negated_or_conditional as _launch_claim_is_negated_or_conditional,
    _local_prefix_for_negation as _local_prefix_for_negation,
    _materially_matches_unresolved_requirement as _materially_matches_unresolved_requirement,
    _normalized_launch_claim_text as _normalized_launch_claim_text,
    _normative_requirement_unit as _normative_requirement_unit,
    _permission_context_asserts_authority as _permission_context_asserts_authority,
    _planning_statement_body as _planning_statement_body,
    _precision_values as _precision_values,
    _split_unresolved_assertions as _split_unresolved_assertions,
    _support_tokens as _support_tokens,
    _unresolved_evidence_requirement_descriptions as _unresolved_evidence_requirement_descriptions,
    has_positive_launch_readiness_claim as has_positive_launch_readiness_claim,
)
from backend.services.workflow_v2.cognitive.markdown import (
    _appendix_matches_research as _appendix_matches_research,
    _bounded_source_section_label as _bounded_source_section_label,
    _citation_sections as _citation_sections,
    _deterministic_structural_integrity_defects as _deterministic_structural_integrity_defects,
    _evidence_markers as _evidence_markers,
    _fenced_markdown_line_indexes as _fenced_markdown_line_indexes,
    _final_repair_table_rows_by_header as _final_repair_table_rows_by_header,
    _final_repair_topology as _final_repair_topology,
    _final_repair_topology_defects as _final_repair_topology_defects,
    _has_server_owned_immutable_gap_bullet as _has_server_owned_immutable_gap_bullet,
    _immutable_gap_bullet as _immutable_gap_bullet,
    _incomplete_given_when_then_acceptance_blocks as _incomplete_given_when_then_acceptance_blocks,
    _is_evidence_status_heading as _is_evidence_status_heading,
    _is_server_owned_source_heading as _is_server_owned_source_heading,
    _markdown_heading_fragments as _markdown_heading_fragments,
    _markdown_heading_identities as _markdown_heading_identities,
    _markdown_heading_level as _markdown_heading_level,
    _markdown_heading_primary_identity as _markdown_heading_primary_identity,
    _markdown_headings as _markdown_headings,
    _markdown_with_fenced_bodies_blanked as _markdown_with_fenced_bodies_blanked,
    _markdown_with_source_appendix as _markdown_with_source_appendix,
    _markdown_without_matching_lines as _markdown_without_matching_lines,
    _model_owned_required_sections as _model_owned_required_sections,
    _reader_output_defects as _reader_output_defects,
    _required_section_identities as _required_section_identities,
    _source_appendix_entries as _source_appendix_entries,
    _task_fragment_parts as _task_fragment_parts,
)
from backend.services.workflow_v2.cognitive.models import (
    ArtifactResolver as ArtifactResolver,
    DraftAcceptanceCriterion as DraftAcceptanceCriterion,
    DraftDeliverableProfile as DraftDeliverableProfile,
    DraftSpan as DraftSpan,
    DraftTopicAnchor as DraftTopicAnchor,
    EvaluationDraft as EvaluationDraft,
    FinalRepairTopology as FinalRepairTopology,
    ModelOutput as ModelOutput,
    ResearchRunner as ResearchRunner,
    ScopeAuthoritySegmentV1 as ScopeAuthoritySegmentV1,
    ScopeDraft as ScopeDraft,
    ScopeDraftContext as ScopeDraftContext,
    ScopeDrafter as ScopeDrafter,
    ScopeReviser as ScopeReviser,
    ScopeRevisionContext as ScopeRevisionContext,
    ScopeRevisionDraft as ScopeRevisionDraft,
    ScopeV3DraftContext as ScopeV3DraftContext,
    SynthesisContext as SynthesisContext,
    SynthesisDraft as SynthesisDraft,
    SynthesisWriter as SynthesisWriter,
    TModelOutput as TModelOutput,
    TaskDraft as TaskDraft,
    _DraftModel as _DraftModel,
    _execution_agent_prompt_value as _execution_agent_prompt_value,
    _with_execution_agent_prompt as _with_execution_agent_prompt,
)
from backend.services.workflow_v2.cognitive.policy import (
    _DESIGN_CONSISTENCY_METHOD as _DESIGN_CONSISTENCY_METHOD,
    BLOCKED_REPORT_SYSTEM_PROMPT as BLOCKED_REPORT_SYSTEM_PROMPT,
    EVALUATION_SYSTEM_PROMPT as EVALUATION_SYSTEM_PROMPT,
    SCOPE_REVISION_SYSTEM_PROMPT as SCOPE_REVISION_SYSTEM_PROMPT,
    SCOPE_SYSTEM_PROMPT as SCOPE_SYSTEM_PROMPT,
    SCOPE_V3_SYSTEM_PROMPT as SCOPE_V3_SYSTEM_PROMPT,
    SYNTHESIS_SYSTEM_PROMPT as SYNTHESIS_SYSTEM_PROMPT,
    TASK_SYSTEM_PROMPT as TASK_SYSTEM_PROMPT,
    _ACCEPTANCE_CRITERIA_SECTION_HEADING as _ACCEPTANCE_CRITERIA_SECTION_HEADING,
    _ACTION_ASSERTED_TAIL as _ACTION_ASSERTED_TAIL,
    _ASCII_DECISION_DIAGRAM as _ASCII_DECISION_DIAGRAM,
    _ASSERTIVE_HEADING_PREDICATE as _ASSERTIVE_HEADING_PREDICATE,
    _ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS as _ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS,
    _ASSISTANT_PRIMARY_SEARCH_OPERATION_SECONDS as _ASSISTANT_PRIMARY_SEARCH_OPERATION_SECONDS,
    _ASSISTANT_PRIMARY_SEARCH_TOTAL_SECONDS as _ASSISTANT_PRIMARY_SEARCH_TOTAL_SECONDS,
    _AUTHORITY_PROCESS_EXECUTION as _AUTHORITY_PROCESS_EXECUTION,
    _AUTHORITY_PROCESS_OBJECT as _AUTHORITY_PROCESS_OBJECT,
    _BARE_NUMBER as _BARE_NUMBER,
    _BROAD_PLAN_DELIVERABLE_TERM as _BROAD_PLAN_DELIVERABLE_TERM,
    _CHECKLIST_PLAN_ARTIFACT_TYPES as _CHECKLIST_PLAN_ARTIFACT_TYPES,
    _CLAUSE_BREAK as _CLAUSE_BREAK,
    _COGNITIVE_BOUNDARY_PROMPT as _COGNITIVE_BOUNDARY_PROMPT,
    _COMPACT_NAMED_STATUTE_LOCATOR as _COMPACT_NAMED_STATUTE_LOCATOR,
    _COMPACT_NUMBERED_INSTRUMENT_LOCATOR as _COMPACT_NUMBERED_INSTRUMENT_LOCATOR,
    _CONDITIONAL_AUTHORITY_ASSERTION as _CONDITIONAL_AUTHORITY_ASSERTION,
    _CONDITIONAL_THEN_CANDIDATE as _CONDITIONAL_THEN_CANDIDATE,
    _CONDITIONAL_UI_BEHAVIOR as _CONDITIONAL_UI_BEHAVIOR,
    _COORDINATED_EXECUTION_CLAUSE as _COORDINATED_EXECUTION_CLAUSE,
    _COUNT_VALUE as _COUNT_VALUE,
    _CURRENCY_VALUE as _CURRENCY_VALUE,
    _DEFAULT_RESEARCH_CONCURRENCY as _DEFAULT_RESEARCH_CONCURRENCY,
    _DEFAULT_RESEARCH_DEADLINE_SECONDS as _DEFAULT_RESEARCH_DEADLINE_SECONDS,
    _DEFINITE_NEGATED_LEGAL_ASSERTION as _DEFINITE_NEGATED_LEGAL_ASSERTION,
    _DIRECT_CHECKLIST_TERM as _DIRECT_CHECKLIST_TERM,
    _DISPLAY_REQUIREMENT_ID as _DISPLAY_REQUIREMENT_ID,
    _EU_REGULATION_CELEX_URL as _EU_REGULATION_CELEX_URL,
    _EU_REGULATION_CONSLEG_URL as _EU_REGULATION_CONSLEG_URL,
    _EU_REGULATION_ELI_URL as _EU_REGULATION_ELI_URL,
    _EVIDENCE_CLAIM_ID as _EVIDENCE_CLAIM_ID,
    _EVIDENCE_SENSITIVE_ASSERTION as _EVIDENCE_SENSITIVE_ASSERTION,
    _EVIDENCE_STATUS_HEADING as _EVIDENCE_STATUS_HEADING,
    _EXECUTION_AGENT_PROFILE_BOUNDARY as _EXECUTION_AGENT_PROFILE_BOUNDARY,
    _EXPLICIT_ACCEPTANCE_BLOCK_HEADING as _EXPLICIT_ACCEPTANCE_BLOCK_HEADING,
    _EXPLICIT_AUTHORITY_NEGATION as _EXPLICIT_AUTHORITY_NEGATION,
    _EXPLICIT_CLAIM_NEGATION as _EXPLICIT_CLAIM_NEGATION,
    _EXPLICIT_ENUMERATION as _EXPLICIT_ENUMERATION,
    _EXPLICIT_EU_REGULATION_NUMBER_YEAR as _EXPLICIT_EU_REGULATION_NUMBER_YEAR,
    _EXPLICIT_EU_REGULATION_YEAR_NUMBER as _EXPLICIT_EU_REGULATION_YEAR_NUMBER,
    _EXPLICIT_NONFACTUAL_QUALIFIER as _EXPLICIT_NONFACTUAL_QUALIFIER,
    _EXPLICIT_PLANNING_TABLE_COLUMN as _EXPLICIT_PLANNING_TABLE_COLUMN,
    _EXPLICIT_PLANNING_TARGET_PREFIX as _EXPLICIT_PLANNING_TARGET_PREFIX,
    _EXPLICIT_PUBLISHER_RESTRICTION as _EXPLICIT_PUBLISHER_RESTRICTION,
    _EXPLICIT_UNRESOLVED_LABEL as _EXPLICIT_UNRESOLVED_LABEL,
    _EXPLICIT_VALIDATION_ACTION_PREFIX as _EXPLICIT_VALIDATION_ACTION_PREFIX,
    _FENCED_GATE_LABEL as _FENCED_GATE_LABEL,
    _FENCED_ROADMAP_ACTIVITY as _FENCED_ROADMAP_ACTIVITY,
    _FENCED_ROADMAP_LABEL as _FENCED_ROADMAP_LABEL,
    _FENCED_TREE_ROADMAP_ACTIVITY as _FENCED_TREE_ROADMAP_ACTIVITY,
    _FENCED_TREE_ROADMAP_PERIOD as _FENCED_TREE_ROADMAP_PERIOD,
    _FINAL_REPAIR_NUMBERED_LABEL as _FINAL_REPAIR_NUMBERED_LABEL,
    _FORMULA_MARKER as _FORMULA_MARKER,
    _GIVEN_WHEN_THEN_INLINE_ROLE as _GIVEN_WHEN_THEN_INLINE_ROLE,
    _GIVEN_WHEN_THEN_ROLE_LINE as _GIVEN_WHEN_THEN_ROLE_LINE,
    _IMMUTABLE_GAP_SECTION_HEADINGS as _IMMUTABLE_GAP_SECTION_HEADINGS,
    _INDEPENDENT_SENSITIVE_FACT as _INDEPENDENT_SENSITIVE_FACT,
    _INLINE_GWT_ROLE_BREAK as _INLINE_GWT_ROLE_BREAK,
    _INTERNAL_PLANNING_TARGET as _INTERNAL_PLANNING_TARGET,
    _ISO_DATE_VALUE as _ISO_DATE_VALUE,
    _JTBD_LABEL as _JTBD_LABEL,
    _LAUNCH_CLAUSE_BREAK as _LAUNCH_CLAUSE_BREAK,
    _MARKDOWN_HEADING as _MARKDOWN_HEADING,
    _MARKDOWN_HEADING_ORDINAL as _MARKDOWN_HEADING_ORDINAL,
    _MARKDOWN_HEADING_TRAILING_QUALIFIER as _MARKDOWN_HEADING_TRAILING_QUALIFIER,
    _MARKDOWN_LIST_ITEM as _MARKDOWN_LIST_ITEM,
    _MARKDOWN_TABLE_SEPARATOR_CELL as _MARKDOWN_TABLE_SEPARATOR_CELL,
    _MAX_EVIDENCE_REQUIREMENTS as _MAX_EVIDENCE_REQUIREMENTS,
    _MAX_RESEARCH_CONCURRENCY as _MAX_RESEARCH_CONCURRENCY,
    _MAX_RESEARCH_DEADLINE_SECONDS as _MAX_RESEARCH_DEADLINE_SECONDS,
    _MAX_REUSABLE_SOURCE_CANDIDATES as _MAX_REUSABLE_SOURCE_CANDIDATES,
    _MIN_RESEARCH_CONCURRENCY as _MIN_RESEARCH_CONCURRENCY,
    _MIN_RESEARCH_DEADLINE_SECONDS as _MIN_RESEARCH_DEADLINE_SECONDS,
    _NONPROVISIONAL_AUTHORITY_ASSERTION as _NONPROVISIONAL_AUTHORITY_ASSERTION,
    _NONSTATUTORY_AUTHORITY_SEMANTICS as _NONSTATUTORY_AUTHORITY_SEMANTICS,
    _NONSTATUTORY_AUTHORITY_SOURCE_TYPES as _NONSTATUTORY_AUTHORITY_SOURCE_TYPES,
    _NON_DISTINCTIVE_REQUIREMENT_ACRONYMS as _NON_DISTINCTIVE_REQUIREMENT_ACRONYMS,
    _NON_ENUMERATION_COUNT_UNIT as _NON_ENUMERATION_COUNT_UNIT,
    _NUMBERED_GATE_LINE as _NUMBERED_GATE_LINE,
    _OFFICIAL_SOURCE_CLASSES_BY_HOST as _OFFICIAL_SOURCE_CLASSES_BY_HOST,
    _OPERATIONAL_PLAN_DELIVERABLE_TERM as _OPERATIONAL_PLAN_DELIVERABLE_TERM,
    _OVERBROAD_PUBLICATION_GROUNDING_CLAIM as _OVERBROAD_PUBLICATION_GROUNDING_CLAIM,
    _OWNER_ARTIFACT_CONVERSION as _OWNER_ARTIFACT_CONVERSION,
    _OWNER_ARTIFACT_DIRECTIVE as _OWNER_ARTIFACT_DIRECTIVE,
    _OWNER_ARTIFACT_TERMS as _OWNER_ARTIFACT_TERMS,
    _PLANNING_ARTIFACT_TYPES as _PLANNING_ARTIFACT_TYPES,
    _PLANNING_TARGET_EXTERNAL_STATUS_ASSERTION as _PLANNING_TARGET_EXTERNAL_STATUS_ASSERTION,
    _PLANNING_TARGET_EXTERNAL_SUBJECT as _PLANNING_TARGET_EXTERNAL_SUBJECT,
    _PLANNING_TARGET_OBLIGATION_ASSERTION as _PLANNING_TARGET_OBLIGATION_ASSERTION,
    _PLANNING_TARGET_PRODUCT_STATUS_ASSERTION as _PLANNING_TARGET_PRODUCT_STATUS_ASSERTION,
    _POSITIVE_AUTHORITY_PREDICATE as _POSITIVE_AUTHORITY_PREDICATE,
    _POSITIVE_LAUNCH_CLAIM_PATTERNS as _POSITIVE_LAUNCH_CLAIM_PATTERNS,
    _PRD_BASELINE_SECTIONS as _PRD_BASELINE_SECTIONS,
    _PRD_REQUIRED_SECTION_ALIASES as _PRD_REQUIRED_SECTION_ALIASES,
    _PRECISE_VALUE as _PRECISE_VALUE,
    _PRODUCT_PRD_SEMANTIC_METHOD as _PRODUCT_PRD_SEMANTIC_METHOD,
    _PROJECTED_STATUTORY_LOCATOR_HEADER as _PROJECTED_STATUTORY_LOCATOR_HEADER,
    _PUBLICATION_EVIDENCE_STATUS_BLOCK as _PUBLICATION_EVIDENCE_STATUS_BLOCK,
    _PUBLICATION_UNKNOWN_PENDING_ITEM as _PUBLICATION_UNKNOWN_PENDING_ITEM,
    _PUBLICATION_UNKNOWN_PENDING_PREFIX as _PUBLICATION_UNKNOWN_PENDING_PREFIX,
    _PUBLICATION_VERIFICATION_ACTION as _PUBLICATION_VERIFICATION_ACTION,
    _PURE_ARTIFACT_NONAUTHORIZATION as _PURE_ARTIFACT_NONAUTHORIZATION,
    _PURE_DRAFT_NONAUTHORIZATION as _PURE_DRAFT_NONAUTHORIZATION,
    _PURE_NEGATED_ARTIFACT_ACTION as _PURE_NEGATED_ARTIFACT_ACTION,
    _PURE_NOT_LAUNCH_READY_STATUS as _PURE_NOT_LAUNCH_READY_STATUS,
    _PURE_REMEDIATION_CONTROL_BOUNDARY as _PURE_REMEDIATION_CONTROL_BOUNDARY,
    _PURE_TRAILING_EVIDENCE_STATUS as _PURE_TRAILING_EVIDENCE_STATUS,
    _PURE_VERIFICATION_DIRECTIVE as _PURE_VERIFICATION_DIRECTIVE,
    _PURE_WITHHOLDING_DIRECTIVE as _PURE_WITHHOLDING_DIRECTIVE,
    _PURE_WITHHOLDING_REQUIREMENT as _PURE_WITHHOLDING_REQUIREMENT,
    _RAW_EVIDENCE_MARKER as _RAW_EVIDENCE_MARKER,
    _REVIEW_AGAINST_AUTHORITY as _REVIEW_AGAINST_AUTHORITY,
    _REVIEW_AUTHORITY_LOWERCASE_WORDS as _REVIEW_AUTHORITY_LOWERCASE_WORDS,
    _REVIEW_AUTHORITY_TERMINAL as _REVIEW_AUTHORITY_TERMINAL,
    _REVIEW_COORDINATED_TAIL as _REVIEW_COORDINATED_TAIL,
    _SAFE_BOUNDED_PLANNING_SAMPLE_TAIL as _SAFE_BOUNDED_PLANNING_SAMPLE_TAIL,
    _SAFE_EPISTEMIC_SUBJECT as _SAFE_EPISTEMIC_SUBJECT,
    _SAFE_NONAUTHORITY_PLANNING_DIRECTIVE as _SAFE_NONAUTHORITY_PLANNING_DIRECTIVE,
    _SAFE_SYNTHESIS_VALIDATION_REASONS as _SAFE_SYNTHESIS_VALIDATION_REASONS,
    _SAFE_VERIFICATION_QUESTION_END as _SAFE_VERIFICATION_QUESTION_END,
    _SERVER_GWT_PLACEHOLDER_BODIES as _SERVER_GWT_PLACEHOLDER_BODIES,
    _SERVER_OWNED_SOURCE_HEADING as _SERVER_OWNED_SOURCE_HEADING,
    _SERVER_SPECIFIC_VERIFICATION_ACTION as _SERVER_SPECIFIC_VERIFICATION_ACTION,
    _SERVER_UNVERIFIED_VALIDATION_TARGET as _SERVER_UNVERIFIED_VALIDATION_TARGET,
    _SERVER_UNVERIFIED_VALIDATION_TARGET_INLINE as _SERVER_UNVERIFIED_VALIDATION_TARGET_INLINE,
    _SERVER_UNVERIFIED_VALIDATION_TARGET_PARTS as _SERVER_UNVERIFIED_VALIDATION_TARGET_PARTS,
    _SERVER_VALIDATION_ACTION as _SERVER_VALIDATION_ACTION,
    _SOFTWARE_PRD_BASELINE_SECTIONS as _SOFTWARE_PRD_BASELINE_SECTIONS,
    _SOURCE_CLASS_PRIORITY as _SOURCE_CLASS_PRIORITY,
    _STATUTE_TITLE_TOKEN as _STATUTE_TITLE_TOKEN,
    _STATUTORY_LOCATOR_COLUMN as _STATUTORY_LOCATOR_COLUMN,
    _STATUTORY_PROVISION_KEY as _STATUTORY_PROVISION_KEY,
    _STATUTORY_PROVISION_VALUE as _STATUTORY_PROVISION_VALUE,
    _STATUTORY_SEMANTICS as _STATUTORY_SEMANTICS,
    _STATUTORY_SOURCE_TYPES as _STATUTORY_SOURCE_TYPES,
    _SUPPORT_STOPWORDS as _SUPPORT_STOPWORDS,
    _SUPPORT_TOKEN as _SUPPORT_TOKEN,
    _TASK_FRAGMENT_PREFIX as _TASK_FRAGMENT_PREFIX,
    _TASK_GWT_ROLE_START as _TASK_GWT_ROLE_START,
    _TOP_LEVEL_MARKDOWN_CHECKLIST_ITEM as _TOP_LEVEL_MARKDOWN_CHECKLIST_ITEM,
    _TOP_LEVEL_MARKDOWN_ITEM as _TOP_LEVEL_MARKDOWN_ITEM,
    _TRANSIENT_EVIDENCE_ACQUISITION_STATUSES as _TRANSIENT_EVIDENCE_ACQUISITION_STATUSES,
    _UNAMBIGUOUS_STATUTORY_CLAIM_TYPES as _UNAMBIGUOUS_STATUTORY_CLAIM_TYPES,
    _UNICODE_DASHES as _UNICODE_DASHES,
    _UNRESOLVED_AUTHORITY_MATCH_TOKENS as _UNRESOLVED_AUTHORITY_MATCH_TOKENS,
    _UNRESOLVED_AUTHORITY_QUALIFIER as _UNRESOLVED_AUTHORITY_QUALIFIER,
    _UNRESOLVED_AUTHORITY_SIGNAL as _UNRESOLVED_AUTHORITY_SIGNAL,
    _UNRESOLVED_BOUNDARY as _UNRESOLVED_BOUNDARY,
    _UNRESOLVED_CONDITIONAL_RECORDED_OUTCOME as _UNRESOLVED_CONDITIONAL_RECORDED_OUTCOME,
    _UNRESOLVED_CONDITIONAL_UNRESOLVED_OUTCOME as _UNRESOLVED_CONDITIONAL_UNRESOLVED_OUTCOME,
    _UNRESOLVED_CONDITIONAL_WITHHOLDING_OUTCOME as _UNRESOLVED_CONDITIONAL_WITHHOLDING_OUTCOME,
    _UNRESOLVED_LABELED_ACTION as _UNRESOLVED_LABELED_ACTION,
    _UNRESOLVED_POSITIVE_AUTHORITY_ASSERTION as _UNRESOLVED_POSITIVE_AUTHORITY_ASSERTION,
    _UNRESOLVED_REQUIREMENT_ACTION as _UNRESOLVED_REQUIREMENT_ACTION,
    _UNRESOLVED_REQUIREMENT_CONTEXT as _UNRESOLVED_REQUIREMENT_CONTEXT,
    _UNRESOLVED_UNSUPPORTED_FACT_PREFIX as _UNRESOLVED_UNSUPPORTED_FACT_PREFIX,
    _VALIDATION_INFORMATION_ACTION as _VALIDATION_INFORMATION_ACTION,
    _VERIFICATION_QUESTION_PREDICATE as _VERIFICATION_QUESTION_PREDICATE,
    _WORKFLOW_V2_PRIMARY_SEARCH_ATTEMPT_SECONDS as _WORKFLOW_V2_PRIMARY_SEARCH_ATTEMPT_SECONDS,
    _WORKFLOW_V2_PRIMARY_SEARCH_OPERATION_SECONDS as _WORKFLOW_V2_PRIMARY_SEARCH_OPERATION_SECONDS,
    _WORKFLOW_V2_PRIMARY_SEARCH_TOTAL_SECONDS as _WORKFLOW_V2_PRIMARY_SEARCH_TOTAL_SECONDS,
)
from backend.services.workflow_v2.cognitive.publication import (
    _with_advisory_planning_review as _with_advisory_planning_review,
    _as_publication_unknown_item as _as_publication_unknown_item,
    _as_unresolved_validation_action as _as_unresolved_validation_action,
    _as_unverified_repair_assumption as _as_unverified_repair_assumption,
    _decorate_publication_draft as _decorate_publication_draft,
    _deterministic_blocked_report as _deterministic_blocked_report,
    _immutable_claim_covers_publication_assertion as _immutable_claim_covers_publication_assertion,
    _is_pure_review_authority as _is_pure_review_authority,
    _normalize_publication_draft as _normalize_publication_draft,
    _normalize_reader_draft as _normalize_reader_draft,
    _prepare_task_draft_for_execution as _prepare_task_draft_for_execution,
    _prepare_task_draft_for_validation as _prepare_task_draft_for_validation,
    _prepare_task_unresolved_actions as _prepare_task_unresolved_actions,
    _project_fenced_ascii_roadmaps as _project_fenced_ascii_roadmaps,
    _project_final_repair_base as _project_final_repair_base,
    _project_pre_adoption_review_conditions as _project_pre_adoption_review_conditions,
    _project_reader_output_draft as _project_reader_output_draft,
    _project_redundant_unsupported_gate_diagrams as _project_redundant_unsupported_gate_diagrams,
    _project_remaining_evidence_defects as _project_remaining_evidence_defects,
    _project_server_validation_scaffolding as _project_server_validation_scaffolding,
    _project_statutory_locator_tables as _project_statutory_locator_tables,
    _project_strict_final_fallback as _project_strict_final_fallback,
    _project_strict_task_fallback as _project_strict_task_fallback,
    _projection_evidence_defects as _projection_evidence_defects,
    _publication_unknown_item as _publication_unknown_item,
    _publication_unknown_item_inline as _publication_unknown_item_inline,
    _repair_final_gwt_evidence_assertions as _repair_final_gwt_evidence_assertions,
    _with_accepted_requirement_traceability as _with_accepted_requirement_traceability,
    _with_canonical_acceptance_criteria as _with_canonical_acceptance_criteria,
    _with_immutable_gap_labels as _with_immutable_gap_labels,
    _with_normalized_task_requirement_coverage as _with_normalized_task_requirement_coverage,
    _with_task_evidence_status_section as _with_task_evidence_status_section,
    _without_empty_noncontract_subheadings as _without_empty_noncontract_subheadings,
    _without_forbidden_task_launch_claim_lines as _without_forbidden_task_launch_claim_lines,
    _without_mismatched_publication_evidence_markers as _without_mismatched_publication_evidence_markers,
    _without_model_owned_task_appendix as _without_model_owned_task_appendix,
    _without_unbound_task_evidence_markers as _without_unbound_task_evidence_markers,
)
from backend.services.workflow_v2.cognitive.scope import (
    _authority_payload as _authority_payload,
    _canonical_artifact_type as _canonical_artifact_type,
    _canonical_required_sections as _canonical_required_sections,
    _effective_requirement_blocking as _effective_requirement_blocking,
    _explicit_eu_regulation_identities as _explicit_eu_regulation_identities,
    _explicit_eu_regulation_url_identities as _explicit_eu_regulation_url_identities,
    _explicit_owner_artifact_intent as _explicit_owner_artifact_intent,
    _first_owner_artifact_mention as _first_owner_artifact_mention,
    _has_explicit_enumeration_mismatch as _has_explicit_enumeration_mismatch,
    _normalized_semantic_text as _normalized_semantic_text,
    _permitted_nonblocking_evidence_gap_requirement_ids as _permitted_nonblocking_evidence_gap_requirement_ids,
    _project_deliverable_contract as _project_deliverable_contract,
    _requirement_has_statutory_force as _requirement_has_statutory_force,
    _scope_semantics_payload as _scope_semantics_payload,
    _scope_v3_draft_context as _scope_v3_draft_context,
    _source_span as _source_span,
    _span_is_inside_source_content as _span_is_inside_source_content,
    _standalone_checklist_deliverable as _standalone_checklist_deliverable,
    _validate_allowed_source_host_authority as _validate_allowed_source_host_authority,
    _validate_atomic_evidence_requirements as _validate_atomic_evidence_requirements,
    _validate_draft as _validate_draft,
    _validate_revision_draft as _validate_revision_draft,
    _validate_v3_draft as _validate_v3_draft,
)
from backend.services.workflow_v2.cognitive.sources import (
    _ResearchSourceLocator as _ResearchSourceLocator,
    _canonical_retrieval_date as _canonical_retrieval_date,
    _claim_from_grounding as _claim_from_grounding,
    _claims_with_source_catalogue as _claims_with_source_catalogue,
    _classify_source_record as _classify_source_record,
    _classify_source_types as _classify_source_types,
    _merge_source_catalogue as _merge_source_catalogue,
    _model_version_from_search as _model_version_from_search,
    _normalized_source_type as _normalized_source_type,
    _repair_source_candidates as _repair_source_candidates,
    _source_locator as _source_locator,
    _source_snapshot as _source_snapshot,
    _uniform_model_version as _uniform_model_version,
    _url_matches_allowed_hosts as _url_matches_allowed_hosts,
    _usage_from_search as _usage_from_search,
)
from backend.services.workflow_v2.cognitive.validation import (
    SynthesisValidationError as SynthesisValidationError,
    _FINAL_VALIDATION_COUNT_KEYS as _FINAL_VALIDATION_COUNT_KEYS,
    _FINAL_VALIDATION_REASON_CODES as _FINAL_VALIDATION_REASON_CODES,
    _MAX_FINAL_VALIDATION_COUNT as _MAX_FINAL_VALIDATION_COUNT,
    _SAFE_FINAL_VALIDATION_PREFIXES as _SAFE_FINAL_VALIDATION_PREFIXES,
    _contains_server_deliverable_placeholder as _contains_server_deliverable_placeholder,
    _contains_server_unverified_validation_target as _contains_server_unverified_validation_target,
    _deterministic_quality_defects as _deterministic_quality_defects,
    _is_advisory_planning_evidence_defect as _is_advisory_planning_evidence_defect,
    _safe_synthesis_validation_failure as _safe_synthesis_validation_failure,
    _validate_synthesis as _validate_synthesis,
    _validate_task_draft as _validate_task_draft,
    _valid_final_validation_counts as _valid_final_validation_counts,
    safe_synthesis_validation_details as safe_synthesis_validation_details,
)


def _research_time() -> float:
    return asyncio.get_running_loop().time()


def _usage_from_result(result: Any) -> tuple[int, int]:
    usage_member = getattr(result, "usage", None)
    usage_value = usage_member() if callable(usage_member) else usage_member
    return (
        int(getattr(usage_value, "input_tokens", 0) or 0),
        int(getattr(usage_value, "output_tokens", 0) or 0),
    )


def _unwrap_model_output(
    value: ModelOutput[TModelOutput] | TModelOutput,
) -> tuple[TModelOutput, int, int, str | None]:
    if isinstance(value, ModelOutput):
        return (
            value.value,
            value.input_tokens,
            value.output_tokens,
            value.model_version,
        )
    return value, 0, 0, None


def _estimated_cost_micros(
    input_tokens: int,
    output_tokens: int,
    search_calls: int = 0,
) -> int | None:
    input_rate = os.getenv("GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS")
    output_rate = os.getenv("GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS")
    if input_rate is None or output_rate is None:
        return None
    try:
        parsed_input_rate = int(input_rate)
        parsed_output_rate = int(output_rate)
        if parsed_input_rate < 0 or parsed_output_rate < 0:
            return None
        token_numerator = (
            input_tokens * parsed_input_rate + output_tokens * parsed_output_rate
        )
        search_cost = 0
        if search_calls:
            search_rate = os.getenv("GEMINI_SEARCH_COST_MICROS_PER_QUERY")
            if search_rate is None or int(search_rate) < 0:
                return None
            search_cost = search_calls * int(search_rate)
    except ValueError:
        return None
    return max(0, token_numerator // 1_000_000 + search_cost)


def _logged_failure_diagnostics(
    envelope: AxWiseOperationEnvelope,
    *,
    route: str,
    status: str,
    input_tokens: int,
    output_tokens: int,
) -> dict[str, str]:
    """Keep SQL003 diagnostics strict; known usage belongs in content-free logs."""

    usage = {
        name: value
        for name, value in (
            ("input_tokens", input_tokens),
            ("output_tokens", output_tokens),
        )
        if type(value) is int and 0 <= value <= 2_000_000
    }
    if len(usage) == 2 and input_tokens + output_tokens <= 2_000_000:
        usage["total_tokens"] = input_tokens + output_tokens
    logging.getLogger(__name__).warning(
        "cognitive_failure_usage %s",
        canonical_json(
            {
                "operation_id": str(envelope.operation_id),
                "route": route,
                "status": status,
                **usage,
                "known_usage_only": True,
                "billing_reconciled": False,
            }
        ),
    )
    # The deployed safe_failure_diagnostics SQL function excludes token fields.
    # Do not widen that database contract merely to retain operator accounting.
    return {"route": route, "status": status}


def _log_final_contract_failure(
    envelope: AxWiseOperationEnvelope, markdown: str, error: ValueError
) -> None:
    """Identify the rejected candidate/rule without logging document or error prose."""
    logging.getLogger(__name__).warning(
        "final_contract_rejected %s",
        canonical_json(
            {
                "operation_id": str(envelope.operation_id),
                "candidate_sha256": hashlib.sha256(
                    markdown.encode("utf-8")
                ).hexdigest(),
                **safe_synthesis_validation_details(error),
            }
        ),
    )


def _operation_metrics(
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int | None = None,
    search_calls: int = 0,
    model_version: str | None = None,
) -> OperationMetrics:
    values: dict[str, Any] = {
        "latency_ms": 0,
        "provider": "google",
        "model": RESEARCH_MODEL,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": (
            input_tokens + output_tokens if total_tokens is None else total_tokens
        ),
        "search_calls": search_calls,
        "estimated_cost_micros": _estimated_cost_micros(
            input_tokens,
            output_tokens,
            search_calls,
        ),
    }
    if model_version is not None:
        values["model_version"] = model_version
    return OperationMetrics(**values)


class PydanticAIScopeDrafter:
    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            deps_type=ScopeDraftContext,
            output_type=PromptedOutput(ScopeDraft),
            system_prompt=SCOPE_SYSTEM_PROMPT,
            retries={"output": 2},
        )

        @self.agent.output_validator
        async def validate_output(
            ctx: RunContext[ScopeDraftContext], output: ScopeDraft
        ) -> ScopeDraft:
            try:
                _validate_draft(ctx.deps.request, output)
            except ValueError as error:
                raise ModelRetry(str(error)) from error
            return output

        self.v3_agent = Agent(
            model=model,
            deps_type=ScopeV3DraftContext,
            output_type=PromptedOutput(ScopeDraft),
            system_prompt=SCOPE_V3_SYSTEM_PROMPT,
            retries={"output": 2},
        )

        @self.v3_agent.output_validator
        async def validate_v3_output(
            ctx: RunContext[ScopeV3DraftContext], output: ScopeDraft
        ) -> ScopeDraft:
            try:
                _validate_draft(
                    ctx.deps.request,
                    output,
                    source_segments=ctx.deps.source_segments,
                    owner_authority_text=ctx.deps.owner_authority_text,
                    safe_default_constraints=ctx.deps.safe_default_constraints,
                )
            except ValueError as error:
                raise ModelRetry(str(error)) from error
            return output

    async def draft(
        self,
        input_value: CompileScopeInputV2 | CompileScopeInputV3,
        objective_context: list[str],
    ) -> ModelOutput[ScopeDraft]:
        if isinstance(input_value, CompileScopeInputV3):
            context = _scope_v3_draft_context(input_value)
            prompt_payload = {
                "CANONICAL_REQUEST_TEXT": input_value.request,
                "ASSISTANT_CONTEXT_METADATA": input_value.assistant_context.model_dump(
                    mode="json", by_alias=True
                ),
                "SAFE_DEFAULTS": input_value.safe_defaults.model_dump(
                    mode="json", by_alias=True
                ),
                "OBJECTIVE_CONTEXT": objective_context,
            }
            if context.execution_agent is not None:
                prompt_payload["EXECUTION_AGENT"] = context.execution_agent
            prompt = canonical_json(prompt_payload)
            result = await self.v3_agent.run(prompt, deps=context)
            _validate_v3_draft(input_value, result.output)
            input_tokens, output_tokens = _usage_from_result(result)
            return ModelOutput(
                result.output,
                input_tokens,
                output_tokens,
                exact_uniform_model_version_from_result(result),
            )

        prompt = canonical_json(
            {
                "REQUEST_TEXT": input_value.request,
                "SAFE_DEFAULTS": input_value.safe_defaults.model_dump(
                    mode="json", by_alias=True
                ),
                "OBJECTIVE_CONTEXT": objective_context,
            }
        )
        result = await self.agent.run(
            prompt,
            deps=ScopeDraftContext(request=input_value.request),
        )
        _validate_draft(input_value.request, result.output)
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(
            result.output,
            input_tokens,
            output_tokens,
            exact_uniform_model_version_from_result(result),
        )


class PydanticAIScopeReviser:
    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            deps_type=ScopeRevisionContext,
            output_type=PromptedOutput(ScopeRevisionDraft),
            system_prompt=SCOPE_REVISION_SYSTEM_PROMPT,
            retries={"output": 2},
        )

        @self.agent.output_validator
        async def validate_output(
            ctx: RunContext[ScopeRevisionContext], output: ScopeRevisionDraft
        ) -> ScopeRevisionDraft:
            try:
                _validate_revision_draft(
                    ctx.deps.correction, output, ctx.deps.accepted_scope
                )
            except ValueError as error:
                raise ModelRetry(str(error)) from error
            return output

    async def revise(
        self, input_value: ReviseScopeInputV2, accepted_scope: ScopeArtifactV2
    ) -> ModelOutput[ScopeRevisionDraft]:
        prompt = canonical_json(
            _with_execution_agent_prompt(
                {
                    "ACCEPTED_SCOPE": accepted_scope.model_dump(
                        mode="json", by_alias=True
                    ),
                    "OWNER_CORRECTION": input_value.correction,
                    "CORRECTION_SOURCE_SPANS": [
                        item.model_dump(mode="json", by_alias=True)
                        for item in input_value.correction_source_spans
                    ],
                },
                input_value,
            )
        )
        result = await self.agent.run(
            prompt,
            deps=ScopeRevisionContext(
                correction=input_value.correction,
                accepted_scope=accepted_scope,
            ),
        )
        _validate_revision_draft(input_value.correction, result.output, accepted_scope)
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(
            result.output,
            input_tokens,
            output_tokens,
            exact_uniform_model_version_from_result(result),
        )


def _blocked_report_output_contract(
    research: ResearchResultV2,
) -> WorkflowOutputContractV1:
    requirement_cores = [
        {
            "category": "evidence",
            "description": "State the exact blocked evidence decision.",
            "priority": "P0",
            "authority": "axwise_derived",
        },
        {
            "category": "evidence",
            "description": "Provide bounded remediation for every blocking finding.",
            "priority": "P0",
            "authority": "axwise_derived",
        },
    ]
    requirement_ids = utf16_ordinal_sorted(
        f"req-{canonical_hash(item)[:16]}" for item in requirement_cores
    )
    criterion_core = {
        "given": "Immutable research evidence is blocked.",
        "when": "The workflow produces the terminal evidence decision.",
        "then": (
            "The report states the no-go decision and exact remediation for every "
            "blocking finding."
        ),
        "supports": requirement_ids,
    }
    return WorkflowOutputContractV1(
        format="text/markdown",
        artifact_type="launch_authorization",
        required_sections=["Evidence decision", "Remediation plan"],
        requirement_ids=requirement_ids,
        rubric=[
            "Blocking evidence and uncertainty are explicit.",
            "Every blocking finding has a bounded remediation step.",
            "The launch decision cannot overclaim authority.",
        ],
        acceptance_criteria=[
            {
                "id": f"acc-{canonical_hash(criterion_core)[:16]}",
                **criterion_core,
            }
        ],
        evidence_readiness="blocked",
        launch_ready_allowed=False,
        source_appendix_required=bool(research.source_catalogue),
    )


class PydanticAISynthesisWriter:
    def __init__(self, model: Any) -> None:
        self.task_agent = Agent(
            model=model,
            deps_type=SynthesisContext,
            output_type=PromptedOutput(TaskDraft),
            system_prompt=TASK_SYSTEM_PROMPT,
            retries={"output": 2},
        )
        self.evaluation_agent = Agent(
            model=model,
            deps_type=SynthesisContext,
            output_type=PromptedOutput(EvaluationDraft),
            system_prompt=EVALUATION_SYSTEM_PROMPT,
            retries={"output": 2},
        )
        self.final_agent = Agent(
            model=model,
            deps_type=SynthesisContext,
            output_type=PromptedOutput(SynthesisDraft),
            system_prompt=SYNTHESIS_SYSTEM_PROMPT,
            retries={"output": 2},
        )
        self.blocked_agent = Agent(
            model=model,
            deps_type=SynthesisContext,
            output_type=PromptedOutput(SynthesisDraft),
            system_prompt=BLOCKED_REPORT_SYSTEM_PROMPT,
            retries={"output": 2},
        )

        @self.final_agent.output_validator
        async def validate_final_reader_output(
            ctx: RunContext[SynthesisContext], output: SynthesisDraft
        ) -> SynthesisDraft:
            if ctx.deps.reader_output is None:
                return output
            try:
                reader_draft = _normalize_reader_draft(ctx.deps, output)
            except SynthesisValidationError as error:
                raise ModelRetry(str(error)) from error
            reader_draft = _project_reader_output_draft(
                reader_draft, ctx.deps.reader_output
            )
            defects = _reader_output_defects(
                reader_draft.markdown, ctx.deps.reader_output
            )
            if defects:
                raise ModelRetry("; ".join(defects))
            return reader_draft

        @self.blocked_agent.output_validator
        async def validate_blocked_output(
            ctx: RunContext[SynthesisContext], output: SynthesisDraft
        ) -> SynthesisDraft:
            output = _with_immutable_gap_labels(ctx.deps, output)
            try:
                _validate_synthesis(ctx.deps, output)
            except ValueError as error:
                raise ModelRetry(str(error)) from error
            return output

    @staticmethod
    async def _run_validated_agent(
        agent: Any,
        prompt: str,
        context: SynthesisContext,
        *,
        phase: Literal["TASK", "EVALUATION", "FINAL", "BLOCKED_REPORT"],
    ) -> Any:
        try:
            return await agent.run(prompt, deps=context)
        except UnexpectedModelBehavior as error:
            failure = _safe_synthesis_validation_failure(error, phase=phase)
            if failure is None:
                raise
            raise failure from error

    @staticmethod
    def _accepted_claims(research_payload: dict[str, Any]) -> list[dict[str, Any]]:
        """Project only selected facts and dynamically verified claim spans."""

        verified_requirement_ids = {
            finding.get("requirementId")
            for finding in research_payload.get("findings", [])
            if isinstance(finding, dict)
            and finding.get("status") == "verified"
            and isinstance(finding.get("requirementId"), str)
        }
        claims = [
            *[
                claim
                for claim in research_payload.get("selectedClaims", [])
                if isinstance(claim, dict)
            ],
            *[
                claim
                for entry in research_payload.get("claimLedger", [])
                if isinstance(entry, dict)
                and entry.get("requirementId") in verified_requirement_ids
                for claim in entry.get("claims", [])
                if isinstance(claim, dict)
            ],
        ]
        claims_by_id = {
            claim["claimId"]: claim
            for claim in claims
            if isinstance(claim.get("claimId"), str)
        }
        return [
            claims_by_id[claim_id] for claim_id in utf16_ordinal_sorted(claims_by_id)
        ]

    @classmethod
    def _allowed_claim_ids(cls, research_payload: dict[str, Any]) -> list[str]:
        return [claim["claimId"] for claim in cls._accepted_claims(research_payload)]

    @classmethod
    def _allowed_claim_texts(cls, research_payload: dict[str, Any]) -> dict[str, str]:
        return {
            claim["claimId"]: claim["text"]
            for claim in cls._accepted_claims(research_payload)
            if isinstance(claim.get("text"), str)
        }

    @staticmethod
    def _required_gap_labels(
        research_payload: dict[str, Any],
        scope_payload: dict[str, Any] | None = None,
    ) -> list[str]:
        requirements = {
            item.get("id"): item.get("description")
            for item in (scope_payload or {}).get("evidenceRequirements", [])
            if isinstance(item, dict)
            and isinstance(item.get("id"), str)
            and isinstance(item.get("description"), str)
        }
        findings = [
            item
            for item in research_payload.get("findings", [])
            if isinstance(item, dict)
            and item.get("status") in {"missing", "conflicting"}
        ]
        finding_notes = {
            item.get("note") for item in findings if isinstance(item.get("note"), str)
        }
        labels = [
            *[
                value
                for value in research_payload.get("assumptions", [])
                if isinstance(value, str)
            ],
            *[
                value
                for key in ("gaps", "conflicts")
                for value in research_payload.get(key, [])
                if isinstance(value, str) and value not in finding_notes
            ],
        ]
        for finding in findings:
            requirement_id = finding.get("requirementId")
            description = requirements.get(requirement_id)
            if not description:
                description = f"requirement {requirement_id}"
            if finding.get("status") == "conflicting":
                prefix = "Conflicting evidence remains unresolved"
            elif finding.get("blocking") is True:
                prefix = "Blocking evidence remains unresolved"
            else:
                prefix = "Evidence gap"
            labels.append(f"{prefix}: {description}")
        return utf16_ordinal_sorted(set(labels))

    @classmethod
    def _required_gap_labels_for_input(
        cls,
        input_value: SynthesizeArtifactInputV1,
        research_payload: dict[str, Any],
        scope_payload: dict[str, Any] | None = None,
    ) -> list[str]:
        task = input_value.task
        if (
            input_value.purpose == "execute_task"
            and task is not None
            and not task.produces_full_contract
        ):
            return []
        return cls._required_gap_labels(research_payload, scope_payload)

    @classmethod
    def _context(
        cls,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> SynthesisContext:
        task = input_value.task
        required_sections = (
            input_value.output_contract.required_sections
            if task is None or task.produces_full_contract
            else []
        )
        plan_payload = next(
            (
                item.payload
                for item in selected_contents
                if item.artifact.kind == "plan" and isinstance(item.payload, dict)
            ),
            None,
        )
        work_shape = plan_payload.get("workShape") if plan_payload else None
        scope = ScopeArtifactV2.model_validate(scope_payload)
        reader_output = (
            input_value.output_contract.reader_output
            if isinstance(input_value.output_contract, WorkflowOutputContractV2)
            else None
        )
        return SynthesisContext(
            purpose=input_value.purpose,
            required_sections=required_sections,
            evidence_readiness=input_value.output_contract.evidence_readiness,
            allowed_claim_ids=cls._allowed_claim_ids(research_payload),
            allowed_claim_texts=cls._allowed_claim_texts(research_payload),
            required_gap_labels=cls._required_gap_labels_for_input(
                input_value, research_payload, scope_payload
            ),
            unresolved_evidence_requirements=(
                _unresolved_evidence_requirement_descriptions(
                    research_payload, scope_payload
                )
            ),
            acceptance_requirement_ids=(
                task.acceptance_requirement_ids if task is not None else []
            ),
            accepted_requirements=scope.requirements,
            accepted_acceptance_criteria=(
                input_value.output_contract.acceptance_criteria
            ),
            repair_pass=input_value.repair_pass or 0,
            # Execution artifacts are immutable drafts, not publishable outcomes. Their
            # structure, scope, launch boundary, marker membership, gap labels and task
            # coverage remain strict here. Substantive/practical and claim-alignment
            # defects are measured below for direct promotion, then repaired by the
            # evaluation/final stages instead of preventing those stages from running.
            quality_gate_required=input_value.purpose
            in {"final_synthesis", "blocked_report"},
            practical_output_required=(
                input_value.purpose == "blocked_report"
                or (
                    work_shape
                    in {
                        "product_prd",
                        "software_prd",
                        "research_strategy",
                        "operational_plan",
                    }
                )
            ),
            reader_output=reader_output,
            artifact_type=input_value.output_contract.artifact_type,
        )

    @staticmethod
    def _core_content(
        selected_contents: list[ImmutableArtifactContent],
    ) -> ImmutableArtifactContent:
        candidates = []
        for item in selected_contents:
            if item.content_type != "text/markdown":
                continue
            payload = item.payload
            task = None
            if item.artifact.kind == "task_result":
                task = payload.get("task")
            elif item.artifact.kind == "final_markdown":
                attestation = payload.get("candidateAttestation")
                if isinstance(attestation, dict):
                    task = attestation.get("task")
            if (
                isinstance(task, dict)
                and task.get("taskKind") == "core_draft"
                and task.get("producesFullContract") is True
                and isinstance(item.markdown, str)
            ):
                candidates.append(item)
        if len(candidates) != 1:
            raise ValueError(
                "final repair prompt requires one full-contract core draft"
            )
        return candidates[0]

    @staticmethod
    def _prompt_artifact(item: ImmutableArtifactContent) -> dict[str, Any]:
        """Keep the canonical payload, without repeating its mirrored Markdown body."""
        value = item.model_dump(mode="json", by_alias=True)
        value.pop("markdown", None)
        return value

    @classmethod
    def _research_prompt_view(
        cls,
        research_payload: dict[str, Any],
        scope_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Expose accepted evidence and typed gaps, never rejected provider prose."""

        projected = {
            key: research_payload[key]
            for key in (
                "schemaVersion",
                "acceptedScopeArtifactId",
                "acceptedScopeHash",
                "researchInputHash",
                "readiness",
                "assumptions",
                "boundedRepairPasses",
                "claimLedgerArtifactId",
            )
            if key in research_payload
        }
        findings = [
            {
                key: finding[key]
                for key in (
                    "requirementId",
                    "status",
                    "blocking",
                    "sourceArtifactIds",
                )
                if key in finding
            }
            for finding in research_payload.get("findings", [])
            if isinstance(finding, dict)
        ]
        projected["findings"] = findings

        selected_claims = [
            claim
            for claim in research_payload.get("selectedClaims", [])
            if isinstance(claim, dict)
        ]
        selected_claim_ids = {
            claim.get("claimId")
            for claim in selected_claims
            if isinstance(claim.get("claimId"), str)
        }
        accepted_claims = cls._accepted_claims(research_payload)
        accepted_claim_ids = {
            claim["claimId"]
            for claim in accepted_claims
            if isinstance(claim.get("claimId"), str)
        }
        projected["selectedClaims"] = selected_claims
        verified_requirement_ids = {
            finding.get("requirementId")
            for finding in findings
            if finding.get("status") == "verified"
            and isinstance(finding.get("requirementId"), str)
        }
        verified_evidence = []
        for entry in research_payload.get("claimLedger", []):
            if (
                not isinstance(entry, dict)
                or entry.get("requirementId") not in verified_requirement_ids
            ):
                continue
            claims = [
                claim
                for claim in entry.get("claims", [])
                if isinstance(claim, dict)
                and claim.get("claimId") in accepted_claim_ids
                and claim.get("claimId") not in selected_claim_ids
            ]
            if not claims:
                continue
            verified_evidence.append(
                {
                    "requirementId": entry["requirementId"],
                    "passNumber": entry.get("passNumber"),
                    "claims": claims,
                }
            )
        projected["verifiedEvidence"] = verified_evidence

        projected_sources = []
        for source in research_payload.get("sourceCatalogue", []):
            if not isinstance(source, dict):
                continue
            supported_claim_ids = utf16_ordinal_sorted(
                {
                    claim_id
                    for claim_id in source.get("supportedClaimIds", [])
                    if claim_id in accepted_claim_ids
                }
            )
            if not supported_claim_ids:
                continue
            projected_source = {
                key: source[key]
                for key in (
                    "sourceId",
                    "sourceTitle",
                    "canonicalUrl",
                    "sourceClasses",
                    "retrievalDate",
                )
                if key in source
            }
            projected_source["supportedClaimIds"] = supported_claim_ids
            projected_sources.append(projected_source)
        projected["sourceCatalogue"] = projected_sources

        requirement_by_id = {
            requirement.get("id"): requirement
            for requirement in (scope_payload or {}).get("evidenceRequirements", [])
            if isinstance(requirement, dict) and isinstance(requirement.get("id"), str)
        }
        projected["unresolvedEvidence"] = []
        for finding in findings:
            if finding.get("status") not in {"missing", "conflicting"}:
                continue
            requirement_id = finding.get("requirementId")
            requirement = requirement_by_id.get(requirement_id, {})
            unresolved = {
                "requirementId": requirement_id,
                "status": finding.get("status"),
                "blocking": finding.get("blocking"),
                "requiredAction": (
                    "resolve_conflict_with_accepted_evidence"
                    if finding.get("status") == "conflicting"
                    else "acquire_accepted_evidence"
                ),
            }
            for key in (
                "description",
                "evidenceRole",
                "verificationBasis",
                "acceptedSourceTypes",
                "allowedSourceHosts",
            ):
                if key in requirement:
                    unresolved[key] = requirement[key]
            projected["unresolvedEvidence"].append(unresolved)
        return projected

    @staticmethod
    def _prompt(
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
        allowed_claim_ids: list[str],
    ) -> str:
        return canonical_json(
            _with_execution_agent_prompt(
                {
                    "PURPOSE": input_value.purpose,
                    "ACCEPTED_SCOPE": scope_payload,
                    "RESEARCH_RESULT": PydanticAISynthesisWriter._research_prompt_view(
                        research_payload, scope_payload
                    ),
                    "TASK": (
                        input_value.task.model_dump(mode="json", by_alias=True)
                        if input_value.task is not None
                        else None
                    ),
                    "OUTPUT_CONTRACT": input_value.output_contract.model_dump(
                        mode="json", by_alias=True
                    ),
                    "SEMANTIC_METHOD": (
                        _PRODUCT_PRD_SEMANTIC_METHOD
                        if input_value.output_contract.artifact_type == "product_prd"
                        else None
                    ),
                    "REPAIR_PASS": input_value.repair_pass,
                    "SELECTED_IMMUTABLE_ARTIFACTS": [
                        PydanticAISynthesisWriter._prompt_artifact(item)
                        for item in selected_contents
                        if item.artifact.kind not in {"scope", "research"}
                    ],
                    "ALLOWED_CLAIM_IDS": allowed_claim_ids,
                },
                input_value,
            )
        )

    @staticmethod
    def _final_repair_prompt(
        input_value: SynthesizeArtifactInputV1,
        selected_contents: list[ImmutableArtifactContent],
        context: SynthesisContext,
    ) -> str:
        """Repair the exact reviewed candidate under its original accepted context."""

        if input_value.purpose != "final_synthesis" or input_value.evaluation is None:
            raise ValueError("final repair prompt requires final_synthesis input")

        core = PydanticAISynthesisWriter._core_content(selected_contents)
        evaluation_candidates = [
            item
            for item in selected_contents
            if item.artifact == input_value.evaluation
            and item.artifact.kind == "evaluation"
            and item.content_type == "application/json"
        ]
        if len(evaluation_candidates) != 1:
            raise ValueError(
                "final repair prompt requires the exact evaluation artifact"
            )
        evaluation = EvaluationResultV1.model_validate(evaluation_candidates[0].payload)
        scope_payload = next(
            item.payload
            for item in selected_contents
            if item.artifact == input_value.accepted_scope
        )
        research_payload = next(
            item.payload
            for item in selected_contents
            if item.artifact == input_value.research
        )
        repair_targets = {
            "unmetRequirementIds": evaluation.unmet_requirement_ids,
            "unresolvedSourceMarkers": evaluation.unresolved_source_markers,
            "unsupportedPrecision": evaluation.unsupported_precision,
            "contradictions": evaluation.contradictions,
            "staleTopicReferences": evaluation.stale_topic_references,
            "readinessViolations": evaluation.readiness_violations,
            "substantiveContentDefects": evaluation.substantive_content_defects,
            "practicalityDefects": evaluation.practicality_defects,
        }
        return canonical_json(
            _with_execution_agent_prompt(
                {
                    "PURPOSE": input_value.purpose,
                    "BASE_MARKDOWN": core.markdown,
                    "ACCEPTED_SCOPE": scope_payload,
                    "RESEARCH_RESULT": PydanticAISynthesisWriter._research_prompt_view(
                        research_payload, scope_payload
                    ),
                    "CORE_DECISIONS": {
                        "conclusions": core.payload.get("conclusions", []),
                        "unknowns": core.payload.get("unknowns", []),
                    },
                    "SPECIALIST_DECISIONS": [
                        {
                            "artifact": item.artifact.model_dump(
                                mode="json", by_alias=True
                            ),
                            "role": item.payload.get("task", {}).get("requiredRole"),
                            "conclusions": item.payload.get("conclusions", []),
                            "unknowns": item.payload.get("unknowns", []),
                        }
                        for item in selected_contents
                        if item.artifact.kind == "task_result"
                        and item.artifact != core.artifact
                    ],
                    "CORE_ARTIFACT": core.artifact.model_dump(
                        mode="json", by_alias=True
                    ),
                    "EVALUATION_ARTIFACT": input_value.evaluation.model_dump(
                        mode="json", by_alias=True
                    ),
                    "REPAIR_TARGETS": repair_targets,
                    "REPAIR_INSTRUCTIONS": evaluation.repair_instructions,
                    "OUTPUT_CONTRACT": input_value.output_contract.model_dump(
                        mode="json", by_alias=True
                    ),
                    "SEMANTIC_METHOD": (
                        _PRODUCT_PRD_SEMANTIC_METHOD
                        if input_value.output_contract.artifact_type == "product_prd"
                        else None
                    ),
                    "EVIDENCE_READINESS": context.evidence_readiness,
                    "REQUIRED_GAP_LABELS": context.required_gap_labels,
                    "ALLOWED_CLAIMS": context.allowed_claim_texts,
                    "REPAIR_PASS": input_value.repair_pass,
                },
                input_value,
            )
        )

    async def execute_task(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[TaskDraft]:
        context = self._context(
            input_value, scope_payload, research_payload, selected_contents
        )
        result = await self._run_validated_agent(
            self.task_agent,
            self._prompt(
                input_value,
                scope_payload,
                research_payload,
                selected_contents,
                context.allowed_claim_ids,
            ),
            context,
            phase="TASK",
        )
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(
            result.output,
            input_tokens,
            output_tokens,
            exact_uniform_model_version_from_result(result),
        )

    async def evaluate_output(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[EvaluationDraft]:
        context = self._context(
            input_value, scope_payload, research_payload, selected_contents
        )
        result = await self._run_validated_agent(
            self.evaluation_agent,
            self._prompt(
                input_value,
                scope_payload,
                research_payload,
                selected_contents,
                context.allowed_claim_ids,
            ),
            context,
            phase="EVALUATION",
        )
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(
            result.output,
            input_tokens,
            output_tokens,
            exact_uniform_model_version_from_result(result),
        )

    async def evaluate_final(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
        final_draft: SynthesisDraft,
    ) -> ModelOutput[EvaluationDraft]:
        """Review the exact publication, not the old core or its repair promises."""
        context = self._context(
            input_value, scope_payload, research_payload, selected_contents
        )
        prompt = (
            "FINAL PUBLICATION REVIEW. The supplied FINAL_PUBLICATION is "
            "the exact document about to be published, including server-owned disclosures "
            "and source appendix. Judge this text independently; no earlier clean review "
            "or claimed repair is evidence that it is correct. Do not request removal of "
            "the server-owned source appendix. Check accepted requirements, causal "
            "state transitions and contradictory descriptions across sections. Recompute "
            "numeric examples and try the specified delayed, duplicate, out-of-order, "
            "partial-failure and recovery cases when applicable. A pending-verification "
            "label does not repair an internally inconsistent algorithm. Distinguish "
            "unknown vendor prerequisites from broken proposed fallbacks. Inspect source "
            "claims for overreach; ledger membership alone does not prove truth. Return "
            "concrete defects in the typed fields; use substantive_content_defects for "
            "missing accepted requirements. Empty defect fields mean no issues were "
            "identified, not proof of correctness. For planning artifacts, your findings "
            "are advisory comments for human review. No further repair or execution "
            "is authorized by this review.\n"
            + canonical_json(
                {
                    "OUTPUT_CONTRACT": input_value.output_contract.model_dump(
                        mode="json", by_alias=True
                    ),
                    "ACCEPTED_SCOPE": scope_payload,
                    "RESEARCH": self._research_prompt_view(
                        research_payload, scope_payload
                    ),
                    "ALLOWED_CLAIM_TEXTS": context.allowed_claim_texts,
                    "FINAL_PUBLICATION_SHA256": hashlib.sha256(
                        final_draft.markdown.encode("utf-8")
                    ).hexdigest(),
                    "FINAL_PUBLICATION": final_draft.model_dump(mode="json"),
                }
            )
        )
        result = await self._run_validated_agent(
            self.evaluation_agent, prompt, context, phase="EVALUATION"
        )
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(
            EvaluationDraft.model_validate(result.output),
            input_tokens,
            output_tokens,
            exact_uniform_model_version_from_result(result),
        )

    async def write(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[SynthesisDraft]:
        context = self._context(
            input_value, scope_payload, research_payload, selected_contents
        )
        prompt = self._final_repair_prompt(input_value, selected_contents, context)
        result = await self._run_validated_agent(
            self.final_agent,
            prompt,
            context,
            phase="FINAL",
        )
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(
            SynthesisDraft.model_validate(result.output),
            input_tokens,
            output_tokens,
            exact_uniform_model_version_from_result(result),
        )

    async def write_blocked(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[SynthesisDraft]:
        context = self._context(
            input_value, scope_payload, research_payload, selected_contents
        )
        result = await self._run_validated_agent(
            self.blocked_agent,
            self._prompt(
                input_value,
                scope_payload,
                research_payload,
                selected_contents,
                context.allowed_claim_ids,
            ),
            context,
            phase="BLOCKED_REPORT",
        )
        output = _with_immutable_gap_labels(context, result.output)
        _validate_synthesis(context, output)
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(
            output,
            input_tokens,
            output_tokens,
            exact_uniform_model_version_from_result(result),
        )


def _artifact_fact(
    *,
    artifact_id: UUID,
    kind: str,
    payload: dict[str, Any],
    source_artifact_ids: list[UUID],
    markdown: str | None = None,
) -> ArtifactFact:
    content_type = "text/markdown" if markdown is not None else "application/json"
    fact_type: type[ArtifactFact]
    if kind == "scope":
        fact_type = ScopeArtifactFact
    elif kind == "research":
        fact_type = ResearchArtifactFact
    elif kind == "task_result":
        fact_type = TaskResultArtifactFact
    elif kind == "evaluation":
        fact_type = EvaluationArtifactFact
    elif kind == "final_markdown":
        fact_type = FinalMarkdownArtifactFact
    else:
        fact_type = ArtifactFact
    return fact_type(
        artifact_id=artifact_id,
        artifact_hash=artifact_content_hash(
            content_type=content_type,
            payload=payload,
            markdown=markdown,
        ),
        kind=kind,
        content_type=content_type,
        payload=payload,
        markdown=markdown,
        source_artifact_ids=sorted(set(source_artifact_ids), key=str),
    )


def _validated_resolved_artifact(
    fact: dict[str, Any] | None,
    reference: ArtifactRef,
    *,
    expected_kind: str,
    error_class: str,
) -> ArtifactFact:
    if fact is None:
        raise CognitiveExecutionFailure(error_class, retryable=False)
    try:
        artifact = ArtifactFact.model_validate(fact)
    except ValueError as error:
        raise CognitiveExecutionFailure(error_class, retryable=False) from error
    if (
        artifact.artifact_id != reference.artifact_id
        or artifact.artifact_hash != reference.artifact_hash
        or artifact.kind != reference.kind
        or artifact.kind != expected_kind
    ):
        raise CognitiveExecutionFailure(error_class, retryable=False)
    return artifact


class GeminiGroundedResearchRunner:
    def __init__(
        self,
        api_key: str,
        *,
        search_operation_seconds: float = _WORKFLOW_V2_PRIMARY_SEARCH_OPERATION_SECONDS,
        search_attempt_seconds: float = _WORKFLOW_V2_PRIMARY_SEARCH_ATTEMPT_SECONDS,
        response_validator: Callable[[str, str], tuple[str, ...]] | None = None,
        repair_query_builder: Callable[[str, tuple[str, ...]], str] | None = None,
        parsed_response_validator: (
            Callable[[str, dict[str, Any]], tuple[str, ...]] | None
        ) = None,
    ) -> None:
        from backend.services.generative.gemini_search_service import (
            GeminiSearchService,
        )

        policy = (
            {
                "response_validator": response_validator,
                "repair_query_builder": repair_query_builder,
            }
            if response_validator is not None or repair_query_builder is not None
            else {}
        )
        if parsed_response_validator is not None:
            policy["parsed_response_validator"] = parsed_response_validator
        self.service = GeminiSearchService(
            api_key=api_key,
            search_operation_seconds=search_operation_seconds,
            search_attempt_seconds=search_attempt_seconds,
            **policy,
        )

    async def search(self, query: str) -> dict[str, Any]:
        return await self.service.search_web_general_async(query)

    async def close(self) -> None:
        await self.service.aclose()


class GeminiCognitiveExecutor:
    def __init__(
        self,
        scope_drafter: ScopeDrafter,
        authority_key: bytes,
        research_runner: ResearchRunner | None = None,
        artifact_resolver: ArtifactResolver | None = None,
        synthesis_writer: SynthesisWriter | None = None,
        scope_reviser: ScopeReviser | None = None,
        assistant_runner: ResearchRunner | None = None,
        assistant_chat_runner: ResearchRunner | None = None,
        solution_preparer: PydanticAISolutionPreparer | None = None,
        solution_preparer_v2: PydanticAINativeSolutionPreparer | None = None,
        analysis_generator: AnalysisGenerator | None = None,
        simulation_generator: SimulationGenerator | None = None,
    ) -> None:
        if len(authority_key) < 32:
            raise RuntimeError(
                "AXWISE_AUTHORITY_SEAL_KEY must contain at least 32 bytes"
            )
        self.scope_drafter = scope_drafter
        self.authority_key = authority_key
        self.research_runner = research_runner
        self.artifact_resolver = artifact_resolver
        self.synthesis_writer = synthesis_writer
        self.scope_reviser = scope_reviser
        self.assistant_runner = assistant_runner
        self.assistant_chat_runner = assistant_chat_runner
        self.solution_preparer = solution_preparer
        self.solution_preparer_v2 = solution_preparer_v2
        self.analysis_handler = AnalysisOperationHandler(
            artifact_resolver=artifact_resolver,
            verify_scope_authority=self._verify_scope_authority,
            generator=analysis_generator,
        )
        self.simulation_handler = SimulationOperationHandler(
            artifact_resolver=artifact_resolver,
            verify_scope_authority=self._verify_scope_authority,
            generator=simulation_generator,
        )
        self.assistant_turn_service = AssistantTurnService(
            grounded_runner=assistant_runner,
            conversational_runner=assistant_chat_runner,
            source_type_classifier=_classify_source_types,
            usage_reader=_usage_from_search,
            metrics_factory=_operation_metrics,
        )

    async def close(self) -> None:
        closed: set[int] = set()
        for runner in (
            self.research_runner,
            self.assistant_runner,
            self.assistant_chat_runner,
        ):
            if runner is None or id(runner) in closed:
                continue
            closed.add(id(runner))
            close = getattr(runner, "close", None)
            if callable(close):
                await close()

    async def execute(self, envelope: AxWiseOperationEnvelope):
        started = time.monotonic()
        final_repair = (
            isinstance(envelope.input, SynthesizeArtifactInputV1)
            and envelope.input.purpose == "final_synthesis"
        )
        deadline_seconds = max(
            30, min(int(os.getenv("AXWISE_COGNITIVE_DEADLINE_SECONDS", "540")), 900)
        )
        try:
            result = await asyncio.wait_for(
                self._execute_operation(envelope), timeout=deadline_seconds
            )
        except asyncio.TimeoutError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_OPERATION_DEADLINE",
                retryable=not final_repair
                and envelope.operation_type
                not in {
                    "PrepareSolutionV2",
                    "AdmitTranscriptCorpusV1",
                    "AnalyzeEvidenceV1",
                    "SimulateV1",
                },
            ) from error
        except CognitiveExecutionFailure as error:
            if final_repair and error.retryable:
                raise CognitiveExecutionFailure(
                    error.error_class, retryable=False, diagnostics=error.diagnostics
                ) from error
            raise
        latency_ms = max(1, round((time.monotonic() - started) * 1000))
        metrics = result.metrics or OperationMetrics(latency_ms=latency_ms)
        return result.model_copy(
            update={"metrics": metrics.model_copy(update={"latency_ms": latency_ms})}
        )

    async def _execute_operation(self, envelope: AxWiseOperationEnvelope):
        if envelope.operation_type == "SimulateV1":
            if not isinstance(envelope.input, SimulateInputV1):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            return await self.simulation_handler.execute(envelope)
        if envelope.operation_type == "AdmitTranscriptCorpusV1":
            if not isinstance(envelope.input, AdmitTranscriptCorpusInputV1):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            return await self.analysis_handler.admit(envelope)
        if envelope.operation_type == "AnalyzeEvidenceV1":
            if not isinstance(envelope.input, AnalyzeEvidenceInputV1):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            return await self.analysis_handler.analyze(envelope)
        if envelope.operation_type == "PrepareSolutionV2":
            if not isinstance(envelope.input, PrepareSolutionInputV2):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            if self.solution_preparer_v2 is None:
                raise CognitiveExecutionFailure(
                    "AXWISE_SOLUTION_DESIGN_UNAVAILABLE", retryable=True
                )
            prepared = await self.solution_preparer_v2.prepare(envelope.input)
            return PrepareSolutionCompletedResult(
                result_type="solution_prepared",
                response=prepared.response,
                metrics=_operation_metrics(
                    input_tokens=prepared.input_tokens,
                    output_tokens=prepared.output_tokens,
                    model_version=prepared.model_version,
                ),
            )
        if envelope.operation_type == "PrepareSolutionV1":
            if not isinstance(envelope.input, PrepareSolutionInputV1):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            if self.solution_preparer is None:
                raise CognitiveExecutionFailure(
                    "AXWISE_SOLUTION_DESIGN_UNAVAILABLE", retryable=True
                )
            prepared = await self.solution_preparer.prepare(envelope.input)
            return PrepareSolutionCompletedResult(
                result_type="solution_prepared",
                response=prepared.response,
                metrics=_operation_metrics(
                    input_tokens=prepared.input_tokens,
                    output_tokens=prepared.output_tokens,
                    model_version=prepared.model_version,
                ),
            )
        if envelope.operation_type == "AssistantTurnV1":
            if not isinstance(envelope.input, AssistantTurnInputV1):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            return await self._assistant_turn(envelope.input)
        if envelope.operation_type == "ReviseScopeV2":
            if not isinstance(envelope.input, ReviseScopeInputV2):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            return await self._revise_scope(envelope, envelope.input)
        if envelope.operation_type == "ExecuteResearchV2":
            if not isinstance(envelope.input, ExecuteResearchInputV2):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            return await self._execute_research(envelope, envelope.input)
        if envelope.operation_type == "SynthesizeArtifactV1":
            if not isinstance(envelope.input, SynthesizeArtifactInputV1):
                raise CognitiveExecutionFailure(
                    "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
                )
            return await self._synthesize(envelope, envelope.input)
        if envelope.operation_type not in {"CompileScopeV2", "CompileScopeV3"}:
            raise CognitiveExecutionFailure(
                "AXWISE_OPERATION_NOT_IMPLEMENTED", retryable=False
            )
        input_value = envelope.input
        if not isinstance(input_value, (CompileScopeInputV2, CompileScopeInputV3)):
            raise CognitiveExecutionFailure(
                "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
            )
        objective_context: list[str] = []
        if input_value.objective_only_context:
            if self.artifact_resolver is None:
                raise CognitiveExecutionFailure(
                    "AXWISE_CONTEXT_RESOLUTION_UNAVAILABLE", retryable=True
                )
            for reference in input_value.objective_only_context:
                reference_id = UUID(str(reference.artifact_id))
                fact = await asyncio.to_thread(
                    self.artifact_resolver.artifact_fact,
                    envelope.owner.tenant_id,
                    reference_id,
                )
                if fact is None:
                    raise CognitiveExecutionFailure(
                        "AXWISE_OBJECTIVE_CONTEXT_NOT_FOUND", retryable=False
                    )
                try:
                    context_artifact = ArtifactFact.model_validate(fact)
                except ValueError as error:
                    raise CognitiveExecutionFailure(
                        "AXWISE_OBJECTIVE_CONTEXT_INVALID", retryable=False
                    ) from error
                if (
                    context_artifact.artifact_id != reference_id
                    or context_artifact.artifact_hash != reference.artifact_hash
                    or context_artifact.kind != reference.kind
                ):
                    raise CognitiveExecutionFailure(
                        "AXWISE_OBJECTIVE_CONTEXT_NOT_FOUND", retryable=False
                    )
                payload = context_artifact.payload
                objective = payload.get("objective")
                if not isinstance(objective, str) or not objective.strip():
                    raise CognitiveExecutionFailure(
                        "AXWISE_OBJECTIVE_CONTEXT_INVALID", retryable=False
                    )
                objective_context.append(objective)
        drafted = await self.scope_drafter.draft(input_value, objective_context)
        draft, input_tokens, output_tokens, model_version = _unwrap_model_output(
            drafted
        )
        if isinstance(input_value, CompileScopeInputV3):
            _validate_v3_draft(input_value, draft)
        else:
            _validate_draft(input_value.request, draft)
        objective_spans = [
            _source_span(input_value.request, span)
            for span in draft.objective_source_spans
        ]
        topic_anchors = [
            TopicAnchor(
                value=topic.value,
                source_spans=[
                    _source_span(input_value.request, span)
                    for span in topic.source_spans
                ],
            )
            for topic in draft.topic_anchors
        ]
        evidence_requirements = draft.evidence_requirements
        policies = draft.policies
        authority_text = input_value.request
        current_owner_text = input_value.request
        owner_prior_texts: tuple[str, ...] = ()
        if isinstance(input_value, CompileScopeInputV3):
            authority_text = _scope_v3_draft_context(input_value).owner_authority_text
            current_owner_text = (
                input_value.assistant_context.instruction.source_span.text
            )
            owner_prior_texts = tuple(
                turn.user.source_span.text
                for turn in input_value.assistant_context.turns
            )
        deliverable_profile, requirements, acceptance_criteria = (
            _project_deliverable_contract(
                authority_text=authority_text,
                current_owner_text=current_owner_text,
                owner_prior_texts=owner_prior_texts,
                profile=draft.deliverable_profile,
                evidence_requirements=evidence_requirements,
                deliverables=draft.deliverables,
                personas=draft.personas,
                interview_requirements=draft.interview_requirements,
                prd_requirements=draft.prd_requirements,
                limits=draft.limits,
                policies=policies,
                draft_criteria=draft.acceptance_criteria,
                safe_default_values={
                    *input_value.safe_defaults.limits,
                    *input_value.safe_defaults.policies,
                },
            )
        )
        semantic_payload = _scope_semantics_payload(
            topic_anchors=topic_anchors,
            geography=draft.geography,
            evidence_requirements=evidence_requirements,
            deliverables=draft.deliverables,
            personas=draft.personas,
            interview_requirements=draft.interview_requirements,
            prd_requirements=draft.prd_requirements,
            limits=draft.limits,
            policies=policies,
            deliverable_profile=deliverable_profile,
            requirements=requirements,
            acceptance_criteria=acceptance_criteria,
        )
        research_input_hash = canonical_hash(semantic_payload)
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:scope")
        seal_payload = _authority_payload(
            tenant_id=envelope.owner.tenant_id,
            artifact_id=artifact_id,
            canonical_input_hash=envelope.canonical_input_hash,
            research_input_hash=research_input_hash,
        )
        seal = hmac.new(
            self.authority_key, seal_payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        scope = ScopeArtifactV2(
            objective=draft.objective,
            objective_source_spans=objective_spans,
            topic_anchors=topic_anchors,
            geography=draft.geography,
            evidence_requirements=evidence_requirements,
            deliverables=draft.deliverables,
            personas=draft.personas,
            interview_requirements=draft.interview_requirements,
            prd_requirements=draft.prd_requirements,
            limits=draft.limits,
            policies=policies,
            deliverable_profile=deliverable_profile,
            requirements=requirements,
            acceptance_criteria=acceptance_criteria,
            assumptions=draft.assumptions,
            material_clarification=draft.material_clarification,
            research_input_hash=research_input_hash,
            authority=ScopeAuthority(
                canonical_input_hash=envelope.canonical_input_hash,
                seal=seal,
            ),
        )
        payload = scope.model_dump(mode="json", by_alias=True)
        return ScopeCompiledResult(
            result_type="scope_compiled",
            artifact=_artifact_fact(
                artifact_id=artifact_id,
                kind="scope",
                payload=payload,
                source_artifact_ids=[],
            ),
            metrics=_operation_metrics(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model_version=model_version,
            ),
        )

    async def _assistant_turn(self, input_value: AssistantTurnInputV1):
        return await self.assistant_turn_service.execute(input_value)

    async def _revise_scope(
        self,
        envelope: AxWiseOperationEnvelope,
        input_value: ReviseScopeInputV2,
    ):
        if self.artifact_resolver is None or self.scope_reviser is None:
            raise CognitiveExecutionFailure(
                "AXWISE_SCOPE_REVISION_UNAVAILABLE", retryable=True
            )
        fact = await asyncio.to_thread(
            self.artifact_resolver.artifact_fact,
            envelope.owner.tenant_id,
            input_value.accepted_scope.artifact_id,
        )
        resolved_scope = _validated_resolved_artifact(
            fact,
            input_value.accepted_scope,
            expected_kind="scope",
            error_class="AXWISE_SCOPE_ARTIFACT_HASH_CHANGED",
        )
        payload = resolved_scope.payload
        try:
            accepted_scope = ScopeArtifactV2.model_validate(payload)
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_SCOPE_ARTIFACT_INVALID", retryable=False
            ) from error
        self._verify_scope_authority(
            accepted_scope,
            tenant_id=envelope.owner.tenant_id,
            artifact_id=input_value.accepted_scope.artifact_id,
        )
        revised = await self.scope_reviser.revise(input_value, accepted_scope)
        draft, input_tokens, output_tokens, model_version = _unwrap_model_output(
            revised
        )
        _validate_revision_draft(input_value.correction, draft, accepted_scope)
        objective = (
            draft.objective if draft.objective_changed else accepted_scope.objective
        )
        objective_spans = (
            [
                _source_span(input_value.correction, span)
                for span in draft.objective_source_spans
            ]
            if draft.objective_changed
            else accepted_scope.objective_source_spans
        )
        topic_anchors = (
            [
                TopicAnchor(
                    value=topic.value,
                    source_spans=[
                        _source_span(input_value.correction, span)
                        for span in topic.source_spans
                    ],
                )
                for topic in draft.topic_anchors
            ]
            if draft.topic_changed
            else accepted_scope.topic_anchors
        )
        evidence_requirements = draft.evidence_requirements
        policies = draft.policies
        deliverable_profile, requirements, acceptance_criteria = (
            _project_deliverable_contract(
                authority_text=input_value.correction,
                profile=draft.deliverable_profile,
                evidence_requirements=evidence_requirements,
                deliverables=draft.deliverables,
                personas=draft.personas,
                interview_requirements=draft.interview_requirements,
                prd_requirements=draft.prd_requirements,
                limits=draft.limits,
                policies=policies,
                draft_criteria=draft.acceptance_criteria,
                prior_scope=accepted_scope,
            )
        )
        semantic_payload = _scope_semantics_payload(
            topic_anchors=topic_anchors,
            geography=draft.geography,
            evidence_requirements=evidence_requirements,
            deliverables=draft.deliverables,
            personas=draft.personas,
            interview_requirements=draft.interview_requirements,
            prd_requirements=draft.prd_requirements,
            limits=draft.limits,
            policies=policies,
            deliverable_profile=deliverable_profile,
            requirements=requirements,
            acceptance_criteria=acceptance_criteria,
        )
        research_input_hash = canonical_hash(semantic_payload)
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:scope")
        seal_payload = _authority_payload(
            tenant_id=envelope.owner.tenant_id,
            artifact_id=artifact_id,
            canonical_input_hash=envelope.canonical_input_hash,
            research_input_hash=research_input_hash,
        )
        seal = hmac.new(
            self.authority_key, seal_payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        revised_scope = ScopeArtifactV2(
            objective=objective,
            objective_source_spans=objective_spans,
            topic_anchors=topic_anchors,
            geography=draft.geography,
            evidence_requirements=evidence_requirements,
            deliverables=draft.deliverables,
            personas=draft.personas,
            interview_requirements=draft.interview_requirements,
            prd_requirements=draft.prd_requirements,
            limits=draft.limits,
            policies=policies,
            deliverable_profile=deliverable_profile,
            requirements=requirements,
            acceptance_criteria=acceptance_criteria,
            assumptions=draft.assumptions,
            material_clarification=draft.material_clarification,
            research_input_hash=research_input_hash,
            authority=ScopeAuthority(
                canonical_input_hash=envelope.canonical_input_hash,
                seal=seal,
            ),
        )
        revised_payload = revised_scope.model_dump(mode="json", by_alias=True)
        return ScopeCompiledResult(
            result_type="scope_compiled",
            artifact=_artifact_fact(
                artifact_id=artifact_id,
                kind="scope",
                payload=revised_payload,
                source_artifact_ids=[input_value.accepted_scope.artifact_id],
            ),
            metrics=_operation_metrics(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model_version=model_version,
            ),
        )

    def _verify_scope_authority(
        self, scope: ScopeArtifactV2, *, tenant_id: UUID, artifact_id: UUID
    ) -> None:
        semantics = _scope_semantics_payload(
            topic_anchors=scope.topic_anchors,
            geography=scope.geography,
            evidence_requirements=scope.evidence_requirements,
            deliverables=scope.deliverables,
            personas=scope.personas,
            interview_requirements=scope.interview_requirements,
            prd_requirements=scope.prd_requirements,
            limits=scope.limits,
            policies=scope.policies,
            deliverable_profile=scope.deliverable_profile,
            requirements=scope.requirements,
            acceptance_criteria=scope.acceptance_criteria,
        )
        if canonical_hash(semantics) != scope.research_input_hash:
            raise CognitiveExecutionFailure(
                "AXWISE_SCOPE_SEMANTICS_CHANGED", retryable=False
            )
        seal_payload = _authority_payload(
            tenant_id=tenant_id,
            artifact_id=artifact_id,
            canonical_input_hash=scope.authority.canonical_input_hash,
            research_input_hash=scope.research_input_hash,
        )
        expected = hmac.new(
            self.authority_key, seal_payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, scope.authority.seal):
            raise CognitiveExecutionFailure(
                "AXWISE_SCOPE_AUTHORITY_INVALID", retryable=False
            )

    async def _execute_research(
        self,
        envelope: AxWiseOperationEnvelope,
        input_value: ExecuteResearchInputV2,
    ):
        if self.artifact_resolver is None:
            raise CognitiveExecutionFailure(
                "AXWISE_RESEARCH_UNAVAILABLE", retryable=True
            )
        scope_fact = await asyncio.to_thread(
            self.artifact_resolver.artifact_fact,
            envelope.owner.tenant_id,
            input_value.accepted_scope.artifact_id,
        )
        resolved_scope = _validated_resolved_artifact(
            scope_fact,
            input_value.accepted_scope,
            expected_kind="scope",
            error_class="AXWISE_SCOPE_ARTIFACT_HASH_CHANGED",
        )
        if resolved_scope.content_type != "application/json":
            raise CognitiveExecutionFailure(
                "AXWISE_SCOPE_ARTIFACT_HASH_CHANGED", retryable=False
            )
        persisted_scope_payload = resolved_scope.payload
        embedded_scope_payload = input_value.scope.model_dump(
            mode="json", by_alias=True
        )
        if not isinstance(persisted_scope_payload, dict) or canonical_json(
            persisted_scope_payload
        ) != canonical_json(embedded_scope_payload):
            raise CognitiveExecutionFailure(
                "AXWISE_ACCEPTED_SCOPE_MISMATCH", retryable=False
            )
        scope = ScopeArtifactV2.model_validate(persisted_scope_payload)
        self._verify_scope_authority(
            scope,
            tenant_id=envelope.owner.tenant_id,
            artifact_id=input_value.accepted_scope.artifact_id,
        )
        try:
            _validate_atomic_evidence_requirements(scope.evidence_requirements)
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_SCOPE_EVIDENCE_CONTRACT_INVALID", retryable=False
            ) from error
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:research")

        requirement_by_id = {item.id: item for item in scope.evidence_requirements}
        blocking_by_requirement = {
            item.id: _effective_requirement_blocking(scope, item)
            for item in scope.evidence_requirements
        }
        selected: dict[str, list[tuple[ArtifactRef, SelectedEvidenceArtifactV1]]] = {}
        for reference in input_value.selected_evidence:
            fact = await asyncio.to_thread(
                self.artifact_resolver.artifact_fact,
                envelope.owner.tenant_id,
                reference.artifact_id,
            )
            try:
                resolved_evidence = _validated_resolved_artifact(
                    fact,
                    reference,
                    expected_kind="evidence",
                    error_class="AXWISE_SELECTED_EVIDENCE_NOT_FOUND",
                )
            except CognitiveExecutionFailure:
                raise CognitiveExecutionFailure(
                    "AXWISE_SELECTED_EVIDENCE_NOT_FOUND", retryable=False
                )
            if resolved_evidence.content_type != "application/json":
                raise CognitiveExecutionFailure(
                    "AXWISE_SELECTED_EVIDENCE_NOT_FOUND", retryable=False
                )
            try:
                evidence = SelectedEvidenceArtifactV1.model_validate(
                    resolved_evidence.payload
                )
            except ValueError as error:
                raise CognitiveExecutionFailure(
                    "AXWISE_SELECTED_EVIDENCE_INVALID", retryable=False
                ) from error
            if evidence.requirement_id not in requirement_by_id:
                raise CognitiveExecutionFailure(
                    "AXWISE_SELECTED_EVIDENCE_REQUIREMENT_UNKNOWN", retryable=False
                )
            selected.setdefault(evidence.requirement_id, []).append(
                (reference, evidence)
            )

        findings_by_id: dict[str, EvidenceFinding] = {}
        selected_claims_by_id: dict[str, EvidenceClaimV1] = {}
        selected_source_catalogues: list[list[ResearchSourceV1]] = []
        source_ids_by_requirement: dict[str, list[UUID]] = {}
        to_acquire: list[EvidenceRequirement] = []
        for requirement in scope.evidence_requirements:
            evidence_items = selected.get(requirement.id, [])
            source_ids = [reference.artifact_id for reference, _item in evidence_items]
            source_ids_by_requirement[requirement.id] = source_ids
            applicability = {item.applicability for _reference, item in evidence_items}
            explicit_conflicts = [
                conflict
                for _reference, item in evidence_items
                for conflict in item.conflicts
            ]
            accepted_types = {
                _normalized_source_type(value)
                for value in requirement.accepted_source_types
            }
            selected_claims = [
                claim
                for _reference, item in evidence_items
                for claim in item.claims
                if {
                    _normalized_source_type(value) for value in claim.source_types
                }.intersection(accepted_types)
                and (
                    not requirement.allowed_source_hosts
                    or all(
                        _url_matches_allowed_hosts(
                            url, set(requirement.allowed_source_hosts)
                        )
                        for url in claim.source_urls
                    )
                )
            ]
            candidate_claims_by_id: dict[str, EvidenceClaimV1] = {}
            for claim in selected_claims:
                prior = candidate_claims_by_id.get(claim.claim_id)
                if prior is not None and prior != claim:
                    raise CognitiveExecutionFailure(
                        "AXWISE_SELECTED_EVIDENCE_INVALID", retryable=False
                    )
                candidate_claims_by_id[claim.claim_id] = claim
            blocking = blocking_by_requirement[requirement.id]
            if len(applicability) > 1 or explicit_conflicts:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="conflicting",
                    blocking=blocking,
                    source_artifact_ids=source_ids,
                    note=(
                        "Immutable selected evidence conflicts on applicability "
                        "or the required claim."
                    ),
                )
            elif applicability == {"not_applicable"}:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="not_applicable",
                    blocking=blocking,
                    source_artifact_ids=source_ids,
                    note=(
                        "Immutable selected evidence establishes that this "
                        "requirement is not applicable."
                    ),
                )
            elif selected_claims:
                for claim_id, claim in candidate_claims_by_id.items():
                    prior = selected_claims_by_id.get(claim_id)
                    if prior is not None and prior != claim:
                        raise CognitiveExecutionFailure(
                            "AXWISE_SELECTED_EVIDENCE_INVALID", retryable=False
                        )
                    selected_claims_by_id[claim_id] = claim
                selected_ids = set(candidate_claims_by_id)
                selected_source_catalogues.extend(
                    [
                        [
                            source.model_copy(
                                update={
                                    "supported_claim_ids": utf16_ordinal_sorted(
                                        set(source.supported_claim_ids).intersection(
                                            selected_ids
                                        )
                                    )
                                }
                            )
                            for source in item.source_catalogue
                            if set(source.supported_claim_ids).intersection(
                                selected_ids
                            )
                        ]
                        for _reference, item in evidence_items
                    ]
                )
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="verified",
                    blocking=blocking,
                    source_artifact_ids=source_ids,
                    note=f"Verified by {len(selected_claims)} selected immutable claim(s).",
                )
            elif requirement.verification_basis == "selected_evidence":
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="missing",
                    blocking=blocking,
                    source_artifact_ids=source_ids,
                    note=(
                        "No exact immutable selected evidence with an accepted claim "
                        "was supplied; grounded web research cannot satisfy this requirement."
                    ),
                )
            else:
                source_ids_by_requirement[requirement.id] = [artifact_id, *source_ids]
                to_acquire.append(requirement)

        semantics = _scope_semantics_payload(
            topic_anchors=scope.topic_anchors,
            geography=scope.geography,
            evidence_requirements=scope.evidence_requirements,
            deliverables=scope.deliverables,
            personas=scope.personas,
            interview_requirements=scope.interview_requirements,
            prd_requirements=scope.prd_requirements,
            limits=scope.limits,
            policies=scope.policies,
            deliverable_profile=scope.deliverable_profile,
            requirements=scope.requirements,
            acceptance_criteria=scope.acceptance_criteria,
        )
        if to_acquire and self.research_runner is None:
            raise CognitiveExecutionFailure(
                "AXWISE_RESEARCH_UNAVAILABLE", retryable=True
            )
        concurrency = max(
            _MIN_RESEARCH_CONCURRENCY,
            min(
                int(
                    os.getenv(
                        "AXWISE_RESEARCH_CONCURRENCY",
                        str(_DEFAULT_RESEARCH_CONCURRENCY),
                    )
                ),
                _MAX_RESEARCH_CONCURRENCY,
            ),
        )
        deadline_seconds = max(
            _MIN_RESEARCH_DEADLINE_SECONDS,
            min(
                int(
                    os.getenv(
                        "AXWISE_RESEARCH_DEADLINE_SECONDS",
                        str(_DEFAULT_RESEARCH_DEADLINE_SECONDS),
                    )
                ),
                _MAX_RESEARCH_DEADLINE_SECONDS,
            ),
        )
        semaphore = asyncio.Semaphore(concurrency)
        deadline = _research_time() + deadline_seconds
        ledger: list[EvidenceAcquisitionPassV1] = []
        acquired_source_catalogues: list[list[ResearchSourceV1]] = []
        acquired_source_locator_catalogues: dict[
            str, list[list[_ResearchSourceLocator]]
        ] = {}
        input_tokens = 0
        output_tokens = 0
        total_tokens = 0
        search_calls = 0
        model_versions: list[str | None] = []

        async def acquire(
            requirement: EvidenceRequirement, pass_number: Literal[0, 1]
        ) -> tuple[
            list[EvidenceClaimV1],
            list[str],
            list[ResearchSourceV1],
            EvidenceAcquisitionPassV1 | None,
            str | None,
            int,
            int,
            int,
            int,
            str | None,
        ]:
            accepted_source_classes = utf16_ordinal_sorted(
                {
                    _normalized_source_type(value)
                    for value in requirement.accepted_source_types
                }
            )
            accepted_source_instruction = (
                "Ground every accepted claim in a canonical source URL whose source "
                "class is one of: "
                f"{', '.join(accepted_source_classes)}. Prefer direct government, "
                "primary-law, standards-body, academic, official-statistics, or "
                "recognized trade-body sources when those classes are accepted. "
                "Do not substitute a general web article when grounded_web is not "
                "an accepted class."
            )
            if requirement.allowed_source_hosts:
                accepted_source_instruction += (
                    " Every accepted claim URL must be on one of these exact publisher "
                    "hosts or its subdomain: "
                    + ", ".join(requirement.allowed_source_hosts)
                    + ". Reject mixed claims containing any other host."
                )
            instruction = (
                "Verify the exact requirement against the accepted scope. Return grounded, "
                "attributable facts. If two accepted authoritative sources materially "
                "disagree, emit the grounded disagreement as a line beginning [CONFLICT]; "
                f"otherwise emit no conflict marker. {accepted_source_instruction}"
                if pass_number == 0
                else (
                    "One targeted repair pass: the initial acquisition produced no accepted "
                    "claim. Search only for the missing accepted evidence class. "
                    f"{accepted_source_instruction}"
                )
            )
            if input_value.execution_agent is not None:
                instruction += " " + " ".join(_EXECUTION_AGENT_PROFILE_BOUNDARY.split())
            query_payload: dict[str, Any] = _with_execution_agent_prompt(
                {
                    "acceptedScopeSemantics": semantics,
                    "requirement": requirement.model_dump(mode="json", by_alias=True),
                },
                input_value,
            )
            if pass_number == 1:
                reusable_sources = _repair_source_candidates(
                    requirement,
                    acquired_source_catalogues,
                    acquired_source_locator_catalogues.get(requirement.id, []),
                )
                if reusable_sources:
                    query_payload["fallbackCandidateSources"] = reusable_sources
            query = instruction + "\n" + canonical_json(query_payload)
            async with semaphore:
                raw = await self.research_runner.search(query)
            diagnostics = raw.get("runtime_diagnostics") or {}
            if not raw.get("search_performed"):
                status_value = str(diagnostics.get("status") or "acquisition_failed")
                if status_value in _TRANSIENT_EVIDENCE_ACQUISITION_STATUSES:
                    usage_input, usage_output, usage_total, calls = _usage_from_search(
                        raw
                    )
                    return (
                        [],
                        [],
                        [],
                        None,
                        status_value,
                        usage_input,
                        usage_output,
                        usage_total,
                        calls,
                        _model_version_from_search(raw),
                    )
                retryable = status_value not in {
                    "configuration_error",
                    "non_retryable_error",
                }
                raise CognitiveExecutionFailure(
                    f"AXWISE_RESEARCH_{status_value.upper()}", retryable=retryable
                )
            response_text = str(raw.get("text") or "")
            response_hash = hashlib.sha256(response_text.encode("utf-8")).hexdigest()
            received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            sources = [
                {**item, "retrieved_at": item.get("retrieved_at") or received_at}
                for item in raw.get("sources", [])
                if isinstance(item, dict)
            ]
            source_by_url = {
                str(item.get("url")): item for item in sources if item.get("url")
            }
            accepted_types = {
                _normalized_source_type(value)
                for value in requirement.accepted_source_types
            }
            claims_by_id: dict[str, EvidenceClaimV1] = {}
            for raw_claim in raw.get("claims", []):
                if not isinstance(raw_claim, dict):
                    continue
                claim = _claim_from_grounding(
                    raw_claim,
                    source_by_url,
                    accepted_types,
                    set(requirement.allowed_source_hosts),
                    response_hash,
                    response_text,
                    requirement=requirement,
                    provider=str(raw.get("provider") or ""),
                )
                if claim is not None:
                    claims_by_id[claim.claim_id] = claim
            claims = [claims_by_id[key] for key in sorted(claims_by_id)]
            claims, source_catalogue = _claims_with_source_catalogue(claims, sources)
            conflicts = utf16_ordinal_sorted(
                {
                    claim.text[:2000]
                    for claim in claims
                    if claim.text.lstrip().startswith("[CONFLICT]")
                    and len(
                        {
                            url
                            for url in claim.source_urls
                            if _classify_source_record(
                                url, source_by_url.get(url, {})
                            ).intersection(accepted_types)
                        }
                    )
                    >= 2
                }
            )
            source_types_seen = utf16_ordinal_sorted(
                {
                    source_type
                    for item in sources
                    for source_type in _classify_source_record(
                        str(item.get("url") or ""), item
                    )
                }
            )
            entry = EvidenceAcquisitionPassV1(
                requirement_id=requirement.id,
                pass_number=pass_number,
                query_hash=hashlib.sha256(query.encode("utf-8")).hexdigest(),
                provider_response_hash=response_hash,
                provider_response_text=response_text,
                claims=claims,
                source_types_seen=source_types_seen,
            )
            if pass_number == 0:
                source_locators = [
                    locator
                    for item in [
                        *sources,
                        *[
                            item
                            for item in raw.get("same_operation_locators", [])
                            if isinstance(item, dict)
                        ],
                    ]
                    if (locator := _source_locator(item)) is not None
                ]
                if source_locators:
                    acquired_source_locator_catalogues.setdefault(
                        requirement.id, []
                    ).append(source_locators)
            usage_input, usage_output, usage_total, calls = _usage_from_search(raw)
            return (
                claims,
                conflicts,
                source_catalogue,
                entry,
                None,
                usage_input,
                usage_output,
                usage_total,
                calls,
                _model_version_from_search(raw),
            )

        async def run_round(
            requirements: list[EvidenceRequirement], pass_number: Literal[0, 1]
        ) -> dict[str, tuple[list[EvidenceClaimV1], list[str], str | None]]:
            nonlocal input_tokens, output_tokens, total_tokens, search_calls
            tasks = {
                asyncio.create_task(acquire(requirement, pass_number)): requirement
                for requirement in requirements
            }
            if not tasks:
                return {}
            pending = set(tasks)
            completed: set[asyncio.Task] = set()
            deadline_expired = False
            try:
                while pending:
                    remaining = deadline - _research_time()
                    if remaining <= 0:
                        deadline_expired = True
                        break
                    done, pending = await asyncio.wait(
                        pending,
                        timeout=remaining,
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if not done:
                        deadline_expired = True
                        break
                    completed.update(done)
                    # Surface the first child failure now. The finally block
                    # cancels and awaits every sibling before it can escape.
                    for task in done:
                        task.result()

                acquired: dict[
                    str, tuple[list[EvidenceClaimV1], list[str], str | None]
                ] = {}
                for task in completed:
                    requirement = tasks[task]
                    (
                        claims,
                        conflicts,
                        source_catalogue,
                        entry,
                        failure_status,
                        used_input,
                        used_output,
                        used_total,
                        used_calls,
                        used_model_version,
                    ) = task.result()
                    if entry is not None:
                        ledger.append(entry)
                    if source_catalogue:
                        acquired_source_catalogues.append(source_catalogue)
                    input_tokens += used_input
                    output_tokens += used_output
                    total_tokens += used_total
                    search_calls += used_calls
                    model_versions.append(used_model_version)
                    acquired[requirement.id] = (claims, conflicts, failure_status)
                if deadline_expired:
                    for task in pending:
                        requirement = tasks[task]
                        model_versions.append(None)
                        acquired[requirement.id] = (
                            [],
                            [],
                            "deadline_exceeded",
                        )
                return acquired
            finally:
                unfinished = [task for task in tasks if not task.done()]
                for task in unfinished:
                    task.cancel()
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)

        initial = await run_round(to_acquire, 0)
        missing_for_repair: list[EvidenceRequirement] = []
        initial_failure_statuses: dict[str, str] = {}
        for requirement in to_acquire:
            blocking = blocking_by_requirement[requirement.id]
            claims, conflicts, failure_status = initial.get(
                requirement.id, ([], [], None)
            )
            if failure_status is not None:
                initial_failure_statuses[requirement.id] = failure_status
            if conflicts:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="conflicting",
                    blocking=blocking,
                    source_artifact_ids=source_ids_by_requirement[requirement.id],
                    note="Grounded acquisition returned conflicting evidence.",
                )
            elif claims:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="verified",
                    blocking=blocking,
                    source_artifact_ids=source_ids_by_requirement[requirement.id],
                    note=(
                        f"Verified with {len(claims)} grounded claim(s) from "
                        "accepted source classes."
                    ),
                )
            else:
                missing_for_repair.append(requirement)

        repair_performed = bool(missing_for_repair) and _research_time() < deadline
        repaired = (
            await run_round(missing_for_repair, 1)
            if repair_performed
            else {
                requirement.id: ([], [], "deadline_exceeded")
                for requirement in missing_for_repair
            }
        )
        for requirement in missing_for_repair:
            claims, conflicts, repair_failure_status = repaired.get(
                requirement.id, ([], [], None)
            )
            initial_failure_status = initial_failure_statuses.get(requirement.id)
            status_value = (
                "conflicting" if conflicts else "verified" if claims else "missing"
            )
            failure_statuses = [
                value
                for value in (
                    initial_failure_status,
                    repair_failure_status,
                )
                if value is not None
            ]
            note = (
                "Grounded repair returned conflicting evidence."
                if conflicts
                else (
                    f"Verified on the single repair pass with {len(claims)} grounded claim(s)."
                    if claims
                    else (
                        (
                            "Grounded acquisition reached the bounded research deadline before "
                            "the targeted repair pass; no accepted grounded claim was recorded."
                        )
                        if not repair_performed
                        else (
                            (
                                "Grounded acquisition remained unavailable after the single "
                                "targeted repair pass "
                                f"({', '.join(failure_statuses)}); no accepted grounded claim "
                                "was recorded."
                            )
                            if failure_statuses
                            else "No accepted grounded claim was available after the single repair pass."
                        )
                    )
                )
            )
            findings_by_id[requirement.id] = EvidenceFinding(
                requirement_id=requirement.id,
                status=status_value,
                blocking=blocking_by_requirement[requirement.id],
                source_artifact_ids=source_ids_by_requirement[requirement.id],
                note=note,
            )

        findings = [findings_by_id[item.id] for item in scope.evidence_requirements]
        requirement_order = {
            requirement.id: index
            for index, requirement in enumerate(scope.evidence_requirements)
        }
        ledger.sort(
            key=lambda entry: (
                requirement_order[entry.requirement_id],
                entry.pass_number,
            )
        )
        unresolved_blocking = [
            finding
            for finding in findings
            if finding.status == "conflicting"
            or (finding.blocking and finding.status == "missing")
        ]
        unresolved_optional = [
            finding
            for finding in findings
            if not finding.blocking and finding.status == "missing"
        ]
        assumptions = list(scope.assumptions)
        readiness = (
            "blocked"
            if unresolved_blocking
            else "ready_with_gaps" if unresolved_optional or assumptions else "ready"
        )
        result = ResearchResultV2(
            accepted_scope_artifact_id=input_value.accepted_scope.artifact_id,
            accepted_scope_hash=input_value.accepted_scope.artifact_hash,
            research_input_hash=scope.research_input_hash,
            readiness=readiness,
            findings=findings,
            bounded_repair_passes=1 if repair_performed else 0,
            assumptions=assumptions,
            gaps=[finding.note for finding in unresolved_optional],
            conflicts=[
                finding.note for finding in findings if finding.status == "conflicting"
            ],
            claim_ledger_artifact_id=artifact_id,
            claim_ledger=ledger,
            selected_claims=[
                selected_claims_by_id[claim_id]
                for claim_id in utf16_ordinal_sorted(selected_claims_by_id)
            ],
            source_catalogue=_merge_source_catalogue(
                [*selected_source_catalogues, *acquired_source_catalogues]
            ),
        )
        payload = result.model_dump(mode="json", by_alias=True)
        return ResearchCompletedResult(
            result_type="research_completed",
            artifact=_artifact_fact(
                artifact_id=artifact_id,
                kind="research",
                payload=payload,
                source_artifact_ids=[
                    input_value.accepted_scope.artifact_id,
                ],
            ),
            evidence_readiness=readiness,
            metrics=_operation_metrics(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                search_calls=search_calls,
                model_version=_uniform_model_version(model_versions),
            ),
        )

    async def _synthesize(
        self,
        envelope: AxWiseOperationEnvelope,
        input_value: SynthesizeArtifactInputV1,
    ):
        if self.artifact_resolver is None or (
            input_value.purpose != "blocked_report" and self.synthesis_writer is None
        ):
            raise CognitiveExecutionFailure(
                "AXWISE_SYNTHESIS_UNAVAILABLE", retryable=True
            )
        scope_fact, research_fact = await asyncio.gather(
            asyncio.to_thread(
                self.artifact_resolver.artifact_fact,
                envelope.owner.tenant_id,
                input_value.accepted_scope.artifact_id,
            ),
            asyncio.to_thread(
                self.artifact_resolver.artifact_fact,
                envelope.owner.tenant_id,
                input_value.research.artifact_id,
            ),
        )
        resolved_scope = _validated_resolved_artifact(
            scope_fact,
            input_value.accepted_scope,
            expected_kind="scope",
            error_class="AXWISE_SCOPE_ARTIFACT_HASH_CHANGED",
        )
        resolved_research = _validated_resolved_artifact(
            research_fact,
            input_value.research,
            expected_kind="research",
            error_class="AXWISE_RESEARCH_ARTIFACT_HASH_CHANGED",
        )
        if (
            resolved_scope.content_type != "application/json"
            or resolved_research.content_type != "application/json"
        ):
            raise CognitiveExecutionFailure(
                "AXWISE_SYNTHESIS_SOURCE_INVALID", retryable=False
            )
        content_by_id = {
            item.artifact.artifact_id: item for item in input_value.artifact_contents
        }
        scope_content = content_by_id[input_value.accepted_scope.artifact_id]
        research_content = content_by_id[input_value.research.artifact_id]
        if (
            scope_content.content_type != "application/json"
            or research_content.content_type != "application/json"
            or scope_content.payload != resolved_scope.payload
            or research_content.payload != resolved_research.payload
        ):
            raise CognitiveExecutionFailure(
                "AXWISE_SYNTHESIS_SOURCE_INVALID", retryable=False
            )
        scope_payload = scope_content.payload
        research_payload = research_content.payload
        try:
            scope = ScopeArtifactV2.model_validate(scope_payload)
            research = ResearchResultV2.model_validate(research_payload)
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_SYNTHESIS_SOURCE_INVALID", retryable=False
            ) from error
        self._verify_scope_authority(
            scope,
            tenant_id=envelope.owner.tenant_id,
            artifact_id=input_value.accepted_scope.artifact_id,
        )
        if (
            research.accepted_scope_artifact_id
            != input_value.accepted_scope.artifact_id
            or research.accepted_scope_hash != input_value.accepted_scope.artifact_hash
            or research.research_input_hash != scope.research_input_hash
        ):
            raise CognitiveExecutionFailure(
                "AXWISE_RESEARCH_SCOPE_MISMATCH", retryable=False
            )
        if input_value.output_contract.evidence_readiness != research.readiness:
            raise CognitiveExecutionFailure(
                "AXWISE_EVIDENCE_READINESS_MISMATCH", retryable=False
            )
        if input_value.output_contract.source_appendix_required != bool(
            research.source_catalogue
        ):
            raise CognitiveExecutionFailure(
                "AXWISE_SOURCE_APPENDIX_CONTRACT_MISMATCH", retryable=False
            )
        if input_value.purpose == "blocked_report":
            if research.readiness != "blocked":
                raise CognitiveExecutionFailure(
                    "AXWISE_BLOCKED_REPORT_REQUIRES_BLOCKED_RESEARCH", retryable=False
                )
            if input_value.output_contract != _blocked_report_output_contract(research):
                raise CognitiveExecutionFailure(
                    "AXWISE_BLOCKED_REPORT_CONTRACT_INVALID", retryable=False
                )
        elif research.readiness == "blocked":
            raise CognitiveExecutionFailure(
                "AXWISE_BLOCKED_RESEARCH_CANNOT_EXECUTE", retryable=False
            )

        plan: PlanningResultV2 | None = None
        plan_content: ImmutableArtifactContent | None = None
        if input_value.accepted_plan is not None:
            if input_value.accepted_plan.kind != "plan":
                raise CognitiveExecutionFailure(
                    "AXWISE_ACCEPTED_PLAN_INVALID", retryable=False
                )
            plan_content = content_by_id[input_value.accepted_plan.artifact_id]
            if plan_content.content_type != "application/json":
                raise CognitiveExecutionFailure(
                    "AXWISE_ACCEPTED_PLAN_INVALID", retryable=False
                )
            try:
                plan = PlanningResultV2.model_validate(plan_content.payload)
            except ValueError as error:
                raise CognitiveExecutionFailure(
                    "AXWISE_ACCEPTED_PLAN_INVALID", retryable=False
                ) from error
            if (
                plan.accepted_scope_artifact != input_value.accepted_scope
                or plan.research_artifact != input_value.research
                or plan.output_contract != input_value.output_contract
                or plan.work_shape != scope.deliverable_profile.artifact_type
                or plan.output_contract.artifact_type
                != scope.deliverable_profile.artifact_type
                or plan.output_contract.required_sections
                != _model_owned_required_sections(
                    scope.deliverable_profile.required_sections
                )
                or plan.output_contract.requirement_ids
                != [item.id for item in scope.requirements]
                or plan.output_contract.acceptance_criteria != scope.acceptance_criteria
            ):
                raise CognitiveExecutionFailure(
                    "AXWISE_ACCEPTED_PLAN_INVALID", retryable=False
                )
            expected_requirements = [
                item.model_dump(mode="json", by_alias=True)
                for item in scope.requirements
            ]
            if [
                item.model_dump(mode="json", by_alias=True)
                for item in plan.requirements
            ] != expected_requirements:
                raise CognitiveExecutionFailure(
                    "AXWISE_ACCEPTED_PLAN_SCOPE_MISMATCH", retryable=False
                )

        task_refs = input_value.task_artifacts or []
        task_contents = [content_by_id[item.artifact_id] for item in task_refs]
        task_results: list[TaskResultV2] = []
        artifact_tasks = []
        artifact_coverages = []
        artifact_markdowns: list[str] = []
        candidate_markdowns: list[str] = []
        candidate_coverages: list[list[RequirementCoverageV1]] = []
        valid_candidate_ids: set[UUID] = set()
        candidate_attestation_defects: list[str] = []
        candidate_records: list[tuple[ArtifactRef, FinalArtifactV1, Any]] = []
        task_result_refs_by_stage_key: dict[str, ArtifactRef] = {}
        for reference, content in zip(task_refs, task_contents, strict=True):
            if content.content_type != "text/markdown":
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                )
            if reference.kind == "task_result":
                try:
                    task_result = TaskResultV2.model_validate(content.payload)
                except ValueError as error:
                    raise CognitiveExecutionFailure(
                        "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                    ) from error
                if (
                    task_result.accepted_scope != input_value.accepted_scope
                    or task_result.research != input_value.research
                    or task_result.accepted_plan != input_value.accepted_plan
                    or task_result.evidence_readiness != research.readiness
                    or task_result.markdown != content.markdown
                    or not _appendix_matches_research(
                        task_result.markdown,
                        task_result.source_appendix,
                        research,
                        rendered=False,
                    )
                ):
                    raise CognitiveExecutionFailure(
                        "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                    )
                task_results.append(task_result)
                task_result_refs_by_stage_key[task_result.task.stage_key] = reference
                artifact_tasks.append(task_result.task)
                artifact_coverages.append(task_result.requirement_coverage)
                artifact_markdowns.append(task_result.markdown)
                continue
            if reference.kind != "final_markdown":
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                )
            try:
                candidate = FinalArtifactV1.model_validate(content.payload)
            except ValueError as error:
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                ) from error
            attestation = candidate.candidate_attestation
            if (
                candidate.markdown != content.markdown
                or candidate.evidence_readiness != research.readiness
                or candidate.launch_ready
                != input_value.output_contract.launch_ready_allowed
                or not _appendix_matches_research(
                    candidate.markdown,
                    candidate.source_appendix,
                    research,
                    rendered=True,
                )
            ):
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                )
            if attestation is None:
                if plan is None or len(plan.tasks) != 1:
                    raise CognitiveExecutionFailure(
                        "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                    )
                candidate_attestation_defects.append(
                    "Final candidate lacks the exact immutable task execution attestation."
                )
                artifact_tasks.append(plan.tasks[0])
                artifact_coverages.append([])
            else:
                plan_task = (
                    next(
                        (
                            item
                            for item in plan.tasks
                            if item.stage_id == attestation.task.stage_id
                        ),
                        None,
                    )
                    if plan is not None
                    else None
                )
                if plan_task != attestation.task:
                    if plan is None or len(plan.tasks) != 1:
                        raise CognitiveExecutionFailure(
                            "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                        )
                    candidate_attestation_defects.append(
                        "Final candidate attests a task that does not equal the accepted plan task."
                    )
                    artifact_tasks.append(plan.tasks[0])
                    artifact_coverages.append([])
                else:
                    artifact_tasks.append(attestation.task)
                    artifact_coverages.append(attestation.requirement_coverage)
                    candidate_coverages.append(attestation.requirement_coverage)
                    valid_candidate_ids.add(reference.artifact_id)
            artifact_markdowns.append(candidate.markdown)
            candidate_markdowns.append(candidate.markdown)
            candidate_records.append((reference, candidate, attestation))

        for reference, candidate, attestation in candidate_records:
            if attestation is None:
                continue
            dependency_refs = []
            for stage_key in attestation.task.depends_on_stage_keys:
                dependency = task_result_refs_by_stage_key.get(stage_key)
                if dependency is None:
                    raise CognitiveExecutionFailure(
                        "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                    )
                dependency_refs.append(dependency)
            expected_candidate_sources = sorted(
                [
                    input_value.accepted_scope,
                    input_value.research,
                    input_value.accepted_plan,
                    *dependency_refs,
                ],
                key=lambda item: str(item.artifact_id),
            )
            if candidate.source_artifacts != expected_candidate_sources:
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                )

        selected_contents = input_value.artifact_contents
        research_context_payload = research.model_dump(mode="json", by_alias=True)
        scope_context_payload = scope.model_dump(mode="json", by_alias=True)
        common_context = PydanticAISynthesisWriter._context(
            input_value,
            scope_context_payload,
            research_context_payload,
            selected_contents,
        )
        permitted_evidence_gap_ids = (
            _permitted_nonblocking_evidence_gap_requirement_ids(scope, research)
        )

        if input_value.purpose == "execute_task":
            assert plan is not None and input_value.task is not None
            plan_task = next(
                (
                    task
                    for task in plan.tasks
                    if task.stage_id == input_value.task.stage_id
                ),
                None,
            )
            if plan_task != input_value.task:
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_PLAN_MISMATCH", retryable=False
                )
            dependency_results: list[TaskResultV2] = []
            for content in input_value.artifact_contents:
                if content.artifact.kind != "task_result":
                    continue
                try:
                    result = TaskResultV2.model_validate(content.payload)
                except ValueError as error:
                    raise CognitiveExecutionFailure(
                        "AXWISE_TASK_DEPENDENCY_INVALID", retryable=False
                    ) from error
                accepted_dependency_task = next(
                    (
                        task
                        for task in plan.tasks
                        if task.stage_key == result.task.stage_key
                    ),
                    None,
                )
                if (
                    accepted_dependency_task != result.task
                    or result.accepted_scope != input_value.accepted_scope
                    or result.research != input_value.research
                    or result.accepted_plan != input_value.accepted_plan
                    or result.evidence_readiness != research.readiness
                    or result.markdown != content.markdown
                    or not _appendix_matches_research(
                        result.markdown,
                        result.source_appendix,
                        research,
                        rendered=False,
                    )
                ):
                    raise CognitiveExecutionFailure(
                        "AXWISE_TASK_DEPENDENCY_INVALID", retryable=False
                    )
                dependency_results.append(result)
            dependency_keys = [item.task.stage_key for item in dependency_results]
            if (
                len(dependency_keys) != len(input_value.task.depends_on_stage_keys)
                or len(set(dependency_keys)) != len(dependency_keys)
                or set(dependency_keys) != set(input_value.task.depends_on_stage_keys)
            ):
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_DEPENDENCY_SET_MISMATCH", retryable=False
                )
            context = common_context
            drafted = await self.synthesis_writer.execute_task(
                input_value,
                scope.model_dump(mode="json", by_alias=True),
                research.model_dump(mode="json", by_alias=True),
                selected_contents,
            )
            draft, input_tokens, output_tokens, model_version = _unwrap_model_output(
                drafted
            )
            draft = _prepare_task_draft_for_execution(context, draft)
            task_markdown = draft.markdown.rstrip()
            appendix = _source_appendix_entries(task_markdown, research)
            receipt = {
                "agent": input_value.task.agent,
                "toolIds": input_value.task.tool_ids,
                "budgetCents": input_value.task.budget_cents,
                "dataBoundary": input_value.task.data_boundary,
            }
            local_substantive, local_practicality = _deterministic_quality_defects(
                draft.markdown,
                practical_output_required=common_context.practical_output_required,
                artifact_type=plan.work_shape,
                reader_output=common_context.reader_output,
            )
            local_evidence_integrity = _deterministic_evidence_integrity_defects(
                draft.markdown,
                common_context.allowed_claim_texts,
                artifact_type=plan.work_shape,
                immutable_gap_labels=context.required_gap_labels,
                unresolved_evidence_requirements=(
                    context.unresolved_evidence_requirements
                ),
            )
            acceptable_coverage = not any(
                item.status == "gap"
                and item.requirement_id not in permitted_evidence_gap_ids
                for item in draft.requirement_coverage
            )
            direct_publication_allowed = False
            if (
                input_value.task.task_kind == "core_draft"
                and input_value.task.produces_full_contract
                and common_context.reader_output is None
            ):
                publication_context = context.model_copy(
                    update={
                        "purpose": "final_synthesis",
                        "quality_gate_required": True,
                    }
                )
                try:
                    _validate_synthesis(
                        publication_context,
                        SynthesisDraft(title=draft.title, markdown=task_markdown),
                    )
                except ValueError:
                    pass
                else:
                    direct_publication_allowed = True
            artifact_id: UUID
            if (
                input_value.task.task_kind == "core_draft"
                and input_value.task.produces_full_contract
                and direct_publication_allowed
                and acceptable_coverage
                and not local_evidence_integrity
                and not local_substantive
                and not local_practicality
                and not _contains_server_unverified_validation_target(draft.markdown)
            ):
                markdown = _markdown_with_source_appendix(
                    task_markdown,
                    appendix,
                    source_section_required=any(
                        _is_server_owned_source_heading(section)
                        for section in scope.deliverable_profile.required_sections
                    ),
                )
                if (
                    common_context.artifact_type in _PLANNING_ARTIFACT_TYPES
                    and not input_value.output_contract.launch_ready_allowed
                ):
                    markdown = _with_advisory_planning_review(
                        common_context,
                        SynthesisDraft(title=draft.title, markdown=markdown),
                    )
                final_candidate = FinalArtifactV1(
                    title=draft.title,
                    markdown=markdown,
                    source_artifacts=input_value.source_artifacts,
                    source_appendix=appendix,
                    evidence_readiness=research.readiness,
                    launch_ready=input_value.output_contract.launch_ready_allowed,
                    candidate_attestation={
                        "task": input_value.task,
                        "requirementCoverage": draft.requirement_coverage,
                        "executionReceipt": receipt,
                    },
                )
                payload = final_candidate.model_dump(mode="json", by_alias=True)
                artifact_id = uuid5(
                    NAMESPACE_URL, f"axwise:{envelope.operation_id}:final-candidate"
                )
                return TaskCompletedResult(
                    result_type="task_completed",
                    artifact=_artifact_fact(
                        artifact_id=artifact_id,
                        kind="final_markdown",
                        payload=payload,
                        markdown=markdown,
                        source_artifact_ids=[
                            item.artifact_id for item in input_value.source_artifacts
                        ],
                    ),
                    evidence_readiness=research.readiness,
                    metrics=_operation_metrics(
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        model_version=model_version,
                    ),
                )
            task_result = TaskResultV2(
                schema_version="orqaly.task-result.v2",
                task=input_value.task,
                accepted_scope=input_value.accepted_scope,
                research=input_value.research,
                accepted_plan=input_value.accepted_plan,
                title=draft.title,
                markdown=task_markdown,
                evidence_readiness=research.readiness,
                source_artifacts=input_value.source_artifacts,
                requirement_coverage=draft.requirement_coverage,
                source_appendix=appendix,
                execution_receipt=receipt,
                conclusions=draft.conclusions,
                unknowns=draft.unknowns,
            )
            payload = task_result.model_dump(mode="json", by_alias=True)
            artifact_id = uuid5(
                NAMESPACE_URL, f"axwise:{envelope.operation_id}:task-result"
            )
            return TaskCompletedResult(
                result_type="task_completed",
                artifact=_artifact_fact(
                    artifact_id=artifact_id,
                    kind="task_result",
                    payload=payload,
                    markdown=task_markdown,
                    source_artifact_ids=[
                        item.artifact_id for item in input_value.source_artifacts
                    ],
                ),
                evidence_readiness=research.readiness,
                metrics=_operation_metrics(
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    model_version=model_version,
                ),
            )

        if input_value.purpose == "evaluate_output":
            assert plan is not None
            if (
                len(artifact_tasks) != len(plan.tasks)
                or {item.stage_id for item in artifact_tasks}
                != {item.stage_id for item in plan.tasks}
                or any(
                    next(
                        item
                        for item in artifact_tasks
                        if item.stage_id == plan_task.stage_id
                    )
                    != plan_task
                    for plan_task in plan.tasks
                )
            ):
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_SET_PLAN_MISMATCH", retryable=False
                )
            drafted = await self.synthesis_writer.evaluate_output(
                input_value,
                scope.model_dump(mode="json", by_alias=True),
                research.model_dump(mode="json", by_alias=True),
                selected_contents,
            )
            draft, input_tokens, output_tokens, model_version = _unwrap_model_output(
                drafted
            )
            core_coverages = [
                coverages
                for task, coverages in zip(
                    artifact_tasks, artifact_coverages, strict=True
                )
                if task.produces_full_contract
            ]
            unmet = utf16_ordinal_sorted(
                {
                    coverage.requirement_id
                    for coverages in (candidate_coverages or core_coverages)
                    for coverage in coverages
                    if coverage.status == "gap"
                    and coverage.requirement_id not in permitted_evidence_gap_ids
                }
            )
            unresolved: set[str] = set()
            readiness_violations = set(draft.readiness_violations)
            allowed = set(common_context.allowed_claim_ids)
            for markdown, content in zip(
                artifact_markdowns, task_contents, strict=True
            ):
                raw_markers = re.findall(r"\[evidence:([^\]]+)\]", markdown)
                unresolved.update(
                    marker for marker in raw_markers if marker not in allowed
                )
                if (
                    research.readiness != "ready"
                    and has_positive_launch_readiness_claim(markdown)
                ):
                    readiness_violations.add(
                        "Non-ready evidence was presented as launch or production ready."
                    )
            deterministic_evidence_integrity = {
                defect
                for task, markdown in zip(
                    artifact_tasks, artifact_markdowns, strict=True
                )
                if task.produces_full_contract
                for defect in _deterministic_evidence_integrity_defects(
                    markdown,
                    common_context.allowed_claim_texts,
                    artifact_type=plan.work_shape,
                    immutable_gap_labels=common_context.required_gap_labels,
                    unresolved_evidence_requirements=(
                        common_context.unresolved_evidence_requirements
                    ),
                )
            }
            unsupported = utf16_ordinal_sorted(
                set(draft.unsupported_precision).union(deterministic_evidence_integrity)
            )
            if len(unsupported) > 40:
                raise CognitiveExecutionFailure(
                    "AXWISE_EVALUATION_FINDINGS_OVERFLOW",
                    retryable=False,
                    diagnostics=_logged_failure_diagnostics(
                        envelope,
                        route="evaluate_output",
                        status="findings_overflow",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    ),
                )
            contradictions = utf16_ordinal_sorted(set(draft.contradictions))
            stale = utf16_ordinal_sorted(set(draft.stale_topic_references))
            readiness_issue_list = utf16_ordinal_sorted(readiness_violations)
            deterministic_substantive: list[str] = []
            deterministic_practicality: list[str] = []
            for task, markdown in zip(artifact_tasks, artifact_markdowns, strict=True):
                if not task.produces_full_contract:
                    continue
                content_defects, practical_defects = _deterministic_quality_defects(
                    markdown,
                    practical_output_required=common_context.practical_output_required,
                    artifact_type=plan.work_shape,
                    reader_output=common_context.reader_output,
                )
                deterministic_substantive.extend(content_defects)
                deterministic_practicality.extend(practical_defects)
            substantive = utf16_ordinal_sorted(
                set(draft.substantive_content_defects).union(
                    deterministic_substantive,
                    candidate_attestation_defects,
                )
            )
            practicality = utf16_ordinal_sorted(
                set(draft.practicality_defects).union(deterministic_practicality)
            )
            issue_count = sum(
                len(items)
                for items in (
                    unmet,
                    unresolved,
                    unsupported,
                    contradictions,
                    stale,
                    readiness_issue_list,
                    substantive,
                    practicality,
                )
            )
            satisfied = (
                issue_count == 0
                and len([item for item in task_refs if item.kind == "final_markdown"])
                == 1
                and next(
                    item for item in task_refs if item.kind == "final_markdown"
                ).artifact_id
                in valid_candidate_ids
            )
            promoted = (
                next(item for item in task_refs if item.kind == "final_markdown")
                if satisfied
                else None
            )
            repair_instructions = utf16_ordinal_sorted(set(draft.repair_instructions))
            if not satisfied and not repair_instructions:
                repair_instructions = (
                    [
                        "Consolidate the exact core draft and specialist packets into one coherent output contract without adding new claims."
                    ]
                    if len(task_refs) > 1 and issue_count == 0
                    else [
                        "Repair only the listed unmet requirements and semantic/source defects; preserve valid material."
                    ]
                )
            evaluation = EvaluationResultV1(
                schema_version="orqaly.evaluation.v1",
                task_artifacts=task_refs,
                source_artifacts=input_value.source_artifacts,
                output_contract_hash=canonical_hash(
                    input_value.output_contract.model_dump(mode="json", by_alias=True)
                ),
                repair_pass=0,
                evidence_readiness=research.readiness,
                unmet_requirement_ids=unmet,
                unresolved_source_markers=utf16_ordinal_sorted(unresolved),
                unsupported_precision=unsupported,
                contradictions=contradictions,
                stale_topic_references=stale,
                readiness_violations=readiness_issue_list,
                substantive_content_defects=substantive,
                practicality_defects=practicality,
                output_contract_satisfied=satisfied,
                promoted_artifact=promoted,
                repair_required=not satisfied,
                repair_instructions=repair_instructions if not satisfied else [],
                note=draft.note,
            )
            payload = evaluation.model_dump(mode="json", by_alias=True)
            artifact_id = uuid5(
                NAMESPACE_URL, f"axwise:{envelope.operation_id}:evaluation"
            )
            return EvaluationCompletedResult(
                result_type="evaluation_completed",
                artifact=_artifact_fact(
                    artifact_id=artifact_id,
                    kind="evaluation",
                    payload=payload,
                    source_artifact_ids=[
                        item.artifact_id for item in input_value.source_artifacts
                    ],
                ),
                execution_output_contract_satisfied=satisfied,
                direct_promotion_artifact=promoted,
                metrics=_operation_metrics(
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    model_version=model_version,
                ),
            )

        evaluation: EvaluationResultV1 | None = None
        if input_value.purpose == "final_synthesis":
            assert plan is not None and input_value.evaluation is not None
            evaluation_content = content_by_id[input_value.evaluation.artifact_id]
            if (
                input_value.evaluation.kind != "evaluation"
                or evaluation_content.content_type != "application/json"
            ):
                raise CognitiveExecutionFailure(
                    "AXWISE_EVALUATION_ARTIFACT_INVALID", retryable=False
                )
            try:
                evaluation = EvaluationResultV1.model_validate(
                    evaluation_content.payload
                )
            except ValueError as error:
                raise CognitiveExecutionFailure(
                    "AXWISE_EVALUATION_ARTIFACT_INVALID", retryable=False
                ) from error
            if (
                evaluation.task_artifacts != task_refs
                or evaluation.source_artifacts
                != sorted(
                    [
                        input_value.accepted_scope,
                        input_value.research,
                        input_value.accepted_plan,
                        *task_refs,
                    ],
                    key=lambda item: str(item.artifact_id),
                )
                or evaluation.output_contract_hash
                != canonical_hash(
                    input_value.output_contract.model_dump(mode="json", by_alias=True)
                )
                or evaluation.evidence_readiness != research.readiness
                or not evaluation.repair_required
                or evaluation.output_contract_satisfied
                or evaluation.promoted_artifact is not None
            ):
                raise CognitiveExecutionFailure(
                    "AXWISE_EVALUATION_ARTIFACT_INVALID", retryable=False
                )
            written = await self.synthesis_writer.write(
                input_value,
                scope.model_dump(mode="json", by_alias=True),
                research.model_dump(mode="json", by_alias=True),
                selected_contents,
            )
        else:
            written = ModelOutput(_deterministic_blocked_report(research))
        draft, input_tokens, output_tokens, model_version = _unwrap_model_output(
            written
        )
        try:
            reader_draft = _normalize_reader_draft(common_context, draft)
        except SynthesisValidationError as error:
            _log_final_contract_failure(envelope, draft.markdown, error)
            raise CognitiveExecutionFailure(
                "AXWISE_FINAL_OUTPUT_CONTRACT_UNSATISFIED",
                retryable=False,
                diagnostics=_logged_failure_diagnostics(
                    envelope,
                    route=input_value.purpose,
                    status="contract_rejected",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                ),
            ) from error
        reader_draft = _project_reader_output_draft(
            reader_draft, common_context.reader_output
        )
        reader_defects = _reader_output_defects(
            reader_draft.markdown, common_context.reader_output
        )
        if reader_defects:
            _log_final_contract_failure(
                envelope,
                reader_draft.markdown,
                SynthesisValidationError(
                    "final reader contract was not satisfied",
                    reason="READER_CONTRACT_FAILED",
                    counts={"reader_contract": len(reader_defects)},
                ),
            )
            raise CognitiveExecutionFailure(
                "AXWISE_FINAL_OUTPUT_CONTRACT_UNSATISFIED",
                retryable=False,
                diagnostics=_logged_failure_diagnostics(
                    envelope,
                    route=input_value.purpose,
                    status="contract_rejected",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                ),
            )
        draft = _decorate_publication_draft(common_context, reader_draft)
        if input_value.purpose == "final_synthesis":
            try:
                # The explicit reader contract (including its headings/item count)
                # was checked before server disclosures/traceability were appended.
                # Do not count that mandatory server text as reader-authored content.
                validation_context = common_context.model_copy(
                    update={
                        "reader_output": None,
                        "required_sections": (
                            []
                            if common_context.reader_output is not None
                            else common_context.required_sections
                        ),
                    }
                )
                _validate_synthesis(validation_context, draft)
            except ValueError as error:
                # Exhausted the single authorized repair. Never silently publish or
                # schedule another paid rewrite to satisfy a quality check.
                _log_final_contract_failure(envelope, draft.markdown, error)
                raise CognitiveExecutionFailure(
                    "AXWISE_FINAL_OUTPUT_CONTRACT_UNSATISFIED",
                    retryable=False,
                    diagnostics=_logged_failure_diagnostics(
                        envelope,
                        route="final_synthesis",
                        status="contract_rejected",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    ),
                ) from error
        appendix = _source_appendix_entries(draft.markdown, research)
        markdown = _markdown_with_source_appendix(
            draft.markdown,
            appendix,
            source_section_required=any(
                _is_server_owned_source_heading(section)
                for section in scope.deliverable_profile.required_sections
            ),
        )
        if input_value.purpose == "final_synthesis":
            reviewer = getattr(self.synthesis_writer, "evaluate_final", None)
            if not callable(reviewer):
                raise CognitiveExecutionFailure(
                    "AXWISE_FINAL_SEMANTIC_REVIEW_UNAVAILABLE",
                    retryable=False,
                    diagnostics=_logged_failure_diagnostics(
                        envelope,
                        route="final_synthesis",
                        status="review_unavailable",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    ),
                )
            try:
                reviewed = await reviewer(
                    input_value,
                    scope.model_dump(mode="json", by_alias=True),
                    research.model_dump(mode="json", by_alias=True),
                    selected_contents,
                    SynthesisDraft(title=draft.title, markdown=markdown),
                )
                review, review_input, review_output, review_model = (
                    _unwrap_model_output(reviewed)
                )
                # Revalidate fields even if a custom writer constructed a model
                # without validation. Disable serializer warnings to avoid raw prose
                # leaking into logs from a malformed review field.
                review = EvaluationDraft.model_validate(
                    review.model_dump(warnings=False)
                    if isinstance(review, BaseModel)
                    else review
                )
            except Exception as error:
                raise CognitiveExecutionFailure(
                    "AXWISE_FINAL_SEMANTIC_REVIEW_FAILED",
                    retryable=False,
                    diagnostics=_logged_failure_diagnostics(
                        envelope,
                        route="final_synthesis",
                        status="review_failed",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    ),
                ) from error
            input_tokens += review_input
            output_tokens += review_output
            model_version = _uniform_model_version([model_version, review_model])
            issue_fields = (
                "unsupported_precision",
                "contradictions",
                "stale_topic_references",
                "readiness_violations",
                "substantive_content_defects",
                "practicality_defects",
                "repair_instructions",
            )
            issue_counts = {
                field: len(getattr(review, field)) for field in issue_fields
            }
            advisory = (
                common_context.artifact_type in _PLANNING_ARTIFACT_TYPES
                and not input_value.output_contract.launch_ready_allowed
            )
            rejected = any(issue_counts.values()) and not advisory
            reviewed_markdown_sha256 = hashlib.sha256(markdown.encode("utf-8")).hexdigest()
            if advisory:
                markdown = _with_advisory_planning_review(
                    common_context,
                    SynthesisDraft(title=draft.title, markdown=markdown),
                    review,
                )
            # No prompt, prose or raw provider response enters runtime logs.
            logging.getLogger(__name__).warning(
                "final_semantic_review %s",
                canonical_json(
                    {
                        "operation_id": str(envelope.operation_id),
                        "reviewed_markdown_sha256": reviewed_markdown_sha256,
                        "markdown_sha256": hashlib.sha256(
                            markdown.encode("utf-8")
                        ).hexdigest(),
                        "review_sha256": canonical_hash(review.model_dump(mode="json")),
                        "issue_counts": issue_counts,
                        "advisory": advisory,
                        "accepted": not rejected,
                    }
                ),
            )
            if rejected:
                raise CognitiveExecutionFailure(
                    "AXWISE_FINAL_SEMANTIC_REJECTED",
                    retryable=False,
                    diagnostics=_logged_failure_diagnostics(
                        envelope,
                        route="final_synthesis",
                        status="semantic_rejected",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    ),
                )
        final = FinalArtifactV1(
            title=draft.title,
            markdown=markdown,
            source_artifacts=input_value.source_artifacts,
            source_appendix=appendix,
            evidence_readiness=research.readiness,
            launch_ready=input_value.output_contract.launch_ready_allowed,
        )
        payload = final.model_dump(mode="json", by_alias=True)
        artifact_id = uuid5(
            NAMESPACE_URL, f"axwise:{envelope.operation_id}:final-markdown"
        )
        return ArtifactSynthesizedResult(
            result_type="artifact_synthesized",
            artifact=_artifact_fact(
                artifact_id=artifact_id,
                kind="final_markdown",
                payload=payload,
                markdown=markdown,
                source_artifact_ids=[
                    item.artifact_id for item in input_value.source_artifacts
                ],
            ),
            evidence_readiness=research.readiness,
            metrics=(
                OperationMetrics(
                    latency_ms=0,
                    input_tokens=0,
                    output_tokens=0,
                    total_tokens=0,
                    search_calls=0,
                    estimated_cost_micros=0,
                )
                if input_value.purpose == "blocked_report"
                else _operation_metrics(
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    model_version=model_version,
                )
            ),
        )


def build_cognitive_executor(
    artifact_resolver: ArtifactResolver,
) -> GeminiCognitiveExecutor:
    from backend.services.generative.searxng_search_service import SearxngSearchService
    from backend.services.workflow_v2.exact_span_extractor import (
        PydanticAIExactSpanExtractor,
    )
    from backend.services.workflow_v2.resilient_research_runner import (
        ResilientResearchRunner,
    )
    from backend.services.workflow_v2.assistant.answer_quality import (
        assistant_answer_defects,
        assistant_repair_query,
    )
    from backend.services.workflow_v2.assistant.publication import (
        assistant_parsed_response_defects,
        assistant_source_url_allowed,
    )

    api_key = os.getenv("GEMINI_API_KEY")
    authority_key = os.getenv("AXWISE_AUTHORITY_SEAL_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    if not authority_key:
        raise RuntimeError("AXWISE_AUTHORITY_SEAL_KEY is required")
    from backend.services.workflow_v2.capability_provider_config import (
        capability_generator_options,
    )

    capability_generators = capability_generator_options(
        os.getenv("AXWISE_CAPABILITY_GENERATORS_ENABLED"), api_key
    )
    model = get_shared_workflow_model(api_key)
    research_runner = ResilientResearchRunner(
        GeminiGroundedResearchRunner(api_key),
        searxng=SearxngSearchService(),
        extractor=PydanticAIExactSpanExtractor(model),
        source_type_classifier=_classify_source_types,
    )
    # One-shot chat can give HIGH-reasoning grounded search a full attempt.
    # Keep durable multi-requirement research's proven 510-second budget and
    # circuit breaker independent; executor.close() owns both runner lifetimes.
    assistant_runner = ResilientResearchRunner(
        GeminiGroundedResearchRunner(
            api_key,
            search_operation_seconds=_ASSISTANT_PRIMARY_SEARCH_OPERATION_SECONDS,
            search_attempt_seconds=_ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS,
            response_validator=assistant_answer_defects,
            repair_query_builder=assistant_repair_query,
            parsed_response_validator=assistant_parsed_response_defects,
        ),
        searxng=SearxngSearchService(),
        extractor=PydanticAIExactSpanExtractor(model),
        source_type_classifier=_classify_source_types,
        discovery_seconds=20.0,
        source_url_validator=assistant_source_url_allowed,
    )
    return GeminiCognitiveExecutor(
        PydanticAIScopeDrafter(model),
        authority_key.encode("utf-8"),
        research_runner,
        artifact_resolver,
        PydanticAISynthesisWriter(model),
        PydanticAIScopeReviser(model),
        assistant_runner=assistant_runner,
        assistant_chat_runner=PydanticAIConversationalAssistantRunner(model),
        solution_preparer=PydanticAISolutionPreparer(model),
        solution_preparer_v2=PydanticAINativeSolutionPreparer(model),
        **capability_generators,
    )
