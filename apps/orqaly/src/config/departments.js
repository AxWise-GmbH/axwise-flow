/**
 * Arena departments — the six the business actually runs.
 *
 * These are deliberately NOT `PREDEFINED_TEAMS` from predefinedAgents.js. That
 * list groups agents by how they collaborate (Founder, Development, Marketing &
 * Sales, Operations, System, Sector Specialists), which buries Legal and
 * Accountants as single roles inside Operations. A business comparing people
 * against agents thinks in departments and holds them to different bars, so
 * Arena needs its own grouping.
 *
 * Every role in PREDEFINED_AGENTS appears here exactly once, so
 * `departmentForRole` always resolves. departments.test.js enforces both halves
 * of that: no unknown role, and no role in two departments.
 */

export const DEPARTMENTS = [
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Campaigns, creative, social and the revenue side of the funnel.',
    roles: [
      'SMM Manager',
      'Creative Designer',
      'Marketing Strategist',
      'Marketing Project Manager',
      'Performance Marketing Manager',
      'Affiliate Manager',
      'Sales Manager',
      'Business Development Manager',
      'Partner Success Manager',
    ],
  },
  {
    id: 'developing',
    label: 'Developing',
    description: 'Design, build, test and ship the product.',
    roles: [
      'Frontend Developer',
      'Backend Developer',
      'Designer',
      'DevOps Engineer',
      'Software Architect',
      'Team Lead',
      'QA Tester',
      'Prompt Engineer',
      'Prompt Optimization Agent',
      'Browser Automation Lead',
      'GitHub Intelligence Researcher',
    ],
  },
  {
    id: 'legal',
    label: 'Legal',
    description: 'Contracts, compliance and everything with liability attached.',
    roles: [
      'Lawyer',
      'Risk Manager',
      'AML/KYC Officer',
      'iGaming Compliance Officer',
      'EMI Compliance Analyst',
    ],
  },
  {
    id: 'management',
    label: 'Management',
    description: 'Direction, planning and the calls nobody else can make.',
    roles: [
      'CEO/Founder',
      'CTO',
      'Managing Director',
      'Product Owner',
      'Product Manager',
      'Project Manager',
      'Roadmap Strategist',
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Support, people, supply and the day-to-day running of things.',
    roles: [
      'Customer Support Manager',
      'HR Specialist',
      'Account Creation Specialist',
      'Supply Chain Manager',
      'Ecommerce Operations Manager',
      'Customer Experience Manager',
      'Casino Operations Manager',
    ],
  },
  {
    id: 'accountants',
    label: 'Accountants',
    description: 'Books, payroll, payments and financial reporting.',
    roles: ['Accountant', 'CFO', 'Payments & Fraud Manager', 'Payments Product Manager'],
  },
];

export const DEPARTMENT_IDS = DEPARTMENTS.map((d) => d.id);

export const DEPARTMENT_BY_ID = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d]));

/** Stakes raise the bar before Arena will suggest handing a department over. */
export const STAKES = ['low', 'medium', 'high'];
export const DEFAULT_STAKES = 'medium';

// Built once at module load: role -> department id.
const ROLE_TO_DEPARTMENT = new Map(
  DEPARTMENTS.flatMap((d) => d.roles.map((role) => [role.toLowerCase(), d.id]))
);

/**
 * Which department a role belongs to.
 * @param {string} role  e.g. 'SMM Manager'
 * @returns {string|null} department id, or null when the role is unknown.
 */
export function departmentForRole(role) {
  if (!role) return null;
  return ROLE_TO_DEPARTMENT.get(String(role).trim().toLowerCase()) || null;
}

/**
 * Resolve a job's department. `team_tasks.category` wins when it already names a
 * department; otherwise fall back to the assigned role. Returns null when
 * neither resolves — those jobs show under All and nowhere else, rather than
 * being silently filed under a department they do not belong to.
 */
export function resolveDepartment({ category, role } = {}) {
  const key = String(category || '')
    .trim()
    .toLowerCase();
  if (key && DEPARTMENT_BY_ID[key]) return key;
  return departmentForRole(role);
}

/** Label for a department id, falling back to the id itself. */
export function departmentLabel(id) {
  return DEPARTMENT_BY_ID[id]?.label || id || 'Unassigned';
}

/** Companies can add their own department; its id is 'custom:<slug>'. */
export const CUSTOM_DEPARTMENT_PREFIX = 'custom:';

export function isCustomDepartment(id) {
  return typeof id === 'string' && id.startsWith(CUSTOM_DEPARTMENT_PREFIX);
}

/** 'Growth Pod' -> 'custom:growth-pod'. Never empty. */
export function customDepartmentId(label) {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${CUSTOM_DEPARTMENT_PREFIX}${slug || 'team'}`;
}

/** A department id is acceptable when built in, or custom and named. */
export function isKnownOrCustomDepartment(id, label) {
  if (DEPARTMENT_BY_ID[id]) return true;
  return isCustomDepartment(id) && String(label || '').trim().length > 0;
}
