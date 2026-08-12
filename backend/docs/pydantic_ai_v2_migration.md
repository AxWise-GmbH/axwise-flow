# Pydantic AI V2 Migration Guide & Mapping

This document provides a detailed mapping, technical analysis, and step-by-step instructions for upgrading the backend from **Pydantic AI V1** (`pydantic-ai-slim==1.0.1`) to **Pydantic AI V2** (`v2.0.0` or later), specifically optimized for our primary model: **Gemini 3.6 Flash** (`models/gemini-3.6-flash`).

---

## 1. Upgrade Impact & Architecture Mapping

### A. Google Gemini Integration (`GeminiModel` $\rightarrow$ `GoogleModel`)
In **Pydantic AI V1**, Google Gemini models were often imported and instantiated via the legacy `GeminiModel` class:
*   **V1 Module**: `pydantic_ai.models.gemini.GeminiModel`

In **Pydantic AI V2**, the `GeminiModel` class and its parent module are completely **removed**. All Gemini model integrations now must use the unified `GoogleModel` class.

#### Migration Mapping:
```python
# ==========================================
# ❌ DEPRECATED & REMOVED (V1)
# ==========================================
from pydantic_ai.models.gemini import GeminiModel

model = GeminiModel("gemini-3.6-flash")

# ==========================================
#  CORRECT & REQUIRED (V2)
# ==========================================
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

provider = GoogleProvider(api_key=api_key)
model = GoogleModel("models/gemini-3.6-flash", provider=provider)
```

---

### B. Accessing LLM Run Results (`result.data` $\rightarrow$ `result.output`)
In earlier betas and pre-v1.0 specs of Pydantic AI, structured outputs from an agent run were accessed using the `.data` property on the run result. In **Pydantic AI V2**, this attribute is removed entirely.

#### Migration Mapping:
```python
# ==========================================
# ❌ DEPRECATED & REMOVED (V1/V2 transition)
# ==========================================
result = await agent.run(prompt)
data = result.data

# ==========================================
#  CORRECT & REQUIRED (V2)
# ==========================================
result = await agent.run(prompt)
data = result.output
```
**Impacted Files in Our Codebase**:
*   `backend/services/stakeholder_analysis_v2/theme_analyzer.py` (Line 261)
*   `backend/services/stakeholder_analysis_v2/report_assembler.py` (Line 330)
*   `backend/utils/persona/nlp_processor.py` (Lines 238, 351)
*   `backend/services/processing/keyword_highlighter.py` (Line 311)

---

### C. Agent Custom Configurations (`temperature` $\rightarrow$ `ModelSettings`)
Pydantic AI V2 enforces clean separation of agent runtime configurations. Instead of passing parameters like `temperature` directly as top-level `Agent` initialization arguments, they must be cleanly encapsulated inside a `ModelSettings` dictionary / object.

#### Migration Mapping:
```python
# ==========================================
# ❌ DEPRECATED & REMOVED (V2)
# ==========================================
from pydantic_ai import Agent, ModelSettings

patterns_agent = Agent(
    model=model,
    model_settings=ModelSettings(timeout=300),
    temperature=0,  # Will raise error in V2
)

# ==========================================
#  CORRECT & REQUIRED (V2)
# ==========================================
from pydantic_ai import Agent
from pydantic_ai.settings import ModelSettings

patterns_agent = Agent(
    model=model,
    model_settings=ModelSettings(timeout=300, temperature=0.0), # Passed inside settings
)
```
**Impacted Files in Our Codebase**:
*   `backend/services/stakeholder_analysis_v2/influence_calculator.py`
*   `backend/services/stakeholder_analysis_v2/theme_analyzer.py`
*   `backend/services/stakeholder_analysis_v2/report_assembler.py`

---

## 2. Upgrade Checklist & Roadmap

Below is the definitive checklist for transitioning the backend dependencies and core packages to Pydantic AI V2.

### Step 1: Pin Requirements
Update `backend/requirements.txt` and `backend/requirements.prod.txt` to replace `pydantic-ai-slim==1.0.1` with `pydantic-ai-slim>=2.0.0`.

### Step 2: Swap Deprecated `.data` Attribute References
Update `.data` to `.output` in the following files:
*   `backend/services/stakeholder_analysis_v2/theme_analyzer.py`
*   `backend/services/stakeholder_analysis_v2/report_assembler.py`
*   `backend/utils/persona/nlp_processor.py`
*   `backend/services/processing/keyword_highlighter.py`

### Step 3: Relocate Temperature Configuration
Ensure `temperature` arguments passed to `Agent(...)` are consolidated inside the `ModelSettings(...)` parameter in:
*   `backend/services/stakeholder_analysis_v2/influence_calculator.py`
*   `backend/services/stakeholder_analysis_v2/theme_analyzer.py`
*   `backend/services/stakeholder_analysis_v2/report_assembler.py`

### Step 4: Refactor Test Suites
Replace all legacy `GeminiModel` initializations with native `GoogleModel` instances. This affects 8 test suites inside `backend/tests/unit/` and `backend/api/research/simulation_bridge/`:
1.  `backend/tests/unit/test_pydantic_ai_simple.py`
2.  `backend/tests/unit/test_pydantic_ai_persona.py`
3.  `backend/tests/unit/test_structured_demographics.py`
4.  `backend/tests/unit/test_simplified_persona.py`
5.  `backend/tests/unit/test_questionnaire_parsing.py`
6.  `backend/tests/unit/test_real_llm_persona.py`
7.  `backend/tests/unit/test_fixed_prompt_system.py`
8.  `backend/api/research/simulation_bridge/test_conversational_analysis.py`

---

## 3. Native Model Selection Compatibility

Because our codebase initializes all agent instances by directly providing a pre-configured `GoogleModel` object (e.g. `Agent(model=self.model, ...)`), we are **fully shielded** from the V2 breaking change where bare, prefix-less model name strings (like `Agent('gemini-3.6-flash')`) are rejected.

The Gemini 3.6 Flash model names configured in our environment variables (e.g. `models/gemini-3.6-flash`) remain 100% compatible.

---

## 4. Advanced Concurrency & Orqaly Multi-Tenant Optimizations

As outlined in `ORQALY_INTEGRATION_SCHEMA.md`, the **AxWise Flow Engine** supports high-concurrency background simulations (e.g., via `/simulate-async` and `/simulate-enhanced`). Pydantic AI V2 provides several advanced performance primitives that can improve stability under load:

### A. Protecting Rate Limits with `ConcurrencyLimitedModel`
When running multiple agent simulations in parallel for different tenants, Google AI Studio rate limits can quickly be exhausted. V2 introduces a built-in limiter to throttle concurrent requests to the model level without crashing the application.

We can wrap our Gemini models inside a shared concurrency pool:
```python
from pydantic_ai.models.concurrency import ConcurrencyLimitedModel, ConcurrencyLimiter

# Initialize a global limiter for the Gemini 3.5 Flash pool (e.g., max 15 concurrent calls)
gemini_limiter = ConcurrencyLimiter(max_running=15, name="gemini-3.6-flash-pool")

# Wrap the model for the agents
self.gemini_model = ConcurrencyLimitedModel(
    GoogleModel(model_name, provider=provider),
    limiter=gemini_limiter
)
```

### B. High-Concurrency SDK Connection Reuse
*   **Known Bug in `google-genai`**: The underlying Google GenAI SDK used by `GoogleModel` in V2 has a known issue where `aiohttp` shared connections are occasionally not fully reused during parallel async generations, causing slight request latency spikes (typically 3-5 seconds overhead).
*   **Mitigation**: Always pass a single shared `httpx.AsyncClient` or reuse the provider context to initialize models instead of instantiating new `GoogleModel` instances per request.

### C. Robust Structured JSON Validation
*   Gemini 3.5 Flash relies heavily on strict JSON schemas. V2 patches a key bug in the Gemini provider ("Don't send Gemini `function_calling_config` without function declarations"), ensuring that structured outputs (like generating OCEAN profiles or `SimulatedPerson` lists) do not crash when no tool is available in that specific turn.
