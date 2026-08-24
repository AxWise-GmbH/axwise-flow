"""Resolve an evidence-backed customer persona and an Orqaly execution persona."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional

from pydantic import BaseModel, Field, field_validator

from backend.domain.orchestration.models import BusinessEvidenceProfileV1
from backend.domain.orchestration.scope_models import (
    ScopeContractBindingV1,
    ScopeResearchAcceptanceBindingV1,
    TrustedRuntimeMetadataV1,
)
from backend.services.research_quality_service import (
    COMMERCIAL_MARKET_LAUNCH,
    normalize_research_prd_type,
    prune_nulls,
)


STOP_WORDS = {
    "and", "are", "for", "from", "into", "that", "the", "their", "this",
    "to", "with", "will", "your", "task", "user", "agent", "project",
    "assume", "better", "customer", "customers", "instead", "inventing",
    "general", "general_operations",
}

MINIMUM_AGENT_FIT_SCORE = 0.35

_NON_CUSTOMER_STAKEHOLDER_TYPES = {
    "executor",
    "execution team",
    "ideal executor",
    "role specific execution team",
}


class OrqalyTaskContext(BaseModel):
    task_id: Optional[str] = None
    title: str
    description: str
    desired_outcome: Optional[str] = None
    category: Optional[str] = None
    constraints: List[str] = Field(default_factory=list)
    required_capabilities: List[str] = Field(default_factory=list)
    required_execution_roles: List[str] = Field(default_factory=list, max_length=20)
    research_prd_type: Optional[str] = None
    customer_role_contract: Dict[str, Any] = Field(default_factory=dict)
    critical_claim_policy: Dict[str, Any] = Field(default_factory=dict)
    business_evidence_profile: Optional[BusinessEvidenceProfileV1] = None
    scope_contract_binding: Optional[ScopeContractBindingV1] = None
    research_execution_inputs_hash: Optional[str] = Field(
        default=None,
        pattern=r"^[a-f0-9]{64}$",
    )
    scope_research_acceptance: Optional[ScopeResearchAcceptanceBindingV1] = None
    scope_runtime_binding: Optional[TrustedRuntimeMetadataV1] = None

    @field_validator("required_execution_roles")
    @classmethod
    def normalize_execution_roles(cls, values: List[str]) -> List[str]:
        cleaned: List[str] = []
        seen = set()
        for value in values:
            item = value.strip()
            if len(item) > 255:
                raise ValueError("required execution roles are limited to 255 characters")
            if item and item.casefold() not in seen:
                seen.add(item.casefold())
                cleaned.append(item)
        return cleaned


class OrqalyAgentCandidate(BaseModel):
    agent_id: str
    name: str
    role: str
    description: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    availability_status: str = "available"
    success_rate: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    reputation_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


def _tokens(*values: Any) -> set[str]:
    text = " ".join(str(value or "") for value in values).lower()
    tokens = set()
    for raw in re.findall(r"[a-z0-9]+", text):
        if len(raw) < 3 or raw in STOP_WORDS:
            continue
        token = raw
        if token.endswith("ing") and len(token) > 5:
            token = token[:-3]
            if len(token) > 3 and token[-1] == token[-2]:
                token = token[:-1]
        elif token.endswith("ies") and len(token) > 5:
            token = token[:-3] + "y"
        elif token.endswith("s") and len(token) > 4 and not token.endswith("ss"):
            token = token[:-1]
        if len(token) >= 3 and token not in STOP_WORDS:
            tokens.add(token)
    return tokens


def _walk_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from _walk_strings(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if not str(key).startswith("_"):
                yield from _walk_strings(item)


def _evidence_items(value: Any) -> List[Dict[str, Any]]:
    found: List[Dict[str, Any]] = []

    def visit(item: Any) -> None:
        if isinstance(item, list):
            for child in item:
                visit(child)
            return
        if not isinstance(item, dict):
            return
        if item.get("quote") and item.get("speaker") and "start_char" in item:
            found.append(
                {
                    "quote": item["quote"],
                    "speaker": item["speaker"],
                    "document_id": item.get("document_id"),
                    "start_char": item.get("start_char"),
                    "end_char": item.get("end_char"),
                }
            )
        for child in item.values():
            visit(child)

    visit(value)
    unique = {}
    for item in found:
        key = (item["speaker"], item["quote"], item.get("document_id"))
        unique[key] = item
    return list(unique.values())


def _persona_confidence(persona: Dict[str, Any]) -> float:
    for key in ("confidence", "confidence_score", "overall_confidence"):
        value = persona.get(key)
        if isinstance(value, (int, float)):
            return max(0.0, min(float(value), 1.0))
    evidence_count = len(_evidence_items(persona))
    return min(0.55 + evidence_count * 0.05, 0.9)


def _field_text(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, dict):
        nested = value.get("value")
        if isinstance(nested, str) and nested.strip():
            return nested.strip()
    return fallback


def is_customer_persona_eligible(persona: Dict[str, Any]) -> bool:
    """Keep explicitly generated executors out of customer selection.

    Pipeline B preserves the originating stakeholder role in
    ``stakeholder_intelligence.stakeholder_type``.  This is an authority
    boundary, not a fuzzy title classifier: legacy personas without the field
    remain eligible, while rows explicitly generated as executors cannot be
    promoted to the affected customer merely because their evidence is rich.
    """

    stakeholder = persona.get("stakeholder_intelligence")
    stakeholder_type = (
        stakeholder.get("stakeholder_type")
        if isinstance(stakeholder, dict)
        else None
    )
    if not stakeholder_type:
        metadata = persona.get("persona_metadata")
        stakeholder_type = (
            metadata.get("stakeholder_category")
            if isinstance(metadata, dict)
            else None
        )
    normalized = " ".join(
        re.findall(r"[a-z0-9]+", str(stakeholder_type or "").casefold())
    )
    return normalized not in _NON_CUSTOMER_STAKEHOLDER_TYPES


_ECONOMIC_BUYER_TERMS = {
    "ceo", "chief executive", "chief financial", "chief operating", "chief marketing",
    "cfo", "coo", "cmo", "founder", "owner", "managing director", "geschäftsführer",
    "geschaeftsfuehrer", "general manager", "budget owner", "economic buyer",
    "head of finance", "head of procurement", "procurement director", "category buyer",
    "category manager", "purchasing director", "commercial director",
}
_DECISION_AUTHORITY_TERMS = {
    "decision authority", "decision maker", "decision-maker", "approver",
    "approval authority", "signing authority", "p&l owner", "pnl owner",
}
_OPERATIONAL_USER_TERMS = {
    "operator", "operational user", "end user", "technician", "coordinator",
    "administrator", "assistant", "junior", "analyst", "specialist",
}
_INFLUENCER_TERMS = {
    "influencer", "advisor", "adviser", "consultant", "legal counsel",
    "compliance lead", "subject matter expert",
}
_DECISION_ROLE_RANK = {
    "economic_buyer": 5,
    "decision_authority": 4,
    "influencer": 3,
    "operational_user": 2,
    "beneficiary": 1,
}


def _normalized_role_label(value: Any) -> str:
    return " ".join(re.findall(r"[^\W_]+", str(value or "").casefold()))


def _classify_trusted_stakeholder_type(value: Any) -> str:
    """Classify one source-bound type by exact label, never by substring."""

    normalized = _normalized_role_label(value)
    exact_roles = (
        (_DECISION_AUTHORITY_TERMS, "decision_authority"),
        (_ECONOMIC_BUYER_TERMS, "economic_buyer"),
        (_INFLUENCER_TERMS, "influencer"),
        (_OPERATIONAL_USER_TERMS, "operational_user"),
    )
    for labels, role in exact_roles:
        if normalized in {_normalized_role_label(label) for label in labels}:
            return role
    return "beneficiary"


def classify_customer_decision_role(persona: Dict[str, Any]) -> str:
    """Classify research participants by buying authority, not confidence alone."""

    stakeholder = persona.get("stakeholder_intelligence")
    metadata = persona.get("persona_metadata")
    demographics = persona.get("demographics")
    trusted_type = (
        stakeholder.get("stakeholder_type")
        if isinstance(stakeholder, dict)
        else None
    )
    if str(trusted_type or "").strip():
        return _classify_trusted_stakeholder_type(trusted_type)

    # Legacy personas without a source-bound type retain their historical
    # inferred-field and own-title fallback.
    explicit = " ".join(
        str(value or "")
        for value in (
            stakeholder.get("decision_role") if isinstance(stakeholder, dict) else None,
            metadata.get("decision_role") if isinstance(metadata, dict) else None,
        )
    ).casefold()
    if any(term in explicit for term in _DECISION_AUTHORITY_TERMS):
        return "decision_authority"
    if any(term in explicit for term in ("economic buyer", "budget owner", "buyer")):
        return "economic_buyer"
    if any(term in explicit for term in _INFLUENCER_TERMS):
        return "influencer"
    if any(term in explicit for term in _OPERATIONAL_USER_TERMS):
        return "operational_user"

    # Infer from the persona's own title only. Descriptive prose often mentions
    # who the participant supports and must not confer that other person's power.
    own_title = " ".join(
        str(value or "")
        for value in (
            persona.get("role"), persona.get("job_title"),
            stakeholder.get("role") if isinstance(stakeholder, dict) else None,
            demographics.get("role") if isinstance(demographics, dict) else None,
            demographics.get("job_title") if isinstance(demographics, dict) else None,
            (persona.get("name") or persona.get("persona_name") or "").split(",", 1)[1]
            if "," in str(persona.get("name") or persona.get("persona_name") or "") else None,
        )
    ).casefold()
    if any(term in own_title for term in _OPERATIONAL_USER_TERMS):
        return "operational_user"
    if any(term in own_title for term in _ECONOMIC_BUYER_TERMS):
        return "economic_buyer"
    if any(term in own_title for term in _DECISION_AUTHORITY_TERMS):
        return "decision_authority"
    if any(term in own_title for term in _INFLUENCER_TERMS):
        return "influencer"
    return "beneficiary"


def _selection_eligibility(
    decision_role: str, role_contract: Optional[Dict[str, Any]] = None
) -> str:
    primary_roles = set(
        (role_contract or {}).get("primary_roles")
        or (role_contract or {}).get("primary_decision_roles")
        or ["economic_buyer", "decision_authority"]
    )
    ineligible_roles = set((role_contract or {}).get("ineligible_roles") or [])
    if decision_role in ineligible_roles:
        return "ineligible"
    if decision_role in primary_roles:
        return "eligible_primary"
    return "secondary_only"


def _pick_customer_persona(
    personas: List[Dict[str, Any]],
    *,
    role_contract: Optional[Dict[str, Any]] = None,
    require_primary_buyer: bool = False,
) -> Dict[str, Any]:
    eligible = [persona for persona in personas if is_customer_persona_eligible(persona)]
    if not eligible:
        raise ValueError("Persona resolution requires an eligible customer persona")
    ranked = sorted(eligible, key=lambda persona: (
        _DECISION_ROLE_RANK[classify_customer_decision_role(persona)],
        _persona_confidence(persona),
        len(_evidence_items(persona)),
    ), reverse=True)
    persona = ranked[0]
    decision_role = classify_customer_decision_role(persona)
    eligibility = _selection_eligibility(decision_role, role_contract)
    if require_primary_buyer and eligibility != "eligible_primary":
        raise ValueError(
            "Persona resolution requires an economic buyer or decision authority "
            "for the primary commercial customer"
        )
    evidence = _evidence_items(persona)
    public_summary = {
        key: value
        for key, value in persona.items()
        if not str(key).startswith("_") and key not in {"raw_transcript", "source_text"}
    }
    return prune_nulls({
        "name": persona.get("name") or persona.get("persona_name") or "Primary customer persona",
        "confidence": _persona_confidence(persona),
        "decision_role": decision_role,
        "buyer_role": decision_role in {"economic_buyer", "decision_authority"},
        "selection_eligibility": eligibility,
        "profile": public_summary,
        "evidence": evidence,
    })


def _candidate_score(
    candidate: OrqalyAgentCandidate,
    task_tokens: set[str],
    customer_tokens: set[str],
) -> Dict[str, Any]:
    candidate_tokens = _tokens(
        candidate.name,
        candidate.role,
        candidate.description,
        candidate.capabilities,
        candidate.tools,
    )
    task_overlap = len(candidate_tokens & task_tokens) / max(1, min(len(task_tokens), 12))
    customer_overlap = len(candidate_tokens & customer_tokens) / max(
        1, min(len(customer_tokens), 12)
    )
    success = candidate.success_rate if candidate.success_rate is not None else 0.5
    reputation = (
        candidate.reputation_score if candidate.reputation_score is not None else 0.5
    )
    performance = (success + reputation) / 2
    available = candidate.availability_status.lower() in {"available", "active", "idle"}
    score = (0.55 * task_overlap) + (0.25 * customer_overlap) + (0.20 * performance)
    if not available:
        score *= 0.25
    return {
        "agent_id": candidate.agent_id,
        "name": candidate.name,
        "role": candidate.role,
        "score": round(min(score, 1.0), 4),
        "available": available,
        "matched_task_terms": sorted(candidate_tokens & task_tokens)[:12],
        "matched_customer_terms": sorted(candidate_tokens & customer_tokens)[:12],
        "capabilities": candidate.capabilities,
        "tools": candidate.tools,
    }


def resolve_orqaly_personas(
    empirical_personas: List[Dict[str, Any]],
    task_context: OrqalyTaskContext,
    agent_candidates: List[OrqalyAgentCandidate],
) -> Dict[str, Any]:
    """Build the task/customer/executor handoff consumed by Orqaly."""
    if not empirical_personas:
        raise ValueError("Persona resolution requires empirical customer personas")

    semantic_prd_type = normalize_research_prd_type(task_context.research_prd_type)
    role_contract = dict(task_context.customer_role_contract or {})
    require_primary_buyer = bool(
        role_contract.get("require_primary_buyer")
        or semantic_prd_type == COMMERCIAL_MARKET_LAUNCH
    )
    customer = _pick_customer_persona(
        empirical_personas,
        role_contract=role_contract,
        require_primary_buyer=require_primary_buyer,
    )
    task_tokens = _tokens(
        task_context.title,
        task_context.description,
        task_context.desired_outcome,
        task_context.category,
        task_context.constraints,
        task_context.required_capabilities,
        task_context.required_execution_roles,
    )
    # Include both the selected persona identity and its supporting quotations.
    # The public profile projection can be intentionally concise, while the
    # evidence often carries the domain signal needed for a grounded match.
    customer_tokens = _tokens(
        customer["name"],
        *_walk_strings(customer["profile"]),
        *(item.get("quote", "") for item in customer["evidence"]),
    )
    ranked = sorted(
        (
            _candidate_score(candidate, task_tokens, customer_tokens)
            for candidate in agent_candidates
        ),
        key=lambda item: (item["available"], item["score"]),
        reverse=True,
    )
    recommendation = (
        ranked[0]
        if ranked and ranked[0]["score"] >= MINIMUM_AGENT_FIT_SCORE
        else None
    )

    customer_profile = customer["profile"]
    communication_style = _field_text(
        customer_profile.get("communication_style")
        or customer_profile.get("preferred_communication_style"),
        "clear, evidence-grounded, and adapted to the customer",
    )
    ideal_capabilities = list(dict.fromkeys(
        task_context.required_execution_roles
        + task_context.required_capabilities
        + ((recommendation or {}).get("capabilities", []))
    ))[:12]
    if not ideal_capabilities:
        ideal_capabilities = [
            "stakeholder discovery",
            "evidence synthesis",
            "operational problem framing",
        ]
    category_role = (task_context.category or "operations").replace("_", " ").strip()
    if category_role == "general operations":
        category_role = "operations"
    required_roles = task_context.required_execution_roles
    if len(required_roles) == 1:
        ideal_role = required_roles[0]
    elif len(required_roles) > 1:
        ideal_role = "Role-specific execution team"
    else:
        ideal_role = (
            (recommendation or {}).get("role")
            or f"Customer-aligned {category_role} specialist"
        )
    ideal_agent = {
        "role": ideal_role,
        "profile_scope": "team" if len(required_roles) > 1 else "specialist",
        "required_execution_roles": required_roles,
        "communication_style": communication_style,
        "required_capabilities": ideal_capabilities,
        "operating_principles": [
            "Use the customer persona evidence when making task decisions.",
            "Do not invent customer needs that are absent from the research.",
            "State uncertainty and request human review for consequential actions.",
        ],
    }

    return {
        "version": "orqaly_dual_persona_v1",
        "task": task_context.model_dump(mode="json"),
        "customer_persona": customer,
        "ideal_agent_persona": ideal_agent,
        "recommended_agent": recommendation,
        "ranked_agents": ranked,
        "selection_status": "matched_candidate" if recommendation else "ideal_persona_only",
        "auto_assign_allowed": False,
        "requires_orqaly_authorization": True,
        "evidence_count": len(customer["evidence"]),
    }
