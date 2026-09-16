/**
 * Unit tests for the pure helpers in import-github-agents.mjs.
 * The admin client is mocked so importing the module never needs env or network.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./_lib/admin-client.mjs', () => ({
  admin: { from: vi.fn(), auth: { admin: { listUsers: vi.fn() } } },
  SUPABASE_URL: 'https://example.supabase.co',
}));

import {
  parseArgs,
  parseFrontMatter,
  mapAgentFile,
  dedupe,
  buildAgentRow,
  parseRepoUrl,
  buildInventory,
} from './import-github-agents.mjs';

const AGENT_MD = `---
name: Frontend Developer
description: Expert frontend developer specializing in modern web technologies.
color: cyan
emoji: 🖥️
---

# Frontend Developer Agent

You are a Frontend Developer who builds accessible, performant UIs.
`;

describe('parseArgs', () => {
  it('parses --key=value and bare flags', () => {
    expect(parseArgs(['--email=a@b.com', '--dry-run', '--limit=5'])).toEqual({
      email: 'a@b.com',
      'dry-run': true,
      limit: '5',
    });
  });

  it('parses --skip-screen', () => {
    expect(parseArgs(['--skip-screen'])['skip-screen']).toBe(true);
    expect(parseArgs(['--email=a@b.com'])['skip-screen']).toBeUndefined();
  });
});

describe('parseFrontMatter', () => {
  it('splits front matter from the body', () => {
    const { data, body } = parseFrontMatter(AGENT_MD);
    expect(data.name).toBe('Frontend Developer');
    expect(data.color).toBe('cyan');
    expect(body).toContain('You are a Frontend Developer');
    expect(body).not.toContain('color: cyan');
  });

  it('returns null data when there is no front matter', () => {
    expect(parseFrontMatter('# Just a readme\n\nNothing here.').data).toBeNull();
  });

  it('returns null data when the yaml is malformed', () => {
    expect(parseFrontMatter('---\nname: [unclosed\n---\n\nBody text here.').data).toBeNull();
  });
});

describe('mapAgentFile', () => {
  const entry = { path: 'engineering/engineering-frontend-developer.md', category: 'Engineering' };

  it('maps a front-matter agent, using the front-matter name as the role', () => {
    const item = mapAgentFile(entry, AGENT_MD, 'https://github.com/o/r');
    expect(item.role).toBe('Frontend Developer');
    expect(item.category).toBe('Engineering');
    expect(item.system_prompt).toContain('accessible, performant UIs');
    expect(item._path).toBe(entry.path);
  });

  it('ignores a Claude Code style tools: key — those are not Orqaly tool ids', () => {
    const md = AGENT_MD.replace('color: cyan', 'tools: WebFetch, Read, Write, Bash');
    const item = mapAgentFile(entry, md, 'https://github.com/o/r');
    expect(item).not.toHaveProperty('tools');
  });

  it('reads capabilities from capabilities or tags', () => {
    const md = AGENT_MD.replace('color: cyan', 'tags:\n  - react\n  - a11y');
    expect(mapAgentFile(entry, md, 'u').capabilities).toEqual(['react', 'a11y']);
  });

  it('returns null without front matter, without a name, or with a body under 10 chars', () => {
    expect(mapAgentFile(entry, '# readme', 'u')).toBeNull();
    expect(mapAgentFile(entry, '---\ncolor: cyan\n---\n\nA real body goes here.', 'u')).toBeNull();
    expect(mapAgentFile(entry, '---\nname: X\n---\n\nshort', 'u')).toBeNull();
  });
});

describe('dedupe', () => {
  const mk = (role) => ({ role });

  it('skips roles already on the account', () => {
    const { fresh, skippedExisting } = dedupe([mk('CTO'), mk('Frontend Developer')], new Set(['CTO']));
    expect(fresh.map((i) => i.role)).toEqual(['Frontend Developer']);
    expect(skippedExisting.map((i) => i.role)).toEqual(['CTO']);
  });

  it('skips a role repeated within the batch, keeping the first', () => {
    const { fresh, skippedDuplicate } = dedupe([mk('QA'), mk('QA')], new Set());
    expect(fresh).toHaveLength(1);
    expect(skippedDuplicate).toHaveLength(1);
  });
});

describe('buildAgentRow', () => {
  const item = {
    role: 'Frontend Developer',
    description: 'Builds UIs.',
    category: 'Engineering',
    capabilities: ['react'],
    system_prompt: 'You are a Frontend Developer.',
    _path: 'engineering/frontend.md',
    _url: 'https://github.com/o/r',
  };
  const row = buildAgentRow(item, 'user-1', 'o/r');

  it('puts the role in name and the prompt in metadata.system_prompt', () => {
    expect(row.name).toBe('Frontend Developer');
    expect(row.metadata.system_prompt).toBe('You are a Frontend Developer.');
    expect(row.metadata.friendly_name).toBeNull();
  });

  it('scopes to the user and lands active so team-assigner can select it', () => {
    expect(row.user_id).toBe('user-1');
    expect(row.status).toBe('active');
  });

  it('leaves metadata.tools empty — the repo declares no Orqaly tool ids', () => {
    expect(row.metadata.tools).toEqual([]);
  });

  it('records provenance for the origin badge', () => {
    expect(row.metadata.imported_from).toEqual({
      source: 'github',
      url: 'https://github.com/o/r',
      repo: 'o/r',
      path: 'engineering/frontend.md',
    });
  });
});

describe('parseRepoUrl', () => {
  it('extracts owner and repo, tolerating .git and trailing paths', () => {
    expect(parseRepoUrl('https://github.com/msitarzewski/agency-agents')).toEqual({
      owner: 'msitarzewski',
      repo: 'agency-agents',
    });
    expect(parseRepoUrl('https://github.com/o/r.git')).toEqual({ owner: 'o', repo: 'r' });
    expect(parseRepoUrl('https://github.com/o/r/tree/main/engineering')).toEqual({ owner: 'o', repo: 'r' });
  });

  it('rejects a non-GitHub url', () => {
    expect(() => parseRepoUrl('https://gitlab.com/o/r')).toThrow(/Not a GitHub repo URL/);
  });
});

describe('buildInventory', () => {
  const divisions = { engineering: { label: 'Engineering' }, design: { label: 'Design' } };
  const tree = [
    { type: 'blob', path: 'engineering/frontend.md' },
    { type: 'blob', path: 'design/ux.md' },
    { type: 'blob', path: 'README.md' }, // root doc, no division
    { type: 'blob', path: 'strategy/playbook.md' }, // not a division
    { type: 'blob', path: 'engineering/notes.txt' }, // not markdown
    { type: 'tree', path: 'engineering' },
  ];

  it('keeps only .md under a division key and labels the category', () => {
    expect(buildInventory(tree, divisions)).toEqual([
      { path: 'engineering/frontend.md', category: 'Engineering' },
      { path: 'design/ux.md', category: 'Design' },
    ]);
  });
});
