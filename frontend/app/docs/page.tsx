'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AxwiseDownloadCard } from '@/components/landing/AxwiseDownloadCard';
import { AXWISE_RELEASE, AXWISE_DOWNLOAD_URL, AXWISE_DIRECTORY, AXWISE_CODEX_COMMAND } from '@/lib/axwise-release';

const TOOLS = [
  ['prepare_discovery', 'Propose scope, stakeholders, uncertainties and interview questions.'],
  ['research_market', 'Synthesize evidence selected by your assistant; flag missing market data.'],
  ['generate_personas', 'Save an explicitly synthetic cohort from selected stakeholder roles.'],
  ['simulate_interviews', 'Generate bounded synthetic interviews, preserving selected saved personas.'],
  ['chat_with_persona', 'Ask an exact saved synthetic persona a follow-up question.'],
  ['analyze_interviews', 'Analyze selected real or synthetic transcripts with exact quotations and participant identity.'],
  ['create_prd', 'Create an evidence-labelled product or software PRD; preserve commitments in additive revisions.'],
  ['create_delivery_brief', 'Create a handoff covering requirements and acceptance conditions from one saved PRD.'],
] as const;
const INSTALL = `curl -fLO ${AXWISE_DOWNLOAD_URL}\nprintf '%s  %s\\n' '${AXWISE_RELEASE.sha256}' '${AXWISE_RELEASE.filename}' | shasum -a 256 -c -\ntar -xzf ${AXWISE_RELEASE.filename}\n${AXWISE_CODEX_COMMAND}`;
function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-stone-950 text-stone-200 p-4 text-xs leading-relaxed"><code>{children}</code></pre>;
}

export default function DocsPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-12 text-stone-700">
      <Link href="/" className="inline-flex items-center gap-2 text-sm"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to AxWise</Link>
      <div className="space-y-4">
        <p className="text-xs font-mono text-emerald-700">AXWISE RUST {AXWISE_RELEASE.version}</p>
        <h1 className="font-serif text-4xl text-stone-900">Developer documentation</h1>
        <p>AxWise is a local Rust MCP engine for product discovery, selected evidence, synthetic personas, PRDs and delivery handoffs. Your assistant keeps the conversation, model access and permissions.</p>
        <nav className="flex flex-wrap gap-4 text-sm underline" aria-label="Documentation sections">
          <a href="#install">Install</a><a href="#model">Model access</a><a href="#tools">Tools</a><a href="#pipeline">Pipeline</a><a href="#storage">Storage and limits</a>
        </nav>
      </div>
      <section id="install" className="space-y-4">
        <h2 className="font-serif text-2xl text-stone-900">1. Install the Rust executable</h2>
        <AxwiseDownloadCard />
        <p className="text-sm">The prebuilt release targets Apple Silicon macOS. Verify the archive, extract it in your project directory, and register it in Codex:</p>
        <Code>{INSTALL}</Code>
        <p className="text-sm">Start a new Codex chat. Ask: “Use AxWise to create a proposed cat-food pilot PRD for Estonia with three shops. Label assumptions; do not invent research.” Codex CLI 0.159.3 was tested using an existing ChatGPT login.</p>
        <p className="text-sm">For another MCP host, configure the extracted absolute executable path as a stdio command, with a tool timeout of at least 180 seconds:</p>
        <Code>{JSON.stringify({ mcpServers: { axwise: { command: `/absolute/path/${AXWISE_DIRECTORY}/bin/axwise`, args: ['--workspace', '/absolute/path/project'] } } }, null, 2)}</Code>
        <p className="text-sm">The macOS binary is ad-hoc signed, not Apple notarized. Other platforms can build the Rust source:</p>
        <Code>{'cargo build --release --locked --manifest-path crates/axwise-core/Cargo.toml --bin axwise'}</Code>
      </section>
      <section id="model" className="space-y-4">
        <h2 className="font-serif text-2xl text-stone-900">2. Use existing model access</h2>
        <p><code>--model-access host</code> is the default. The harness uses its current model and its existing API-key or subscription access. AxWise does not read subscription tokens or require a separate account.</p>
        <ul className="list-disc pl-5 space-y-2 text-sm">
          <li>When the host advertises MCP sampling, AxWise requests generation and review from that host.</li>
          <li>Otherwise, AxWise returns a schema and model request. The current chat model responds through <code>advance_artifact</code> until a completed receipt is returned. This route was verified in Codex CLI.</li>
          <li>A denied or failed sampling request fails the operation; it does not silently switch to a paid API key.</li>
        </ul>
        <p className="text-sm">For direct API inference, select <code>--model-access api-key</code> and pass your existing environment key plus an explicit <code>AXWISE_MODEL</code>. Supported keys are <code>OPENAI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, <code>GEMINI_API_KEY</code> and <code>GOOGLE_API_KEY</code>. <code>AXWISE_PROVIDER</code> selects OpenAI, Anthropic or Gemini; default key priority follows that order. <code>AXWISE_BASE_URL</code> optionally selects an HTTPS or loopback endpoint. The host must pass environment variables to its MCP child process.</p>
      </section>
      <section id="tools" className="space-y-4">
        <h2 className="font-serif text-2xl text-stone-900">3. Specialist tools</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left border-collapse">
          <thead><tr className="border-b"><th scope="col" className="p-3">Tool</th><th scope="col" className="p-3">Responsibility</th></tr></thead>
          <tbody>{TOOLS.map(([name, responsibility]) => <tr key={name} className="border-b"><th scope="row" className="p-3 font-mono text-xs">{name}</th><td className="p-3">{responsibility}</td></tr>)}</tbody>
        </table></div>
        <p className="text-sm"><code>advance_artifact</code> continues generation, review or repair requests. There is no <code>run_full_discovery</code> alias. Request the deliverable you need; the assistant can compose multiple specialist steps when you explicitly ask for a larger workflow.</p>
        <p className="text-sm">Persona and simulation cohorts require explicit stakeholder slots, bounded to 12. Simulations are labelled hypotheses. Market retrieval uses the assistant’s ordinary search tools; supplied documents and tool outputs remain evidence, never instructions.</p>
      </section>
      <section id="pipeline" className="space-y-4">
        <h2 className="font-serif text-2xl text-stone-900">4. From request to saved artifact</h2>
        <Code>{'User request → specialist tool → selected inputs and saved references\n→ model generation → Rust schema and domain checks\n→ model review → at most one repair and fresh review\n→ verified JSON + rendered Markdown → completed receipt'}</Code>
        <p className="text-sm">Rust checks exact UTF-8 quotations, source and participant identity, question coverage, synthetic labels, deterministic simulation slots, saved persona identity, PRD sections, additive revisions, and delivery requirement/condition coverage. Review must cover every required criterion exactly once with a substantive reason.</p>
        <p className="text-sm">Pending requests and rejected candidates are never completed artifacts. The host should show saved results only after <code>status=completed</code> and <code>storageAccepted=true</code>. Keep the returned operation reference and SHA-256 for follow-ups. Persona chats need the exact returned persona ID and cohort reference. Delivery needs exactly one saved native PRD reference.</p>
        <p className="text-sm">Reviews are model critiques, not independent managed JEV audits. Provenance explicitly records <code>reviewAuthority=model_critique</code> and <code>managedJevAudit=false</code>. The standalone release does not replace Orqanix 2.8.4’s managed hybrid adapter or claim full parity with its Python kernel.</p>
      </section>
      <section id="storage" className="space-y-4">
        <h2 className="font-serif text-2xl text-stone-900">5. Storage, scope and limits</h2>
        <p className="text-sm">Artifacts are saved under <code>~/.axwise/native/&lt;local-account&gt;/&lt;workspace-session&gt;/</code>. SQLite WAL uses FULL synchronization; writes are atomic and acceptance checks verify files and hashes. The local account namespace identifies the host user, not a verified cloud identity. Desktop and standalone formats and stores are separate.</p>
        <p className="text-sm">Each new process receives a fresh session. Launch per conversation, or provide a trusted <code>--session</code> / <code>AXWISE_SESSION_ID</code> for explicit continuation. Reuse that ID only for the intended conversation. Completed files survive restarts; in-flight requests expire after 30 minutes and are lost on restart. Automatic restart reconciliation is not implemented here.</p>
        <p className="text-sm">Messages and artifacts: 1 MiB. Selected inputs and candidates: 512 KiB. Selected references: 16. Simulation: 12 questions per role and 72 total answers. Retained jobs: 32. Automatic model request: 120-second timeout, 16,384-token generation ceiling. Host-chat stages use the harness’s own limits. This is a local specialist runtime; the host supplies process permissions and any OS sandbox.</p>
      </section>
    </main>
  );
}
