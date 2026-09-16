import { describe, expect, it } from 'vitest';
import {
  buildConsiliumCreateContext,
  buildAgentGenerateContext,
  buildCopilotContext,
  buildCopilotGroundContext,
} from './context.js';

const tenant = { userId: 'u1', orgId: 'o1' };

describe('axwise/context builders', () => {
  it('consilium.create ships only local board facts', () => {
    const ctx = buildConsiliumCreateContext({
      requestId: 'r1', tenant,
      board: { name: 'Ops', purpose: 'ship', description: 'd', security_level: 'high' },
    });
    expect(ctx.integrationPoint).toBe('consilium.create');
    expect(ctx.requestId).toBe('r1');
    expect(ctx.tenant).toBe(tenant);
    expect(ctx.payload).toEqual({ name: 'Ops', purpose: 'ship', description: 'd', security_level: 'high' });
  });

  it('agent.generate normalizes config and defaults tools to []', () => {
    const ctx = buildAgentGenerateContext({
      requestId: 'r2', tenant,
      config: { name: 'A', system_prompt: 'sp', provider: 'groq', model: 'llama' },
      boardId: 'b1',
    });
    expect(ctx.integrationPoint).toBe('agent.generate');
    expect(ctx.payload.config.tools).toEqual([]);
    expect(ctx.payload.board_id).toBe('b1');
    expect(ctx.payload.config.system_prompt).toBe('sp');
  });

  it('copilot.chat clamps history window', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: String(i) }));
    const ctx = buildCopilotContext({ requestId: 'r3', tenant, message: 'hey', history });
    expect(ctx.integrationPoint).toBe('copilot.chat');
    expect(ctx.payload.history).toHaveLength(12);
    expect(ctx.payload.message).toBe('hey');
  });

  it('copilot.ground carries draft answer + sources', () => {
    const ctx = buildCopilotGroundContext({ requestId: 'r4', tenant, draftAnswer: 'ans', sources: [{ file_name: 'f' }] });
    expect(ctx.integrationPoint).toBe('copilot.ground');
    expect(ctx.payload.draft_response).toBe('ans');
    expect(ctx.payload.grounded_resources).toHaveLength(1);
  });
});
