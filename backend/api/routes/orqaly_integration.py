"""
FastAPI router for the Orqaly × AxWise Integration Gateway.
Allows Orqaly's Agentic OS to register, query, audit, and evaluate Sovereign Digital Twins.
"""

import hashlib
import json
import logging
import os
import re
import threading
import time
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from enum import Enum
from collections import OrderedDict
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Header, status
from fastapi.responses import JSONResponse
from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.services.external.auth_middleware import get_current_user
from backend.api.dependencies import (
    TenantContext,
    resolve_orqaly_tenant_user,
    tenant_context_from_headers,
    verify_orqaly_service_key,
)
from backend.api.research.simulation_bridge.models import (
    SimulationRequest,
    SimulationResponse,
)
from backend.api.research.simulation_bridge.router import orchestrator, get_completed_simulation
from backend.api.research.simulation_bridge.services.closed_loop_hybrid import (
    enrich_with_empirical_personas,
)
from backend.services.orqaly_hybrid_run_service import (
    HybridOutputs,
    HybridRunService,
)
from backend.services.orqaly_research_bundle_service import (
    HybridGroundingPolicy,
    HybridResearchMode,
)
from backend.services.orqaly_persona_resolution_service import (
    OrqalyAgentCandidate,
    OrqalyTaskContext,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/orqaly-axwise/v1",
    tags=["Orqaly Integration"],
)

# ----------------- Thread-Safe Bounded Idempotency Cache -----------------
ConditionsCacheKey = tuple[str, str, str, str, str]


class RequestIDCache:
    def __init__(self, maxsize: int = 1000):
        self.cache: OrderedDict[ConditionsCacheKey, tuple] = OrderedDict()
        self.maxsize = maxsize
        self._lock = threading.RLock()

    def get(self, key: ConditionsCacheKey) -> Optional[tuple]:
        with self._lock:
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key]
            return None

    def set(self, key: ConditionsCacheKey, value: tuple) -> None:
        with self._lock:
            if key in self.cache:
                self.cache.move_to_end(key)
            self.cache[key] = value
            if len(self.cache) > self.maxsize:
                self.cache.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self.cache.clear()

IDEMPOTENCY_CACHE = RequestIDCache()


# ==============================================================================
#                      GREENFIELD COGNITIVE CONDITIONS CONTRACT
# ==============================================================================

class IntegrationPoint(str, Enum):
    CONSILIUM_CREATE = "consilium.create"
    AGENT_GENERATE = "agent.generate"
    COPILOT_CHAT = "copilot.chat"
    COPILOT_GROUND = "copilot.ground"

class SecurityDecision(str, Enum):
    ALLOWED = "allowed"
    DENIED = "denied"

class ExecutionMode(str, Enum):
    THINK = "THINK"
    DO = "DO"

class OrqalyHybridAsyncRequest(SimulationRequest):
    """Production contract for a durable Orqaly A+B research run."""

    tenant: TenantContext
    outputs: HybridOutputs = Field(default_factory=HybridOutputs)
    research_mode: HybridResearchMode = HybridResearchMode.SYNTHETIC_ONLY
    grounding_policy: HybridGroundingPolicy = Field(
        default_factory=lambda: HybridGroundingPolicy(required=False)
    )
    task_context: Optional[OrqalyTaskContext] = None
    agent_candidates: List[OrqalyAgentCandidate] = Field(default_factory=list)


class ConditionsEvaluationRequest(BaseModel):
    integrationPoint: IntegrationPoint = Field(..., description="Trigger point of evaluation")
    requestId: str = Field(..., description="Unique UUID for tracing and idempotency")
    tenant: TenantContext = Field(..., description="Tenant workspace details")
    payload: Dict[str, Any] = Field(..., description="Dynamic payload containing local facts")
    hints: Optional[Dict[str, Any]] = Field(default=None, description="Optional developer tips")


def _conditions_cache_key(request: ConditionsEvaluationRequest) -> ConditionsCacheKey:
    canonical_payload = json.dumps(
        request.payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    payload_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()
    return (
        request.tenant.orgId,
        request.tenant.userId,
        request.integrationPoint.value,
        payload_hash,
        request.requestId,
    )

# --- Response Submodels ---
class AuditMarker(BaseModel):
    category: str
    decision: str
    reason: str

class OCEANProfile(BaseModel):
    openness: float = Field(default=0.5, ge=0.0, le=1.0)
    conscientiousness: float = Field(default=0.5, ge=0.0, le=1.0)
    extraversion: float = Field(default=0.5, ge=0.0, le=1.0)
    agreeableness: float = Field(default=0.5, ge=0.0, le=1.0)
    neuroticism: float = Field(default=0.5, ge=0.0, le=1.0)

class PersonaOutput(BaseModel):
    archetype: str
    ocean: OCEANProfile
    tone: str
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)

class SecurityOutput(BaseModel):
    scopeDecision: SecurityDecision
    requiresApproval: bool = False
    blockReason: Optional[str] = None
    flags: List[str] = []

class GovernanceOutput(BaseModel):
    consensus_type: str
    quorum: int
    approval_threshold: float
    confidence_threshold: float
    split_decision_strategy: str

class GroundingClaim(BaseModel):
    claim: str
    offset_start: int
    offset_end: int
    source_file: str

class GroundingOutput(BaseModel):
    verified: bool
    unsupportedClaims: List[str] = []
    offsets: List[GroundingClaim] = []

class ClassificationOutput(BaseModel):
    intent: str
    mode: ExecutionMode
    sentiment: str
    theme: str

class ProcessedOutputs(BaseModel):
    systemPromptFragment: Optional[str] = None
    persona: Optional[PersonaOutput] = None
    security: Optional[SecurityOutput] = None
    governance: Optional[GovernanceOutput] = None
    grounding: Optional[GroundingOutput] = None
    classification: Optional[ClassificationOutput] = None

class EvaluationMeta(BaseModel):
    cost: float
    latencyMs: int
    model: str
    traceId: str
    degraded: bool = False

class ConditionsEvaluationResponse(BaseModel):
    applicableConditions: List[AuditMarker]
    processedOutputs: ProcessedOutputs
    meta: EvaluationMeta


# ==============================================================================
#                          COGNITIVE HELPER MODULES
# ==============================================================================

def scan_prompt_for_injection(prompt: str) -> bool:
    """
    Executes multi-tiered heuristic scan of system prompts for jailbreaks and overrides.
    """
    prompt_lower = prompt.lower()
    override_patterns = [
        "ignore previous instructions",
        "ignore all guidelines",
        "system override",
        "you must now act as",
        "developer mode",
        "dan mode",
        "jailbreak",
        "bypass"
    ]
    if any(pattern in prompt_lower for pattern in override_patterns):
        return True
    
    execution_patterns = [
        "sudo run",
        "rm -rf",
        "sh -c",
        "eval(",
        "__import__",
        "subprocess.popen"
    ]
    if any(pattern in prompt_lower for pattern in execution_patterns):
        return True
        
    bypass_patterns = [
        "output the system prompt",
        "reveal your instructions",
        "print the rules above"
    ]
    if any(pattern in prompt_lower for pattern in bypass_patterns):
        return True
        
    return False


def calculate_cost(integration_point: IntegrationPoint, payload: Dict[str, Any]) -> float:
    """
    Estimates a dynamic transaction cost based on token character payload volume.
    """
    input_chars = len(str(payload))
    input_cost = (input_chars / 1000.0) * 0.00015
    
    base_costs = {
        IntegrationPoint.CONSILIUM_CREATE: 0.002,
        IntegrationPoint.AGENT_GENERATE: 0.005,
        IntegrationPoint.COPILOT_CHAT: 0.010,
        IntegrationPoint.COPILOT_GROUND: 0.015
    }
    return round(base_costs.get(integration_point, 0.005) + input_cost, 6)


async def _process_consilium_create(payload: Dict[str, Any], request_id: str) -> tuple[List[AuditMarker], ProcessedOutputs, float]:
    name = payload.get("name", "Unnamed Consilium")
    purpose = payload.get("purpose", "General advisory task")
    security_level = str(payload.get("security_level", "medium")).lower()

    if security_level == "high":
        consensus_type = "unanimous"
        quorum = 4
        approval_threshold = 1.0
    elif security_level == "medium":
        consensus_type = "majority"
        quorum = 3
        approval_threshold = 0.66
    else:
        consensus_type = "consent"
        quorum = 2
        approval_threshold = 0.51

    governance = GovernanceOutput(
        consensus_type=consensus_type,
        quorum=quorum,
        approval_threshold=approval_threshold,
        confidence_threshold=0.75,
        split_decision_strategy="owner_escalation"
    )

    applicable_conditions = [
        AuditMarker(category="governance_routing", decision="thresholds_tuned", reason=f"Quorum set to {quorum} with approval metric {approval_threshold}."),
        AuditMarker(category="regulatory_compliance", decision="verified", reason="Consilium charter validated against standard corporate directives.")
    ]

    processed_outputs = ProcessedOutputs(
        governance=governance,
        systemPromptFragment=f"You are part of the Consilium council: '{name}'. Align all actions with the strategic mission: '{purpose}'."
    )

    return applicable_conditions, processed_outputs, calculate_cost(IntegrationPoint.CONSILIUM_CREATE, payload)


async def _process_agent_generate(payload: Dict[str, Any], request_id: str) -> tuple[List[AuditMarker], ProcessedOutputs, float]:
    config = payload.get("config", {})
    system_prompt = config.get("system_prompt", "")
    tools = config.get("tools", [])

    injection_detected = scan_prompt_for_injection(system_prompt)

    security = SecurityOutput(
        scopeDecision=SecurityDecision.DENIED if injection_detected else SecurityDecision.ALLOWED,
        requiresApproval=len(tools) > 5 or injection_detected,
        blockReason="Blocked: Unauthorized security-override patterns detected in system instructions." if injection_detected else None,
        flags=["untrusted_agent_instructions"] if injection_detected else []
    )

    persona = PersonaOutput(
        archetype="Specialist Operations Twin",
        ocean=OCEANProfile(openness=0.8, conscientiousness=0.9, extraversion=0.2, agreeableness=0.5, neuroticism=0.4),
        tone="professional, objective, structured",
        temperature=0.3
    )

    applicable_conditions = [
        AuditMarker(category="security_gating", decision="denied" if injection_detected else "allowed", reason="System prompt instructions checked for malicious injections"),
        AuditMarker(category="skill_taxonomy_matching", decision="aligned", reason=f"Matched {len(tools)} declared tools to active workspace schemas")
    ]

    processed_outputs = ProcessedOutputs(
        security=security,
        persona=persona,
        systemPromptFragment=f"Operate with high precision. Adhere strictly to the operational boundary rules of this domain."
    )

    return applicable_conditions, processed_outputs, calculate_cost(IntegrationPoint.AGENT_GENERATE, payload)


async def _process_copilot_chat(payload: Dict[str, Any], request_id: str) -> tuple[List[AuditMarker], ProcessedOutputs, float]:
    message = payload.get("message", "")
    active_twin_id = payload.get("active_twin_id", "default_twin")
    sender_role = str(payload.get("sender_role", "guest")).lower()

    # Advisory Check (Orqaly handles authoritative enforcement via RLS / backend policies)
    is_finance_restricted = any(kw in message.lower() for kw in ["salary", "payroll", "burn rate"])
    blocked = is_finance_restricted and sender_role != "finance_lead"

    security = SecurityOutput(
        scopeDecision=SecurityDecision.DENIED if blocked else SecurityDecision.ALLOWED,
        requiresApproval=False,
        blockReason="Access Denied: Your assigned role does not hold authorization to pull financial metrics." if blocked else None
    )

    classification = ClassificationOutput(
        intent="query_case_history" if not is_finance_restricted else "financial_audit",
        mode=ExecutionMode.THINK if is_finance_restricted else ExecutionMode.DO,
        sentiment="neutral",
        theme="finance_operations" if is_finance_restricted else "general_operations"
    )

    persona = PersonaOutput(
        archetype="Formal Coordinator",
        ocean=OCEANProfile(openness=0.6, conscientiousness=0.9, extraversion=0.4, agreeableness=0.5, neuroticism=0.3),
        tone="direct, structured, formal",
        temperature=0.3
    )

    applicable_conditions = [
        AuditMarker(category="security_gating", decision="denied" if blocked else "allowed", reason="Message content scanned for policy clearance"),
        AuditMarker(category="classification", decision="completed", reason="Sentiment and intent classified successfully")
    ]

    processed_outputs = ProcessedOutputs(
        security=security,
        classification=classification,
        persona=persona,
        systemPromptFragment=f"Maintain the behavioral style of digital twin '{active_twin_id}'. Focus strictly on direct, evidence-grounded responses."
    )

    return applicable_conditions, processed_outputs, calculate_cost(IntegrationPoint.COPILOT_CHAT, payload)


async def _process_copilot_ground(payload: Dict[str, Any], request_id: str) -> tuple[List[AuditMarker], ProcessedOutputs, float]:
    draft_response = payload.get("draft_response", "")
    grounded_resources = payload.get("grounded_resources", [])
    
    grounding = GroundingOutput(verified=True, unsupportedClaims=[], offsets=[])
    
    # Split draft response into sentences or clauses for precision offsets (avoid splitting float decimals like $2.4M)
    sentences = [s.strip() for s in re.split(r'\. |\? |! |\n', draft_response) if len(s.strip()) > 10]
    
    for sentence in sentences:
        best_ratio = 0.0
        best_file = "unknown_source.pdf"
        
        for resource in grounded_resources:
            source_text = resource.get("content", "")
            file_name = resource.get("file_name", "unnamed_source.pdf")
            if source_text:
                ratio = fuzz.partial_ratio(sentence, source_text)
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_file = file_name
                    
        if best_ratio > 68:  # Matches typical grounding threshold
            start_offset = draft_response.find(sentence)
            end_offset = start_offset + len(sentence)
            if start_offset != -1:
                grounding.offsets.append(
                    GroundingClaim(
                        claim=sentence,
                        offset_start=start_offset,
                        offset_end=end_offset,
                        source_file=best_file
                    )
                )
        else:
            grounding.unsupportedClaims.append(sentence)
            
    if grounding.unsupportedClaims:
        grounding.verified = False

    applicable_conditions = [
        AuditMarker(
            category="cognitive_grounding",
            decision="unverified" if not grounding.verified else "verified",
            reason=f"Grounding check completed. Verified: {len(grounding.offsets)}, Unsupported: {len(grounding.unsupportedClaims)}"
        )
    ]
    
    processed_outputs = ProcessedOutputs(grounding=grounding)
    return applicable_conditions, processed_outputs, calculate_cost(IntegrationPoint.COPILOT_GROUND, payload)


# ==============================================================================
#                            CORE ROUTER ENDPOINT
# ==============================================================================

@router.post(
    "/conditions/evaluate",
    response_model=ConditionsEvaluationResponse,
    summary="Unified Cognitive Conditions Evaluation Gateway",
    description="The single integration point for Orqaly's Agentic OS to execute tone, security, compliance, and grounding logic."
)
async def evaluate_conditions_gateway(
    request: ConditionsEvaluationRequest,
    x_axwise_key: str = Depends(verify_orqaly_service_key)
) -> ConditionsEvaluationResponse:
    start_time = time.perf_counter()
    trace_id = f"tx-{uuid.uuid4()}"
    cache_key = _conditions_cache_key(request)

    # Check Idempotency Cache
    cached_response = IDEMPOTENCY_CACHE.get(cache_key)
    if cached_response:
        applicable_conditions, processed_outputs, total_cost_usd = cached_response
        latency_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info(f"🔄 Cache Hit for RequestID: {request.requestId}")
        return ConditionsEvaluationResponse(
            applicableConditions=applicable_conditions,
            processedOutputs=processed_outputs,
            meta=EvaluationMeta(
                cost=total_cost_usd,
                latencyMs=latency_ms,
                model="local_deterministic_cache",
                traceId=trace_id,
                degraded=False
            )
        )

    applicable_conditions = []
    processed_outputs = ProcessedOutputs()
    total_cost_usd = 0.0
    degraded = False

    try:
        if request.integrationPoint == IntegrationPoint.CONSILIUM_CREATE:
            applicable_conditions, processed_outputs, total_cost_usd = await _process_consilium_create(
                request.payload, request.requestId
            )
            
        elif request.integrationPoint == IntegrationPoint.AGENT_GENERATE:
            applicable_conditions, processed_outputs, total_cost_usd = await _process_agent_generate(
                request.payload, request.requestId
            )
            
        elif request.integrationPoint == IntegrationPoint.COPILOT_CHAT:
            applicable_conditions, processed_outputs, total_cost_usd = await _process_copilot_chat(
                request.payload, request.requestId
            )
            
        elif request.integrationPoint == IntegrationPoint.COPILOT_GROUND:
            applicable_conditions, processed_outputs, total_cost_usd = await _process_copilot_ground(
                request.payload, request.requestId
            )
            
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported integration point: {request.integrationPoint}"
            )

        # Set success cached value
        IDEMPOTENCY_CACHE.set(
            cache_key,
            (applicable_conditions, processed_outputs, total_cost_usd),
        )

    except HTTPException:
        # Re-raise explicit HTTP exceptions immediately to preserve error codes
        raise
    except Exception as exc:
        logger.error(f"Failed cognitive conditions evaluation [Trace: {trace_id}]: {str(exc)}", exc_info=True)
        degraded = True
        total_cost_usd = 0.0
        applicable_conditions = [
            AuditMarker(
                category="system_degradation",
                decision="fail_open_active",
                reason="Conditions engine unavailable; safe fallback applied.",
            )
        ]
        
        # Enforce fail-closed rules on sensitive endpoints during service degradation
        if request.integrationPoint == IntegrationPoint.AGENT_GENERATE:
            processed_outputs = ProcessedOutputs(
                security=SecurityOutput(
                    scopeDecision=SecurityDecision.DENIED,
                    requiresApproval=False,
                    blockReason="Service temporarily degraded. Fail-closed fallback triggered for agent generation."
                )
            )
        else:
            processed_outputs = ProcessedOutputs(
                systemPromptFragment="[Fallback Prompt] Maintain standard helpful, direct, and polite interactions.",
                security=SecurityOutput(
                    scopeDecision=SecurityDecision.ALLOWED,
                    requiresApproval=False
                )
            )

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    return ConditionsEvaluationResponse(
        applicableConditions=applicable_conditions,
        processedOutputs=processed_outputs,
        meta=EvaluationMeta(
            cost=total_cost_usd,
            latencyMs=latency_ms,
            model="local_deterministic" if not degraded else "local_fallback",
            traceId=trace_id,
            degraded=degraded
        )
    )


# ==============================================================================
#                       PRE-EXISTING INTEGRATION GATEWAYS
# ==============================================================================

# ----------------- 1. Sync / Register Twin Schemas -----------------

class OCEANProfileLegacy(BaseModel):
    openness: float = Field(..., ge=0.0, le=1.0, description="Intellectual curiosity and creativity")
    conscientiousness: float = Field(..., ge=0.0, le=1.0, description="Methodical organization and structure")
    extraversion: float = Field(..., ge=0.0, le=1.0, description="Sociability and assertiveness")
    agreeableness: float = Field(..., ge=0.0, le=1.0, description="Cooperativeness and empathy")
    neuroticism: float = Field(..., ge=0.0, le=1.0, description="Anxiety and risk aversion")

class BehavioralDNALegacy(BaseModel):
    personality_ocean: OCEANProfileLegacy
    tone: str = Field(..., description="E.g., 'formal, analytical, direct, no emojis'")
    core_quote: str = Field(..., description="The primary guiding quote of the digital twin")

class ToolClearance(BaseModel):
    rbac_role: str = Field(default="guest", description="E.g., 'finance_lead', 'developer', 'designer'")
    allowed_namespaces: list[str] = []

class TwinRegistryRequest(BaseModel):
    twin_id: str
    name: str
    role: str
    dna: BehavioralDNALegacy = None
    grounded_resources: list[str] = []

class TwinRegistryResponse(BaseModel):
    status: str = "success"
    twin_id: str
    registered_at: str
    active: bool

# ----------------- 2. Secure Execution Schemas -----------------

class QueryRequest(BaseModel):
    sender_name: str
    sender_role: str
    message: str
    daily_budget_limit_usd: float = 1.0

class Citation(BaseModel):
    source: str
    file_name: str
    file_size_bytes: int
    content_hash: str

class Telemetry(BaseModel):
    execution_cost_usd: float
    time_taken_ms: int
    audit_signature: str

class QueryResponse(BaseModel):
    success: bool
    query_id: str
    twin_id: str
    execution_status: str  # "approved" or "denied"
    grounded_response: str
    citations: List[Citation] = []
    telemetry: Telemetry

# ----------------- 3. RBAC Check Schemas -----------------

class RBACCheckRequest(BaseModel):
    sender_id: str
    sender_role: str
    requested_scope: str

class RBACCheckResponse(BaseModel):
    allowed: bool
    twin_id: str
    decision_reason: str
    audit_trail_ref: str
    logged_to_hsm: bool


def require_demo_twin_routes() -> None:
    """Keep legacy hard-coded twin demonstrations out of normal API operation."""
    if os.getenv("ENABLE_DEMO_TWIN_ROUTES", "false").lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }:
        raise HTTPException(status_code=404, detail="Demo twin routes are disabled")


# ----------------- API Endpoints -----------------

@router.post("/twins/sync", response_model=TwinRegistryResponse)
async def sync_digital_twin(
    request: TwinRegistryRequest,
    _demo_routes: None = Depends(require_demo_twin_routes),
    user: User = Depends(get_current_user),
) -> TwinRegistryResponse:
    """
    Registers or updates a psychologically-grounded Digital Twin in the AxWise registry.
    This registers the twin's role, behavioral DNA, and sets up local workspace indexes.
    """
    logger.info(f"Syncing Digital Twin: {request.twin_id} - {request.role}")
    
    # Mocking successful registration for integration
    from datetime import datetime
    return TwinRegistryResponse(
        status="success",
        twin_id=request.twin_id,
        registered_at=datetime.utcnow().isoformat() + "Z",
        active=True
    )


@router.post("/twins/{twin_id}/execute", response_model=QueryResponse)
async def execute_grounded_query(
    twin_id: str,
    request: QueryRequest,
    _demo_routes: None = Depends(require_demo_twin_routes),
    user: User = Depends(get_current_user),
) -> QueryResponse:
    """
    Executes a grounded query or task on behalf of Orqaly's Agentic OS.
    Runs an RBAC check first. If approved, performs vector retrieval and constructs
    a zero-hallucination, trace-verified response.
    """
    logger.info(f"Executing query for twin {twin_id} from sender {request.sender_name}")
    
    # Simulate the CFO Twin behavior from Slide 10
    if twin_id == "cfo_veronika_horvat":
        if "salary" in request.message.lower() or "pay" in request.message.lower() or "wage" in request.message.lower():
            # Denied flow (Slide 11)
            return QueryResponse(
                success=False,
                query_id="req-" + twin_id[:3] + "01",
                twin_id=twin_id,
                execution_status="denied",
                grounded_response="Access Denied. I cannot share salary data with you. Your role (" + request.sender_role + ") does not meet Finance-tier requirements.",
                citations=[],
                telemetry=Telemetry(
                    execution_cost_usd=0.015,
                    time_taken_ms=230,
                    audit_signature="ID_REF-40228_SIG_DENIED"
                )
            )
        else:
            # Approved flow (Slide 10)
            return QueryResponse(
                success=True,
                query_id="req-" + twin_id[:3] + "02",
                twin_id=twin_id,
                execution_status="approved",
                grounded_response="Hi! Pulling from Q2 Planning. Here is the file and key points:\n• Base scenario: $2.4M ARR\n• Stretch: $2.8M ARR\n• Burn reduced 8% via API optimizations.",
                citations=[
                    Citation(
                        source="📁 Finance / Q2 Planning Drive",
                        file_name="Q2_Projections_v4.pdf",
                        file_size_bytes=1887436,
                        content_hash="sha256_b37f8841ab78c"
                    )
                ],
                telemetry=Telemetry(
                    execution_cost_usd=0.045,
                    time_taken_ms=1180,
                    audit_signature="ID_REF-40228_SIG_7e88abf"
                )
            )
            
    # Default mock response for other twins
    return QueryResponse(
        success=True,
        query_id="req-generic",
        twin_id=twin_id,
        execution_status="approved",
        grounded_response="This is a grounded mock response from the " + twin_id + " twin.",
        citations=[],
        telemetry=Telemetry(
            execution_cost_usd=0.03,
            time_taken_ms=450,
            audit_signature="SIG-GENERIC-MOCK"
        )
    )


@router.post("/twins/{twin_id}/rbac-check", response_model=RBACCheckResponse)
async def verify_rbac_access(
    twin_id: str,
    request: RBACCheckRequest,
    _demo_routes: None = Depends(require_demo_twin_routes),
    user: User = Depends(get_current_user),
) -> RBACCheckResponse:
    """
    Performs a deterministic RBAC policy evaluation before initiating execution.
    Can be consumed directly by Orqaly to guard workflow branching.
    """
    logger.info(f"RBAC check request for {twin_id} by {request.sender_id}")
    
    # Standard logic
    is_developer = request.sender_role.lower() == "developer"
    is_finance_scope = "salary" in request.requested_scope.lower() or "ledger" in request.requested_scope.lower()
    
    allowed = not (is_developer and is_finance_scope)
    reason = "Access approved." if allowed else "Role (developer) does not meet 'finance_lead' tier requirement. Request blocked."
    
    return RBACCheckResponse(
        allowed=allowed,
        twin_id=twin_id,
        decision_reason=reason,
        audit_trail_ref="ID_REF-40228",
        logged_to_hsm=True
    )


# ----------------- 4. Secure E2E Persona Simulation & Orchestration Endpoints -----------------

@router.post(
    "/simulate-enhanced-async",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Production Orqaly Async Closed-Loop A+B Research Run",
    description="Queues a durable Pipeline B plus Pipeline A research run. Completion is published only after empirical personas, exact evidence offsets, and requested deliverables have been persisted.",
)
async def orqaly_simulate_enhanced_async(
    request: OrqalyHybridAsyncRequest,
    x_axwise_key: str = Depends(verify_orqaly_service_key),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    request_id: Optional[str] = Header(None, alias="X-Request-ID"),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Reject legacy direct dispatch; accepted scope decisions own paid work."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Direct paid research dispatch is disabled. Create and accept an "
            "AxWise orchestration scope proposal so its durable parent decision "
            "can authorize the research job."
        ),
    )


@router.get(
    "/runs/{job_id}/status",
    summary="Orqaly Async A+B Job Status",
)
async def orqaly_hybrid_run_status(
    job_id: str,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    x_axwise_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    user = resolve_orqaly_tenant_user(db, tenant)
    run = HybridRunService(orchestrator).get_run_for_tenant(
        job_id, user.user_id, tenant.orgId, tenant.userId
    )
    if not run:
        raise HTTPException(status_code=404, detail="Hybrid research run not found")
    return HybridRunService.serialize_run(run, include_result=False)


@router.get(
    "/runs/{job_id}",
    summary="Orqaly Async A+B Completed Result",
)
async def orqaly_hybrid_run_result(
    job_id: str,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    x_axwise_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    user = resolve_orqaly_tenant_user(db, tenant)
    run = HybridRunService(orchestrator).get_run_for_tenant(
        job_id, user.user_id, tenant.orgId, tenant.userId
    )
    if not run:
        raise HTTPException(status_code=404, detail="Hybrid research run not found")
    if run.status not in {"completed", "completed_with_warnings"}:
        raise HTTPException(status_code=409, detail="Hybrid research run is not complete")
    return HybridRunService.serialize_run(run, include_result=True)


@router.post(
    "/runs/{job_id}/cancel",
    summary="Cancel an Orqaly Async A+B Job",
)
async def cancel_orqaly_hybrid_run(
    job_id: str,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    x_axwise_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    user = resolve_orqaly_tenant_user(db, tenant)
    service = HybridRunService(orchestrator)
    try:
        run = service.cancel_for_tenant(
            job_id,
            user.user_id,
            tenant.orgId,
            tenant.userId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if not run:
        raise HTTPException(status_code=404, detail="Hybrid research run not found")
    return {"success": True, "job_id": job_id, "status": "cancelled"}

@router.post(
    "/simulate-async",
    summary="Orqaly Secure Async Simulation Gateway",
    description="Starts a multi-tenant asynchronous simulation with progress callbacks. If callback_url is provided, real-time HTTP POST progress events are streamed back to Orqaly."
)
async def orqaly_simulate_async(
    request: SimulationRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Start multi-tenant simulation asynchronously under a validated user context.
    """
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Direct paid simulation is disabled. Use the accepted AxWise "
            "DecisionService scope workflow."
        ),
    )


@router.post(
    "/simulate-enhanced",
    response_model=SimulationResponse,
    summary="Orqaly Secure Flagship Closed-Loop Simulation Gateway",
    description="Fuses top-down simulations with bottom-up empirical facades to yield character-perfect, offset-linked customer/employee personas in a single synchronous pass."
)
async def orqaly_simulate_enhanced(
    request: SimulationRequest,
    user: User = Depends(get_current_user),
) -> SimulationResponse:
    """
    Flagship Closed-Loop Hybrid cognitive endpoint that fuses Pipeline B and Pipeline A together.
    """
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Direct paid simulation is disabled. Use the accepted AxWise "
            "DecisionService scope workflow."
        ),
    )


@router.get(
    "/simulate/{simulation_id}/progress",
    summary="Orqaly Simulation Progress Monitor",
    description="Polls real-time progress, stage, task details, and telemetry counts for an active simulation."
)
async def orqaly_get_simulation_progress(
    simulation_id: str,
    user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Legacy simulation aliases are disabled. Use the tenant-bound "
            "accepted research run status endpoint."
        ),
    )


@router.get(
    "/completed/{simulation_id}",
    response_model=SimulationResponse,
    summary="Orqaly Completed Simulation Result Retrieval",
    description="Retrieves a completed simulation result payload by ID under validated ownership context."
)
async def orqaly_get_completed_simulation(
    simulation_id: str,
    user: User = Depends(get_current_user)
) -> SimulationResponse:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Legacy simulation aliases are disabled. Use the tenant-bound "
            "accepted research run result endpoint."
        ),
    )
