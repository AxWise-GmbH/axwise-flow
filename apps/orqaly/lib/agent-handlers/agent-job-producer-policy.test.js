import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCAN_ROOTS = ['lib', 'api', 'scripts'];

// These controllers own specialized trust boundaries. enqueue.js validates the
// public payload, pre-generates an exact ID, and reconciles ambiguous inserts;
// the remaining controllers run behind explicit trusted worker binding.
const SPECIALIZED_PRODUCERS = new Set([
  'lib/agent-handlers/enqueue.js',
  'lib/agent-handlers/process-next.js',
  'lib/agent-handlers/goal-reconciler.js',
  'lib/api-handlers/goals.js',
]);

const PREVIEW_ACKNOWLEDGING_PRODUCERS = [
  'lib/integrations/axwise/outcome-delivery.js',
  'lib/integrations/axwise/grounding-job.js',
  'lib/goal-handlers/loop-continuation.js',
  'lib/api-handlers/arena.js',
  'lib/api-handlers/design-comments.js',
  'lib/invest-handlers/deals.js',
  'lib/workflow-engine/node-executors/sub-agent-executor.js',
  'lib/communicator-handlers/assistant-bridge.js',
  'lib/communicator-handlers/webhook-receiver.js',
  'lib/goal-handlers/stages/osja-review.js',
  'lib/pulses/actions/run-instruction.js',
  'lib/api-handlers/library-calibration.js',
  'lib/api-handlers/workflows.js',
  'scripts/cancel-and-clone-goal.js',
  'scripts/repair-authorization-roles.mjs',
  'scripts/run-quality-test.mjs',
];

const OWNER_BOUND_OPERATOR_PRODUCERS = [
  'scripts/cancel-and-clone-goal.js',
  'scripts/repair-authorization-roles.mjs',
  'scripts/run-quality-test.mjs',
];

function runtimeJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return runtimeJavaScriptFiles(absolute);
    if (!entry.isFile() || !/\.(?:c|m)?js$/.test(entry.name) || entry.name.includes('.test.')) {
      return [];
    }
    return [absolute];
  });
}

describe('agent_jobs producer policy', () => {
  it('routes every general-purpose direct write through the trusted runtime binder', () => {
    const violations = [];
    const directWrite = /\.from\((['"])agent_jobs\1\)\s*\.(?:insert|upsert)\s*\(/g;

    for (const scanRoot of SCAN_ROOTS) {
      for (const absolute of runtimeJavaScriptFiles(path.join(ROOT, scanRoot))) {
        const relative = path.relative(ROOT, absolute).split(path.sep).join('/');
        if (SPECIALIZED_PRODUCERS.has(relative)) continue;

        const source = fs.readFileSync(absolute, 'utf8');
        for (const match of source.matchAll(directWrite)) {
          const argumentPrefix = source.slice(match.index + match[0].length, match.index + 350);
          if (!/^\s*bindAgentJobs?ToWorkerDeployment\s*\(/.test(argumentPrefix)) {
            const line = source.slice(0, match.index).split('\n').length;
            violations.push(`${relative}:${line}`);
          }
        }
      }
    }

    expect(violations, 'Unbound direct agent_jobs writes').toEqual([]);
  });

  it.each(PREVIEW_ACKNOWLEDGING_PRODUCERS)(
    '%s uses the durable exact-wake producer instead of acknowledging a direct insert',
    (relative) => {
      const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      expect(source).toMatch(/await\s+enqueueAgentJob(?:Impl)?\s*\(/);
      expect(source).not.toMatch(/\.from\((['"])agent_jobs\1\)\s*\.(?:insert|upsert)\s*\(/);
    }
  );

  it.each(OWNER_BOUND_OPERATOR_PRODUCERS)(
    '%s explicitly carries the durable owner on the row and every payload alias',
    (relative) => {
      const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      expect(source).toMatch(/user_id:\s*(?:freshO|o)wnerId/);
      expect(source).toMatch(/_userId:\s*(?:freshO|o)wnerId/);
      expect(source).toMatch(/userId:\s*(?:freshO|o)wnerId/);
    }
  );

  it('does not add an untargeted grounding wake after the durable producer returns', () => {
    const source = fs.readFileSync(path.join(ROOT, 'lib/agent-handlers/copilot.js'), 'utf8');
    expect(source).toContain('enqueueAxwiseGroundJob');
    expect(source).not.toContain('triggerProcessNext');
  });

  it('registers calibration in the authenticated app dispatcher and keeps its UI off generic enqueue', () => {
    const dispatcher = fs.readFileSync(path.join(ROOT, 'api/app.js'), 'utf8');
    const service = fs.readFileSync(path.join(ROOT, 'src/services/calibrationService.js'), 'utf8');
    expect(dispatcher).toMatch(/'library-calibration':\s*libraryCalibration/);
    expect(service).toContain('/api/app?path=library-calibration&action=${action}');
    expect(service).not.toContain("type: 'library-calibration'");
  });

  it('routes workflow and Job Pool task execution through their owned-resource handlers', () => {
    const workflowService = fs.readFileSync(
      path.join(ROOT, 'src/services/workflowExecutionService.js'),
      'utf8'
    );
    const pipelineService = fs.readFileSync(
      path.join(ROOT, 'src/services/pipelineService.js'),
      'utf8'
    );
    expect(workflowService).toContain('/api/app?path=workflows&action=execute');
    expect(workflowService).not.toContain("type: 'execute-workflow'");
    expect(pipelineService).toContain('/api/app?path=arena&op=run-agent');
    expect(pipelineService).not.toMatch(/type:\s*['"]execute-task['"]/);
  });

  it('keeps MCP workflow execution on the owner-scoped route and generic enqueue public-only', () => {
    const mcp = fs.readFileSync(path.join(ROOT, 'mcp/index.js'), 'utf8');
    const agentDocs = fs.readFileSync(
      path.join(ROOT, 'src/pages/Documentation/data/agents.js'),
      'utf8'
    );
    const toolDocs = fs.readFileSync(
      path.join(ROOT, 'src/pages/Documentation/data/tools.js'),
      'utf8'
    );
    const consiliumDocs = fs.readFileSync(
      path.join(ROOT, 'src/pages/Documentation/data/consilium.js'),
      'utf8'
    );
    const integrationGuide = fs.readFileSync(
      path.join(ROOT, 'public/documentation/integration-guide.md'),
      'utf8'
    );
    const connectionGuide = fs.readFileSync(
      path.join(ROOT, 'docs/AGENT_CONNECTION_GUIDE.md'),
      'utf8'
    );
    const agentFactory = fs.readFileSync(
      path.join(ROOT, 'lib/concilium-handlers/agent-factory.js'),
      'utf8'
    );
    const agentInstructions = fs.readFileSync(
      path.join(ROOT, 'lib/concilium-handlers/agents.js'),
      'utf8'
    );

    expect(mcp).toContain('/api/app?path=workflows&action=execute');
    expect(mcp).not.toMatch(
      /call\(['"]POST['"],\s*['"]\/api\/agent\?path=enqueue['"],\s*\{[^}]*execute-workflow/
    );
    expect(mcp).toContain("z.enum(['run-llm', 'evaluate'])");
    expect(agentDocs).toContain('/api/app?path=workflows&action=execute');
    expect(toolDocs).toContain('/api/app?path=workflows&action=execute');
    expect(agentDocs).not.toContain("type: 'execute-workflow'");
    expect(toolDocs).not.toContain('"execute-workflow"');
    expect(agentDocs).toMatch(/"type": "evaluate",\s*"payload": \{/);
    expect(consiliumDocs).toContain('CONCILIUM_EVALUATION_NOT_ENABLED');
    expect(consiliumDocs).not.toContain("type: 'concilium-evaluate'");
    for (const source of [integrationGuide, connectionGuide, agentFactory, agentInstructions]) {
      expect(source).toContain('/api/app?path=workflows&action=execute');
      expect(source).not.toMatch(/api\/agent(?:\/enqueue|\?path=enqueue)[^\n]*execute-workflow/);
    }
  });
});
