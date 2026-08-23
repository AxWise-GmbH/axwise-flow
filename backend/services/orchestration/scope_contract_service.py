"""Build and validate the compact AxWise scope handoff deterministically."""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any, Iterable, TypeVar

from pydantic import BaseModel

from backend.domain.orchestration.models import DecisionCreateRequestV1
from backend.domain.orchestration.scope_models import (
    QualityContractV1,
    ScopeAcceptanceSeedV1,
    ScopeAcceptanceV1,
    ScopeAdmissionV1,
    ScopeAssumptionSeedV1,
    ScopeAssumptionV1,
    ScopeConfirmationV1,
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
    ScopeQualityCheckV1,
    ScopeRequestedActionV1,
    ScopeRequirementSeedV1,
    ScopeRequirementV1,
    ScopeStateV1,
    ScopeValidationReportV1,
    TrustedRuntimeMetadataV1,
    TruthPolicyV1,
)
from backend.infrastructure.data.config import MODEL_CAPABILITIES
from backend.services.llm.config.genai_config import GEMINI_37_MAX_OUTPUT_TOKENS
from backend.services.llm.gemini_runtime import (
    RESEARCH_MAX_OUTPUT_TOKENS,
    RESEARCH_MODEL,
    RESEARCH_MODEL_RESOURCE,
    RESEARCH_THINKING_LEVEL,
    normalized_research_model,
)


class ScopeContractError(ValueError):
    """Raised when supplied scope state conflicts with its canonical form."""


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
        or capability.max_output_tokens != GEMINI_37_MAX_OUTPUT_TOKENS
        or RESEARCH_MAX_OUTPUT_TOKENS != GEMINI_37_MAX_OUTPUT_TOKENS
        or str(RESEARCH_THINKING_LEVEL.value).upper() != "HIGH"
    ):
        raise ScopeContractError("Gemini runtime capability metadata is inconsistent")
    return TrustedRuntimeMetadataV1(
        context_window=capability.context_window,
        max_output_tokens=capability.max_output_tokens,
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


def _deliverable(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
) -> ScopeDeliverableSeedV1:
    if state.deliverable:
        return state.deliverable.model_copy(
            update={
                "required_sections": _sorted_unique(
                    state.deliverable.required_sections
                )
            }
        )
    brief = request.research_brief
    if brief and "research_prd" in request.research_policy.required_outputs:
        return ScopeDeliverableSeedV1(
            type=f"{brief.research_prd_type}_prd",
            title_prefix=_deliverable_title_prefix(request),
            presentation="markdown_artifact",
        )
    return ScopeDeliverableSeedV1(
        type="orchestration_recommendation",
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


def _explicitly_negated_work_types(request: DecisionCreateRequestV1) -> set[str]:
    """Return work types explicitly rejected in the latest user scope text."""

    signal = " ".join(
        _text(value).casefold()
        for value in (request.task.objective, request.task.desired_outcome)
        if _text(value)
    )
    negated: set[str] = set()
    for work_type, aliases in _WORK_TYPE_NEGATION_ALIASES.items():
        for alias in aliases:
            escaped = re.escape(alias).replace(r"\ ", r"\s+")
            if any(
                re.search(pattern, signal)
                for pattern in (
                    rf"\bnot\s+(?:an?\s+)?{escaped}\b",
                    rf"\bno\s+{escaped}\b",
                    rf"\b(?:instead\s+of|rather\s+than)\s+"
                    rf"(?:an?\s+)?{escaped}\b",
                    rf"\b(?:do\s+not|don't)\s+"
                    rf"(?:make|build|create|develop|produce|plan|run|send|execute)\s+"
                    rf"(?:(?:this|it|the\s+(?:scope|project|task))\s+)?"
                    rf"(?:an?\s+)?{escaped}\b",
                )
            ):
                negated.add(work_type)
                break
    return negated


def _default_work_types(
    request: DecisionCreateRequestV1,
    deliverable: ScopeDeliverableSeedV1,
) -> list[str]:
    """Conservatively describe work shape without selecting an Orqaly playbook."""

    signal = " ".join(
        _text(value).casefold()
        for value in (
            request.task.domain,
            request.task.task_class,
            request.task.capability_profile,
            request.task.objective,
            request.task.desired_outcome,
            deliverable.type,
            *request.task.required_capabilities,
            *request.task.requested_actions,
        )
        if _text(value)
    )
    classifiers = (
        (
            "software_development",
            (
                "software",
                "application",
                "api",
                "code",
                "deploy",
                "software_product_prd",
                "software prd",
            ),
        ),
        (
            "outreach_campaign",
            ("marketing", "campaign", "advertis", "audience acquisition"),
        ),
        (
            "external_service_operation",
            ("send_sms", "send sms", "text message", "email campaign", "webhook"),
        ),
        (
            "procurement_logistics",
            (
                "procurement",
                "logistics",
                "distribution",
                "distribute",
                "supply chain",
                "inventory",
                "warehouse",
                "fulfilment",
                "fulfillment",
                "shipping",
                "wholesale",
            ),
        ),
        (
            "content_asset_creation",
            ("content", "copywriting", "creative asset", "article", "video", "design"),
        ),
        (
            "research_analysis",
            ("research", "analysis", "analyze", "analyse", "compare", "evaluate"),
        ),
        (
            "strategy_planning",
            ("strategy", "planning", "roadmap", "go-to-market", "launch plan"),
        ),
        (
            "physical_operations",
            ("physical operation", "field operation", "manufactur", "installation"),
        ),
    )
    negated = _explicitly_negated_work_types(request)
    matched = [
        work_type
        for work_type, hints in classifiers
        if work_type not in negated and any(hint in signal for hint in hints)
    ]
    return matched or ["mixed_custom"]


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
) -> ScopeAdmissionV1:
    supplied = state.admission or ScopeAdmissionV1()
    actions = {
        _action_key(action.action): action
        for action in (
            _derived_requested_action(value) for value in request.task.requested_actions
        )
    }
    # The explicit AxWise scope state is authoritative over conservative legacy
    # normalization of TaskEnvelopeV1.requested_actions.
    actions.update(
        {_action_key(action.action): action for action in supplied.requested_actions}
    )

    geographies = list(supplied.geographies)
    brief = request.research_brief
    if brief and brief.market_scope and brief.market_scope.resolved_scope.countries:
        geographies.extend(
            country.country_code
            for country in brief.market_scope.resolved_scope.countries
        )
    elif brief and brief.location:
        geographies.append(brief.location)

    return ScopeAdmissionV1(
        work_types=_resolved_work_types(request, deliverable, supplied),
        geographies=geographies,
        channels=supplied.channels,
        success_criteria=[
            request.task.desired_outcome,
            *supplied.success_criteria,
        ],
        required_capabilities=[
            *request.task.required_capabilities,
            *supplied.required_capabilities,
        ],
        requested_actions=list(actions.values()),
    )


def _requirements(
    request: DecisionCreateRequestV1,
    state: ScopeStateV1,
    deliverable: ScopeDeliverableSeedV1,
) -> list[ScopeRequirementV1]:
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
    for seed in _deterministic_seeds(state.requirements, "text"):
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
    for seed in sorted(state.acceptance, key=_canonical):
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

    state = request.scope_state or ScopeStateV1()
    deliverable = _deliverable(request, state)
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
        "admission": _admission(request, state, deliverable).model_dump(mode="json"),
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

    expected = build_scope_packet(request)
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
    checks = [
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
    "validate_scope_packet",
]
