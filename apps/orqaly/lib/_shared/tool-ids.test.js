import { describe, expect, it } from 'vitest';
import { isCanonicalToolId, isKnownToolId, normalizeToolId, normalizeToolIds } from './tool-ids.js';

describe('canonical tool ids', () => {
  it('preserves MCP and platform identifiers across integration boundaries', () => {
    expect(normalizeToolId('mcp-github')).toBe('mcp-github');
    expect(normalizeToolId('tool-web-search')).toBe('tool-web-search');
  });

  it('resolves known shorthand consistently and keeps unknown requirements visible', () => {
    expect(normalizeToolId('web-search')).toBe('tool-web-search');
    expect(normalizeToolId('discord')).toBe('mcp-discord');
    expect(normalizeToolId('private-system')).toBe('tool-private-system');
  });

  it('normalizes and deduplicates lists', () => {
    expect(normalizeToolIds(['github', 'tool-github', 'mcp-github', '', null])).toEqual([
      'tool-github',
      'mcp-github',
    ]);
    expect(isCanonicalToolId('mcp-github')).toBe(true);
    expect(isCanonicalToolId('github')).toBe(false);
  });

  it('maps generic analysis authoring labels to the credential-free document tool', () => {
    expect(normalizeToolId('Document editor')).toBe('tool-doc-generator');
    expect(normalizeToolId('Markdown Editor')).toBe('tool-doc-generator');
    expect(normalizeToolId('Review Checklist')).toBe('tool-doc-generator');
    expect(normalizeToolId('Spreadsheet')).toBe('tool-doc-generator');
    expect(normalizeToolId('Spreadsheet software')).toBe('tool-doc-generator');
    expect(normalizeToolId('Spreadsheet software / Python')).toBe('tool-doc-generator');
    expect(
      normalizeToolIds(['Document editor', 'Spreadsheet software', 'Spreadsheet software / Python'])
    ).toEqual(['tool-doc-generator']);
  });

  it('absorbs observed planner-only diagram and checklist labels without inventing tools', () => {
    expect(
      normalizeToolIds([
        'Mermaid.js',
        'Data Analysis Tools',
        'Documentation Platform',
        'Spreadsheet Tool',
        'Excel',
        'Google Docs',
        'Validation Checklist',
      ])
    ).toEqual(['tool-doc-generator']);
    expect(isKnownToolId('tool-doc-generator')).toBe(true);
  });

  it('resolves real connector names but leaves privileged unknowns explicit and closed', () => {
    expect(normalizeToolId('Google Sheets')).toBe('mcp-google-sheets');
    expect(normalizeToolId('Notion')).toBe('tool-notion');
    expect(normalizeToolId('Python')).toBe('tool-python');
    expect(normalizeToolId('SQL')).toBe('tool-sql');
    expect(normalizeToolId('Snowflake Warehouse')).toBe('tool-snowflake-warehouse');
    expect(normalizeToolId('tool-google-docs')).toBe('tool-google-docs');
    expect(isKnownToolId('mcp-google-sheets')).toBe(true);
    expect(isKnownToolId('tool-python')).toBe(false);
    expect(isKnownToolId('tool-sql')).toBe(false);
    expect(isKnownToolId('tool-snowflake-warehouse')).toBe(false);
    expect(isKnownToolId('tool-google-docs')).toBe(false);
  });
});
