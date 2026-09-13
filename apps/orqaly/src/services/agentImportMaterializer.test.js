import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  existingAgents: [],
  addAgentCalls: [],
  seedProfilesCalls: [],
  generateAvatarCalls: [],
  seedProfilesResult: { seeded: 0 },
  generateAvatarShouldFail: () => false,
  registerAgentsInKbCalls: [],
}));

vi.mock('./agentHubService', () => ({
  getAgents: () => h.existingAgents,
  addAgent: (agent) => {
    h.addAgentCalls.push(agent);
    return { id: `ah-${h.addAgentCalls.length}`, agent_id: `agent-${h.addAgentCalls.length}`, ...agent };
  },
}));

vi.mock('./agentProfileService', () => ({
  seedProfiles: (profiles) => {
    h.seedProfilesCalls.push(profiles);
    return Promise.resolve(h.seedProfilesResult);
  },
  generateAvatar: (opts) => {
    h.generateAvatarCalls.push(opts);
    if (h.generateAvatarShouldFail(opts)) return Promise.reject(new Error('avatar failed'));
    return Promise.resolve({ ok: true });
  },
}));

vi.mock('./knowledgeBaseService', () => ({
  registerAgentsInKb: (items) => {
    h.registerAgentsInKbCalls.push(items);
    return Promise.resolve({ registered: Array.isArray(items) ? items.length : 0 });
  },
}));

const { materializeImportedAgents } = await import('./agentImportMaterializer');

function makeItem(overrides = {}) {
  return {
    _id: 'backend-architect',
    name: 'Backend Architect',
    role: 'Backend Architect',
    description: 'Senior backend architect.',
    category: 'Engineering',
    capabilities: [],
    cost_per_task: 0,
    system_prompt: 'You are Backend Architect, a senior backend architect...',
    _persona: { color: 'blue', emoji: '🏗️', vibe: 'Designs the systems that hold everything up.' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  h.existingAgents = [];
  h.addAgentCalls = [];
  h.seedProfilesCalls = [];
  h.generateAvatarCalls = [];
  h.seedProfilesResult = { seeded: 0 };
  h.generateAvatarShouldFail = () => false;
  h.registerAgentsInKbCalls = [];
});

describe('materializeImportedAgents', () => {
  it('creates an agent per item with the batch provider/model and skips existing roles', async () => {
    h.existingAgents = [{ role: 'Already Here' }];
    h.seedProfilesResult = { seeded: 2 };
    const items = [makeItem(), makeItem({ _id: 'already-here', role: 'Already Here', name: 'Already Here' })];

    const promise = materializeImportedAgents(items, { provider: 'anthropic', model: 'claude-sonnet-5' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(h.addAgentCalls).toHaveLength(1);
    expect(h.addAgentCalls[0]).toMatchObject({
      role: 'Backend Architect',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      connection_type: 'anthropic',
      system_prompt: items[0].system_prompt,
      availability_status: 'available',
    });
    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it('seeds one full deterministic profile per created agent', async () => {
    const items = [makeItem(), makeItem({ _id: 'x2', role: 'Frontend Developer', name: 'Frontend Developer' })];
    const promise = materializeImportedAgents(items, {});
    await vi.runAllTimersAsync();
    await promise;

    expect(h.seedProfilesCalls).toHaveLength(1);
    expect(h.seedProfilesCalls[0]).toHaveLength(2);
    const profile = h.seedProfilesCalls[0][0];
    expect(profile).toMatchObject({
      role: 'Backend Architect',
      job_title: 'Backend Architect',
      display_name: 'Backend Architect',
      organization: 'Orqaly Inc.',
      email: 'backend.architect@orchestratori.fake',
    });
    // The full profile now carries the fields the old thin seed omitted.
    expect(profile.communication_tone).toMatchObject({ style: 'professional' });
    expect(profile.message_templates).toHaveLength(2);
    expect(profile.behavior_rules).toBeTruthy();
    expect(profile.email_signature).toContain('backend.architect@orchestratori.fake');
  });

  it('does not generate photos by default, and generates one per created agent when enabled', async () => {
    const items = [makeItem()];

    const noPhotos = materializeImportedAgents(items, {});
    await vi.runAllTimersAsync();
    const resultNoPhotos = await noPhotos;
    expect(h.generateAvatarCalls).toHaveLength(0);
    expect(resultNoPhotos.photosGenerated).toBe(0);

    const withPhotos = materializeImportedAgents(items, { generatePhotos: true });
    await vi.runAllTimersAsync();
    const resultWithPhotos = await withPhotos;
    expect(h.generateAvatarCalls).toHaveLength(1);
    expect(resultWithPhotos.photosGenerated).toBe(1);
    expect(resultWithPhotos.photoFailures).toBe(0);
  });

  it('counts a failed photo generation without aborting the batch', async () => {
    h.generateAvatarShouldFail = () => true;
    const items = [makeItem()];

    const promise = materializeImportedAgents(items, { generatePhotos: true });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.createdCount).toBe(1);
    expect(result.photoFailures).toBe(1);
    expect(result.photosGenerated).toBe(0);
  });

  it('passes GitHub provenance (imported_from) through to addAgent', async () => {
    const item = makeItem({
      _source: 'github',
      _url: 'https://github.com/msitarzewski/agency-agents',
      _sourceName: 'msitarzewski/agency-agents',
      _path: 'engineering/backend-architect.md',
    });
    const promise = materializeImportedAgents([item], {});
    await vi.runAllTimersAsync();
    await promise;

    expect(h.addAgentCalls[0].imported_from).toEqual({
      source: 'github',
      url: 'https://github.com/msitarzewski/agency-agents',
      repo: 'msitarzewski/agency-agents',
      path: 'engineering/backend-architect.md',
    });
  });

  it('derives repo from _sourceId, and sets null provenance when the item has no source', async () => {
    const withId = makeItem({
      _source: 'github',
      _sourceId: 'github:owner/repo',
      _url: 'https://github.com/owner/repo',
    });
    const noSource = makeItem({ _id: 'plain', role: 'Plain Agent', name: 'Plain Agent' });
    const promise = materializeImportedAgents([withId, noSource], {});
    await vi.runAllTimersAsync();
    await promise;

    expect(h.addAgentCalls[0].imported_from).toMatchObject({ source: 'github', repo: 'owner/repo' });
    expect(h.addAgentCalls[1].imported_from).toBeNull();
  });

  it('registers each created persona in the Knowledge Base', async () => {
    const promise = materializeImportedAgents([makeItem()], {});
    await vi.runAllTimersAsync();
    await promise;

    expect(h.registerAgentsInKbCalls).toHaveLength(1);
    expect(h.registerAgentsInKbCalls[0][0]).toMatchObject({
      role: 'Backend Architect',
      title: 'Backend Architect',
    });
    expect(h.registerAgentsInKbCalls[0][0].content).toContain('Backend Architect');
  });
});
