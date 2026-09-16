// Fixed preview-only capability signer, kept separate from sandbox execution.
// Generates the value in memory; logs only its version and permitted principals.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

assert.deepEqual(process.argv.slice(2), ['provision']);
const project = 'axwise-v2-preview-001';
const name = 'orqaly-coding-preview-dispatch-signing-key';
const run = (args, input) =>
  execFileSync('gcloud', [...args, `--project=${project}`], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
let stage = 'inspect';
try {
  let exists = true;
  try {
    run(['secrets', 'describe', name, '--format=value(name)']);
  } catch (error) {
    if (!String(error.stderr).includes('NOT_FOUND')) throw error;
    exists = false;
  }
  if (!exists) {
    stage = 'create';
    run([
      'secrets',
      'create',
      name,
      '--replication-policy=automatic',
      '--labels=environment=preview,purpose=coding-dispatch',
      '--quiet',
    ]);
  }
  stage = 'versions';
  const versions = JSON.parse(
    run([
      'secrets',
      'versions',
      'list',
      name,
      '--filter=state:ENABLED',
      '--limit=2',
      '--format=json',
    ])
  );
  let version;
  if (!versions.length) {
    stage = 'initialize';
    const metadata = JSON.parse(
      run(
        ['secrets', 'versions', 'add', name, '--data-file=-', '--format=json'],
        randomBytes(32).toString('base64')
      )
    );
    version = metadata.name.split('/').at(-1);
  } else {
    version = versions[0].name.split('/').at(-1);
    const value = run(['secrets', 'versions', 'access', version, `--secret=${name}`]);
    const decoded = Buffer.from(value, 'base64');
    assert(
      decoded.length === 32 && decoded.toString('base64') === value,
      'existing_signer_invalid'
    );
  }
  stage = 'scoped_access';
  const principals = ['orqaly-v2-api-preview', 'orqaly-v2-worker-preview'].map(
    (role) => `serviceAccount:${role}@${project}.iam.gserviceaccount.com`
  );
  for (const member of principals)
    run([
      'secrets',
      'add-iam-policy-binding',
      name,
      `--member=${member}`,
      '--role=roles/secretmanager.secretAccessor',
      '--quiet',
      '--format=json',
    ]);
  const policy = JSON.parse(run(['secrets', 'get-iam-policy', name, '--format=json']));
  const actual = policy.bindings
    ?.filter((binding) => binding.role === 'roles/secretmanager.secretAccessor')
    .flatMap((binding) => binding.members)
    .sort();
  assert.deepEqual(actual, principals.sort(), 'exact_signer_readers_required');
  console.log(
    JSON.stringify({
      secretReference: `${name}:${version}`,
      principals,
      sandboxCanRead: false,
      credentialsLogged: false,
    })
  );
} catch {
  console.error(
    JSON.stringify({
      status: 'failed',
      stage,
      code: 'CODING_SIGNER_PROVISION_FAILED',
      credentialsLogged: false,
    })
  );
  process.exitCode = 1;
}
