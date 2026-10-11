// Live acceptance through Codex's ordinary MCP path and existing login.
// Only the chosen local executable is enabled; configuration changes are ephemeral.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const binary = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const prompt = `Acceptance test of the rebuilt standalone AxWise. Use only the ordinary advertised
axwise-rebuild MCP tools for domain generation and saving. Do not launch shell bridges,
replace the runtime, write deliverables yourself, fetch other evidence or use other services.
Complete discovery -> three saved personas -> six simulated interview answers -> analysis -> GTM PRD.
The requested outcome is a practical Orqanix distribution strategy: distinguish users and buyers,
compare three plausible distribution channels, and propose a 90-day acquisition experiment plan
with owners, costs still to determine, success criteria, stop conditions and unknown market size.
Do not substitute an enterprise-governance specification for this distribution question.
Use these selected product facts, retaining web provenance exactly:
{"id":"product-page","title":"AxWise public product page","origin":"web_source","url":"https://axwise.de/","retrievedAt":"${new Date().toISOString()}","text":"Runs locally inside Goose, Codex, Claude Desktop, or your own assistant host—with native desktop integration in Orqanix."}
This product-page excerpt is not evidence of demand, conversion rates, competitor capabilities,
or audience size. No human interviews or measured outcomes were supplied. Choose three relevant
stakeholder roles with one persona each and two questions each. Explicitly simulate their
interviews as a rehearsal, retaining synthetic origin and basis. Keep each answer concise.
Use the exact saved scope reference, cohort profiles, assigned question and participant IDs.
Analyze the saved simulation reference and use analysisArtifact in the PRD. Link prioritized
requirements to the admitted findings, while distinguishing owner decisions and proposals.
For every model_request generate/review stage, follow its exact returned schema and use
advance_artifact. Review each required criterion honestly with a specific reason; if a review
fails, use the one repair and a fresh review. Only status completed and storageAccepted count.
The PRD must address the requested GTM question and state that simulated answers do not validate
real demand. Return all five completed references and Markdown paths plus any actual failures.`;
await writeFile(join(output, 'prompt.txt'), prompt + '\n');
const args = ['--no-daemon', 'exec', '--ignore-user-config', '--ephemeral', '--json', '--color', 'never',
  '--skip-git-repo-check', '--sandbox', 'workspace-write', '--model', 'gpt-6.1-sol', '-C', output,
  '-c', `mcp_servers.axwise-rebuild.command=${JSON.stringify(binary)}`,
  '-c', `mcp_servers.axwise-rebuild.args=${JSON.stringify(['--workspace', output, '--state-dir', join(output, 'state'), '--session', 'gtm-acceptance'])}`,
  '-c', 'mcp_servers.axwise-rebuild.default_tools_approval_mode="approve"',
  '-c', 'mcp_servers.axwise-rebuild.tool_timeout_sec=180',
  '--output-last-message', join(output, 'final.txt'), '-'];
const eventsFile = await open(join(output, 'events.jsonl'), 'w');
const errorsFile = await open(join(output, 'stderr.log'), 'w');
const child = spawn('codex', args, { stdio: ['pipe', eventsFile.fd, errorsFile.fd] });
child.stdin.end(prompt);
const exit = await new Promise((resolve, reject) => {
  child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
});
await eventsFile.close(); await errorsFile.close();
const receipts = new Map(), calls = [];
function inspect(value) {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'mcp_tool_call') calls.push({ server: value.server, tool: value.tool, status: value.status });
  if (value.status === 'completed' && value.storageAccepted === true && value.artifactPath && value.reference) receipts.set(value.operationId, value);
  for (const [key, item] of Object.entries(value)) {
    if (key === 'text' && typeof item === 'string' && item.startsWith('{')) { try { inspect(JSON.parse(item)); } catch { /* ordinary prose */ } }
    else if (item && typeof item === 'object') inspect(item);
  }
}
for (const line of (await readFile(join(output, 'events.jsonl'), 'utf8')).split('\n').filter(Boolean)) inspect(JSON.parse(line));
const verified = [];
for (const receipt of receipts.values()) {
  const bytes = await readFile(receipt.artifactPath), artifact = JSON.parse(bytes);
  const hashVerified = createHash('sha256').update(bytes).digest('hex') === receipt.sha256 && bytes.length === receipt.bytes;
  const markdown = await readFile(receipt.markdownPath, 'utf8');
  verified.push({ tool: receipt.tool, reference: receipt.reference, artifactPath: receipt.artifactPath,
    markdownPath: receipt.markdownPath, hashVerified, markdownNonempty: markdown.length > 50,
    reviewed: receipt.qualityReview?.passed === true, engine: receipt.provenance?.engine,
    version: receipt.provenance?.version, input: artifact.input, artifact });
}
const byTool = new Map(verified.map(v => [v.tool, v]));
const expected = ['prepare_discovery', 'generate_personas', 'simulate_interviews', 'analyze_interviews', 'create_prd'];
const missing = expected.filter(tool => !byTool.has(tool));
function linked(tool, parent) {
  const reference = byTool.get(parent)?.reference;
  return !!reference && byTool.get(tool)?.input?.references?.some(r => r.operationId === reference.operationId && r.sha256 === reference.sha256);
}
const analysis = byTool.get('analyze_interviews')?.reference;
const prd = byTool.get('create_prd');
const requirements = prd?.artifact.candidate.sections.find(s => s.heading === 'Prioritized requirements')?.items;
const lineage = {
  scopeToPersonas: linked('generate_personas', 'prepare_discovery'),
  cohortToSimulation: linked('simulate_interviews', 'generate_personas'),
  simulationToAnalysis: linked('analyze_interviews', 'simulate_interviews'),
  analysisToPrd: !!analysis && prd?.input?.analysisArtifact?.operationId === analysis.operationId && prd?.input?.analysisArtifact?.sha256 === analysis.sha256,
  requirementsLinked: !!requirements?.length && requirements.every(i => i.findingIds?.length > 0 || i.basis === 'owner_decision'),
};
const passed = exit.code === 0 && !missing.length && Object.values(lineage).every(Boolean)
  && verified.every(v => v.hashVerified && v.markdownNonempty && v.reviewed && v.engine === 'rust_standalone' && v.version === '0.5.3');
const report = { passed, binary, model: 'gpt-6.1-sol via existing Codex login', exit, calls, missing, lineage, verified };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed, output, exit, completed: verified.map(v => v.tool), missing, lineage, toolCalls: calls.filter(c => c.status === 'completed').length }));
if (!passed) process.exitCode = 1;
