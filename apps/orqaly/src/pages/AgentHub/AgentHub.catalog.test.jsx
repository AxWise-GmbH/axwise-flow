import { describe, it, expect, vi } from 'vitest';
import {
  agentChatRequestContext,
  agentChatRowId,
  consumeAgentChatSseText,
  invalidatePendingAgentChatHistory,
  isCurrentAgentChatRequest,
  SCHEMA_PROVIDERS,
  SCHEMA_TOKEN_COSTS,
} from './AgentHub.jsx';

// Guards the LLM picker catalog on /agent-hub. The bug this covers: the model
// dropdown offered models (e.g. Gemini) that had no entry in SCHEMA_TOKEN_COSTS,
// so the per-call cost chip broke. Keep provider models and the cost map in sync.
describe('AgentHub LLM catalog', () => {
  it('exposes the expected providers', () => {
    const ids = SCHEMA_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(['groq', 'openai', 'anthropic', 'deepseek', 'glm', 'gemini'])
    );
  });

  it('lists the current Anthropic flagship (claude-opus-5)', () => {
    const anthropic = SCHEMA_PROVIDERS.find((p) => p.id === 'anthropic');
    expect(anthropic.models).toContain('claude-opus-5');
  });

  it('lists the newer GLM models', () => {
    const glm = SCHEMA_PROVIDERS.find((p) => p.id === 'glm');
    expect(glm.models).toEqual(expect.arrayContaining(['glm-4.6', 'glm-5.1', 'glm-4-plus']));
  });

  it('lists Gemini 3.6 Flash with its GA token pricing', () => {
    const gemini = SCHEMA_PROVIDERS.find((p) => p.id === 'gemini');
    expect(gemini.models).toContain('gemini-3.6-flash');
    expect(SCHEMA_TOKEN_COSTS['gemini-3.6-flash']).toEqual({
      input: 0.0015,
      output: 0.0075,
    });
  });

  it('lists Gemini 3.8 Flash with its introductory token pricing', () => {
    const gemini = SCHEMA_PROVIDERS.find((provider) => provider.id === 'gemini');
    expect(gemini.models).toContain('gemini-3.7-flash');
    expect(gemini.models).toContain('gemini-3.8-flash');
    expect(SCHEMA_TOKEN_COSTS['gemini-3.7-flash']).toEqual({
      input: 0.00075,
      output: 0.00375,
    });
    expect(SCHEMA_TOKEN_COSTS['gemini-3.8-flash']).toEqual({
      input: 0.00075,
      output: 0.00375,
    });
  });

  it('has a token-cost entry for every selectable model', () => {
    const missing = [];
    for (const provider of SCHEMA_PROVIDERS) {
      for (const model of provider.models) {
        if (!SCHEMA_TOKEN_COSTS[model]) missing.push(`${provider.id}/${model}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every cost entry has numeric input/output rates', () => {
    for (const [model, cost] of Object.entries(SCHEMA_TOKEN_COSTS)) {
      expect(typeof cost.input, `${model}.input`).toBe('number');
      expect(typeof cost.output, `${model}.output`).toBe('number');
    }
  });
});

describe('AgentHub chat agent isolation', () => {
  it('keys chat state to the canonical persisted agents row ID', () => {
    expect(
      agentChatRowId({
        id: 'local-agent-a',
        agent_id: 'attacker-controlled-alias',
        _supabase_id: 'row-agent-a',
      })
    ).toBe('row-agent-a');
  });

  it('drops agent A history and thread during a direct A to B switch', () => {
    const priorMessages = [{ role: 'user', content: 'PRIVATE A HISTORY' }];

    expect(
      agentChatRequestContext('row-agent-b', 'row-agent-a', priorMessages, 'thread-agent-a')
    ).toEqual({ history: [], threadId: null });
  });

  it('preserves only the bounded same-agent request context', () => {
    const messages = Array.from({ length: 25 }, (_, index) => ({
      role: index % 2 ? 'agent' : 'user',
      content: `message-${index}`,
    }));

    const context = agentChatRequestContext('row-agent-a', 'row-agent-a', messages, 'thread-a');
    expect(context.history).toHaveLength(20);
    expect(context.history[0].content).toBe('message-5');
    expect(context.threadId).toBe('thread-a');
  });

  it('rejects slow GET or SSE updates from a previous agent/epoch', () => {
    expect(isCurrentAgentChatRequest('row-a', 1, 'row-b', 2)).toBe(false);
    expect(isCurrentAgentChatRequest('row-b', 1, 'row-b', 2)).toBe(false);
    expect(isCurrentAgentChatRequest('row-b', 2, 'row-b', 2)).toBe(true);
  });

  it('aborts and invalidates a pending same-agent history GET before send', () => {
    const abort = vi.fn();
    const historyAbortRef = { current: { abort } };
    const epochRef = { current: 7 };

    const sendEpoch = invalidatePendingAgentChatHistory(historyAbortRef, epochRef);

    expect(abort).toHaveBeenCalledOnce();
    expect(historyAbortRef.current).toBeNull();
    expect(sendEpoch).toBe(8);
    expect(isCurrentAgentChatRequest('row-a', 7, 'row-a', sendEpoch)).toBe(false);
    expect(isCurrentAgentChatRequest('row-a', sendEpoch, 'row-a', sendEpoch)).toBe(true);
  });

  it('retains an SSE event name when its data arrives in the next chunk', () => {
    const first = consumeAgentChatSseText({ buffer: '', eventType: '' }, 'event: done\n');
    expect(first).toMatchObject({ eventType: 'done', events: [] });

    const second = consumeAgentChatSseText(
      first,
      'data: {"message":"complete","thread_id":"thread-b"}\n\n'
    );
    expect(second.events).toEqual([
      {
        eventType: 'done',
        data: { message: 'complete', thread_id: 'thread-b' },
      },
    ]);
    expect(second.eventType).toBe('');
  });
});
