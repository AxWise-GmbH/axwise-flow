'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  GitBranch, 
  Check, 
  Download, 
  Copy, 
  Terminal as TerminalIcon,
  Sparkles,
  Database,
  Key,
  Layers,
  FileText
} from 'lucide-react';

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof window !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative my-4 rounded-lg bg-[#141414] border border-stone-800 overflow-hidden text-xs font-mono shadow-md">
      <div className="flex items-center justify-between px-4 py-2 border-b border-stone-800 bg-[#1A1A1A] text-stone-400 text-[11px]">
        <span>{language.toUpperCase()}</span>
        <button
          onClick={handleCopy}
          className="hover:text-stone-200 transition-colors flex items-center gap-1"
        >
          {copied ? (
            <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> Copied!</span>
          ) : (
            <span className="flex items-center gap-1 text-stone-400 hover:text-stone-200"><Copy className="w-3 h-3" /> Copy</span>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-stone-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DocsPage(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-[#FCFAF7] text-[#1C1917] font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* ----------------- Minimal Header ----------------- */}
      <header className="sticky top-0 z-50 bg-[#FCFAF7]/90 backdrop-blur-md border-b border-[#EAE6DF] px-6 lg:px-16 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}><rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/><path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            <span className="font-serif font-bold text-lg tracking-tight">AxWise</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-stone-600">
          <Link href="/#install" className="hover:text-stone-900 transition-colors">Install</Link>
          <Link href="/#chat-examples" className="hover:text-stone-900 transition-colors">Examples</Link>
          <Link href="/#decision-lab" className="hover:text-stone-900 transition-colors">Decision Lab</Link>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/AxWise-GmbH/axwise-flow"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-md text-xs font-mono text-stone-700 hover:border-stone-900 hover:text-stone-900 transition-all"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </a>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900 pl-2 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* ----------------- Docs Body ----------------- */}
      <main className="max-w-5xl mx-auto px-6 lg:px-12 py-16 space-y-16">
        
        {/* Intro Banner */}
        <div className="border-b border-[#EAE6DF] pb-10 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              AXWISE FASTMCP 0.4.3
            </span>
            <span className="text-xs font-mono text-stone-500 uppercase tracking-wider">
              NATIVE RUST &amp; PURE-PYTHON MCP SPECIALIST
            </span>
          </div>
          <h1 className="font-serif text-4xl text-stone-900">Developer Documentation</h1>
          <p className="text-base text-stone-600 max-w-3xl leading-relaxed">
            AxWise is a scoped, native Rust and pure-Python local specialist extension for turning product briefs and evidence into discovery scopes, synthetic persona cohorts, simulated interviews, qualitative analysis, evidence-linked PRDs, and delivery handoffs.
          </p>
          <p className="text-xs text-stone-500 leading-relaxed max-w-3xl">
            Built with <strong>zero Node.js</strong> and <strong>zero PostgreSQL</strong> dependencies. Runs on standard Python 3.11+ using FastMCP or standalone native Rust, persisting local artifacts in an embedded SQLite database (<code>~/.axwise/state/axwise.db</code>).
          </p>
        </div>

        {/* Section 1: Quick Install & Launch */}
        <section id="launch" className="space-y-6">
          <div className="border-b border-[#EAE6DF] pb-4">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">// 1. QUICK LAUNCH &amp; INSTALL</span>
            <h2 className="font-serif text-2xl text-stone-900 mt-1">Run Instantly with uvx, pip, or Native Binary</h2>
            <p className="text-sm text-stone-500 mt-1">
              AxWise 0.4.3 is available as a native standalone binary or pure-Python package. No JSON config files, Node.js runtimes, or database containers required.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-serif text-lg text-stone-900">Launch with uvx (Zero Install)</h3>
            <p className="text-xs text-stone-600">Downloads and executes the FastMCP server in an isolated environment:</p>
            <CodeBlock 
              language="bash"
              code="uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.3/axwise_extension-0.4.3-py3-none-any.whl axwise"
            />

            <h3 className="font-serif text-lg text-stone-900 pt-2">Install via pip</h3>
            <p className="text-xs text-stone-600">Installs the <code>axwise</code> executable directly into your Python environment:</p>
            <CodeBlock 
              language="bash"
              code="pip install https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.3/axwise_extension-0.4.3-py3-none-any.whl"
            />
          </div>

          <div className="bg-white border border-[#EAE6DF] rounded-lg p-5 text-xs text-stone-600 space-y-2">
            <div className="font-semibold text-stone-900 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-emerald-600" />
              Verified Release Packages &amp; Checksums (SHA-256):
            </div>
            <ul className="space-y-1 font-mono text-[11px] pt-1">
              <li>
                <a href="https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.3/axwise-native-darwin-arm64-v0.4.3.tar.gz" className="text-emerald-700 underline font-semibold">Native macOS binary (.tar.gz)</a>: 3,725,974 bytes · <span className="text-stone-500">047635a9ad837b6e5da23ca10a48618a86ef993bbd727c25fb789a68aad4c294</span>
              </li>
              <li>
                <a href="https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.3/axwise_extension-0.4.3-py3-none-any.whl" className="text-emerald-700 underline font-semibold">Python wheel (.whl)</a>: 185,619 bytes · <span className="text-stone-500">d6d7a087d355fed5d0d0629dbcf69fde3b2f7ea9ab7771396ff57c2bab3f7408</span>
              </li>
              <li>
                <a href="https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.3/axwise-extension-0.4.3.tgz" className="text-emerald-700 underline font-semibold">npm archive (.tgz)</a>: 191,015 bytes · <span className="text-stone-500">07d419d1bc65baa206618753494cf443677f6ccfe64b41459c1b35b30d0e428b</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Section 2: Zero-Config Architecture & Storage */}
        <section id="config" className="space-y-6">
          <div className="border-b border-[#EAE6DF] pb-4">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">// 2. ZERO-CONFIG CREDENTIALS &amp; STORAGE</span>
            <h2 className="font-serif text-2xl text-stone-900 mt-1">Automatic Key Discovery &amp; Embedded SQLite</h2>
            <p className="text-sm text-stone-500 mt-1">
              No configuration ceremony. AxWise auto-detects credentials and uses embedded single-file storage.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-xs">
            <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 text-stone-900 font-semibold font-serif text-sm">
                <Key className="w-4 h-4 text-emerald-600" />
                <span>Zero-Config Model Discovery</span>
              </div>
              <p className="text-stone-600 leading-relaxed">
                AxWise automatically scans for <code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>, or <code>ANTHROPIC_API_KEY</code> in your environment, <code>.env</code> file, or OS keychain (Goose/Codex secrets).
              </p>
              <p className="text-stone-500 text-[11px] leading-relaxed">
                Automatically resolves the latest frontier models (<code>gemini-flash-latest</code>, <code>gpt-6-sol</code>, <code>claude-sonnet-5</code>) and caches available model capabilities in SQLite for 24 hours.
              </p>
            </div>

            <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 text-stone-900 font-semibold font-serif text-sm">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Embedded SQLite Storage</span>
              </div>
              <p className="text-stone-600 leading-relaxed">
                All artifacts, stage journals, and PRD revision lineages are persisted locally in <code>~/.axwise/state/axwise.db</code> and rendered as human-readable Markdown files.
              </p>
              <p className="text-stone-500 text-[11px] leading-relaxed">
                Zero PostgreSQL, zero Docker containers, and zero background daemons. Artifact references are automatically linked across chat turns.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Host Integration & Codex Setup */}
        <section id="hosts" className="space-y-6">
          <div className="border-b border-[#EAE6DF] pb-4">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">// 3. HOST INTEGRATION &amp; FIRST STEPS</span>
            <h2 className="font-serif text-2xl text-stone-900 mt-1">Connect Your AI Assistant</h2>
            <p className="text-sm text-stone-500 mt-1">
              AxWise communicates over standard Model Context Protocol (MCP) stdio.
            </p>
          </div>

          <div className="space-y-6">
            {/* Codex Dedicated Quickstart */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg text-stone-900 font-medium">OpenAI Codex (CLI &amp; Desktop)</h3>
                <span className="text-[10px] font-mono uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">1-Line Setup</span>
              </div>
              <p className="text-xs text-stone-600">
                Register AxWise in Codex with one terminal command. Codex configures <code>~/.codex/config.toml</code> automatically:
              </p>
              <CodeBlock 
                language="bash"
                code="codex mcp add axwise-local -- uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.3/axwise_extension-0.4.3-py3-none-any.whl axwise"
              />

              <div className="pt-3 border-t border-stone-200 space-y-3">
                <span className="text-[11px] font-semibold text-stone-800 uppercase tracking-wider font-mono">First Steps in Codex Chat:</span>
                <p className="text-xs text-stone-600">Open Codex (<code>codex</code>) and run your first discovery workflow:</p>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-white border border-stone-200 rounded-lg">
                    <span className="font-mono text-emerald-700 font-semibold block text-[11px] mb-1">Option A: End-to-End Discovery in One Shot (Recommended)</span>
                    <p className="text-stone-800 font-mono text-[11px]">“Run axwise_local run_full_discovery for an autonomous solar-powered harbor cleaning boat”</p>
                    <span className="text-stone-500 text-[10px] block mt-1">Executes framing, personas, interview simulations, qualitative analysis, and PRD in a single turn without interruptions.</span>
                  </div>
                  <div className="p-3 bg-white border border-stone-200 rounded-lg">
                    <span className="font-mono text-emerald-700 font-semibold block text-[11px] mb-1">Option B: Interactive Step-by-Step Flow</span>
                    <ol className="list-decimal list-inside text-stone-700 space-y-1 font-mono text-[11px] pt-1">
                      <li>“Call axwise_local prepare_discovery for [your product idea]”</li>
                      <li>“Generate synthetic personas for this discovery”</li>
                      <li>“Simulate qualitative interviews across the cohort”</li>
                      <li>“Analyze interviews to extract recurring needs and pains”</li>
                      <li>“Create an evidence-linked PRD”</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-serif text-lg text-stone-900">Claude Desktop / Cursor / Windsurf</h3>
              <p className="text-xs text-stone-600 mt-1">Add the stdio MCP server definition to your client configuration file:</p>
              <CodeBlock 
                language="json"
                code={`{
  "mcpServers": {
    "axwise": {
      "command": "uvx",
      "args": [
        "--from",
        "https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.3/axwise_extension-0.4.3-py3-none-any.whl",
        "axwise"
      ],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}`}
              />
            </div>

            <div>
              <h3 className="font-serif text-lg text-stone-900">Goose Assistant</h3>
              <p className="text-xs text-stone-600 mt-1">Add to your Goose extensions configuration or run:</p>
              <CodeBlock 
                language="bash"
                code="goose configure"
              />
            </div>

            <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-lg text-xs text-stone-700 space-y-1">
              <strong className="text-emerald-900">Orqanix Desktop:</strong>
              <p className="text-stone-600">
                Orqanix bundles the AxWise specialist extension and local runtime out of the box with zero manual terminal configuration. Simply enable the AxWise capability toggle in settings.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Tool Reference — The 9 Tools */}
        <section id="tools" className="space-y-6">
          <div className="border-b border-[#EAE6DF] pb-4">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">// 4. TOOL REFERENCE</span>
            <h2 className="font-serif text-2xl text-stone-900 mt-1">The 9 Specialist Tools</h2>
            <p className="text-sm text-stone-500 mt-1">
              These specialist tools are invoked by your host agent to perform bounded research, qualitative synthesis, and documentation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2 bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">run_full_discovery</span>
                <span className="text-[10px] font-mono text-emerald-700 uppercase font-semibold">Step 00 · Complete Pipeline in One Shot</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">End-to-End Autonomous Discovery</h3>
              <p className="text-xs text-stone-700 leading-relaxed">
                Executes the entire discovery lifecycle in a single turn: Framing $\rightarrow$ Personas $\rightarrow$ Simulation $\rightarrow$ Qualitative Analysis $\rightarrow$ Evidence-Linked PRD. Persists all intermediate artifacts to SQLite and renders the full PRD directly in chat.
              </p>
            </div>

            <div className="bg-white border border-[#EAE6DF] rounded-xl p-5 space-y-2 hover:border-emerald-300 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">prepare_discovery</span>
                <span className="text-[10px] font-mono text-stone-400">Step 01 · Frame</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">Discovery Scope &amp; Guide</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Agrees the problem boundaries, target customer segments, key uncertainties, and an evidence-seeking interview questionnaire.
              </p>
            </div>

            <div className="bg-white border border-[#EAE6DF] rounded-xl p-5 space-y-2 hover:border-emerald-300 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">generate_personas</span>
                <span className="text-[10px] font-mono text-stone-400">Step 02 · Explore</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">Persona Cohort Synthesis</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Creates a bounded cohort of synthetic personas with operational roles, psychological traits, and problem context based on the agreed discovery scope.
              </p>
            </div>

            <div className="bg-white border border-[#EAE6DF] rounded-xl p-5 space-y-2 hover:border-emerald-300 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">simulate_interviews</span>
                <span className="text-[10px] font-mono text-stone-400">Step 02 · Explore</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">Synthetic Interview Engine</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Executes simulated multi-turn qualitative interviews against synthetic personas. Retains full transcript provenance with synthetic labels.
              </p>
            </div>

            <div className="bg-white border border-[#EAE6DF] rounded-xl p-5 space-y-2 hover:border-emerald-300 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">chat_with_persona</span>
                <span className="text-[10px] font-mono text-stone-400">Step 02 · Explore</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">Interactive Persona Rehearsal</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Discuss an exact selected document, proposal, or PRD draft directly with a saved persona to stress-test usability and value.
              </p>
            </div>

            <div className="bg-white border border-[#EAE6DF] rounded-xl p-5 space-y-2 hover:border-emerald-300 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">analyze_interviews</span>
                <span className="text-[10px] font-mono text-stone-400">Step 03 · Understand</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">Qualitative Evidence Matrix</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Extracts recurring patterns, conflicting needs, and stakeholder sentiment linked to verbatim quotations and character offsets.
              </p>
            </div>

            <div className="bg-white border border-[#EAE6DF] rounded-xl p-5 space-y-2 hover:border-emerald-300 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">research_market</span>
                <span className="text-[10px] font-mono text-stone-400">Step 03 · Understand</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">Grounded Market Synthesis</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Synthesizes explicitly selected market sources provided by your host assistant, surfacing commercial gaps and uncertainty.
              </p>
            </div>

            <div className="bg-white border border-[#EAE6DF] rounded-xl p-5 space-y-2 hover:border-emerald-300 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">create_prd</span>
                <span className="text-[10px] font-mono text-stone-400">Step 04 · Shape</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">Evidence-Linked PRD</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Builds a structured PRD with provenance tracking. Supports additive revisions without discarding previously agreed constraints.
              </p>
            </div>

            <div className="bg-white border border-[#EAE6DF] rounded-xl p-5 space-y-2 hover:border-emerald-300 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">create_delivery_brief</span>
                <span className="text-[10px] font-mono text-stone-400">Step 04 · Deliver</span>
              </div>
              <h3 className="font-serif text-base text-stone-900 font-medium">Engineering &amp; Handoff Brief</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Translates the verified PRD into an actionable engineering delivery brief with acceptance tests, milestones, and boundary assumptions.
              </p>
            </div>
          </div>
        </section>

        {/* Section 5: Boundaries & Governance */}
        <section id="boundaries" className="space-y-6">
          <div className="border-b border-[#EAE6DF] pb-4">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">// 5. BOUNDARIES &amp; PROVENANCE</span>
            <h2 className="font-serif text-2xl text-stone-900 mt-1">Clear Operating Principles</h2>
          </div>

          <div className="space-y-4 text-xs text-stone-600 leading-relaxed">
            <div className="p-4 bg-white border border-[#EAE6DF] rounded-lg">
              <strong className="text-stone-900 block mb-1">Your Host Stays in Charge:</strong>
              The host assistant (Goose, Codex, Orqanix) retains conversational agency, user confirmation gates, and tool execution permissions. AxWise never acts outside its designated MCP tools.
            </div>
            <div className="p-4 bg-white border border-[#EAE6DF] rounded-lg">
              <strong className="text-stone-900 block mb-1">Local State, Provider Privacy:</strong>
              All generated artifacts, PRD revisions, and schemas remain saved on your local filesystem under <code>~/.axwise/state/</code>. Model inference goes exclusively to your chosen provider credentials.
            </div>
            <div className="p-4 bg-white border border-[#EAE6DF] rounded-lg">
              <strong className="text-stone-900 block mb-1">Synthetic vs. Grounded Provenance:</strong>
              Simulated interviews and personas are always marked with synthetic provenance flags, ensuring hypothetical data is never accidentally presented as empirical customer proof.
            </div>
          </div>
        </section>

      </main>

      {/* ----------------- Footer ----------------- */}
      <footer className="bg-[#121212] text-stone-500 px-6 lg:px-16 py-8 border-t border-stone-900 text-xs flex flex-wrap justify-between items-center">
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
