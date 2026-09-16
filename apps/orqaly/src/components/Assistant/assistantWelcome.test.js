import { describe, it, expect } from 'vitest';
import { buildAssistantWelcome } from './assistantWelcome.js';

describe('buildAssistantWelcome', () => {
  it('greets by name', () => {
    expect(buildAssistantWelcome({ assistant: { name: 'Sales Bot' } }).title).toBe(
      "Hi, I'm Sales Bot."
    );
  });

  it('falls back to a name when the assistant has none', () => {
    expect(buildAssistantWelcome({ assistant: { name: '   ' } }).title).toBe(
      "Hi, I'm My Assistant."
    );
    expect(buildAssistantWelcome({}).title).toBe("Hi, I'm My Assistant.");
  });

  it('names the organization it belongs to when one resolved', () => {
    const { lines } = buildAssistantWelcome({
      assistant: { name: 'Nova' },
      orgName: 'Acme Trading',
    });
    expect(lines[0]).toBe("I'm the assistant for Acme Trading.");
  });

  it('says something either way when the organization is unknown', () => {
    expect(buildAssistantWelcome({ assistant: { name: 'Nova' } }).lines[0]).toBe(
      "I'm your assistant here."
    );
    expect(buildAssistantWelcome({ assistant: { name: 'Nova' }, orgName: '  ' }).lines[0]).toBe(
      "I'm your assistant here."
    );
  });

  it('promises to do its best once it is ready', () => {
    const { lines } = buildAssistantWelcome({ assistant: { name: 'Nova', activated: true } });
    expect(lines[2]).toContain("I'll do my best for you");
    expect(lines[2]).not.toContain('Core');
  });

  it('asks for its Core when it is not ready yet', () => {
    const { lines } = buildAssistantWelcome({ assistant: { name: 'Nova', activated: false } });
    expect(lines[2]).toContain('Core');
    expect(lines[2]).toContain("I'll do my best for you");
  });

  it('says what it runs on', () => {
    const { footnote } = buildAssistantWelcome({
      assistant: { name: 'Nova', config: { provider: 'anthropic', model: 'claude-sonnet-5' } },
    });
    expect(footnote).toBe('Anthropic · Claude Sonnet 5');
  });

  it('shows no chip when no model has been chosen', () => {
    expect(buildAssistantWelcome({ assistant: { name: 'Nova' } }).footnote).toBeNull();
    expect(
      buildAssistantWelcome({ assistant: { name: 'Nova', config: { provider: 'openai' } } })
        .footnote
    ).toBeNull();
  });

  it('survives a bare row', () => {
    const welcome = buildAssistantWelcome({ assistant: {} });
    expect(welcome.lines).toHaveLength(3);
    expect(welcome.lines.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
  });
});
