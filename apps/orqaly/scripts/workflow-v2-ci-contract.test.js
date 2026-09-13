import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const workflowRepositoryPath = '.github/workflows/workflow-v2-preview-gates.yml';
const workflowPath = `../../${workflowRepositoryPath}`;
const workflow = load(readFileSync(workflowPath, 'utf8'));
const job = workflow.jobs['preview-gates'];
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const steps = job.steps;
const commandSteps = steps.filter((step) => typeof step.run === 'string');
const command = (name) => steps.find((step) => step.name === name);
const retainedUiFilters = [
  'src/pages/GcpWorkspace',
  'src/pages/Standart',
  'src/gcp-routes',
  'src/components/Auth/GcpClerkGate',
  'src/components/Layout/Gcp',
  'src/components/Layout/gcpNav',
  'src/components/VoiceControl/AssistantMarkdown',
  'src/components/VoiceControl/CollapsibleMarkdownDocument',
];

function trackedPaths() {
  const result = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return result.stdout.split('\0').filter(Boolean);
}

function matchesPath(path, pattern) {
  const expression = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*')
    )
    .join('.*');
  return new RegExp(`^${expression}$`).test(path);
}

describe('workflow v2 reproducible preview CI contract', () => {
  it('runs the real capability database gate in a separate synthetic service for both owners', () => {
    const capability = workflow.jobs['capability-postgres'];
    expect(capability['timeout-minutes']).toBe(10);
    expect(capability.strategy.matrix['owner-login']).toEqual(['NOLOGIN', 'LOGIN']);
    expect(capability.strategy['fail-fast']).toBe(false);
    expect(capability.permissions).toBeUndefined();
    expect(capability.services.postgres.env).toEqual({
      POSTGRES_USER: 'capability_025_admin',
      POSTGRES_DB: 'orqaly_capability_025_ci',
      POSTGRES_HOST_AUTH_METHOD: 'trust',
    });
    const gate = capability.steps.at(-1);
    expect(gate.run).toBe('node scripts/workflow-v2-capability-postgres.mjs');
    expect(gate.if).toBeUndefined();
    expect(gate['continue-on-error']).toBeUndefined();
    expect(gate.env.WORKFLOW_V2_CAPABILITY_DISPOSABLE_APPROVED).toBe('new_empty_loopback_only');
    expect(gate.env.WORKFLOW_V2_CAPABILITY_DISPOSABLE_DATABASE_URL).toBe(
      'postgresql://capability_025_admin@127.0.0.1:5432/orqaly_capability_025_ci'
    );
    expect(JSON.stringify(capability)).not.toMatch(/secrets\.|gcloud|deploy|publish/);
  });
  it('makes only the reviewed workflow discoverable in a clean clone', () => {
    for (const [path, ignored] of [
      [workflowPath, false],
      ['../../.github/workflows/unreviewed.yml', true],
      ['../../.github/local-helper.json', true],
      ['../../.github/actions/local-helper/action.yml', true],
      ['nested/.github/workflows/local-helper.yml', true],
    ]) {
      const result = spawnSync('git', ['check-ignore', '--no-index', '--quiet', path]);
      expect(result.error).toBeUndefined();
      expect(result.status, path).toBe(ignored ? 0 : 1);
    }
  });

  it('keeps untrusted pull requests read-only and bounded', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(Object.keys(workflow.jobs)).toEqual(['preview-gates', 'capability-postgres']);
    expect(job.permissions).toBeUndefined();
    expect(job['timeout-minutes']).toBe(30);
    expect(workflow.concurrency['cancel-in-progress']).toBe(true);
    expect(steps.filter((step) => step.uses).map((step) => step.uses)).toEqual([
      'actions/checkout@v4',
      'actions/setup-node@v4',
    ]);
  });

  it('uses identical PR and push filters for current UI, service inputs and gate controls', () => {
    const patterns = workflow.on.pull_request.paths;
    expect(workflow.on.push.paths).toEqual(patterns);
    expect(new Set(patterns).size).toBe(patterns.length);
    const serviceInputs = readFileSync('deploy/workflow-v2/Dockerfile.service', 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('COPY '))
      .flatMap((line) => line.trim().split(/\s+/).slice(1, -1));
    const criticalPrefixes = [
      ...serviceInputs,
      ...retainedUiFilters,
      'src/components/Layout/Gcp',
      'src/components/Common/useInView',
      'src/lib/authReturnTo',
      'src/lib/sentry.js',
      'src/theme/composerSurface',
      'src/theme/measures.js',
      'src/theme/settingsMotion',
      'src/utils/mobileTouchScroll',
      'src/test/',
      'scripts/workflow-v2/',
      'scripts/solution-',
      'scripts/native-',
      'scripts/workflow-worker-',
    ];
    const criticalPaths = [
      workflowPath,
      '.dockerignore',
      '.gitignore',
      'package.json',
      'package-lock.json',
      'src/index.css',
      'scripts/verify-workflow-v2-schema.mjs',
      'eslint.config.js',
      'vitest.config.js',
      'vite.config.js',
      ...trackedPaths().filter((path) =>
        criticalPrefixes.some((prefix) => path.startsWith(prefix))
      ),
    ];
    for (const path of criticalPaths) {
      expect(existsSync(path), path).toBe(true);
      expect(
        patterns.some((pattern) => matchesPath(
          path === workflowPath ? workflowRepositoryPath : `apps/orqaly/${path}`, pattern
        )),
        path
      ).toBe(true);
    }
  });

  it('adds retained UI tests without replacing the original release suite', () => {
    const retained = command(
      'Run retained GCP workspace, routes, navigation and assistant rendering tests'
    );
    const prefix = 'npm exec -- vitest run --maxWorkers=1 ';
    expect(retained.run.startsWith(prefix)).toBe(true);
    expect(retained.run.slice(prefix.length).trim().split(/\s+/)).toEqual(retainedUiFilters);
    expect(retained.if).toBeUndefined();
    expect(retained['continue-on-error']).toBeUndefined();
    for (const filter of retainedUiFilters) {
      const tests = trackedPaths().filter(
        (path) => path.startsWith(filter) && /\.test\.jsx?$/.test(path)
      );
      expect(tests.length, filter).toBeGreaterThan(0);
      for (const path of tests) expect(existsSync(path), path).toBe(true);
    }
    expect(command('Run workflow contracts, state machine, fault, UI and release tests').run).toBe(
      'npm run test:workflow-v2:release'
    );
  });

  it('uses the checked-in lock and includes the unchanged nginx security assertion', () => {
    expect(command('Install locked dependencies').run).toBe('npm ci --ignore-scripts');
    const setup = steps.find((step) => step.uses === 'actions/setup-node@v4');
    expect(setup.with['node-version']).toBe(22);
    expect(setup.with.cache).toBe('npm');
    expect(setup.with['cache-dependency-path']).toBe('apps/orqaly/package-lock.json');
    expect(workflow.defaults.run['working-directory']).toBe('apps/orqaly');
    expect(command('Build and audit the isolated Simple and Advanced web application')['working-directory']).toBe(
      'apps/orqaly/deploy/workflow-v2/web-package'
    );
    const capabilitySetup = workflow.jobs['capability-postgres'].steps.find(
      (step) => step.uses === 'actions/setup-node@v4'
    );
    expect(capabilitySetup.with['cache-dependency-path']).toBe('apps/orqaly/package-lock.json');
    expect(command('Run workflow contracts, state machine, fault, UI and release tests').run).toBe(
      'npm run test:workflow-v2:release'
    );
    expect(packageJson.scripts['test:workflow-v2:release']).toContain('scripts/workflow-v2');
    expect(readFileSync('vitest.config.js', 'utf8')).toContain('scripts/**/*.test.js');
    expect(existsSync('scripts/workflow-v2-nginx-config.test.js')).toBe(true);
  });

  it('resolves every root npm gate to a checked-in package command', () => {
    const scriptNames = [];
    for (const step of commandSteps.filter((value) => !value['working-directory'])) {
      for (const match of step.run.matchAll(/\bnpm run ([\w:-]+)/g)) {
        const script = packageJson.scripts[match[1]];
        expect(typeof script, match[1]).toBe('string');
        scriptNames.push(match[1]);
        const entry = /^node (\S+)/.exec(script);
        if (entry) expect(existsSync(entry[1]), entry[1]).toBe(true);
      }
    }
    expect(new Set(scriptNames)).toEqual(
      new Set([
        'verify:workflow-v2-schema',
        'test:workflow-v2:release',
        'test:workflow-v2:pg',
        'test:workflow-v2:api-pg',
        'test:workflow-v2:e2e-local',
      ])
    );
  });

  it('runs PostgreSQL checks only against distinct disposable loopback databases', () => {
    expect(Object.keys(job.services)).toEqual(['postgres']);
    expect(job.services.postgres.image).toBe('postgres:16-alpine');
    expect(job.services.postgres.ports).toEqual(['5432:5432']);
    expect(job.services.postgres.env.POSTGRES_PASSWORD).toBe('preview_test_only');
    expect(job.env.PGPASSWORD).toBe('preview_test_only');
    const databaseNames = [];
    for (const step of commandSteps) {
      for (const [name, value] of Object.entries(step.env || {})) {
        if (!name.endsWith('DATABASE_URL')) continue;
        const url = new URL(value);
        expect(url.protocol).toBe('postgresql:');
        expect(url.hostname).toBe('127.0.0.1');
        expect(url.port).toBe('5432');
        expect(url.username).toBe('postgres');
        expect(url.password).toBe('preview_test_only');
        expect(step.env.WORKFLOW_V2_APPLY_BASELINE).toBe('1');
        databaseNames.push(url.pathname.slice(1));
      }
    }
    expect(databaseNames.sort()).toEqual([
      'workflow_v2_api',
      'workflow_v2_e2e_advanced',
      'workflow_v2_e2e_simple',
      'workflow_v2_structural',
    ]);
    const create = command('Create isolated real-PostgreSQL test databases').run;
    for (const name of databaseNames) {
      expect(create).toContain(`createdb --host=127.0.0.1 --username=postgres ${name}`);
    }
  });

  it('builds with public placeholders and never publishes or deploys', () => {
    expect(job.env.VITE_CLERK_PUBLISHABLE_KEY).toBe('pk_test_ci_placeholder');
    expect(new URL(job.env.VITE_ORQALY_API_URL).hostname.endsWith('.example.invalid')).toBe(true);
    const build = command('Build deployment images without publishing').run;
    expect(build.match(/docker build --pull/g)).toHaveLength(2);
    expect(build).toContain('--build-arg VITE_CLERK_PUBLISHABLE_KEY="$VITE_CLERK_PUBLISHABLE_KEY"');
    expect(build).toContain('--build-arg VITE_ORQALY_API_URL="$VITE_ORQALY_API_URL"');
    expect(build).toContain('-f deploy/workflow-v2/Dockerfile.web');
    expect(build).toContain('-f deploy/workflow-v2/Dockerfile.service');
    expect(build).not.toContain('--secret');
    expect(build).not.toContain('ORQALY_API_ORIGIN');
    const allCommands = commandSteps.map((step) => step.run).join('\n');
    expect(allCommands).not.toMatch(/\b(?:gcloud|terraform)\b|docker (?:push|login)|npm publish/);
    expect(readFileSync(workflowPath, 'utf8')).not.toContain('${{ secrets.');
  });
});
