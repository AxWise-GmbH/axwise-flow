"""Model-assisted scope correction behind a deterministic authority compiler.

Gemini is used only to translate owner prose into a small semantic delta.  It
never writes packet fields that authorize tools, side effects, evidence work,
or executor assignment.  The compiler below owns those projections and seals
the model result, its exact source spans, and all runtime hashes into the next
immutable scope generation.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Protocol

import pycountry
from pydantic_ai import Agent, ModelRetry, NativeOutput, RunContext
from sqlalchemy.exc import IntegrityError

from backend.domain.market_scope import MARKET_COUNTRY_CODES
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    OrchestrationDecisionV1,
    ResearchBriefV1,
)
from backend.domain.orchestration.scope_models import (
    ScopeAssignmentConsumerPayloadV1,
    ScopeAcceptanceV1,
    ScopeClarificationAnswerRequestV1,
    ScopeClarificationResolutionContextV1,
    ScopeContinuationBindingV1,
    ScopeConstraintV1,
    ScopeCorrectionAcceptanceV1,
    ScopeCorrectionCompilationV1,
    ScopeCorrectionInterpretationV1,
    ScopeCorrectionPollV1,
    ScopeCorrectionProposalV1,
    ScopeCorrectionRecordV1,
    ScopeCorrectionResearchDisclosureV1,
    ScopeCorrectionRequestV1,
    ScopeCorrectionUsageV1,
    ScopeProposalCorrectionRequestV1,
    ScopeDeliverableSeedV1,
    ScopeEvidenceContractV1,
    ScopeExecutorRoleSlotV1,
    ScopeIntentV1,
    ScopeLedgerV1,
    ScopeMaterialClarificationV1,
    ScopePacketV1,
    ScopeProposalBindingV1,
    ScopeRequestedActionV1,
    ScopeRequirementV1,
    ScopeResearchContractV1,
    ScopeSemanticDeltaV1,
    ScopeSemanticFieldEditV1,
    ScopeStateV1,
)
from backend.models import OrchestrationScopeCorrection
from backend.services.llm.gemini_runtime import (
    RESEARCH_MODEL_RESOURCE,
    RESEARCH_THINKING_LEVEL,
    get_shared_research_model,
)
from backend.services.orqaly_research_bundle_service import (
    canonical_hash,
    canonical_json_string,
)
from backend.services.orchestration.scope_contract_service import (
    ScopeContractError,
    build_scope_confirmation,
    build_scope_proposal_binding,
    research_execution_inputs_hash,
    scope_contract_binding,
    validate_scope_packet,
)


SCOPE_CORRECTION_PARSER_VERSION = "scope-semantic-parser-v1.1.0"
SCOPE_CORRECTION_PROMPT_VERSION = "scope-correction-prompt-v1.1.0"
SCOPE_CORRECTION_COMPILER_VERSION = "scope-deterministic-compiler-v1.2.0"
MIN_SEMANTIC_CONFIDENCE = 0.85
MAX_EXECUTOR_ROLES = 8
# Three native-output attempts can each consume the bounded 420-second Gemini
# operation window. Keep the durable lease above that worst-case envelope so a
# healthy worker is not duplicated while still allowing crash recovery.
SCOPE_CORRECTION_LEASE_SECONDS = 30 * 60
SCOPE_CORRECTION_HEARTBEAT_SECONDS = 5 * 60
SCOPE_PROPOSAL_MAX_ATTEMPTS = 5
SCOPE_PROPOSAL_RETRY_BASE_SECONDS = 5
SCOPE_PROPOSAL_RETRY_MAX_SECONDS = 5 * 60

_PARSER_CONTRACT = """\
python-character-offsets; exact-span-equality; allowed-fields-v1;
semantic-output-has-no-authority; deterministic-compiler-is-sole-authority;
minimum-confidence-0.85; one-material-clarification; no-regex-fallback;
clarification-answer-exact-span; clarification-field-confinement;
compact-clarification-egress
"""

_COMPILER_CONTRACT = """\
allowed-semantic-fields-v1; exact-literal-conservative-vetoes;
authority-security-tool-policy-owned-by-compiler; derived-work-actions-evidence-roles;
bounded-collections; one-material-clarification; no-semantic-regex-fallback;
clarification-field-confinement;
durable-clarification-edit-inheritance; dependency-safe-edit-reindexing
"""

SCOPE_CORRECTION_SYSTEM_PROMPT = """\
You are AxWise's semantic scope correction interpreter. Return only native
structured ScopeSemanticDeltaV1. Compare the owner's correction with the
provided immutable scope summary. Extract only explicitly requested changes.

Every edit and ambiguity must cite exact Python character offsets and an exact
verbatim substring of CORRECTION_TEXT, or of CLARIFICATION_ANSWER_TEXT when
resolving one material clarification. When MATERIAL_CLARIFICATION_JSON is
present, change or question only its listed semantic fields; the parent's raw
correction and interpretation are intentionally absent. Do not infer
permissions, tools, security policy, side-effect authorization, evidence
outputs, work types, executor assignments, IDs, hashes, or defaults. Use only
the allowed semantic fields and their typed values. A geography edit is
allowed only when the owner explicitly changes a market/country/geography;
names of people, organizations,
schools, products, or works are not geographies. Record an ambiguity whenever
two reasonable interpretations materially change cost, risk, evidence, work,
or output. Do not guess. IDs must be stable ordinal IDs in sorted order:
edit-0000000000000001 and amb-0000000000000001, incrementing the suffix.
Scalar objective/problem/outcome/document/evidence edits are replace-only;
deliverable title may replace or clear; list/work/action edits may replace,
add, remove, or clear. Existing-only evidence is unsupported: emit one
ambiguity asking for no acquisition, synthetic research, or grounded research.
"""

_WORK_GOAL_TO_TYPE = {
    "investigate": "research_analysis",
    "plan": "strategy_planning",
    "create_assets": "content_asset_creation",
    "build_software": "software_development",
    "run_outreach": "outreach_campaign",
    "operate_external_service": "external_service_operation",
    "manage_supply_chain": "procurement_logistics",
    "perform_physical_work": "physical_operations",
    "custom_delivery": "mixed_custom",
}
_TYPE_TO_WORK_GOAL = {value: key for key, value in _WORK_GOAL_TO_TYPE.items()}

_OPERATION_TO_ACTION = {
    "contact_external_party": "contact_external_party",
    "send_sms": "send_sms",
    "send_email": "send_email",
    "spend_money": "spend_money",
    "publish": "publish",
    "deploy": "deploy",
    "procure": "procure",
    "ship": "ship",
    "create_content": "create_content",
    "write_software": "write_software",
}

_ACTION_IDENTITY_ALIASES = {
    "contact external party": "contact_external_party",
    "contact supplier": "contact_external_party",
    "contact suppliers": "contact_external_party",
    "send sms": "send_sms",
    "send email": "send_email",
    "spend money": "spend_money",
    "publish": "publish",
    "deploy": "deploy",
    "procure": "procure",
    "ship": "ship",
    "create content": "create_content",
    "write software": "write_software",
}

_WORK_TYPE_ROLES = {
    "research_analysis": "Research Analyst",
    "strategy_planning": "Strategy Planning Specialist",
    "content_asset_creation": "Content Production Specialist",
    "software_development": "Software Delivery Specialist",
    "outreach_campaign": "Campaign Execution Specialist",
    "external_service_operation": "External Service Operations Specialist",
    "procurement_logistics": "Procurement and Logistics Specialist",
    "physical_operations": "Physical Operations Specialist",
    "mixed_custom": "Domain Delivery Specialist",
}

_COMMERCIAL_ROLES = (
    "Marketing ICP Specialist",
    "Finance Pricing Specialist",
    "GDPR Legal Compliance Specialist",
    "Business Development Sales Specialist",
    "Commercial Risk Analyst",
)

# These are intentionally exact normalized clauses, not broad semantic regexes.
# They can only narrow authority. New variants require a code review and test.
_EXACT_OPERATION_VETOES = {
    (
        "do not perform outreach or contact any person, customer, supplier, "
        "partner, or other external party"
    ): "contact_external_party",
    "do not contact suppliers": "contact_external_party",
    "don't contact suppliers": "contact_external_party",
    "do not contact anyone": "contact_external_party",
    "do not send sms": "send_sms",
    "never send sms": "send_sms",
    "do not send email": "send_email",
    "never send email": "send_email",
    "do not spend money": "spend_money",
    "do not spend any money": "spend_money",
    "never spend money": "spend_money",
    "do not publish": "publish",
    "do not publish anything": "publish",
    "never publish": "publish",
    "do not deploy": "deploy",
    "do not deploy anything": "deploy",
    "never deploy": "deploy",
}
_EXACT_COMPOUND_OPERATION_VETOES = {
    "do not contact suppliers, spend money, publish, or deploy anything": (
        "contact_external_party",
        "spend_money",
        "publish",
        "deploy",
    ),
}
_NO_TOOL_VETOES = {"do not use tools", "use no tools", "never use tools"}
_NO_EXTERNAL_EVIDENCE_VETOES = {
    "do not use external evidence",
    "never use external evidence",
    "use only existing evidence",
}


class ScopeSemanticInterpreter(Protocol):
    async def interpret(
        self, request: ScopeCorrectionRequestV1
    ) -> ScopeSemanticDeltaV1:
        """Return structured semantics without compiling authority."""


class ScopeCorrectionStore(Protocol):
    def find_by_idempotency(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        idempotency_key: str,
    ) -> Any | None: ...

    def find_by_raw_submission(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        task_id: str,
        upstream_decision_id: str,
        source_scope_hash: str,
        correction_hash: str,
    ) -> Any | None: ...

    def get_for_tenant(
        self,
        correction_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Any | None: ...

    def find_latest_successful(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        task_id: str,
        upstream_decision_id: str,
    ) -> Any | None: ...

    def find_active_for_source(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        task_id: str,
        upstream_decision_id: str,
        source_scope_hash: str,
    ) -> Any | None: ...

    def find_by_clarification_parent(
        self,
        parent_correction_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Any | None: ...

    def answer_clarification(
        self,
        parent_correction_id: str,
        child: Any,
    ) -> bool: ...

    def add(self, record: Any) -> None: ...
    def requeue_failed(self, correction_id: str) -> bool: ...
    def extend_lease(
        self,
        correction_id: str,
        lease_token: str,
        expected_status: str,
        lease_expires_at: datetime,
        now: datetime,
    ) -> bool: ...
    def claim_specific(
        self,
        correction_id: str,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
    ) -> Any | None: ...
    def claim_next(
        self,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
        exclude_tenant_key: tuple[str, str] | None = None,
    ) -> Any | None: ...
    def claim_specific_proposal(
        self,
        correction_id: str,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
        max_attempts: int,
    ) -> Any | None: ...
    def claim_next_proposal(
        self,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
        max_attempts: int,
        exclude_tenant_key: tuple[str, str] | None = None,
    ) -> Any | None: ...
    def finalize_proposal(self, correction_id: str, lease_token: str) -> bool: ...
    def mark_proposal_failed(
        self,
        correction_id: str,
        lease_token: str,
        error_code: str,
        next_attempt_at: datetime | None,
        dead_lettered_at: datetime | None,
    ) -> None: ...
    def retry_failed(
        self,
        correction_id: str,
        lease_token: str,
        lease_expires_at: datetime,
    ) -> bool: ...
    def reclaim_expired(
        self,
        correction_id: str,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
    ) -> bool: ...
    def mark_failed(
        self,
        correction_id: str,
        lease_token: str,
        error_code: str,
        usage: dict | None = None,
    ) -> None: ...
    def store_compilation_if_absent(
        self,
        correction_id: str,
        lease_token: str,
        payload: dict,
        status: str,
        now: datetime,
        usage: dict | None = None,
    ) -> bool: ...
    def store_acceptance_if_absent(self, correction_id: str, payload: dict) -> bool: ...
    def rollback(self) -> None: ...


class ScopeParentStore(Protocol):
    def get_for_tenant(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Any | None: ...

    def lock_for_tenant(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Any | None: ...


class ScopeCorrectionConflict(ValueError):
    """Idempotency or first-writer conflict."""


class ScopeCorrectionInProgress(ValueError):
    """Another request owns the one permitted model interpretation attempt."""


class ScopeCorrectionParentError(ValueError):
    """Parent decision is absent, cross-tenant, stale, or otherwise unbound."""


@dataclass(frozen=True)
class ScopeCorrectionRunContext:
    correction_text: str
    allowed_fields: frozenset[str] | None = None


@dataclass(frozen=True)
class ScopeCorrectionReservation:
    record: ScopeCorrectionRecordV1
    internal_user_id: str
    lease_token: str | None
    should_process: bool


@dataclass(frozen=True)
class _ClarificationInheritance:
    """One exact durable parent whose clear edits may survive clarification."""

    request: ScopeCorrectionRequestV1
    interpretation: ScopeCorrectionInterpretationV1
    material_fields: frozenset[str]


class _DurableLeaseHeartbeat:
    """Extend one exact lease while its owner is blocked outside the database."""

    def __init__(
        self,
        *,
        store: ScopeCorrectionStore,
        correction_id: str,
        lease_token: str,
        expected_status: str,
        lease_seconds: float,
        interval_seconds: float,
    ) -> None:
        self.store = store
        self.correction_id = correction_id
        self.lease_token = lease_token
        self.expected_status = expected_status
        self.lease_seconds = lease_seconds
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()
        self._lost = threading.Event()
        self._thread: threading.Thread | None = None

    def _extend(self) -> bool:
        now = datetime.now(timezone.utc)
        try:
            return self.store.extend_lease(
                self.correction_id,
                self.lease_token,
                self.expected_status,
                now + timedelta(seconds=self.lease_seconds),
                now,
            )
        except Exception:
            return False

    def _run(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            if not self._extend():
                self._lost.set()
                return

    def _assert_owned(self) -> None:
        if self._lost.is_set() or not self._extend():
            self._lost.set()
            raise ScopeCorrectionInProgress(
                f"{self.expected_status} lease heartbeat lost ownership"
            )

    def __enter__(self) -> "_DurableLeaseHeartbeat":
        self._assert_owned()
        self._thread = threading.Thread(
            target=self._run,
            name=f"scope-lease-heartbeat-{self.correction_id}",
            daemon=True,
        )
        self._thread.start()
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join()
        if exc_type is None:
            self._assert_owned()


def _canonical(value: Any) -> str:
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json")
    return canonical_json_string(value)


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def _stable_id(prefix: str, payload: Any) -> str:
    return f"{prefix}-{_sha256_text(_canonical(payload))[:16]}"


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def _canonical_action_identity(value: str) -> str:
    normalized = _clean_text(value.replace("_", " ").replace("-", " ")).casefold()
    return _ACTION_IDENTITY_ALIASES.get(normalized, value)


def _sorted_unique(values: Any) -> list[str]:
    normalized = {_clean_text(value) for value in values if _clean_text(value)}
    return sorted(normalized, key=lambda value: (value.casefold(), value))


def _span_is_exact(correction_text: str, edit: ScopeSemanticFieldEditV1) -> bool:
    span = edit.source_span
    return (
        span.end <= len(correction_text)
        and correction_text[span.start : span.end] == span.text
    )


def _validate_delta_spans(correction_text: str, delta: ScopeSemanticDeltaV1) -> None:
    for edit in delta.edits:
        if not _span_is_exact(correction_text, edit):
            raise ScopeContractError(
                f"semantic edit {edit.edit_id} does not cite an exact source span"
            )
    for ambiguity in delta.ambiguities:
        span = ambiguity.source_span
        if (
            span.end > len(correction_text)
            or correction_text[span.start : span.end] != span.text
        ):
            raise ScopeContractError(
                f"semantic ambiguity {ambiguity.ambiguity_id} has a stale source span"
            )


def _clarification_allowed_fields(
    request: ScopeCorrectionRequestV1,
) -> frozenset[str] | None:
    context = request.clarification_context
    if context is None or not context.fields:
        return None
    return frozenset(context.fields)


def _validate_delta_fields(
    delta: ScopeSemanticDeltaV1,
    allowed_fields: frozenset[str] | None,
) -> None:
    if allowed_fields is None:
        return
    observed_fields = {
        *(edit.field for edit in delta.edits),
        *(ambiguity.field for ambiguity in delta.ambiguities),
    }
    if None in observed_fields or not observed_fields.issubset(allowed_fields):
        invalid = sorted(str(field) for field in observed_fields - allowed_fields)
        raise ScopeContractError(
            "clarification answer escaped its material fields: "
            + ", ".join(invalid)
        )


class PydanticAIScopeSemanticInterpreter:
    """Exact Gemini 3.7 Flash HIGH structured interpreter (no fallback model)."""

    def __init__(self, *, model: Any | None = None, api_key: str | None = None) -> None:
        self.last_usage: dict[str, int] | None = None
        if model is None:
            credential = api_key or os.getenv("GEMINI_API_KEY")
            if not credential:
                raise RuntimeError(
                    "scope correction interpretation requires GEMINI_API_KEY"
                )
            model = get_shared_research_model(credential)
        self.agent = Agent(
            model=model,
            deps_type=ScopeCorrectionRunContext,
            output_type=NativeOutput(ScopeSemanticDeltaV1),
            system_prompt=SCOPE_CORRECTION_SYSTEM_PROMPT,
            retries={"output": 2},
        )

        @self.agent.output_validator
        async def validate_output(
            ctx: RunContext[ScopeCorrectionRunContext],
            output: ScopeSemanticDeltaV1,
        ) -> ScopeSemanticDeltaV1:
            try:
                _validate_delta_spans(ctx.deps.correction_text, output)
                _validate_delta_fields(output, ctx.deps.allowed_fields)
            except ScopeContractError as exc:
                raise ModelRetry(str(exc)) from exc
            return output

    async def interpret(
        self, request: ScopeCorrectionRequestV1
    ) -> ScopeSemanticDeltaV1:
        source = request.source_scope_packet
        source_summary = {
            "generation": source.generation,
            "scope_hash": source.scope_hash,
            "intent": source.intent.model_dump(mode="json"),
            "deliverable": source.deliverable.model_dump(mode="json"),
            "admission": (
                source.admission.model_dump(mode="json") if source.admission else None
            ),
            "research_contract": (
                source.research_contract.model_dump(mode="json")
                if source.research_contract
                else None
            ),
        }
        clarification = request.clarification_context
        if clarification is None:
            prompt = (
                "SOURCE_SCOPE_JSON:\n"
                + _canonical(source_summary)
                + "\nCORRECTION_TEXT:\n"
                + request.correction_text
            )
        else:
            material_clarification = {
                "question": clarification.question,
                "fields": list(clarification.fields),
            }
            prompt = (
                "SOURCE_SCOPE_JSON:\n"
                + _canonical(source_summary)
                + "\nMATERIAL_CLARIFICATION_JSON:\n"
                + _canonical(material_clarification)
                + "\nCLARIFICATION_ANSWER_TEXT:\n"
                + request.correction_text
            )
        allowed_fields = _clarification_allowed_fields(request)
        result = await self.agent.run(
            prompt,
            deps=ScopeCorrectionRunContext(
                correction_text=request.correction_text,
                allowed_fields=allowed_fields,
            ),
        )
        raw_usage = result.usage
        if callable(raw_usage):
            raw_usage = raw_usage()
        self.last_usage = {
            "requests": int(getattr(raw_usage, "requests", 0) or 0),
            "input_tokens": int(getattr(raw_usage, "input_tokens", 0) or 0),
            "output_tokens": int(getattr(raw_usage, "output_tokens", 0) or 0),
            "total_tokens": int(getattr(raw_usage, "total_tokens", 0) or 0),
        }
        _validate_delta_spans(request.correction_text, result.output)
        _validate_delta_fields(result.output, allowed_fields)
        return result.output


def _correction_usage(
    interpreter: Any,
    *,
    started_at: float,
    terminal_status: str,
) -> ScopeCorrectionUsageV1:
    usage = getattr(interpreter, "last_usage", None)
    usage = usage if isinstance(usage, dict) else {}
    input_tokens = int(usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or 0)
    total_tokens = max(
        int(usage.get("total_tokens") or 0),
        input_tokens + output_tokens,
    )
    return ScopeCorrectionUsageV1(
        requests=int(usage.get("requests") or 0),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        duration_ms=max(0, round((time.monotonic() - started_at) * 1000)),
        terminal_status=terminal_status,
    )


def wrap_scope_interpretation(
    request: ScopeCorrectionRequestV1,
    delta: ScopeSemanticDeltaV1,
) -> ScopeCorrectionInterpretationV1:
    """Attach immutable server-owned parser/model/prompt/schema provenance."""

    _validate_delta_spans(request.correction_text, delta)
    _validate_delta_fields(delta, _clarification_allowed_fields(request))
    schema = _canonical(ScopeSemanticDeltaV1.model_json_schema())
    model_contract = _canonical(
        {
            "model_resource": RESEARCH_MODEL_RESOURCE,
            "thinking_level": str(RESEARCH_THINKING_LEVEL.value).upper(),
            "output": "native_structured",
        }
    )
    return ScopeCorrectionInterpretationV1(
        source_scope_hash=request.source_scope_hash,
        source_scope_generation=request.source_scope_generation,
        correction_hash=request.correction_hash,
        parser_version=SCOPE_CORRECTION_PARSER_VERSION,
        parser_hash=_sha256_text(_PARSER_CONTRACT),
        model_hash=_sha256_text(model_contract),
        prompt_version=SCOPE_CORRECTION_PROMPT_VERSION,
        prompt_hash=_sha256_text(SCOPE_CORRECTION_SYSTEM_PROMPT),
        schema_hash=_sha256_text(schema),
        delta=delta,
        delta_hash=ScopeCorrectionInterpretationV1.canonical_delta_hash(delta),
    )


def _clarification(
    request: ScopeCorrectionRequestV1,
    interpretation: ScopeCorrectionInterpretationV1,
    *,
    reason_code: str,
    question: str,
    fields: list[str] | None = None,
) -> ScopeCorrectionCompilationV1:
    clarification_payload = {
        "version": "axwise_scope_material_clarification_v1",
        "reason_code": reason_code,
        "question": question,
        "fields": tuple(sorted(set(fields or []))),
        "source_scope_hash": request.source_scope_hash,
        "correction_hash": request.correction_hash,
    }
    clarification_hash = ScopeMaterialClarificationV1.canonical_hash_for(
        clarification_payload
    )
    clarification_payload.update(
        {
            "clarification_id": "scope-clarification-" + clarification_hash[:32],
            "clarification_hash": clarification_hash,
        }
    )
    return ScopeCorrectionCompilationV1(
        status="needs_material_clarification",
        compiler_version=SCOPE_CORRECTION_COMPILER_VERSION,
        compiler_hash=_sha256_text(_COMPILER_CONTRACT),
        interpretation=interpretation,
        clarification=ScopeMaterialClarificationV1.model_validate(
            clarification_payload
        ),
    )


def _contains_literal(haystack: str, needle: str) -> bool:
    """Unicode-aware literal token containment without semantic regex inference."""

    source = haystack.casefold()
    target = needle.casefold()
    cursor = source.find(target)
    while cursor >= 0:
        before = source[cursor - 1] if cursor else " "
        end = cursor + len(target)
        after = source[end] if end < len(source) else " "
        if not before.isalnum() and not after.isalnum():
            return True
        cursor = source.find(target, cursor + 1)
    return False


def _literal_values_supported(edit: ScopeSemanticFieldEditV1) -> bool:
    if edit.operation == "clear":
        return True
    if edit.field in {
        "document_intent",
        "evidence_preference",
        "work_goals",
        "operation_intents",
        "geographies",
    }:
        return True
    values = (
        [edit.text_value] if edit.text_value is not None else list(edit.item_values)
    )
    return all(
        value and _contains_literal(edit.source_span.text, value) for value in values
    )


def _country_aliases(code: str) -> tuple[str, ...]:
    country = pycountry.countries.get(alpha_2=code)
    if country is None:
        return tuple()
    values = {
        code,
        str(country.name),
        str(getattr(country, "official_name", "")),
        str(getattr(country, "common_name", "")),
    }
    return tuple(sorted((value for value in values if value), key=len, reverse=True))


def _geography_edit_is_explicit(
    edit: ScopeSemanticFieldEditV1,
    source_codes: list[str],
) -> bool:
    codes = list(edit.item_values)
    if any(code != code.upper() or code not in MARKET_COUNTRY_CODES for code in codes):
        return False
    span = edit.source_span.text
    if not all(
        any(_contains_literal(span, alias) for alias in _country_aliases(code))
        for code in codes
    ):
        return False
    context_literals = (
        "market",
        "country",
        "countries",
        "geography",
        "geographies",
        "expand to",
        "launch in",
        "operate in",
        "distribution in",
    )
    if not any(_contains_literal(span, value) for value in context_literals):
        return False
    if edit.operation == "replace" and source_codes:
        return any(
            _contains_literal(span, alias)
            for code in source_codes
            for alias in _country_aliases(code)
        )
    return True


def _apply_list_edit(current: list[str], edit: ScopeSemanticFieldEditV1) -> list[str]:
    values = list(edit.item_values)
    current_by_key = {value.casefold(): value for value in current}
    if edit.operation == "clear":
        return []
    if edit.operation == "replace":
        return _sorted_unique(values)
    if edit.operation == "add":
        return _sorted_unique([*current, *values])
    for value in values:
        current_by_key.pop(value.casefold(), None)
    return _sorted_unique(current_by_key.values())


def _apply_enum_edit(
    current: list[str], values: list[str], operation: str
) -> list[str]:
    if operation == "clear":
        return []
    if operation == "replace":
        return sorted(set(values))
    if operation == "add":
        return sorted(set([*current, *values]))
    return sorted(set(current) - set(values))


def _role_slots(roles: list[str]) -> tuple[ScopeExecutorRoleSlotV1, ...]:
    bounded: list[str] = []
    seen: set[str] = set()
    for value in roles:
        role = _clean_text(value)
        key = role.casefold()
        if role and key not in seen:
            seen.add(key)
            bounded.append(role)
    if len(bounded) > MAX_EXECUTOR_ROLES:
        raise ScopeContractError("executor role cap exceeded")
    return tuple(
        ScopeExecutorRoleSlotV1(
            slot_id=(
                f"role-{ordinal:04x}"
                f"{hashlib.sha256(role.encode('utf-8')).hexdigest()[:12]}"
            ),
            role=role,
            required=True,
        )
        for ordinal, role in enumerate(bounded)
    )


def _requested_action(action: str) -> ScopeRequestedActionV1:
    irreversible = action in {
        "contact_external_party",
        "send_sms",
        "send_email",
        "spend_money",
        "publish",
        "deploy",
        "procure",
        "ship",
    }
    return ScopeRequestedActionV1(
        action=action,
        mode="execute" if irreversible else "prepare",
        side_effect="irreversible" if irreversible else "none",
        requires_authorization=irreversible,
    )


def _constraint(text: str) -> ScopeConstraintV1:
    payload = {
        "text": _clean_text(text),
        "kind": "policy",
        "authority": "user",
        "source_refs": ["scope.correction.exact_literal_veto"],
    }
    return ScopeConstraintV1(
        constraint_id=_stable_id(
            "con",
            {
                "text": payload["text"].lower(),
                "kind": payload["kind"],
                "authority": payload["authority"],
            },
        ),
        **payload,
    )


def _requirement(text: str, source_ref: str) -> ScopeRequirementV1:
    normalized = _clean_text(text)
    return ScopeRequirementV1(
        requirement_id=_stable_id("req", {"text": normalized.lower()}),
        text=normalized,
        priority="P0",
        authority="user",
        source_refs=[source_ref],
    )


def _acceptance_for(requirement: ScopeRequirementV1) -> ScopeAcceptanceV1:
    payload = {
        "given": "the approved scope and its authoritative inputs",
        "when": "the deliverable is reviewed against this requirement",
        "then": [f"The deliverable demonstrably satisfies: {requirement.text}"],
        "supports": [requirement.requirement_id],
        "data_class": "manual_review",
    }
    return ScopeAcceptanceV1(
        acceptance_id=_stable_id("acc", payload),
        **payload,
    )


def _compile_evidence(
    source: ScopeEvidenceContractV1,
    preference: str | None,
    geographies: list[str],
) -> ScopeEvidenceContractV1:
    if preference is None:
        return source
    source_outputs = set(source.required_outputs)
    if preference == "none":
        return ScopeEvidenceContractV1()
    if preference == "existing_only":
        outputs = source_outputs or {"research_bundle"}
        outputs.add("research_bundle")
        return ScopeEvidenceContractV1(
            mode="existing",
            required_outputs=tuple(sorted(outputs)),
        )
    if preference == "synthetic":
        outputs = source_outputs - {"market_sources", "market_claims"}
        outputs.add("research_bundle")
        return ScopeEvidenceContractV1(
            mode="synthetic",
            required_outputs=tuple(sorted(outputs)),
        )
    if not geographies:
        raise ScopeContractError("grounded evidence requires an explicit geography")
    outputs = source_outputs | {"market_sources", "research_bundle"}
    return ScopeEvidenceContractV1(
        mode="grounded",
        grounding_required=True,
        external_sources_required=True,
        required_outputs=tuple(sorted(outputs)),
    )


def _build_correction_proposal(
    *,
    correction_id: str,
    request: ScopeCorrectionRequestV1,
    proposal_source: DecisionCreateRequestV1,
    packet: ScopePacketV1,
) -> ScopeCorrectionProposalV1:
    if (
        proposal_source.tenant.org_id != request.org_id
        or proposal_source.tenant.user_id != request.user_id
        or proposal_source.task.task_id != request.task_id
    ):
        raise ScopeContractError("correction proposal source belongs to another owner")
    contract = packet.research_contract
    authority = packet.authority_snapshot
    admission = packet.admission
    if contract is None or authority is None or admission is None:
        raise ScopeContractError("correction proposal requires sealed scope contracts")
    corrected_source = build_corrected_proposal_request(
        correction_id=correction_id,
        request=request,
        proposal_source=proposal_source,
        packet=packet,
    )
    evidence = contract.evidence
    proposal_identity = {
        "correction_id": correction_id,
        "upstream_decision_id": request.upstream_decision_id,
        "scope_hash": packet.scope_hash,
        "contract_hash": contract.contract_hash,
    }
    proposal_id = "scope-proposal-" + canonical_hash(proposal_identity)[:32]
    scope_proposal = build_scope_proposal_binding(
        corrected_source,
        packet,
        proposal_decision_id=proposal_id,
        parent_decision_id=request.upstream_decision_id,
        correction_id=correction_id,
        correction_hash=request.correction_hash,
        compiler_hash=_sha256_text(_COMPILER_CONTRACT),
    )
    payload = {
        "version": "axwise_scope_correction_proposal_v1",
        "correction_id": correction_id,
        "upstream_decision_id": request.upstream_decision_id,
        "scope_proposal": scope_proposal.model_dump(mode="json"),
    }
    return ScopeCorrectionProposalV1.model_validate(payload)


def build_corrected_proposal_request(
    *,
    correction_id: str,
    request: ScopeCorrectionRequestV1,
    proposal_source: DecisionCreateRequestV1,
    packet: ScopePacketV1,
) -> DecisionCreateRequestV1:
    """Project one exact corrected request without carrying semantic source debris.

    The immutable source request supplies only tenant-owned candidates, context
    references, and numeric resource estimates. Semantic task/research fields
    are rebuilt from the deterministic packet and its authority snapshot.
    """

    contract = packet.research_contract
    authority = packet.authority_snapshot
    admission = packet.admission
    if contract is None or authority is None or admission is None:
        raise ScopeContractError("corrected proposal requires complete scope contracts")
    if (
        proposal_source.tenant.org_id != request.org_id
        or proposal_source.tenant.user_id != request.user_id
        or proposal_source.task.task_id != request.task_id
    ):
        raise ScopeContractError("correction proposal source belongs to another owner")

    task_payload = proposal_source.task.model_dump(mode="json")
    task_payload.update(
        {
            "objective": packet.intent.objective,
            "desired_outcome": packet.intent.desired_outcome,
            "domain": authority.task_domain,
            "task_class": authority.task_class,
            "capability_profile": authority.task_capability_profile,
            "required_capabilities": list(admission.required_capabilities),
            "preferred_capabilities": list(authority.task_preferred_capabilities),
            "required_tools": list(authority.required_tools),
            "requested_actions": [item.action for item in admission.requested_actions],
            "stakeholders": list(packet.intent.audiences),
            "constraints": list(authority.task_constraints),
            "data_classification": authority.task_data_classification,
            "risk_level": authority.task_risk_level,
            "urgency": authority.task_urgency,
            "reversibility": authority.task_reversibility,
            "deadline": authority.task_deadline,
        }
    )

    policy_payload = proposal_source.policy_context.model_dump(mode="json")
    policy_payload.update(
        {
            "denied_agent_ids": list(authority.denied_agent_ids),
            "denied_tool_ids": list(authority.denied_tools),
            "human_approval_required_for": list(authority.approval_actions),
            "allowed_data_classifications": list(
                authority.allowed_data_classifications
            ),
            "maximum_risk_without_human": authority.maximum_risk_without_human,
            "guardrails": list(authority.guardrails),
        }
    )
    budget_payload = proposal_source.budget.model_dump(mode="json")
    budget_payload.update(
        {
            "currency": authority.budget_currency,
            "maximum_cost": authority.budget_maximum_cost,
            "maximum_latency_ms": authority.budget_maximum_latency_ms,
        }
    )
    evidence = contract.evidence
    research_payload = proposal_source.research_policy.model_dump(mode="json")
    research_payload.update(
        {
            "allow_existing_evidence": evidence.mode == "existing",
            "allow_hybrid_research": authority.research_allow_hybrid,
            "required": evidence.mode != "none",
            "minimum_mode": "auto" if evidence.mode == "grounded" else "instant",
            "grounding_required": evidence.grounding_required,
            "fail_closed": authority.research_fail_closed,
            "required_outputs": list(evidence.required_outputs),
            "allowed_source_types": (
                list(authority.research_allowed_source_types)
                if authority.research_allowed_source_types is not None
                else None
            ),
            "maximum_research_cost": authority.research_maximum_cost,
            "maximum_research_latency_ms": authority.research_maximum_latency_ms,
            "maximum_research_iterations": authority.research_maximum_iterations,
            "maximum_evidence_items": authority.research_maximum_evidence_items,
            "minimum_evidence_sufficiency": (
                authority.research_minimum_evidence_sufficiency
            ),
            "minimum_value_of_information": (
                authority.research_minimum_value_of_information
            ),
            "minimum_evidence_quality": authority.research_minimum_evidence_quality,
        }
    )

    brief_payload = None
    if evidence.mode != "none":
        source_brief = proposal_source.research_brief
        questions = [
            item.text
            for item in packet.ledger.requirements
            if item.priority in {"P0", "P1"}
        ][:30]
        brief_payload = {
            "business_idea": packet.intent.objective,
            "target_stakeholders": ", ".join(packet.intent.audiences)
            or "scope stakeholders",
            "problem": packet.intent.problem,
            "research_questions": questions,
            "required_execution_roles": [
                slot.role for slot in contract.executor_role_slots
            ],
            "research_prd_type": (
                None
                if contract.document_intent == "custom"
                else contract.document_intent
            ),
            "customer_role_contract": {},
            "critical_claim_policy": {
                "required": evidence.external_sources_required,
                "fail_closed": True,
            },
            "business_evidence_profile": None,
            "industry": authority.task_domain,
            "location": (
                " + ".join(contract.geographies) if contract.geographies else None
            ),
            "depth": source_brief.depth if source_brief is not None else "quick",
            "sample_size": (
                source_brief.sample_size if source_brief is not None else 2
            ),
        }
        # Validate the fresh brief before embedding it in the request. This also
        # resolves and confirms explicit country codes for grounded research.
        brief_payload = ResearchBriefV1.model_validate(brief_payload).model_dump(
            mode="json"
        )

    source_state = proposal_source.scope_state or ScopeStateV1()
    scope_state = source_state.model_copy(
        update={
            "audiences": list(packet.intent.audiences),
            "non_goals": list(packet.intent.non_goals),
            "deliverable": packet.deliverable,
            "admission": admission,
            "research_contract": contract,
        }
    )
    corrected_payload = proposal_source.model_dump(mode="json")
    corrected_payload.update(
        {
            "upstream_decision_id": request.upstream_decision_id,
            "task": task_payload,
            "available_agents": [],
            "policy_context": policy_payload,
            "budget": budget_payload,
            "evidence_catalogue": [],
            "research_policy": research_payload,
            "research_brief": brief_payload,
            "planning": None,
            "scope_state": scope_state.model_dump(mode="json"),
            "scope_packet": packet.model_dump(mode="json"),
            "scope_research_acceptance": None,
            "scope_proposal_acceptance": None,
            "scope_continuation": None,
            "scope_consumer_inputs": None,
        }
    )
    validated = DecisionCreateRequestV1.model_validate(corrected_payload)
    # A corrected Gate-1 proposal is still admission-only.  Validate its exact
    # semantic/authority projection here, but do not mint a downstream
    # capability until the proposal has a durable owner acceptance.
    validate_continuation_request_authority(
        validated,
        packet,
        require_binding=False,
    )
    # A Gate-1 proposal is admission-only. Purpose continuations are minted
    # only after the owner accepts this immutable proposal decision.
    return validated.model_copy(update={"scope_continuation": None})


def _inheritable_edit_group(
    inheritance: _ClarificationInheritance,
) -> tuple[ScopeSemanticFieldEditV1, ...]:
    """Return only exact, dependency-closed edits outside the asked fields."""

    request = inheritance.request
    interpretation = inheritance.interpretation
    if (
        interpretation.source_scope_hash != request.source_scope_hash
        or interpretation.source_scope_generation != request.source_scope_generation
        or interpretation.correction_hash != request.correction_hash
    ):
        raise ScopeContractError(
            "clarification parent interpretation is bound to another source"
        )
    _validate_delta_spans(request.correction_text, interpretation.delta)
    _validate_delta_fields(
        interpretation.delta,
        _clarification_allowed_fields(request),
    )
    if not inheritance.material_fields:
        if interpretation.delta.edits:
            raise ScopeContractError(
                "clarification without material fields cannot inherit sibling edits"
            )
        return tuple()

    candidates = tuple(
        edit
        for edit in interpretation.delta.edits
        if edit.field not in inheritance.material_fields
    )
    selected_ids = {edit.edit_id for edit in candidates}
    # An edit that depends on an unresolved edit is itself unresolved. Remove
    # the whole transitive dependent edge instead of applying a partial graph.
    while True:
        retained_ids = {
            edit.edit_id
            for edit in candidates
            if set(edit.depends_on).issubset(selected_ids)
        }
        if retained_ids == selected_ids:
            break
        selected_ids = retained_ids
    selected = tuple(edit for edit in candidates if edit.edit_id in selected_ids)

    by_id = {edit.edit_id: edit for edit in selected}
    by_field: dict[str, list[ScopeSemanticFieldEditV1]] = {}
    for edit in selected:
        if edit.confidence < MIN_SEMANTIC_CONFIDENCE:
            raise ScopeContractError(
                "clarification parent contains a low-confidence sibling edit"
            )
        if not _literal_values_supported(edit):
            raise ScopeContractError(
                "clarification parent contains an unsupported sibling edit"
            )
        if any(
            by_id[dependency].operation in {"clear", "remove"}
            for dependency in edit.depends_on
        ):
            raise ScopeContractError(
                "clarification parent sibling edit has an invalidated dependency"
            )
        by_field.setdefault(edit.field, []).append(edit)
    for field, edits in by_field.items():
        terminal = [edit for edit in edits if edit.operation in {"replace", "clear"}]
        if len(terminal) > 1 or (terminal and len(edits) > 1):
            raise ScopeContractError(
                f"clarification parent contains contradictory sibling edits for {field}"
            )
    source_admission = request.source_scope_packet.admission
    for edit in by_field.get("geographies", []):
        if source_admission is None or not _geography_edit_is_explicit(
            edit,
            source_admission.geographies,
        ):
            raise ScopeContractError(
                "clarification parent contains an unsupported geography sibling edit"
            )
    return selected


def _canonical_effective_edits(
    groups: tuple[tuple[ScopeSemanticFieldEditV1, ...], ...],
) -> tuple[ScopeSemanticFieldEditV1, ...]:
    """Reindex independent stored deltas into one deterministic compiler graph."""

    effective: list[ScopeSemanticFieldEditV1] = []
    ordinal = 1
    for group in groups:
        id_map = {
            edit.edit_id: f"edit-{ordinal + offset:016x}"
            for offset, edit in enumerate(group)
        }
        for edit in group:
            payload = edit.model_dump(mode="json")
            payload.update(
                {
                    "edit_id": id_map[edit.edit_id],
                    "depends_on": tuple(id_map[value] for value in edit.depends_on),
                }
            )
            effective.append(ScopeSemanticFieldEditV1.model_validate(payload))
        ordinal += len(group)
    # Re-run canonical graph validation after rewriting every dependency.
    return ScopeSemanticDeltaV1(edits=tuple(effective)).edits


def compile_scope_correction(
    request: ScopeCorrectionRequestV1,
    interpretation: ScopeCorrectionInterpretationV1,
    *,
    correction_id: str,
    proposal_source: DecisionCreateRequestV1,
    clarification_inheritance: tuple[_ClarificationInheritance, ...] = tuple(),
) -> ScopeCorrectionCompilationV1:
    """Compile a stored semantic delta; never reinterpret correction prose."""

    if (
        interpretation.source_scope_hash != request.source_scope_hash
        or interpretation.source_scope_generation != request.source_scope_generation
        or interpretation.correction_hash != request.correction_hash
    ):
        raise ScopeContractError("correction interpretation is bound to another source")
    _validate_delta_spans(request.correction_text, interpretation.delta)
    _validate_delta_fields(
        interpretation.delta,
        _clarification_allowed_fields(request),
    )
    delta = interpretation.delta
    inherited_groups = tuple(
        _inheritable_edit_group(item) for item in clarification_inheritance
    )
    inherited_fields: set[str] = set()
    for group in inherited_groups:
        group_fields = {edit.field for edit in group}
        overlap = inherited_fields.intersection(group_fields)
        if overlap:
            raise ScopeContractError(
                "clarification parents contain conflicting inherited fields: "
                + ", ".join(sorted(overlap))
            )
        inherited_fields.update(group_fields)
    child_fields = {
        *(edit.field for edit in delta.edits),
        *(item.field for item in delta.ambiguities if item.field is not None),
    }
    overlap = inherited_fields.intersection(child_fields)
    if overlap:
        raise ScopeContractError(
            "clarification answer conflicts with inherited sibling edits: "
            + ", ".join(sorted(overlap))
        )
    if delta.ambiguities:
        first = sorted(delta.ambiguities, key=lambda item: item.ambiguity_id)[0]
        return _clarification(
            request,
            interpretation,
            reason_code="ambiguous",
            question=first.material_question,
            fields=[item.field for item in delta.ambiguities if item.field],
        )
    if not delta.edits:
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question="What exact scope field should change?",
        )
    effective_edits = _canonical_effective_edits(
        (*inherited_groups, tuple(delta.edits))
    )
    low_confidence = [
        edit for edit in effective_edits if edit.confidence < MIN_SEMANTIC_CONFIDENCE
    ]
    if low_confidence:
        fields = sorted({edit.field for edit in low_confidence})
        return _clarification(
            request,
            interpretation,
            reason_code="low_confidence",
            question=(
                "Please confirm the intended change to " + ", ".join(fields) + "."
            ),
            fields=fields,
        )
    for edit in effective_edits:
        if not _literal_values_supported(edit):
            return _clarification(
                request,
                interpretation,
                reason_code="unsupported",
                question=f"Please state the exact replacement for {edit.field}.",
                fields=[edit.field],
            )

    by_field: dict[str, list[ScopeSemanticFieldEditV1]] = {}
    by_id = {edit.edit_id: edit for edit in effective_edits}
    for edit in effective_edits:
        by_field.setdefault(edit.field, []).append(edit)
        if any(
            by_id[dependency].operation in {"clear", "remove"}
            for dependency in edit.depends_on
        ):
            return _clarification(
                request,
                interpretation,
                reason_code="dependency_invalidated",
                question=f"Should {edit.field} still change after its dependency is removed?",
                fields=[edit.field],
            )
    for field, edits in by_field.items():
        terminal = [edit for edit in edits if edit.operation in {"replace", "clear"}]
        if len(terminal) > 1 or (terminal and len(edits) > 1):
            return _clarification(
                request,
                interpretation,
                reason_code="contradictory",
                question=f"Which single change to {field} should I apply?",
                fields=[field],
            )

    source = request.source_scope_packet
    if source.admission is None or source.research_contract is None:
        raise ScopeContractError(
            "scope correction requires typed admission and research contract"
        )
    geography_edits = by_field.get("geographies", [])
    for edit in geography_edits:
        if not _geography_edit_is_explicit(edit, source.admission.geographies):
            return _clarification(
                request,
                interpretation,
                reason_code="unsupported",
                question=(
                    "Which market or country should replace the current geography?"
                ),
                fields=["geographies"],
            )

    intent = source.intent.model_copy(deep=True)
    deliverable = source.deliverable.model_copy(deep=True)
    admission = source.admission.model_copy(deep=True)
    contract = source.research_contract.model_copy(deep=True)
    authority = source.authority_snapshot
    if authority is None:
        raise ScopeContractError(
            "scope correction requires a sealed authority snapshot"
        )

    intent_payload = intent.model_dump(mode="json")
    deliverable_payload = deliverable.model_dump(mode="json")
    geographies = list(admission.geographies)
    channels = list(admission.channels)
    success_criteria = list(admission.success_criteria)
    work_goals = [
        _TYPE_TO_WORK_GOAL[value]
        for value in contract.work_types
        if value in _TYPE_TO_WORK_GOAL
    ]
    current_actions: dict[str, ScopeRequestedActionV1] = {}
    for action in admission.requested_actions:
        identity = _canonical_action_identity(action.action)
        current_actions[identity] = (
            _requested_action(identity)
            if identity in _OPERATION_TO_ACTION.values()
            else action
        )
    role_values = [slot.role for slot in contract.executor_role_slots]
    evidence_preference: str | None = None
    document_intent = contract.document_intent

    for edit in effective_edits:
        if edit.field in {"objective", "problem", "desired_outcome"}:
            if edit.operation != "replace" or edit.text_value is None:
                return _clarification(
                    request,
                    interpretation,
                    reason_code="unsupported",
                    question=f"What should fully replace {edit.field}?",
                    fields=[edit.field],
                )
            corrected_text = _clean_text(edit.text_value)
            # Objective and outcome are also materialized as ledger
            # requirements, whose immutable contract is bounded to 4,000.
            maximum = 4000
            if not 3 <= len(corrected_text) <= maximum:
                return _clarification(
                    request,
                    interpretation,
                    reason_code="unsupported",
                    question=(
                        f"What complete {edit.field} of 3 to {maximum} "
                        "characters should I use?"
                    ),
                    fields=[edit.field],
                )
            intent_payload[edit.field] = corrected_text
        elif edit.field in {"audiences", "non_goals"}:
            intent_payload[edit.field] = _apply_list_edit(
                list(intent_payload[edit.field]), edit
            )
        elif edit.field == "geographies":
            geographies = _apply_list_edit(geographies, edit)
        elif edit.field == "channels":
            channels = _apply_list_edit(channels, edit)
        elif edit.field == "success_criteria":
            success_criteria = _apply_list_edit(success_criteria, edit)
        elif edit.field == "deliverable_title_prefix":
            if edit.operation == "clear":
                deliverable_payload["title_prefix"] = None
            elif edit.operation == "replace" and edit.text_value:
                title_prefix = _clean_text(edit.text_value)
                if len(title_prefix) > 255:
                    return _clarification(
                        request,
                        interpretation,
                        reason_code="unsupported",
                        question="What title prefix of at most 255 characters should I use?",
                        fields=[edit.field],
                    )
                deliverable_payload["title_prefix"] = title_prefix
            else:
                return _clarification(
                    request,
                    interpretation,
                    reason_code="unsupported",
                    question="What exact title prefix should replace the current one?",
                    fields=[edit.field],
                )
        elif edit.field == "deliverable_sections":
            deliverable_payload["required_sections"] = _apply_list_edit(
                list(deliverable_payload["required_sections"]), edit
            )
        elif edit.field == "document_intent":
            if edit.operation != "replace" or edit.document_intent is None:
                return _clarification(
                    request,
                    interpretation,
                    reason_code="unsupported",
                    question="Which document intent should replace the current intent?",
                    fields=[edit.field],
                )
            document_intent = edit.document_intent
        elif edit.field == "evidence_preference":
            if edit.operation != "replace" or edit.evidence_preference is None:
                return _clarification(
                    request,
                    interpretation,
                    reason_code="unsupported",
                    question="Which evidence mode should replace the current mode?",
                    fields=[edit.field],
                )
            evidence_preference = edit.evidence_preference
        elif edit.field == "work_goals":
            work_goals = _apply_enum_edit(
                work_goals, list(edit.work_goals), edit.operation
            )
        elif edit.field == "operation_intents":
            operation_values = list(edit.operation_intents)
            mapped = [_OPERATION_TO_ACTION[value] for value in operation_values]
            if edit.operation in {"replace", "clear"}:
                current_actions = {}
            if edit.operation in {"replace", "add"}:
                current_actions.update(
                    {action: _requested_action(action) for action in mapped}
                )
            elif edit.operation == "remove":
                for action in mapped:
                    current_actions.pop(action, None)
        elif edit.field == "role_requirements":
            role_values = _apply_list_edit(role_values, edit)

    collection_limits = {
        "audiences": (intent_payload["audiences"], 100),
        "non_goals": (intent_payload["non_goals"], 100),
        "geographies": (geographies, 64),
        "channels": (channels, 100),
        "success_criteria": (success_criteria, 200),
        "deliverable_sections": (deliverable_payload["required_sections"], 100),
        "operation_intents": (current_actions, 100),
    }
    oversized_fields = [
        field for field, (values, limit) in collection_limits.items() if len(values) > limit
    ]
    if oversized_fields:
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question=(
                "Which essential values should remain for "
                + ", ".join(sorted(oversized_fields))
                + "?"
            ),
            fields=oversized_fields,
        )

    correction_texts = (
        *(item.request.correction_text for item in clarification_inheritance),
        request.correction_text,
    )
    matched_vetoes = {
        phrase
        for phrase in (
            set(_EXACT_OPERATION_VETOES)
            | set(_EXACT_COMPOUND_OPERATION_VETOES)
            | _NO_TOOL_VETOES
            | _NO_EXTERNAL_EVIDENCE_VETOES
        )
        if any(_contains_literal(text, phrase) for text in correction_texts)
    }
    vetoed_operations = {
        operation
        for phrase, operation in _EXACT_OPERATION_VETOES.items()
        if phrase in matched_vetoes
    }
    vetoed_operations.update(
        operation
        for phrase, operations in _EXACT_COMPOUND_OPERATION_VETOES.items()
        if phrase in matched_vetoes
        for operation in operations
    )
    requested_operation_edits = {
        operation
        for edit in by_field.get("operation_intents", [])
        if edit.operation in {"replace", "add"}
        for operation in edit.operation_intents
    }
    contradictory_vetoes = vetoed_operations.intersection(requested_operation_edits)
    if contradictory_vetoes:
        return _clarification(
            request,
            interpretation,
            reason_code="contradictory",
            question=(
                "Should I include or exclude "
                + ", ".join(sorted(contradictory_vetoes))
                + "?"
            ),
            fields=["operation_intents"],
        )
    for operation in vetoed_operations:
        current_actions.pop(_OPERATION_TO_ACTION[operation], None)

    source_vetoed_operations = {
        operation
        for constraint in source.ledger.constraints
        for phrase, operation in _EXACT_OPERATION_VETOES.items()
        if _contains_literal(constraint.text, phrase)
    }
    if source_vetoed_operations.intersection(requested_operation_edits):
        return _clarification(
            request,
            interpretation,
            reason_code="dependency_invalidated",
            question=(
                "The new action conflicts with an existing owner constraint. "
                "Should I remove that constraint and authorize the action for later approval?"
            ),
            fields=["operation_intents"],
        )

    removed_non_goals = {
        _clean_text(value)
        for edit in by_field.get("non_goals", [])
        if edit.operation in {"remove", "replace", "clear"}
        for value in (
            edit.item_values
            if edit.operation == "remove"
            else tuple(source.intent.non_goals)
        )
    }
    if any(
        any(
            _contains_literal(constraint.text, removed)
            for removed in removed_non_goals
        )
        for constraint in source.ledger.constraints
    ):
        return _clarification(
            request,
            interpretation,
            reason_code="dependency_invalidated",
            question=(
                "A removed non-goal is still enforced by an owner constraint. "
                "Should I remove that constraint too?"
            ),
            fields=["non_goals"],
        )

    no_external_evidence = bool(
        matched_vetoes.intersection(_NO_EXTERNAL_EVIDENCE_VETOES)
    )
    if no_external_evidence:
        if evidence_preference == "grounded":
            return _clarification(
                request,
                interpretation,
                reason_code="contradictory",
                question="Should evidence be external and grounded, or existing-only?",
                fields=["evidence_preference"],
            )
        evidence_preference = "existing_only"

    ledger_invalidating_fields = {
        "objective",
        "problem",
        "desired_outcome",
        "audiences",
        "geographies",
        "document_intent",
        "evidence_preference",
        "work_goals",
        "operation_intents",
        "role_requirements",
    }.intersection(by_field)
    if vetoed_operations:
        ledger_invalidating_fields.add("operation_intents")
    if no_external_evidence:
        ledger_invalidating_fields.add("evidence_preference")
    dependent_ledger_items = [
        *source.ledger.facts,
        *source.ledger.assumptions,
        *source.ledger.decisions,
    ]
    if ledger_invalidating_fields and dependent_ledger_items:
        return _clarification(
            request,
            interpretation,
            reason_code="dependency_invalidated",
            question=(
                "Existing facts, assumptions, or decisions may depend on the changed "
                "scope. Should I discard and regenerate those dependent entries?"
            ),
            fields=sorted(ledger_invalidating_fields),
        )

    if evidence_preference == "existing_only":
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question=(
                "Existing-only evidence execution is not supported yet. Should I use "
                "no acquisition, synthetic research, or grounded research?"
            ),
            fields=["evidence_preference"],
        )

    try:
        evidence = _compile_evidence(
            contract.evidence, evidence_preference, geographies
        )
    except ScopeContractError:
        return _clarification(
            request,
            interpretation,
            reason_code="dependency_invalidated",
            question="Which country should grounded evidence cover?",
            fields=["geographies", "evidence_preference"],
        )

    work_types = {
        _WORK_GOAL_TO_TYPE[value] for value in work_goals if value in _WORK_GOAL_TO_TYPE
    }
    if document_intent == "commercial_market_launch":
        work_types.add("strategy_planning")
    if evidence.external_sources_required:
        work_types.add("research_analysis")
    for action in current_actions:
        if action in {"contact_external_party", "send_sms", "send_email"}:
            work_types.add("external_service_operation")
        elif action in {"procure", "ship"}:
            work_types.add("procurement_logistics")
        elif action == "write_software":
            work_types.add("software_development")
        elif action == "create_content":
            work_types.add("content_asset_creation")
    if not work_types:
        work_types.add("mixed_custom")
    if len(work_types) > 9:
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question="Which work goals are essential enough to keep in scope?",
            fields=["work_goals"],
        )

    roles_changed = bool(
        {
            "work_goals",
            "operation_intents",
            "evidence_preference",
            "document_intent",
            "role_requirements",
        }.intersection(by_field)
    )
    if roles_changed and "role_requirements" not in by_field:
        role_values = [
            *(
                _COMMERCIAL_ROLES
                if document_intent == "commercial_market_launch"
                else ()
            ),
            *(
                _WORK_TYPE_ROLES[work_type]
                for work_type in sorted(work_types)
                if work_type in _WORK_TYPE_ROLES
            ),
        ]
    if (
        len({role.casefold() for role in role_values if _clean_text(role)})
        > MAX_EXECUTOR_ROLES
    ):
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question=(
                f"Which {MAX_EXECUTOR_ROLES} executor roles are essential to this scope?"
            ),
            fields=["role_requirements"],
        )
    invalid_role_lengths = [
        role for role in role_values if not 2 <= len(_clean_text(role)) <= 255
    ]
    if invalid_role_lengths:
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question="Which executor role names of 2 to 255 characters should I use?",
            fields=["role_requirements"],
        )
    roles = _role_slots(role_values)

    if roles and evidence.mode != "none" and "persona_resolution" not in set(
        evidence.required_outputs
    ):
        evidence = evidence.model_copy(
            update={
                "required_outputs": tuple(
                    sorted({*evidence.required_outputs, "persona_resolution"})
                )
            }
        )

    if document_intent == "custom" and "research_prd" in evidence.required_outputs:
        return _clarification(
            request,
            interpretation,
            reason_code="dependency_invalidated",
            question=(
                "A custom document intent cannot retain the typed research PRD output. "
                "Which supported document intent or non-PRD deliverable should I use?"
            ),
            fields=["document_intent", "evidence_preference"],
        )
    if "research_prd" in evidence.required_outputs:
        deliverable_payload["type"] = f"{document_intent}_prd"
    elif "document_intent" in by_field:
        deliverable_payload["type"] = f"{document_intent}_deliverable"
    try:
        corrected_intent = ScopeIntentV1.model_validate(intent_payload)
        corrected_deliverable = ScopeDeliverableSeedV1.model_validate(
            deliverable_payload
        )
    except ValueError:
        return _clarification(
            request,
            interpretation,
            reason_code="dependency_invalidated",
            question=(
                "The requested intent and deliverable fields no longer form a valid "
                "contract. Which one should remain authoritative?"
            ),
            fields=sorted(by_field),
        )

    research_payload = {
        "version": "axwise_scope_research_contract_v1",
        "document_intent": document_intent,
        "work_types": tuple(sorted(work_types)),
        "geographies": tuple(sorted(set(geographies))),
        "evidence": evidence.model_dump(mode="json"),
        "executor_role_slots": [role.model_dump(mode="json") for role in roles],
    }
    research_payload["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(
        research_payload
    )
    try:
        corrected_contract = ScopeResearchContractV1.model_validate(research_payload)
    except ValueError:
        return _clarification(
            request,
            interpretation,
            reason_code="dependency_invalidated",
            question=(
                "The evidence, work, document, and executor changes no longer form "
                "one coherent contract. Which dependency should I keep?"
            ),
            fields=sorted(
                {
                    *by_field,
                    "document_intent",
                    "evidence_preference",
                    "role_requirements",
                }
            ),
        )

    corrected_admission = admission.model_copy(
        update={
            "work_types": list(corrected_contract.work_types),
            "geographies": list(corrected_contract.geographies),
            "channels": _sorted_unique(channels),
            "success_criteria": _sorted_unique(success_criteria),
            "requested_actions": [
                current_actions[key] for key in sorted(current_actions)
            ],
        }
    )
    if "desired_outcome" in by_field and "success_criteria" not in by_field:
        corrected_admission = corrected_admission.model_copy(
            update={
                "success_criteria": _sorted_unique(
                    [
                        *(
                            value
                            for value in corrected_admission.success_criteria
                            if value != source.intent.desired_outcome
                        ),
                        corrected_intent.desired_outcome,
                    ]
                )
            }
        )
    if not corrected_admission.success_criteria:
        corrected_admission = corrected_admission.model_copy(
            update={"success_criteria": [corrected_intent.desired_outcome]}
        )

    irreversible_actions = {
        action.action
        for action in corrected_admission.requested_actions
        if action.requires_authorization
        or action.mode == "execute"
        or action.side_effect != "none"
    }
    authority_updates: dict[str, Any] = {}
    if irreversible_actions:
        authority_updates.update(
            {
                "approval_actions": tuple(
                    _sorted_unique(
                        [*authority.approval_actions, *irreversible_actions]
                    )
                ),
                "task_reversibility": "irreversible",
                "task_risk_level": (
                    "critical"
                    if authority.task_risk_level == "critical"
                    else "high"
                ),
            }
        )
    corrected_authority = authority.model_copy(update=authority_updates)
    if matched_vetoes.intersection(_NO_TOOL_VETOES):
        corrected_authority = corrected_authority.model_copy(
            update={
                "required_tools": tuple(),
                "denied_tools": tuple(
                    _sorted_unique(
                        [
                            *corrected_authority.denied_tools,
                            *corrected_authority.required_tools,
                        ]
                    )
                ),
                "guardrails": tuple(
                    _sorted_unique(
                        [
                            *corrected_authority.guardrails,
                            "Owner correction: do not use tools",
                        ]
                    )
                ),
            }
        )

    retained_requirements = [
        item
        for item in source.ledger.requirements
        if not any(
            ref in {
                "task.objective",
                "task.desired_outcome",
                "scope.correction.objective",
                "scope.correction.desired_outcome",
            }
            or ref.startswith("task.requested_actions:")
            or ref.startswith("scope.correction.requested_actions:")
            or ref.startswith("scope.deliverable.required_sections:")
            or ref.startswith("scope.correction.deliverable.required_sections:")
            for ref in item.source_refs
        )
    ]
    generated_requirements = [
        _requirement(corrected_intent.objective, "scope.correction.objective"),
        _requirement(
            corrected_intent.desired_outcome, "scope.correction.desired_outcome"
        ),
        *(
            _requirement(
                f"Perform the requested action: {action.action}",
                f"scope.correction.requested_actions:{action.action}",
            )
            for action in corrected_admission.requested_actions
        ),
        *(
            _requirement(
                f"Include the required section: {section}",
                f"scope.correction.deliverable.required_sections:{section}",
            )
            for section in corrected_deliverable.required_sections
        ),
    ]
    requirements_by_id = {
        item.requirement_id: item
        for item in [*retained_requirements, *generated_requirements]
    }
    requirements = [requirements_by_id[key] for key in sorted(requirements_by_id)]
    if len(requirements) > 200:
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question="Which requirements are essential enough to keep in scope?",
        )

    known_requirement_ids = set(requirements_by_id)
    retained_acceptance = [
        item
        for item in source.ledger.acceptance
        if set(item.supports).issubset(known_requirement_ids)
    ]
    covered = {
        requirement_id
        for item in retained_acceptance
        for requirement_id in item.supports
    }
    acceptance = [
        *retained_acceptance,
        *(
            _acceptance_for(requirement)
            for requirement in requirements
            if requirement.requirement_id not in covered
        ),
    ]
    acceptance_by_id = {item.acceptance_id: item for item in acceptance}

    constraints = list(source.ledger.constraints)
    for phrase in sorted(
        matched_vetoes.intersection(
            set(_EXACT_OPERATION_VETOES)
            | set(_EXACT_COMPOUND_OPERATION_VETOES)
            | _NO_TOOL_VETOES
            | _NO_EXTERNAL_EVIDENCE_VETOES
        )
    ):
        constraints.append(_constraint(phrase))
    constraints_by_id = {item.constraint_id: item for item in constraints}
    if len(constraints_by_id) > 200:
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question="Which constraints are essential enough to keep in scope?",
        )

    if len(acceptance_by_id) > 200:
        return _clarification(
            request,
            interpretation,
            reason_code="unsupported",
            question="Which acceptance checks are essential enough to keep in scope?",
        )

    ledger = ScopeLedgerV1(
        requirements=requirements,
        facts=source.ledger.facts,
        assumptions=source.ledger.assumptions,
        decisions=source.ledger.decisions,
        constraints=[constraints_by_id[key] for key in sorted(constraints_by_id)],
        acceptance=[acceptance_by_id[key] for key in sorted(acceptance_by_id)],
    )
    packet_payload = {
        "version": source.version,
        "scope_ref": source.scope_ref,
        "generation": source.generation + 1,
        "source_scope_hash": source.scope_hash,
        "correction_interpretation": interpretation.model_dump(mode="json"),
        "intent": corrected_intent.model_dump(mode="json"),
        "deliverable": corrected_deliverable.model_dump(mode="json"),
        "admission": corrected_admission.model_dump(mode="json"),
        "research_contract": corrected_contract.model_dump(mode="json"),
        "authority_snapshot": corrected_authority.model_dump(mode="json"),
        "ledger": ledger.model_dump(mode="json"),
        "runtime": source.runtime.model_dump(mode="json"),
        "truth_policy": source.truth_policy.model_dump(mode="json"),
        "quality_contract": source.quality_contract.model_dump(mode="json"),
        "document_status": (
            "Draft"
            if any(item.status in {"open", "proposed"} for item in ledger.decisions)
            else "Ready for review"
        ),
    }
    packet_payload["scope_hash"] = ScopePacketV1.canonical_hash_for(packet_payload)
    packet = ScopePacketV1.model_validate(packet_payload)
    scope_validation = validate_scope_packet(packet)
    if not scope_validation.valid:
        raise ScopeContractError(
            "corrected packet failed deterministic scope validation"
        )
    return ScopeCorrectionCompilationV1(
        status="compiled",
        compiler_version=SCOPE_CORRECTION_COMPILER_VERSION,
        compiler_hash=_sha256_text(_COMPILER_CONTRACT),
        interpretation=interpretation,
        scope_packet=packet,
        scope_validation=scope_validation,
        scope_confirmation=build_scope_confirmation(packet),
        scope_contract_binding=scope_contract_binding(packet),
        quality_contract=packet.quality_contract,
        proposal=_build_correction_proposal(
            correction_id=correction_id,
            request=request,
            proposal_source=proposal_source,
            packet=packet,
        ),
    )


def build_scope_continuation_binding(
    *,
    org_id: str,
    user_id: str,
    task_id: str,
    upstream_decision_id: str,
    packet: ScopePacketV1,
    purpose: str,
    correction_id: str | None = None,
) -> ScopeContinuationBindingV1:
    """Mint an exact-scope downstream capability after owner acceptance."""

    interpretation = packet.correction_interpretation
    if correction_id is not None and interpretation is None:
        raise ScopeContractError("correction continuation requires corrected scope")
    payload = {
        "version": "axwise_scope_continuation_v1",
        "org_id": org_id,
        "user_id": user_id,
        "task_id": task_id,
        "upstream_decision_id": upstream_decision_id,
        "source_scope_hash": packet.scope_hash,
        "source_scope_generation": packet.generation,
        "correction_id": correction_id,
        "delta_hash": interpretation.delta_hash if correction_id else None,
        "purpose": purpose,
    }
    payload["binding_hash"] = ScopeContinuationBindingV1.canonical_hash_for(payload)
    return ScopeContinuationBindingV1.model_validate(payload)


def validate_scope_continuation(
    binding: ScopeContinuationBindingV1,
    packet: ScopePacketV1,
    *,
    org_id: str,
    user_id: str,
    task_id: str,
    upstream_decision_id: str,
    downstream_packet: ScopePacketV1 | None = None,
) -> None:
    """Reject tenant/task/link drift and every form of semantic scope expansion."""

    mismatches: list[str] = []
    if binding.org_id != org_id:
        mismatches.append("org_id")
    if binding.user_id != user_id:
        mismatches.append("user_id")
    if binding.task_id != task_id or packet.scope_ref != task_id:
        mismatches.append("task_id")
    if binding.upstream_decision_id != upstream_decision_id:
        mismatches.append("upstream_decision_id")
    if binding.source_scope_hash != packet.scope_hash:
        mismatches.append("source_scope_hash")
    if binding.source_scope_generation != packet.generation:
        mismatches.append("source_scope_generation")
    if binding.delta_hash is not None and (
        packet.correction_interpretation is None
        or packet.correction_interpretation.delta_hash != binding.delta_hash
    ):
        mismatches.append("delta_hash")
    if downstream_packet is not None and downstream_packet != packet:
        mismatches.append("scope_expansion")
    if mismatches:
        raise ScopeContractError(
            "scope continuation binding mismatch: " + ", ".join(sorted(mismatches))
        )


def validate_continuation_request_authority(
    request: DecisionCreateRequestV1,
    packet: ScopePacketV1,
    *,
    require_binding: bool = True,
) -> None:
    """Prove planning/assignment inputs are a subset of the accepted packet."""

    admission = packet.admission
    contract = packet.research_contract
    authority = packet.authority_snapshot
    if admission is None or contract is None or authority is None:
        raise ScopeContractError(
            "scope continuation requires admission, research, and authority snapshots"
        )
    mismatches: list[str] = []
    if request.task.objective != packet.intent.objective:
        mismatches.append("task.objective")
    if request.task.desired_outcome != packet.intent.desired_outcome:
        mismatches.append("task.desired_outcome")
    if authority.task_domain is None or request.task.domain != authority.task_domain:
        mismatches.append("task.domain")
    if request.task.task_class != authority.task_class:
        mismatches.append("task.task_class")
    if request.task.capability_profile != authority.task_capability_profile:
        mismatches.append("task.capability_profile")

    accepted_actions = {item.action for item in admission.requested_actions}
    requested_actions = set(request.task.requested_actions)
    if not requested_actions.issubset(accepted_actions):
        mismatches.append("task.requested_actions")
    if set(request.task.required_tools) != set(authority.required_tools):
        mismatches.append("task.required_tools")
    accepted_capabilities = {
        *admission.required_capabilities,
        *(slot.role for slot in contract.executor_role_slots),
    }
    if not set(request.task.required_capabilities).issubset(accepted_capabilities):
        mismatches.append("task.required_capabilities")
    if not set(request.task.preferred_capabilities).issubset(
        set(authority.task_preferred_capabilities)
    ):
        mismatches.append("task.preferred_capabilities")
    if not set(request.task.stakeholders).issubset(set(packet.intent.audiences)):
        mismatches.append("task.stakeholders")
    if set(request.task.constraints) != set(authority.task_constraints):
        mismatches.append("task.constraints")
    context_reference_hashes = {
        canonical_hash(reference.model_dump(mode="json"))
        for reference in request.task.context_references
    }
    if not context_reference_hashes.issubset(
        set(authority.task_context_reference_hashes)
    ):
        mismatches.append("task.context_references")

    policy = request.policy_context
    if not set(policy.denied_agent_ids).issuperset(set(authority.denied_agent_ids)):
        mismatches.append("policy.denied_agent_ids")
    if not set(policy.denied_tool_ids).issuperset(set(authority.denied_tools)):
        mismatches.append("policy.denied_tool_ids")
    if not set(policy.human_approval_required_for).issuperset(
        set(authority.approval_actions)
    ):
        mismatches.append("policy.human_approval_required_for")
    if not set(policy.guardrails).issuperset(set(authority.guardrails)):
        mismatches.append("policy.guardrails")
    allowed_classifications = {
        str(value.value if hasattr(value, "value") else value)
        for value in policy.allowed_data_classifications
    }
    if not allowed_classifications.issubset(
        set(authority.allowed_data_classifications)
    ):
        mismatches.append("policy.allowed_data_classifications")
    risk_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    policy_maximum_risk = str(
        policy.maximum_risk_without_human.value
        if hasattr(policy.maximum_risk_without_human, "value")
        else policy.maximum_risk_without_human
    )
    if (
        policy_maximum_risk not in risk_order
        or authority.maximum_risk_without_human not in risk_order
        or risk_order[policy_maximum_risk]
        > risk_order[authority.maximum_risk_without_human]
    ):
        mismatches.append("policy.maximum_risk_without_human")
    task_data = str(
        request.task.data_classification.value
        if hasattr(request.task.data_classification, "value")
        else request.task.data_classification
    )
    task_risk = str(
        request.task.risk_level.value
        if hasattr(request.task.risk_level, "value")
        else request.task.risk_level
    )
    task_reversibility = str(
        request.task.reversibility.value
        if hasattr(request.task.reversibility, "value")
        else request.task.reversibility
    )
    if task_data != authority.task_data_classification:
        mismatches.append("task.data_classification")
    if task_risk != authority.task_risk_level:
        mismatches.append("task.risk_level")
    if task_reversibility != authority.task_reversibility:
        mismatches.append("task.reversibility")
    task_urgency = str(
        request.task.urgency.value
        if hasattr(request.task.urgency, "value")
        else request.task.urgency
    )
    if authority.task_urgency is None or task_urgency != authority.task_urgency:
        mismatches.append("task.urgency")
    task_deadline = (
        request.task.deadline.isoformat()
        if request.task.deadline is not None
        else None
    )
    if task_deadline != authority.task_deadline:
        mismatches.append("task.deadline")

    def cap_expands(
        submitted: float | int | None, accepted: float | int | None
    ) -> bool:
        return accepted is not None and (submitted is None or submitted > accepted)

    if request.budget.currency != authority.budget_currency:
        mismatches.append("budget.currency")
    if cap_expands(request.budget.maximum_cost, authority.budget_maximum_cost):
        mismatches.append("budget.maximum_cost")
    if cap_expands(
        request.budget.maximum_latency_ms,
        authority.budget_maximum_latency_ms,
    ):
        mismatches.append("budget.maximum_latency_ms")

    accepted_outputs = set(contract.evidence.required_outputs)
    if not set(request.research_policy.required_outputs).issubset(accepted_outputs):
        mismatches.append("research_policy.required_outputs")
    if (
        request.research_policy.grounding_required
        and not contract.evidence.grounding_required
    ):
        mismatches.append("research_policy.grounding_required")
    research = request.research_policy
    if research.allow_hybrid_research and not authority.research_allow_hybrid:
        mismatches.append("research_policy.allow_hybrid_research")
    if authority.research_fail_closed and not research.fail_closed:
        mismatches.append("research_policy.fail_closed")
    if authority.research_allowed_source_types is not None and (
        research.allowed_source_types is None
        or not set(research.allowed_source_types).issubset(
            set(authority.research_allowed_source_types)
        )
    ):
        mismatches.append("research_policy.allowed_source_types")
    if cap_expands(
        research.maximum_research_cost,
        authority.research_maximum_cost,
    ):
        mismatches.append("research_policy.maximum_research_cost")
    if cap_expands(
        research.maximum_research_latency_ms,
        authority.research_maximum_latency_ms,
    ):
        mismatches.append("research_policy.maximum_research_latency_ms")
    if research.maximum_research_iterations > authority.research_maximum_iterations:
        mismatches.append("research_policy.maximum_research_iterations")
    if research.maximum_evidence_items > authority.research_maximum_evidence_items:
        mismatches.append("research_policy.maximum_evidence_items")
    if (
        research.minimum_evidence_sufficiency
        < authority.research_minimum_evidence_sufficiency
    ):
        mismatches.append("research_policy.minimum_evidence_sufficiency")
    if (
        research.minimum_value_of_information
        < authority.research_minimum_value_of_information
    ):
        mismatches.append("research_policy.minimum_value_of_information")
    if research.minimum_evidence_quality < authority.research_minimum_evidence_quality:
        mismatches.append("research_policy.minimum_evidence_quality")

    binding = request.scope_continuation
    research_requested = (
        request.research_policy.required
        or request.research_policy.grounding_required
        or request.research_policy.minimum_mode
        in {"grounded_fast", "grounded_deep"}
    )
    has_actions = bool(request.task.requested_actions)
    if binding is None and require_binding:
        mismatches.append("scope_continuation")
    elif binding is None:
        pass
    elif binding.purpose == "planning" and (
        request.planning is None or research_requested or has_actions
    ):
        mismatches.append("scope_continuation.purpose")
    elif binding.purpose == "assignment" and (
        request.planning is None
        or research_requested
        or has_actions
        or not request.available_agents
        or request.scope_consumer_inputs is None
        or not isinstance(
            request.scope_consumer_inputs.payload,
            ScopeAssignmentConsumerPayloadV1,
        )
    ):
        mismatches.append("scope_continuation.purpose")
    elif binding.purpose == "research" and (
        not research_requested or request.planning is not None or has_actions
    ):
        mismatches.append("scope_continuation.purpose")
    elif binding.purpose in {"synthesis", "execution"}:
        # These consumers have their own artifact/task execution contracts;
        # DecisionCreateRequestV1 must never be used as a substitute capability.
        mismatches.append("scope_continuation.purpose")

    requirements_by_id = {
        item.requirement_id: item for item in packet.ledger.requirements
    }
    requirement_ids = set(requirements_by_id)
    if request.planning is not None:
        for step in request.planning.steps:
            if not set(step.required_tools).issubset(set(authority.required_tools)):
                mismatches.append(f"planning.{step.step_id}.required_tools")
            if not set(step.requested_actions).issubset(accepted_actions):
                mismatches.append(f"planning.{step.step_id}.requested_actions")
            if not set(step.required_capabilities).issubset(accepted_capabilities):
                mismatches.append(f"planning.{step.step_id}.required_capabilities")
            if not set(step.reviewer_capabilities).issubset(accepted_capabilities):
                mismatches.append(f"planning.{step.step_id}.reviewer_capabilities")
            if step.input_contract.get("scope_hash") != packet.scope_hash:
                mismatches.append(f"planning.{step.step_id}.scope_hash")
            linked_requirements = step.input_contract.get("requirement_ids")
            if (
                not isinstance(linked_requirements, list)
                or not linked_requirements
                or not set(linked_requirements).issubset(requirement_ids)
            ):
                mismatches.append(f"planning.{step.step_id}.requirement_ids")
                linked_requirements = []
            linked_requirement_ids = set(linked_requirements)
            linked_texts = {
                requirements_by_id[requirement_id].text
                for requirement_id in linked_requirement_ids
                if requirement_id in requirements_by_id
            }
            if step.objective not in linked_texts:
                mismatches.append(f"planning.{step.step_id}.objective")
            allowed_criteria = {
                criterion
                for acceptance in packet.ledger.acceptance
                if set(acceptance.supports).intersection(linked_requirement_ids)
                for criterion in getattr(acceptance, "then")
            }
            if not set(step.completion_criteria).issubset(allowed_criteria):
                mismatches.append(f"planning.{step.step_id}.completion_criteria")
            expected_output_contract = {
                "scope_hash": packet.scope_hash,
                "requirement_ids": sorted(linked_requirement_ids),
                "deliverable_type": packet.deliverable.type,
                "deliverable_count": packet.deliverable.count,
                "presentation": packet.deliverable.presentation,
                "required_sections": list(packet.deliverable.required_sections),
            }
            if step.output_contract != expected_output_contract:
                mismatches.append(f"planning.{step.step_id}.output_contract")

            semantic_texts: list[str] = [
                step.title,
                step.objective,
                *step.completion_criteria,
                *step.review_rules,
            ]

            def collect_text(value: Any) -> None:
                if isinstance(value, str):
                    semantic_texts.append(value)
                elif isinstance(value, dict):
                    for key, child in value.items():
                        collect_text(str(key))
                        collect_text(child)
                elif isinstance(value, (list, tuple)):
                    for child in value:
                        collect_text(child)

            collect_text(step.input_contract)
            collect_text(step.output_contract)
            detected_actions = {
                action
                for action in _OPERATION_TO_ACTION.values()
                if any(
                    _contains_literal(text, action.replace("_", " "))
                    for text in semantic_texts
                )
            }
            if not detected_actions.issubset(set(step.requested_actions)):
                mismatches.append(f"planning.{step.step_id}.undeclared_actions")
    if mismatches:
        raise ScopeContractError(
            "scope continuation expands or contradicts accepted authority: "
            + ", ".join(sorted(set(mismatches)))
        )


PARTNER_ID = "orqaly"


class ScopeCorrectionService:
    """Validate, reserve, interpret, compile, and accept one raw correction."""

    def __init__(
        self,
        *,
        parent_store: ScopeParentStore,
        correction_store: ScopeCorrectionStore,
        interpreter: ScopeSemanticInterpreter | None,
        interpreter_factory: Callable[[], ScopeSemanticInterpreter] | None = None,
        proposal_persister: Callable[
            [
                ScopeCorrectionRequestV1,
                ScopeCorrectionCompilationV1,
                DecisionCreateRequestV1,
                str,
            ],
            Any,
        ]
        | None = None,
        lease_duration_seconds: float = SCOPE_CORRECTION_LEASE_SECONDS,
        lease_heartbeat_seconds: float = SCOPE_CORRECTION_HEARTBEAT_SECONDS,
    ) -> None:
        if interpreter is not None and interpreter_factory is not None:
            raise ValueError("provide either interpreter or interpreter_factory, not both")
        if lease_duration_seconds <= 0 or lease_heartbeat_seconds <= 0:
            raise ValueError("scope correction lease timing must be positive")
        if lease_heartbeat_seconds >= lease_duration_seconds:
            raise ValueError("scope correction heartbeat must precede lease expiry")
        self.parent_store = parent_store
        self.correction_store = correction_store
        self.interpreter = interpreter
        self.interpreter_factory = interpreter_factory
        self.proposal_persister = proposal_persister
        self.lease_duration_seconds = lease_duration_seconds
        self.lease_heartbeat_seconds = lease_heartbeat_seconds

    @staticmethod
    def _record_from_row(row: Any, *, reused: bool = False) -> ScopeCorrectionRecordV1:
        request = ScopeCorrectionRequestV1.model_validate(row.raw_request_payload)
        durable_bindings = {
            "partner_id": (row.partner_id, PARTNER_ID),
            "org_id": (row.external_org_id, request.org_id),
            "user_id": (row.external_user_id, request.user_id),
            "task_id": (row.task_id, request.task_id),
            "upstream_decision_id": (
                row.upstream_decision_id,
                request.upstream_decision_id,
            ),
            "source_correction_id": (
                row.source_correction_id,
                request.source_correction_id,
            ),
            "parent_correction_id": (
                row.parent_correction_id,
                (
                    request.clarification_context.parent_correction_id
                    if request.clarification_context is not None
                    else None
                ),
            ),
            "clarification_answer_hash": (
                row.clarification_answer_hash,
                (
                    request.clarification_context.answer_hash
                    if request.clarification_context is not None
                    else None
                ),
            ),
            "source_scope_hash": (row.source_scope_hash, request.source_scope_hash),
            "source_scope_generation": (
                row.source_scope_generation,
                request.source_scope_generation,
            ),
            "correction_hash": (row.correction_hash, request.correction_hash),
        }
        mismatches = [
            field
            for field, (stored, expected) in durable_bindings.items()
            if stored != expected
        ]
        if mismatches:
            raise ScopeCorrectionConflict(
                "durable correction binding mismatch: "
                + ", ".join(sorted(mismatches))
            )
        compilation = (
            ScopeCorrectionCompilationV1.model_validate(row.compilation_payload)
            if row.compilation_payload is not None
            else None
        )
        acceptance = (
            ScopeCorrectionAcceptanceV1.model_validate(row.acceptance_payload)
            if row.acceptance_payload is not None
            else None
        )
        usage = (
            ScopeCorrectionUsageV1.model_validate(row.usage_payload)
            if row.usage_payload is not None
            else None
        )
        return ScopeCorrectionRecordV1(
            correction_id=row.correction_id,
            request=request,
            status=row.status,
            compilation=compilation,
            acceptance=acceptance,
            usage=usage,
            interpretation_attempt_count=getattr(row, "attempt_count", 0) or 0,
            proposal_attempt_count=(
                getattr(row, "proposal_attempt_count", 0) or 0
            ),
            next_retry_at=getattr(row, "proposal_next_attempt_at", None),
            error_code=getattr(row, "error_code", None),
            reused=reused,
        )

    def _validated_parent(
        self,
        request: ScopeCorrectionRequestV1,
        internal_user_id: str,
    ) -> tuple[Any, OrchestrationDecisionV1, DecisionCreateRequestV1]:
        row = self.parent_store.get_for_tenant(
            request.upstream_decision_id,
            request.org_id,
            request.user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeCorrectionParentError(
                "upstream orchestration decision was not found"
            )
        decision = OrchestrationDecisionV1.model_validate(row.decision_payload)
        snapshot = DecisionCreateRequestV1.model_validate(row.input_snapshot)
        mismatches: list[str] = []
        if decision.decision_id != request.upstream_decision_id:
            mismatches.append("upstream_decision_id")
        if (
            decision.task_id != request.task_id
            or snapshot.task.task_id != request.task_id
        ):
            mismatches.append("task_id")
        if snapshot.tenant.org_id != request.org_id:
            mismatches.append("org_id")
        if snapshot.tenant.user_id != request.user_id:
            mismatches.append("user_id")
        if request.source_scope_packet.scope_hash != request.source_scope_hash:
            mismatches.append("source_scope_hash")
        if request.source_scope_generation == 0:
            if decision.scope_packet != request.source_scope_packet:
                mismatches.append("decision.scope_packet")
            if snapshot.scope_packet != request.source_scope_packet:
                mismatches.append("input_snapshot.scope_packet")
            proposal = decision.scope_proposal
            if (
                proposal is None
                or proposal.proposal_decision_id != decision.decision_id
                or proposal.parent_decision_id is not None
                or proposal.scope_generation != 0
                or proposal.correction_id is not None
                or proposal.scope_hash != request.source_scope_hash
                or decision.parent_decision_id is not None
                or decision.research_job is not None
                or decision.scope_research_acceptance is not None
                or snapshot.upstream_decision_id is not None
                or snapshot.planning is not None
                or snapshot.scope_research_acceptance is not None
                or snapshot.scope_proposal_acceptance is not None
                or snapshot.scope_continuation is not None
                or snapshot.scope_consumer_inputs is not None
            ):
                mismatches.append("upstream_gate1_proposal")
            if request.source_proposal_decision_id is not None and (
                proposal is None
                or proposal.proposal_decision_id
                != request.source_proposal_decision_id
                or proposal.proposal_hash != request.source_proposal_hash
            ):
                mismatches.append("source_proposal")
        else:
            source_row = self.correction_store.get_for_tenant(
                request.source_correction_id,
                request.org_id,
                request.user_id,
                internal_user_id,
            )
            if source_row is None:
                mismatches.append("source_correction_id")
            else:
                try:
                    source_record = self._record_from_row(source_row)
                except (ValueError, TypeError):
                    mismatches.append("source_correction")
                else:
                    source_packet = (
                        source_record.compilation.scope_packet
                        if source_record.compilation is not None
                        else None
                    )
                    if (
                        source_record.correction_id != request.source_correction_id
                        or source_record.request.upstream_decision_id
                        != request.upstream_decision_id
                        or source_record.request.task_id != request.task_id
                        or source_record.status
                        not in {"compiled", "accepted"}
                        or source_packet != request.source_scope_packet
                    ):
                        mismatches.append("source_correction")
                    source_proposal = (
                        source_record.compilation.proposal.scope_proposal
                        if source_record.compilation is not None
                        and source_record.compilation.proposal is not None
                        else None
                    )
                    if request.source_proposal_decision_id is not None and (
                        source_proposal is None
                        or source_proposal.proposal_decision_id
                        != request.source_proposal_decision_id
                        or source_proposal.proposal_hash
                        != request.source_proposal_hash
                    ):
                        mismatches.append("source_proposal")
        clarification_context = request.clarification_context
        if clarification_context is not None:
            clarification_parent_row = self.correction_store.get_for_tenant(
                clarification_context.parent_correction_id,
                request.org_id,
                request.user_id,
                internal_user_id,
            )
            if clarification_parent_row is None:
                mismatches.append("clarification_parent")
            else:
                try:
                    clarification_parent = self._record_from_row(
                        clarification_parent_row
                    )
                except (ValueError, TypeError):
                    mismatches.append("clarification_parent")
                else:
                    parent_compilation = clarification_parent.compilation
                    material = (
                        parent_compilation.clarification
                        if parent_compilation is not None
                        else None
                    )
                    if (
                        clarification_parent.status != "clarification_answered"
                        or parent_compilation is None
                        or parent_compilation.status
                        != "needs_material_clarification"
                        or material is None
                        or material.clarification_id
                        != clarification_context.clarification_id
                        or material.clarification_hash
                        != clarification_context.clarification_hash
                        or material.reason_code != clarification_context.reason_code
                        or material.question != clarification_context.question
                        or material.fields != clarification_context.fields
                        or material.source_scope_hash
                        != clarification_context.source_scope_hash
                        or material.correction_hash
                        != clarification_context.original_correction_hash
                        or material.source_scope_hash
                        != clarification_parent.request.source_scope_hash
                        or material.correction_hash
                        != clarification_parent.request.correction_hash
                        or clarification_parent.request.source_scope_hash
                        != request.source_scope_hash
                        or clarification_parent.request.source_scope_generation
                        != request.source_scope_generation
                    ):
                        mismatches.append("clarification_parent")
        if mismatches:
            raise ScopeCorrectionParentError(
                "scope correction parent mismatch: " + ", ".join(sorted(mismatches))
            )
        return row, decision, snapshot

    def _clarification_inheritance(
        self,
        request: ScopeCorrectionRequestV1,
        internal_user_id: str,
    ) -> tuple[_ClarificationInheritance, ...]:
        """Load the exact durable clarification ancestry, oldest parent first."""

        chain: list[_ClarificationInheritance] = []
        current_request = request
        seen: set[str] = set()
        while current_request.clarification_context is not None:
            context = current_request.clarification_context
            if context.parent_correction_id in seen:
                raise ScopeCorrectionParentError(
                    "scope clarification ancestry contains a cycle"
                )
            seen.add(context.parent_correction_id)
            # Revalidate each edge against its upstream decision and exact
            # durable clarification before trusting any stored semantic edit.
            self._validated_parent(current_request, internal_user_id)
            parent_row = self.correction_store.get_for_tenant(
                context.parent_correction_id,
                current_request.org_id,
                current_request.user_id,
                internal_user_id,
            )
            if parent_row is None:
                raise ScopeCorrectionParentError(
                    "scope clarification parent was not found"
                )
            parent = self._record_from_row(parent_row)
            compilation = parent.compilation
            material = compilation.clarification if compilation is not None else None
            if (
                parent.status != "clarification_answered"
                or compilation is None
                or compilation.status != "needs_material_clarification"
                or material is None
                or material.clarification_id != context.clarification_id
                or material.clarification_hash != context.clarification_hash
                or material.reason_code != context.reason_code
                or material.question != context.question
                or material.fields != context.fields
                or material.source_scope_hash != parent.request.source_scope_hash
                or material.correction_hash != parent.request.correction_hash
                or parent.request.source_scope_packet
                != current_request.source_scope_packet
                or parent.request.source_scope_hash
                != current_request.source_scope_hash
                or parent.request.source_scope_generation
                != current_request.source_scope_generation
            ):
                raise ScopeCorrectionParentError(
                    "scope clarification ancestry is not exact"
                )
            chain.append(
                _ClarificationInheritance(
                    request=parent.request,
                    interpretation=compilation.interpretation,
                    material_fields=frozenset(material.fields),
                )
            )
            current_request = parent.request
        return tuple(reversed(chain))

    def _validate_latest_source(self, request: ScopeCorrectionRequestV1) -> None:
        latest = self.correction_store.find_latest_successful(
            PARTNER_ID,
            request.org_id,
            request.user_id,
            request.task_id,
            request.upstream_decision_id,
        )
        if request.source_scope_generation == 0:
            if latest is not None:
                raise ScopeCorrectionParentError(
                    "source scope is stale; continue from the latest compiled correction"
                )
            return
        if latest is None or latest.correction_id != request.source_correction_id:
            raise ScopeCorrectionParentError(
                "source correction is not the latest compiled scope"
            )

    @staticmethod
    def _same_submission(row: Any, request: ScopeCorrectionRequestV1) -> bool:
        try:
            stored = ScopeCorrectionRequestV1.model_validate(row.raw_request_payload)
        except Exception:
            return False
        return stored == request

    def _existing_before_model(
        self,
        request: ScopeCorrectionRequestV1,
        idempotency_key: str,
    ) -> Any | None:
        by_idempotency = self.correction_store.find_by_idempotency(
            PARTNER_ID,
            request.org_id,
            request.user_id,
            idempotency_key,
        )
        if by_idempotency is not None and not self._same_submission(
            by_idempotency, request
        ):
            raise ScopeCorrectionConflict(
                "scope correction idempotency key was reused with changed input"
            )
        if by_idempotency is not None:
            return by_idempotency
        return self.correction_store.find_by_raw_submission(
            PARTNER_ID,
            request.org_id,
            request.user_id,
            request.task_id,
            request.upstream_decision_id,
            request.source_scope_hash,
            request.correction_hash,
        )

    def _new_interpretation_lease(self) -> tuple[str, datetime]:
        return (
            f"scope-correction-lease-{uuid.uuid4().hex}",
            datetime.now(timezone.utc)
            + timedelta(seconds=self.lease_duration_seconds),
        )

    def _lease_heartbeat(
        self,
        *,
        correction_id: str,
        lease_token: str,
        expected_status: str,
    ) -> _DurableLeaseHeartbeat:
        return _DurableLeaseHeartbeat(
            store=self.correction_store,
            correction_id=correction_id,
            lease_token=lease_token,
            expected_status=expected_status,
            lease_seconds=self.lease_duration_seconds,
            interval_seconds=self.lease_heartbeat_seconds,
        )

    def request_from_proposal(
        self,
        request: ScopeProposalCorrectionRequestV1,
        *,
        internal_user_id: str,
    ) -> ScopeCorrectionRequestV1:
        """Load the sealed source packet; callers never echo AxWise authority."""

        row = self.parent_store.get_for_tenant(
            request.proposal_decision_id,
            request.org_id,
            request.user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeCorrectionParentError("scope proposal decision was not found")
        decision = OrchestrationDecisionV1.model_validate(row.decision_payload)
        snapshot = DecisionCreateRequestV1.model_validate(row.input_snapshot)
        proposal = decision.scope_proposal
        packet = decision.scope_packet
        if (
            proposal is None
            or packet is None
            or proposal.proposal_decision_id != request.proposal_decision_id
            or proposal.proposal_hash != request.proposal_hash
            or proposal.scope_hash != request.scope_hash
            or proposal.scope_generation != request.scope_generation
            or proposal.task_id != request.task_id
            or proposal.org_id != request.org_id
            or proposal.user_id != request.user_id
            or packet.scope_hash != request.scope_hash
            or packet.generation != request.scope_generation
            or snapshot.scope_packet != packet
            or decision.research_job is not None
            or decision.scope_research_acceptance is not None
            or snapshot.scope_proposal_acceptance is not None
            or snapshot.scope_continuation is not None
            or snapshot.scope_consumer_inputs is not None
        ):
            raise ScopeCorrectionParentError(
                "source is not the exact immutable Gate-1 scope proposal"
            )
        upstream_decision_id = (
            proposal.proposal_decision_id
            if proposal.scope_generation == 0
            else proposal.parent_decision_id
        )
        if not upstream_decision_id:
            raise ScopeCorrectionParentError("scope proposal lost its root decision")
        return ScopeCorrectionRequestV1(
            org_id=request.org_id,
            user_id=request.user_id,
            task_id=request.task_id,
            upstream_decision_id=upstream_decision_id,
            source_correction_id=proposal.correction_id,
            source_proposal_decision_id=proposal.proposal_decision_id,
            source_proposal_hash=proposal.proposal_hash,
            source_scope_packet=packet,
            source_scope_hash=packet.scope_hash,
            source_scope_generation=packet.generation,
            correction_text=request.correction_text,
            correction_hash=request.correction_hash,
        )

    def reserve_from_proposal(
        self,
        request: ScopeProposalCorrectionRequestV1,
        *,
        internal_user_id: str,
        idempotency_key: str,
    ) -> ScopeCorrectionReservation:
        internal_request = self.request_from_proposal(
            request,
            internal_user_id=internal_user_id,
        )
        return self.reserve(
            internal_request,
            internal_user_id=internal_user_id,
            idempotency_key=idempotency_key,
        )

    @staticmethod
    def compact_poll(record: ScopeCorrectionRecordV1) -> ScopeCorrectionPollV1:
        """Project a bounded status without returning the private source snapshot."""

        request = record.request
        compilation = record.compilation
        result_packet = None
        result_proposal = None
        clarification = None
        if record.status in {"compiled", "accepted"} and compilation is not None:
            result_packet = compilation.scope_packet
            result_proposal = (
                compilation.proposal.scope_proposal
                if compilation.proposal is not None
                else None
            )
        elif record.status == "needs_material_clarification" and compilation is not None:
            clarification = compilation.clarification
        if not request.source_proposal_decision_id or not request.source_proposal_hash:
            raise ScopeCorrectionConflict(
                "compact correction projection requires proposal provenance"
            )
        return ScopeCorrectionPollV1(
            correction_id=record.correction_id,
            source_proposal_decision_id=request.source_proposal_decision_id,
            source_proposal_hash=request.source_proposal_hash,
            task_id=request.task_id,
            source_scope_hash=request.source_scope_hash,
            source_scope_generation=request.source_scope_generation,
            correction_hash=request.correction_hash,
            status=(
                "compiled" if record.status == "accepted" else record.status
            ),
            result_scope_packet=result_packet,
            result_proposal=result_proposal,
            clarification=clarification,
            usage=record.usage,
            interpretation_attempt_count=record.interpretation_attempt_count,
            proposal_attempt_count=record.proposal_attempt_count,
            next_retry_at=record.next_retry_at,
            error_code=record.error_code,
            reused=record.reused,
        )

    def reserve(
        self,
        request: ScopeCorrectionRequestV1,
        *,
        internal_user_id: str,
        idempotency_key: str,
    ) -> ScopeCorrectionReservation:
        """Persist or reclaim work without invoking the semantic model."""

        # Serialize acceptance and revision creation on the immutable root
        # decision. Corrected chains keep the same upstream decision ID.
        locked = self.parent_store.lock_for_tenant(
            request.upstream_decision_id,
            request.org_id,
            request.user_id,
            internal_user_id,
        )
        if locked is None:
            raise ScopeCorrectionParentError(
                "upstream orchestration decision was not found"
            )
        # Parent validation intentionally precedes every persistence/model step.
        self._validated_parent(request, internal_user_id)
        existing = self._existing_before_model(request, idempotency_key)
        if existing is not None and existing.compilation_payload is not None:
            return ScopeCorrectionReservation(
                record=self._record_from_row(existing, reused=True),
                internal_user_id=existing.user_id,
                lease_token=None,
                should_process=False,
            )
        self._validate_latest_source(request)
        if existing is not None:
            if existing.status == "failed":
                self.correction_store.requeue_failed(existing.correction_id)
            current = self.correction_store.get_for_tenant(
                existing.correction_id,
                request.org_id,
                request.user_id,
                internal_user_id,
            )
            if current is None:
                raise ScopeCorrectionConflict("reserved scope correction disappeared")
            return ScopeCorrectionReservation(
                record=self._record_from_row(current, reused=True),
                internal_user_id=current.user_id,
                lease_token=None,
                should_process=False,
            )
        else:
            row = OrchestrationScopeCorrection(
                correction_id=f"scope-correction-{uuid.uuid4().hex}",
                partner_id=PARTNER_ID,
                external_org_id=request.org_id,
                external_user_id=request.user_id,
                user_id=internal_user_id,
                task_id=request.task_id,
                upstream_decision_id=request.upstream_decision_id,
                source_correction_id=request.source_correction_id,
                source_scope_hash=request.source_scope_hash,
                source_scope_generation=request.source_scope_generation,
                correction_hash=request.correction_hash,
                idempotency_key=idempotency_key,
                raw_request_payload=request.model_dump(mode="json"),
                status="queued",
                attempt_count=0,
                proposal_attempt_count=0,
                proposal_next_attempt_at=None,
                proposal_dead_lettered_at=None,
                interpretation_lease_token=None,
                interpretation_lease_expires_at=None,
            )
            try:
                self.correction_store.add(row)
            except IntegrityError:
                self.correction_store.rollback()
                winner = self._existing_before_model(request, idempotency_key)
                if winner is not None and winner.compilation_payload is not None:
                    return ScopeCorrectionReservation(
                        record=self._record_from_row(winner, reused=True),
                        internal_user_id=winner.user_id,
                        lease_token=None,
                        should_process=False,
                    )
                active = self.correction_store.find_active_for_source(
                    PARTNER_ID,
                    request.org_id,
                    request.user_id,
                    request.task_id,
                    request.upstream_decision_id,
                    request.source_scope_hash,
                )
                if active is not None and self._same_submission(active, request):
                    return ScopeCorrectionReservation(
                        record=self._record_from_row(active, reused=True),
                        internal_user_id=active.user_id,
                        lease_token=None,
                        should_process=False,
                    )
                raise ScopeCorrectionConflict(
                    "source scope already has another canonical successor"
                )

        return ScopeCorrectionReservation(
            record=self._record_from_row(row),
            internal_user_id=row.user_id,
            lease_token=None,
            should_process=False,
        )

    def claim(
        self,
        correction_id: str | None = None,
        *,
        exclude_tenant_key: tuple[str, str] | None = None,
    ) -> ScopeCorrectionReservation | None:
        """Atomically claim one queued or expired correction for a worker."""

        lease_token, lease_expires_at = self._new_interpretation_lease()
        now = datetime.now(timezone.utc)
        row = (
            self.correction_store.claim_specific(
                correction_id,
                lease_token,
                lease_expires_at,
                now,
            )
            if correction_id is not None
            else self.correction_store.claim_next(
                lease_token,
                lease_expires_at,
                now,
                exclude_tenant_key,
            )
        )
        if row is None:
            return None
        return ScopeCorrectionReservation(
            record=self._record_from_row(row),
            internal_user_id=row.user_id,
            lease_token=lease_token,
            should_process=True,
        )

    def claim_proposal(
        self,
        correction_id: str | None = None,
        *,
        exclude_tenant_key: tuple[str, str] | None = None,
    ) -> ScopeCorrectionReservation | None:
        """Claim one compiled proposal awaiting idempotent decision persistence."""

        lease_token, lease_expires_at = self._new_interpretation_lease()
        now = datetime.now(timezone.utc)
        row = (
            self.correction_store.claim_specific_proposal(
                correction_id,
                lease_token,
                lease_expires_at,
                now,
                SCOPE_PROPOSAL_MAX_ATTEMPTS,
            )
            if correction_id is not None
            else self.correction_store.claim_next_proposal(
                lease_token,
                lease_expires_at,
                now,
                SCOPE_PROPOSAL_MAX_ATTEMPTS,
                exclude_tenant_key,
            )
        )
        if row is None:
            return None
        return ScopeCorrectionReservation(
            record=self._record_from_row(row),
            internal_user_id=row.user_id,
            lease_token=lease_token,
            should_process=True,
        )

    def process_pending_proposal(
        self,
        reservation: ScopeCorrectionReservation,
    ) -> ScopeCorrectionRecordV1:
        """Persist only the CAS-winning proposal, then expose it as compiled."""

        lease_token = reservation.lease_token
        record = reservation.record
        if (
            not reservation.should_process
            or lease_token is None
            or record.status != "proposal_persisting"
            or record.compilation is None
            or record.compilation.status != "compiled"
            or record.compilation.proposal is None
            or record.compilation.scope_packet is None
        ):
            raise ScopeCorrectionConflict("scope proposal reservation is invalid")
        row = self.correction_store.get_for_tenant(
            record.correction_id,
            record.request.org_id,
            record.request.user_id,
            reservation.internal_user_id,
        )
        expires_at = getattr(row, "interpretation_lease_expires_at", None)
        if (
            row is None
            or row.status != "proposal_persisting"
            or row.interpretation_lease_token != lease_token
            or expires_at is None
            or _as_utc(expires_at) <= datetime.now(timezone.utc)
        ):
            raise ScopeCorrectionInProgress("scope proposal lease is no longer owned")
        _, _, proposal_source = self._validated_parent(
            record.request,
            reservation.internal_user_id,
        )
        # Release the ownership read before the heartbeat uses its independent
        # connection during a potentially long idempotent proposal call.
        self.correction_store.rollback()
        try:
            if self.proposal_persister is None:
                raise ScopeContractError("scope proposal persister is unavailable")
            with self._lease_heartbeat(
                correction_id=record.correction_id,
                lease_token=lease_token,
                expected_status="proposal_persisting",
            ):
                self.proposal_persister(
                    record.request,
                    record.compilation,
                    proposal_source,
                    reservation.internal_user_id,
                )
        except BaseException as exc:
            failed_at = datetime.now(timezone.utc)
            attempts = max(1, record.proposal_attempt_count)
            exhausted = attempts >= SCOPE_PROPOSAL_MAX_ATTEMPTS
            retry_seconds = min(
                SCOPE_PROPOSAL_RETRY_MAX_SECONDS,
                SCOPE_PROPOSAL_RETRY_BASE_SECONDS * (2 ** (attempts - 1)),
            )
            self.correction_store.mark_proposal_failed(
                record.correction_id,
                lease_token,
                type(exc).__name__,
                None if exhausted else failed_at + timedelta(seconds=retry_seconds),
                failed_at if exhausted else None,
            )
            raise
        if not self.correction_store.finalize_proposal(
            record.correction_id,
            lease_token,
        ):
            raise ScopeCorrectionConflict("scope proposal finalization lost its lease")
        current = self.correction_store.get_for_tenant(
            record.correction_id,
            record.request.org_id,
            record.request.user_id,
            reservation.internal_user_id,
        )
        if current is None or current.status != "compiled":
            raise ScopeCorrectionConflict("scope proposal did not become visible")
        return self._record_from_row(current)

    async def process_reserved(
        self,
        reservation: ScopeCorrectionReservation,
        *,
        internal_user_id: str,
    ) -> ScopeCorrectionRecordV1:
        """Interpret one owned lease and atomically persist its first result."""

        if not reservation.should_process or reservation.lease_token is None:
            return reservation.record
        request = reservation.record.request
        correction_id = reservation.record.correction_id
        lease_token = reservation.lease_token
        row = self.correction_store.get_for_tenant(
            correction_id,
            request.org_id,
            request.user_id,
            internal_user_id,
        )
        now = datetime.now(timezone.utc)
        lease_expires_at = getattr(row, "interpretation_lease_expires_at", None)
        if (
            row is None
            or row.status != "interpreting"
            or row.interpretation_lease_token != lease_token
            or lease_expires_at is None
            or _as_utc(lease_expires_at) <= now
        ):
            current = (
                self._record_from_row(row, reused=True) if row is not None else None
            )
            if current is not None and current.compilation is not None:
                return current
            raise ScopeCorrectionInProgress(
                "scope correction interpretation lease is no longer owned"
            )

        # Recheck exact ownership and chain head immediately before model spend.
        _, _, proposal_source = self._validated_parent(request, internal_user_id)
        self._validate_latest_source(request)
        clarification_inheritance = self._clarification_inheritance(
            request,
            internal_user_id,
        )
        # Claiming was already committed. Release the read transaction and its
        # connection before waiting on the remote model; the lease token is the
        # only authority required by the later CAS.
        self.correction_store.rollback()

        interpreter = self.interpreter
        if interpreter is None and self.interpreter_factory is not None:
            interpreter = self.interpreter_factory()
        if interpreter is None:
            raise ScopeContractError(
                "scope correction semantic interpreter is unavailable"
            )
        started_at = time.monotonic()
        try:
            with self._lease_heartbeat(
                correction_id=correction_id,
                lease_token=lease_token,
                expected_status="interpreting",
            ):
                delta = await interpreter.interpret(request)
                interpretation = wrap_scope_interpretation(request, delta)
                compilation = compile_scope_correction(
                    request,
                    interpretation,
                    correction_id=correction_id,
                    proposal_source=proposal_source,
                    clarification_inheritance=clarification_inheritance,
                )
        except BaseException as exc:
            usage = _correction_usage(
                interpreter,
                started_at=started_at,
                terminal_status="failed",
            )
            self.correction_store.mark_failed(
                correction_id,
                lease_token,
                type(exc).__name__,
                usage.model_dump(mode="json"),
            )
            raise

        usage = _correction_usage(
            interpreter,
            started_at=started_at,
            terminal_status=compilation.status,
        )
        persisted_status = (
            "proposal_pending"
            if compilation.status == "compiled"
            and self.proposal_persister is not None
            else compilation.status
        )
        stored = self.correction_store.store_compilation_if_absent(
            correction_id,
            lease_token,
            compilation.model_dump(mode="json"),
            persisted_status,
            datetime.now(timezone.utc),
            usage.model_dump(mode="json"),
        )
        current = self.correction_store.get_for_tenant(
            correction_id,
            request.org_id,
            request.user_id,
            internal_user_id,
        )
        if current is None or current.compilation_payload is None:
            raise ScopeCorrectionConflict(
                "scope correction compilation was not persisted"
            )
        if stored and persisted_status == "proposal_pending":
            proposal_reservation = self.claim_proposal(correction_id)
            if proposal_reservation is None:
                raise ScopeCorrectionConflict("compiled scope proposal was not claimable")
            return self.process_pending_proposal(proposal_reservation)
        # A lost compare-and-set always returns the first successful parse.
        return self._record_from_row(current, reused=not stored)

    async def submit(
        self,
        request: ScopeCorrectionRequestV1,
        *,
        internal_user_id: str,
        idempotency_key: str,
    ) -> ScopeCorrectionRecordV1:
        """Synchronous convenience used by internal callers and focused tests."""

        reservation = self.reserve(
            request,
            internal_user_id=internal_user_id,
            idempotency_key=idempotency_key,
        )
        if reservation.record.compilation is not None:
            return reservation.record
        claimed = self.claim(reservation.record.correction_id)
        if claimed is None:
            raise ScopeCorrectionInProgress(
                "scope correction interpretation is already in progress"
            )
        return await self.process_reserved(
            claimed,
            internal_user_id=internal_user_id,
        )

    def get(
        self,
        correction_id: str,
        *,
        org_id: str,
        external_user_id: str,
        internal_user_id: str,
    ) -> ScopeCorrectionRecordV1:
        row = self.correction_store.get_for_tenant(
            correction_id,
            org_id,
            external_user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeCorrectionParentError("scope correction was not found")
        return self._record_from_row(row, reused=True)

    def answer_material_clarification(
        self,
        answer: ScopeClarificationAnswerRequestV1,
        *,
        internal_user_id: str,
        idempotency_key: str,
    ) -> ScopeCorrectionReservation:
        """Create the sole structured child of one exact stored question."""

        parent_row = self.correction_store.get_for_tenant(
            answer.parent_correction_id,
            answer.org_id,
            answer.user_id,
            internal_user_id,
        )
        if parent_row is None:
            raise ScopeCorrectionParentError("scope clarification was not found")
        parent = self._record_from_row(parent_row)
        if parent.request.task_id != answer.task_id:
            raise ScopeCorrectionParentError("clarification belongs to another task")

        locked = self.parent_store.lock_for_tenant(
            parent.request.upstream_decision_id,
            answer.org_id,
            answer.user_id,
            internal_user_id,
        )
        if locked is None:
            raise ScopeCorrectionParentError(
                "upstream orchestration decision was not found"
            )
        parent_row = self.correction_store.get_for_tenant(
            answer.parent_correction_id,
            answer.org_id,
            answer.user_id,
            internal_user_id,
        )
        if parent_row is None:
            raise ScopeCorrectionParentError("scope clarification was not found")
        parent = self._record_from_row(parent_row)
        existing = self.correction_store.find_by_clarification_parent(
            answer.parent_correction_id,
            answer.org_id,
            answer.user_id,
            internal_user_id,
        )
        if existing is not None:
            child = self._record_from_row(existing, reused=True)
            context = child.request.clarification_context
            if (
                context is None
                or context.clarification_id != answer.clarification_id
                or context.clarification_hash != answer.clarification_hash
                or context.answer_text != answer.answer_text
                or context.answer_hash != answer.answer_hash
            ):
                raise ScopeCorrectionConflict(
                    "scope clarification already has a different canonical answer"
                )
            return ScopeCorrectionReservation(
                record=child,
                internal_user_id=internal_user_id,
                lease_token=None,
                should_process=False,
            )
        by_idempotency = self.correction_store.find_by_idempotency(
            PARTNER_ID,
            answer.org_id,
            answer.user_id,
            idempotency_key,
        )
        if by_idempotency is not None:
            raise ScopeCorrectionConflict(
                "clarification idempotency key was reused for another submission"
            )
        compilation = parent.compilation
        clarification = compilation.clarification if compilation is not None else None
        if (
            parent.status != "needs_material_clarification"
            or compilation is None
            or compilation.status != "needs_material_clarification"
            or clarification is None
        ):
            raise ScopeCorrectionConflict(
                "only the current unresolved material clarification can be answered"
            )
        if (
            clarification.clarification_id != answer.clarification_id
            or clarification.clarification_hash != answer.clarification_hash
        ):
            raise ScopeCorrectionConflict(
                "clarification identity does not match the stored question"
            )
        self._validated_parent(parent.request, internal_user_id)
        self._validate_latest_source(parent.request)
        context = ScopeClarificationResolutionContextV1(
            parent_correction_id=parent.correction_id,
            clarification_id=clarification.clarification_id,
            clarification_hash=clarification.clarification_hash,
            reason_code=clarification.reason_code,
            question=clarification.question,
            fields=clarification.fields,
            source_scope_hash=parent.request.source_scope_hash,
            source_scope_generation=parent.request.source_scope_generation,
            original_correction_hash=parent.request.correction_hash,
            answer_text=answer.answer_text,
            answer_hash=answer.answer_hash,
        )
        child_request = parent.request.model_copy(
            update={
                "correction_text": answer.answer_text,
                "correction_hash": answer.answer_hash,
                "clarification_context": context,
            }
        )
        child_request = ScopeCorrectionRequestV1.model_validate(
            child_request.model_dump(mode="json")
        )
        child_identity = canonical_hash(
            {
                "version": "axwise_scope_clarification_child_v1",
                "org_id": answer.org_id,
                "user_id": answer.user_id,
                "task_id": answer.task_id,
                "parent_correction_id": answer.parent_correction_id,
                "clarification_hash": answer.clarification_hash,
                "answer_hash": answer.answer_hash,
            }
        )
        child_row = OrchestrationScopeCorrection(
            correction_id="scope-correction-" + child_identity[:32],
            partner_id=PARTNER_ID,
            external_org_id=answer.org_id,
            external_user_id=answer.user_id,
            user_id=internal_user_id,
            task_id=answer.task_id,
            upstream_decision_id=child_request.upstream_decision_id,
            source_correction_id=child_request.source_correction_id,
            parent_correction_id=parent.correction_id,
            clarification_answer_hash=answer.answer_hash,
            source_scope_hash=child_request.source_scope_hash,
            source_scope_generation=child_request.source_scope_generation,
            correction_hash=child_request.correction_hash,
            idempotency_key=idempotency_key,
            raw_request_payload=child_request.model_dump(mode="json"),
            status="queued",
            attempt_count=0,
            proposal_attempt_count=0,
            proposal_next_attempt_at=None,
            proposal_dead_lettered_at=None,
            interpretation_lease_token=None,
            interpretation_lease_expires_at=None,
        )
        try:
            stored = self.correction_store.answer_clarification(
                parent.correction_id,
                child_row,
            )
        except IntegrityError:
            self.correction_store.rollback()
            stored = False
        current = self.correction_store.find_by_clarification_parent(
            parent.correction_id,
            answer.org_id,
            answer.user_id,
            internal_user_id,
        )
        if current is None:
            raise ScopeCorrectionConflict(
                "clarification answer lost the current-head compare-and-set"
            )
        child = self._record_from_row(current, reused=not stored)
        child_context = child.request.clarification_context
        if (
            child_context is None
            or child_context.clarification_id != answer.clarification_id
            or child_context.clarification_hash != answer.clarification_hash
            or child_context.answer_text != answer.answer_text
            or child_context.answer_hash != answer.answer_hash
        ):
            raise ScopeCorrectionConflict(
                "clarification was concurrently answered differently"
            )
        return ScopeCorrectionReservation(
            record=child,
            internal_user_id=internal_user_id,
            lease_token=None,
            should_process=False,
        )

    def accept(
        self,
        acceptance: ScopeCorrectionAcceptanceV1,
        *,
        internal_user_id: str,
    ) -> ScopeCorrectionRecordV1:
        row = self.correction_store.get_for_tenant(
            acceptance.correction_id,
            acceptance.org_id,
            acceptance.user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeCorrectionParentError("scope correction was not found")
        record = self._record_from_row(row)
        _, _, proposal_source = self._validated_parent(
            record.request,
            internal_user_id,
        )
        clarification_inheritance = self._clarification_inheritance(
            record.request,
            internal_user_id,
        )
        if record.compilation is None or record.compilation.scope_packet is None:
            raise ScopeCorrectionConflict(
                "only a successfully compiled correction can be accepted"
            )
        packet = record.compilation.scope_packet
        proposal = record.compilation.proposal
        expected = {
            "correction_id": record.correction_id,
            "org_id": record.request.org_id,
            "user_id": record.request.user_id,
            "task_id": record.request.task_id,
            "upstream_decision_id": record.request.upstream_decision_id,
            "source_scope_hash": record.request.source_scope_hash,
            "result_scope_hash": packet.scope_hash,
            "delta_hash": record.compilation.interpretation.delta_hash,
            "proposal_id": proposal.proposal_id,
            "proposal_hash": proposal.proposal_hash,
            "research_execution_inputs_hash": (
                proposal.research_execution_inputs_hash
            ),
        }
        supplied = acceptance.model_dump(
            mode="json", exclude={"version", "acceptance_hash"}
        )
        if supplied != expected:
            raise ScopeCorrectionConflict(
                "scope correction acceptance does not match the stored compilation"
            )
        # A durable accepted result is replayed exactly as stored.  It must not
        # become unreadable merely because a later deployment has a newer
        # deterministic compiler.  New, not-yet-accepted rows still reproduce
        # against the version/hash sealed in their compilation below.
        if record.status == "accepted":
            if record.acceptance != acceptance:
                raise ScopeCorrectionConflict(
                    "scope correction already has a different acceptance"
                )
            return record.model_copy(update={"reused": True})
        # Recompile from the persisted delta. No acceptance path reads prose
        # through a model or trusts a caller-supplied packet.
        reproduced = compile_scope_correction(
            record.request,
            record.compilation.interpretation,
            correction_id=record.correction_id,
            proposal_source=proposal_source,
            clarification_inheritance=clarification_inheritance,
        )
        if reproduced != record.compilation:
            raise ScopeCorrectionConflict(
                "stored semantic delta did not reproduce the compiled scope packet"
            )
        stored = self.correction_store.store_acceptance_if_absent(
            record.correction_id,
            acceptance.model_dump(mode="json"),
        )
        current = self.correction_store.get_for_tenant(
            record.correction_id,
            acceptance.org_id,
            acceptance.user_id,
            internal_user_id,
        )
        if current is None or current.acceptance_payload is None:
            raise ScopeCorrectionConflict(
                "scope correction acceptance was not persisted"
            )
        accepted = self._record_from_row(current, reused=not stored)
        if accepted.acceptance != acceptance:
            raise ScopeCorrectionConflict(
                "scope correction was concurrently accepted with different input"
            )
        return accepted

    def continuation(
        self,
        correction_id: str,
        *,
        org_id: str,
        external_user_id: str,
        internal_user_id: str,
        purpose: str,
    ) -> ScopeContinuationBindingV1:
        row = self.correction_store.get_for_tenant(
            correction_id,
            org_id,
            external_user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeCorrectionParentError("scope correction was not found")
        record = self._record_from_row(row)
        self._validated_parent(record.request, internal_user_id)
        if (
            record.status != "accepted"
            or record.compilation is None
            or record.compilation.scope_packet is None
            or record.acceptance is None
        ):
            raise ScopeCorrectionConflict(
                "scope continuation requires a durably accepted correction"
            )
        return build_scope_continuation_binding(
            org_id=org_id,
            user_id=external_user_id,
            task_id=record.request.task_id,
            upstream_decision_id=record.request.upstream_decision_id,
            packet=record.compilation.scope_packet,
            purpose=purpose,
            correction_id=record.correction_id,
        )


def build_scope_correction_acceptance(
    record: ScopeCorrectionRecordV1,
) -> ScopeCorrectionAcceptanceV1:
    if record.compilation is None or record.compilation.scope_packet is None:
        raise ScopeContractError("only compiled corrections can be accepted")
    payload = {
        "version": "axwise_scope_correction_acceptance_v1",
        "correction_id": record.correction_id,
        "org_id": record.request.org_id,
        "user_id": record.request.user_id,
        "task_id": record.request.task_id,
        "upstream_decision_id": record.request.upstream_decision_id,
        "source_scope_hash": record.request.source_scope_hash,
        "result_scope_hash": record.compilation.scope_packet.scope_hash,
        "delta_hash": record.compilation.interpretation.delta_hash,
        "proposal_id": record.compilation.proposal.proposal_id,
        "proposal_hash": record.compilation.proposal.proposal_hash,
        "research_execution_inputs_hash": (
            record.compilation.proposal.research_execution_inputs_hash
        ),
    }
    payload["acceptance_hash"] = ScopeCorrectionAcceptanceV1.canonical_hash_for(payload)
    return ScopeCorrectionAcceptanceV1.model_validate(payload)


__all__ = [
    "MIN_SEMANTIC_CONFIDENCE",
    "PydanticAIScopeSemanticInterpreter",
    "SCOPE_CORRECTION_PARSER_VERSION",
    "SCOPE_CORRECTION_PROMPT_VERSION",
    "ScopeSemanticInterpreter",
    "ScopeCorrectionConflict",
    "ScopeCorrectionInProgress",
    "ScopeCorrectionParentError",
    "ScopeCorrectionService",
    "build_corrected_proposal_request",
    "build_scope_continuation_binding",
    "build_scope_correction_acceptance",
    "compile_scope_correction",
    "validate_continuation_request_authority",
    "validate_scope_continuation",
    "wrap_scope_interpretation",
]
