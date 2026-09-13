import { describe, it, expect } from 'vitest';
import { buildAgentProfile, slugify } from './agentProfileBuilder';

describe('slugify', () => {
  it('folds accents and collapses separators', () => {
    expect(slugify('Renée Duböis')).toBe('renee-dubois');
    expect(slugify('Renée Duböis', '.')).toBe('renee.dubois');
    expect(slugify('  DevOps  Automator! ')).toBe('devops-automator');
  });
});

describe('buildAgentProfile', () => {
  it('builds a complete profile with derived contact + sensible defaults', () => {
    const p = buildAgentProfile({
      name: 'DevOps Automator',
      role: 'DevOps Automator',
      description: 'Automates CI/CD and infra.',
      _persona: { color: '#3B82F6', emoji: '🤖' },
    });
    expect(p).toMatchObject({
      display_name: 'DevOps Automator',
      role: 'DevOps Automator',
      job_title: 'DevOps Automator',
      organization: 'Orqaly Inc.',
      pronouns: 'they/them',
      email: 'devops.automator@orchestratori.fake',
      linkedin_url: 'linkedin.com/in/devops-automator',
      bio: 'Automates CI/CD and infra.',
    });
    expect(p.email_signature).toContain('DevOps Automator | DevOps Automator');
    expect(p.email_signature).toContain('devops.automator@orchestratori.fake');
    expect(p.communication_tone).toMatchObject({ style: 'professional', emoji_usage: 'never' });
    expect(p.message_templates).toHaveLength(2);
    expect(p.behavior_rules.topics_to_avoid).toContain('politics');
    expect(p.metadata).toEqual({ color: '#3B82F6', emoji: '🤖' });
  });

  it('templates a bio when there is no description, and leaves metadata empty without a persona', () => {
    const p = buildAgentProfile({ name: 'Solo Agent', role: 'Researcher' });
    expect(p.bio).toContain('Solo Agent');
    expect(p.bio.toLowerCase()).toContain('researcher');
    expect(p.metadata).toEqual({});
  });

  it('outputs only real columns (no agentName match-key leaks in)', () => {
    const p = buildAgentProfile({ role: 'X' });
    expect('agentName' in p).toBe(false);
    expect(p.display_name).toBe('X');
    expect(p.email).toBe('x@orchestratori.fake');
  });
});
