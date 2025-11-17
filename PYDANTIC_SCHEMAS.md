# 📋 Complete Pydantic Schema Catalog for AxWise Flow

> **Comprehensive reference for all Pydantic data models powering the AxWise Flow system**

This document catalogs all Pydantic schemas organized by purpose, location, and usage context. These schemas ensure type-safe data validation, LLM output structuring, and API contract enforcement throughout the system.

---

## 📑 Table of Contents

1. [Core API Schemas](#core-api-schemas) - Request/response validation
2. [Domain Models](#domain-models) - Golden Schema and persona structures
3. [Simulation Bridge Models](#simulation-bridge-models) - Synthetic interview generation
4. [Analysis Models](#analysis-models) - Theme, pattern, insight extraction
5. [Stakeholder Intelligence](#stakeholder-intelligence) - Multi-stakeholder analysis
6. [Conversation State](#conversation-state) - LangGraph state management
7. [Jira Export](#jira-export) - Jira integration models
8. [PydanticAI Output Types](#pydanticai-output-types) - Typed agent outputs

---

## 1. Core API Schemas

**Location:** `backend/schemas.py`

### 1.1 Request Models

#### `AnalysisRequest`
**Purpose:** Trigger data analysis with LLM provider selection

```python
class AnalysisRequest(BaseModel):
    data_id: int  # ID of uploaded data
    llm_provider: Literal["openai", "gemini"]
    llm_model: Optional[str] = None
    is_free_text: Optional[bool] = False
    industry: Optional[str] = None  # Auto-detected if not provided
```

**Usage:** `POST /api/analyze` endpoint

---

#### `PersonaGenerationRequest`
**Purpose:** Direct text-to-persona generation

```python
class PersonaGenerationRequest(BaseModel):
    text: str  # Raw interview text
    llm_provider: Optional[Literal["openai", "gemini", "enhanced_gemini"]] = "enhanced_gemini"
    llm_model: Optional[str] = "models/gemini-2.5-flash"
    filename: Optional[str] = None
```

**Usage:** Direct persona generation from text without full analysis pipeline

---

### 1.2 Response Models

#### `UploadResponse`
```python
class UploadResponse(BaseModel):
    data_id: int
    message: str
```

#### `AnalysisResponse`
```python
class AnalysisResponse(BaseModel):
    result_id: int
    message: str
```

#### `HealthCheckResponse`
```python
class HealthCheckResponse(BaseModel):
    status: str
    timestamp: datetime
```

---

## 2. Domain Models - Golden Schema

**Location:** `backend/domain/models/persona_schema.py`

### 2.1 Evidence and Attribution

#### `EvidenceItem`
**Purpose:** Structured evidence with traceability to source text

```python
class EvidenceItem(BaseModel):
    quote: str  # Verbatim quote
    start_char: Optional[int] = None  # Character offset in source
    end_char: Optional[int] = None
    speaker: Optional[str] = None  # Speaker identifier
    document_id: Optional[str] = None  # Source document ID
```

**Key Feature:** Enables full provenance tracking from insight back to original interview

---

#### `AttributedField`
**Purpose:** Container for a value with supporting evidence (THE GOLDEN SCHEMA)

```python
class AttributedField(BaseModel):
    value: Optional[str]  # The extracted information
    evidence: List[EvidenceItem] = Field(default_factory=list)

    # Backward compatibility validator
    @field_validator("evidence", mode="before")
    def _coerce_evidence(cls, v):
        # Converts strings/dicts to EvidenceItem objects
```

**Critical:** This is the ONLY model for fields with evidence. Prevents schema corruption.

---

#### `StructuredDemographics`
**Purpose:** Demographics with evidence attribution for each field

```python
class StructuredDemographics(BaseModel):
    experience_level: Optional[AttributedField]
    industry: Optional[AttributedField]
    location: Optional[AttributedField]
    professional_context: Optional[AttributedField]
    roles: Optional[AttributedField]
    age_range: Optional[AttributedField]
    confidence: float
```

**Critical:** Must NOT have top-level 'value' or 'evidence' fields. Each demographic field is an AttributedField.

---

### 2.2 Persona Trait Models

#### `PersonaTrait`
**Purpose:** Basic persona trait with confidence and evidence

```python
class PersonaTrait(BaseModel):
    value: str
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    evidence: List[EvidenceItem] = Field(default_factory=list)
```

**Usage:** Used in `ProductionPersona` and enhanced persona models

---

### 2.3 Stakeholder Intelligence

#### `InfluenceMetrics`
```python
class InfluenceMetrics(BaseModel):
    decision_power: float = Field(default=0.5, ge=0.0, le=1.0)
    technical_influence: float = Field(default=0.5, ge=0.0, le=1.0)
    budget_influence: float = Field(default=0.5, ge=0.0, le=1.0)
```

#### `PersonaRelationship`
```python
class PersonaRelationship(BaseModel):
    target_persona_id: str
    relationship_type: str  # collaborates_with, reports_to, influences, conflicts_with
    strength: float = Field(default=0.5, ge=0.0, le=1.0)
    description: str = ""
```

#### `ConflictIndicator`
```python
class ConflictIndicator(BaseModel):
    topic: str
    severity: float = Field(default=0.5, ge=0.0, le=1.0)
    description: str = ""
    evidence: List[str] = Field(default_factory=list)
```

#### `ConsensusLevel`
```python
class ConsensusLevel(BaseModel):
    theme_or_pattern: str
    agreement_score: float = Field(default=0.5, ge=0.0, le=1.0)
    supporting_evidence: List[str] = Field(default_factory=list)
```

#### `StakeholderIntelligence`
```python
class StakeholderIntelligence(BaseModel):
    stakeholder_type: str = "primary_customer"
    influence_metrics: InfluenceMetrics = Field(default_factory=InfluenceMetrics)
    relationships: List[PersonaRelationship] = Field(default_factory=list)
    conflict_indicators: List[ConflictIndicator] = Field(default_factory=list)
    consensus_levels: List[ConsensusLevel] = Field(default_factory=list)
```

---

### 2.4 Enhanced Persona

#### `EnhancedPersona`
**Purpose:** Combines behavioral insights with stakeholder intelligence

```python
class EnhancedPersona(BaseModel):
    name: str
    description: str
    archetype: Optional[str] = None

    # Enhanced traits
    demographics: Optional[EnhancedPersonaTrait] = None
    goals_and_motivations: Optional[EnhancedPersonaTrait] = None
    challenges_and_frustrations: Optional[EnhancedPersonaTrait] = None

    # Stakeholder intelligence integration
    stakeholder_intelligence: StakeholderIntelligence = Field(default_factory=StakeholderIntelligence)

    # Metadata
    overall_confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    supporting_evidence_summary: List[str] = Field(default_factory=list)
    persona_metadata: Dict[str, Any] = Field(default_factory=dict)
    patterns: List[str] = Field(default_factory=list)
```

**Methods:**
- `get_stakeholder_type() -> str`
- `get_influence_score(metric_type: str = "decision_power") -> float`
- `has_conflicts() -> bool`
- `get_relationships(relationship_type: Optional[str] = None) -> List[PersonaRelationship]`

---

## 3. Production Persona Model

**Location:** `backend/domain/models/production_persona.py`

### `ProductionPersona`
**Purpose:** Production-ready persona model matching frontend expectations exactly

```python
class ProductionPersona(BaseModel):
    # Core identification
    name: str
    description: str
    archetype: str

    # Core design thinking fields using PersonaTrait
    demographics: PersonaTrait
    goals_and_motivations: PersonaTrait
    challenges_and_frustrations: PersonaTrait
    key_quotes: PersonaTrait

    # Optional extended traits
    skills_and_expertise: Optional[PersonaTrait] = None
    workflow_and_environment: Optional[PersonaTrait] = None
    technology_and_tools: Optional[PersonaTrait] = None
    pain_points: Optional[PersonaTrait] = None

    # Metadata
    overall_confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    patterns: List[str] = Field(default_factory=list)
    persona_metadata: Dict[str, Any] = Field(default_factory=dict)
```

**Methods:**
- `to_frontend_dict() -> Dict[str, Any]` - Convert to frontend-compatible format
- `get_quality_score() -> float` - Calculate quality score based on evidence completeness

**Validators:**
- `validate_name` - Ensure non-empty name
- `validate_confidence_threshold` - Minimum confidence of 0.3

---

## 4. Analysis Models

**Location:** `backend/schemas.py`

### 4.1 Theme Analysis

#### `Theme`
**Purpose:** Represents a theme identified in analysis with full evidence traceability

```python
class Theme(BaseModel):
    name: str
    frequency: float = Field(default=0.5, ge=0.0, le=1.0)  # Prevalence score
    sentiment: float = Field(default=0.0, ge=-1.0, le=1.0)  # -1 to 1

    # Supporting evidence
    statements: List[str] = Field(default_factory=list)  # Direct quotes

    # Additional details
    definition: Optional[str] = None  # One-sentence description
    keywords: List[str] = Field(default_factory=list)
    codes: Optional[List[str]] = None  # Associated codes
    reliability: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    process: Optional[Literal["basic", "enhanced"]] = None

    # Enhanced theme fields
    type: Optional[str] = "theme"
    sentiment_distribution: Optional[SentimentDistribution] = None
    hierarchical_codes: Optional[List[HierarchicalCode]] = None
    reliability_metrics: Optional[ReliabilityMetrics] = None
    relationships: Optional[List[ThemeRelationship]] = None

    # Stakeholder attribution
    stakeholder_context: Optional[Dict[str, Any]] = None
    stakeholder_attribution: Optional[Dict[str, Any]] = None
```

**Key Features:**
- Frequency quantification (0.0-1.0) instead of "high/medium/low"
- Direct quotes as supporting evidence
- Stakeholder attribution for multi-stakeholder analysis

---

#### `SentimentDistribution`
```python
class SentimentDistribution(BaseModel):
    positive: float = Field(default=0.33, ge=0.0, le=1.0)
    neutral: float = Field(default=0.34, ge=0.0, le=1.0)
    negative: float = Field(default=0.33, ge=0.0, le=1.0)
```

#### `HierarchicalCode`
```python
class HierarchicalCode(BaseModel):
    code: str
    definition: str
    frequency: float = Field(default=0.5, ge=0.0, le=1.0)
    sub_codes: List["HierarchicalCode"] = Field(default_factory=list)
```

#### `ReliabilityMetrics`
```python
class ReliabilityMetrics(BaseModel):
    cohen_kappa: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    percent_agreement: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    confidence_interval: Optional[List[float]] = None
```

#### `ThemeRelationship`
```python
class ThemeRelationship(BaseModel):
    related_theme: str
    relationship_type: Literal["causal", "correlational", "hierarchical"]
    strength: float = Field(default=0.5, ge=0.0, le=1.0)
    description: str
```

---

### 4.2 Pattern Analysis

#### `Pattern`
**Purpose:** Represents a behavioral pattern with evidence and impact

```python
class Pattern(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    frequency: Optional[float] = Field(None, ge=0.0, le=1.0)
    sentiment: Optional[float] = Field(None, ge=-1.0, le=1.0)
    evidence: Optional[List[str]] = None  # Supporting quotes
    impact: Optional[str] = None  # Consequence description
    suggested_actions: Optional[List[str]] = None

    # Stakeholder attribution
    stakeholder_context: Optional[Dict[str, Any]] = None
    stakeholder_attribution: Optional[Dict[str, Any]] = None
```

**Usage:** Pattern detection in interview analysis

---

### 4.3 Insight Generation

#### `Insight`
**Purpose:** Actionable insight with evidence and recommendations

```python
class Insight(BaseModel):
    topic: str
    observation: str
    evidence: List[str] = Field(default_factory=list)
    implication: Optional[str] = None  # The "so what?"
    recommendation: Optional[str] = None  # Concrete next step
    priority: Optional[Literal["High", "Medium", "Low"]] = None

    # Stakeholder perspectives
    stakeholder_perspectives: Optional[Dict[str, Any]] = None
```

**Key Features:**
- Evidence-backed observations
- Clear implications and recommendations
- Priority scoring for action planning

---

### 4.4 Persona Models (API Schema)

#### `Persona` (in schemas.py)
**Purpose:** Comprehensive persona model for API responses

```python
class Persona(BaseModel):
    # Basic information
    name: str  # Role-based name (e.g., "Data-Driven Product Manager")
    archetype: Optional[str] = None  # General category
    description: str = ""  # 1-3 sentence overview

    # GOLDEN SCHEMA: Use StructuredDemographics
    demographics: Optional[StructuredDemographics] = None

    # GOLDEN SCHEMA: All traits use AttributedField
    goals_and_motivations: Optional[AttributedField] = None
    skills_and_expertise: Optional[AttributedField] = None
    workflow_and_environment: Optional[AttributedField] = None
    challenges_and_frustrations: Optional[AttributedField] = None
    technology_and_tools: Optional[AttributedField] = None
    key_quotes: Optional[AttributedField] = None

    # Legacy fields (also use AttributedField)
    role_context: Optional[AttributedField] = None
    key_responsibilities: Optional[AttributedField] = None
    tools_used: Optional[AttributedField] = None
    collaboration_style: Optional[AttributedField] = None
    analysis_approach: Optional[AttributedField] = None
    pain_points: Optional[AttributedField] = None

    # Overall metadata
    patterns: List[str] = Field(default_factory=list)
    overall_confidence: float = Field(0.7, ge=0, le=1, alias="confidence")
    supporting_evidence_summary: List[str] = Field(default_factory=list, alias="evidence")
    persona_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, alias="metadata")

    # Stakeholder mapping
    stakeholder_mapping: Optional[Dict[str, Any]] = None
```

**Critical:** Uses Golden Schema (AttributedField + StructuredDemographics) to prevent JSON corruption

---

## 5. Simulation Bridge Models

**Location:** `backend/api/research/simulation_bridge/models.py`

### 5.1 Simulated Person

#### `SimulatedPerson`
**Purpose:** Individual person for synthetic interviews (not generic personas)

```python
class SimulatedPerson(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    age: int
    background: str
    motivations: List[str]
    pain_points: List[str]
    communication_style: str
    stakeholder_type: str
    demographic_details: DemographicDetails
```

**Key Feature:** Strict validation with `extra="forbid"` to prevent unexpected fields

---

#### `DemographicDetails`
```python
class DemographicDetails(BaseModel):
    occupation: Optional[str] = None
    industry: Optional[str] = None
    experience_level: Optional[str] = None
    location: Optional[str] = None
    company_size: Optional[str] = None
```

---

### 5.2 Interview Simulation

#### `InterviewResponse`
**Purpose:** Single Q&A with sentiment and insights

```python
class InterviewResponse(BaseModel):
    question: str
    answer: str
    sentiment: Optional[str] = None
    key_insights: List[str] = Field(default_factory=list)
```

#### `SimulatedInterview`
**Purpose:** Complete interview with person

```python
class SimulatedInterview(BaseModel):
    person: SimulatedPerson
    responses: List[InterviewResponse]
    interview_metadata: Dict[str, Any] = Field(default_factory=dict)
```

---

### 5.3 Simulation Configuration

#### `SimulationConfig`
**Purpose:** Configuration for synthetic interview generation

```python
class SimulationConfig(BaseModel):
    num_interviews: int = Field(default=5, ge=1, le=50)
    interview_depth: Literal["shallow", "medium", "deep"] = "medium"
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    response_style: Literal["concise", "detailed", "conversational"] = "conversational"
    include_sentiment: bool = True
    stakeholder_distribution: Optional[Dict[str, int]] = None
```

---

#### `BusinessContext`
**Purpose:** Business context for simulation

```python
class BusinessContext(BaseModel):
    business_idea: str
    target_customer: str
    problem_statement: Optional[str] = None
    industry: Optional[str] = None
    additional_context: Optional[str] = None
```

---

### 5.4 Simulation Request/Response

#### `SimulationRequest`
```python
class SimulationRequest(BaseModel):
    business_context: BusinessContext
    config: SimulationConfig = Field(default_factory=SimulationConfig)
```

#### `SimulationResponse`
```python
class SimulationResponse(BaseModel):
    simulation_id: str
    interviews: List[SimulatedInterview]
    metadata: Dict[str, Any]
    generation_time_seconds: float
```

#### `SimulationProgress`
```python
class SimulationProgress(BaseModel):
    current_interview: int
    total_interviews: int
    status: Literal["generating", "completed", "failed"]
    message: Optional[str] = None
```

---

## 6. Stakeholder Intelligence Models

**Location:** `backend/schemas.py` and `backend/models/stakeholder_models.py`

### 6.1 Detected Stakeholder

#### `DetectedStakeholder`
**Purpose:** Individual stakeholder detected in analysis

```python
class DetectedStakeholder(BaseModel):
    stakeholder_id: str  # Unique identifier
    stakeholder_type: Literal["primary_customer", "secondary_user", "decision_maker", "influencer"]
    confidence_score: float = Field(ge=0.0, le=1.0)
    demographic_profile: Optional[Dict[str, Any]] = None
    individual_insights: Dict[str, Any] = Field(default_factory=dict)
    influence_metrics: Optional[Dict[str, float]] = None
    authentic_evidence: Optional[Dict[str, List[str]]] = None  # Evidence from interviews
```

**Key Feature:** `authentic_evidence` contains actual quotes mapped to demographics, goals, pain points, and quotes

---

### 6.2 Cross-Stakeholder Patterns

#### `ConsensusArea`
```python
class ConsensusArea(BaseModel):
    topic: str
    agreement_level: float = Field(ge=0.0, le=1.0)
    participating_stakeholders: List[str]
    shared_insights: List[str] = Field(default_factory=list)
    business_impact: str
```

#### `ConflictZone`
```python
class ConflictZone(BaseModel):
    topic: str
    conflicting_stakeholders: List[str]
    conflict_severity: Literal["low", "medium", "high", "critical"]
    potential_resolutions: List[str] = Field(default_factory=list)
    business_risk: str
```

#### `InfluenceNetwork`
```python
class InfluenceNetwork(BaseModel):
    influencer: str
    influenced: List[str]
    influence_type: Literal["decision", "opinion", "adoption", "resistance"]
    strength: float = Field(ge=0.0, le=1.0)
    pathway: str  # How influence flows
```

#### `CrossStakeholderPatterns`
```python
class CrossStakeholderPatterns(BaseModel):
    consensus_areas: List[ConsensusArea] = Field(default_factory=list)
    conflict_zones: List[ConflictZone] = Field(default_factory=list)
    influence_networks: List[InfluenceNetwork] = Field(default_factory=list)
    stakeholder_priority_matrix: Optional[Dict[str, Any]] = None
```

---

### 6.3 Multi-Stakeholder Summary

#### `MultiStakeholderSummary`
```python
class MultiStakeholderSummary(BaseModel):
    total_stakeholders: int = Field(ge=0)
    consensus_score: float = Field(ge=0.0, le=1.0)
    conflict_score: float = Field(ge=0.0, le=1.0)
    key_insights: List[str] = Field(default_factory=list)
    implementation_recommendations: List[str] = Field(default_factory=list)
```

#### `StakeholderIntelligence` (Complete)
```python
class StakeholderIntelligence(BaseModel):
    detected_stakeholders: List[DetectedStakeholder]
    cross_stakeholder_patterns: Optional[CrossStakeholderPatterns] = None
    multi_stakeholder_summary: Optional[MultiStakeholderSummary] = None
    processing_metadata: Dict[str, Any] = Field(default_factory=dict)
```

---

### 6.4 Stakeholder Detection

#### `StakeholderDetectionResult` (Dataclass)
**Location:** `backend/models/stakeholder_models.py`

```python
@dataclass
class StakeholderDetectionResult:
    is_multi_stakeholder: bool
    detected_stakeholders: List[Dict[str, Any]]
    confidence_score: float
    detection_method: str
    metadata: Dict[str, Any]
```

**Usage:** Result of stakeholder detection process (pattern-based + LLM-based)

---

## 7. Conversation State Models (LangGraph)

**Location:** `backend/models/conversation_state.py`

### 7.1 Enums

#### `ConversationStage`
```python
class ConversationStage(str, Enum):
    GATHERING_INFO = "gathering_info"
    READY_FOR_CONFIRMATION = "ready_for_confirmation"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    GENERATING_QUESTIONS = "generating_questions"
    COMPLETED = "completed"
    ERROR = "error"
```

#### `UserIntent`
```python
class UserIntent(str, Enum):
    CONFIRMATION = "confirmation"
    REJECTION = "rejection"
    CLARIFICATION = "clarification"
    CONTINUATION = "continuation"
    UNKNOWN = "unknown"
```

#### `ConversationQuality`
```python
class ConversationQuality(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
```

---

### 7.2 Message Model

#### `Message`
**Purpose:** Structured message with validation

```python
class Message(BaseModel):
    id: str
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Optional[Dict[str, Any]] = None

    @validator("content")
    def validate_content(cls, v):
        if not v or not v.strip():
            raise ValueError("Message content cannot be empty")
        return v.strip()
```

---

### 7.3 Business Context

#### `BusinessContext`
**Purpose:** Validated business context for conversation

```python
class BusinessContext(BaseModel):
    business_idea: Optional[str] = None
    target_customer: Optional[str] = None
    problem_statement: Optional[str] = None
    industry: Optional[str] = None
    additional_details: Dict[str, Any] = Field(default_factory=dict)

    @validator("business_idea")
    def validate_business_idea(cls, v):
        if v and len(v.strip()) < 5:
            raise ValueError("Business idea must be at least 5 characters")
        return v.strip() if v else None

    def is_complete(self) -> bool:
        return bool(self.business_idea and self.target_customer)

    def get_completion_score(self) -> float:
        fields = [self.business_idea, self.target_customer, self.problem_statement]
        completed = sum(1 for field in fields if field)
        return completed / len(fields)
```

---

### 7.4 LLM Validation

#### `LLMValidation`
**Purpose:** LLM validation result with strong typing

```python
class LLMValidation(BaseModel):
    ready_for_questions: bool = False
    conversation_quality: ConversationQuality = ConversationQuality.LOW
    confidence_score: float = Field(ge=0.0, le=1.0, default=0.0)
    missing_elements: List[str] = Field(default_factory=list)
    reasoning: Optional[str] = None
```

---

### 7.5 Conversation State

#### `ConversationState`
**Purpose:** Complete LangGraph state for conversation flow

```python
class ConversationState(BaseModel):
    # Conversation tracking
    session_id: str
    stage: ConversationStage = ConversationStage.GATHERING_INFO
    messages: Annotated[List[Message], operator.add] = Field(default_factory=list)

    # Business context
    business_context: BusinessContext = Field(default_factory=BusinessContext)

    # Validation
    llm_validation: Optional[LLMValidation] = None
    user_intent: Optional[UserIntent] = None

    # Generated questions
    generated_questions: Optional[List[str]] = None

    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    error_message: Optional[str] = None
```

**Usage:** Type-safe state management for LangGraph conversation flow

---

## 8. Jira Export Models

**Location:** `backend/models/jira_export.py`

### 8.1 Credentials

#### `JiraCredentials`
```python
class JiraCredentials(BaseModel):
    jira_url: str  # e.g., https://your-domain.atlassian.net
    email: str
    api_token: str
    project_key: str  # e.g., PROJ
```

---

### 8.2 Export Request/Response

#### `JiraExportRequest`
```python
class JiraExportRequest(BaseModel):
    result_id: int  # Analysis result ID to export
    credentials: JiraCredentials
    epic_name: Optional[str] = None  # Defaults to PRD title
    include_technical: bool = True
    include_acceptance_criteria: bool = True
    update_existing: bool = False  # Update if issues already exist
```

#### `JiraIssue`
```python
class JiraIssue(BaseModel):
    key: str  # e.g., PROJ-123
    id: str
    url: str
    summary: str
    issue_type: str  # Epic, Story, Task
```

#### `JiraExportResponse`
```python
class JiraExportResponse(BaseModel):
    success: bool
    epic: Optional[JiraIssue] = None
    stories: List[JiraIssue] = Field(default_factory=list)
    tasks: List[JiraIssue] = Field(default_factory=list)
    total_issues_created: int = 0
    stories_created: int = 0
    tasks_created: int = 0
    message: str
    errors: List[str] = Field(default_factory=list)
```

---

### 8.3 Connection Test

#### `JiraConnectionTestRequest`
```python
class JiraConnectionTestRequest(BaseModel):
    credentials: JiraCredentials
```

#### `JiraConnectionTestResponse`
```python
class JiraConnectionTestResponse(BaseModel):
    success: bool
    message: str
    project_name: Optional[str] = None
    user_name: Optional[str] = None
```

---


## 9. PydanticAI Output Types

**Purpose:** Typed outputs for PydanticAI agents to ensure structured LLM responses

### 9.1 Theme Analysis Outputs

**Location:** `backend/services/stakeholder_analysis_v2/theme_analyzer.py`

#### `ThemeAttributionModel`
**Purpose:** Theme with stakeholder attribution

```python
class ThemeAttributionModel(BaseModel):
    name: str
    definition: str
    frequency: float = Field(ge=0.0, le=1.0)
    sentiment: float = Field(ge=-1.0, le=1.0)
    statements: List[str]  # Direct quotes
    stakeholder_attribution: Dict[str, Any]  # Stakeholder breakdown
```

**Usage:** `output_type` for theme attribution agent

---

### 9.2 Persona Generation Outputs

**Location:** `backend/services/processing/persona_builder.py`

#### `SimplifiedPersona`
**Purpose:** Initial persona generation with AttributedField support

```python
class SimplifiedPersona(BaseModel):
    name: str
    description: str
    archetype: str

    # Core fields with AttributedField for evidence traceability
    demographics: StructuredDemographics
    goals_and_motivations: AttributedField
    challenges_and_frustrations: AttributedField
    key_quotes: AttributedField

    overall_confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    persona_metadata: Optional[PersonaMetadata] = None
```

**Usage:** PydanticAI agent output for persona generation

---

#### `DirectPersona`
**Purpose:** Direct persona model that can be generated by PydanticAI without conversion

```python
class DirectPersona(BaseModel):
    name: str
    description: str
    archetype: str

    # Core design thinking fields as DirectPersonaTrait
    demographics: DirectPersonaTrait
    goals_and_motivations: DirectPersonaTrait
    challenges_and_frustrations: DirectPersonaTrait
    key_quotes: DirectPersonaTrait

    # Optional extended traits
    skills_and_expertise: Optional[DirectPersonaTrait] = None
    workflow_and_environment: Optional[DirectPersonaTrait] = None
    technology_and_tools: Optional[DirectPersonaTrait] = None
    pain_points: Optional[DirectPersonaTrait] = None

    # Metadata
    patterns: List[str] = Field(default_factory=list)
    overall_confidence: float = Field(default=0.7, ge=0.0, le=1.0, alias="confidence")
    evidence: List[str] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
```

**Key Feature:** Produces exact structure expected by frontend, eliminating fragile two-step conversion

---

### 9.3 Analysis Pipeline Outputs

**Location:** `backend/api/research/simulation_bridge/services/conversational_analysis_agent.py`

#### `ThemesResult`
```python
class ThemesResult(BaseModel):
    themes: List[Theme]
```

#### `PatternsResult`
```python
class PatternsResult(BaseModel):
    patterns: List[Pattern]
```

#### `PersonasResult`
```python
class PersonasResult(BaseModel):
    personas: List[SimplifiedPersona]
```

**Usage:** Stage-specific PydanticAI agents with timeout settings

---

## 10. Complete Analysis Result

**Location:** `backend/schemas.py`

### `DetailedAnalysisResult`
**Purpose:** Comprehensive model for all analysis results

```python
class DetailedAnalysisResult(BaseModel):
    id: str
    status: Literal["pending", "completed", "failed"]
    createdAt: str
    fileName: str
    fileSize: Optional[int] = None

    # Core analysis results
    themes: List[Theme]
    enhanced_themes: Optional[List[Theme]] = None
    patterns: List[Pattern]
    enhanced_patterns: Optional[List[Pattern]] = None
    personas: Optional[List[Persona]] = None
    enhanced_personas: Optional[List[Persona]] = None
    insights: Optional[List[Insight]] = None
    enhanced_insights: Optional[List[Insight]] = None

    # Sentiment analysis
    sentimentOverview: Optional[SentimentOverview] = None
    sentiment: Optional[List[Dict[str, Any]]] = None

    # Multi-stakeholder intelligence (always present)
    stakeholder_intelligence: StakeholderIntelligence = Field(
        default_factory=lambda: StakeholderIntelligence(
            detected_stakeholders=[],
            processing_metadata={"status": "not_analyzed"}
        )
    )

    error: Optional[str] = None
```

**Key Features:**
- Separate `enhanced_*` fields for stakeholder-enhanced analysis
- `stakeholder_intelligence` always present (empty if no stakeholders detected)
- Comprehensive error handling

---

### `ResultResponse`
**Purpose:** API response wrapper for results endpoint

```python
class ResultResponse(BaseModel):
    status: Literal["processing", "completed", "error"]
    result_id: Optional[int] = None
    analysis_date: Optional[datetime] = None
    results: Optional[Dict[str, Any]] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    error: Optional[str] = None
```

---


## 11. Enhanced Persona Models

**Location:** `backend/models/enhanced_persona_models.py`

### 11.1 Metadata Models

#### `PersonaMetadata`
**Purpose:** Structured persona metadata to avoid additionalProperties issues

```python
class PersonaMetadata(BaseModel):
    generation_method: Optional[str] = None
    stakeholder_category: Optional[str] = None
    confidence_factors: List[str] = Field(default_factory=list)
    processing_notes: Optional[str] = None
    preserved_key_quotes: Optional[Dict[str, Any]] = None
```

#### `StakeholderContext`
**Purpose:** Structured stakeholder context

```python
class StakeholderContext(BaseModel):
    stakeholder_type: Optional[str] = None
    influence_level: Optional[float] = None
    relationship_notes: Optional[str] = None
```

---

### 11.2 Enhanced Persona Trait

#### `EnhancedPersonaTrait`
**Purpose:** Persona trait with stakeholder context

```python
class EnhancedPersonaTrait(BaseModel):
    value: str
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    evidence: List[EvidenceItem] = Field(default_factory=list)
    stakeholder_context: Optional[StakeholderContext] = None
```

---

## 12. Key Pydantic Patterns Used

### 12.1 Field Validation

```python
# Range validation
frequency: float = Field(ge=0.0, le=1.0)  # Greater/less than or equal

# Default factories
evidence: List[str] = Field(default_factory=list)

# Aliases for backward compatibility
overall_confidence: float = Field(alias="confidence")
```

### 12.2 Validators

```python
# Field validator (Pydantic v2)
@field_validator("evidence", mode="before")
@classmethod
def _coerce_evidence(cls, v):
    # Coerce strings/dicts to proper types

# Model validator
@validator("content")
def validate_content(cls, v):
    if not v or not v.strip():
        raise ValueError("Message content cannot be empty")
    return v.strip()
```

### 12.3 ConfigDict

```python
# Strict validation
model_config = ConfigDict(extra="forbid")

# JSON schema examples
model_config = {
    "json_schema_extra": {
        "example": {...}
    }
}
```

### 12.4 Type Annotations

```python
# Literal types for enums
status: Literal["pending", "completed", "failed"]

# Optional fields
description: Optional[str] = None

# Annotated for LangGraph state
messages: Annotated[List[Message], operator.add]
```

---

## 13. Schema Usage Map

### By Purpose

| Purpose | Schema | Location |
|---------|--------|----------|
| API Request Validation | `AnalysisRequest`, `PersonaGenerationRequest` | `backend/schemas.py` |
| API Response | `UploadResponse`, `AnalysisResponse`, `ResultResponse` | `backend/schemas.py` |
| Evidence Traceability | `EvidenceItem`, `AttributedField` | `backend/domain/models/persona_schema.py` |
| Persona Generation | `ProductionPersona`, `SimplifiedPersona`, `DirectPersona` | `backend/domain/models/production_persona.py`, `backend/models/enhanced_persona_models.py` |
| Theme Analysis | `Theme`, `HierarchicalCode`, `ThemeRelationship` | `backend/schemas.py` |
| Pattern Detection | `Pattern` | `backend/schemas.py` |
| Insight Generation | `Insight` | `backend/schemas.py` |
| Stakeholder Intelligence | `DetectedStakeholder`, `StakeholderIntelligence` | `backend/schemas.py` |
| Synthetic Interviews | `SimulatedPerson`, `SimulatedInterview`, `SimulationConfig` | `backend/api/research/simulation_bridge/models.py` |
| Conversation State | `ConversationState`, `Message`, `BusinessContext` | `backend/models/conversation_state.py` |
| Jira Export | `JiraExportRequest`, `JiraExportResponse` | `backend/models/jira_export.py` |
| PydanticAI Outputs | `ThemesResult`, `PersonasResult`, `ThemeAttributionModel` | Various agent files |

---

## 14. Critical Schema Rules

### ✅ DO

1. **Use AttributedField for evidence-backed fields** - Prevents schema corruption
2. **Use StructuredDemographics for demographics** - Each field has its own evidence
3. **Set `extra="forbid"` for strict validation** - Prevents unexpected fields
4. **Use Field validators for type coercion** - Backward compatibility
5. **Use Literal types for enums** - Type safety
6. **Use default_factory for mutable defaults** - Avoid shared state bugs
7. **Use ge/le for numeric ranges** - Automatic validation

### ❌ DON'T

1. **Don't use Union[str, dict, list] for PersonaTrait** - Causes JSON corruption
2. **Don't add top-level 'value' to StructuredDemographics** - Schema conflict
3. **Don't use str() on Pydantic models** - Use model_dump_json() instead
4. **Don't create new evidence models** - Use EvidenceItem only
5. **Don't skip validators** - They prevent data corruption
6. **Don't use mutable defaults without default_factory** - Shared state bugs

---


## 15. Example JSON Outputs

### Theme with Evidence
```json
{
  "name": "User Interface Complexity",
  "frequency": 0.75,
  "sentiment": -0.3,
  "statements": [
    "I find the interface overwhelming with too many options",
    "It takes me several clicks to find basic features"
  ],
  "definition": "The difficulty users experience navigating and using the interface",
  "keywords": ["navigation", "UI", "complexity", "usability"],
  "reliability": 0.85,
  "process": "enhanced"
}
```

### Persona with AttributedField
```json
{
  "name": "Data-Driven Product Manager",
  "description": "Experienced PM who relies on data analytics",
  "archetype": "Decision Maker",
  "demographics": {
    "experience_level": {
      "value": "Senior (5+ years)",
      "evidence": [{"quote": "I've been in product for 7 years"}]
    },
    "industry": {
      "value": "SaaS",
      "evidence": [{"quote": "Working in B2B SaaS"}]
    },
    "confidence": 0.9
  },
  "goals_and_motivations": {
    "value": "Drive product success through data-driven decisions",
    "evidence": [
      {"quote": "I always look at the metrics before deciding"},
      {"quote": "Data tells us what users really need"}
    ]
  },
  "overall_confidence": 0.85
}
```

### Stakeholder Intelligence
```json
{
  "detected_stakeholders": [
    {
      "stakeholder_id": "IT_Manager_Sarah",
      "stakeholder_type": "decision_maker",
      "confidence_score": 0.9,
      "demographic_profile": {
        "age": 34,
        "role": "IT Manager",
        "department": "Operations"
      },
      "influence_metrics": {
        "decision_power": 0.8,
        "technical_influence": 0.9,
        "budget_influence": 0.6
      },
      "authentic_evidence": {
        "demographics_evidence": ["Quote about role"],
        "goals_evidence": ["Quote about objectives"],
        "pain_points_evidence": ["Quote about challenges"]
      }
    }
  ],
  "multi_stakeholder_summary": {
    "total_stakeholders": 4,
    "consensus_score": 0.7,
    "conflict_score": 0.3,
    "key_insights": ["All stakeholders prioritize ease of use"]
  }
}
```

---

## 16. Summary

This catalog documents **50+ Pydantic schemas** across the AxWise Flow system, organized by:

- **Core API** - Request/response validation
- **Domain Models** - Golden Schema for evidence traceability
- **Analysis** - Theme, pattern, insight extraction
- **Stakeholder Intelligence** - Multi-stakeholder analysis
- **Simulation** - Synthetic interview generation
- **Conversation** - LangGraph state management
- **Integration** - Jira export
- **PydanticAI** - Typed LLM outputs

**Key Principles:**
1. Evidence traceability through `AttributedField` and `EvidenceItem`
2. Type safety with Literal, Optional, and validators
3. Strict validation with `extra="forbid"`
4. Backward compatibility through field validators
5. Frontend compatibility through consistent structure

**For AI Tinkerers Demo:**
- Show how `AttributedField` prevents schema corruption
- Demonstrate evidence traceability from insight → theme → quote
- Highlight PydanticAI typed outputs for structured LLM responses
- Explain stakeholder intelligence schema for multi-stakeholder analysis

---

## 17. Quick Reference: Most Important Schemas

### For Synthetic Data Generation
- `SimulatedPerson` - Individual person with demographics, motivations, pain points
- `SimulatedInterview` - Complete interview with Q&A responses
- `SimulationConfig` - Configuration for interview generation

### For Analysis Pipeline
- `Theme` - Theme with frequency, sentiment, evidence
- `Pattern` - Behavioral pattern with impact
- `Persona` - User persona with AttributedField structure
- `Insight` - Actionable insight with recommendations

### For Evidence Traceability
- `EvidenceItem` - Quote with character offsets and speaker
- `AttributedField` - Value + evidence container (THE GOLDEN SCHEMA)
- `StructuredDemographics` - Demographics with per-field evidence

### For PydanticAI Agents
- `ThemesResult` - Typed output for theme extraction
- `PersonasResult` - Typed output for persona generation
- `DirectPersona` - Direct persona output without conversion

### For Multi-Stakeholder Analysis
- `DetectedStakeholder` - Individual stakeholder with authentic evidence
- `StakeholderIntelligence` - Complete multi-stakeholder analysis
- `CrossStakeholderPatterns` - Consensus, conflicts, influence networks

---

**End of Pydantic Schema Catalog**
