import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const file = (name) => readFile(path.join(directory, name), 'utf8');

test('preview constants are hard-pinned and never target Supabase', async () => {
  const files = await Promise.all(
    [
      'common.sh',
      'provision.sh',
      'apply-control-plane-schema.sh',
      'deploy.sh',
      'connect-orqaly-api.sh',
      'bootstrap-n8n.sh',
      'verify.sh',
    ].map(file)
  );
  const source = files.join('\n');
  assert.match(source, /PROJECT_ID="axwise-v2-preview-001"/);
  assert.match(source, /REGION="europe-west4"/);
  assert.doesNotMatch(source, /gcloud\s+[^\n]*\bdelete\b/i);
  assert.doesNotMatch(source, /drop\s+database/i);
  assert.doesNotMatch(
    source,
    /SUPABASE_(?:URL|KEY)|supabase\.co|\bsupabase\s+(?:db|link|migration)/i
  );
});

test('Agent schema migration and web runtime use different identities', async () => {
  const [common, provision, apply, deploy, grants] = await Promise.all([
    file('common.sh'),
    file('provision.sh'),
    file('apply-control-plane-schema.sh'),
    file('deploy.sh'),
    file('control-plane-runtime-grants.sql'),
  ]);
  assert.match(common, /CONTROL_PLANE_DATABASE_USER="orqaly_agentic_preview_001_runtime"/);
  assert.match(common, /CONTROL_PLANE_MIGRATION_USER="orqaly_agentic_preview_001_migrator"/);
  assert.match(common, /CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT=/);
  assert.match(
    provision,
    /ensure_database "\$\{CONTROL_PLANE_DATABASE\}" "\$\{CONTROL_PLANE_MIGRATION_USER\}"/
  );
  assert.match(provision, /admin_owner_memberships_granted=false/);
  assert.match(provision, /GRANT %s, %s TO postgres/);
  assert.match(provision, /REVOKE %s, %s FROM postgres/);
  assert.match(provision, /unexpected standing Agentic database-owner membership/);
  assert.match(provision, /Existing Agent runtime role is privileged/);
  assert.match(provision, /Existing Agent migration role is privileged/);
  assert.match(provision, /Existing n8n database role is privileged/);
  assert.doesNotMatch(provision, /ELSE ALTER ROLE [^;]+ NOSUPERUSER/);
  assert.match(provision, /SET ROLE %s;\\nREVOKE ALL ON DATABASE/);
  assert.match(provision, /SET ROLE \$\{CONTROL_PLANE_MIGRATION_USER\}/);
  assert.match(provision, /RESET ROLE/);
  assert.match(apply, /--service-account="\$\{CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT\}"/);
  assert.match(deploy, /env CONTROL_PLANE_IMAGE="\$\{CONTROL_PLANE_IMAGE\}"/);
  assert.match(grants, /grant select, insert, update, delete on all tables/i);
  assert.match(grants, /not c\.relrowsecurity or not c\.relforcerowsecurity/);
  assert.match(grants, /Agent runtime role owns schema objects/);
  assert.match(grants, /rolbypassrls/);
  assert.doesNotMatch(grants, /alter role/i);
});

test('n8n is private and manageable without exposing its editor', async () => {
  const [deploy, bootstrap, wrapper] = await Promise.all([
    file('deploy.sh'),
    file('bootstrap-n8n.sh'),
    file('gcp-n8n-bootstrap.mjs'),
  ]);
  assert.match(deploy, /N8N_DISABLE_UI=true/);
  assert.match(deploy, /N8N_PUBLIC_API_DISABLED=false/);
  assert.match(deploy, /--execution-environment=gen2 --ingress=internal --scaling=auto/);
  assert.match(deploy, /--cpu=1 --memory=2Gi --concurrency=1 --min=0 --max=1/);
  assert.match(deploy, /--startup-probe="httpGet.path=\/healthz\/readiness,/);
  assert.match(deploy, /--readiness-probe="httpGet.path=\/healthz\/readiness,/);
  assert.doesNotMatch(deploy, /--startup-probe="httpGet.path=\/healthz,/);
  assert.match(deploy, /AGENTIC_EXECUTION_ENABLED=false/);
  assert.match(deploy, /capabilities='\{"executors":\[\],"descriptors":\[\],"connections":\[\]\}'/);
  assert.match(bootstrap, /N8N_API_KEY_SECRET_VERSION/);
  assert.match(wrapper, /computeMetadata\/v1\/instance\/service-accounts\/default\/identity/);
  assert.match(wrapper, /headers\.set\('authorization', `Bearer/);
  assert.match(wrapper, /target\.pathname\.startsWith\('\/api\/v1\/'\)/);
});

test('runtime and one-shot n8n images are separate and digest-bound', async () => {
  const [runtimeBuild, bootstrapBuild, bootstrapDockerfile, controlDockerfile, buildScript] =
    await Promise.all([
      file('cloudbuild.n8n.yaml'),
      file('cloudbuild.n8n-bootstrap.yaml'),
      file('n8n-bootstrap.Dockerfile'),
      file('control-plane.Dockerfile'),
      file('build-images.sh'),
    ]);
  assert.match(runtimeBuild, /n8nio\/n8n:2\.37\.10@sha256:[a-f0-9]{64}/);
  assert.match(runtimeBuild, /go-containerregistry\/crane@sha256:[a-f0-9]{64}/);
  assert.match(runtimeBuild, /'copy'/);
  assert.match(runtimeBuild, /--platform=linux\/amd64/);
  assert.doesNotMatch(runtimeBuild, /cloud-builders\/docker/);
  assert.match(bootstrapBuild, /n8n-bootstrap\.Dockerfile/);
  assert.match(bootstrapDockerfile, /gcp-n8n-bootstrap\.mjs/);
  assert.match(controlDockerfile, /node:22\.22\.0-alpine3\.23@sha256:[a-f0-9]{64}/);
  assert.match(buildScript, /N8N_BOOTSTRAP_IMAGE=/);
  assert.match(buildScript, /agentic_preview_require_digest N8N_BOOTSTRAP_IMAGE/);
});

test('Cloud Run origin checks accept only an advertised deterministic alias', async () => {
  const [common, deploy, connect, bootstrap, verify] = await Promise.all([
    file('common.sh'),
    file('deploy.sh'),
    file('connect-orqaly-api.sh'),
    file('bootstrap-n8n.sh'),
    file('verify.sh'),
  ]);
  assert.match(common, /metadata\.annotations\["run\.googleapis\.com\/urls"\]/);
  assert.match(common, /\$urls \| index\(\$expected\)/);
  assert.match(common, /\.status\.url as \$status_url/);
  for (const source of [deploy, connect, bootstrap, verify]) {
    assert.match(source, /agentic_preview_assert_service_origin_document/);
    assert.doesNotMatch(source, /\.status\.url == \$origin/);
  }
});

test('Agent API connection promotes and verifies the exact serving revision', async () => {
  const [connect, verify] = await Promise.all([file('connect-orqaly-api.sh'), file('verify.sh')]);
  assert.match(connect, /--no-traffic/);
  assert.match(connect, /--revision-suffix="\$\{candidate_suffix\}"/);
  assert.match(connect, /--tag="\$\{probe_tag\}"/);
  assert.match(connect, /curl -fsS --max-time 30 "\$\{candidate_url\}\/readyz"/);
  assert.match(connect, /gcloud run revisions describe "\$\{candidate_revision\}"/);
  assert.match(connect, /--to-revisions="\$\{candidate_revision\}=100"/);
  assert.match(connect, /restore_previous_traffic/);
  assert.match(connect, /previous_traffic_snapshot/);
  assert.match(connect, /refusing to roll back traffic not owned by this invocation/);
  assert.match(connect, /current traffic is not provably owned by this invocation/);
  assert.match(connect, /expected_promotion_generation/);
  assert.match(verify, /status\.observedGeneration == \.metadata\.generation/);
  assert.match(verify, /gcloud run revisions describe "\$\{api_revision\}"/);
  assert.match(verify, /api_runtime_document/);
});

test('Cloud Run traffic snapshots pin resolved revisions, tags and allocations', async () => {
  const fixture = {
    status: {
      traffic: [
        { revisionName: 'orqaly-v2-api-preview-resolved-latest', percent: 80 },
        { revisionName: 'orqaly-v2-api-preview-stable', percent: 20, tag: 'stable' },
        { revisionName: 'orqaly-v2-api-preview-candidate', tag: 'candidate' },
      ],
    },
  };
  const stdout = execFileSync(
    'jq',
    ['-c', '-f', path.join(directory, 'cloud-run-traffic-snapshot.jq')],
    { input: JSON.stringify(fixture), encoding: 'utf8' }
  );
  assert.deepEqual(JSON.parse(stdout), {
    allocations: [
      { target: 'orqaly-v2-api-preview-resolved-latest', percent: 80 },
      { target: 'orqaly-v2-api-preview-stable', percent: 20 },
    ],
    tags: [
      { tag: 'candidate', target: 'orqaly-v2-api-preview-candidate' },
      { tag: 'stable', target: 'orqaly-v2-api-preview-stable' },
    ],
  });
});

test('Cloud Run traffic snapshots reject incomplete allocations', () => {
  const result = spawnSync(
    'jq',
    ['-c', '-f', path.join(directory, 'cloud-run-traffic-snapshot.jq')],
    {
      input: JSON.stringify({
        status: { traffic: [{ revisionName: 'revision-a', percent: 90 }] },
      }),
      encoding: 'utf8',
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /traffic allocation must total 100 percent/);
});
