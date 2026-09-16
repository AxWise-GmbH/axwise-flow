import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { withTenantTransaction } from '../src/db/pool.js';
import {
  AgentLifecycleRequestSchema,
  CreateAgentRequestSchema,
  UpdateAgentProfileRequestSchema,
} from '../src/domain/contracts.js';
import {
  changeAgentLifecycle,
  createAgent,
  getAgent,
  listAgentRuns,
  listAgents,
  updateAgentProfile,
} from '../src/repositories/control-plane-repository.js';
import { principal } from './fixtures.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;

function profile(overrides = {}) {
  return {
    version: 'orqaly_agent_profile_input_v1',
    displayName: 'Account Researcher',
    roleLabel: 'B2B account intelligence',
    description: 'Prepares bounded account research.',
    instructions: 'Use approved sources and cite every material claim.',
    avatar: { kind: 'icon', value: 'science', color: '#365E8D' },
    ...overrides,
  };
}

test(
  'real PostgreSQL persists standalone Agent identity, revisions, lifecycle and tenant isolation',
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const suffix = crypto.randomUUID();
    const owner = principal({
      requestId: `create-${suffix}`,
      workspaceId: `workspace-${suffix}`,
      userId: `user-${suffix}`,
    });
    const outsider = principal({
      requestId: `outsider-${suffix}`,
      workspaceId: `other-workspace-${suffix}`,
      userId: `other-user-${suffix}`,
    });
    try {
      const createRequest = CreateAgentRequestSchema.parse({
        version: 'orqaly_agent_create_request_v1',
        agentKind: 'persistent',
        profile: profile(),
        idempotencyKey: `create-agent-${suffix}`,
      });
      const created = await withTenantTransaction(pool, owner, (client) =>
        createAgent(client, owner, createRequest)
      );
      assert.equal(created.agent.state, 'draft');
      assert.equal(created.agent.created_from, 'manual');
      assert.equal(created.agent.source_task_id, null);
      assert.equal(created.agent.profile.versionNumber, 1);
      assert.equal(created.agent.persona_id, null);

      const replayed = await withTenantTransaction(pool, owner, (client) =>
        createAgent(client, owner, createRequest)
      );
      assert.equal(replayed.replayed, true);
      assert.equal(replayed.agent.id, created.agent.id);

      await assert.rejects(
        () => withTenantTransaction(pool, outsider, (client) => getAgent(client, created.agent.id)),
        (error) => error.status === 404 && error.code === 'agent_not_found'
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, outsider, (client) =>
            updateAgentProfile(
              client,
              outsider,
              created.agent.id,
              created.agent.version,
              UpdateAgentProfileRequestSchema.parse({
                version: 'orqaly_agent_profile_update_request_v1',
                profile: profile({ displayName: 'Out-of-scope edit' }),
                idempotencyKey: `outsider-profile-${suffix}`,
              })
            )
          ),
        (error) => error.status === 404 && error.code === 'agent_not_found'
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, outsider, (client) =>
            changeAgentLifecycle(
              client,
              outsider,
              created.agent.id,
              created.agent.version,
              AgentLifecycleRequestSchema.parse({
                version: 'orqaly_agent_lifecycle_request_v1',
                action: 'pause',
                idempotencyKey: `outsider-lifecycle-${suffix}`,
              })
            )
          ),
        (error) => error.status === 404 && error.code === 'agent_not_found'
      );

      const profileRequest = UpdateAgentProfileRequestSchema.parse({
        version: 'orqaly_agent_profile_update_request_v1',
        profile: profile({
          displayName: 'Account Research Captain',
          avatar: { kind: 'emoji', value: '🧭', color: '#8E44AD' },
        }),
        idempotencyKey: `profile-v2-${suffix}`,
      });
      const updated = await withTenantTransaction(pool, owner, (client) =>
        updateAgentProfile(client, owner, created.agent.id, 1, profileRequest)
      );
      assert.equal(updated.agent.version, 2);
      assert.equal(updated.agent.profile.versionNumber, 2);
      assert.equal(updated.agent.profile.profile.displayName, 'Account Research Captain');

      await assert.rejects(
        () =>
          withTenantTransaction(pool, owner, (client) =>
            updateAgentProfile(
              client,
              owner,
              created.agent.id,
              1,
              UpdateAgentProfileRequestSchema.parse({
                ...profileRequest,
                idempotencyKey: `stale-profile-${suffix}`,
              })
            )
          ),
        (error) => error.status === 409 && error.code === 'agent_version_conflict'
      );

      const proposed = await withTenantTransaction(pool, owner, (client) =>
        changeAgentLifecycle(
          client,
          owner,
          created.agent.id,
          updated.agent.version,
          AgentLifecycleRequestSchema.parse({
            version: 'orqaly_agent_lifecycle_request_v1',
            action: 'propose',
            idempotencyKey: `propose-${suffix}`,
          })
        )
      );
      assert.equal(proposed.agent.state, 'proposed');

      const active = await withTenantTransaction(pool, owner, (client) =>
        changeAgentLifecycle(
          client,
          { ...owner, requestId: `activate-${suffix}` },
          created.agent.id,
          proposed.agent.version,
          AgentLifecycleRequestSchema.parse({
            version: 'orqaly_agent_lifecycle_request_v1',
            action: 'activate',
            reason: 'Profile and operating boundary reviewed.',
            idempotencyKey: `activate-${suffix}`,
          })
        )
      );
      assert.equal(active.agent.state, 'active');
      assert.equal(active.agent.version, 4);
      assert.ok(active.agent.activated_at);

      const owned = await withTenantTransaction(pool, owner, (client) => listAgents(client));
      assert.equal(owned.length, 1);
      assert.equal(owned[0].id, created.agent.id);
      assert.equal(owned[0].profile.profile.avatar.value, '🧭');
      assert.deepEqual(
        await withTenantTransaction(pool, owner, (client) =>
          listAgentRuns(client, created.agent.id)
        ),
        []
      );
      assert.deepEqual(
        await withTenantTransaction(pool, outsider, (client) => listAgents(client)),
        []
      );

      const audit = await withTenantTransaction(pool, owner, (client) =>
        client.query(
          `select event_type, safe_payload
             from agentic.agent_events
            where agent_id = $1
            order by sequence_id`,
          [created.agent.id]
        )
      );
      assert.deepEqual(
        audit.rows.map((row) => row.event_type),
        [
          'agent.created',
          'agent.profile_updated',
          'agent.lifecycle_changed',
          'agent.lifecycle_changed',
        ]
      );
    } finally {
      await pool.end();
    }
  }
);

test(
  'real PostgreSQL derives an expired temporary Agent before it can be reused or edited',
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const suffix = crypto.randomUUID();
    const owner = principal({
      requestId: `temporary-${suffix}`,
      workspaceId: `workspace-${suffix}`,
      userId: `user-${suffix}`,
    });
    try {
      const created = await withTenantTransaction(pool, owner, (client) =>
        createAgent(
          client,
          owner,
          CreateAgentRequestSchema.parse({
            version: 'orqaly_agent_create_request_v1',
            agentKind: 'temporary',
            profile: profile({ displayName: 'Temporary Researcher' }),
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            idempotencyKey: `create-temporary-${suffix}`,
          })
        )
      );
      const proposed = await withTenantTransaction(pool, owner, (client) =>
        changeAgentLifecycle(
          client,
          owner,
          created.agent.id,
          created.agent.version,
          AgentLifecycleRequestSchema.parse({
            version: 'orqaly_agent_lifecycle_request_v1',
            action: 'propose',
            idempotencyKey: `propose-temporary-${suffix}`,
          })
        )
      );
      const active = await withTenantTransaction(pool, owner, (client) =>
        changeAgentLifecycle(
          client,
          owner,
          created.agent.id,
          proposed.agent.version,
          AgentLifecycleRequestSchema.parse({
            version: 'orqaly_agent_lifecycle_request_v1',
            action: 'activate',
            idempotencyKey: `activate-temporary-${suffix}`,
          })
        )
      );
      await withTenantTransaction(pool, owner, (client) =>
        client.query(
          "update agentic.agents set expires_at = now() - interval '1 second' where id = $1",
          [created.agent.id]
        )
      );

      const expired = await withTenantTransaction(pool, owner, (client) =>
        getAgent(client, created.agent.id)
      );
      assert.equal(expired.state, 'expired');
      assert.deepEqual(
        (
          await withTenantTransaction(pool, owner, (client) =>
            listAgents(client, { state: 'active' })
          )
        ).map((agent) => agent.id),
        []
      );
      assert.deepEqual(
        (
          await withTenantTransaction(pool, owner, (client) =>
            listAgents(client, { state: 'expired' })
          )
        ).map((agent) => agent.id),
        [created.agent.id]
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, owner, (client) =>
            updateAgentProfile(
              client,
              owner,
              created.agent.id,
              active.agent.version,
              UpdateAgentProfileRequestSchema.parse({
                version: 'orqaly_agent_profile_update_request_v1',
                profile: profile({ displayName: 'Expired Researcher' }),
                idempotencyKey: `edit-expired-${suffix}`,
              })
            )
          ),
        (error) => error.status === 409 && error.code === 'agent_profile_not_editable'
      );
    } finally {
      await pool.end();
    }
  }
);
