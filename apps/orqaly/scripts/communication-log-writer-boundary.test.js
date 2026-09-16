import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('communication log service writer coverage', () => {
  it('stamps authenticated chat, controller, assistant, and notification writes', () => {
    const chat = source('lib/api-handlers/agent-chat.js');
    const controller = source('lib/communicator-handlers/controller.js');
    const assistant = source('lib/communicator-handlers/assistant-bridge.js');
    const notify = source('lib/utils/notify-user.js');

    expect(chat).toMatch(/from\('communication_logs'\)\.insert\(\{[\s\S]*?user_id: userId/);
    expect(controller).toMatch(
      /from\('communication_logs'\)[\s\S]*?\.insert\(\{[\s\S]*?user_id: user\.id,[\s\S]*?sender_id: user\.id/
    );
    expect(assistant).toMatch(
      /from\('communication_logs'\)[\s\S]*?\.insert\(\{[\s\S]*?user_id: userId,[\s\S]*?sender_id: userId/
    );
    expect(notify).toMatch(
      /from\('communication_logs'\)[\s\S]*?\.insert\(\{[\s\S]*?user_id: userId/
    );
  });

  it('binds job logs to the claimed row owner and fails closed without it', () => {
    const processor = source('lib/agent-handlers/job-processor.js');
    const commLog = source('lib/utils/commLog.js');

    expect(processor).toContain(
      "'id, user_id, status, payload, retry_count, max_retries, worker_scope, updated_at, error, result, lease_token, heartbeat_at, lease_expires_at'"
    );
    expect(processor).toMatch(/commLog\(\{\s*user_id: authority\.userId,/);
    expect(commLog).toContain('if (!entry?.user_id) return;');
    expect(commLog).toMatch(/from\('communication_logs'\)\.insert\(\{\s*user_id:/);
  });

  it('maps generic webhooks through connected_by and skips unmapped scaffolds', () => {
    const webhook = source('lib/communicator-handlers/webhook-receiver.js');
    const genericStart = webhook.indexOf('async function handleWebhook');
    const helperStart = webhook.indexOf('// ─── Helpers', genericStart);
    const generic = webhook.slice(genericStart, helperStart);
    const discordStart = webhook.indexOf('async function handleDiscord');
    const slackStart = webhook.indexOf('async function handleSlack');
    const discord = webhook.slice(discordStart, slackStart);
    const slack = webhook.slice(slackStart, genericStart);

    expect(generic).toContain("select('id, config, status, connected_by')");
    expect(generic).toContain('if (!channel?.connected_by)');
    expect(generic).toContain('user_id: channel.connected_by');
    expect(generic).toContain('metadata: { ...body, channel_id: channel.id }');
    expect(discord).not.toContain("from('communication_logs')");
    expect(slack).not.toContain("from('communication_logs')");
  });

  it('keeps demo service-role seeds owner-scoped', () => {
    const createDemo = source('scripts/create-demo-account.js');
    const demoData = source('scripts/demo-data.js');

    expect(createDemo).toMatch(/from\('communication_logs'\)\.delete\(\)\.eq\('user_id', userId\)/);
    expect(demoData).toMatch(/comms\.push\(\{[\s\S]*?user_id: userId/);
  });

  it('wipes communication history only through its durable owner column', () => {
    const wipe = source('scripts/wipe-user-data.mjs');
    const communicationTargets = wipe
      .split('\n')
      .filter((line) => line.includes("table: 'communication_logs'"));

    expect(communicationTargets).toHaveLength(1);
    expect(communicationTargets[0]).toContain("q.eq('user_id', uid)");
    expect(communicationTargets[0]).not.toContain('sender_id');
    expect(communicationTargets[0]).not.toContain('.is(');
  });
});
