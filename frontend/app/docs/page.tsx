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

function HighlightPython({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <code className="block font-mono text-xs text-stone-800 whitespace-pre-wrap break-all break-words leading-relaxed">
      {lines.map((line, lineIdx) => {
        if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
          return (
            <div key={lineIdx} className="text-stone-400 font-mono italic">
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
                  <span key={tokenIdx} className="text-stone-900 font-bold">
                    {token}
                  </span>
                );
              }
              if (['requests', 'print', 'json'].includes(token)) {
                return (
                  <span key={tokenIdx} className="text-indigo-600 font-semibold">
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
            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ width: '28px', height: '28px', flexShrink: 0 }}>
              <defs>
                <radialGradient id="o2_logo_docs" cx="40%" cy="40%"><stop offset="0%" stopColor="#34D399" stopOpacity="0.6"></stop><stop offset="100%" stopColor="#064E3B"></stop></radialGradient>
              </defs>
              <circle cx="32" cy="32" r="24" fill="url(#o2_logo_docs)"></circle>
              <circle cx="32" cy="32" r="22" fill="none" stroke="#34D399" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="20 15"></circle>
            </svg>
            <span className="font-sans font-medium text-sm text-stone-500">Orqaly</span>
            <span className="text-stone-300 font-light select-none">×</span>
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}><rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/><path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" stroke-width="2" fill="none" strokeLinejoin="round"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            <span className="font-serif font-bold text-lg tracking-tight">AxWise</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-8 text-xs xl:text-sm font-medium text-stone-600">
          <Link href="/#consilium" className="hover:text-stone-900 transition-colors">Consilium Sandbox</Link>
          <Link href="/#traceability" className="hover:text-stone-900 transition-colors">Traceability</Link>
          <Link href="/#policy" className="hover:text-stone-900 transition-colors">RBAC Gateway</Link>
          <Link href="/#twins" className="hover:text-stone-900 transition-colors">Digital Twins</Link>
          <Link href="/#compliance" className="hover:text-stone-900 transition-colors">Use Cases</Link>
        </nav>

        <div className="flex items-center gap-3">
          <a 
            href="https://github.com/AxWise-GmbH/axwise-flow" 
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
            <span className="text-xs font-mono text-stone-400 uppercase tracking-wider">// API ENGINE v2.4</span>
            <h2 className="font-serif text-2xl text-stone-900">Developer Docs</h2>
          </div>
          
          <nav className="flex flex-col gap-2.5 text-sm">
            <a href="#installation" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">1. Setup &amp; Docker</a>
            <a href="#simulate" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">2. Multi-Agent Simulation</a>
            <a href="#orchestration" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">3. Progress &amp; Retrieval</a>
            <a href="#twins-registry" className="text-stone-600 hover:text-stone-900 font-medium border-l border-stone-200 pl-4 py-1 hover:border-stone-900 transition-all">4. Twin Registry &amp; RBAC</a>
          </nav>

          <div className="bg-white border border-[#EAE6DF] p-4 rounded-lg space-y-3 shadow-sm text-xs">
            <div className="flex items-center gap-1.5 text-stone-500 font-mono text-[10px]">
              <Shield className="w-3 h-3 text-emerald-600" />
              <span>COMPLIANCE STATUS</span>
            </div>
            <p className="text-stone-600 leading-normal">
              Self-hosted executions prevent token leakages under the European AI Act.
            </p>
          </div>
        </aside>

        {/* Right column: Interactive API Content */}
        <main className="lg:col-span-9 space-y-16">
          
          {/* Section 1: Installation */}
          <section id="installation" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">1. Setup &amp; Docker Install</h2>
              <p className="text-sm text-stone-500 mt-1">Spin up the headless FastAPI server locally or build with Docker instantly.</p>
            </div>

            <p className="text-stone-700 text-sm leading-relaxed">
              AxWise Flow is built as a highly structured, decoupled Python package. Clone the open-source repository directly to configure local SQLite/Postgres pgvector grounding databases, or build the Docker image locally to run:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-[#1A1A1A] text-stone-300 rounded-lg p-4 font-mono text-xs border border-stone-800 shadow-md">
                <div className="text-[10px] text-stone-500 border-b border-stone-800 pb-1.5 mb-2.5">// Clone &amp; Run Local Server</div>
                <span className="text-emerald-500 select-none mr-1.5">$</span>
                <span className="text-stone-200">git clone https://github.com/AxWise-GmbH/axwise-flow.git &amp;&amp; cd axwise-flow &amp;&amp; ./scripts/oss/run_backend_oss.sh</span>
              </div>
              <div className="bg-[#1A1A1A] text-stone-300 rounded-lg p-4 font-mono text-xs border border-stone-800 shadow-md">
                <div className="text-[10px] text-stone-500 border-b border-stone-800 pb-1.5 mb-2.5">// Build &amp; Run Local Docker Container</div>
                <span className="text-emerald-500 select-none mr-1.5">$</span>
                <span className="text-stone-200">docker build -t axwise-flow -f backend/Dockerfile.production . &amp;&amp; docker run -p 8000:8000 axwise-flow</span>
              </div>
            </div>
          </section>

          {/* Section 2: Simulate Twin */}
          <section id="simulate" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">2. Multi-Agent Persona Simulation</h2>
              <p className="text-sm text-stone-500 mt-1">POST /api/orqaly-axwise/v1/simulate-async or /simulate-enhanced</p>
            </div>

            <p className="text-[#1C1917] text-sm leading-relaxed">
              Triggers a top-down psychologically-grounded user simulation. Generates individual OCEAN profiles from standard occupation baselines, simulates multi-turn research interviews, and optionally runs Pipeline A's bottom-up empirical remapping to output trace-verified personas with precise character-perfect verbatim offsets.
            </p>

            <div className="grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] p-5 rounded-lg shadow-sm">
              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Python payload script</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`import requests

url = "https://api.axwise.de/api/orqaly-axwise/v1/simulate-enhanced"
headers = {"Authorization": "Bearer <YOUR_KEY>"}
payload = {
    "business_context": {
        "business_idea": "Sovereign fleet telemetry routing",
        "target_customer": "SME Logistics dispatchers",
        "problem": "Manual tracking takes 10+ hours/week"
    },
    "questions_data": {
        "stakeholders": {
            "primary": [
                {
                    "id": "dispatcher",
                    "name": "Fleet Dispatcher",
                    "questions": ["What is your biggest bottleneck?"]
                }
            ]
        }
    },
    "config": {"depth": "detailed", "personas_per_stakeholder": 1}
}
response = requests.post(url, headers=headers, json=payload)`} />
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Response payload [JSON - Synchronous Flagship]</span>
                <div className="bg-[#1A1A1A] p-4 rounded-lg border border-stone-900 shadow-md">
                  <HighlightJSON code={`{
  "simulation_id": "sim-session-123",
  "empirical_personas": [
    {
      "name": "Elena Fischer",
      "archetype": "Traditional Dispatcher",
      "pain_points": {
        "value": "Manual tracking takes 10+ hours per week",
        "confidence": 1.0,
        "evidence": [
          {
            "quote": "I spend 10 hours cross-referencing GPS pings",
            "start_char": 631,
            "end_char": 678,
            "speaker": "Elena Fischer"
          }
        ]
      }
    }
  ]
}`} />
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Progress & Retrieval */}
          <section id="orchestration" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">3. Progress &amp; Retrieval</h2>
              <p className="text-sm text-stone-500 mt-1">GET /api/orqaly-axwise/v1/simulate/{`{id}`}/progress or /completed/{`{id}`}</p>
            </div>

            <p className="text-[#1C1917] text-sm leading-relaxed">
              If initiating asynchronously via <code>/simulate-async</code>, the simulation executes in the background. Use these endpoints to poll live progression stats (stages, tasks, metrics) or retrieve the finalized payload of OCEAN twins and raw dialogue once fully generated.
            </p>

            <div className="grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] p-5 rounded-lg shadow-sm">
              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Python status polling script</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`import requests

# Poll the simulation progress endpoint
url = "https://api.axwise.de/api/orqaly-axwise/v1/simulate/sim-123/progress"
headers = {"Authorization": "Bearer <YOUR_KEY>"}
response = requests.get(url, headers=headers)
print(response.json())`} />
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Progress payload [JSON]</span>
                <div className="bg-[#1A1A1A] p-4 rounded-lg border border-stone-900 shadow-md">
                  <HighlightJSON code={`{
  "simulation_id": "sim-123",
  "stage": "simulating_interviews",
  "progress_percentage": 50,
  "current_task": "Conducting simulated interviews",
  "estimated_time_remaining": 3,
  "completed_personas": 1,
  "total_personas": 1,
  "completed_interviews": 1,
  "total_interviews": 1
}`} />
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Sovereign Twin Registry & RBAC */}
          <section id="twins-registry" className="space-y-6 scroll-mt-24">
            <div className="border-b border-[#EAE6DF] pb-4">
              <h2 className="font-serif text-3xl text-stone-900">4. Sovereign Twin Registry &amp; RBAC</h2>
              <p className="text-sm text-stone-500 mt-1">POST /api/orqaly-axwise/v1/twins/sync or /execute or /rbac-check</p>
            </div>

            <p className="text-[#1C1917] text-sm leading-relaxed">
              Registers or updates psychologically-grounded Sovereign Digital Twins dynamically. Performs secure, dynamic vector index retrieval and RBAC policy evaluations before grounding queries or executing third-party tool connectors (WhatsApp, Slack, email triggers).
            </p>

            <div className="grid md:grid-cols-2 gap-6 bg-white border border-[#EAE6DF] p-5 rounded-lg shadow-sm">
              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Python execute query script</span>
                <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-hidden shadow-sm">
                  <HighlightPython code={`import requests

url = "https://api.axwise.de/api/orqaly-axwise/v1/twins/cfo_veronika/execute"
headers = {"Authorization": "Bearer <YOUR_KEY>"}
payload = {
    "sender_name": "Vitalijs Visnevskis",
    "sender_role": "CEO",
    "message": "I need the latest Q2 board projections."
}
response = requests.post(url, headers=headers, json=payload)`} />
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">// Grounded Response [JSON]</span>
                <div className="bg-[#1A1A1A] p-4 rounded-lg border border-stone-900 shadow-md">
                  <HighlightJSON code={`{
  "success": true,
  "twin_id": "cfo_veronika_horvat",
  "execution_status": "approved",
  "grounded_response": "Hi Vitalijs! Pulling from Q2 Planning: Base scenario: $2.4M ARR...",
  "citations": [
    {
      "source": "📁 Finance / Q2 Planning",
      "file_name": "Q2_Projections_v4.pdf"
    }
  ],
  "telemetry": {
    "execution_cost_usd": 0.045,
    "time_taken_ms": 1180
  }
}`} />
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>

      {/* Footer */}
      <footer className="bg-[#121212] text-stone-500 px-6 lg:px-16 py-8 border-t border-stone-900 text-xs flex flex-wrap justify-between items-center mt-12">
        <div>© 2026 AxWise GmbH &amp; Orqaly. All rights reserved. Licensed under Apache 2.0.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <Link href="/privacy-policy" className="hover:text-stone-300">Privacy Policy</Link>
          <Link href="/terms-of-service" className="hover:text-stone-300">Terms of Service</Link>
          <Link href="/impressum" className="hover:text-stone-300">Impressum</Link>
        </div>
      </footer>

    </div>
  );
}
