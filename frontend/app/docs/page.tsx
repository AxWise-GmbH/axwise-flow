'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  BookOpen, 
  Code, 
  Cpu, 
  GitBranch, 
  Lock, 
  Server, 
  Shield, 
  Terminal as TerminalIcon,
  ChevronRight,
  Activity,
  Check
} from 'lucide-react';

function HighlightPython({ code, dark = false }: { code: string; dark?: boolean }) {
  const lines = code.split('\n');
  return (
    <code className={`block font-mono text-xs whitespace-pre-wrap break-all break-words leading-relaxed ${dark ? 'text-stone-300' : 'text-stone-800'}`}>
      {lines.map((line, lineIdx) => {
        if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
          return (
            <div key={lineIdx} className={`${dark ? 'text-stone-500' : 'text-stone-400'} font-mono italic`}>
              {line}
            </div>
          );
        }

        const tokens = line.split(/(".*?"|'.*?'|\b(?:import|as|from|def|class|return|requests|print|json)\b)/g);
        return (
          <div key={lineIdx} className="font-mono">
            {tokens.map((token, tokenIdx) => {
              if (token.startsWith('"') || token.startsWith("'")) {
                return (
                  <span key={tokenIdx} className="text-emerald-600 font-medium whitespace-pre-wrap break-all">
                    {token}
                  </span>
                );
              }
              if (['import', 'as', 'from', 'def', 'class', 'return'].includes(token)) {
                return (
                  <span key={tokenIdx} className={`${dark ? 'text-stone-100' : 'text-stone-900'} font-bold`}>
                    {token}
                  </span>
                );
              }
              if (['requests', 'print', 'json'].includes(token)) {
                return (
                  <span key={tokenIdx} className={`${dark ? 'text-blue-400' : 'text-indigo-600'} font-semibold`}>
                    {token}
                  </span>
                );
              }
              return <span key={tokenIdx} className="whitespace-pre-wrap break-all">{token}</span>;
            })}
          </div>
        );
      })}
    </code>
  );
}

function HighlightJSON({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <code className="block font-mono text-xs text-stone-300 whitespace-pre-wrap break-all break-words leading-relaxed">
      {lines.map((line, lineIdx) => {
        const tokens = line.split(/(".*?"(?=\s*:)|\".*?\"|\b(?:true|false|null)\b|\b\d+(?:\.\d+)?\b)/g);
        return (
          <div key={lineIdx} className="font-mono">
            {tokens.map((token, tokenIdx) => {
              if (token.startsWith('"') && token.endsWith('"')) {
                const isKey = token.includes('"') && !line.includes('//') && line.split(token)[1]?.trim().startsWith(':');
                if (isKey) {
                  return (
                    <span key={tokenIdx} className="text-[#34D399] font-medium whitespace-pre-wrap break-all">
                      {token}
                    </span>
                  );
                }
                return (
                  <span key={tokenIdx} className="text-stone-300 whitespace-pre-wrap break-all">
                    {token}
                  </span>
                );
              }
              if (['true', 'false'].includes(token)) {
                return (
                  <span key={tokenIdx} className="text-amber-400 font-semibold">
                    {token}
                  </span>
                );
              }
              if (token === 'null') {
                return (
                  <span key={tokenIdx} className="text-stone-500 font-semibold">
                    {token}
                  </span>
                );
              }
              if (/^\d+(?:\.\d+)?$/.test(token)) {
                return (
                  <span key={tokenIdx} className="text-blue-400">
                    {token}
                  </span>
                );
              }
              return <span key={tokenIdx} className="whitespace-pre-wrap break-all">{token}</span>;
            })}
          </div>
        );
      })}
    </code>
  );
}

export default function DocsPage(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-[#FCFAF7] text-[#1C1917] font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* ----------------- Minimal, Premium Header ----------------- */}
      <header className="sticky top-0 z-50 bg-[#FCFAF7]/90 backdrop-blur-md border-b border-[#EAE6DF] px-4 lg:px-8 xl:px-16 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}><rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/><path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            <span className="font-serif font-bold text-lg tracking-tight">AxWise</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-8 text-xs xl:text-sm font-medium text-stone-600">
          <Link href="/#decision-lab" className="hover:text-stone-900 transition-colors">Decision Lab</Link>
          <Link href="/#evidence" className="hover:text-stone-900 transition-colors">Evidence</Link>
          <Link href="/#trust" className="hover:text-stone-900 transition-colors">Trust Boundary</Link>
          <Link href="/#execution" className="hover:text-stone-900 transition-colors">Orqaly Integration</Link>
          <Link href="/#use-cases" className="hover:text-stone-900 transition-colors">Use Cases</Link>
        </nav>

        <div className="flex items-center gap-3">
          <a 
            href="https://github.com/AxWise-GmbH/axwise-flow-oss"
            target="_blank" 
            rel="noopener noreferrer" 
            className="hidden lg:inline-flex items-center gap-2 px-3.5 py-1.5 border border-stone-300 rounded-md text-xs font-mono text-stone-700 hover:border-stone-900 hover:text-stone-900 transition-all"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Apache 2.0 OSS
          </a>
          <Link 
            href="/" 
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1C1917] hover:bg-stone-800 text-[#FCFAF7] rounded-md text-xs font-medium tracking-tight transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Main Gate
          </Link>
        </div>
      </header>

      {/* ----------------- Main Layout ----------------- */}
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-16 grid lg:grid-cols-12 gap-12">
        
        {/* Left column: Sidebar */}
        <aside className="lg:col-span-3 space-y-8 lg:sticky lg:top-24 h-fit">
          <div className="space-y-2">
            <span className="text-xs font-mono text-stone-400 uppercase tracking-wider">// COGNITIVE DECISION API</span>
            <h1 className="font-serif text-2xl text-stone-900">Developer Docs</h1>
          </div>
          
          <nav className="flex flex-col gap-2.5 text-sm">
            <a href="#installation" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">1. Setup &amp; Docker</a>
            <a href="#decision" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">2. Create a Decision</a>
            <a href="#continue" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">3. Retrieve &amp; Refresh</a>
            <a href="#outcomes" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">4. Replan &amp; Outcomes</a>
            <a href="#research" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">5. Lower-level Research</a>
            <a href="#trust-boundary" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">6. Trust Boundary</a>
          </nav>

          <div className="bg-white border border-[#EAE6DF] p-4 rounded-lg space-y-3 shadow-sm text-xs">
            <div className="flex items-center gap-1.5 text-stone-500 font-mono text-[10px]">
              <Shield className="w-3 h-3 text-emerald-600" />
              <span>TRUST BOUNDARY</span>
            </div>
            <p className="text-stone-600 leading-normal">
              The core is self-hostable. The hosted reference contract shown here is currently optimized for Orqaly. AxWise remains advisory; the integrating host owns identity, approvals, connector access, execution, and delivery.
            </p>
          </div>
        </aside>

        {/* Right column: Interactive API Content */}
        <main className="lg:col-span-9 space-y-16">
          
          {/* Section 1: Installation */}
          <section id="installation" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">1. Run the Reference Stack</h2>
              <p className="text-sm text-stone-500 mt-1">Start PostgreSQL, the FastAPI decision service, and the durable research worker together.</p>
            </div>

            <p className="text-stone-700 text-sm leading-relaxed">
              The decision endpoint can return a durable research job, so running only the backend is incomplete. The repository&apos;s Docker Compose stack builds the actual backend image, applies database migrations during API startup, and starts the worker that claims queued research.
            </p>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-stone-700 leading-relaxed">
              <strong className="font-semibold text-stone-900">Product boundary:</strong>{' '}
              the Apache-2.0 cognitive core is self-hostable. The current hosted path, headers, and tenant-mapping model below are the Orqaly reference adapter—not yet a product-neutral hosted contract. Another host product can integrate the core, but it must supply its own trusted identity, authorization, approval, and execution boundary.
            </div>

            <div className="bg-[#1A1A1A] text-stone-300 rounded-lg p-4 font-mono text-xs border border-stone-800 shadow-md">
              <div className="text-[10px] text-stone-500 border-b border-stone-800 pb-1.5 mb-2.5">// Fresh clone · backend + durable worker</div>
              <HighlightPython dark code={`git clone https://github.com/AxWise-GmbH/axwise-flow-oss.git
cd axwise-flow-oss
cp .env.example .env

# Set GEMINI_API_KEY in .env.
# Replace AXWISE_API_KEY before exposing the service.
docker compose up -d --build db backend worker

# Health and interactive OpenAPI
docker compose ps
curl http://localhost:8000/health
# Visit http://localhost:8000/docs`} />
            </div>

            <p className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-lg p-4 leading-relaxed">
              The reference endpoints fail closed unless a trusted host tenant is mapped to an AxWise workspace. For a local-only reference tenant, run{' '}
              <code>docker compose exec backend python -m backend.scripts.seed_reference_tenant --org-id local-org --user-id local-user</code>.
              Provision production mappings through an administrator-controlled process, never from a browser request.
            </p>
          </section>

          {/* Section 2: Create a decision */}
          <section id="decision" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">2. Create an Evidence-aware Decision</h2>
              <p className="text-sm text-stone-500 mt-1">POST /api/orqaly-axwise/v1/orchestration/decisions</p>
            </div>

            <p className="text-[#1C1917] text-sm leading-relaxed">
              Start every integrated goal here. AxWise evaluates ambiguity, evidence sufficiency, consequence, and value of more information before choosing direct, evidence-assisted, bounded-research, or human-clarification routing. It then returns an immutable recommendation package. It does not authorize or execute the recommendation.
            </p>

            <div className="grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] p-5 rounded-lg shadow-sm">
              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Trusted host request</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`import requests

base = "https://api.axwise.de/api/orqaly-axwise/v1"
headers = {
    "x-axwise-key": "<SERVICE_KEY>",
    "Idempotency-Key": "<GOAL_VERSION_KEY>",
    "X-Request-ID": "<TRACE_ID>"
}
payload = {
    "contract_version": "1.0",
    "tenant": {
        "orgId": "<ORQALY_ORG_ID>",
        "userId": "<ORQALY_USER_ID>"
    },
    "task": {
        "contract_version": "1.0",
        "task_id": "goal-warehouse-handoff-v1",
        "domain": "operations",
        "objective": "Reduce damage at warehouse handoffs",
        "desired_outcome": "A reviewed plan with owners and measurable controls",
        "required_capabilities": ["operational analysis"],
        "preferred_capabilities": ["stakeholder communication"],
        "stakeholders": ["warehouse manager", "shift lead"],
        "constraints": ["No external side effect without host approval"],
        "data_classification": "internal",
        "risk_level": "medium"
    },
    "available_agents": [{
        "agent_id": "agent-operations",
        "org_id": "<ORQALY_ORG_ID>",
        "name": "Operations Analyst",
        "capabilities": [
            "operational analysis",
            "stakeholder communication"
        ],
        "availability": "available",
        "max_data_classification": "confidential",
        "max_risk_level": "high"
    }],
    "policy_context": {
        "maximum_risk_without_human": "medium",
        "guardrails": ["The host must approve execution"]
    },
    "budget": {
        "currency": "EUR",
        "maximum_cost": 25,
        "maximum_latency_ms": 120000
    }
}
response = requests.post(
    f"{base}/orchestration/decisions",
    headers=headers,
    json=payload,
    timeout=30
)
response.raise_for_status()`} />
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Immutable recommendation excerpt · HTTP 201</span>
                <div className="bg-[#1A1A1A] p-4 rounded-lg border border-stone-900 shadow-md">
                  <HighlightJSON code={`{
  "contract_version": "1.0",
  "decision_id": "decision-…",
  "task_id": "goal-warehouse-handoff-v1",
  "routing_mode": "direct",
  "status": "recommended",
  "recommended_agents": [{
    "agent_id": "agent-operations",
    "eligible": true,
    "score": 0.82,
    "factors": []
  }],
  "execution_plan": {
    "nodes": [{
      "node_id": "node-direct-assignment",
      "assigned_agent_id": "agent-operations"
    }],
    "executable": true
  },
  "approval_points": [],
  "evidence": [],
  "confidence": 0.82,
  "requires_orqaly_authorization": true,
  "request_hash": "4c61236d…"
}`} />
                </div>
              </div>
            </div>

            <p className="text-xs text-stone-600 bg-emerald-50 border border-emerald-200 rounded-lg p-4 leading-relaxed">
              Construct <code>available_agents</code>, <code>available_tools</code>, policy, and tenant identifiers on the trusted host backend from the authenticated catalogue. Never accept candidate ownership, the machine credential, or authorization decisions from a browser. Retrieve the exact JSON Schemas at <code>/orchestration/schemas/decision-request-v1</code> and <code>/orchestration/schemas/execution-outcome-v1</code>.
            </p>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-xs text-stone-600 leading-relaxed">
              <strong className="text-stone-900">Failure contract:</strong> <code>401</code> missing or invalid service key; <code>403</code> inactive or unknown tenant mapping; <code>409</code> idempotency key reused with different input; <code>422</code> invalid strict contract. Retry transient failures with backoff and the same idempotency key.
            </div>
          </section>

          {/* Section 3: Retrieve and refresh */}
          <section id="continue" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">3. Retrieve or Refresh the Decision</h2>
              <p className="text-sm text-stone-500 mt-1">GET /decisions/{`{decision_id}`} · POST /decisions/{`{decision_id}`}/research/refresh</p>
            </div>

            <p className="text-[#1C1917] text-sm leading-relaxed">
              A direct, evidence-assisted, or clarification decision is immediately retrievable. A research-assisted decision returns <code>status: pending_research</code> and a durable <code>research_job</code>. Call refresh with a new idempotency key: HTTP 202 means the worker is still running; HTTP 201 returns a new linked decision after the evidence is available. The original snapshot is never rewritten.
            </p>

            <div className="grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] p-5 rounded-lg shadow-sm">
              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Tenant-scoped retrieval</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`tenant_headers = {
    "x-axwise-key": "<SERVICE_KEY>",
    "X-Orqaly-Org-ID": "<ORQALY_ORG_ID>",
    "X-Orqaly-User-ID": "<ORQALY_USER_ID>"
}
decision = requests.get(
    f"{base}/orchestration/decisions/{decision_id}",
    headers=tenant_headers,
    timeout=30
)
decision.raise_for_status()`} />
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Continue bounded research</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`refresh_headers = {
    **tenant_headers,
    "Idempotency-Key": "<REFRESH_ATTEMPT_KEY>",
    "X-Request-ID": "<TRACE_ID>"
}
refreshed = requests.post(
    f"{base}/orchestration/decisions/{decision_id}/research/refresh",
    headers=refresh_headers,
    timeout=30
)
if refreshed.status_code == 202:
    # Keep the goal non-executable and retry with backoff.
    pass
elif refreshed.status_code in (200, 201):
    next_decision = refreshed.json()
else:
    refreshed.raise_for_status()`} />
                </div>
              </div>
            </div>

            <div className="bg-[#1A1A1A] p-4 rounded-lg border border-stone-900 shadow-md">
              <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block mb-3">// Research-assisted state excerpt</span>
              <HighlightJSON code={`{
  "decision_id": "decision-parent",
  "routing_mode": "research_assisted",
  "status": "pending_research",
  "research_job": {
    "job_id": "hybrid-…",
    "status": "queued",
    "pipeline": "hybrid_a_plus_b"
  },
  "execution_plan": {"nodes": [], "executable": false},
  "requires_orqaly_authorization": true
}`} />
            </div>
          </section>

          {/* Section 4: Replan and outcomes */}
          <section id="outcomes" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">4. Replan and Report Outcomes</h2>
              <p className="text-sm text-stone-500 mt-1">Immutable recovery decisions and observed execution receipts</p>
            </div>

            <p className="text-[#1C1917] text-sm leading-relaxed">
              If the host rejects a recommendation or live execution state changes, request a linked replan instead of mutating the original decision. After the host authorizes and executes the plan, report observed outcomes using the real decision, node, and agent IDs. Outcomes improve evaluation; they do not give AxWise authority to run anything.
            </p>

            <div className="grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] p-5 rounded-lg shadow-sm">
              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Replan after live state changes</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`replan = requests.post(
    f"{base}/orchestration/decisions/{decision_id}/replan",
    headers={
        **tenant_headers,
        "Idempotency-Key": "<REPLAN_KEY>"
    },
    json={
        "contract_version": "1.0",
        "trigger": "agent_unavailable",
        "reason": "Selected agent became unavailable",
        "unavailable_agent_ids": ["agent-operations"],
        "replacement_agents": [{
            "agent_id": "agent-operations-backup",
            "org_id": "<ORQALY_ORG_ID>",
            "name": "Backup Operations Analyst",
            "capabilities": ["operational analysis"],
            "availability": "available"
        }]
    },
    timeout=30
)
replan.raise_for_status()`} />
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Outcome after host execution</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`outcome = requests.post(
    f"{base}/orchestration/decisions/{decision_id}/outcomes",
    headers={
        **tenant_headers,
        "Idempotency-Key": "<OUTCOME_KEY>"
    },
    json={
        "contract_version": "1.0",
        "outcome_id": "outcome-goal-warehouse-v1",
        "decision_id": decision_id,
        "authorization_status": "approved",
        "execution_status": "completed",
        "task_success": True,
        "quality_score": 0.86,
        "stakeholder_acceptance": 0.80,
        "cost": 7.50,
        "currency": "EUR",
        "latency_ms": 42000,
        "node_receipts": [{
            "receipt_id": "receipt-node-direct-v1",
            "node_id": "node-direct-assignment",
            "agent_id": "agent-operations",
            "status": "completed",
            "quality_score": 0.86
        }]
    },
    timeout=30
)
outcome.raise_for_status()`} />
                </div>
              </div>
            </div>

            <p className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-lg p-4 leading-relaxed">
              List accepted records with <code>GET /orchestration/decisions/{`{decision_id}`}/outcomes</code>. Reuse the same idempotency key only for an identical body; changed retries return HTTP 409.
            </p>
          </section>

          {/* Section 5: Lower-level research */}
          <section id="research" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">5. Lower-level Research Is Secondary</h2>
              <p className="text-sm text-stone-500 mt-1">POST /api/orqaly-axwise/v1/simulate-enhanced-async</p>
            </div>

            <p className="text-[#1C1917] text-sm leading-relaxed">
              Use the enhanced simulation endpoint only when a trusted integration deliberately needs the raw durable customer-and-executor pipeline. It starts research unconditionally. For normal goal handling, the decision endpoint is the correct entry point because it may determine that existing evidence, direct routing, or human clarification is safer and faster.
            </p>

            <div className="bg-[#1A1A1A] p-4 rounded-lg border border-stone-900 shadow-md">
              <HighlightJSON code={`{
  "secondary_flow": {
    "start": "POST /api/orqaly-axwise/v1/simulate-enhanced-async",
    "status": "GET /api/orqaly-axwise/v1/runs/{job_id}/status",
    "result": "GET /api/orqaly-axwise/v1/runs/{job_id}",
    "cancel": "POST /api/orqaly-axwise/v1/runs/{job_id}/cancel"
  },
  "rule": "Synthetic output remains an unverified working hypothesis",
  "preferred_goal_entry": "POST /api/orqaly-axwise/v1/orchestration/decisions"
}`} />
            </div>
          </section>

          {/* Section 6: Execution boundary */}
          <section id="trust-boundary" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">6. Host Authorization and Execution Boundary</h2>
              <p className="text-sm text-stone-500 mt-1">AxWise intelligence → host approval, tools, execution, and delivery</p>
            </div>

            <p className="text-[#1C1917] text-sm leading-relaxed">
              AxWise returns who the work is for, what remains uncertain, the ideal executor requirements, a goal-specific execution persona, ranked eligible agents or teams, and an advisory plan. In the reference integration, Orqaly preserves permanent Agent Hub identities and owns both human gates, tenant ownership, live availability, budget, connectors, execution, monitoring, and delivery.
            </p>

            <div className="grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] p-5 rounded-lg shadow-sm">
              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// AxWise returns advice</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`# Evidence-bounded customer and stakeholder context
# Ideal executor requirements and goal persona overlay
# Ranked authenticated catalogue candidates
# Routing rationale, confidence, plan, and fallbacks
# Immutable request and decision hashes
# requires_orqaly_authorization = True`} />
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// The host remains authoritative</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`# Authenticate the user and establish tenant ownership
# Confirm context before planning
# Confirm exact team, tools, budget, and plan before execution
# Revalidate approvals and live state when a queued task starts
# Execute through customer-authorized connectors
# Deliver output and report observed outcomes`} />
                </div>
              </div>
            </div>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4">
              Legacy <code>/twins/*</code> demonstration routes are not the cognitive decision contract. Do not build new integrations against them. Self-hosting gives you control of the data plane; it does not by itself establish authorization, compliance, or safe autonomy.
            </p>
          </section>

        </main>
      </div>

      {/* Footer */}
      <footer className="bg-[#121212] text-stone-500 px-6 lg:px-16 py-8 border-t border-stone-900 text-xs flex flex-wrap justify-between items-center mt-12">
        <div>© 2026 AxWise. AxWise Flow is licensed under Apache 2.0.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <Link href="/privacy-policy" className="hover:text-stone-300">Privacy Policy</Link>
          <Link href="/terms-of-service" className="hover:text-stone-300">Terms of Service</Link>
          <Link href="/impressum" className="hover:text-stone-300">Impressum</Link>
        </div>
      </footer>

    </div>
  );
}
