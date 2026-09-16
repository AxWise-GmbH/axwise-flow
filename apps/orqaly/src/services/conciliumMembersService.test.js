import { describe, expect, it, vi } from 'vitest';

const createMember = vi.fn(async (member) => member);
vi.mock('./conciliumMembersBackend', () => ({
  loadMembers: vi.fn(),
  createMember: (...args) => createMember(...args),
  updateMemberById: vi.fn(),
  deleteMemberById: vi.fn(),
  quarantineMember: vi.fn(),
  unquarantineMember: vi.fn(),
}));

import { addMember, resolveMemberLlmPair } from './conciliumMembersService';

describe('resolveMemberLlmPair', () => {
  it('preserves a complete explicit member choice', () => {
    expect(resolveMemberLlmPair({ provider: 'glm', model: 'custom-glm' })).toEqual({
      provider: 'glm',
      model: 'custom-glm',
    });
  });

  it('completes provider-only member data compatibly', () => {
    expect(resolveMemberLlmPair({ provider: 'deepseek' })).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
  });

  it('infers a permitted provider from model-only member data', () => {
    expect(resolveMemberLlmPair({ model: 'claude-haiku-4-5' })).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
    });
  });

  it('falls back atomically when the inferred provider is not supported by members', () => {
    expect(resolveMemberLlmPair({ model: 'qwen-max' })).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });
});

describe('addMember', () => {
  it('persists both sides of the resolved pair', async () => {
    await addMember('board-1', { name: 'Reviewer', provider: 'openai' });
    expect(createMember).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', model: 'gpt-4o-mini' })
    );
  });
});
