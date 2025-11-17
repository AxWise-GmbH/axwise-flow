# 🎯 Conversational Routines Architecture

> **How AxWise Flow implements the 2025 "Conversation Routines" framework for reliable, efficient customer research conversations**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture Patterns](#architecture-patterns)
3. [State Management](#state-management)
4. [Workflow Implementation](#workflow-implementation)
5. [PydanticAI Agent Integration](#pydanticai-agent-integration)
6. [Key Design Decisions](#key-design-decisions)
7. [Code Examples](#code-examples)

---

## 1. Overview

### What are Conversation Routines?

**Conversation Routines** (2025 framework by Giorgio Robino) is a paradigm shift from complex state machines to **embedded workflow logic in natural language prompts**.

**Traditional Approach (LangGraph State Machines):**
- Explicit nodes and edges
- Complex routing logic
- State transitions managed by code
- Difficult to modify and debug

**Conversation Routines Approach:**
- Single LLM call with embedded decision logic
- Context-driven flow decisions
- Natural language workflow instructions
- Easy to modify by editing prompts

---

## 2. Architecture Patterns

### 2.1 Single-Agent Pattern

**Location:** `backend/api/research/conversation_routines/service.py`

```python
class ConversationRoutineService:
    def __init__(self):
        self.llm_service = GeminiService(llm_config)
        self.stakeholder_detector = StakeholderDetector()
        self.agent = self._create_agent()  # Single PydanticAI agent
    
    def _create_agent(self) -> Agent:
        agent = Agent(
            model=self.llm_service.get_pydantic_ai_model(),
            system_prompt=get_conversation_routine_prompt(),  # Embedded workflow
            tools=[generate_stakeholder_questions, extract_conversation_context]
        )
        return agent
```

**Key Principle:** One agent with embedded workflow logic, not multiple specialized agents.

---

### 2.2 Embedded Workflow Logic

**Location:** `backend/api/research/conversation_routines/conversation_routine_prompt.py`

The entire conversation flow is defined in **natural language** within the system prompt:

```
CONVERSATION WORKFLOW:

1. INFORMATION GATHERING PHASE (Maximum 6 exchanges):
   Required Information:
   - Business Idea (minimum 10 words)
   - Target Customer (minimum 5 words)
   - Core Problem (minimum 5 words)
   
2. TRANSITION DECISION FRAMEWORK:
   IMMEDIATE TRANSITION TRIGGERS:
   - User explicitly requests questions
   - User shows fatigue
   - Exchange count reaches 6
   
   PROACTIVE TRANSITION TRIGGERS (ALL REQUIRED):
   - Clear business idea
   - Specific target customer
   - Detailed problem description
   
3. QUESTION GENERATION PHASE:
   - Use generate_stakeholder_questions tool
   - Present comprehensive questionnaire
```

**No code-based state machine** - the LLM interprets the workflow from the prompt.

---

### 2.3 Context-Driven Decisions

**Location:** `backend/api/research/conversation_routines/models.py`

Instead of explicit state machines, decisions are based on **context completeness**:

```python
class ConversationContext(BaseModel):
    business_idea: Optional[str] = None
    target_customer: Optional[str] = None
    problem: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    exchange_count: int = 0
    user_fatigue_signals: List[str] = []

    def should_transition_to_questions(self) -> bool:
        """Context-driven decision logic"""
        has_all_required = (
            self.business_idea and len(self.business_idea.strip()) >= 10
            and self.target_customer and len(self.target_customer.strip()) >= 5
            and self.problem and len(self.problem.strip()) >= 8
        )

        return (
            has_all_required  # Sufficient context
            or self.exchange_count >= 8  # Efficiency limit
            or len(self.user_fatigue_signals) >= 3  # User fatigue
        )
```

**Key Principle:** Decisions emerge from context state, not hardcoded transitions.

---

## 3. State Management

### 3.1 Pydantic-Based State

**Two state models coexist:**

#### A. Lightweight Conversation Context (Conversation Routines)
**Location:** `backend/api/research/conversation_routines/models.py`

```python
class ConversationContext(BaseModel):
    """Simple context tracking for efficient decision making"""
    business_idea: Optional[str] = None
    target_customer: Optional[str] = None
    problem: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    exchange_count: int = 0
    user_fatigue_signals: List[str] = []

    def get_completeness_score(self) -> float:
        """Calculate context completeness (0.0-1.0)"""
        fields = [self.business_idea, self.target_customer, self.problem]
        completed = sum(1 for f in fields if f and len(f.strip()) >= 5)
        return completed / len(fields)
```

**Usage:** Fast, efficient context tracking for conversation routines.

---

#### B. Full LangGraph State (Traditional Approach)
**Location:** `backend/models/conversation_state.py`

```python
class CustomerResearchState(BaseModel):
    """Complete LangGraph state schema with Pydantic validation"""

    # Core conversation data
    messages: Annotated[List[Message], operator.add] = Field(default_factory=list)
    business_context: BusinessContext = Field(default_factory=BusinessContext)
    conversation_stage: ConversationStage = ConversationStage.GATHERING_INFO

    # User interaction flags
    user_confirmed: bool = False
    user_rejected: bool = False
    user_wants_clarification: bool = False

    # LLM analysis results
    last_validation: Optional[LLMValidation] = None
    last_intent_analysis: Optional[IntentAnalysis] = None

    # Generated content
    research_questions: Optional[ResearchQuestions] = None
    stakeholder_analysis: Optional[StakeholderAnalysis] = None

    # Error handling
    error_count: int = 0
    last_error: Optional[str] = None

    # Loop prevention
    gather_info_count: int = 0
    validation_count: int = 0
```

**Usage:** Full-featured state for complex LangGraph workflows (if needed).

---

### 3.2 State Enums

**Location:** `backend/models/conversation_state.py`

```python
class ConversationStage(str, Enum):
    GATHERING_INFO = "gathering_info"
    READY_FOR_CONFIRMATION = "ready_for_confirmation"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    GENERATING_QUESTIONS = "generating_questions"
    COMPLETED = "completed"
    ERROR = "error"

class UserIntent(str, Enum):
    CONFIRMATION = "confirmation"
    REJECTION = "rejection"
    CLARIFICATION = "clarification"
    CONTINUATION = "continuation"
    UNKNOWN = "unknown"
```

**Note:** These enums exist for **backward compatibility** with LangGraph approach, but **Conversation Routines doesn't use explicit stages** - the LLM infers the stage from context.

---

## 4. Workflow Implementation

### 4.1 Main Processing Flow

**Location:** `backend/api/research/conversation_routines/service.py`

```python
async def process_conversation(
    self, request: ConversationRoutineRequest
) -> ConversationRoutineResponse:
    """Single LLM call with embedded decision logic"""

    # 1. Extract context from conversation history
    messages_for_context = [
        ConversationMessage(role=msg.role, content=msg.content)
        for msg in request.messages
    ] + [ConversationMessage(role="user", content=request.input)]

    context = await extract_context_from_messages(
        messages_for_context, self.llm_service
    )

    # 2. Build full prompt with context and workflow instructions
    full_prompt = f"""
CURRENT CONTEXT:
- Business Idea: {context.business_idea or 'Not yet provided'}
- Target Customer: {context.target_customer or 'Not yet provided'}
- Problem: {context.problem or 'Not yet provided'}
- Industry: {context.industry or 'Not yet inferred'}
- Location: {context.location or 'Not yet provided'}
- Exchange Count: {context.exchange_count}
- Fatigue Signals: {context.user_fatigue_signals}

CONVERSATION HISTORY:
{conversation_history}

USER INPUT: {request.input}

Based on the conversation routine framework and current context, provide your response.
If you determine that questions should be generated, include "GENERATE_QUESTIONS" in your response.
"""

    # 3. Single agent call - workflow logic embedded in prompt
    agent_response = await self.agent.run(full_prompt)
    response_content = str(agent_response.output)

    # 4. Check if agent used tools to generate questions
    questions_generated = False
    generated_questions = None

    if hasattr(agent_response, 'all_messages'):
        for msg in agent_response.all_messages():
            if hasattr(msg, 'parts'):
                for part in msg.parts:
                    if hasattr(part, 'tool_name') and part.tool_name == 'generate_stakeholder_questions':
                        questions_generated = True
                        generated_questions = part.content

    # 5. Generate contextual suggestions
    suggestions = await self._generate_contextual_suggestions(context, conversation_history)

    # 6. Return response
    return ConversationRoutineResponse(
        content=response_content,
        context=context,
        should_generate_questions=questions_generated,
        questions=generated_questions,
        suggestions=suggestions,
        metadata={
            "conversation_routine": True,
            "context_completeness": context.get_completeness_score(),
            "exchange_count": context.exchange_count,
            "fatigue_signals": context.user_fatigue_signals,
        },
        session_id=request.session_id,
    )
```

**Key Principle:** One async function, one agent call, embedded workflow logic.

---

### 4.2 Context Extraction

**Location:** `backend/api/research/conversation_routines/models.py`

```python
async def extract_context_from_messages(
    messages: List[ConversationMessage], llm_service=None
) -> ConversationContext:
    """Extract business context from conversation messages using LLM"""
    context = ConversationContext()
    context.exchange_count = len([msg for msg in messages if msg.role == "user"])

    if not messages:
        return context

    # Build USER-only conversation text to avoid inferring from assistant summaries
    user_only_text = "\n".join(
        [f"user: {msg.content}" for msg in messages if msg.role == "user"]
    )

    # Use LLM to extract structured context
    extraction_prompt = f"""
    Extract business context from this conversation:

    {user_only_text}

    Return JSON with:
    - business_idea: The product/service concept (or null)
    - target_customer: The primary customer group (or null)
    - problem: The main problem being solved (or null)
    - industry: Industry/sector (or null)
    - location: Country/city/region (or null)

    Only extract what is clearly stated. Use null for missing information.
    """

    response_data = await llm_service.analyze(
        text=extraction_prompt,
        task="text_generation",
        data={"temperature": 0.1, "max_tokens": 500},
    )

    # Parse JSON and update context
    context_data = json.loads(response_data.get("text", "{}"))
    context.business_idea = context_data.get("business_idea")
    context.target_customer = context_data.get("target_customer")
    context.problem = context_data.get("problem")
    context.industry = context_data.get("industry")
    context.location = context_data.get("location")

    # Detect user fatigue signals
    for msg in messages:
        if msg.role == "user":
            fatigue_signals = detect_user_fatigue_signals(msg.content)
            context.user_fatigue_signals.extend(fatigue_signals)

    return context
```

**Key Principle:** LLM extracts structured context from unstructured conversation.

---

### 4.3 User Fatigue Detection

**Location:** `backend/api/research/conversation_routines/models.py`

```python
def detect_user_fatigue_signals(message: str) -> List[str]:
    """Detect signals that user wants to move forward"""
    fatigue_signals = []
    message_lower = message.lower()

    # Uncertainty signals
    if any(phrase in message_lower for phrase in ["i don't know", "i dont know", "not sure", "maybe"]):
        fatigue_signals.append("uncertainty")

    # Brevity signals
    if len(message.split()) <= 3:
        fatigue_signals.append("brevity")

    # Explicit requests to move forward
    forward_phrases = ["generate", "create", "make", "let's go", "proceed", "next", "continue", "move on"]
    if any(phrase in message_lower for phrase in forward_phrases):
        fatigue_signals.append("explicit_request")

    # Problem-specific fatigue signals
    problem_fatigue_phrases = ["that's the problem", "the main issue", "the biggest challenge", "that's it"]
    if any(phrase in message_lower for phrase in problem_fatigue_phrases):
        fatigue_signals.append("problem_identified")

    return fatigue_signals
```

**Key Principle:** Pattern-based detection of user readiness to proceed.

---

## 5. PydanticAI Agent Integration

### 5.1 Agent with Tools

**Location:** `backend/api/research/conversation_routines/service.py`

```python
def _create_agent(self) -> Agent:
    """Create PydanticAI agent with conversation routine prompt and tools"""

    @Tool
    async def generate_stakeholder_questions(
        business_idea: str, target_customer: str, problem: str
    ) -> Dict[str, Any]:
        """Generate comprehensive stakeholder-based research questions"""
        # Use existing stakeholder detector
        context_analysis = {
            "business_idea": business_idea,
            "target_customer": target_customer,
            "problem": problem,
        }
        stakeholder_data = await self.stakeholder_detector.generate_dynamic_stakeholders_with_unique_questions(
            self.llm_service,
            context_analysis=context_analysis,
            messages=[],
            business_idea=business_idea,
            target_customer=target_customer,
            problem=problem,
        )

        # Calculate time estimates
        time_estimates = self.stakeholder_detector.calculate_stakeholder_time_estimates(
            stakeholder_data
        )

        # Format for frontend
        return {
            "primaryStakeholders": stakeholder_data.get("primary", []),
            "secondaryStakeholders": stakeholder_data.get("secondary", []),
            "timeEstimate": time_estimates,
        }

    @Tool
    async def extract_conversation_context(
        messages: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        """Extract business context from conversation history using LLM"""
        # ... (see Context Extraction section)

    # Create agent with tools
    agent = Agent(
        model=self.llm_service.get_pydantic_ai_model(),
        system_prompt=get_conversation_routine_prompt(),
        tools=[generate_stakeholder_questions, extract_conversation_context],
    )

    return agent
```

**Key Principle:** Agent has access to tools, decides when to use them based on embedded workflow logic.

---

### 5.2 Tool Invocation Detection

**Location:** `backend/api/research/conversation_routines/service.py`

```python
# Check if the agent used tools to generate questions
questions_generated = False
generated_questions = None

if hasattr(agent_response, 'all_messages'):
    for msg in agent_response.all_messages():
        if hasattr(msg, 'parts'):
            for part in msg.parts:
                if hasattr(part, 'tool_name') and part.tool_name == 'generate_stakeholder_questions':
                    questions_generated = True
                    if hasattr(part, 'content'):
                        generated_questions = part.content
                        logger.info(f"✅ Questions generated via tool: {list(generated_questions.keys())}")
```

**Key Principle:** Inspect agent response to detect tool usage, not hardcoded triggers.

---

## 6. Key Design Decisions

### 6.1 Why Conversation Routines Over LangGraph?

| Aspect | LangGraph State Machine | Conversation Routines |
|--------|------------------------|----------------------|
| **Complexity** | High - explicit nodes, edges, routing | Low - single agent with embedded logic |
| **Maintainability** | Hard - code changes for workflow updates | Easy - edit natural language prompt |
| **Debugging** | Complex - trace through graph execution | Simple - inspect single LLM call |
| **Flexibility** | Rigid - predefined transitions | Adaptive - LLM interprets context |
| **Performance** | Multiple LLM calls per transition | Single LLM call per turn |
| **Reliability** | Brittle - state sync issues | Robust - stateless decisions |

**Decision:** Use Conversation Routines for **customer research conversations** where workflow is conversational and context-driven.

---

### 6.2 When to Use Each Approach

**Use Conversation Routines when:**
- Workflow is conversational and context-driven
- Transitions depend on semantic understanding
- Efficiency matters (minimize LLM calls)
- Workflow changes frequently
- Example: Customer research, onboarding, support

**Use LangGraph State Machines when:**
- Workflow has strict, deterministic transitions
- Multiple specialized agents needed
- Complex parallel processing required
- Audit trail of state transitions needed
- Example: Multi-step data processing, approval workflows

---

### 6.3 Hybrid Approach

**AxWise Flow uses BOTH:**

1. **Conversation Routines** for customer research chat (`/api/research/conversation-routines/chat`)
2. **Conversational Analysis Agent** for synthetic interview analysis (`conversational_analysis_agent.py`)

**Example: Conversational Analysis Agent**
**Location:** `backend/api/research/simulation_bridge/services/conversational_analysis_agent.py`

```python
async def _run_conversational_workflow(
    self, simulation_text: str, context: AnalysisContext
) -> Dict[str, Any]:
    """Run the complete conversational analysis workflow"""

    results = {}

    # Stage 1: Theme Extraction
    context.advance_stage("theme_extraction")
    themes_result = await self._extract_themes_conversational(
        simulation_text, context
    )
    results.update(themes_result)

    # Stage 2: Pattern Detection
    context.advance_stage("pattern_detection")
    patterns_result = await self._detect_patterns_conversational(
        simulation_text, context
    )
    results.update(patterns_result)

    # Stage 3: Stakeholder Analysis
    context.advance_stage("stakeholder_analysis")
    stakeholder_result = await self._analyze_stakeholders_conversational(
        simulation_text, context
    )
    results.update(stakeholder_result)

    # ... more stages

    return results
```

**Key Principle:** Sequential stages with conversational prompts, not complex graph routing.

---

## 7. Code Examples

### 7.1 Complete Conversation Flow Example

**User Journey:**

```
User: "I want to create a meal planning app"
↓
Assistant: "A meal planning app - great idea! Who would be your primary users?"
↓
User: "Busy working parents who struggle with weekly meal planning"
↓
Assistant: "Perfect! What's the main problem these busy working parents face with meal planning currently?"
↓
User: "They don't have time to plan meals and end up ordering takeout or making unhealthy choices"
↓
Assistant: "Let me confirm what I understand: You want to create a meal planning app for busy working parents who struggle with time constraints for meal planning and end up ordering takeout or making unhealthy food choices. Is this correct?"
↓
User: "Yes, that's exactly right"
↓
Assistant: [Calls generate_stakeholder_questions tool]
↓
Assistant: "Perfect! I've generated comprehensive research questions organized by stakeholder..."
```

**What happens behind the scenes:**

1. **Turn 1:** Context extraction → `business_idea: "meal planning app"`, `target_customer: null`, `problem: null`
2. **Turn 2:** Context extraction → `target_customer: "busy working parents"`, `problem: null`
3. **Turn 3:** Context extraction → `problem: "no time for meal planning, ordering takeout, unhealthy choices"`
4. **Turn 4:** Context complete → Agent shows validation summary
5. **Turn 5:** User confirms → Agent calls `generate_stakeholder_questions` tool
6. **Turn 6:** Questions returned → Agent presents questionnaire

**No explicit state machine** - the agent interprets the workflow from the prompt and context.

---

### 7.2 API Endpoint Example

**Location:** `backend/api/research/conversation_routines/router.py`

```python
@router.post("/chat", response_model=ConversationRoutineResponse)
async def conversation_routine_chat(
    request: ConversationRoutineRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Conversation Routines Chat Endpoint

    Implements the 2025 Conversation Routines framework for customer research.
    Uses single LLM call with embedded workflow logic instead of complex orchestration.

    Features:
    - Embedded business logic in natural language prompts
    - Context-driven flow decisions (no state machines)
    - Proactive transition to question generation
    - Maximum 6 exchanges before generating questions
    - Automatic user fatigue detection
    - Efficient stakeholder-based question generation
    """
    # SECURITY: Override request user_id with authenticated user
    request.user_id = user.user_id

    # Process through conversation routine service
    response = await conversation_service.process_conversation(request)

    # Best-effort save (errors don't fail main request)
    try:
        await save_conversation_session(request, response, db)
    except Exception as e:
        logger.error(f"save_conversation_session: {str(e)}")

    return response
```

---

### 7.3 Request/Response Models

**Location:** `backend/api/research/conversation_routines/models.py`

```python
class ConversationRoutineRequest(BaseModel):
    """Request structure for conversation routine processing"""
    input: str = Field(..., description="User input message")
    messages: List[ConversationMessage] = Field(
        default_factory=list, description="Conversation history"
    )
    session_id: Optional[str] = Field(None, description="Session identifier")
    user_id: Optional[str] = Field(None, description="User identifier")

class ConversationRoutineResponse(BaseModel):
    """Response structure from conversation routine processing"""
    content: str = Field(..., description="Assistant response content")
    context: ConversationContext = Field(..., description="Updated conversation context")
    should_generate_questions: bool = Field(False, description="Whether to generate research questions")
    questions: Optional[Dict[str, Any]] = Field(None, description="Generated research questions if applicable")
    suggestions: List[str] = Field(default_factory=list, description="Quick reply suggestions")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional response metadata")
    session_id: Optional[str] = Field(None, description="Session identifier")
```

---

## 8. Comparison: Traditional vs Conversation Routines

### Traditional LangGraph Approach

```python
# Define nodes
def gather_info_node(state: CustomerResearchState) -> Dict:
    # Extract info from user message
    # Update business_context
    # Return state update
    pass

def validate_context_node(state: CustomerResearchState) -> Dict:
    # Check if context is complete
    # Generate validation message
    # Return state update
    pass

def generate_questions_node(state: CustomerResearchState) -> Dict:
    # Generate research questions
    # Return state update
    pass

# Define routing logic
def should_validate(state: CustomerResearchState) -> str:
    if state.business_context.is_complete():
        return "validate"
    return "gather_info"

def should_generate(state: CustomerResearchState) -> str:
    if state.user_confirmed:
        return "generate_questions"
    elif state.user_rejected:
        return "gather_info"
    return "validate"

# Build graph
workflow = StateGraph(CustomerResearchState)
workflow.add_node("gather_info", gather_info_node)
workflow.add_node("validate", validate_context_node)
workflow.add_node("generate_questions", generate_questions_node)
workflow.add_conditional_edges("gather_info", should_validate)
workflow.add_conditional_edges("validate", should_generate)
workflow.set_entry_point("gather_info")
```

**Problems:**
- Complex routing logic
- Multiple LLM calls per conversation turn
- Difficult to modify workflow
- State synchronization issues
- Hard to debug

---

### Conversation Routines Approach

```python
# Single agent with embedded workflow
agent = Agent(
    model=llm_model,
    system_prompt="""
    You are a customer research assistant.

    WORKFLOW:
    1. Gather business_idea, target_customer, problem (max 6 exchanges)
    2. When context is complete, show validation summary
    3. When user confirms, call generate_stakeholder_questions tool

    TRANSITION TRIGGERS:
    - User explicitly requests questions
    - User shows fatigue
    - Exchange count reaches 6
    - All required fields present
    """,
    tools=[generate_stakeholder_questions, extract_conversation_context]
)

# Single call per turn
response = await agent.run(full_prompt_with_context)
```

**Benefits:**
- Simple, single-call architecture
- Easy to modify (edit prompt)
- Natural language workflow
- Context-driven decisions
- Easy to debug (inspect single LLM call)

---

## 9. Summary

### Key Takeaways

1. **Conversation Routines = Embedded Workflow Logic**
   - Workflow defined in natural language prompts
   - LLM interprets and executes workflow
   - No explicit state machines

2. **Context-Driven Decisions**
   - Decisions based on context completeness
   - No hardcoded state transitions
   - Adaptive to user behavior

3. **Single-Agent Pattern**
   - One PydanticAI agent with tools
   - One LLM call per conversation turn
   - Tools invoked based on embedded logic

4. **Pydantic State Management**
   - Lightweight `ConversationContext` for efficiency
   - Full `CustomerResearchState` for LangGraph compatibility
   - Type-safe validation throughout

5. **Hybrid Approach**
   - Conversation Routines for conversational workflows
   - Conversational Analysis for sequential processing
   - LangGraph for complex state machines (when needed)

---

## 10. For Your AI Tinkerers Demo

### Demo Talking Points

**1. Show the Prompt**
- "The entire workflow is defined in natural language"
- "No code-based state machine - the LLM interprets the workflow"
- Point to `conversation_routine_prompt.py`

**2. Show Context Extraction**
- "LLM extracts structured context from unstructured conversation"
- "Context completeness drives decisions, not hardcoded rules"
- Point to `extract_context_from_messages()`

**3. Show Single-Agent Pattern**
- "One agent, one call per turn, embedded workflow logic"
- "Agent decides when to use tools based on context"
- Point to `process_conversation()` method

**4. Show User Fatigue Detection**
- "Pattern-based detection of user readiness to proceed"
- "Efficiency over completeness - max 6 exchanges"
- Point to `detect_user_fatigue_signals()`

**5. Show Tool Integration**
- "Agent has access to tools, decides when to use them"
- "No explicit triggers - embedded in workflow logic"
- Point to `generate_stakeholder_questions` tool

**6. Compare to Traditional Approach**
- "Traditional: Complex graph with nodes, edges, routing"
- "Conversation Routines: Single agent with embedded logic"
- Show side-by-side comparison

---

## 11. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Conversation Routines                     │
│                     Single-Agent Pattern                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      PydanticAI Agent                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         System Prompt (Embedded Workflow Logic)       │  │
│  │  - Information Gathering Phase (max 6 exchanges)      │  │
│  │  - Transition Decision Framework                      │  │
│  │  - Question Generation Phase                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                        Tools                          │  │
│  │  - generate_stakeholder_questions()                   │  │
│  │  - extract_conversation_context()                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Context Extraction                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              ConversationContext                      │  │
│  │  - business_idea                                      │  │
│  │  - target_customer                                    │  │
│  │  - problem                                            │  │
│  │  - industry                                           │  │
│  │  - location                                           │  │
│  │  - exchange_count                                     │  │
│  │  - user_fatigue_signals                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Context-Driven Decisions                    │  │
│  │  - should_transition_to_questions()                   │  │
│  │  - get_completeness_score()                           │  │
│  │  - detect_user_fatigue_signals()                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Response Generation                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          ConversationRoutineResponse                  │  │
│  │  - content (assistant message)                        │  │
│  │  - context (updated)                                  │  │
│  │  - should_generate_questions                          │  │
│  │  - questions (if generated)                           │  │
│  │  - suggestions (contextual)                           │  │
│  │  - metadata                                           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

**End of Conversational Routines Architecture Documentation**

