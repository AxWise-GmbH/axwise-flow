"""Build and validate the compact AxWise scope handoff deterministically."""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any, Iterable, TypeVar

import pycountry
from pydantic import BaseModel, ValidationError

from backend.domain.market_scope import (
    MARKET_GROUPS,
    MarketScopeV2,
    resolve_market_expression,
)
from backend.domain.orchestration.models import (
    BusinessEvidenceProfileV1,
    CriticalClaimPolicyV1,
    DecisionCreateRequestV1,
    ResearchBriefV1,
    ResearchPolicyV1,
)
from backend.domain.orchestration.scope_models import (
    QualityContractV1,
    ScopeAcceptanceSeedV1,
    ScopeAcceptanceV1,
    ScopeAdmissionV1,
    ScopeAssumptionSeedV1,
    ScopeAssumptionV1,
    ScopeAuthoritySnapshotV1,
    ScopeConfirmationV1,
    ScopeContractBindingV1,
    ScopeConstraintSeedV1,
    ScopeConstraintV1,
    ScopeDecisionSeedV1,
    ScopeDecisionV1,
    ScopeDeliverableSeedV1,
    ScopeFactSeedV1,
    ScopeFactV1,
    ScopeIntentV1,
    ScopeLedgerV1,
    ScopePacketV1,
    ScopeProposalBindingV1,
    ScopeProposalDisclosureV1,
    ScopeQualityCheckV1,
    ScopeRequestedActionV1,
    ScopeResearchContractV1,
    ScopeRequirementSeedV1,
    ScopeRequirementV1,
    ScopeStateV1,
    ScopeValidationReportV1,
    TrustedRuntimeMetadataV1,
    TruthPolicyV1,
)
from backend.infrastructure.data.config import MODEL_CAPABILITIES
from backend.services.llm.config.genai_config import GEMINI_FLASH_MAX_OUTPUT_TOKENS
from backend.services.llm.gemini_runtime import (
    RESEARCH_MAX_OUTPUT_TOKENS,
    RESEARCH_MODEL,
    RESEARCH_MODEL_RESOURCE,
    RESEARCH_THINKING_LEVEL,
    normalized_research_model,
)


class ScopeContractError(ValueError):
    """Raised when supplied scope state conflicts with its canonical form."""


COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES = (
    "Marketing ICP Specialist",
    "Finance Pricing Specialist",
    "GDPR Legal Compliance Specialist",
    "Business Development Sales Specialist",
    "Commercial Risk Analyst",
)

_COMMERCIAL_MARKET_LAUNCH_CLAIM_CLASSES = (
    "statutory_current",
    "official_statistic",
    "observed_primary_market",
)

_COMMERCIAL_PHYSICAL_FLOW_PATTERNS = (
    r"\bsupplier[-\s]+to[-\s]+last[-\s]+mile\b",
    r"\b(?:physical\s+products?|physical\s+goods|consumer\s+goods)\b",
    r"\b(?:supplier|procurement|supply\s+chain|inventory|warehous(?:e|ing)|"
    r"wholesale)\b[^.;]{0,100}"
    r"\b(?:delivery|distribution|last[-\s]+mile|shipping|"
    r"fulfil(?:l)?ment|retail)\b",
)

_COMMERCIAL_PHYSICAL_EVIDENCE_ROLE_SLOTS = (
    "customer_market",
    "pricing_finance",
    "legal_compliance",
    "sales_distribution",
    "risk_operations",
)

BUSINESS_EVIDENCE_ROLE_LABELS = {
    "customer_market": "Customer and Market Specialist",
    "pricing_finance": "Finance Pricing Specialist",
    "legal_compliance": "Legal Compliance Specialist",
    "sales_distribution": "Sales and Distribution Specialist",
    "risk_operations": "Risk and Operations Specialist",
    "domain_delivery": "Domain Delivery Specialist",
}

_CORRECTION_SOURCE_REF = "goal.data.context_revision_feedback"
_CORRECTION_PREFIXES = (
    "apply the goal owner's latest scope correction:",
    "goal owner scope correction:",
    "latest goal-owner correction:",
)

_NEGATION_TAIL = re.compile(
    r"\b(?:not|no|without|exclude|excluding|instead\s+of|rather\s+than|"
    r"do\s+not|don't|must\s+not)\b[^.;,:()]{0,80}$",
    re.IGNORECASE,
)

_DOCUMENT_PATTERNS: dict[str, tuple[str, ...]] = {
    "commercial_market_launch": (
        r"\bcommercial[_\s-]+market[_\s-]+launch\b",
        r"\bcommercial\s+launch\b",
        r"\bmarket\s+launch\b",
        r"\bgo[-\s]+to[-\s]+market\b",
        r"\blaunch\b[^.;]{0,50}\b(?:market|commercial|sales|distribution)\b",
        r"\blaunch[-\s]+ready\b[^.;]{0,160}\b(?:operating\s+plan|"
        r"distribut(?:e|ing|ion)|pricing|unit[-\s]+economics|"
        r"supplier[-\s]+to[-\s]+last[-\s]+mile)\b",
    ),
    "software_product": (
        r"\bsoftware[_\s-]+product\b",
        r"\bsoftware\s+(?:requirements?|prd|specification|implementation)\b",
        r"\b(?:build|develop|implement)\b[^.;]{0,35}\b(?:application|app|api|codebase|repository)\b",
    ),
    "product_strategy": (
        r"\bproduct[_\s-]+strategy\b",
        r"\bproduct\s+roadmap\b",
    ),
    "operational_process": (
        r"\boperational[_\s-]+process\b",
        r"\bstandard\s+operating\s+procedure\b",
        r"\b(?:sop|procedure|process)\s+(?:document|design|specification|prd)\b",
    ),
}

_WORK_TYPE_PATTERNS: dict[str, tuple[str, ...]] = {
    "software_development": _DOCUMENT_PATTERNS["software_product"]
    + (
        r"\b(?:code|software|api)\s+(?:change|development|implementation|deployment)\b",
        r"\b(?:deploy|release)\b[^.;]{0,30}\b(?:code|software|application|app|api)\b",
    ),
    "outreach_campaign": (
        r"\b(?:marketing|advertising|outreach|acquisition)\s+campaign\b",
        r"\bcampaign\s+(?:strategy|plan|execution|assets?)\b",
        r"\b(?:make|create|run|plan|launch|keep)\b[^.;]{0,30}\bcampaign\b",
    ),
    "external_service_operation": (
        r"\b(?:send|dispatch|deliver)\b[^.;]{0,20}\b(?:sms|email|notification|webhook)\b",
        r"\b(?:sms|email|webhook)\s+(?:delivery|operation|execution)\b",
    ),
    "procurement_logistics": (
        r"\b(?:procurement|logistics|supply\s+chain|inventory|warehouse|shipping|wholesale|fulfilment|fulfillment)\b",
        r"\b(?:distribute|distribution)\b(?!\s+(?:list|email|group))",
    ),
    "content_asset_creation": (
        r"\b(?:create|write|produce|design|prepare)\b[^.;]{0,30}\b(?:content|copy|article|video|creative\s+asset|campaign\s+asset)\b",
        r"\b(?:copywriting|content\s+creation|creative\s+asset\s+creation)\b",
    ),
    "research_analysis": (
        r"\b(?:research|analysis|analyse|analyze|evaluate|compare)\b",
        r"\b(?:market|customer|competitor|regulatory)\s+(?:evidence|research|analysis)\b",
        r"\b(?:current|official|authoritative|external)\s+(?:sources?|evidence|data)\b",
    ),
    "strategy_planning": (
        r"\b(?:strategy|strategic\s+plan|roadmap|go[-\s]+to[-\s]+market|launch\s+plan|market\s+launch)\b",
    ),
    "physical_operations": (
        r"\b(?:physical|field)\s+operations?\b",
        r"\b(?:manufacturing|installation|facility\s+operation)\b",
    ),
}

_EXTERNAL_EVIDENCE_PATTERNS = (
    r"\b(?:current|latest|up[-\s]+to[-\s]+date|official|authoritative|external)\b[^.;]{0,30}\b(?:sources?|evidence|data|statistics?|regulations?)\b",
    r"\b(?:verify|validate|ground|research)\b[^.;]{0,35}\b(?:sources?|externally|web|market\s+data)\b",
    r"\b(?:web|external|market)\s+research\b",
)

_EXTERNAL_EVIDENCE_NEGATION = re.compile(
    r"\b(?:no|without|exclude|excluding|do\s+not|don't|must\s+not)\b"
    r"[^.;]{0,45}\b(?:external|web|market|current|official)\b"
    r"[^.;]{0,25}\b(?:sources?|evidence|research|data)\b",
    re.IGNORECASE,
)


TSeed = TypeVar("TSeed", bound=BaseModel)


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _action_key(value: Any) -> str:
    return re.sub(r"[_\W]+", " ", _text(value), flags=re.UNICODE).strip().casefold()


def _canonical(value: Any) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json", exclude_none=False)
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _stable_id(prefix: str, payload: Any) -> str:
    digest = hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def _sorted_unique(values: Iterable[str]) -> list[str]:
    unique = {_text(value) for value in values if _text(value)}
    return sorted(unique, key=lambda value: (value.casefold(), value))


def _ordered_unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = _text(value)
        key = item.casefold()
        if item and key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _preview(value: str, maximum: int) -> str:
    value = _text(value)
    if len(value) <= maximum:
        return value
    return value[: maximum - 1].rstrip() + "…"


def _deterministic_seeds(values: Iterable[TSeed], text_field: str) -> list[TSeed]:
    """Deduplicate caller state without letting array order affect the packet."""

    grouped: dict[str, list[TSeed]] = {}
    for value in values:
        key = _text(getattr(value, text_field)).casefold()
        grouped.setdefault(key, []).append(value)
    return [
        sorted(group, key=_canonical)[0]
        for _, group in sorted(grouped.items())
    ]


def _trusted_runtime() -> TrustedRuntimeMetadataV1:
    configured = os.getenv("GEMINI_MODEL", RESEARCH_MODEL_RESOURCE)
    if normalized_research_model(configured) != RESEARCH_MODEL:
        raise ScopeContractError(
            "trusted runtime metadata cannot be produced because GEMINI_MODEL "
            f"is not pinned to {RESEARCH_MODEL_RESOURCE}"
        )
    capability = MODEL_CAPABILITIES.get(RESEARCH_MODEL_RESOURCE)
    if not capability:
        raise ScopeContractError("Gemini runtime capability metadata is missing")
    if (
        capability.context_window != 1_048_576
        or capability.max_output_tokens != GEMINI_FLASH_MAX_OUTPUT_TOKENS
        or RESEARCH_MAX_OUTPUT_TOKENS != GEMINI_FLASH_MAX_OUTPUT_TOKENS
        or str(RESEARCH_THINKING_LEVEL.value).upper() != "HIGH"
    ):
        raise ScopeContractError("Gemini runtime capability metadata is inconsistent")
    return TrustedRuntimeMetadataV1(
        model=RESEARCH_MODEL,
        model_resource=RESEARCH_MODEL_RESOURCE,
        context_window=capability.context_window,
        max_output_tokens=capability.max_output_tokens,
    )


def trusted_runtime_metadata() -> TrustedRuntimeMetadataV1:
    """Return the live pinned runtime contract used at paid-work boundaries."""

    return _trusted_runtime()


def _authority_snapshot(request: DecisionCreateRequestV1) -> ScopeAuthoritySnapshotV1:
    """Seal policy and tool authority independently from semantic scope inference."""

    def enum_text(value: Any) -> str:
        return str(value.value if hasattr(value, "value") else value)

    from backend.services.orqaly_research_bundle_service import canonical_hash

    return ScopeAuthoritySnapshotV1(
        required_tools=tuple(_sorted_unique(request.task.required_tools)),
        denied_tools=tuple(_sorted_unique(request.policy_context.denied_tool_ids)),
        denied_agent_ids=tuple(
            _sorted_unique(request.policy_context.denied_agent_ids)
        ),
        approval_actions=tuple(
            _sorted_unique(request.policy_context.human_approval_required_for)
        ),
        guardrails=tuple(_sorted_unique(request.policy_context.guardrails)),
        allowed_data_classifications=tuple(
            sorted(
                {
                    enum_text(item)
                    for item in request.policy_context.allowed_data_classifications
                }
            )
        ),
        task_data_classification=enum_text(request.task.data_classification),
        task_risk_level=enum_text(request.task.risk_level),
        task_reversibility=enum_text(request.task.reversibility),
        task_domain=request.task.domain,
        task_class=request.task.task_class,
        task_capability_profile=request.task.capability_profile,
        task_preferred_capabilities=tuple(
            _sorted_unique(request.task.preferred_capabilities)
        ),
        task_constraints=tuple(_sorted_unique(request.task.constraints)),
        task_context_reference_hashes=tuple(
            sorted(
                canonical_hash(reference.model_dump(mode="json"))
                for reference in request.task.context_references
            )
        ),
        task_urgency=enum_text(request.task.urgency),
        task_deadline=(
            request.task.deadline.isoformat()
            if request.task.deadline is not None
            else None
        ),
        maximum_risk_without_human=enum_text(
            request.policy_context.maximum_risk_without_human
        ),
        budget_currency=request.budget.currency,
        budget_maximum_cost=request.budget.maximum_cost,
        budget_maximum_latency_ms=request.budget.maximum_latency_ms,
        research_allow_hybrid=request.research_policy.allow_hybrid_research,
        research_fail_closed=request.research_policy.fail_closed,
        research_allowed_source_types=(
            tuple(sorted(set(request.research_policy.allowed_source_types)))
            if request.research_policy.allowed_source_types is not None
            else None
        ),
        research_maximum_cost=request.research_policy.maximum_research_cost,
        research_maximum_latency_ms=(
            request.research_policy.maximum_research_latency_ms
        ),
        research_maximum_iterations=(
            request.research_policy.maximum_research_iterations
        ),
        research_maximum_evidence_items=(
            request.research_policy.maximum_evidence_items
        ),
        research_minimum_evidence_sufficiency=(
            request.research_policy.minimum_evidence_sufficiency
        ),
        research_minimum_value_of_information=(
            request.research_policy.minimum_value_of_information
        ),
        research_minimum_evidence_quality=(
            request.research_policy.minimum_evidence_quality
        ),
    )


def _deliverable_title_prefix(request: DecisionCreateRequestV1) -> str:
    """Preserve an explicit user literal instead of replacing it with the task title."""

    exact_line = re.compile(
        r"\b(?:must\s+)?(?:begin|beginning) exactly(?:\s+with)?\s+"
        r"[\u201c\u2018\"']([^\u201d\u2019\"'\n]+)[\u201d\u2019\"']",
        re.IGNORECASE,
    )
    for candidate in (request.task.desired_outcome, request.task.objective):
        match = exact_line.search(str(candidate or ""))
        if match and _text(match.group(1)):
            return _text(match.group(1))[:255]
    return request.task.objective[:255]


def _correction_texts(state: ScopeStateV1) -> list[str]:
    """Return the latest authoritative delta from a scope revision."""

    values: list[str] = []
    for requirement in state.requirements:
        text = _text(requirement.text)
        lowered = text.casefold()
        if _CORRECTION_SOURCE_REF in requirement.source_refs or any(
            lowered.startswith(prefix) for prefix in _CORRECTION_PREFIXES
        ):
            for prefix in _CORRECTION_PREFIXES:
                if lowered.startswith(prefix):
                    text = text[len(prefix) :].strip()
                    break
            if text:
                values.append(text)
    for constraint in state.constraints:
        text = _text(constraint.text)
        lowered = text.casefold()
        for prefix in _CORRECTION_PREFIXES:
            if lowered.startswith(prefix):
                candidate = text[len(prefix) :].strip()
                if candidate:
                    values.append(candidate)
                break
    # Orqaly sends corrections in owner-message order. Earlier corrections are
    # history, not concurrent requirements; replaying all of them can revive a
    # superseded intent. The latest accepted delta is authoritative.
    return [_text(values[-1])] if values else []


def _raw_scope_texts(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
) -> list[str]:
    """Owner request text without typed packet state or correction rows."""

    correction_ids = {
        id(item)
        for item in state.requirements
        if _CORRECTION_SOURCE_REF in item.source_refs
        or any(
            _text(item.text).casefold().startswith(prefix)
            for prefix in _CORRECTION_PREFIXES
        )
    }
    brief = request.research_brief
    values = [
        request.task.objective,
        request.task.desired_outcome,
        request.task.domain,
        request.task.task_class,
        request.task.capability_profile,
        *request.task.required_capabilities,
        *request.task.requested_actions,
        *request.task.constraints,
        *(
            item.text
            for item in state.requirements
            if item.authority == "user" and id(item) not in correction_ids
        ),
        *(
            item.text
            for item in state.constraints
            if item.authority == "user"
            and not any(
                _text(item.text).casefold().startswith(prefix)
                for prefix in _CORRECTION_PREFIXES
            )
        ),
    ]
    if brief:
        values.extend(
            [
                brief.business_idea,
                brief.problem,
                *brief.research_questions,
            ]
        )
    return _sorted_unique(_text(value) for value in values if _text(value))


def _semantic_scope_texts(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
) -> list[str]:
    # The raw owner request is stable context. The latest correction is an
    # authoritative delta over it, not a standalone replacement prompt.
    return _sorted_unique(
        [*_raw_scope_texts(request, state), *_correction_texts(state)]
    )


def _match_is_negated(text: str, start: int, end: int) -> bool:
    prefix = text[max(0, start - 100) : start]
    # An adversative begins a fresh semantic segment: "not software, but a
    # market launch" must keep the market-launch match positive.
    segments = re.split(
        r"\b(?:but|however|except)\b|[.;,:()\n\u2013\u2014]",
        prefix,
        flags=re.IGNORECASE,
    )
    local_prefix = segments[-1] if segments else prefix
    if _NEGATION_TAIL.search(local_prefix):
        return True
    suffix = text[end : end + 45]
    return bool(
        re.match(
            r"\s+(?:is|are|was|were|must\s+be|should\s+be)?\s*"
            r"(?:not|required\s+not|excluded)\b",
            suffix,
            flags=re.IGNORECASE,
        )
    )


def _has_positive_pattern(texts: Iterable[str], patterns: Iterable[str]) -> bool:
    for raw in texts:
        # Contract metadata is not requested creative work. Removing these
        # phrases prevents "matching content hash" from creating a content job.
        text = re.sub(
            r"\b(?:content|scope|contract|artifact|request)\s+hash\b",
            "metadata-hash",
            str(raw),
            flags=re.IGNORECASE,
        )
        for pattern in patterns:
            for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                if not _match_is_negated(text, match.start(), match.end()):
                    return True
    return False


def _detected_document_intent(texts: list[str]) -> str | None:
    globally_negated_work_types = _negated_work_types(texts)
    for intent in (
        "commercial_market_launch",
        "software_product",
        "product_strategy",
        "operational_process",
    ):
        if (
            intent == "software_product"
            and "software_development" in globally_negated_work_types
        ):
            continue
        if _has_positive_pattern(texts, _DOCUMENT_PATTERNS[intent]):
            return intent
    return None


def _document_intent(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
    texts: list[str],
    *,
    replacement: bool,
) -> str:
    if state.research_contract is not None and not replacement:
        return state.research_contract.document_intent

    detected = _detected_document_intent(texts)
    if detected is not None:
        return detected

    brief = request.research_brief
    if brief and brief.business_evidence_profile is not None:
        return brief.business_evidence_profile.intent
    if brief and brief.research_prd_type is not None and not replacement:
        return brief.research_prd_type

    if state.deliverable is not None and not replacement:
        supplied = state.deliverable.type.casefold()
        for intent in _DOCUMENT_PATTERNS:
            if supplied in {intent, f"{intent}_prd", f"{intent}_deliverable"}:
                return intent

    return "custom"


def _canonical_geographies(values: Iterable[str]) -> list[str]:
    codes: set[str] = set()
    for raw in values:
        value = _text(raw)
        if not value:
            continue
        if re.fullmatch(r"[A-Za-z]{2}", value):
            resolved = resolve_market_expression(value)
        else:
            try:
                resolved = resolve_market_expression(value)
            except ValueError:
                continue
        codes.update(
            country.country_code
            for country in resolved.resolved_scope.countries
        )
    return sorted(codes)


def _mentioned_geographies(texts: list[str], *, market_context: bool) -> list[str]:
    if not market_context:
        return []
    joined = " ".join(texts)
    group_candidates: list[str] = []
    for group in MARKET_GROUPS.values():
        for alias in (group.label, *group.aliases):
            pattern = rf"(?<!\w){re.escape(alias)}(?!\w)"
            for match in re.finditer(pattern, joined, flags=re.IGNORECASE):
                if not _match_is_negated(joined, match.start(), match.end()):
                    group_candidates.append(alias)
                    break
            if alias in group_candidates:
                break
    country_candidates: list[str] = []
    for country in pycountry.countries:
        names = {
            str(country.name),
            str(getattr(country, "official_name", "")),
            str(getattr(country, "common_name", "")),
        }
        for name in sorted((value for value in names if value), key=len, reverse=True):
            pattern = rf"(?<!\w){re.escape(name)}(?!\w)"
            for match in re.finditer(pattern, joined, flags=re.IGNORECASE):
                if not _match_is_negated(joined, match.start(), match.end()):
                    country_candidates.append(name)
                    break
            if name in country_candidates:
                break
    # "Estonia/EU" names one operating country and one regulatory context.
    # Expanding EU into 27 operating markets would materially change scope, so
    # named countries take precedence; groups expand only when no country is named.
    return _canonical_geographies(country_candidates or group_candidates)


def _role_slots(roles: Iterable[str]) -> list[dict[str, Any]]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_role in roles:
        role = _text(raw_role)
        key = role.casefold()
        if role and key not in seen:
            seen.add(key)
            normalized.append(role)
    return [
        {
            # The ordinal prefix preserves the positional relationship between
            # business-evidence role slots and their dynamic role labels while
            # remaining canonical under the contract's slot_id sort.
            "slot_id": (
                f"role-{ordinal:04x}"
                f"{hashlib.sha256(role.encode('utf-8')).hexdigest()[:12]}"
            ),
            "role": role,
            "required": True,
        }
        for ordinal, role in enumerate(normalized)
    ]


def _requested_executor_roles(
    request: DecisionCreateRequestV1,
    texts: list[str],
    document_intent: str,
    work_types: list[str],
    *,
    replacement: bool = False,
) -> list[str]:
    brief = request.research_brief
    profile = brief.business_evidence_profile if brief else None
    if (
        profile is not None
        and profile.intent == document_intent
        and profile.required_role_slots
    ):
        if brief.required_execution_roles:
            if len(brief.required_execution_roles) != len(
                profile.required_role_slots
            ):
                raise ScopeContractError(
                    "business evidence role slots must exactly match required "
                    "execution roles"
                )
            return [_text(role) for role in brief.required_execution_roles]
        return [
            BUSINESS_EVIDENCE_ROLE_LABELS[slot]
            for slot in profile.required_role_slots
        ]
    if document_intent == "commercial_market_launch":
        return list(COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES)
    explicit = (
        list(brief.required_execution_roles)
        if brief and not replacement
        else []
    )
    if explicit:
        return _sorted_unique(explicit)
    mentioned = [
        role
        for role in COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES
        if _has_positive_pattern(texts, (rf"(?<!\w){re.escape(role)}(?!\w)",))
    ]
    if mentioned:
        return _sorted_unique(mentioned)
    bounded_roles = {
        "software_development": "Software Delivery Specialist",
        "outreach_campaign": "Campaign Execution Specialist",
        "external_service_operation": "External Service Operations Specialist",
        "procurement_logistics": "Procurement and Logistics Specialist",
        "content_asset_creation": "Content Production Specialist",
        "research_analysis": "Research Analyst",
        "strategy_planning": "Strategy Planning Specialist",
        "physical_operations": "Physical Operations Specialist",
        "mixed_custom": "Domain Delivery Specialist",
    }
    return _sorted_unique(
        bounded_roles[work_type]
        for work_type in work_types
        if work_type in bounded_roles
    )


def _evidence_payload(
    request: DecisionCreateRequestV1,
    texts: list[str],
    document_intent: str,
    *,
    semantic_external_override: bool | None = None,
) -> dict[str, Any]:
    policy = request.research_policy
    research_plan_declared = (
        policy.allow_hybrid_research
        or policy.required
        or policy.minimum_mode != "instant"
        or policy.grounding_required
        or policy.required_outputs != ResearchPolicyV1().required_outputs
    )
    requested_outputs = (
        set(policy.required_outputs) if research_plan_declared else set()
    )
    # ``research_prd`` names one of the supported schema-backed research
    # documents, not every Markdown deliverable. A custom scope may still use
    # grounded research and later synthesis, but it cannot silently ask the
    # research worker to emit a PRD with no selected schema. Apply this before
    # the acquisition-mode branch so grounded custom work is normalized just
    # as safely as synthetic custom work.
    if document_intent == "custom":
        requested_outputs.discard("research_prd")
    policy_requires_external = (
        policy.grounding_required
        or policy.minimum_mode in {"grounded_fast", "grounded_deep"}
    )
    semantic_external = (
        semantic_external_override
        if semantic_external_override is not None
        else _has_positive_pattern(texts, _EXTERNAL_EVIDENCE_PATTERNS)
    )
    external = (
        document_intent == "commercial_market_launch"
        or policy_requires_external
        or semantic_external
    )
    if external:
        requested_outputs.add("market_sources")
        requested_outputs.add("research_bundle")
        outputs = sorted(requested_outputs)
        mode = "grounded"
    else:
        # An unpinned policy advertises the producer's available outputs, not a
        # coherent acquisition plan. Market claims/sources cannot be synthetic,
        # and custom intent must not silently become an operational PRD.
        requested_outputs.difference_update({"market_sources", "market_claims"})
        if requested_outputs:
            requested_outputs.add("research_bundle")
        outputs = sorted(requested_outputs)
        if not outputs:
            mode = "none"
        else:
            # Merely carrying catalogue rows does not prove they satisfy this
            # scope, and the hybrid adapter does not consume them as a durable
            # research result. Existing mode is therefore accepted only from a
            # pinned contract; unpinned acquisition remains synthetic.
            mode = "synthetic"
    return {
        "mode": mode,
        "grounding_required": external,
        "external_sources_required": external,
        "required_outputs": outputs,
    }


def _infer_work_types(
    texts: list[str],
    *,
    document_intent: str,
    external_sources_required: bool,
    fallback: bool = True,
) -> list[str]:
    negated = _negated_work_types(texts)
    matched = {
        work_type
        for work_type, patterns in _WORK_TYPE_PATTERNS.items()
        if work_type not in negated and _has_positive_pattern(texts, patterns)
    }
    if document_intent == "commercial_market_launch":
        matched.add("strategy_planning")
    if external_sources_required:
        matched.add("research_analysis")
    if matched:
        return sorted(matched)
    return ["mixed_custom"] if fallback else []


def _research_contract(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
) -> ScopeResearchContractV1:
    corrections = _correction_texts(state)
    replacement = bool(corrections)
    if state.research_contract is not None and not replacement:
        contract = state.research_contract
        _validate_input_contract(
            request,
            state,
            contract,
            replacement=False,
            pinned=True,
        )
        return contract

    base_texts = _raw_scope_texts(request, state)
    texts = _semantic_scope_texts(request, state)
    base_document_intent = _document_intent(
        request,
        state,
        base_texts,
        replacement=replacement,
    )
    correction_document_intent = (
        _detected_document_intent(corrections) if corrections else None
    )
    document_intent = correction_document_intent or base_document_intent
    correction_negations = _negated_work_types(corrections)
    if (
        correction_document_intent is None
        and document_intent == "software_product"
        and "software_development" in correction_negations
    ):
        document_intent = "custom"

    semantic_external_override: bool | None = None
    if corrections:
        if _has_positive_pattern(corrections, _EXTERNAL_EVIDENCE_PATTERNS):
            semantic_external_override = True
        elif any(_EXTERNAL_EVIDENCE_NEGATION.search(text) for text in corrections):
            semantic_external_override = False
    evidence = _evidence_payload(
        request,
        texts,
        document_intent,
        semantic_external_override=semantic_external_override,
    )

    base_geographies: list[str] = []
    brief = request.research_brief
    if brief and brief.market_scope:
        base_geographies.extend(
            country.country_code
            for country in brief.market_scope.resolved_scope.countries
        )
    elif brief and brief.location:
        base_geographies.extend(_canonical_geographies([brief.location]))
    if state.admission is not None and not replacement:
        base_geographies.extend(
            _canonical_geographies(state.admission.geographies)
        )
    geographic_work_context = any(
        _has_positive_pattern(base_texts, _WORK_TYPE_PATTERNS[work_type])
        for work_type in (
            "outreach_campaign",
            "external_service_operation",
            "procurement_logistics",
            "physical_operations",
            "research_analysis",
            "strategy_planning",
        )
    )
    base_geographies.extend(
        _mentioned_geographies(
            base_texts,
            market_context=(
                document_intent == "commercial_market_launch"
                or evidence["external_sources_required"]
                or geographic_work_context
            ),
        )
    )
    correction_geographies = _mentioned_geographies(
        corrections,
        market_context=bool(corrections),
    )
    geographies = sorted(
        set(correction_geographies or base_geographies)
    )

    if replacement:
        work_types = [
            work_type
            for work_type in _infer_work_types(
                base_texts,
                document_intent=base_document_intent,
                external_sources_required=evidence[
                    "external_sources_required"
                ],
                fallback=False,
            )
            if work_type not in correction_negations
        ]
        work_types.extend(
            work_type
            for work_type in _infer_work_types(
                corrections,
                document_intent=(correction_document_intent or "custom"),
                external_sources_required=(
                    semantic_external_override is True
                ),
                fallback=False,
            )
            if work_type not in work_types
        )
        if document_intent == "commercial_market_launch":
            work_types.append("strategy_planning")
        if evidence["external_sources_required"]:
            work_types.append("research_analysis")
        work_types = sorted(set(work_types) or {"mixed_custom"})
    elif (
        state.admission is not None
        and state.admission.work_types
    ):
        negated_work_types = _negated_work_types(texts)
        work_types = [
            work_type
            for work_type in state.admission.work_types
            if work_type not in negated_work_types
        ]
        if negated_work_types:
            work_types.extend(
                work_type
                for work_type in _infer_work_types(
                    texts,
                    document_intent=document_intent,
                    external_sources_required=evidence[
                        "external_sources_required"
                    ],
                )
                if work_type != "mixed_custom" and work_type not in work_types
            )
        work_types = sorted(work_types or {"mixed_custom"})
    else:
        work_types = _infer_work_types(
            texts,
            document_intent=document_intent,
            external_sources_required=evidence["external_sources_required"],
        )
    roles = _requested_executor_roles(
        request,
        texts,
        document_intent,
        work_types,
        replacement=replacement,
    )
    payload = {
        "version": "axwise_scope_research_contract_v1",
        "document_intent": document_intent,
        "work_types": work_types,
        "geographies": geographies,
        "evidence": evidence,
        "executor_role_slots": _role_slots(roles),
    }
    payload["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(payload)
    contract = ScopeResearchContractV1.model_validate(payload)
    _validate_input_contract(
        request,
        state,
        contract,
        replacement=replacement,
        pinned=False,
    )
    return contract


def _validate_input_contract(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
    contract: ScopeResearchContractV1,
    *,
    replacement: bool,
    pinned: bool,
) -> None:
    brief = request.research_brief
    if brief and brief.research_prd_type is not None and not replacement:
        if brief.research_prd_type != contract.document_intent:
            raise ScopeContractError(
                "research_brief.research_prd_type contradicts the scope research contract"
            )
    if brief and brief.business_evidence_profile is not None and not replacement:
        if brief.business_evidence_profile.intent != contract.document_intent:
            raise ScopeContractError(
                "business evidence intent contradicts the scope research contract"
            )
    if brief and brief.required_execution_roles and not replacement:
        expected_roles = _sorted_unique(brief.required_execution_roles)
        contract_roles = _sorted_unique(
            slot.role for slot in contract.executor_role_slots
        )
        if expected_roles != contract_roles:
            raise ScopeContractError(
                "required execution roles contradict the scope research contract"
            )
    if state.admission is not None and not replacement:
        current_negations = _negated_work_types(
            _semantic_scope_texts(request, state)
        )
        if (
            (pinned or state.admission.work_types)
            and not (current_negations and not pinned)
            and (
            sorted(state.admission.work_types) != list(contract.work_types)
            )
        ):
            raise ScopeContractError(
                "scope admission work_types contradict the research contract"
            )
        if (pinned or state.admission.geographies) and (
            _canonical_geographies(state.admission.geographies)
            != list(contract.geographies)
        ):
            raise ScopeContractError(
                "scope admission geographies contradict the research contract"
            )
    brief_geographies: list[str] = []
    resolved_brief_market = None
    if brief and brief.market_scope is not None:
        resolved_brief_market = brief.market_scope
        brief_geographies = sorted(
            country.country_code
            for country in brief.market_scope.resolved_scope.countries
        )
    elif brief and brief.location:
        try:
            resolved_brief_market = resolve_market_expression(brief.location)
        except ValueError:
            resolved_brief_market = None
        brief_geographies = _canonical_geographies([brief.location])
    profile = brief.business_evidence_profile if brief else None
    if (
        profile is not None
        and profile.intent == contract.document_intent
        and profile.economic_model != "none"
    ):
        if (
            resolved_brief_market is None
            or not resolved_brief_market.resolved_scope.countries
        ):
            raise ScopeContractError(
                "business evidence requires a resolved research brief market scope"
            )
        if profile.market_scope_hash != resolved_brief_market.resolution_hash:
            raise ScopeContractError(
                "business evidence market_scope_hash contradicts the research brief"
            )
        if brief_geographies != list(contract.geographies):
            raise ScopeContractError(
                "business evidence market scope contradicts contract geographies"
            )
    if pinned and brief_geographies != list(contract.geographies):
        raise ScopeContractError(
            "research brief market scope contradicts the pinned contract geographies"
        )
    if contract.evidence.mode == "grounded" and not (
        request.research_policy.minimum_mode in {"auto", "grounded_fast", "grounded_deep"}
        or request.research_policy.grounding_required
    ):
        raise ScopeContractError(
            "grounded scope is not authorized by the research policy"
        )
    if pinned and sorted(set(request.research_policy.required_outputs)) != list(
        contract.evidence.required_outputs
    ):
        raise ScopeContractError(
            "research policy outputs contradict the scope research contract"
        )


def scope_contract_binding(packet: ScopePacketV1) -> ScopeContractBindingV1:
    return ScopeContractBindingV1.from_packet(packet)


def _effective_research_policy(
    policy: ResearchPolicyV1,
    contract: ScopeResearchContractV1,
) -> ResearchPolicyV1:
    """Project the policy authorized by the accepted acquisition contract."""

    if contract.evidence.mode != "grounded":
        return policy
    return policy.model_copy(
        update={
            "allow_hybrid_research": True,
            "required": True,
            "grounding_required": True,
            "fail_closed": True,
        }
    )


def _effective_critical_claim_policy(
    policy: CriticalClaimPolicyV1,
    contract: ScopeResearchContractV1,
) -> CriticalClaimPolicyV1:
    """Require the full evidence boundary for grounded commercial launches."""

    if not (
        contract.document_intent == "commercial_market_launch"
        and contract.evidence.mode == "grounded"
    ):
        return policy
    required_classes = list(policy.mandatory_claim_classes)
    seen_classes = set(required_classes)
    for claim_class in _COMMERCIAL_MARKET_LAUNCH_CLAIM_CLASSES:
        if claim_class not in seen_classes:
            required_classes.append(claim_class)
            seen_classes.add(claim_class)
    return policy.model_copy(
        update={
            "required": True,
            "fail_closed": True,
            "mandatory_claim_classes": required_classes,
        }
    )


def _effective_business_evidence_profile(
    brief: ResearchBriefV1 | None,
    packet: ScopePacketV1,
    market_scope: MarketScopeV2 | None,
) -> BusinessEvidenceProfileV1 | None:
    """Select the reviewed physical-offer adapter from accepted semantics."""

    if brief is None:
        return None
    if brief.business_evidence_profile is not None:
        return brief.business_evidence_profile
    contract = packet.research_contract
    if (
        contract is None
        or contract.document_intent != "commercial_market_launch"
        or contract.evidence.mode != "grounded"
        or len(contract.geographies) != 1
        or "procurement_logistics" not in contract.work_types
        or market_scope is None
    ):
        return None
    accepted_texts = [
        packet.intent.objective,
        packet.intent.problem,
        packet.intent.desired_outcome,
        *(item.text for item in packet.ledger.requirements),
        *(item.text for item in packet.ledger.constraints),
    ]
    if not _has_positive_pattern(
        accepted_texts,
        _COMMERCIAL_PHYSICAL_FLOW_PATTERNS,
    ):
        return None
    return BusinessEvidenceProfileV1.model_validate(
        {
            "intent": "commercial_market_launch",
            "economic_model": "physical_product",
            "market_scope_hash": market_scope.resolution_hash,
            "fact_requirements": [
                {
                    "kind": "physical_product_offer",
                    "minimum_verified": 2,
                    "applicability": "required",
                }
            ],
            "calculation_requirements": [
                {
                    "kind": "physical_offer_price_difference",
                    "minimum_verified": 1,
                    "applicability": "required",
                }
            ],
            "required_role_slots": list(
                _COMMERCIAL_PHYSICAL_EVIDENCE_ROLE_SLOTS
            ),
        }
    )


def research_execution_inputs_payload(
    request: DecisionCreateRequestV1,
    packet: ScopePacketV1,
) -> dict[str, Any]:
    """Project exactly the research inputs an accepted dispatch may execute."""

    if packet.research_contract is None:
        raise ScopeContractError("research execution inputs require a typed contract")
    contract = packet.research_contract
    admission = packet.admission
    if admission is None:
        raise ScopeContractError("research execution inputs require typed admission")
    brief = request.research_brief
    market_scope = (
        resolve_market_expression(" + ".join(contract.geographies))
        if contract.geographies
        else None
    )
    policy = _effective_research_policy(request.research_policy, contract)
    business_evidence_profile = _effective_business_evidence_profile(
        brief,
        packet,
        market_scope,
    )
    return {
        "version": "axwise_research_execution_inputs_v1",
        "scope_contract_binding": scope_contract_binding(packet).model_dump(
            mode="json"
        ),
        "task": {
            "task_id": request.task.task_id,
            "objective": packet.intent.objective,
            "desired_outcome": packet.intent.desired_outcome,
            # These are the normalized values HybridResearchAdapter actually
            # sends. They derive from the accepted packet, so Orqaly may
            # reconstruct its envelope without changing the execution digest.
            "domain": ", ".join(contract.work_types),
            "required_capabilities": _sorted_unique(
                [
                    *admission.required_capabilities,
                    *(slot.role for slot in contract.executor_role_slots),
                ]
            ),
            "constraints": _sorted_unique(
                item.text for item in packet.ledger.constraints
            ),
            "requested_actions": _sorted_unique(
                item.action for item in admission.requested_actions
            ),
        },
        "budget": {
            "currency": request.budget.currency,
            "maximum_cost": request.budget.maximum_cost,
        },
        "research_policy": {
            "allow_existing_evidence": policy.allow_existing_evidence,
            "allow_hybrid_research": policy.allow_hybrid_research,
            "required": policy.required,
            "minimum_mode": policy.minimum_mode,
            "grounding_required": policy.grounding_required,
            "fail_closed": policy.fail_closed,
            "performance_profile": policy.performance_profile,
            "required_outputs": list(contract.evidence.required_outputs),
            "allowed_source_types": (
                sorted(set(policy.allowed_source_types))
                if policy.allowed_source_types
                else None
            ),
            "minimum_evidence_sufficiency": policy.minimum_evidence_sufficiency,
            "minimum_value_of_information": policy.minimum_value_of_information,
            "minimum_evidence_quality": policy.minimum_evidence_quality,
            "maximum_research_cost": policy.maximum_research_cost,
            "estimated_research_cost": policy.estimated_research_cost,
            "maximum_research_latency_ms": policy.maximum_research_latency_ms,
            "estimated_research_latency_ms": policy.estimated_research_latency_ms,
            "maximum_research_iterations": policy.maximum_research_iterations,
            "maximum_evidence_items": policy.maximum_evidence_items,
        },
        "research_brief": (
            {
                "business_idea": packet.intent.objective,
                "target_stakeholders": list(packet.intent.audiences),
                "problem": packet.intent.problem,
                "research_questions": _ordered_unique(
                    brief.research_questions
                ),
                "required_execution_roles": [
                    slot.role for slot in contract.executor_role_slots
                ],
                "research_prd_type": (
                    None
                    if contract.document_intent == "custom"
                    else contract.document_intent
                ),
                "customer_role_contract": brief.customer_role_contract.model_dump(
                    mode="json"
                ),
                "critical_claim_policy": _effective_critical_claim_policy(
                    brief.critical_claim_policy,
                    contract,
                ).model_dump(mode="json"),
                "business_evidence_profile": (
                    business_evidence_profile.model_dump(mode="json")
                    if business_evidence_profile
                    else None
                ),
                "industry": brief.industry,
                "location": (
                    " + ".join(contract.geographies)
                    if contract.geographies
                    else None
                ),
                "market_scope": (
                    market_scope.model_dump(mode="json")
                    if market_scope is not None
                    else None
                ),
                "depth": brief.depth,
                "sample_size": brief.sample_size,
            }
            if brief is not None
            else None
        ),
        "evidence_catalogue": [
            {
                "reference_id": item.reference_id,
                "provenance": item.provenance.value
                if hasattr(item.provenance, "value")
                else item.provenance,
                "content_hash": item.content_hash,
                "quality": item.quality,
                "verified": item.verified,
                "verification_source": item.verification_source,
            }
            for item in sorted(
                request.evidence_catalogue,
                key=lambda item: item.reference_id,
            )
        ],
        "available_agents": [
            {
                "agent_id": agent.agent_id,
                "org_id": agent.org_id,
                "name": agent.name,
                "capabilities": _sorted_unique(agent.capabilities),
                "tool_ids": _sorted_unique(agent.tool_ids),
                "availability": agent.availability.value,
                "success_rate": agent.success_rate,
                "estimated_cost": agent.estimated_cost,
                "estimated_latency_ms": agent.estimated_latency_ms,
            }
            for agent in sorted(
                request.available_agents,
                key=lambda item: item.agent_id,
            )
        ],
    }


def research_execution_inputs_hash(
    request: DecisionCreateRequestV1,
    packet: ScopePacketV1,
) -> str:
    # Shared serializer is ECMAScript JSON compatible, including integral
    # floats and object-key ordering, so Orqaly can reproduce this byte-for-byte.
    from backend.services.orqaly_research_bundle_service import canonical_hash

    return canonical_hash(research_execution_inputs_payload(request, packet))


def build_scope_proposal_binding(
    request: DecisionCreateRequestV1,
    packet: ScopePacketV1,
    *,
    proposal_decision_id: str,
    parent_decision_id: str | None,
    correction_id: str | None = None,
    correction_hash: str | None = None,
    compiler_hash: str | None = None,
) -> ScopeProposalBindingV1:
    """Seal the compact Gate-1 proposal shown to the owner."""

    contract = packet.research_contract
    authority = packet.authority_snapshot
    if contract is None or authority is None:
        raise ScopeContractError("scope proposal requires complete scope contracts")
    evidence = contract.evidence
    if evidence.mode == "none":
        disclosure = ScopeProposalDisclosureV1(
            acquisition_mode="none",
            research_required=False,
            grounding_required=False,
            external_sources_required=False,
            currency=authority.budget_currency,
            maximum_evidence_items=0,
        )
    else:
        disclosure = ScopeProposalDisclosureV1(
            acquisition_mode=evidence.mode,
            research_required=True,
            grounding_required=evidence.grounding_required,
            external_sources_required=evidence.external_sources_required,
            required_outputs=evidence.required_outputs,
            geographies=contract.geographies,
            executor_roles=tuple(slot.role for slot in contract.executor_role_slots),
            currency=authority.budget_currency,
            maximum_research_cost=authority.research_maximum_cost,
            estimated_research_cost=request.research_policy.estimated_research_cost,
            maximum_research_latency_ms=authority.research_maximum_latency_ms,
            estimated_research_latency_ms=(
                request.research_policy.estimated_research_latency_ms
            ),
            maximum_research_iterations=authority.research_maximum_iterations,
            maximum_evidence_items=authority.research_maximum_evidence_items,
            provider="google",
            model_resource=RESEARCH_MODEL_RESOURCE,
            thinking_level="HIGH",
        )
    from backend.services.orqaly_research_bundle_service import canonical_hash

    proposal_inputs_hash = canonical_hash(
        {
            "version": "axwise_scope_proposal_inputs_v1",
            "task_id": request.task.task_id,
            "scope_packet": packet.model_dump(mode="json"),
        }
    )
    payload = {
        "version": "axwise_scope_proposal_v1",
        "proposal_decision_id": proposal_decision_id,
        "parent_decision_id": parent_decision_id,
        "org_id": request.tenant.org_id,
        "user_id": request.tenant.user_id,
        "task_id": request.task.task_id,
        "scope_generation": packet.generation,
        "scope_hash": packet.scope_hash,
        "contract_hash": contract.contract_hash,
        "proposal_inputs_hash": proposal_inputs_hash,
        "research_execution_inputs_hash": (
            research_execution_inputs_hash(request, packet)
            if evidence.mode != "none"
            else None
        ),
        "correction_id": correction_id,
        "correction_hash": correction_hash,
        "compiler_hash": compiler_hash,
        "disclosure": disclosure.model_dump(mode="json"),
    }
    payload["proposal_hash"] = ScopeProposalBindingV1.canonical_hash_for(payload)
    return ScopeProposalBindingV1.model_validate(payload)


def validate_scope_research_acceptance(
    request: DecisionCreateRequestV1,
    packet: ScopePacketV1,
    *,
    validate_execution_inputs: bool = True,
) -> None:
    acceptance = request.scope_research_acceptance
    if acceptance is None:
        raise ScopeContractError(
            "research dispatch requires explicit owner scope acceptance"
        )
    if packet.research_contract is None:
        raise ScopeContractError("accepted research requires a typed contract")
    if packet.research_contract.evidence.mode == "existing":
        # Reserved on the v1 wire for forward compatibility. AxWise does not
        # yet have a deterministic, zero-cost compiler that seals catalogue
        # evidence into the portable research bundle Orqaly imports.
        raise ScopeContractError(
            "existing evidence execution is unsupported until a portable "
            "bundle compiler is available"
        )
    mismatches: list[str] = []
    if (
        request.scope_state is None
        or request.scope_state.research_contract is None
        or request.scope_state.research_contract != packet.research_contract
    ):
        mismatches.append("pinned_research_contract")
    if acceptance.org_id != request.tenant.org_id:
        mismatches.append("org_id")
    if acceptance.user_id != request.tenant.user_id:
        mismatches.append("user_id")
    if acceptance.goal_id != request.task.task_id:
        mismatches.append("goal_id")
    if acceptance.proposal_decision_id != request.upstream_decision_id:
        mismatches.append("proposal_decision_id")
    if acceptance.scope_hash != packet.scope_hash:
        mismatches.append("scope_hash")
    if acceptance.contract_hash != packet.research_contract.contract_hash:
        mismatches.append("contract_hash")
    if validate_execution_inputs and (
        acceptance.execution_inputs_hash
        != research_execution_inputs_hash(request, packet)
    ):
        mismatches.append("execution_inputs_hash")
    if mismatches:
        raise ScopeContractError(
            "scope research acceptance contradicts: " + ", ".join(mismatches)
        )


def _deliverable(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
    research_contract: ScopeResearchContractV1,
    *,
    replacement: bool,
) -> ScopeDeliverableSeedV1:
    if state.deliverable and not replacement:
        supplied = state.deliverable.model_copy(
            update={
                "required_sections": _sorted_unique(
                    state.deliverable.required_sections
                )
            }
        )
        expected_type = (
            f"{research_contract.document_intent}_prd"
            if "research_prd" in research_contract.evidence.required_outputs
            else None
        )
        if expected_type and supplied.type != expected_type:
            raise ScopeContractError(
                "scope deliverable contradicts the pinned document intent"
            )
        return supplied
    if "research_prd" in research_contract.evidence.required_outputs:
        return ScopeDeliverableSeedV1(
            type=f"{research_contract.document_intent}_prd",
            title_prefix=_deliverable_title_prefix(request),
            presentation="markdown_artifact",
        )
    return ScopeDeliverableSeedV1(
        type=(
            "custom_deliverable"
            if research_contract.document_intent == "custom"
            else f"{research_contract.document_intent}_deliverable"
        ),
        title_prefix=_deliverable_title_prefix(request),
        presentation="markdown_artifact",
    )


_WORK_TYPE_NEGATION_ALIASES: dict[str, tuple[str, ...]] = {
    "software_development": (
        "software",
        "software development",
        "application development",
        "app development",
        "api development",
        "coding",
        "prd",
    ),
    "outreach_campaign": (
        "campaign",
        "marketing campaign",
        "outreach campaign",
        "advertising",
    ),
    "external_service_operation": (
        "external service operation",
        "sms operation",
        "webhook operation",
    ),
    "procurement_logistics": (
        "procurement",
        "logistics",
        "distribution",
        "supply chain",
    ),
    "content_asset_creation": (
        "content creation",
        "creative asset creation",
        "copywriting",
    ),
    "research_analysis": ("research", "analysis"),
    "strategy_planning": ("strategy", "planning"),
    "physical_operations": ("physical operations", "field operations"),
}


def _negated_work_types(texts: Iterable[str]) -> set[str]:
    """Return explicit clause-level exclusions across the current scope text."""

    negated: set[str] = set()
    for raw_text in texts:
        signal = _text(raw_text).casefold()
        for work_type, aliases in _WORK_TYPE_NEGATION_ALIASES.items():
            for alias in aliases:
                escaped = re.escape(alias).replace(r"\ ", r"\s+")
                if any(
                    re.search(pattern, signal)
                    for pattern in (
                        rf"\bnot\s+(?!only\b)(?:an?\s+)?{escaped}\b",
                        rf"\bno\s+{escaped}\b",
                        rf"\bwithout\s+{escaped}\b",
                        rf"\b(?:exclude|excluding)\s+{escaped}\b",
                        rf"\b(?:instead\s+of|rather\s+than)\s+"
                        rf"(?:an?\s+)?{escaped}\b",
                        rf"\b(?:do\s+not|don't|must\s+not)\s+"
                        rf"(?:make|build|create|develop|produce|plan|run|send|"
                        rf"execute|deploy)?\s*"
                        rf"(?:(?:this|it|the\s+(?:scope|project|task))\s+)?"
                        rf"(?:an?\s+)?{escaped}\b",
                    )
                ):
                    negated.add(work_type)
                    break
    return negated


def _explicitly_negated_work_types(request: DecisionCreateRequestV1) -> set[str]:
    """Return work types explicitly rejected in the latest user scope text."""
    return _negated_work_types(
        (request.task.objective, request.task.desired_outcome)
    )


def _default_work_types(
    request: DecisionCreateRequestV1,
    deliverable: ScopeDeliverableSeedV1,
) -> list[str]:
    """Conservatively classify unpinned legacy calls without substring leakage."""

    texts = _sorted_unique(
        [
            request.task.domain,
            request.task.task_class,
            request.task.capability_profile or "",
            request.task.objective,
            request.task.desired_outcome,
            *request.task.required_capabilities,
            *request.task.requested_actions,
        ]
    )
    intent = "custom"
    for candidate, patterns in _DOCUMENT_PATTERNS.items():
        if _has_positive_pattern(texts, patterns):
            intent = candidate
            break
    return _infer_work_types(
        texts,
        document_intent=intent,
        external_sources_required=_has_positive_pattern(
            texts,
            _EXTERNAL_EVIDENCE_PATTERNS,
        ),
    )


def _resolved_work_types(
    request: DecisionCreateRequestV1,
    deliverable: ScopeDeliverableSeedV1,
    supplied: ScopeAdmissionV1,
) -> list[str]:
    inferred = _default_work_types(request, deliverable)
    if not supplied.work_types:
        return inferred

    negated = _explicitly_negated_work_types(request)
    if not negated:
        return list(supplied.work_types)

    # A rebuilt scope can carry the previous admission. Explicit rejection in
    # the current objective/outcome removes that stale type, while newly stated
    # positive intent is inferred deterministically from the same text.
    resolved = [
        work_type
        for work_type in supplied.work_types
        if work_type not in negated
    ]
    resolved.extend(
        work_type
        for work_type in inferred
        if work_type not in resolved
    )
    return resolved or ["mixed_custom"]


def _derived_requested_action(action: str) -> ScopeRequestedActionV1:
    normalized = _text(action)
    signal = normalized.casefold()
    if any(value in signal for value in ("advise", "recommend", "suggest")):
        mode = "advise"
    elif any(
        value in signal
        for value in (
            "analy",
            "assess",
            "compare",
            "draft",
            "design",
            "evaluate",
            "generate",
            "plan",
            "prepare",
            "research",
            "review",
        )
    ):
        mode = "prepare"
    else:
        mode = "execute"

    if any(
        value in signal
        for value in (
            "send",
            "publish",
            "deploy",
            "purchase",
            "buy",
            "order",
            "delete",
            "contact",
            "notify",
            "distribute",
            "ship",
        )
    ):
        side_effect = "irreversible"
    elif any(
        value in signal
        for value in ("create", "update", "write", "save", "schedule", "upload")
    ):
        side_effect = "reversible"
    else:
        side_effect = "none"
    return ScopeRequestedActionV1(
        action=normalized,
        mode=mode,
        side_effect=side_effect,
        requires_authorization=(mode == "execute" or side_effect != "none"),
    )


def _admission(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
    deliverable: ScopeDeliverableSeedV1,
    research_contract: ScopeResearchContractV1,
    *,
    replacement: bool,
) -> ScopeAdmissionV1:
    supplied = (
        state.admission
        if state.admission is not None and not replacement
        else ScopeAdmissionV1()
    )
    actions = (
        {
            _action_key(action.action): action
            for action in (
                _derived_requested_action(value) for value in request.task.requested_actions
            )
        }
        if not replacement
        else {}
    )
    # The explicit AxWise scope state is authoritative over conservative legacy
    # normalization of TaskEnvelopeV1.requested_actions.
    actions.update(
        {_action_key(action.action): action for action in supplied.requested_actions}
    )

    return ScopeAdmissionV1(
        work_types=research_contract.work_types,
        geographies=research_contract.geographies,
        channels=supplied.channels,
        success_criteria=[
            request.task.desired_outcome,
            *(_correction_texts(state) if replacement else []),
            *supplied.success_criteria,
        ],
        required_capabilities=[
            *(request.task.required_capabilities if not replacement else []),
            *supplied.required_capabilities,
        ],
        requested_actions=list(actions.values()),
    )


def _requirements(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
    deliverable: ScopeDeliverableSeedV1,
) -> list[ScopeRequirementV1]:
    corrections = _correction_texts(state)
    derived = [
        ScopeRequirementSeedV1(
            text=request.task.objective,
            priority="P0",
            authority="user",
            source_refs=["task.objective"],
        ),
        ScopeRequirementSeedV1(
            text=request.task.desired_outcome,
            priority="P0",
            authority="user",
            source_refs=["task.desired_outcome"],
        ),
        *[
            ScopeRequirementSeedV1(
                text=f"Perform the requested action: {action}",
                priority="P0",
                authority="user",
                source_refs=[f"task.requested_actions:{action}"],
            )
            for action in request.task.requested_actions
        ],
        *[
            ScopeRequirementSeedV1(
                text=f"Use or provide the required capability: {capability}",
                priority="P0",
                authority="user",
                source_refs=[f"task.required_capabilities:{capability}"],
            )
            for capability in request.task.required_capabilities
        ],
        *[
            ScopeRequirementSeedV1(
                text=f"Include the required section: {section}",
                priority="P0",
                authority="user",
                source_refs=[f"scope.deliverable.required_sections:{section}"],
            )
            for section in deliverable.required_sections
        ],
    ]
    by_text = {
        _text(seed.text).casefold(): seed
        for seed in _deterministic_seeds(derived, "text")
    }
    state_requirements = (
        [
            seed
            for seed in state.requirements
            if _CORRECTION_SOURCE_REF in seed.source_refs
            or any(
                _text(seed.text).casefold().startswith(prefix)
                for prefix in _CORRECTION_PREFIXES
            )
        ]
        if corrections
        else state.requirements
    )
    for seed in _deterministic_seeds(state_requirements, "text"):
        by_text[_text(seed.text).casefold()] = seed

    result = []
    for seed in by_text.values():
        payload = seed.model_dump(mode="json", exclude_none=False)
        payload["text"] = _text(seed.text)
        payload["source_refs"] = _sorted_unique(seed.source_refs)
        result.append(
            ScopeRequirementV1(
                requirement_id=_stable_id("req", {"text": payload["text"].lower()}),
                **payload,
            )
        )
    return sorted(result, key=lambda item: item.requirement_id)


def _facts(state: ScopeStateV1) -> list[ScopeFactV1]:
    result = []
    for seed in _deterministic_seeds(state.facts, "claim"):
        payload = seed.model_dump(mode="json", exclude_none=False)
        payload["claim"] = _text(seed.claim)
        payload["source_refs"] = _sorted_unique(seed.source_refs)
        payload["source_authority_ids"] = _sorted_unique(seed.source_authority_ids)
        result.append(
            ScopeFactV1(
                fact_id=_stable_id(
                    "fact",
                    {
                        "claim": payload["claim"].lower(),
                        "source_refs": payload["source_refs"],
                        "source_authority_ids": payload["source_authority_ids"],
                    },
                ),
                **payload,
            )
        )
    return sorted(result, key=lambda item: item.fact_id)


def _assumptions(state: ScopeStateV1) -> list[ScopeAssumptionV1]:
    result = []
    for seed in _deterministic_seeds(state.assumptions, "text"):
        payload = seed.model_dump(mode="json", exclude_none=False)
        payload["text"] = _text(seed.text)
        payload["source_refs"] = _sorted_unique(seed.source_refs)
        result.append(
            ScopeAssumptionV1(
                assumption_id=_stable_id(
                    "asm",
                    {
                        "text": payload["text"].lower(),
                        "materiality": seed.materiality,
                    },
                ),
                **payload,
            )
        )
    return sorted(result, key=lambda item: item.assumption_id)


def _decisions(state: ScopeStateV1) -> list[ScopeDecisionV1]:
    result = []
    for seed in _deterministic_seeds(state.decisions, "question"):
        payload = seed.model_dump(mode="json", exclude_none=False)
        payload["question"] = _text(seed.question)
        payload["source_refs"] = _sorted_unique(seed.source_refs)
        result.append(
            ScopeDecisionV1(
                decision_id=_stable_id(
                    "dec",
                    {
                        "question": payload["question"].lower(),
                        "materiality": seed.materiality,
                    },
                ),
                **payload,
            )
        )
    return sorted(result, key=lambda item: item.decision_id)


def _constraint_kind(text: str) -> str:
    lowered = text.casefold()
    if any(value in lowered for value in ("privacy", "personal data", "gdpr")):
        return "privacy"
    if any(value in lowered for value in ("security", "secret", "credential")):
        return "security"
    if any(value in lowered for value in ("budget", "cost", "price")):
        return "budget"
    if any(value in lowered for value in ("deadline", "latency", "time")):
        return "time"
    if any(value in lowered for value in ("authorize", "approval", "policy")):
        return "policy"
    return "other"


def _constraints(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
) -> list[ScopeConstraintV1]:
    derived = [
        ScopeConstraintSeedV1(
            text=value,
            kind=_constraint_kind(value),
            authority="user",
            source_refs=[f"task.constraints:{value}"],
        )
        for value in request.task.constraints
    ]
    by_text = {
        _text(seed.text).casefold(): seed
        for seed in _deterministic_seeds(derived, "text")
    }
    for seed in _deterministic_seeds(state.constraints, "text"):
        by_text[_text(seed.text).casefold()] = seed
    result = []
    for seed in by_text.values():
        payload = seed.model_dump(mode="json", exclude_none=False)
        payload["text"] = _text(seed.text)
        payload["source_refs"] = _sorted_unique(seed.source_refs)
        result.append(
            ScopeConstraintV1(
                constraint_id=_stable_id(
                    "con",
                    {
                        "text": payload["text"].lower(),
                        "kind": seed.kind,
                        "authority": seed.authority,
                    },
                ),
                **payload,
            )
        )
    return sorted(result, key=lambda item: item.constraint_id)


def _acceptance(
    state: ScopeStateV1,
    requirements: list[ScopeRequirementV1],
) -> list[ScopeAcceptanceV1]:
    by_id = {item.requirement_id: item.requirement_id for item in requirements}
    by_text = {_text(item.text).casefold(): item.requirement_id for item in requirements}
    result: list[ScopeAcceptanceV1] = []
    covered: set[str] = set()
    acceptance_seeds = [] if _correction_texts(state) else state.acceptance
    for seed in sorted(acceptance_seeds, key=_canonical):
        supports = []
        for reference in seed.supports:
            resolved = by_id.get(reference) or by_text.get(_text(reference).casefold())
            if not resolved:
                raise ScopeContractError(
                    f"acceptance criterion references unknown requirement {reference!r}"
                )
            supports.append(resolved)
        supports = sorted(set(supports))
        payload = seed.model_dump(mode="json", exclude_none=False)
        payload.update(
            {
                "given": _text(seed.given),
                "when": _text(seed.when),
                "then": _sorted_unique(seed.then),
                "supports": supports,
            }
        )
        result.append(
            ScopeAcceptanceV1(
                acceptance_id=_stable_id("acc", payload),
                **payload,
            )
        )
        covered.update(supports)

    for requirement in requirements:
        if requirement.requirement_id in covered:
            continue
        payload = {
            "given": "the approved scope and its authoritative inputs",
            "when": "the deliverable is reviewed against this requirement",
            "then": [f"The deliverable demonstrably satisfies: {requirement.text}"],
            "supports": [requirement.requirement_id],
            "data_class": "manual_review",
        }
        result.append(
            ScopeAcceptanceV1(
                acceptance_id=_stable_id("acc", payload),
                **payload,
            )
        )
    unique = {item.acceptance_id: item for item in result}
    return [unique[item_id] for item_id in sorted(unique)]


def build_scope_packet(request: DecisionCreateRequestV1) -> ScopePacketV1:
    """Derive one canonical, order-independent packet from validated scope state."""

    for field_name, value in (
        ("task objective", request.task.objective),
        ("task desired outcome", request.task.desired_outcome),
    ):
        if len(_text(value)) > 4_000:
            raise ScopeContractError(
                f"{field_name} exceeds the lossless 4000-character scope contract; "
                "shorten it because longer scope remains blocked until Gate 1 "
                "supports explicit exact-span topic anchors"
            )
    state = request.scope_state or ScopeStateV1()
    corrections = _correction_texts(state)
    research_contract = _research_contract(request, state)
    deliverable = _deliverable(
        request,
        state,
        research_contract,
        replacement=bool(corrections),
    )
    requirements = _requirements(request, state, deliverable)
    decisions = _decisions(state)
    problem = (
        request.research_brief.problem
        if request.research_brief
        else request.task.objective
    )
    audiences = _sorted_unique(
        [
            *request.task.stakeholders,
            *state.audiences,
            *(
                [request.research_brief.target_stakeholders]
                if request.research_brief
                else []
            ),
        ]
    )
    payload = {
        "version": "axwise_scope_packet_v1",
        "scope_ref": request.task.task_id,
        "intent": ScopeIntentV1(
            objective=request.task.objective,
            problem=problem,
            desired_outcome=request.task.desired_outcome,
            audiences=audiences,
            non_goals=_sorted_unique(state.non_goals),
        ).model_dump(mode="json"),
        "deliverable": deliverable.model_dump(mode="json"),
        "admission": _admission(
            request,
            state,
            deliverable,
            research_contract,
            replacement=bool(corrections),
        ).model_dump(mode="json"),
        "research_contract": research_contract.model_dump(mode="json"),
        "authority_snapshot": _authority_snapshot(request).model_dump(mode="json"),
        "ledger": ScopeLedgerV1(
            requirements=requirements,
            facts=_facts(state),
            assumptions=_assumptions(state),
            decisions=decisions,
            constraints=_constraints(request, state),
            acceptance=_acceptance(state, requirements),
        ).model_dump(mode="json"),
        "runtime": _trusted_runtime().model_dump(mode="json"),
        "truth_policy": TruthPolicyV1().model_dump(mode="json"),
        "quality_contract": QualityContractV1().model_dump(mode="json"),
        "document_status": (
            "Draft"
            if any(item.status in {"open", "proposed"} for item in decisions)
            else "Ready for review"
        ),
    }
    payload["scope_hash"] = ScopePacketV1.canonical_hash_for(payload)
    return ScopePacketV1.model_validate(payload)


def ensure_scope_packet(request: DecisionCreateRequestV1) -> DecisionCreateRequestV1:
    """Attach the derived packet, rejecting stale or caller-modified variants."""

    try:
        expected = build_scope_packet(request)
    except ScopeContractError:
        raise
    except ValidationError as exc:
        # Request-body validation is handled by FastAPI before this boundary.
        # Any ValidationError here was produced while AxWise constructed its
        # own canonical contract and must become a bounded partner error, not
        # an opaque HTTP 500 containing internal Pydantic diagnostics.
        raise ScopeContractError(
            "derived scope contract is internally inconsistent"
        ) from exc
    if request.scope_packet is not None and request.scope_packet != expected:
        raise ScopeContractError(
            "supplied scope_packet is stale or does not match the canonical scope state"
        )
    return request.model_copy(update={"scope_packet": expected})


def validate_scope_packet(packet: ScopePacketV1) -> ScopeValidationReportV1:
    ledger = packet.ledger
    requirement_ids = {item.requirement_id for item in ledger.requirements}
    covered = {
        requirement_id
        for item in ledger.acceptance
        for requirement_id in item.supports
    }
    unresolved = [
        item for item in ledger.decisions if item.status in {"open", "proposed"}
    ]
    verified_fact_integrity = all(
        item.verification != "verified"
        or bool(
            item.source_refs
            and item.source_authority_ids
            and item.verbatim_excerpt
            and item.content_hash
        )
        for item in ledger.facts
    )
    overlap = {
        item.claim.casefold() for item in ledger.facts
    }.intersection(item.text.casefold() for item in ledger.assumptions)
    authorization_boundary = packet.admission is None or all(
        action.requires_authorization
        for action in packet.admission.requested_actions
        if action.mode == "execute" or action.side_effect != "none"
    )
    contract = packet.research_contract
    contract_present = contract is not None and packet.admission is not None
    contract_coherent = False
    if contract_present and contract is not None and packet.admission is not None:
        expected_prd_type = f"{contract.document_intent}_prd"
        prd_type_coherent = (
            "research_prd" not in contract.evidence.required_outputs
            or packet.deliverable.type == expected_prd_type
        )
        contract_coherent = (
            list(contract.work_types) == packet.admission.work_types
            and list(contract.geographies) == packet.admission.geographies
            and prd_type_coherent
        )
        if contract_coherent:
            try:
                scope_contract_binding(packet)
            except ValueError:
                contract_coherent = False
    checks = [
        ScopeQualityCheckV1(
            check_id="typed_scope_research_contract",
            passed=contract_present,
            message="Scope includes a typed, immutable research contract.",
        ),
        ScopeQualityCheckV1(
            check_id="scope_research_semantic_coherence",
            passed=contract_coherent,
            message=(
                "Document intent, work shape, geography, evidence, roles, and hashes "
                "form one coherent contract."
            ),
        ),
        ScopeQualityCheckV1(
            check_id="canonical_hash",
            passed=(
                packet.scope_hash
                == ScopePacketV1.canonical_hash_for(
                    packet.model_dump(mode="json", exclude={"scope_hash"})
                )
            ),
            message="Scope hash is bound to the canonical packet.",
        ),
        ScopeQualityCheckV1(
            check_id="requirement_coverage",
            passed=covered == requirement_ids,
            message="Every requirement maps to at least one acceptance criterion.",
        ),
        ScopeQualityCheckV1(
            check_id="fact_evidence_integrity",
            passed=verified_fact_integrity,
            message="Verified facts carry exact evidence and authority metadata.",
        ),
        ScopeQualityCheckV1(
            check_id="fact_assumption_separation",
            passed=not overlap,
            message="Owner-confirmed assumptions remain separate from facts.",
        ),
        ScopeQualityCheckV1(
            check_id="trusted_runtime",
            passed=packet.runtime == _trusted_runtime(),
            message="Model and token capabilities come from trusted runtime code.",
        ),
        ScopeQualityCheckV1(
            check_id="action_authorization_boundary",
            passed=authorization_boundary,
            message=(
                "Execution intent and side effects remain subject to Orqaly "
                "authorization."
            ),
        ),
        ScopeQualityCheckV1(
            check_id="decision_resolution",
            passed=not unresolved,
            blocking=True,
            message=(
                "No unresolved decisions remain."
                if not unresolved
                else "Unresolved decisions keep the artifact in Draft."
            ),
        ),
    ]
    structurally_valid = all(
        item.passed
        for item in checks
        if item.check_id != "decision_resolution" and item.blocking
    )
    return ScopeValidationReportV1(
        scope_hash=packet.scope_hash,
        valid=structurally_valid,
        ready_for_synthesis=structurally_valid and not unresolved,
        checks=checks,
        requirement_count=len(requirement_ids),
        acceptance_count=len(ledger.acceptance),
        unresolved_decision_count=len(unresolved),
    )


def build_scope_confirmation(packet: ScopePacketV1) -> ScopeConfirmationV1:
    """Return one compact proposal, asking only for a material blocking choice."""

    blockers = sorted(
        (
            item
            for item in packet.ledger.decisions
            if item.status == "open"
            and item.materiality == "material"
            and not item.proposal
        ),
        key=lambda item: item.decision_id,
    )
    if blockers:
        question = blockers[0].question
        return ScopeConfirmationV1(
            status="needs_material_input",
            message=(
                "Before I proceed, I need one material decision: "
                f"{_preview(question, 900)}"
            ),
            primary_action="answer",
            material_question=question,
            scope_hash=packet.scope_hash,
        )

    assumption_text = [
        item.text for item in packet.ledger.assumptions if not item.owner_confirmed
    ]
    assumption_text.extend(
        f"{item.question}: {item.proposal}"
        for item in packet.ledger.decisions
        if item.status == "proposed" and item.proposal
    )
    if assumption_text:
        visible = "; ".join(_preview(item, 140) for item in assumption_text[:3])
        remainder = len(assumption_text) - 3
        assumption_clause = f" Assumptions: {visible}"
        if remainder > 0:
            assumption_clause += f"; +{remainder} more in scope"
        assumption_clause += "."
    else:
        assumption_clause = ""
    message = (
        f"I’ll {_preview(packet.intent.objective, 280)}. "
        f"Outcome: {_preview(packet.intent.desired_outcome, 260)}.{assumption_clause} "
        "Reply ‘proceed’ or edit the scope."
    )
    return ScopeConfirmationV1(
        status="proceed_or_edit",
        message=message,
        primary_action="proceed",
        scope_hash=packet.scope_hash,
    )


__all__ = [
    "ScopeContractError",
    "build_scope_confirmation",
    "build_scope_packet",
    "ensure_scope_packet",
    "research_execution_inputs_hash",
    "research_execution_inputs_payload",
    "scope_contract_binding",
    "trusted_runtime_metadata",
    "validate_scope_research_acceptance",
    "validate_scope_packet",
]
