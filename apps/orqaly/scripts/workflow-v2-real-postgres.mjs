import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.WORKFLOW_V2_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('WORKFLOW_V2_TEST_DATABASE_URL is required');

const psqlArgs = ['-X', '-v', 'ON_ERROR_STOP=1', '-d', databaseUrl];
execFileSync(process.execPath, ['scripts/verify-workflow-v2-schema.mjs'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
if (process.env.WORKFLOW_V2_APPLY_BASELINE === '1') {
  for (const migration of [
    'database/workflow-v2/migrations/001_clean_workflow_v2.sql',
    'database/workflow-v2/migrations/002_assistant_goal.sql',
    'database/workflow-v2/migrations/003_personal_tenant_jit.sql',
    'database/workflow-v2/migrations/004_assistant_retry_lineage.sql',
    'database/workflow-v2/migrations/005_assistant_turn_events.sql',
    'database/workflow-v2/migrations/006_assistant_turn_provenance.sql',
    'database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql',
    'database/workflow-v2/migrations/008_agentic_execution_preview.sql',
  ]) {
    execFileSync('psql', [...psqlArgs, '-f', migration], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
  }
}

const variables = {
  tenant_a: randomUUID(),
  tenant_b: randomUUID(),
  agent_a: randomUUID(),
  agent_b: randomUUID(),
  tool_a: randomUUID(),
  tool_b: randomUUID(),
  clerk_user_a: `user_pg${Date.now()}a`,
  clerk_user_b: `user_pg${Date.now()}b`,
};
const variableArgs = Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`]);
execFileSync(
  'psql',
  [...psqlArgs, ...variableArgs, '-f', 'database/workflow-v2/tests/structural-and-transition.sql'],
  { cwd: process.cwd(), stdio: 'inherit' }
);
