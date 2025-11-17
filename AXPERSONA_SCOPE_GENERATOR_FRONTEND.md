# AxPersona Scope Generator Frontend

## 1. Overview

The **AxPersona Scope Generator** is a frontend feature that sits on top of the existing backend AxPersona pipeline, especially the endpoint:

- `POST /api/axpersona/v1/pipeline/run-async` → returns a `PipelineExecutionResult` with:
  - `dataset?: AxPersonaDataset`
  - `execution_trace: PipelineStageTrace[]`
  - `total_duration_seconds: number`
  - `status: "completed" | "partial" | "failed"`

The scope generator extends this to support:

1. **Individual scope generation** – one `BusinessContext` → one `AxPersonaDataset`.
2. **Batch scope generation** – multiple `BusinessContext`s → multiple datasets (one per scope).
3. **Per-scope execution trace visualization** – driven by `PipelineStageTrace`.
4. **Dataset browsing** – using the three-column layout described in `axpersona.md`.

Each *scope* represents a coherent dataset (personas + interviews + analysis + quality metrics) for a particular business segment / city / industry combination.

---

## 2. UI / UX Design

### 2.1 High-level layout (aligned with `axpersona.md`)

The scope generator reuses the **three-column layout** from `axpersona.md`:

1. **Left Sidebar (Discovery / Scopes)**
   - Scope search by name/description.
   - Filters: industry, city, company size, quality tier.
   - List of **scope cards** with status badges (Idle, Running, Completed, Failed).
   - "+ New scope" button → opens the Scope Creation Form.

2. **Main Canvas (Interview Browser / Dataset View)**
   - Shows interviews and personas for the **selected scope**.
   - Same patterns as `InterviewBrowser` in `axpersona.md`:
     - Grid or list of interview cards with avatars and key metadata.
     - Filters for stakeholder type, sentiment, etc.

3. **Right Panel (Analysis & Execution)**
   - Tabs:
     - **Execution Trace** – visualizes `PipelineStageTrace` for this scope.
     - **Consensus Metrics** – derived from `dataset.analysis`.
     - **Data Quality** – derived from `dataset.quality`.
     - **Export** – dataset export options.

### 2.2 Individual scope creation flow

1. User clicks **"+ New scope"** in the left sidebar.
2. **ScopeCreationForm** modal appears with fields for `BusinessContext`:
   - Business idea, target customer, problem, industry, location.
   - Optional advanced settings (e.g. `people_per_stakeholder`).
3. User submits the form:
   - Frontend calls `pipelineService.runPipeline(context)`
   - Shows an inline progress indicator ("Generating dataset…").
4. When the request returns:
   - A new **Scope** is added to the sidebar list.
   - Scope is selected; datasets and execution trace are shown in the main/right panels.

### 2.3 Batch scope generation flow

1. User opens **ScopeBatchBuilder** (e.g. a dedicated tab or modal).
2. They add multiple **scope definitions**:
   - Each with `scopeName` + `BusinessContext` fields.
3. User clicks **"Generate all"**:
   - Frontend sequentially or concurrently calls `/pipeline/run-async` once per scope.
   - Each scope row shows per-stage status (Questionnaire → Simulation → Analysis → Export).
4. Once finished, all generated scopes appear in the left sidebar, ready for browsing.

### 2.4 Execution trace visualization per scope

For a selected scope, the **Execution Trace** tab shows:

- One card per `PipelineStageTrace`:
  - Stage name (humanized), status pill, duration, start time.
  - Key outputs (e.g. interview count, persona count, quality metrics).
  - Error message if `error` is non-null.

This allows users to see exactly what happened in each pipeline stage.

### 2.5 Dataset browsing

The dataset browser for a selected scope reuses the design from `axpersona.md`:

- **Personas view** – list/grid of persona cards with traits and confidence.
- **Interviews view** – list of interview cards (with filters and virtual scrolling).
- **Export tab** – options to download the dataset in CSV/JSON/Parquet/PDF.

---

## 3. Component Architecture

### 3.1 Component hierarchy (React + TypeScript)

Top-level components (aligned with `axpersona.md`):

- `ScopeDetailPage`
  - `ScopeSelector` (left sidebar)
  - `ScopeMainView` (main canvas)
    - `InterviewBrowser`
    - `PersonaList`
  - `AnalysisPanel` (right sidebar)
    - `ExecutionTracePanel`
    - `ConsensusMetricsPanel`
    - `DataQualityPanel`
    - `ExportOptions`
  - `ScopeCreationForm` (modal)
  - `ScopeBatchBuilder` (modal or drawer)

### 3.2 Props and state (key components)

- `ScopeSelector`
  - Props: `scopes`, `selectedScopeId`, `onSelectScope`, `onCreateScope`, `onOpenBatchBuilder`.
  - Shows list of scopes with status badges.

- `ScopeMainView`
  - Props: `scope`, `dataset`, `isLoadingDataset`.
  - Renders `InterviewBrowser` and/or `PersonaList`.

- `ExecutionTracePanel`
  - Props: `trace: PipelineStageTrace[]`, `status: string`.
  - Renders cards for each stage and summarized status.

- `ScopeCreationForm`
  - Props: `onSubmit(context: BusinessContext)`, `onClose`, `isSubmitting`.
  - Local form state for `BusinessContext` fields.

- `ScopeBatchBuilder`
  - Props: `onRunBatch(scopes: BusinessContext[])`, `onClose`.
  - Holds an array of `DraftScope` objects and per-item validation state.

---

## 4. API Integration

### 4.1 TypeScript types mirroring backend models

```ts
export interface PipelineStageTrace {
  stage_name: string;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_seconds: number;
  outputs: Record<string, any>;
  error?: string;
}

export interface AxPersonaDataset {
  scope_id: string;
  scope_name: string;
  description: string;
  personas: Record<string, any>[];
  interviews: Record<string, any>[];
  analysis: any; // DetailedAnalysisResult JSON
  quality: Record<string, any>;
}

export interface PipelineExecutionResult {
  dataset?: AxPersonaDataset;
  execution_trace: PipelineStageTrace[];
  total_duration_seconds: number;
  status: string; // "completed" | "partial" | "failed"
}

export interface BusinessContext {
  business_idea: string;
  target_customer: string;
  problem: string;
  industry: string;
  location: string;
}
```

### 4.2 API service functions (aligned with `axpersona.md` pattern)

```ts
// services/pipelineService.ts
export const pipelineService = {
  runPipeline: async (context: BusinessContext): Promise<PipelineExecutionResult> => {
    const res = await fetch("/api/axpersona/v1/pipeline/run-async", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });
    if (!res.ok) {
      throw new Error("Pipeline run failed");
    }
    return res.json();
  },
};
```

### 4.3 React Query hooks

```ts
import { useMutation } from "@tanstack/react-query";

export function useRunPipeline() {
  return useMutation({
    mutationFn: (context: BusinessContext) => pipelineService.runPipeline(context),
  });
}
```

Components use the hook:

```ts
const runPipeline = useRunPipeline();

function handleCreateScope(context: BusinessContext) {
  runPipeline.mutate(context, {
    onSuccess: (result) => {
      // push new scope with dataset+trace into Zustand store
    },
  });
}
```

### 4.4 Error & loading states

- While `runPipeline` is pending, the ScopeCreationForm shows a loading state.
- Errors are surfaced as toasts and inline error messages in the form.
- Scope cards show `status` from `PipelineExecutionResult` once completed.

---

## 5. State Management

### 5.1 Zustand store structure

```ts
interface ScopeState {
  scopes: ScopeSummary[];
  selectedScopeId?: string;
  resultsByScopeId: Record<string, PipelineExecutionResult>;
  selectScope: (id: string) => void;
  upsertScopeResult: (id: string, scope: ScopeSummary, result: PipelineExecutionResult) => void;
}
```

- `scopes` – list of scopes (id, name, filters) for the left sidebar.
- `resultsByScopeId` – full pipeline results (dataset + trace) keyed by scope id.
- `selectedScopeId` – which scope is active in the main canvas and right panel.

React Query handles **fetching/mutations**; Zustand holds **UI-level selection and indexing**.

---

## 6. Visual Layout Diagrams

### 6.1 Scope generator main screen (ASCII)

```
+-------------------------------------------------------------+
|  Left: ScopeSelector   |     Main: Dataset      |  Right:   |
|                        |     (Interviews)       | Analysis  |
|  [Search scopes]       |  [InterviewBrowser]    | & Trace   |
|  [Filters...]          |                        |           |
|  [ + New scope ]       |                        | [Tabs]    |
|  [ScopeCard A  ✔]      |                        | - Trace   |
|  [ScopeCard B  ●]      |                        | - Quality |
|  [ScopeCard C  ✖]      |                        | - Export  |
+-------------------------------------------------------------+
```

### 6.2 Scope creation form

- Modal with fields for `BusinessContext` + advanced options.
- "Generate dataset" button triggers `/pipeline/run-async` and shows progress.

### 6.3 Execution trace cards

- Vertical stack of cards, one per pipeline stage:
  - Title: stage name.
  - Badge: status (Completed / Failed / Skipped).
  - Metrics from `outputs` (interview count, persona count, etc.).

This document should give a frontend engineer enough detail to implement the
scope generator UI and wire it to the AxPersona pipeline without needing
additional backend clarification.

