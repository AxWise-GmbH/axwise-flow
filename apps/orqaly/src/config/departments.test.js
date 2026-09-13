import { describe, it, expect } from 'vitest';
import { PREDEFINED_AGENTS } from './predefinedAgents';
import {
  DEPARTMENTS,
  DEPARTMENT_IDS,
  DEPARTMENT_BY_ID,
  STAKES,
  departmentForRole,
  departmentLabel,
  resolveDepartment,
} from './departments';

const allMappedRoles = DEPARTMENTS.flatMap((d) => d.roles);
const agentRoles = [...new Set(PREDEFINED_AGENTS.map((a) => a.role).filter(Boolean))];

describe('DEPARTMENTS', () => {
  it('covers the six departments the business runs', () => {
    expect(DEPARTMENT_IDS).toEqual([
      'marketing',
      'developing',
      'legal',
      'management',
      'operations',
      'accountants',
    ]);
  });

  it('only names roles that real predefined agents actually have', () => {
    const unknown = allMappedRoles.filter((r) => !agentRoles.includes(r));
    expect(unknown).toEqual([]);
  });

  it('leaves no predefined agent role without a department', () => {
    const orphans = agentRoles.filter((r) => !departmentForRole(r));
    expect(orphans).toEqual([]);
  });

  it('never files one role under two departments', () => {
    const seen = new Set();
    const duplicates = allMappedRoles.filter((r) => (seen.has(r) ? true : (seen.add(r), false)));
    expect(duplicates).toEqual([]);
  });

  it('gives every department a label and a description', () => {
    for (const d of DEPARTMENTS) {
      expect(d.label).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.roles.length).toBeGreaterThan(0);
    }
  });
});

describe('departmentForRole', () => {
  it('resolves a role to its department', () => {
    expect(departmentForRole('SMM Manager')).toBe('marketing');
    expect(departmentForRole('Lawyer')).toBe('legal');
    expect(departmentForRole('Accountant')).toBe('accountants');
    expect(departmentForRole('Frontend Developer')).toBe('developing');
  });

  it('ignores casing and surrounding whitespace', () => {
    expect(departmentForRole('  lawyer  ')).toBe('legal');
    expect(departmentForRole('SMM MANAGER')).toBe('marketing');
  });

  it('returns null rather than guessing for an unknown or empty role', () => {
    expect(departmentForRole('Chief Vibes Officer')).toBeNull();
    expect(departmentForRole('')).toBeNull();
    expect(departmentForRole(null)).toBeNull();
    expect(departmentForRole(undefined)).toBeNull();
  });
});

describe('resolveDepartment', () => {
  it('prefers an explicit category that already names a department', () => {
    expect(resolveDepartment({ category: 'legal', role: 'SMM Manager' })).toBe('legal');
    expect(resolveDepartment({ category: 'Legal' })).toBe('legal');
  });

  it('falls back to the role when the category is not a department', () => {
    expect(resolveDepartment({ category: 'bugfix', role: 'QA Tester' })).toBe('developing');
    expect(resolveDepartment({ role: 'CFO' })).toBe('accountants');
  });

  it('returns null when neither resolves, instead of picking a department', () => {
    expect(resolveDepartment({ category: 'misc', role: 'Chief Vibes Officer' })).toBeNull();
    expect(resolveDepartment({})).toBeNull();
    expect(resolveDepartment()).toBeNull();
  });
});

describe('departmentLabel', () => {
  it('labels a known department', () => {
    expect(departmentLabel('accountants')).toBe('Accountants');
  });

  it('falls back to the id, then to Unassigned', () => {
    expect(departmentLabel('unknown-dept')).toBe('unknown-dept');
    expect(departmentLabel(null)).toBe('Unassigned');
  });
});

describe('STAKES', () => {
  it('offers exactly the three levels the decision logic understands', () => {
    expect(STAKES).toEqual(['low', 'medium', 'high']);
  });

  it('exposes every department by id', () => {
    expect(Object.keys(DEPARTMENT_BY_ID).sort()).toEqual([...DEPARTMENT_IDS].sort());
  });
});
