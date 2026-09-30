import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';

const root = '/private/tmp/orqanix-quality-audit-20260929';
const report = JSON.parse(await readFile('/private/tmp/orqanix-matrix-autonomous-20260929/report.json', 'utf8'));
const fileMap = {
  simple: ['src/pricing.mjs', 'report.json'],
  medium: ['src/triage.mjs', 'requirements.json'],
  complex: ['src/inventory.mjs', 'src/orders.mjs', 'acceptance-plan.json'],
};
const sha = text => createHash('sha256').update(text).digest('hex');
let mapping;
try { mapping = JSON.parse(await readFile(join(root, 'private-mapping.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; mapping = {}; }
const scrub = text => text.replace(/(?:native_engineering__)?(?:ast_search|lsp_query|hashline_edit|safe_edit_and_test)|(?:axwise-local__)?(?:prepare_discovery|research_market|generate_personas|simulate_interviews|chat_with_persona|analyze_interviews|create_prd|create_delivery_brief)|\b(?:Axwise|Jev|Gemini|OMP)\b/gi, '[capability name withheld]');
const batch = process.argv[2];
if (!/^batch-[1-9][0-9]*$/.test(batch || '')) throw Error('BATCH_NAME_REQUIRED');
const selected = report.rows.filter(row => !mapping[row.key]);
if (!selected.length) throw Error('NO_NEW_COMPLETED_ROWS');
const cases = [];
for (const row of selected) {
  const id = randomBytes(8).toString('hex');
  const files = {};
  for (const file of fileMap[row.difficulty]) {
    try {
      const path = join(row.workspace, file);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024) throw Error('UNSUPPORTED_FILE');
      files[file] = scrub(await readFile(path, 'utf8'));
    } catch (error) { files[file] = { missing_or_unreadable: true, error: error.code || error.message }; }
  }
  const contract = scrub(await readFile(join(row.workspace, 'README.md'), 'utf8'));
  const finalResponse = scrub((row.transcript || []).join('\n\n')).replaceAll(row.workspace, '[workspace]');
  cases.push({ bundle_id: id, difficulty: row.difficulty, contract, files, finalResponse, verificationEvidence: 'Withheld. Test claims are unverified unless established by supplied artifact content; absence of receipts is not evidence of dishonesty.' });
  mapping[row.key] = { bundle_id: id, batch, sourceArtifactHashes: Object.fromEntries(Object.entries(files).map(([file, content]) => [file, sha(JSON.stringify(content))])) };
}
cases.sort((a, b) => a.bundle_id.localeCompare(b.bundle_id));
await mkdir(join(root, 'blinded'), { recursive: true });
const text = JSON.stringify({ protocol: 'Configuration labels, run order, timing, tool names and machine outcome summaries withheld. Review only fixed rubric and delivered content. AI qualitative review, not a human score or independent execution.', cases }, null, 2) + '\n';
await writeFile(join(root, 'blinded', batch + '.json'), text, { flag: 'wx', mode: 0o600 });
await writeFile(join(root, 'private-mapping.json'), JSON.stringify(mapping, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ batch, cases: cases.length, sha256: sha(text) }));
