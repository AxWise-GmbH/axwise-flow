# Orqaly ↔ AxWise Conditions Integration: End-to-End Implementation Guide

This guide establishes the comprehensive technical blueprint for implementing the **Orqaly (Node.js/ESM/Supabase)** side of the Greenfield Conditions Evaluation integration. 

By offloading cognitive reasoning (OCEAN modeling, jailbreak scanning, advisory RBAC, and post-hoc sentence grounding) to the self-hosted **AxWise Flow Engine (Python)**, Orqaly functions strictly as a high-performance execution plane (CRUD, sandboxed runtimes, rate limits, and billing metrics).

---

## 🧭 The Core Synchronization Boundary

```
  [ Orqaly Agentic OS (Node) ]                         [ AxWise Flow Engine (Python) ]
               │                                                      │
               │────── POST /v1/conditions/evaluate ─────────────────►│
               │       Header: x-axwise-key                           │ (Constant-time Check)
               │                                                      │
               │◄───── Returns: ProcessedOutputs + Meta ──────────────│ (Cached via RequestID)
               │                                                      │
```

1. **The Infrastructure Boundary**: Orqaly handles binary file compilation (PDF, MP4, PNG), database storage, SMTP/IMAP network sockets, and third-party SaaS integrations (Slack, Twilio) strictly **LOCALLY**.
2. **The Cognitive Boundary**: AxWise processes psychographics, regulatory frameworks, character offsets, and injection auditing strictly **REMOTELY**.
3. **The Shared Key Model**: All machine-to-machine (M2M) backend calls authenticate using a shared secret key passed in the `x-axwise-key` HTTP header.

---

## 🔑 Environment Configuration (`.env`)

To establish secure system-to-system communication, both environments must be configured with the identical shared secret. **Never commit actual production keys in plain-text code files or repositories.**

### A. Orqaly Server Environment (`.env`)
Add these variables to Orqaly's secure vault or local configuration:
```bash
# AxWise Flow Engine target URL (Production server is hosted at api.axwise.de)
AXWISE_API_URL="https://api.axwise.de/api/orqaly-axwise/v1"

# Shared Machine-to-Machine Secret Key (Set securely in environment vaults)
AXWISE_API_KEY="<YOUR_SECURE_M2M_SECRET_KEY>"

# Integration switches:
# AXWISE_ENABLE: Bypasses network call entirely when false, falling back to local heuristics
AXWISE_ENABLE="true"

# AXWISE_ENFORCE: "shadow" logs decisions side-by-side; "authoritative" enforces AxWise security blocks
# Always default to "shadow" on initial rollout to verify latency before swapping to authoritative
AXWISE_ENFORCE="shadow"
```

### B. AxWise Server Environment (`backend/.env.oss`)
Set the matching secret in the AxWise environment:
```bash
AXWISE_API_KEY="<YOUR_SECURE_M2M_SECRET_KEY>"
```

---

## 📁 Directory Structure & Module Layout

Implement the integration logic inside a single, isolated module within Orqaly's service directory as an **ES Module (`"type": "module"`)**:

```text
lib/integrations/axwise/
├── client.js          # Core HTTP request dispatching with fetchWithRetry
├── context.js         # Pure builders compiling local facts into schemas
├── pre-classifier.js  # Intercepts chitchat/pure-reads to conserve tokens
├── degrade.js         # Wrapper managing fail-open/fail-closed postures
├── tracked.js         # Logs usage and cost metrics to the llm_usage ledger
├── types.js           # TypeScript or JSDoc contract interfaces
└── index.js           # Barrel export interface
```

---

## 📝 TypeScript / JSDoc API Contract Types

Maintain these schema models inside `lib/integrations/axwise/types.js` to ensure contract conformity:

```javascript
/**
 * @typedef {Object} TenantContext
 * @property {string} userId - Unique authenticated user ID
 * @property {string} orgId - Unique tenant organization ID
 */

/**
 * @typedef {Object} ConditionsEvaluationRequest
 * @property {"consilium.create" | "agent.generate" | "copilot.chat" | "copilot.ground"} integrationPoint
 * @property {string} requestId - UUID for idempotency and tracing
 * @property {TenantContext} tenant
 * @property {Record<string, any>} payload - Local facts representing current point state
 */

/**
 * @typedef {Object} AuditMarker
 * @property {string} category
 * @property {string} decision
 * @property {string} reason
 */

/**
 * @typedef {Object} GroundingClaim
 * @property {string} claim - The matched sentence string
 * @property {number} offset_start - Starting index inside the response string
 * @property {number} offset_end - Ending index inside the response string
 * @property {string} source_file - Reference source file name
 */

/**
 * @typedef {Object} ProcessedOutputs
 * @property {string} [systemPromptFragment] - Ready-to-merge system prompt instructions
 * @property {Object} [persona] - Digital twin psychographic DNA (archetype, ocean, tone, temperature)
 * @property {Object} [security] - Advisory permissions (scopeDecision: "allowed" | "denied", blockReason)
 * @property {Object} [governance] - Board constraints (consensus_type, quorum, thresholds)
 * @property {Object} [grounding] - Array of verified GroundingClaim items
 * @property {Object} [classification] - Intent classification, execution mode, sentiment, and theme
 */

/**
 * @typedef {Object} ConditionsEvaluationResponse
 * @property {AuditMarker[]} applicableConditions
 * @property {ProcessedOutputs} processedOutputs
 * @property {Object} meta - Telemetry (cost, latencyMs, model, traceId, degraded)
 */
```

---

## 🚀 Greenfield Client Implementation Code

### 1. The HTTP Gateway Client (`client.js`)
Handles raw network delivery, timeout parameters, retries, and errors using standard ESM exports and correct `fetchWithRetry` signature:

```javascript
// lib/integrations/axwise/client.js
import { fetchWithRetry } from '../../api/_lib/fetch.js';

export async function evaluateConditions(integrationPoint, requestId, tenant, payload) {
  const apiUrl = process.env.AXWISE_API_URL;
  const apiKey = process.env.AXWISE_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error('Integration Error: Missing AXWISE_API_URL or AXWISE_API_KEY in environment.');
  }

  // Real Signature: fetchWithRetry(url, options, config)
  const response = await fetchWithRetry(
    `${apiUrl}/conditions/evaluate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-axwise-key': apiKey
      },
      body: JSON.stringify({
        integrationPoint,
        requestId,
        tenant,
        payload
      })
    },
    {
      timeoutMs: integrationPoint === 'copilot.chat' ? 3000 : 8000,
      retries: 1
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AxWise API Error [HTTP ${response.status}]: ${errorBody.slice(0, 200)}`);
  }

  return response.json();
}
```

### 2. The Token-Conservation Pre-Classifier (`pre-classifier.js`)
Filters out smalltalk, database reads, and billing questions locally before triggering any network payloads:

```javascript
// lib/integrations/axwise/pre-classifier.js
import { matchSmalltalk } from '../../communicator-handlers/smalltalk.js';

export function shouldEvaluate(integrationPoint, payload) {
  if (integrationPoint !== 'copilot.chat') {
    return true; // Force evaluation for create/generate/ground points
  }

  const message = payload.message || '';
  
  // 1. Filter Chitchat / Smalltalk
  if (matchSmalltalk(message)) {
    return false;
  }

  // 2. Filter Static Reads and Billing
  const lowercaseMsg = message.toLowerCase();
  if (lowercaseMsg.includes('billing') || lowercaseMsg.includes('invoice') || lowercaseMsg.includes('receipt')) {
    return false;
  }

  return true;
}
```

### 3. Graceful Hybrid Degradation (`degrade.js`)
Implements the fail-safe wrapper managing `fail-closed` (for security/generation endpoints) and `fail-open` (for tone/styling/grounding endpoints):

```javascript
// lib/integrations/axwise/degrade.js
import { evaluateConditions } from './client.js';
import { shouldEvaluate } from './pre-classifier.js';

export async function withAxwise(integrationPoint, requestId, tenant, payload, fallbackFn, options = {}) {
  const { posture = 'open' } = options;

  // 1. Check if the integration switch is toggled active
  if (process.env.AXWISE_ENABLE !== 'true') {
    return { degraded: true, ...fallbackFn() };
  }

  // 2. Scan request locally against the token conservation pre-classifier
  if (!shouldEvaluate(integrationPoint, payload)) {
    return { degraded: false, ...fallbackFn() };
  }

  try {
    const result = await evaluateConditions(integrationPoint, requestId, tenant, payload);
    return { degraded: false, ...result };
  } catch (error) {
    console.error(`[AXWISE INTEGRATION DEGRADED] Error on point: ${integrationPoint}:`, error);

    // Enforce FAIL-CLOSED on security-sensitive operations (e.g. Agent Generation)
    if (posture === 'closed' || integrationPoint === 'agent.generate') {
      return {
        degraded: true,
        applicableConditions: [{ category: "system_degradation", decision: "blocked", reason: error.message }],
        processedOutputs: {
          security: {
            scopeDecision: 'denied',
            requiresApproval: false,
            blockReason: 'Verification Service Offline: Cannot securely compile instructions. Request halted for safety.'
          }
        }
      };
    }

    // Fall back gracefully under FAIL-OPEN operations (e.g. Copilot Tone)
    return {
      degraded: true,
      applicableConditions: [{ category: "system_degradation", decision: "fail_open_active", reason: error.message }],
      ...fallbackFn()
    };
  }
}
```

### 4. Direct Cost Ledger Tracking (`tracked.js`)
Registers actual token usage / API expenditure directly inside the unified `llm_usage` ledger using standard Supabase schemas:

```javascript
// lib/integrations/axwise/tracked.js
import { buildSupabaseAdminClient } from '../../api/_lib/supabase.js';

export async function recordAxWiseUsage(userId, integrationPoint, meta) {
  if (!meta || meta.degraded) return;
  
  try {
    const admin = buildSupabaseAdminClient();
    await admin.from('llm_usage').insert({
      user_id: userId,
      source: 'axwise',
      operation: integrationPoint,
      model: meta.model || 'enhanced_gemini',
      cost: meta.cost || 0.0,
      tokens: 0 // Default fallback for cognitive evaluation metrics
    });
  } catch (err) {
    console.error('Failed recording AxWise expenditure metrics:', err);
  }
}
```

---

## 🔌 Wiring & Integration Points

### 1. Consilium Creation (`lib/concilium-handlers/boards.js`)
Before saving a board record, intercept to obtain governance defaults and compliance frameworks. Resolves users and writes split governance thresholds across canonical database tables (`concilium` and `concilium_consensus_rules`):

```javascript
// Inside boards.js - POST board handler
import { withAxwise } from '../integrations/axwise/degrade.js';
import { verifySupabaseToken, getBearerToken } from '../api/_lib/auth.js';
import { buildSupabaseAdminClient } from '../api/_lib/supabase.js';

// Resolve caller using the authoritative auth tokens
const user = await verifySupabaseToken(getBearerToken(req));
const resolvedOrgId = req.body.orgId || null; // Resolved based on active user context
const tenant = { userId: user.id, orgId: resolvedOrgId };

const uuidVal = uuidv4();
const fallback = () => ({
  processedOutputs: {
    governance: { consensus_type: "majority", quorum: 3, approval_threshold: 0.66, split_decision_strategy: "escalate" }
  }
});

const result = await withAxwise(
  'consilium.create',
  uuidVal,
  tenant,
  { name, purpose, description, security_level },
  fallback,
  { posture: 'open' }
);

// 1. Save thresholds to Board metadata
const admin = buildSupabaseAdminClient();
const boardInsert = await admin.from('concilium').insert({
  name,
  purpose,
  description,
  user_id: user.id,
  org_id: resolvedOrgId,
  axwise: {
    requestId: uuidVal,
    applicableConditions: result.applicableConditions,
    processedOutputs: result.processedOutputs
  }
}).select('*').single();

// 2. Save consensus metrics to canonical concilium_consensus_rules table
const gov = result.processedOutputs?.governance;
await admin.from('concilium_consensus_rules').insert({
  board_id: boardInsert.data.id,
  consensus_type: gov?.consensus_type || "majority",
  quorum: gov?.quorum || 3,
  approval_threshold: gov?.approval_threshold || 0.66,
  split_decision_strategy: gov?.split_decision_strategy || "owner_escalation"
});
```

---

### 2. On-Demand Agent Generation (`lib/concilium-handlers/agent-factory.js`)
Intercept generation to run jailbreak scanning. Authoritative validation and RLS checks remain locally within Orqaly, with AxWise auditing serving as an advisory gate:

```javascript
// Inside agent-factory.js - Agent builder
import { withAxwise } from '../integrations/axwise/degrade.js';
import { verifySupabaseToken, getBearerToken } from '../api/_lib/auth.js';
import { buildSupabaseAdminClient } from '../api/_lib/supabase.js';

const user = await verifySupabaseToken(getBearerToken(req));
const tenant = { userId: user.id, orgId: resolvedOrgId };

const uuidVal = uuidv4();
const result = await withAxwise(
  'agent.generate',
  uuidVal,
  tenant,
  { config, board_id, requestContext },
  () => ({}),
  { posture: 'closed' } // Fail-Closed
);

// Perform Advisory Security enforcement if AXWISE_ENFORCE is authoritative
const security = result.processedOutputs?.security;
if (process.env.AXWISE_ENFORCE === 'authoritative' && security?.scopeDecision === 'denied') {
  // If degraded: true, Orqaly overrides decision to fail-closed
  throw new Error(`Security Violation blocked by AxWise: ${security.blockReason}`);
}

// ALWAYS retain local guardUserContent() and RLS as the core authoritative safety gateway
await guardUserContent(config.system_prompt);

// Prepend systemPromptFragment instructions
const finalPrompt = `${result.processedOutputs?.systemPromptFragment || ''}\n${config.system_prompt}`;

const admin = buildSupabaseAdminClient();
await admin.from('concilium_agents').insert({
  system_prompt: finalPrompt,
  user_id: user.id,
  axwise: result // Store full transaction details for audit trails
});
```

---

### 3. Copilot Chat Loop (`lib/agent-handlers/copilot.js`)
Front the chat loop to apply tone modification system fragments, while keeping security guards intact:

```javascript
// Inside copilot.js
import { withAxwise } from '../integrations/axwise/degrade.js';
import { recordAxWiseUsage } from '../integrations/axwise/tracked.js';

const uuidVal = uuidv4();
const tenant = { userId: user.id, orgId: resolvedOrgId };

// Always retain local guardUserContent as the primary, authoritative access checker
await guardUserContent(message);

const result = await withAxwise(
  'copilot.chat',
  uuidVal,
  tenant,
  { message, history, active_twin_id: activeTwinId, sender_role: req.body.userRole || 'admin' },
  () => ({
    processedOutputs: { systemPromptFragment: "Respond helpfully and politely." }
  }),
  { posture: 'open' }
);

// Enforce Advisory Verdict
if (process.env.AXWISE_ENFORCE === 'authoritative' && result.processedOutputs?.security?.scopeDecision === 'denied') {
  return sendBlockedUIResponse(result.processedOutputs.security.blockReason);
}

// Log execution costs to llm_usage ledger
if (result.meta) {
  await recordAxWiseUsage(user.id, 'copilot.chat', result.meta);
}

// Prepend systemPromptFragment to the final LLM prompt payload
const promptWithPersona = `${result.processedOutputs.systemPromptFragment}\n${systemPrompt}`;
const draftAnswer = await executeLocalLlm(promptWithPersona, message, history);

// Post-Hoc Asynchronous sentence-grounding checks (Bypasses hot-path execution queue)
triggerAsyncGrounding(draftAnswer, groundedResources, tenant, user.id, uuidVal);

return sendResponseToUser(draftAnswer);
```

### 4. Async Post-Hoc Grounding (`copilot.ground`)
Trigger the evaluation asynchronously after delivering the message, and push precision highlights or citations once matched using the correct `draft_response` schema contract parameter:

```javascript
// Asynchronous Grounding Event loop
import { evaluateConditions } from '../integrations/axwise/client.js';
import { recordAxWiseUsage } from '../integrations/axwise/tracked.js';

async function triggerAsyncGrounding(draftResponse, groundedResources, tenant, userId, originalRequestId) {
  try {
    const result = await evaluateConditions(
      'copilot.ground',
      uuidv4(),
      tenant,
      { draft_response: draftResponse, grounded_resources: groundedResources }
    );

    const grounding = result.processedOutputs.grounding;
    if (grounding && grounding.offsets.length > 0) {
      // Broadcast offset metrics and matched source files via WebSockets or push updates
      pushCitationsToClient(originalRequestId, grounding.offsets);
    }
    
    if (result.meta) {
      await recordAxWiseUsage(userId, 'copilot.ground', result.meta);
    }
  } catch (err) {
    console.error('Failed executing async grounding checks:', err);
  }
}
```

---

## 🗄️ Database Integration Migration (`Supabase / PostgreSQL`)

Add the dedicated `axwise` column to support central auditing.

Create migration `supabase/migrations/178_axwise_cognition.sql`:
```sql
-- Migration 178: Greenfield Cognitive Conditions Columns
-- Enables granular multi-tenant audit logs without contaminating baseline fields.

ALTER TABLE concilium 
ADD COLUMN IF NOT EXISTS axwise JSONB DEFAULT NULL;

ALTER TABLE concilium_members 
ADD COLUMN IF NOT EXISTS axwise JSONB DEFAULT NULL;

ALTER TABLE concilium_agents 
ADD COLUMN IF NOT EXISTS axwise JSONB DEFAULT NULL;

-- Enable indexing over requestId keys for expedited compliance lookups
CREATE INDEX IF NOT EXISTS idx_concilium_axwise_req_id 
ON concilium USING gin ((axwise->'requestId'));

CREATE INDEX IF NOT EXISTS idx_concilium_members_axwise_req_id 
ON concilium_members USING gin ((axwise->'requestId'));

CREATE INDEX IF NOT EXISTS idx_concilium_agents_axwise_req_id 
ON concilium_agents USING gin ((axwise->'requestId'));
```

---

## 📈 Multi-Tenant Shadow Rollout Guide

Follow these steps to safely roll out the integration in production environments:

1. **Deploy Module**: Run the database migration and ship the `lib/integrations/axwise/` module.
2. **Phase 1: Disabled (`AXWISE_ENABLE=false`)**: All endpoints default to local heuristics. No network payload is sent.
3. **Phase 2: Shadow Deployment (`AXWISE_ENABLE=true`, `AXWISE_ENFORCE=shadow`)**:
   * Outbound calls are executed.
   * Discrepancies between AxWise decisions vs. Orqaly local checks are logged.
   * `scopeDecision` denials do **NOT** block generation.
   * Latency and accuracy are audited.
4. **Phase 3: Authoritative Swapping (`AXWISE_ENABLE=true`, `AXWISE_ENFORCE=authoritative`)**:
   * Denials on `agent.generate` immediately block processing.
   * Local heuristics are deactivated and retained solely as local fallback handlers.
