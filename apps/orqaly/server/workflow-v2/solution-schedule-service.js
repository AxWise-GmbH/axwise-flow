import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  CreateSolutionScheduleSchema,
  nextScheduleTime,
} from '../../shared/workflow-v2/solution-schedule-contracts.js';
import {
  SolutionError,
  resolveEffectiveSolution,
  validateSolutionInvocationInput,
} from './solution-service.js';

const fail = (code, message, status = 409) => {
  throw new SolutionError(code, message, status);
};
const keySchema = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
const publicSchedule = (value) => ({
  id: value.id,
  solutionId: value.solution_id,
  label: value.label,
  timing: value.timing,
  input: value.input,
  workflowHash: value.workflow_hash,
  status: value.status,
  nextRunAt: value.next_run_at,
  lastTickAt: value.last_tick_at,
  lastError: value.last_error,
  rowVersion: value.row_version,
  createdAt: value.created_at,
});

export function createSolutionScheduleService({
  repository,
  solutionService,
  enabled = false,
  environmentIds = null,
  now = () => new Date(),
}) {
  const permittedEnvironments = environmentIds === null ? null : new Set(environmentIds);
  const environmentAllowed = (solution) =>
    permittedEnvironments === null || permittedEnvironments.has(solution.environment_id);
  const unavailableReason =
    'Automatic runs are not enabled for this Solution’s isolated runtime. Manual and application-key runs are unchanged.';
  const tx = (scope, fn) => repository.solutionBuildTransaction(scope, fn);
  async function owner(auth) {
    if (!auth?.userId) fail('UNAUTHENTICATED', 'Sign in required', 401);
    return {
      tenantId: await repository.resolveTenant({ userId: auth.userId }),
      userId: auth.userId,
    };
  }
  async function solutionFor(client, scope, id) {
    const value = (
      await client.query(
        'SELECT * FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 FOR UPDATE',
        [scope.tenantId, scope.userId, z.uuid().parse(id)]
      )
    ).rows[0];
    if (!value) fail('SOLUTION_NOT_FOUND', 'Solution not found', 404);
    return resolveEffectiveSolution(client, value);
  }
  async function stop(client, scope, schedule, code, status = 'needs_attention') {
    return (
      await client.query(
        `UPDATE orqaly.solution_schedules SET status=$4,last_error=$5,lease_token=NULL,lease_expires_at=NULL,row_version=row_version+1 WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 RETURNING *`,
        [scope.tenantId, scope.userId, schedule.id, status, code]
      )
    ).rows[0];
  }
  return {
    async list(auth, solutionId) {
      const scope = await owner(auth);
      return tx(scope, async (client) => {
        const solution = await solutionFor(client, scope, solutionId);
        const schedules = await client.query(
          'SELECT * FROM orqaly.solution_schedules WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 ORDER BY created_at DESC LIMIT 30',
          [scope.tenantId, scope.userId, solutionId]
        );
        const ticks = await client.query(
          'SELECT id,schedule_id,scheduled_at,invocation_id,status,error_code,completed_at FROM orqaly.solution_schedule_ticks WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 ORDER BY created_at DESC LIMIT 30',
          [scope.tenantId, scope.userId, solutionId]
        );
        const available = enabled && environmentAllowed(solution);
        return {
          enabled: available,
          disabledReason: available
            ? null
            : enabled
              ? unavailableReason
              : 'Scheduled execution is not configured on this deployment.',
          schedules: schedules.rows.map(publicSchedule),
          ticks: ticks.rows,
        };
      });
    },
    async create(auth, solutionId, body, key) {
      if (!enabled)
        fail(
          'SCHEDULES_UNAVAILABLE',
          'Scheduled execution is not configured on this deployment.',
          503
        );
      const command = CreateSolutionScheduleSchema.parse(body);
      keySchema.parse(key);
      const scope = await owner(auth);
      return tx(scope, async (client) => {
        const solution = await solutionFor(client, scope, solutionId);
        if (!environmentAllowed(solution))
          fail('SCHEDULE_ENVIRONMENT_UNAVAILABLE', unavailableReason, 503);
        const requestHash = hash(command);
        const prior = (
          await client.query(
            'SELECT * FROM orqaly.solution_schedules WHERE tenant_id=$1 AND solution_id=$2 AND create_key=$3',
            [scope.tenantId, solutionId, key]
          )
        ).rows[0];
        if (prior) {
          if (prior.request_hash !== requestHash)
            fail(
              'IDEMPOTENCY_CONFLICT',
              'This schedule request was already used with different settings.'
            );
          return { schedule: publicSchedule(prior), replayed: true };
        }
        if (solution.status !== 'active' || !solution.deployment || solution.last_error)
          fail('SOLUTION_NOT_ACTIVE', 'Activate and verify the Solution before scheduling it.');
        if (solution.workflow_hash !== command.workflowHash)
          fail(
            'SCHEDULE_RELEASE_CHANGED',
            'The active workflow changed. Review this version before scheduling it.'
          );
        validateSolutionInvocationInput(solution, command.input);
        const count = Number(
          (
            await client.query(
              "SELECT count(*) FROM orqaly.solution_schedules WHERE tenant_id=$1 AND solution_id=$2 AND status='active'",
              [scope.tenantId, solutionId]
            )
          ).rows[0].count
        );
        if (count >= 5)
          fail('SCHEDULE_LIMIT', 'At most five active schedules are allowed per Solution.');
        const result = await client.query(
          `INSERT INTO orqaly.solution_schedules(tenant_id,id,solution_id,owner_user_id,label,workflow_hash,revision_id,timing,input,create_key,request_hash,next_run_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            scope.tenantId,
            randomUUID(),
            solutionId,
            scope.userId,
            command.label,
            solution.workflow_hash,
            solution.revision_id ?? null,
            command.timing,
            command.input,
            key,
            requestHash,
            nextScheduleTime(command.timing, now()),
          ]
        );
        return { schedule: publicSchedule(result.rows[0]), replayed: false };
      });
    },
    async pause(auth, solutionId, scheduleId) {
      const scope = await owner(auth);
      return tx(scope, async (client) => {
        await solutionFor(client, scope, solutionId);
        const value = (
          await client.query(
            'SELECT * FROM orqaly.solution_schedules WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 FOR UPDATE',
            [scope.tenantId, scope.userId, solutionId, z.uuid().parse(scheduleId)]
          )
        ).rows[0];
        if (!value) fail('SCHEDULE_NOT_FOUND', 'Schedule not found', 404);
        return {
          schedule: publicSchedule(
            value.status === 'paused'
              ? value
              : await stop(client, scope, value, 'PAUSED_BY_USER', 'paused')
          ),
          inFlightMayFinish: true,
        };
      });
    },
    async advanceOne() {
      if (!enabled) return { processed: false };
      const claim = await repository.claimSolutionSchedule(randomUUID());
      if (!claim) return { processed: false };
      const scope = { tenantId: claim.tenantId, userId: claim.userId };
      const admitted = await tx(scope, async (client) => {
        const solution = await solutionFor(client, scope, claim.solutionId);
        const schedule = (
          await client.query(
            'SELECT * FROM orqaly.solution_schedules WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 FOR UPDATE',
            [scope.tenantId, scope.userId, claim.scheduleId]
          )
        ).rows[0];
        if (
          !schedule ||
          schedule.status !== 'active' ||
          schedule.lease_token !== claim.leaseToken ||
          new Date(schedule.lease_expires_at) <= now()
        )
          return null;
        if (!environmentAllowed(solution)) {
          await stop(client, scope, schedule, 'SCHEDULE_ENVIRONMENT_UNAVAILABLE');
          return null;
        }
        const tenant = (
          await client.query('SELECT status FROM orqaly.tenants WHERE id=$1', [scope.tenantId])
        ).rows[0];
        if (tenant?.status !== 'active') {
          await stop(client, scope, schedule, 'SCHEDULE_TENANT_UNAVAILABLE');
          return null;
        }
        if (
          solution.status !== 'active' ||
          solution.last_error ||
          !solution.deployment ||
          solution.workflow_hash !== schedule.workflow_hash ||
          (solution.revision_id ?? null) !== schedule.revision_id
        ) {
          await stop(client, scope, schedule, 'SCHEDULE_RELEASE_UNAVAILABLE');
          return null;
        }
        const unresolved = (
          await client.query(
            "SELECT * FROM orqaly.solution_schedule_ticks WHERE tenant_id=$1 AND schedule_id=$2 AND status<>'succeeded' ORDER BY created_at DESC LIMIT 1",
            [scope.tenantId, schedule.id]
          )
        ).rows[0];
        if (unresolved) {
          if (unresolved.status === 'running')
            await client.query(
              "UPDATE orqaly.solution_schedule_ticks SET status='outcome_unknown',error_code='SCHEDULE_INTERRUPTED',completed_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
              [scope.tenantId, unresolved.id]
            );
          await stop(client, scope, schedule, 'SCHEDULE_PRIOR_OUTCOME_UNRESOLVED');
          return null;
        }
        // One Solution-wide unknown/in-flight effect also bars scheduled work.
        const pending = (
          await client.query(
            "SELECT id FROM orqaly.solution_invocations WHERE tenant_id=$1 AND solution_id=$2 AND status IN ('running','outcome_unknown') LIMIT 1",
            [scope.tenantId, claim.solutionId]
          )
        ).rows[0];
        if (pending) {
          await stop(client, scope, schedule, 'SCHEDULE_SOLUTION_OUTCOME_UNRESOLVED');
          return null;
        }
        validateSolutionInvocationInput(solution, schedule.input);
        const invocationId = randomUUID(),
          tickId = randomUUID();
        const invocation = (
          await client.query(
            `INSERT INTO orqaly.solution_invocations(tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,status,revision_id,evidence) VALUES($1,$2,$3,$4,'production',$5,$6,$7,$8,'running',$9,$10) RETURNING *`,
            [
              scope.tenantId,
              claim.solutionId,
              invocationId,
              scope.userId,
              `schedule_${schedule.id}_${new Date(schedule.next_run_at).getTime()}`,
              hash({
                scheduleId: schedule.id,
                dueAt: new Date(schedule.next_run_at).toISOString(),
                workflowHash: solution.workflow_hash,
                input: schedule.input,
              }),
              solution.workflow_hash,
              schedule.input,
              solution.revision_id ?? null,
              {
                scheduleId: schedule.id,
                tickId,
                scheduledAt: new Date(schedule.next_run_at).toISOString(),
              },
            ]
          )
        ).rows[0];
        await client.query(
          "INSERT INTO orqaly.solution_schedule_ticks(tenant_id,schedule_id,id,owner_user_id,scheduled_at,invocation_id,solution_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,'running')",
          [
            scope.tenantId,
            schedule.id,
            tickId,
            scope.userId,
            schedule.next_run_at,
            invocationId,
            claim.solutionId,
          ]
        );
        await client.query(
          'UPDATE orqaly.solution_schedules SET last_tick_at=$3,next_run_at=$4,lease_token=NULL,lease_expires_at=NULL,row_version=row_version+1 WHERE tenant_id=$1 AND id=$2',
          [
            scope.tenantId,
            schedule.id,
            schedule.next_run_at,
            nextScheduleTime(schedule.timing, now(), schedule.next_run_at),
          ]
        );
        return { solution, invocation, tickId };
      });
      if (!admitted) return { processed: true, status: 'not_dispatched' };
      // All claims commit before the external effect. A lost worker never repeats
      // the dispatch: its persisted running tick becomes unknown on recovery.
      let result;
      try {
        result = await solutionService.executeClaimedInvocation(scope, admitted);
      } catch {
        result = { invocation: { status: 'outcome_unknown' } };
      }
      const status = ['succeeded', 'failed'].includes(result.invocation.status)
        ? result.invocation.status
        : 'outcome_unknown';
      await tx(scope, async (client) => {
        await client.query(
          "UPDATE orqaly.solution_schedule_ticks SET status=$3,error_code=$4,completed_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status='running'",
          [
            scope.tenantId,
            admitted.tickId,
            status,
            status === 'succeeded' ? null : 'SCHEDULE_EXECUTION_REQUIRES_ATTENTION',
          ]
        );
        if (status !== 'succeeded') {
          const schedule = (
            await client.query(
              'SELECT * FROM orqaly.solution_schedules WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
              [scope.tenantId, claim.scheduleId]
            )
          ).rows[0];
          if (schedule.status === 'active')
            await stop(client, scope, schedule, 'SCHEDULE_EXECUTION_REQUIRES_ATTENTION');
        }
      });
      return { processed: true, status, invocationId: admitted.invocation.id };
    },
  };
}
