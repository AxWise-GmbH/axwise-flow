import { mkdtemp, mkdir, cp, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Fixed-scope build only. Explicit source files exclude local credentials,
// .env files, browser profiles, SQL data and unrelated worktree contents.
const root = new URL('../', import.meta.url).pathname;
const files = [
  'deploy/workflow-v2/Dockerfile.coding-worker', 'deploy/workflow-v2/cloudbuild.coding-worker.yaml',
  'deploy/workflow-v2/service-package/package.json', 'deploy/workflow-v2/service-package/package-lock.json',
  'server/workflow-v2/coding-worker-main.js', 'server/workflow-v2/coding-worker-cloud-run.js', 'server/workflow-v2/coding-worker-contracts.js',
  'shared/workflow-v2/solution-build-secrets.js', 'services/agentic-control-plane/src/domain/canonical.js',
];
const source = await mkdtemp(join(tmpdir(), 'orqaly-coding-build-'));
const hash = createHash('sha256');
for (const path of files) {
  await mkdir(dirname(join(source, path)), { recursive: true }); await cp(join(root, path), join(source, path));
  hash.update(path); hash.update(await readFile(join(source, path)));
}
const sourceHash = hash.digest('hex');
const image = `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/coding-worker:${sourceHash.slice(0, 12)}`;
if (process.argv[2] !== '--build') console.log(JSON.stringify({ source, sourceHash, image, files }));
else {
  const output = execFileSync('gcloud', ['builds', 'submit', source,
    '--project=axwise-v2-preview-001', '--region=europe-west4', '--async',
    '--service-account=projects/axwise-v2-preview-001/serviceAccounts/workflow-v2-preview-build@axwise-v2-preview-001.iam.gserviceaccount.com',
    `--config=${join(source, 'deploy/workflow-v2/cloudbuild.coding-worker.yaml')}`, `--substitutions=_IMAGE=${image}`, '--format=json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const result = JSON.parse(output); console.log(JSON.stringify({ source, sourceHash, image, buildId: result.id, status: result.status }));
}
