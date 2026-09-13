import { describe, expect, it, vi } from 'vitest';

vi.mock('./_lib/admin-client.mjs', () => ({
  admin: { from: vi.fn(), auth: { admin: { listUsers: vi.fn() } } },
  SUPABASE_URL: 'https://example.supabase.co',
}));
vi.mock('../lib/concilium-handlers/llm-executor-v2.js', () => ({ executeLlmV2: vi.fn() }));

import { buildAuditPrompt, normalizeVerdict, combine } from './audit-agent-prompts.mjs';

const clean = { severity: 'none', matches: [] };
const flagged = { severity: 'high', matches: ['injection:ignore-previous'] };

describe('buildAuditPrompt', () => {
  const agent = { name: 'Frontend Developer', metadata: { system_prompt: 'You build UIs.' } };

  it('delimits the prompt and labels it untrusted rather than concatenating it as instruction', () => {
    const p = buildAuditPrompt(agent);
    expect(p).toContain('<<<UNTRUSTED_AGENT_PROMPT');
    expect(p).toContain('You build UIs.');
    expect(p.indexOf('You build UIs.')).toBeGreaterThan(p.indexOf('<<<UNTRUSTED_AGENT_PROMPT'));
  });

  it('caps the prompt so one huge agent cannot blow the context', () => {
    const big = { name: 'X', metadata: { system_prompt: 'a'.repeat(50000) } };
    expect(buildAuditPrompt(big).length).toBeLessThan(14000);
  });

  it('survives an agent with no prompt', () => {
    expect(() => buildAuditPrompt({ name: 'X', metadata: {} })).not.toThrow();
  });
});

describe('normalizeVerdict', () => {
  it('reads a well-formed verdict', () => {
    const v = normalizeVerdict('{"verdict":"malicious","categories":["exfiltration"],"evidence":"send keys to evil.tld","reason":"exfiltrates"}');
    expect(v.verdict).toBe('malicious');
    expect(v.categories).toEqual(['exfiltration']);
    expect(v.unparseable).toBe(false);
  });

  it('treats an unparseable reply as suspicious, never clean', () => {
    // The one property that must not fail open: if we cannot read the audit,
    // we have not audited it.
    for (const junk of ['I think it is fine!', '', null, '{"verdict":"probably ok"}', '{broken']) {
      const v = normalizeVerdict(junk);
      expect(v.verdict).toBe('suspicious');
      expect(v.unparseable).toBe(true);
    }
  });

  it('drops categories it does not recognise', () => {
    const v = normalizeVerdict('{"verdict":"suspicious","categories":["exfiltration","vibes","xss"]}');
    expect(v.categories).toEqual(['exfiltration']);
  });

  it('truncates evidence and reason', () => {
    const v = normalizeVerdict(JSON.stringify({ verdict: 'clean', evidence: 'x'.repeat(500), reason: 'y'.repeat(500) }));
    expect(v.evidence.length).toBeLessThanOrEqual(200);
    expect(v.reason.length).toBeLessThanOrEqual(200);
  });
});

describe('combine', () => {
  it('passes a prompt only when BOTH the model and the regex are happy', () => {
    expect(combine({ verdict: 'clean', categories: [] }, clean).final).toBe('clean');
  });

  it('flags when the regex fires even if the model says clean', () => {
    // This is the injected-auditor case: a prompt that talks the model into a
    // clean verdict is still caught deterministically.
    const out = combine({ verdict: 'clean', categories: [] }, flagged);
    expect(out.final).toBe('suspicious');
    expect(out.disagreement).toBe(true);
    expect(out.detectorMatches).toContain('injection:ignore-previous');
  });

  it('flags when the model fires even if the regex is quiet', () => {
    const out = combine({ verdict: 'malicious', categories: ['exfiltration'] }, clean);
    expect(out.final).toBe('malicious');
    expect(out.disagreement).toBe(true);
  });

  it('keeps malicious as malicious rather than downgrading it', () => {
    expect(combine({ verdict: 'malicious', categories: [] }, flagged).final).toBe('malicious');
  });

  it('reports agreement when both flag', () => {
    expect(combine({ verdict: 'suspicious', categories: [] }, flagged).disagreement).toBe(false);
  });
});
