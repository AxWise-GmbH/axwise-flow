import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, writeFile, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { saveArtifact, hash, TOOL_NAMES } from '../src/runtime.mjs';
import { scopedDirectory, resolveArtifactReference, resolveAnalysisReference } from '../src/state.mjs';

const accountHash = 'a'.repeat(64), conversationId = 'generic-artifacts';
const signal = () => new AbortController().signal;

async function fixture({ tool = 'generate_personas', stateDir, save = true } = {}) {
  stateDir ??= await mkdtemp(join(tmpdir(), 'axwise-state-test-'));
  const operationId = randomUUID(), scope = { stateDir, accountHash, conversationId, operationId };
  const directory = await scopedDirectory(scope);
  const selectedInput = { references: [], brief: 'Original selected input' }, resolvedInput = { ...selectedInput, exactInheritedSource: 'preserved' };
  const artifact = { title: 'A useful result', kind: tool }, markdown = '# Useful result\nPreserved evidence.';
  const record = {
    version: 'axwise.local-artifact.v2', operationId, accountHash, conversationId, tool,
    selectedInput, inputSha256: hash(selectedInput), resolvedInput, resolvedInputSha256: hash(resolvedInput),
    artifact, artifactSha256: hash(artifact), candidate: { value: 'candidate' }, markdown,
    qualityReview: { passed: true }, validation: { valid: true }, createdAt: '2026-09-23T00:00:00.000Z',
    resultArtifact: { schemaVersion: 'orqanix.result.v1', artifactId: operationId, revisionId: operationId,
      parentRevisionId: null, previousPath: null, title: 'Useful result', mimeType: 'text/markdown',
      path: join(directory, `${operationId}.md`), sha256: hash(markdown), createdAt: '2026-09-23T00:00:00.000Z' },
  };
  const saved = save ? await saveArtifact({ ...scope, record }, signal()) : null;
  return { scope, directory, record, saved, reference: saved ? { operationId, sha256: saved.sha256 } : null };
}

async function rewrite(f, change) {
  const record = structuredClone(f.record); change(record);
  const bytes = JSON.stringify(record);
  await writeFile(f.saved.path, bytes);
  return { operationId: record.operationId, sha256: hash(bytes) };
}

test('every permitted artifact kind resolves exact frozen content with preserved Markdown descriptor', async () => {
  for (const tool of TOOL_NAMES) {
    const f = await fixture({ tool });
    const resolved = await resolveArtifactReference(f.scope, f.reference, signal());
    assert.equal(resolved.tool, tool);
    assert.deepEqual(resolved.input, f.record.resolvedInput);
    assert.deepEqual(resolved.artifact, f.record.artifact);
    assert.deepEqual(resolved.reference, f.reference);
    assert.deepEqual(resolved.resultArtifact, f.record.resultArtifact);
    assert.equal(resolved.markdown, f.record.markdown);
  }
});

test('generic resolver rejects wrong resolved-input hash, unsafe kind and mutated scope metadata', async () => {
  for (const change of [
    record => { record.resolvedInput.exactInheritedSource = 'rewritten'; },
    record => { delete record.resolvedInputSha256; },
    record => { record.resolvedInput = []; record.resolvedInputSha256 = hash([]); },
    record => { record.tool = 'execute_shell'; },
    record => { record.accountHash = 'b'.repeat(64); },
    record => { record.conversationId = 'another-chat'; },
    record => { record.validation.valid = false; },
    record => { record.qualityReview.passed = false; },
  ]) {
    const f = await fixture(), ref = await rewrite(f, change);
    await assert.rejects(resolveArtifactReference(f.scope, ref, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  }
});

test('legacy analysis-only resolver remains narrow after adding generic references', async () => {
  const f = await fixture({ tool: 'research_market' });
  await assert.rejects(resolveAnalysisReference(f.scope, f.reference, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  const analysis = await fixture({ tool: 'analyze_interviews' });
  assert.deepEqual((await resolveAnalysisReference(analysis.scope, analysis.reference, signal())).input, analysis.record.resolvedInput);
});

test('missing, tampered, oversized or symlinked Markdown cannot be reused as an immutable result', async () => {
  for (const mutation of ['missing', 'tampered', 'oversized', 'symlink']) {
    const f = await fixture();
    if (mutation === 'missing') await unlink(f.record.resultArtifact.path);
    else if (mutation === 'tampered') await writeFile(f.record.resultArtifact.path, 'Different content.');
    else if (mutation === 'oversized') await writeFile(f.record.resultArtifact.path, 'x'.repeat(1_048_577));
    else {
      const outside = await mkdtemp(join(tmpdir(), 'axwise-md-symlink-'));
      const path = join(outside, 'copy.md'); await writeFile(path, f.record.markdown);
      await unlink(f.record.resultArtifact.path); await symlink(path, f.record.resultArtifact.path);
    }
    await assert.rejects(resolveArtifactReference(f.scope, f.reference, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  }
});

test('descriptor identity, location and content hashes are validated even with an updated JSON reference hash', async () => {
  for (const change of [
    record => { record.resultArtifact.revisionId = randomUUID(); },
    record => { record.resultArtifact.artifactId = 'not-a-uuid'; },
    record => { record.resultArtifact.path += '.different'; },
    record => { record.resultArtifact.sha256 = '0'.repeat(64); },
    record => { record.resultArtifact.schemaVersion = 'untrusted-result'; },
  ]) {
    const f = await fixture(), ref = await rewrite(f, change);
    await assert.rejects(resolveArtifactReference(f.scope, ref, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  }
});

test('JSON publication failure removes only newly created Markdown and retains pre-existing results', async () => {
  const previous = await fixture();
  const oldJSON = await readFile(previous.saved.path, 'utf8'), oldMarkdown = await readFile(previous.record.resultArtifact.path, 'utf8');
  const next = await fixture({ stateDir: previous.scope.stateDir, save: false });
  let writes = 0;
  await assert.rejects(saveArtifact({ ...next.scope, record: next.record, writeArtifact: async (file, bytes) => {
    if (++writes === 2) { await file.writeFile(bytes.slice(0, 10)); throw new Error('simulated disk failure'); }
    await file.writeFile(bytes);
  } }, signal()), /simulated disk failure/);
  assert.deepEqual((await readdir(next.directory)).sort(), [`${previous.scope.operationId}.json`, `${previous.scope.operationId}.md`].sort());
  assert.equal(await readFile(previous.saved.path, 'utf8'), oldJSON);
  assert.equal(await readFile(previous.record.resultArtifact.path, 'utf8'), oldMarkdown);
});

test('cancellation between Markdown and JSON publication leaves neither new file nor temporary files', async () => {
  const f = await fixture({ save: false }), controller = new AbortController();
  let writes = 0;
  await assert.rejects(saveArtifact({ ...f.scope, record: f.record, writeArtifact: async (file, bytes) => {
    await file.writeFile(bytes);
    if (++writes === 2) controller.abort();
  } }, controller.signal), { name: 'AbortError' });
  assert.deepEqual(await readdir(f.directory), []);
});

test('repeat publication never overwrites or deletes already published Markdown or JSON', async () => {
  const f = await fixture(), before = await readFile(f.record.resultArtifact.path, 'utf8');
  await assert.rejects(saveArtifact({ ...f.scope, record: f.record }, signal()), { code: 'EEXIST' });
  assert.equal(await readFile(f.record.resultArtifact.path, 'utf8'), before);
  assert.equal(hash(await readFile(f.saved.path, 'utf8')), f.reference.sha256);
});

test('older accepted artifacts without result descriptors remain readable; absence is not falsely reported as a Markdown result', async () => {
  const f = await fixture();
  const ref = await rewrite(f, record => { delete record.resultArtifact; delete record.resolvedInput; delete record.resolvedInputSha256; });
  const resolved = await resolveArtifactReference(f.scope, ref, signal());
  assert.equal(resolved.resultArtifact, null);
  assert.deepEqual(resolved.input, f.record.selectedInput);
});
