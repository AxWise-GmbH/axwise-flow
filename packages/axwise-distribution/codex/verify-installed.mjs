// Live acceptance check: invokes the installed plugin through Codex, never a direct MCP bridge.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] || join(root, '../../../dist/axwise-codex-plugin/installed-check'));
const verifyExisting = process.argv.includes('--verify-existing');
const scopeOnly = process.argv.includes('--scope-only');
const defaultConfig = process.argv.includes('--default-config');
const marketplaceOption = process.argv.indexOf('--marketplace-root');
const marketplaceRoot = marketplaceOption < 0 ? root : resolve(process.argv[marketplaceOption + 1] || '');
if (marketplaceOption >= 0 && (!process.argv[marketplaceOption + 1] || defaultConfig)) {
  throw new Error('--marketplace-root needs a path and cannot be combined with --default-config');
}
await mkdir(output, { recursive: true });
const prompt = scopeOnly ? `Use the installed AxWise plugin and its axwise skill to prepare and save a discovery
scope for a ten-week cat-food pilot in three Estonia pet shops. Use only the installed plugin's
normal advertised AxWise tools, including advance_artifact for generation and honest review,
until storageAccepted completion. Do not launch a bridge, shell tools or a replacement runtime.
If the plugin route is unavailable, stop and report it. Keep the scope concise with buyers,
shops and supplier roles and two questions per role. No actual product details or research
were supplied; label assumptions and gaps. Return the completed reference and Markdown path.`
: `Use the installed AxWise plugin and its axwise skill to execute the full flow now:
scope -> five saved personas -> simulated interviews -> analysis -> launch PRD.
Topic: a ten-week cat-food launch pilot in three Estonia pet shops. Cover buyer trial,
normal-price value and repeat, store economics and staff support, and supplier availability.
Use two buyer personas, two shop personas and one supplier persona. Keep discovery to
two useful questions per role and use depth standard. Use only the installed plugin's
advertised AxWise MCP tools for domain work and saving artifacts. Do not launch a custom
MCP bridge, shell tools, another runtime, or manually write domain outputs. If plugin tools
are unavailable, stop and report that instead of substituting an alternative.
Complete each model_request using the current Codex model and advance_artifact through
generation, exact-candidate review, any allowed repair and verified completed storage.
Pass exact saved references between stages, preserve the exact saved cohort and question
IDs in simulations, and use analysisArtifact for the PRD. Every prioritized PRD requirement
must link to analysis findings and use the appropriate generated-evidence basis. Do not
invent real research, product specifications, prices, costs or market results. Write natural
persona answers; provenance belongs in structured fields rather than repetitive disclaimers.
The PRD must include priorities, owners, matched acceptance checks, measurable pilot tests,
unknown outcome handling and the ten-week decision. It can be concise for this acceptance
check. Review honestly with a specific reason for each requested criterion. Only completed
and storageAccepted receipts count as results. Return the five completed operation references
and Markdown paths, actual limitations, and whether the normal plugin route worked.`;
await writeFile(join(output, 'prompt.txt'), prompt + '\n');
const args = [
  '--no-daemon', 'exec', '--ephemeral', '--json', '--color', 'never',
  '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', output,
  '-c', 'plugins.axwise@axwise.mcp_servers.axwise-rust.default_tools_approval_mode="approve"',
  '--output-last-message', join(output, 'final.txt'), '-'
];
if (defaultConfig) {
  // Preserve installed AxWise activation, legacy AxWise settings, model and authentication.
  // Exclude unrelated services only for this short check; never persist these overrides.
  const config = await readFile(join(homedir(), '.codex/config.toml'), 'utf8');
  for (const line of config.split('\n')) {
    const server = line.match(/^\[mcp_servers\.([\w-]+)\]$/)?.[1];
    if (server && !['axwise', 'axwise-local'].includes(server)) args.unshift('-c', `mcp_servers.${server}.enabled=false`);
    const pluginKey = line.match(/^\[plugins\."([^"]+)"\]$/)?.[1];
    if (pluginKey && pluginKey !== 'axwise@axwise') args.unshift('-c', `plugins.${pluginKey}.enabled=false`);
  }
} else {
  // --ignore-user-config retains the host login, while the selected installed plugin is explicit.
  args.unshift('-c', 'plugins.axwise@axwise.enabled=true',
    '-c', `marketplaces.axwise.source=${JSON.stringify(marketplaceRoot)}`,
    '-c', 'marketplaces.axwise.source_type="local"');
  args.splice(args.indexOf('exec') + 1, 0, '--ignore-user-config', '--model', 'gpt-6.1-sol');
}
let exit;
if (verifyExisting) {
  exit = JSON.parse(await readFile(join(output, 'verification.json'), 'utf8')).exit;
} else {
  const log = await open(join(output, 'events.jsonl'), 'w');
  const errors = await open(join(output, 'stderr.log'), 'w');
  const child = spawn('codex', args, { stdio: ['pipe', log.fd, errors.fd] });
  child.stdin.end(prompt);
  exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  await log.close();
  await errors.close();
}
const events = (await readFile(join(output, 'events.jsonl'), 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
const receipts = new Map();
const calls = [];
const artifactData = new Map();
function inspect(value) {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'mcp_tool_call') calls.push({ server: value.server, tool: value.tool, status: value.status });
  if (value.status === 'completed' && value.storageAccepted === true && value.artifactPath && value.reference) {
    receipts.set(value.operationId, value);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'text' && typeof child === 'string' && child.startsWith('{')) {
      try { inspect(JSON.parse(child)); } catch { /* ordinary model text */ }
    } else if (child && typeof child === 'object') inspect(child);
  }
}
events.forEach(inspect);
const verified = [];
for (const receipt of receipts.values()) {
  const bytes = await readFile(receipt.artifactPath);
  const artifact = JSON.parse(bytes);
  artifactData.set(receipt.tool, artifact);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== receipt.sha256) throw new Error('Saved receipt hash mismatch');
  await readFile(receipt.markdownPath);
  verified.push({ tool: receipt.tool, operationId: receipt.operationId, reference: receipt.reference,
    artifactPath: receipt.artifactPath, markdownPath: receipt.markdownPath, hashVerified: true,
    provenance: receipt.provenance, reviewPassed: receipt.qualityReview?.passed,
    input: artifact.input });
}
const expected = scopeOnly ? ['prepare_discovery'] : ['prepare_discovery', 'generate_personas', 'simulate_interviews', 'analyze_interviews', 'create_prd'];
const missing = expected.filter(tool => !verified.some(r => r.tool === tool));
const byTool = new Map(verified.map(r => [r.tool, r]));
function hasReference(tool, upstream) {
  const reference = byTool.get(upstream)?.reference;
  return !!reference && byTool.get(tool)?.input?.references?.some(r => r.operationId === reference.operationId && r.sha256 === reference.sha256);
}
const analysisRef = byTool.get('analyze_interviews')?.reference;
const prdInput = byTool.get('create_prd')?.input;
const requirements = artifactData.get('create_prd')?.candidate?.sections?.find(s => s.heading === 'Prioritized requirements')?.items;
const lineage = scopeOnly ? {} : {
  scopeToPersonas: hasReference('generate_personas', 'prepare_discovery'),
  scopeToSimulation: hasReference('simulate_interviews', 'prepare_discovery'),
  cohortToSimulation: hasReference('simulate_interviews', 'generate_personas'),
  simulationToAnalysis: hasReference('analyze_interviews', 'simulate_interviews'),
  analysisToPrd: !!analysisRef && prdInput?.analysisArtifact?.operationId === analysisRef.operationId && prdInput?.analysisArtifact?.sha256 === analysisRef.sha256,
  requirementsLinked: !!requirements?.length && requirements.every(i => i.findingIds?.length > 0 || i.basis === 'owner_decision'),
};
const runtimeVerified = verified.every(r => r.provenance?.engine === 'rust_standalone' && r.provenance?.version === '0.5.2' && r.reviewPassed === true);
const report = { exit, calls, verified, missing, lineage, runtimeVerified,
  configuration: defaultConfig ? 'existing_user_configuration' : 'isolated_installed_plugin',
  passed: exit.code === 0 && missing.length === 0 && runtimeVerified && Object.values(lineage).every(Boolean) };
await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, exit, configuration: report.configuration, toolCalls: calls.filter(c => c.status === 'completed').length,
  completed: verified.map(r => r.tool), missing, lineage, runtimeVerified, passed: report.passed }));
if (!report.passed) process.exitCode = 1;
