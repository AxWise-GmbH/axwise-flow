import { describe, it, expect } from 'vitest';
import { getMcpAppById } from '../../../config/mcpToolCatalog';
import { DEPARTMENT_IDS } from '../../../config/departments';
import { QUIZ, questionsForDepartments, customKey, buildStackRows } from './stackQuiz';

describe('QUIZ', () => {
  it('only offers tools the catalog can actually connect', () => {
    const broken = QUIZ.flatMap((q) => q.options)
      .filter((o) => !getMcpAppById(o.catalogId))
      .map((o) => o.catalogId);
    expect(broken).toEqual([]);
  });

  it('only names departments that exist', () => {
    const unknown = QUIZ.flatMap((q) => q.departments).filter((d) => !DEPARTMENT_IDS.includes(d));
    expect(unknown).toEqual([]);
  });

  it('asks every question in plain language, without jargon', () => {
    const jargon = /\b(API|OAuth|token|endpoint|webhook|SDK)\b/i;
    for (const q of QUIZ) expect(q.question).not.toMatch(jargon);
  });

  it('gives every question at least two choices', () => {
    for (const q of QUIZ) expect(q.options.length).toBeGreaterThanOrEqual(2);
  });
});

describe('questionsForDepartments', () => {
  it('shows only questions relevant to the enabled departments', () => {
    const legalOnly = questionsForDepartments(['legal']);
    expect(legalOnly.every((q) => q.departments.includes('legal'))).toBe(true);
    expect(legalOnly.length).toBeGreaterThan(0);
    expect(legalOnly.length).toBeLessThan(QUIZ.length);
  });

  it('falls back to everything when nothing is enabled yet', () => {
    expect(questionsForDepartments([])).toEqual(QUIZ);
  });

  it('falls back to everything for a company running only its own departments', () => {
    expect(questionsForDepartments(['custom:growth-pod'])).toEqual(QUIZ);
  });
});

describe('customKey', () => {
  it('slugs a free-text tool name', () => {
    expect(customKey('Monday.com')).toBe('custom:monday-com');
    expect(customKey('  Our In-House CRM!  ')).toBe('custom:our-in-house-crm');
  });

  it('never produces an empty key', () => {
    expect(customKey('!!!')).toBe('custom:tool');
  });
});

describe('buildStackRows', () => {
  it('builds catalog rows with the real catalog name', () => {
    const rows = buildStackRows(new Set(['mcp-jira']));
    expect(rows).toEqual([{ key: 'mcp-jira', label: 'Jira', source: 'catalog', department: null }]);
  });

  it('silently drops an id the catalog cannot back', () => {
    expect(buildStackRows(new Set(['mcp-nonsense']))).toEqual([]);
  });

  it('keeps custom tools as gaps for the brief step', () => {
    const rows = buildStackRows(new Set(), [{ label: 'Monday.com', department: 'operations' }]);
    expect(rows).toEqual([
      { key: 'custom:monday-com', label: 'Monday.com', source: 'custom', department: 'operations' },
    ]);
  });

  it('ignores a blank custom entry', () => {
    expect(buildStackRows(new Set(), [{ label: '   ' }])).toEqual([]);
  });
});
