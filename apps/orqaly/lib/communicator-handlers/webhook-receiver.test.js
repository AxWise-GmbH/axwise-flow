import { afterEach, describe, expect, it, vi } from 'vitest';

import { deterministicAgentJobId } from '../goal-handlers/_helpers.js';
import { enqueueTelegramProcessingJob, handleTelegram } from './webhook-receiver.js';

const ENV = { NODE_ENV: 'test', VERCEL_ENV: 'production' };

function input() {
  return {
    updateId: 'update-42',
    channel: { id: 'channel-1', connected_by: 'user-1' },
    chatId: 'chat-9',
    fromId: 'sender-7',
    text: 'create a goal',
    message: { message_id: 11 },
  };
}

function businessPayload() {
  return {
    type: 'communicator-process',
    platform: 'telegram',
    update_id: 'update-42',
    channel_id: 'channel-1',
    user_id: 'user-1',
    _userId: 'user-1',
    userId: 'user-1',
    message: {
      chat_id: 'chat-9',
      from_id: 'sender-7',
      text: 'create a goal',
      voice: null,
      audio: null,
      photo: null,
      document: null,
      caption: '',
      message_id: 11,
    },
  };
}

function generationAdmin({ rows = [], error = null } = {}) {
  const query = {
    select: () => query,
    eq: () => query,
    contains: () => query,
    order: () => query,
    limit: async () => ({ data: rows, error }),
  };
  return { from: vi.fn((table) => (table === 'agent_jobs' ? query : null)) };
}

function enqueueRecorder() {
  const calls = [];
  const fn = vi.fn(async (_admin, job) => {
    calls.push(job);
    return { ...job, status: 'queued', worker_scope: 'production' };
  });
  return { fn, calls };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function telegramAuthAdmin({ channel = null } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      if (table === 'processed_updates') {
        return {
          select() {
            const query = {
              eq: () => query,
              maybeSingle: async () => ({ data: null, error: null }),
            };
            return query;
          },
          insert(row) {
            writes.push({ table, row });
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'communication_channels') {
        let mode = 'read';
        let updateRow = null;
        const query = {
          select: () => query,
          eq: (field, value) => {
            if (mode === 'update') {
              writes.push({ table, row: updateRow, filter: [field, value] });
              return Promise.resolve({ error: null });
            }
            return query;
          },
          contains: () => query,
          limit: () => query,
          maybeSingle: async () => ({ data: channel, error: null }),
          update(row) {
            mode = 'update';
            updateRow = row;
            return query;
          },
          then(resolve, reject) {
            return Promise.resolve({ data: channel ? [channel] : [], error: null }).then(
              resolve,
              reject
            );
          },
        };
        return query;
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function telegramRequest({ text, secret = '', updateId = 'auth-update-1', fromId = 'sender-1' }) {
  return {
    headers: { 'x-telegram-bot-api-secret-token': secret },
    body: {
      update_id: updateId,
      message: {
        from: { id: fromId },
        chat: { id: `chat-${fromId}` },
        text,
        message_id: 1,
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Telegram webhook secret boundary', () => {
  it('rejects an empty secret before redeeming a shared-bot link code', async () => {
    vi.stubEnv('TELEGRAM_SHARED_SECRET_TOKEN', 'shared-secret');
    const admin = telegramAuthAdmin();
    const res = responseRecorder();

    await handleTelegram(telegramRequest({ text: '/start ABC123' }), res, admin);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'invalid secret token' });
    expect(admin.writes).toEqual([]);
  });

  it('fails closed before link redemption when the shared secret is not configured', async () => {
    vi.stubEnv('TELEGRAM_SHARED_SECRET_TOKEN', '');
    const admin = telegramAuthAdmin();
    const res = responseRecorder();

    await handleTelegram(
      telegramRequest({ text: '/link ABC123', secret: 'attacker-supplied' }),
      res,
      admin
    );

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toContain('not configured');
    expect(admin.writes).toEqual([]);
  });

  it('requires the BYO channel secret before unlink side effects', async () => {
    vi.stubEnv('TELEGRAM_SHARED_SECRET_TOKEN', 'shared-secret');
    const admin = telegramAuthAdmin({
      channel: {
        id: 'channel-byo',
        config: {
          allowed_ids: 'sender-byo',
          bot_token: 'byo-bot-token',
          secret_token: 'byo-secret',
        },
      },
    });
    const res = responseRecorder();

    await handleTelegram(
      telegramRequest({ text: '/unlink', fromId: 'sender-byo', updateId: 'auth-update-2' }),
      res,
      admin
    );

    expect(res.statusCode).toBe(401);
    expect(admin.writes).toEqual([]);
  });

  it('does not let a BYO channel without its own secret fall back to the shared secret', async () => {
    vi.stubEnv('TELEGRAM_SHARED_SECRET_TOKEN', 'shared-secret');
    const admin = telegramAuthAdmin({
      channel: {
        id: 'channel-byo',
        config: { allowed_ids: 'sender-byo', bot_token: 'byo-bot-token' },
      },
    });
    const res = responseRecorder();

    await handleTelegram(
      telegramRequest({
        text: '/unlink',
        secret: 'shared-secret',
        fromId: 'sender-byo',
        updateId: 'auth-update-3',
      }),
      res,
      admin
    );

    expect(res.statusCode).toBe(503);
    expect(admin.writes).toEqual([]);
  });

  it('accepts an exact BYO secret and only then performs the unlink writes', async () => {
    vi.stubEnv('TELEGRAM_SHARED_SECRET_TOKEN', 'shared-secret');
    vi.stubEnv('TELEGRAM_SHARED_BOT_TOKEN', '');
    const admin = telegramAuthAdmin({
      channel: {
        id: 'channel-byo',
        config: {
          allowed_ids: 'sender-byo',
          bot_token: 'byo-bot-token',
          secret_token: 'byo-secret',
        },
      },
    });
    const res = responseRecorder();

    await handleTelegram(
      telegramRequest({
        text: '/unlink',
        secret: 'byo-secret',
        fromId: 'sender-byo',
        updateId: 'auth-update-4',
      }),
      res,
      admin
    );

    expect(res.statusCode).toBe(200);
    expect(admin.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'communication_channels',
          row: { status: 'inactive' },
          filter: ['id', 'channel-byo'],
        }),
        expect.objectContaining({
          table: 'processed_updates',
          row: expect.objectContaining({ update_id: 'auth-update-4' }),
        }),
      ])
    );
  });

  it('rejects a normal channel message before activity or queue writes when the header is empty', async () => {
    vi.stubEnv('TELEGRAM_SHARED_SECRET_TOKEN', 'shared-secret');
    const admin = telegramAuthAdmin({
      channel: {
        id: 'channel-normal',
        connected_by: 'user-1',
        status: 'active',
        config: { allowed_ids: 'sender-normal', secret_token: 'channel-secret' },
      },
    });
    const res = responseRecorder();

    await handleTelegram(
      telegramRequest({
        text: 'create a goal',
        fromId: 'sender-normal',
        updateId: 'auth-update-5',
      }),
      res,
      admin
    );

    expect(res.statusCode).toBe(401);
    expect(admin.writes).toEqual([]);
  });

  it('authenticates callback buttons before delegating any action', async () => {
    vi.stubEnv('TELEGRAM_SHARED_SECRET_TOKEN', 'shared-secret');
    const admin = telegramAuthAdmin({
      channel: {
        id: 'channel-callback',
        connected_by: 'user-1',
        status: 'active',
        config: { allowed_ids: 'sender-callback', secret_token: 'callback-secret' },
      },
    });
    const res = responseRecorder();
    const req = {
      headers: { 'x-telegram-bot-api-secret-token': '' },
      body: {
        update_id: 'auth-update-6',
        callback_query: {
          id: 'callback-1',
          from: { id: 'sender-callback' },
          data: 'goal:cancel:goal-1',
          message: { chat: { id: 'chat-1' }, message_id: 1 },
        },
      },
    };

    await handleTelegram(req, res, admin);

    expect(res.statusCode).toBe(401);
    expect(admin.writes).toEqual([]);
  });
});

describe('Telegram deterministic job generations', () => {
  it('uses the backward-compatible first-generation id for a new update', async () => {
    const admin = generationAdmin();
    const enqueue = enqueueRecorder();

    const job = await enqueueTelegramProcessingJob(admin, input(), {
      env: ENV,
      enqueueAgentJobImpl: enqueue.fn,
    });

    const expectedId = deterministicAgentJobId('telegram-communicator-process', {
      updateId: 'update-42',
    });
    expect(job.id).toBe(expectedId);
    expect(enqueue.calls[0].user_id).toBe('user-1');
    expect(enqueue.calls[0].payload).toEqual(businessPayload());
    expect(enqueue.calls[0].payload).not.toHaveProperty('_telegramJobGeneration');
  });

  it('advances one deterministic generation when a webhook retry finds a terminal exact job', async () => {
    const firstId = deterministicAgentJobId('telegram-communicator-process', {
      updateId: 'update-42',
    });
    const terminal = {
      id: firstId,
      user_id: 'user-1',
      status: 'failed',
      worker_scope: 'production',
      payload: businessPayload(),
      created_at: '2026-08-22T10:00:00.000Z',
    };
    const admin = generationAdmin({ rows: [terminal] });
    const enqueue = enqueueRecorder();

    const job = await enqueueTelegramProcessingJob(admin, input(), {
      env: ENV,
      enqueueAgentJobImpl: enqueue.fn,
    });

    const expectedRecoveryId = deterministicAgentJobId('telegram-communicator-process-recovery', {
      updateId: 'update-42',
      channelId: 'channel-1',
      generation: 1,
    });
    expect(job.id).toBe(expectedRecoveryId);
    expect(enqueue.calls[0].payload).toMatchObject({
      ...businessPayload(),
      _telegramJobGeneration: 1,
      _telegramPredecessorJobId: firstId,
    });
  });

  it('collapses concurrent retries onto the same next-generation identity', async () => {
    const firstId = deterministicAgentJobId('telegram-communicator-process', {
      updateId: 'update-42',
    });
    const admin = generationAdmin({
      rows: [
        {
          id: firstId,
          user_id: 'user-1',
          status: 'cancelled',
          worker_scope: 'production',
          payload: businessPayload(),
        },
      ],
    });
    const enqueue = enqueueRecorder();

    const [left, right] = await Promise.all([
      enqueueTelegramProcessingJob(admin, input(), {
        env: ENV,
        enqueueAgentJobImpl: enqueue.fn,
      }),
      enqueueTelegramProcessingJob(admin, input(), {
        env: ENV,
        enqueueAgentJobImpl: enqueue.fn,
      }),
    ]);

    expect(left.id).toBe(right.id);
    expect(enqueue.calls[0]).toEqual(enqueue.calls[1]);
  });

  it('reuses an existing nonterminal recovery generation instead of creating another', async () => {
    const firstId = deterministicAgentJobId('telegram-communicator-process', {
      updateId: 'update-42',
    });
    const recoveryId = deterministicAgentJobId('telegram-communicator-process-recovery', {
      updateId: 'update-42',
      channelId: 'channel-1',
      generation: 1,
    });
    const recoveryPayload = {
      ...businessPayload(),
      _telegramJobGeneration: 1,
      _telegramPredecessorJobId: firstId,
    };
    const admin = generationAdmin({
      rows: [
        {
          id: recoveryId,
          user_id: 'user-1',
          status: 'queued',
          worker_scope: 'production',
          payload: recoveryPayload,
        },
        {
          id: firstId,
          user_id: 'user-1',
          status: 'failed',
          worker_scope: 'production',
          payload: businessPayload(),
        },
      ],
    });
    const enqueue = enqueueRecorder();

    const job = await enqueueTelegramProcessingJob(admin, input(), {
      env: ENV,
      enqueueAgentJobImpl: enqueue.fn,
    });

    expect(job.id).toBe(recoveryId);
    expect(enqueue.calls[0].payload).toEqual(recoveryPayload);
  });

  it('fails closed on an unknown generation read instead of creating a duplicate', async () => {
    const admin = generationAdmin({ error: { message: 'read unavailable' } });
    const enqueue = enqueueRecorder();

    await expect(
      enqueueTelegramProcessingJob(admin, input(), {
        env: ENV,
        enqueueAgentJobImpl: enqueue.fn,
      })
    ).rejects.toMatchObject({
      code: 'TELEGRAM_JOB_RECONCILIATION_REQUIRED',
      reconciliationState: 'unknown',
    });
    expect(enqueue.fn).not.toHaveBeenCalled();
  });

  it('fails closed when the deterministic generation id belongs to different work', async () => {
    const admin = generationAdmin({
      rows: [
        {
          id: 'not-the-deterministic-id',
          status: 'failed',
          worker_scope: 'production',
          payload: businessPayload(),
        },
      ],
    });
    const enqueue = enqueueRecorder();

    await expect(
      enqueueTelegramProcessingJob(admin, input(), {
        env: ENV,
        enqueueAgentJobImpl: enqueue.fn,
      })
    ).rejects.toMatchObject({
      code: 'TELEGRAM_JOB_RECONCILIATION_REQUIRED',
      reconciliationState: 'conflict',
    });
    expect(enqueue.fn).not.toHaveBeenCalled();
  });
});
