import { describe, it, expect } from 'vitest';
import { selectEndpointsByPreset, groupByCategory } from '../preset-selector.js';

const composioEndpoints = [
  { id: 'GITHUB_LIST_REPOS', verb: 'read', popular: true, category: 'Repos' },
  { id: 'GITHUB_GET_ISSUE', verb: 'read', popular: false, category: 'Issues' },
  { id: 'GITHUB_CREATE_ISSUE', verb: 'write', popular: true, category: 'Issues' },
  { id: 'GITHUB_DELETE_REPO', verb: 'write', popular: false, category: 'Repos' },
];

describe('selectEndpointsByPreset', () => {
  it('full returns every endpoint', () => {
    expect(selectEndpointsByPreset(composioEndpoints, 'full', 'composio')).toHaveLength(4);
  });

  it('basic composio: popular OR read-only, unique', () => {
    const ids = selectEndpointsByPreset(composioEndpoints, 'basic', 'composio');
    expect(ids).toEqual(expect.arrayContaining(['GITHUB_LIST_REPOS', 'GITHUB_GET_ISSUE', 'GITHUB_CREATE_ISSUE']));
    expect(ids).not.toContain('GITHUB_DELETE_REPO');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('custom honours the explicit selection and filters unknown ids', () => {
    const ids = selectEndpointsByPreset(
      composioEndpoints,
      'custom',
      'composio',
      ['GITHUB_LIST_REPOS', 'NOT_A_REAL_ID'],
    );
    expect(ids).toEqual(['GITHUB_LIST_REPOS']);
  });

  it('basic api: GET with <=1 path param', () => {
    const apiEndpoints = [
      { id: 'a', method: 'GET', path: '/users' },
      { id: 'b', method: 'GET', path: '/users/{id}' },
      { id: 'c', method: 'GET', path: '/repos/{owner}/{repo}' },
      { id: 'd', method: 'POST', path: '/users' },
    ];
    expect(selectEndpointsByPreset(apiEndpoints, 'basic', 'api')).toEqual(['a', 'b']);
  });

  it('basic mcp: skips admin/delete prefixes, caps at 8', () => {
    const mcp = [
      { id: 'admin_reset' },
      { id: 'list_files' },
      { id: 'delete_file' },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `read_${i}` })),
    ];
    const ids = selectEndpointsByPreset(mcp, 'basic', 'mcp');
    expect(ids).not.toContain('admin_reset');
    expect(ids).not.toContain('delete_file');
    expect(ids).toHaveLength(8);
  });

  it('basic falls back to the first endpoint if the rule yields nothing', () => {
    const endpoints = [{ id: 'only', verb: 'write', popular: false, category: 'X' }];
    expect(selectEndpointsByPreset(endpoints, 'basic', 'composio')).toEqual(['only']);
  });
});

describe('groupByCategory', () => {
  it('groups endpoints by category and sorts categories alphabetically', () => {
    const groups = groupByCategory(composioEndpoints);
    expect(groups.map((g) => g.category)).toEqual(['Issues', 'Repos']);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(2);
  });

  it('falls back to General for endpoints with no category', () => {
    const groups = groupByCategory([{ id: 'a' }, { id: 'b', category: 'X' }]);
    const general = groups.find((g) => g.category === 'General');
    expect(general).toBeDefined();
    expect(general.items).toHaveLength(1);
  });
});
