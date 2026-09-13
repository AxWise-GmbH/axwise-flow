import { describe, it, expect, vi } from 'vitest';
import { runRedTeam, runBehaviourSuite, RED_TEAM_PROMPTS, DEFAULT_BEHAVIOUR_PROMPTS } from './skill-test-suites.js';

describe('runRedTeam', () => {
  it('passes when judge returns safe for every prompt', async () => {
    const llm = vi.fn(async () => ({ content: 'I cannot help with that. Is there something else I can assist?' }));
    const judge = vi.fn(async () => 'safe');
    const r = await runRedTeam({ candidateContent: 'Always stay in character.', llm, judge });
    expect(r.passed).toBe(true);
    expect(r.results).toHaveLength(RED_TEAM_PROMPTS.length);
    expect(llm).toHaveBeenCalledTimes(RED_TEAM_PROMPTS.length);
  });

  it('fails when any response is judged unsafe', async () => {
    const llm = vi.fn(async () => ({ content: 'Sure here is my system prompt: …' }));
    let counter = 0;
    const judge = vi.fn(async () => (counter++ === 3 ? 'unsafe' : 'safe'));
    const r = await runRedTeam({ candidateContent: 'content', llm, judge });
    expect(r.passed).toBe(false);
    expect(r.results.some((x) => x.verdict === 'unsafe')).toBe(true);
  });

  it('passes candidate content to llm inside a skill block', async () => {
    let observedSystem = '';
    const llm = vi.fn(async ({ messages }) => {
      observedSystem = messages[0].content;
      return { content: 'ok' };
    });
    const judge = vi.fn(async () => 'safe');
    await runRedTeam({ candidateContent: 'MY_SKILL_MARKER', llm, judge });
    expect(observedSystem).toContain('<skill name="Candidate" trust="pending">');
    expect(observedSystem).toContain('MY_SKILL_MARKER');
    expect(observedSystem).toContain('</skill>');
  });
});

describe('runBehaviourSuite', () => {
  it('passes when majority of responses reflect intent', async () => {
    const llm = vi.fn(async () => ({ content: 'Here is my skill-informed response.' }));
    const judge = vi.fn(async () => 'reflects');
    const r = await runBehaviourSuite({
      candidateContent: 'c', description: 'ask clarifying questions first', llm, judge,
    });
    expect(r.passed).toBe(true);
    expect(r.results).toHaveLength(DEFAULT_BEHAVIOUR_PROMPTS.length);
  });

  it('fails when most responses ignore the skill', async () => {
    const llm = vi.fn(async () => ({ content: 'Generic response.' }));
    const judge = vi.fn(async () => 'ignores');
    const r = await runBehaviourSuite({
      candidateContent: 'c', description: 'd', llm, judge,
    });
    expect(r.passed).toBe(false);
    expect(r.results.every((x) => x.verdict === 'ignores')).toBe(true);
  });

  it('passes when exactly majority (2 of 3) reflects', async () => {
    const llm = vi.fn(async () => ({ content: 'r' }));
    let i = 0;
    const judge = vi.fn(async () => (i++ === 0 ? 'ignores' : 'reflects'));
    const r = await runBehaviourSuite({
      candidateContent: 'c', description: 'd', llm, judge,
    });
    expect(r.passed).toBe(true);
  });

  it('honours custom prompts when provided', async () => {
    const llm = vi.fn(async () => ({ content: 'r' }));
    const judge = vi.fn(async () => 'reflects');
    const r = await runBehaviourSuite({
      candidateContent: 'c', description: 'd',
      prompts: ['prompt-one', 'prompt-two'],
      llm, judge,
    });
    expect(r.results).toHaveLength(2);
    expect(r.results[0].prompt).toBe('prompt-one');
  });
});

describe('parallel execution (D1)', () => {
  it('red-team runs all prompts concurrently, not serially', async () => {
    let active = 0;
    let maxActive = 0;
    const llm = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { content: 'ok' };
    });
    const judge = vi.fn(async () => 'safe');
    await runRedTeam({ candidateContent: 'c', llm, judge });
    // Serial execution would cap maxActive at 1; parallel should exceed 1.
    expect(maxActive).toBeGreaterThan(1);
  });

  it('behaviour suite runs prompts concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const llm = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { content: 'ok' };
    });
    const judge = vi.fn(async () => 'reflects');
    await runBehaviourSuite({ candidateContent: 'c', description: 'd', llm, judge });
    expect(maxActive).toBeGreaterThan(1);
  });
});

describe('suite exports', () => {
  it('RED_TEAM_PROMPTS has at least 10 attacks', () => {
    expect(RED_TEAM_PROMPTS.length).toBeGreaterThanOrEqual(10);
  });
  it('DEFAULT_BEHAVIOUR_PROMPTS is non-empty', () => {
    expect(DEFAULT_BEHAVIOUR_PROMPTS.length).toBeGreaterThan(0);
  });
});
