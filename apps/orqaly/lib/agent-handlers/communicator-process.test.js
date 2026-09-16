import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../communicator-handlers/assistant-bridge.js', () => ({
  processAssistantMessage: vi.fn(),
  formatForMessenger: vi.fn(),
}));

vi.mock('../communicator-handlers/webhook-receiver.js', () => ({
  sendTelegramMessage: vi.fn(async () => true),
  sendTelegramDocument: vi.fn(async () => true),
}));

vi.mock('../communicator-handlers/voice-transcribe.js', () => ({
  transcribeVoice: vi.fn(),
}));

vi.mock('../communicator-handlers/file-ingest.js', () => ({
  ingestTelegramFile: vi.fn(),
  wrapExternal: vi.fn((value) => value),
}));

vi.mock('../communicator-handlers/smalltalk.js', () => ({
  matchSmalltalk: vi.fn(() => null),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { sendTelegramMessage } from '../communicator-handlers/webhook-receiver.js';
import { handleCommunicatorProcess } from './communicator-process.js';

function channel(overrides = {}) {
  return {
    id: 'channel-1',
    connected_by: 'user-1',
    status: 'active',
    config: {
      bot_token: 'test-token',
      allowed_ids: 'sender-1',
      chat_ids: ['chat-1'],
    },
    ...overrides,
  };
}

function adminWithChannelReads(rows) {
  const filters = [];
  return {
    filters,
    from: vi.fn((table) => {
      expect(table).toBe('communication_channels');
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((field, value) => {
          filters.push([field, value]);
          return chain;
        }),
        maybeSingle: vi.fn(async () => ({ data: rows.shift() || null, error: null })),
      };
      return chain;
    }),
  };
}

function payload(overrides = {}) {
  return {
    type: 'communicator-process',
    platform: 'telegram',
    channel_id: 'channel-1',
    user_id: 'user-1',
    message: {
      chat_id: 'chat-1',
      from_id: 'sender-1',
      text: '/help',
      message_id: 'message-1',
    },
    ...overrides,
  };
}

describe('communicator process runtime authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a payload owner that differs from the durable queue owner', async () => {
    const admin = adminWithChannelReads([channel()]);
    buildSupabaseAdminClient.mockReturnValue(admin);

    await expect(handleCommunicatorProcess(payload(), null, 'victim-user')).rejects.toThrow(
      'JOB_OWNER_VALIDATION_ERROR'
    );

    expect(admin.from).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('filters the channel by durable owner before its token or config can be returned', async () => {
    const admin = adminWithChannelReads([null]);
    buildSupabaseAdminClient.mockReturnValue(admin);

    await expect(handleCommunicatorProcess(payload(), null, 'user-1')).rejects.toThrow(
      'communication channel is not owned by the durable owner'
    );

    expect(admin.filters).toContainEqual(['connected_by', 'user-1']);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('revalidates sender and chat immediately before an outbound reply', async () => {
    const revoked = channel({ config: { bot_token: 'test-token', allowed_ids: '', chat_ids: [] } });
    const admin = adminWithChannelReads([channel(), revoked]);
    buildSupabaseAdminClient.mockReturnValue(admin);

    await expect(handleCommunicatorProcess(payload(), null, 'user-1')).rejects.toThrow(
      'Telegram sender or chat is no longer authorized'
    );

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('sends a help reply only after both owner and destination checks pass', async () => {
    const admin = adminWithChannelReads([channel(), channel()]);
    buildSupabaseAdminClient.mockReturnValue(admin);

    const result = await handleCommunicatorProcess(payload(), null, 'user-1');

    expect(result).toEqual({ type: 'communicator-process', help: true });
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      'test-token',
      'chat-1',
      expect.stringContaining('Orqaly Telegram bot'),
      undefined
    );
  });
});
