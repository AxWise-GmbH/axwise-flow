"""AxPersona Research-to-Persona Pipeline API Router.

This router exposes a minimal, non-breaking skeleton for the standalone
research-to-persona service described in AXPERSONA_PIPELINE_ARCHITECTURE.md.

It intentionally focuses on:
- Clear API contracts (Pydantic models)
- Reuse of existing Simulation Bridge and Analysis components
- A single end-to-end pipeline endpoint plus key building blocks

Implementation details (persistence, auth, background jobs) can be
filled in incrementally without changing these contracts.
"""

import json
import logging
import asyncio

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.api.research.conversation_routines.service import (
    ConversationRoutineService,
)
from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    QuestionsData,
    SimulationConfig,
    SimulationRequest,
    SimulationResponse,
    Stakeholder,
)
from backend.api.research.simulation_bridge.services.conversational_analysis_agent import (
    ConversationalAnalysisAgent,
)
from backend.api.research.simulation_bridge.services.orchestrator import (
    SimulationOrchestrator,
)
from backend.database import SessionLocal
from backend.domain.models.production_persona import (
    ProductionPersona,
    PersonaAPIResponse,
    PersonaTrait,
)
from backend.infrastructure.persistence.simulation_repository import (
    SimulationRepository,
)
from backend.infrastructure.persistence.pipeline_run_repository import (
    PipelineRunRepository,
)
from backend.infrastructure.persistence.unit_of_work import UnitOfWork
from backend.models import AnalysisResult
from backend.schemas import DetailedAnalysisResult
from backend.services.adapters.persona_adapters import from_ssot_to_frontend


router = APIRouter(prefix="/api/axpersona/v1", tags=["AxPersona Pipeline"])

logger = logging.getLogger(__name__)

# Shared services reused from existing AxWise Flow modules
conversation_service = ConversationRoutineService()


async def _resolve_simulation(simulation_id: str) -> SimulationResponse:
    """Resolve a completed simulation either from orchestrator cache or DB.

    This mirrors the Simulation Bridge router behaviour but is kept local to
    the AxPersona pipeline so that analysis and exports can share it.
    """

    # 1) Try in-memory cache first (fast path for recently completed runs)
    cached = orchestrator.get_completed_simulation(simulation_id)
    if cached is not None:
        return cached

    # 2) Fallback to persisted simulation in the database
    async with UnitOfWork(SessionLocal) as uow:
        repo = SimulationRepository(uow.session)
        db_simulation = await repo.get_by_simulation_id(simulation_id)

        if not db_simulation:
            raise HTTPException(
                status_code=404,
                detail=f"Simulation {simulation_id} not found in memory or database",
            )

        # Rehydrate SimulationResponse from the stored ORM model. The
        # ``formatted_data`` column contains the same structure produced by
        # ``DataFormatter.format_for_analysis`` (including
        # ``analysis_ready_text``), while ``total_personas`` /
        # ``total_interviews`` give us lightweight metadata.
        return SimulationResponse(
            success=True,
            message="Simulation loaded from database",
            simulation_id=db_simulation.simulation_id,
            data=db_simulation.formatted_data or {},
            metadata={
                "total_personas": db_simulation.total_personas,
                "total_interviews": db_simulation.total_interviews,
                "status": db_simulation.status,
                "created_at": db_simulation.created_at.isoformat()
                if getattr(db_simulation, "created_at", None)
                else None,
                "completed_at": db_simulation.completed_at.isoformat()
                if getattr(db_simulation, "completed_at", None)
                else None,
            },
            people=db_simulation.personas or [],
            interviews=db_simulation.interviews or [],
            simulation_insights=db_simulation.insights,
        )


def _build_simulation_text(simulation: SimulationResponse) -> str:
    """Build a single analysis string from simulation data.

    The SimulationOrchestrator already formats a consolidated analysis text via
    ``DataFormatter.format_for_analysis`` and stores it on the simulation
    payload. We first try to reuse that text to stay aligned with the
    Simulation Bridge analysis pipeline, and fall back to a simple interview
    concatenation if it is missing.
    """

    # Preferred path: reuse the analysis-ready text produced by the
    # Simulation Bridge data formatter, if available.
    data = simulation.data or {}
    analysis_ready_text = data.get("analysis_ready_text")
    if isinstance(analysis_ready_text, str) and analysis_ready_text.strip():
        return analysis_ready_text

    # Fallback: build a simple, but still traceable, interview transcript.
    interviews = simulation.interviews or []
    personas = simulation.personas or []

    parts: List[str] = []

    for interview in interviews:
        persona_name = "Unknown"
        if hasattr(interview, "persona_id"):
            persona_id = interview.persona_id
        else:
            persona_id = getattr(interview, "person_id", None)

        for persona in personas:
            if getattr(persona, "id", None) == persona_id:
                persona_name = getattr(persona, "name", "Unknown")
                break

        stakeholder_type = getattr(interview, "stakeholder_type", "Unknown")

        parts.append(
            f"=== Interview with {persona_name} ({stakeholder_type}) ==="
        )
        parts.append(
            f"Overall Sentiment: {getattr(interview, 'overall_sentiment', 'unknown')}"
        )
        key_themes = getattr(interview, "key_themes", []) or []
        if key_themes:
            parts.append(f"Key Themes: {', '.join(key_themes)}")
        parts.append("")

        responses = getattr(interview, "responses", []) or []
        for i, response in enumerate(responses, 1):
            question = getattr(response, "question", "")
            answer = getattr(response, "response", "")
            parts.append(f"Q{i}: {question}")
            parts.append(f"A{i}: {answer}")
            parts.append("")

    return "\n".join(parts)


async def _save_analysis_result(
    analysis_result: DetailedAnalysisResult,
    simulation_id: str,
) -> DetailedAnalysisResult:
    """Persist analysis results to the AnalysisResult table.

    Adapted from SimulationFileProcessor._save_analysis_to_database so that
    AxPersona reuses the same JSON envelope while also returning a stable
    numeric analysis_id via ``analysis_result.id``.
    """

    try:
        analysis_data: Dict[str, Any] = {
            "id": analysis_result.id,
            "simulation_id": simulation_id,
            "status": analysis_result.status,
            "created_at": analysis_result.createdAt,
            "file_name": analysis_result.fileName,
            "file_size": analysis_result.fileSize,
            "themes": [
                theme.dict() if hasattr(theme, "dict") else theme
                for theme in analysis_result.themes
            ],
            "enhanced_themes": (
                [
                    theme.dict() if hasattr(theme, "dict") else theme
                    for theme in analysis_result.enhanced_themes
                ]
                if analysis_result.enhanced_themes
                else []
            ),
            "patterns": [
                pattern.dict() if hasattr(pattern, "dict") else pattern
                for pattern in analysis_result.patterns
            ],
            "enhanced_patterns": (
                [
                    pattern.dict() if hasattr(pattern, "dict") else pattern
                    for pattern in analysis_result.enhanced_patterns
                ]
                if analysis_result.enhanced_patterns
                else []
            ),
            "sentiment_overview": (
                analysis_result.sentimentOverview.dict()
                if analysis_result.sentimentOverview
                and hasattr(analysis_result.sentimentOverview, "dict")
                else analysis_result.sentimentOverview
            ),
            "sentiment": [
                sentiment.dict() if hasattr(sentiment, "dict") else sentiment
                for sentiment in (analysis_result.sentiment or [])
            ],
            "personas": [
                persona.dict() if hasattr(persona, "dict") else persona
                for persona in (analysis_result.personas or [])
            ],
            "enhanced_personas": (
                [
                    persona.dict() if hasattr(persona, "dict") else persona
                    for persona in (analysis_result.enhanced_personas or [])
                ]
                if analysis_result.enhanced_personas
                else []
            ),
            "insights": [
                insight.dict() if hasattr(insight, "dict") else insight
                for insight in (analysis_result.insights or [])
            ],
            "enhanced_insights": (
                [
                    insight.dict() if hasattr(insight, "dict") else insight
                    for insight in (analysis_result.enhanced_insights or [])
                ]
                if analysis_result.enhanced_insights
                else []
            ),
            "stakeholder_intelligence": (
                analysis_result.stakeholder_intelligence.dict()
                if analysis_result.stakeholder_intelligence
                and hasattr(analysis_result.stakeholder_intelligence, "dict")
                else analysis_result.stakeholder_intelligence
            ),
            "error": analysis_result.error,
        }

        db = SessionLocal()
        try:
            db_analysis = AnalysisResult(
                data_id=None,
                analysis_date=datetime.utcnow(),
                completed_at=datetime.utcnow(),
                results=json.dumps(analysis_data),
                llm_provider="gemini",
                llm_model="gemini-2.0-flash-exp",
                status=analysis_result.status,
                error_message=analysis_result.error,
            )

            db.add(db_analysis)
            db.commit()
            db.refresh(db_analysis)

            # Return the numeric primary key as the public analysis identifier
            analysis_result.id = str(db_analysis.result_id)
            logger.info(
                "Saved analysis for simulation %s as AnalysisResult %s",
                simulation_id,
                db_analysis.result_id,
            )
        finally:
            db.close()
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error(
            "Database save failed for analysis of simulation %s: %s",
            simulation_id,
            exc,
        )

    return analysis_result


async def _load_analysis(analysis_id: str) -> Dict[str, Any]:
    """Load analysis result and associated simulation_id from the database.

    Returns a dict ``{"analysis": DetailedAnalysisResult, "simulation_id": str}``.
    """

    try:
        db = SessionLocal()
        try:
            db_analysis = (
                db.query(AnalysisResult)
                .filter(AnalysisResult.result_id == int(analysis_id))
                .first()
            )
            if not db_analysis:
                raise HTTPException(
                    status_code=404,
                    detail=f"Analysis {analysis_id} not found",
                )

            raw = db_analysis.results or "{}"
            analysis_data = json.loads(raw)

            simulation_id = analysis_data.get("simulation_id")

            detailed = DetailedAnalysisResult(
                id=str(analysis_id),
                status=db_analysis.status,
                createdAt=analysis_data.get(
                    "created_at",
                    db_analysis.analysis_date.isoformat()
                    if db_analysis.analysis_date
                    else datetime.utcnow().isoformat(),
                ),
                fileName=analysis_data.get("file_name", "simulation_analysis.txt"),
                fileSize=analysis_data.get("file_size", len(raw.encode("utf-8"))),
                themes=analysis_data.get("themes", []),
                enhanced_themes=analysis_data.get("enhanced_themes", []),
                patterns=analysis_data.get("patterns", []),
                enhanced_patterns=analysis_data.get("enhanced_patterns", []),
                sentimentOverview=analysis_data.get("sentiment_overview"),
                sentiment=analysis_data.get("sentiment", []),
                personas=analysis_data.get("personas", []),
                enhanced_personas=analysis_data.get("enhanced_personas", []),
                insights=analysis_data.get("insights", []),
                enhanced_insights=analysis_data.get("enhanced_insights", []),
                stakeholder_intelligence=analysis_data.get("stakeholder_intelligence"),
                error=analysis_data.get("error") or db_analysis.error_message,
            )

            return {"analysis": detailed, "simulation_id": simulation_id}
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error(
            "Failed to load analysis %s from database: %s", analysis_id, exc
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load analysis {analysis_id} from database",
        )



# Reuse the same orchestrator configuration as the Simulation Bridge router.
orchestrator = SimulationOrchestrator(use_parallel=True, max_concurrent=12)
analysis_agent = ConversationalAnalysisAgent(orchestrator.model)


class QuestionnaireRequest(BaseModel):
    """Generate stakeholder-based questionnaire from business context."""

    business_context: BusinessContext


class QuestionnaireResponse(BaseModel):
    """Structured questionnaire compatible with SimulationRequest."""

    business_context: BusinessContext
    questions_data: QuestionsData
    metadata: Dict[str, Any] = {}


class PersonaDatasetExportRequest(BaseModel):
    """Request to export a production-ready persona dataset."""

    analysis_id: Optional[str] = None
    include_visual_assets: bool = True


class AxPersonaDataset(BaseModel):
    """Backend view of the dataset consumed by axpersona.com scopes UI."""

    scope_id: str
    scope_name: str
    description: str
    personas: List[Dict[str, Any]]
    interviews: List[Dict[str, Any]]
    analysis: DetailedAnalysisResult
    quality: Dict[str, Any]
    # Optional: raw simulation people (SimulatedPerson) for richer demographic display
    simulation_people: List[Dict[str, Any]] = Field(default_factory=list)


class PipelineStageTrace(BaseModel):
    """Execution trace entry for a single AxPersona pipeline stage.

    Each stage records timestamps, duration, and key IDs/counts so that
    integrators can debug the pipeline end-to-end from a single response.
    """

    stage_name: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: float
    outputs: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class PipelineExecutionResult(BaseModel):
    """Envelope returned by the end-to-end AxPersona pipeline.

    The result always includes a stage-by-stage execution trace; the dataset
    is only populated when the final export stage succeeds.
    """

    dataset: Optional[AxPersonaDataset] = None
    execution_trace: List[PipelineStageTrace]
    total_duration_seconds: float


class PipelineJobStatus(BaseModel):
    """Background job status for end-to-end AxPersona pipeline runs.

    This model is returned both when a job is created and when its status is
    queried via the job status endpoint.
    """

    job_id: str
    status: str  # pending, running, completed, failed
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    result: Optional[PipelineExecutionResult] = None


class PipelineRunSummary(BaseModel):
    """Summary of a pipeline run for list views.

    This lightweight model is used when listing multiple pipeline runs,
    excluding the full execution trace and dataset to reduce response size.
    """

    job_id: str
    status: str  # pending, running, completed, failed
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None

    # Business context summary
    business_idea: Optional[str] = None
    target_customer: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None

    # Quick metrics
    questionnaire_stakeholder_count: Optional[int] = None
    persona_count: Optional[int] = None
    interview_count: Optional[int] = None

    error: Optional[str] = None


class PipelineRunDetail(BaseModel):
    """Detailed pipeline run information including full execution trace and results.

    This model is used when retrieving a specific pipeline run by ID.
    """

    job_id: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None

    # Full business context
    business_context: Dict[str, Any]

    # Execution details
    execution_trace: List[PipelineStageTrace] = Field(default_factory=list)
    total_duration_seconds: Optional[float] = None

    # Results
    dataset: Optional[AxPersonaDataset] = None

    # Metadata
    questionnaire_stakeholder_count: Optional[int] = None
    simulation_id: Optional[str] = None
    analysis_id: Optional[str] = None
    persona_count: Optional[int] = None
    interview_count: Optional[int] = None

    error: Optional[str] = None


class PipelineRunListResponse(BaseModel):
    """Response for listing pipeline runs with pagination."""

    runs: List[PipelineRunSummary]
    total: int
    limit: int
    offset: int


# In-memory job registry for OSS / local setups. For production, this could be
# backed by a database or external job queue (e.g. Celery, Redis, etc.).
_pipeline_jobs: Dict[str, PipelineJobStatus] = {}


@router.post("/questionnaires", response_model=QuestionnaireResponse)
async def generate_questionnaire(request: QuestionnaireRequest) -> QuestionnaireResponse:
    """Generate a stakeholder-based questionnaire from business context.

    **Input**
    - ``QuestionnaireRequest`` containing a ``BusinessContext`` with
      ``business_idea``, ``target_customer`` and ``problem``.

    **Processing**
    - Calls :meth:`ConversationRoutineService._generate_stakeholder_questions_tool`,
      which returns the V3 questionnaire format used by the AxWise Flow
      frontend (``primaryStakeholders`` / ``secondaryStakeholders``).
    - Maps each stakeholder into the Simulation Bridge ``Stakeholder`` model,
      flattening the per-phase question buckets into a single list of
      questions while keeping stakeholder identity.
    - Wraps the result in ``QuestionsData`` so it can be used directly as
      ``SimulationRequest.questions_data``.

    **Output**
    - ``QuestionnaireResponse`` with the original ``business_context`` and
      a fully-populated ``questions_data`` structure.

    Example request payload::

        {
          "business_context": {
            "business_idea": "AI-powered research automation for B2B SaaS",
            "target_customer": "Product teams in EU SaaS companies",
            "problem": "Manual stakeholder research is too slow",
            "industry": "SaaS",
            "location": "Berlin"
          }
        }

    Example response payload (truncated)::

        {
          "business_context": { ... },
          "questions_data": {
            "stakeholders": {
              "primary": [
                {
                  "id": "primary_0",
                  "name": "Founding PM",
                  "description": "Owns discovery and roadmap decisions",
                  "questions": ["How do you discover problems today?", ...]
                }
              ],
              "secondary": [ ... ]
            },
            "timeEstimate": {"totalQuestions": 24, "estimatedMinutes": 60}
          },
          "metadata": {
            "format_version": "v3",
            "source": "conversation_routines._generate_stakeholder_questions_tool"
          }
        }
    """

    ctx = request.business_context

    # Delegate to ConversationRoutineService for actual question generation.
    result = await conversation_service._generate_stakeholder_questions_tool(
        business_idea=ctx.business_idea,
        target_customer=ctx.target_customer,
        problem=ctx.problem,
        location=ctx.location,
    )

    if not isinstance(result, dict):
        raise HTTPException(
            status_code=502,
            detail="Questionnaire generator returned an unexpected payload",
        )

    primary_raw = result.get("primaryStakeholders") or []
    secondary_raw = result.get("secondaryStakeholders") or []

    def _to_stakeholders(raw_list: List[Dict[str, Any]], bucket: str) -> List[Stakeholder]:
        stakeholders: List[Stakeholder] = []
        for idx, item in enumerate(raw_list):
            questions_by_phase = item.get("questions") or {}
            questions: List[str] = []
            for phase_key in ["problemDiscovery", "solutionValidation", "followUp"]:
                phase_q = questions_by_phase.get(phase_key) or []
                questions.extend([q for q in phase_q if isinstance(q, str) and q.strip()])

            stakeholders.append(
                Stakeholder(
                    id=f"{bucket}_{item.get('index', idx)}",
                    name=item.get("name", "Unknown stakeholder"),
                    description=item.get("description", ""),
                    questions=questions,
                )
            )
        return stakeholders

    stakeholders: Dict[str, List[Stakeholder]] = {
        "primary": _to_stakeholders(primary_raw, "primary"),
        "secondary": _to_stakeholders(secondary_raw, "secondary"),
    }

    questions_data = QuestionsData(
        stakeholders=stakeholders,
        timeEstimate=result.get("timeEstimate"),
    )

    return QuestionnaireResponse(
        business_context=request.business_context,
        questions_data=questions_data,
        metadata={
            "format_version": "v3",
            "source": "conversation_routines._generate_stakeholder_questions_tool",
        },
    )


@router.post("/simulations", response_model=SimulationResponse)
async def run_simulation(request: SimulationRequest) -> SimulationResponse:
    """Run synthetic interview simulation using SimulationOrchestrator."""

    return await orchestrator.run_simulation(request)


@router.post("/analysis", response_model=DetailedAnalysisResult)
async def run_analysis(simulation_id: str) -> DetailedAnalysisResult:
    """Run conversational analysis for a completed simulation.

    **Input**
    - ``simulation_id``: identifier returned by :func:`run_simulation`.

    **Processing**
    - Resolves the simulation via :func:`_resolve_simulation`, first checking
      the in-memory ``SimulationOrchestrator`` cache and then falling back to
      the ``SimulationRepository`` + ``UnitOfWork`` persistence layer.
    - Builds a single analysis string with :func:`_build_simulation_text`,
      preserving interview order and full Q/A content for evidence
      traceability.
    - Calls ``ConversationalAnalysisAgent.process_simulation_data`` to produce
      a :class:`DetailedAnalysisResult` that uses the golden
      ``EvidenceItem`` / ``AttributedField`` persona schema.
    - Persists the analysis via :func:`_save_analysis_result`, which stores a
      JSON envelope in ``AnalysisResult.results`` and returns a stable
      numeric ``analysis_id`` via ``result.id``.

    **Output**
    - ``DetailedAnalysisResult`` with
      - ``id`` set to the numeric ``AnalysisResult.result_id``
      - structured themes, patterns, personas, insights and
        ``stakeholder_intelligence`` compatible with downstream exports.

    Example request::

        POST /api/axpersona/v1/analysis?simulation_id=sim_123

    Example response (truncated)::

        {
          "id": "42",
          "status": "completed",
          "personas": [ ... ],
          "stakeholder_intelligence": { ... }
        }
    """

    # 1) Resolve simulation and build full analysis text
    simulation = await _resolve_simulation(simulation_id)
    simulation_text = _build_simulation_text(simulation)

    if not simulation_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Simulation contains no interview content to analyse",
        )

    # 2) Run conversational analysis using the shared agent
    result = await analysis_agent.process_simulation_data(
        simulation_text=simulation_text,
        simulation_id=simulation_id,
        file_name="simulation_analysis.txt",
    )

    if result.error:
        # Propagate the analysis error but still include the structured payload
        raise HTTPException(
            status_code=502,
            detail=f"Analysis failed: {result.error}",
        )

    # 3) Persist analysis and expose numeric analysis_id to callers
    result = await _save_analysis_result(result, simulation_id=simulation_id)

    return result


@router.post("/exports/persona-dataset", response_model=AxPersonaDataset)
async def export_persona_dataset(
    request: PersonaDatasetExportRequest,
) -> AxPersonaDataset:
    """Export a production-ready persona dataset for axpersona.com.

    **Input**
    - ``PersonaDatasetExportRequest`` with
      - ``analysis_id``: identifier returned by :func:`run_analysis`
      - ``include_visual_assets``: currently ignored; reserved for future
        avatar / food imagery hooks.

    **Processing**
    - Loads the :class:`DetailedAnalysisResult` and originating
      ``simulation_id`` via :func:`_load_analysis`.
    - Resolves the simulation via :func:`_resolve_simulation` to recover the
      original synthetic interviews, preserving end-to-end traceability from
      persona traits back to interview quotes.
    - Chooses personas from ``enhanced_personas`` when available, falling
      back to ``personas`` otherwise.
    - For each persona in the golden ``AttributedField`` schema, uses
      ``from_ssot_to_frontend`` to obtain a normalised frontend view and then
      wraps it in :class:`ProductionPersona` / :class:`PersonaTrait` so that
      evidence (``EvidenceItem``) arrays remain attached to trait values.
    - Calls :meth:`ProductionPersona.to_frontend_dict` to obtain the final
      persona dictionaries consumed by the AxPersona scopes UI.
    - Computes basic quality metrics (interview count, stakeholder coverage,
      average persona confidence).

    **Output**
    - ``AxPersonaDataset`` containing:
      - ``scope_id``: randomly generated UUID
      - ``scope_name`` / ``description``: human-readable metadata
      - ``personas``: list of frontend persona dicts
      - ``interviews``: original simulated interviews
      - ``analysis``: full :class:`DetailedAnalysisResult`
      - ``quality``: simple metrics dictionary.

    Notes on visual assets
    ----------------------
    Avatar and food imagery generation is intentionally *not* performed here.
    When implemented, those hooks must respect the Perpetual Personas
    constraints: strictly photorealistic, no overlaid text/watermarks, and
    generated in a separate component that enriches ``persona_metadata``.
    """

    if not request.analysis_id:
        raise HTTPException(
            status_code=400,
            detail="analysis_id is required to export a persona dataset",
        )

    loaded = await _load_analysis(request.analysis_id)
    analysis: DetailedAnalysisResult = loaded["analysis"]
    simulation_id: Optional[str] = loaded.get("simulation_id")

    # Recover the originating simulation to include raw interviews and people
    interviews: List[Dict[str, Any]] = []
    simulation_people: List[Dict[str, Any]] = []
    if simulation_id:
        try:
            simulation = await _resolve_simulation(simulation_id)
            interviews = [
                i if isinstance(i, dict) else i.model_dump()  # type: ignore[union-attr]
                for i in (simulation.interviews or [])
            ]
            simulation_people = [
                p if isinstance(p, dict) else p.model_dump()  # type: ignore[union-attr]
                for p in (simulation.people or [])
            ]
        except HTTPException:
            # If simulation is missing we still export personas + analysis
            logger.warning(
                "Simulation %s referenced by analysis %s could not be loaded",
                simulation_id,
                analysis.id,
            )

    # Choose the best available personas from the analysis result
    persona_sources = (
        analysis.enhanced_personas
        if analysis.enhanced_personas
        else (analysis.personas or [])
    )

    def _to_persona_trait(frontend_trait: Optional[Dict[str, Any]]) -> PersonaTrait:
        if not isinstance(frontend_trait, dict):
            return PersonaTrait(value="", confidence=0.7, evidence=[])
        return PersonaTrait(
            value=(frontend_trait.get("value") or "").strip(),
            confidence=float(frontend_trait.get("confidence", 0.7)),
            evidence=frontend_trait.get("evidence") or [],
        )

    production_personas: List[ProductionPersona] = []
    for persona in persona_sources:
        # persona may already be a Pydantic model or a plain dict
        if hasattr(persona, "model_dump"):
            persona_dict = persona.model_dump()
        else:
            persona_dict = persona  # type: ignore[assignment]

        ssot_frontend = from_ssot_to_frontend(persona_dict)

        demographics_trait = _to_persona_trait(ssot_frontend.get("demographics"))
        goals_trait = _to_persona_trait(
            ssot_frontend.get("goals_and_motivations")
        )
        challenges_trait = _to_persona_trait(
            ssot_frontend.get("challenges_and_frustrations")
        )
        quotes_trait = _to_persona_trait(ssot_frontend.get("key_quotes"))

        overall_confidence = float(
            persona_dict.get("overall_confidence")
            or persona_dict.get("confidence", 0.7)
        )

        production_personas.append(
            ProductionPersona(
                name=ssot_frontend.get("name", "Unnamed Persona"),
                description=ssot_frontend.get("description")
                or ssot_frontend.get("name", ""),
                archetype=ssot_frontend.get("archetype", ""),
                demographics=demographics_trait,
                goals_and_motivations=goals_trait,
                challenges_and_frustrations=challenges_trait,
                key_quotes=quotes_trait,
                overall_confidence=overall_confidence,
                patterns=persona_dict.get("patterns", []),
                persona_metadata={
                    "source": "axpersona_pipeline",
                    "analysis_id": analysis.id,
                    "simulation_id": simulation_id,
                },
            )
        )

    personas_frontend = [p.to_frontend_dict() for p in production_personas]

    # Basic dataset-level quality metrics
    interview_count = len(interviews)
    stakeholder_types = {
        i.get("stakeholder_type") for i in interviews if isinstance(i, dict)
    }
    stakeholder_coverage = len({s for s in stakeholder_types if s})
    avg_persona_quality = (
        sum(p.overall_confidence for p in production_personas) / len(production_personas)
        if production_personas
        else 0.0
    )

    scope_id = str(uuid.uuid4())
    scope_name = f"AxPersona Scope {analysis.id}"
    description = (
        f"Persona dataset generated from analysis {analysis.id}"
        + (f" (simulation {simulation_id})" if simulation_id else "")
    )

    return AxPersonaDataset(
        scope_id=scope_id,
        scope_name=scope_name,
        description=description,
        personas=personas_frontend,
        interviews=interviews,
        analysis=analysis,
        quality={
            "interview_count": interview_count,
            "stakeholder_coverage": stakeholder_coverage,
            "avg_persona_quality": avg_persona_quality,
        },
        simulation_people=simulation_people,
    )


async def _execute_pipeline(
    context: BusinessContext, pipeline_id: Optional[str] = None
) -> PipelineExecutionResult:
    """Run the complete AxPersona pipeline end-to-end.

    This endpoint orchestrates all AxPersona building blocks into a single
    call suitable for axpersona.com and other integrators. It executes the
    following stages sequentially:

    1. **questionnaire_generation** – calls :func:`generate_questionnaire` with
       the provided :class:`BusinessContext` to produce a structured
       :class:`QuestionsData` payload.
    2. **simulation** – calls :func:`run_simulation` with the generated
       questionnaire to produce synthetic personas and interview transcripts.
    3. **analysis** – calls :func:`run_analysis` with the resulting
       ``simulation_id`` to generate a :class:`DetailedAnalysisResult` in the
       golden evidence-linked persona schema.
    4. **persona_dataset_export** – calls :func:`export_persona_dataset` with
       the ``analysis_id`` to obtain an :class:`AxPersonaDataset` ready to be
       consumed by axpersona.com scopes.

    For each stage, the pipeline records a :class:`PipelineStageTrace` entry
    with timestamps, duration, key IDs/counts, and any error message. This
    makes the pipeline transparent and debuggable: clients can see exactly
    what happened at each step from a single response.

    Example request payload::

        POST /api/axpersona/v1/pipeline/run-async
        {
          "business_idea": "AI-powered research automation for B2B SaaS",
          "target_customer": "Product teams in EU SaaS companies",
          "problem": "Manual stakeholder research is too slow",
          "industry": "SaaS",
          "location": "Berlin"
        }

    Example response payload (truncated)::

        {
          "status": "completed",
          "total_duration_seconds": 123.4,
          "execution_trace": [
            {
              "stage_name": "questionnaire_generation",
              "status": "completed",
              "duration_seconds": 4.2,
              "outputs": {
                "primary_stakeholder_count": 3,
                "total_question_count": 42
              }
            },
            {
              "stage_name": "simulation",
              "status": "completed",
              "outputs": {
                "simulation_id": "sim_123",
                "total_interviews": 15
              }
            },
            ...
          ],
          "dataset": {
            "scope_id": "scope_abc123",
            "scope_name": "AxPersona Scope 42",
            "personas": [ ... ],
            "quality": { "interview_count": 15, ... }
          }
        }

    Status codes
    ------------
    - ``200 OK`` when all stages complete successfully (``status=completed``).
    - ``207 Multi-Status`` when at least one stage completes but a later stage
      fails or is skipped (``status=partial``).
    - ``500 Internal Server Error`` only when the pipeline cannot start at
      all (for example, invalid configuration before stage 1 begins).
    """

    pipeline_id = pipeline_id or str(uuid.uuid4())
    logger.info(
        "[AxPersona Pipeline %s] run_pipeline_async entered",
        pipeline_id,
    )
    pipeline_started_at = datetime.utcnow()
    execution_trace: List[PipelineStageTrace] = []

    questionnaire: Optional[QuestionnaireResponse] = None
    simulation: Optional[SimulationResponse] = None
    analysis: Optional[DetailedAnalysisResult] = None
    dataset: Optional[AxPersonaDataset] = None

    def _record_stage(
        stage_name: str,
        started_at: datetime,
        completed_at: datetime,
        status: str,
        outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        execution_trace.append(
            PipelineStageTrace(
                stage_name=stage_name,
                status=status,
                started_at=started_at.isoformat(),
                completed_at=completed_at.isoformat(),
                duration_seconds=(completed_at - started_at).total_seconds(),
                outputs=outputs or {},
                error=error,
            )
        )

    # --- Stage 1: Questionnaire generation ---------------------------------
    stage_name = "questionnaire_generation"
    stage_started_at = datetime.utcnow()
    logger.info(
        "[AxPersona Pipeline %s] Stage %s started", pipeline_id, stage_name
    )

    stage_status = "completed"
    stage_error: Optional[str] = None
    stage_outputs: Dict[str, Any] = {}

    try:
        questionnaire_request = QuestionnaireRequest(business_context=context)
        questionnaire = await generate_questionnaire(questionnaire_request)

        primary = questionnaire.questions_data.stakeholders.get("primary", [])
        secondary = questionnaire.questions_data.stakeholders.get("secondary", [])
        total_questions = sum(len(s.questions) for s in (primary + secondary))

        stage_outputs = {
            "primary_stakeholder_count": len(primary),
            "secondary_stakeholder_count": len(secondary),
            "total_stakeholder_count": len(primary) + len(secondary),
            "total_question_count": total_questions,
        }
    except Exception as exc:  # pragma: no cover - defensive logging
        stage_status = "failed"
        stage_error = str(exc)
        logger.exception(
            "[AxPersona Pipeline %s] Stage %s failed: %s",
            pipeline_id,
            stage_name,
            exc,
        )

    stage_completed_at = datetime.utcnow()
    _record_stage(
        stage_name=stage_name,
        started_at=stage_started_at,
        completed_at=stage_completed_at,
        status=stage_status,
        outputs=stage_outputs,
        error=stage_error,
    )

    # --- Stage 2: Simulation ------------------------------------------------
    stage_name = "simulation"
    stage_started_at = datetime.utcnow()
    logger.info(
        "[AxPersona Pipeline %s] Stage %s started", pipeline_id, stage_name
    )

    stage_status = "completed"
    stage_error = None
    stage_outputs = {}

    if questionnaire and execution_trace[-1].status == "completed":
        try:
            # Use SimulationConfig.from_env() to respect MAX_PERSONAS and other
            # environment variables; callers can override by calling /simulations
            # directly if they need fine-grained control.
            config = SimulationConfig.from_env()
            sim_request = SimulationRequest(
                questions_data=questionnaire.questions_data,
                business_context=questionnaire.business_context,
                config=config,
            )

            simulation = await run_simulation(sim_request)

            meta = simulation.metadata or {}
            total_personas = meta.get("total_personas") or len(
                simulation.personas or []
            )
            total_interviews = meta.get("total_interviews") or len(
                simulation.interviews or []
            )

            stage_outputs = {
                "simulation_id": simulation.simulation_id,
                "total_personas": total_personas,
                "total_interviews": total_interviews,
            }
        except Exception as exc:  # pragma: no cover - defensive logging
            stage_status = "failed"
            stage_error = str(exc)
            logger.exception(
                "[AxPersona Pipeline %s] Stage %s failed: %s",
                pipeline_id,
                stage_name,
                exc,
            )
    else:
        stage_status = "skipped"
        stage_error = "Skipped because questionnaire_generation did not complete."

    stage_completed_at = datetime.utcnow()
    _record_stage(
        stage_name=stage_name,
        started_at=stage_started_at,
        completed_at=stage_completed_at,
        status=stage_status,
        outputs=stage_outputs,
        error=stage_error,
    )

    # --- Stage 3: Analysis --------------------------------------------------
    stage_name = "analysis"
    stage_started_at = datetime.utcnow()
    logger.info(
        "[AxPersona Pipeline %s] Stage %s started", pipeline_id, stage_name
    )

    stage_status = "completed"
    stage_error = None
    stage_outputs = {}

    if simulation and execution_trace[-1].status == "completed":
        try:
            analysis = await run_analysis(simulation_id=simulation.simulation_id)

            persona_count = len(analysis.personas or [])
            theme_count = len(analysis.themes or [])

            stage_outputs = {
                "analysis_id": analysis.id,
                "persona_count": persona_count,
                "theme_count": theme_count,
            }
        except Exception as exc:  # pragma: no cover - defensive logging
            stage_status = "failed"
            stage_error = str(exc)
            logger.exception(
                "[AxPersona Pipeline %s] Stage %s failed: %s",
                pipeline_id,
                stage_name,
                exc,
            )
    else:
        stage_status = "skipped"
        stage_error = "Skipped because simulation did not complete."

    stage_completed_at = datetime.utcnow()
    _record_stage(
        stage_name=stage_name,
        started_at=stage_started_at,
        completed_at=stage_completed_at,
        status=stage_status,
        outputs=stage_outputs,
        error=stage_error,
    )

    # --- Stage 4: Persona dataset export -----------------------------------
    stage_name = "persona_dataset_export"
    stage_started_at = datetime.utcnow()
    logger.info(
        "[AxPersona Pipeline %s] Stage %s started", pipeline_id, stage_name
    )

    stage_status = "completed"
    stage_error = None
    stage_outputs = {}

    if analysis and execution_trace[-1].status == "completed":
        try:
            export_request = PersonaDatasetExportRequest(analysis_id=analysis.id)
            dataset = await export_persona_dataset(export_request)

            stage_outputs = {
                "scope_id": dataset.scope_id,
                "persona_count": len(dataset.personas),
                "interview_count": len(dataset.interviews),
                "quality": dataset.quality,
            }
        except Exception as exc:  # pragma: no cover - defensive logging
            stage_status = "failed"
            stage_error = str(exc)
            logger.exception(
                "[AxPersona Pipeline %s] Stage %s failed: %s",
                pipeline_id,
                stage_name,
                exc,
            )
    else:
        stage_status = "skipped"
        stage_error = "Skipped because analysis did not complete."

    stage_completed_at = datetime.utcnow()
    _record_stage(
        stage_name=stage_name,
        started_at=stage_started_at,
        completed_at=stage_completed_at,
        status=stage_status,
        outputs=stage_outputs,
        error=stage_error,
    )

    # --- Final envelope -----------------------------------------------------
    total_duration = (datetime.utcnow() - pipeline_started_at).total_seconds()

    any_completed = any(stage.status == "completed" for stage in execution_trace)
    all_completed = all(stage.status == "completed" for stage in execution_trace)

    if all_completed and dataset is not None:
        overall_status = "completed"
    elif any_completed:
        overall_status = "partial"
    else:
        # If we got here with no completed stages, treat as a fatal error.
        overall_status = "failed"

    result = PipelineExecutionResult(
        dataset=dataset,
        execution_trace=execution_trace,
        total_duration_seconds=total_duration,
        status=overall_status,
    )

    logger.info(
        "[AxPersona Pipeline %s] completed with status=%s in %.2fs",
        pipeline_id,
        overall_status,
        total_duration,
    )

    return result




@router.post("/pipeline/run-async", response_model=PipelineJobStatus)
async def create_pipeline_job(context: BusinessContext) -> PipelineJobStatus:
    """Create a background job for running the full AxPersona pipeline.

    This endpoint replaces the previous long-running synchronous pipeline API.
    It returns immediately with a ``job_id`` and basic status information while
    the actual pipeline execution runs in the background.

    The pipeline run is persisted to the database for historical tracking and
    can be retrieved later via the /pipeline/runs endpoints.
    """

    job_id = str(uuid.uuid4())
    created_at = datetime.utcnow()

    # Persist pipeline run to database
    async with UnitOfWork(SessionLocal) as uow:
        repo = PipelineRunRepository(uow.session)
        await repo.create_pipeline_run(
            job_id=job_id,
            business_context=context.model_dump() if hasattr(context, "model_dump") else context.dict(),
            user_id=None,  # TODO: Extract from auth context when available
        )
        await uow.commit()

    job = PipelineJobStatus(
        job_id=job_id,
        status="pending",
        created_at=created_at.isoformat(),
    )
    _pipeline_jobs[job_id] = job

    async def run_job() -> None:
        logger.info("[AxPersona Pipeline Job %s] started", job_id)
        job.status = "running"
        started_at = datetime.utcnow()
        job.started_at = started_at.isoformat()

        # Update status in database
        async with UnitOfWork(SessionLocal) as uow:
            repo = PipelineRunRepository(uow.session)
            await repo.update_pipeline_run_status(
                job_id=job_id,
                status="running",
                started_at=started_at,
            )
            await uow.commit()

        try:
            result = await _execute_pipeline(context=context, pipeline_id=job_id)
            job.result = result
            job.status = "completed"
            completed_at = datetime.utcnow()
            job.completed_at = completed_at.isoformat()

            # Extract metadata from result for quick access
            questionnaire_stakeholder_count = None
            simulation_id = None
            analysis_id = None
            persona_count = None
            interview_count = None

            for stage in result.execution_trace:
                if stage.stage_name == "questionnaire_generation" and stage.outputs:
                    questionnaire_stakeholder_count = stage.outputs.get("total_stakeholder_count")
                elif stage.stage_name == "simulation" and stage.outputs:
                    simulation_id = stage.outputs.get("simulation_id")
                elif stage.stage_name == "analysis" and stage.outputs:
                    analysis_id = stage.outputs.get("analysis_id")
                    persona_count = stage.outputs.get("persona_count")
                elif stage.stage_name == "persona_dataset_export" and stage.outputs:
                    interview_count = stage.outputs.get("interview_count")
                    if not persona_count:
                        persona_count = stage.outputs.get("persona_count")

            # Persist results to database
            async with UnitOfWork(SessionLocal) as uow:
                repo = PipelineRunRepository(uow.session)
                await repo.update_pipeline_run_status(
                    job_id=job_id,
                    status="completed",
                    completed_at=completed_at,
                )
                await repo.update_pipeline_run_results(
                    job_id=job_id,
                    execution_trace=[stage.model_dump() if hasattr(stage, "model_dump") else stage.dict() for stage in result.execution_trace],
                    total_duration_seconds=result.total_duration_seconds,
                    dataset=result.dataset.model_dump() if result.dataset and hasattr(result.dataset, "model_dump") else (result.dataset.dict() if result.dataset else None),
                    questionnaire_stakeholder_count=questionnaire_stakeholder_count,
                    simulation_id=simulation_id,
                    analysis_id=analysis_id,
                    persona_count=persona_count,
                    interview_count=interview_count,
                )
                await uow.commit()

            logger.info(
                "[AxPersona Pipeline Job %s] completed successfully", job_id
            )
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception(
                "[AxPersona Pipeline Job %s] failed: %s", job_id, exc
            )
            job.status = "failed"
            job.error = str(exc)
            completed_at = datetime.utcnow()
            job.completed_at = completed_at.isoformat()

            # Persist failure to database
            async with UnitOfWork(SessionLocal) as uow:
                repo = PipelineRunRepository(uow.session)
                await repo.update_pipeline_run_status(
                    job_id=job_id,
                    status="failed",
                    completed_at=completed_at,
                    error=str(exc),
                )
                await uow.commit()

    # Fire-and-forget background task; in production consider a proper job queue.
    asyncio.create_task(run_job())

    return job


@router.get("/pipeline/jobs/{job_id}", response_model=PipelineJobStatus)
async def get_pipeline_job(job_id: str) -> PipelineJobStatus:
    """Retrieve the status (and result) of a pipeline job.

    Clients should poll this endpoint until ``status`` becomes ``completed`` or
    ``failed``. When completed, the ``result`` field contains the full
    :class:`PipelineExecutionResult`.

    This endpoint first checks the in-memory cache, then falls back to the
    database for historical pipeline runs.
    """

    # Check in-memory cache first
    job = _pipeline_jobs.get(job_id)
    if job:
        return job

    # Fall back to database for historical runs
    async with UnitOfWork(SessionLocal) as uow:
        repo = PipelineRunRepository(uow.session)
        db_run = await repo.get_by_job_id(job_id)

        if not db_run:
            raise HTTPException(status_code=404, detail="Pipeline job not found")

        # Convert database record to PipelineJobStatus
        result = None
        if db_run.status == "completed" and db_run.dataset:
            # Reconstruct PipelineExecutionResult from database
            result = PipelineExecutionResult(
                dataset=db_run.dataset,
                execution_trace=[PipelineStageTrace(**stage) for stage in (db_run.execution_trace or [])],
                total_duration_seconds=db_run.total_duration_seconds or 0.0,
            )

        return PipelineJobStatus(
            job_id=db_run.job_id,
            status=db_run.status,
            created_at=db_run.created_at.isoformat(),
            started_at=db_run.started_at.isoformat() if db_run.started_at else None,
            completed_at=db_run.completed_at.isoformat() if db_run.completed_at else None,
            error=db_run.error,
            result=result,
        )


@router.get("/pipeline/runs", response_model=PipelineRunListResponse)
async def list_pipeline_runs(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> PipelineRunListResponse:
    """List all historical pipeline runs with optional filtering and pagination.

    This endpoint provides access to the complete history of AxPersona pipeline
    executions, enabling:
    - Review of past pipeline runs without re-running them
    - Comparison of results across different runs
    - Monitoring of pipeline success rates and performance

    Args:
        status: Optional status filter (pending, running, completed, failed)
        limit: Maximum number of results to return (default: 50, max: 100)
        offset: Offset for pagination (default: 0)

    Returns:
        PipelineRunListResponse with list of pipeline run summaries and pagination info

    Example:
        GET /api/axpersona/v1/pipeline/runs?status=completed&limit=10&offset=0
    """

    # Enforce maximum limit
    limit = min(limit, 100)

    async with UnitOfWork(SessionLocal) as uow:
        repo = PipelineRunRepository(uow.session)

        # Get pipeline runs
        db_runs = await repo.get_all_pipeline_runs(
            user_id=None,  # TODO: Filter by authenticated user when auth is available
            status=status,
            limit=limit,
            offset=offset,
        )

        # Get total count for pagination
        total = await repo.count_pipeline_runs(
            user_id=None,
            status=status,
        )

        # Convert to summary models
        runs = []
        for db_run in db_runs:
            # Extract business context fields
            bc = db_run.business_context or {}

            runs.append(PipelineRunSummary(
                job_id=db_run.job_id,
                status=db_run.status,
                created_at=db_run.created_at.isoformat(),
                started_at=db_run.started_at.isoformat() if db_run.started_at else None,
                completed_at=db_run.completed_at.isoformat() if db_run.completed_at else None,
                duration_seconds=db_run.duration_seconds,
                business_idea=bc.get("business_idea"),
                target_customer=bc.get("target_customer"),
                industry=bc.get("industry"),
                location=bc.get("location"),
                questionnaire_stakeholder_count=db_run.questionnaire_stakeholder_count,
                persona_count=db_run.persona_count,
                interview_count=db_run.interview_count,
                error=db_run.error,
            ))

        return PipelineRunListResponse(
            runs=runs,
            total=total,
            limit=limit,
            offset=offset,
        )


@router.get("/pipeline/runs/{job_id}", response_model=PipelineRunDetail)
async def get_pipeline_run_detail(job_id: str) -> PipelineRunDetail:
    """Retrieve the full details of a specific pipeline run by its ID.

    This endpoint provides complete access to a pipeline run's configuration,
    execution trace, and results, enabling:
    - Detailed review of pipeline execution steps
    - Access to generated personas and datasets from previous runs
    - Debugging via full execution traces
    - Comparison of different pipeline configurations

    Args:
        job_id: Unique pipeline job identifier

    Returns:
        PipelineRunDetail with full execution trace and results

    Raises:
        HTTPException: 404 if pipeline run not found

    Example:
        GET /api/axpersona/v1/pipeline/runs/502255cd-59ef-40b1-a0bb-68e4a0226fa0
    """

    async with UnitOfWork(SessionLocal) as uow:
        repo = PipelineRunRepository(uow.session)
        db_run = await repo.get_by_job_id(job_id)

        if not db_run:
            raise HTTPException(
                status_code=404,
                detail=f"Pipeline run {job_id} not found"
            )

        # Convert execution trace
        execution_trace = []
        if db_run.execution_trace:
            execution_trace = [
                PipelineStageTrace(**stage) for stage in db_run.execution_trace
            ]

        # Convert dataset
        dataset = None
        if db_run.dataset:
            dataset = AxPersonaDataset(**db_run.dataset)

        return PipelineRunDetail(
            job_id=db_run.job_id,
            status=db_run.status,
            created_at=db_run.created_at.isoformat(),
            started_at=db_run.started_at.isoformat() if db_run.started_at else None,
            completed_at=db_run.completed_at.isoformat() if db_run.completed_at else None,
            duration_seconds=db_run.duration_seconds,
            business_context=db_run.business_context,
            execution_trace=execution_trace,
            total_duration_seconds=db_run.total_duration_seconds,
            dataset=dataset,
            questionnaire_stakeholder_count=db_run.questionnaire_stakeholder_count,
            simulation_id=db_run.simulation_id,
            analysis_id=db_run.analysis_id,
            persona_count=db_run.persona_count,
            interview_count=db_run.interview_count,
            error=db_run.error,
        )
