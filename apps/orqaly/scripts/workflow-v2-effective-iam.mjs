import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ADMIN_PATTERN = /^user:[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const SERVICE_ACCOUNT_PATTERN = /^serviceAccount:[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
const PLATFORM_SERVICE_ACCOUNT_PATTERN = /^serviceAccount:(?:service-[1-9][0-9]*@[a-z0-9-]+\.iam\.gserviceaccount\.com|[1-9][0-9]*@cloudservices\.gserviceaccount\.com)$/;
const PERMISSION_PATTERN = /^[a-z][a-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;
const PREDEFINED_ROLE_PATTERN = /^roles\/[A-Za-z0-9_.]+$/;

function argument(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

function required(name, argv = process.argv) {
  const value = argument(name, argv);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function splitExact(value, label) {
  const members = value.split(',');
  if (members.some((member) => !member || member.trim() !== member)) {
    throw new Error(`${label} must be a comma-separated list without whitespace or empty entries`);
  }
  if (new Set(members).size !== members.length) throw new Error(`${label} contains duplicates`);
  return members.sort();
}

export function normalizeAdminPrincipals(value) {
  const members = splitExact(value, 'PREVIEW_ALLOWED_ADMIN_PRINCIPALS');
  if (members.some((member) => !ADMIN_PATTERN.test(member))) {
    throw new Error(
      'Preview admins must be explicit user: email principals; IAM search cannot expand groups'
    );
  }
  return members.join(',');
}

function parseJsonArgument(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  return parsed;
}

function normalizePermissionRules(value) {
  const raw = typeof value === 'string' ? parseJsonArgument(value, 'permission rules') : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('permission rules must be an object');
  }
  const entries = Object.entries(raw);
  if (entries.length === 0) throw new Error('permission rules must not be empty');
  const rules = new Map();
  for (const [permission, members] of entries) {
    if (!PERMISSION_PATTERN.test(permission)) {
      throw new Error(`invalid permission rule ${permission}`);
    }
    if (!Array.isArray(members) || members.some((member) =>
      typeof member !== 'string' || !SERVICE_ACCOUNT_PATTERN.test(member)
    )) {
      throw new Error(`permission rule ${permission} must contain only service accounts`);
    }
    if (new Set(members).size !== members.length) {
      throw new Error(`permission rule ${permission} contains duplicates`);
    }
    rules.set(permission, new Set(members));
  }
  return rules;
}

function normalizeAncestorResources(value) {
  const raw = typeof value === 'string' ? parseJsonArgument(value, 'ancestor resources') : value;
  if (!Array.isArray(raw) || raw.length === 0 || raw.some((resource) =>
    typeof resource !== 'string'
    || !/^\/\/cloudresourcemanager\.googleapis\.com\/(?:projects\/[-a-z0-9]+|folders\/[1-9][0-9]*|organizations\/[1-9][0-9]*)$/.test(resource)
  )) {
    throw new Error('ancestor resources must be an exact non-empty Cloud Resource Manager list');
  }
  if (new Set(raw).size !== raw.length) throw new Error('ancestor resources contain duplicates');
  return new Set(raw);
}

function normalizeTrustedPlatformBindings(value) {
  const raw = typeof value === 'string'
    ? parseJsonArgument(value, 'trusted platform bindings')
    : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('trusted platform bindings must be an object');
  }
  const bindings = new Map();
  for (const [role, members] of Object.entries(raw)) {
    if (!PREDEFINED_ROLE_PATTERN.test(role)) {
      throw new Error(`trusted platform role ${role} is not predefined`);
    }
    if (!Array.isArray(members) || members.length === 0 || members.some((member) =>
      typeof member !== 'string' || !PLATFORM_SERVICE_ACCOUNT_PATTERN.test(member)
    )) {
      throw new Error(`trusted platform role ${role} must contain exact Google service agents`);
    }
    if (new Set(members).size !== members.length) {
      throw new Error(`trusted platform role ${role} contains duplicates`);
    }
    bindings.set(role, new Set(members));
  }
  return bindings;
}

function canonicalDirectBindings(bindings, label) {
  if (!Array.isArray(bindings)) throw new Error(`${label} bindings must be an array`);
  const canonical = bindings.map((binding, index) => {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)
      || !PREDEFINED_ROLE_PATTERN.test(binding.role)
      || !Array.isArray(binding.members) || binding.members.length === 0
      || binding.members.some((member) =>
        typeof member !== 'string' || !SERVICE_ACCOUNT_PATTERN.test(member)
      )
      || new Set(binding.members).size !== binding.members.length
      || binding.condition != null) {
      throw new Error(`${label} binding ${index} is not an exact unconditional workload binding`);
    }
    return { role: binding.role, members: [...binding.members].sort() };
  }).sort((left, right) => left.role.localeCompare(right.role));
  if (new Set(canonical.map(({ role }) => role)).size !== canonical.length) {
    throw new Error(`${label} contains duplicate roles`);
  }
  return canonical;
}

function normalizeDirectPolicies(value, ancestors) {
  const raw = typeof value === 'string' ? parseJsonArgument(value, 'direct policies') : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('direct policies must be an object');
  }
  const policies = new Map();
  for (const [resource, bindings] of Object.entries(raw)) {
    if (resource !== '//storage.googleapis.com/axwise-v2-preview-001-orqaly-v2-preview-001-artifacts') {
      throw new Error(`unsupported direct policy resource ${resource}`);
    }
    if (ancestors.has(resource)) throw new Error(`direct policy ${resource} overlaps an ancestor`);
    policies.set(resource, canonicalDirectBindings(bindings, `direct policy ${resource}`));
  }
  if (policies.size === 0) throw new Error('direct policies must not be empty');
  return policies;
}

function normalizeAuthoritativeDirectPolicies(
  value,
  ancestors,
  exactDirectPolicies,
  workloadMembersValue
) {
  const raw = typeof value === 'string'
    ? parseJsonArgument(value, 'authoritative direct policies')
    : value;
  const workloadMembers = typeof workloadMembersValue === 'string'
    ? parseJsonArgument(workloadMembersValue, 'authoritative workload members')
    : workloadMembersValue;
  if (!Array.isArray(workloadMembers) || workloadMembers.length === 0
    || workloadMembers.some((member) =>
      typeof member !== 'string' || !SERVICE_ACCOUNT_PATTERN.test(member)
    )
    || new Set(workloadMembers).size !== workloadMembers.length) {
    throw new Error('authoritative workload members must be exact unique service accounts');
  }
  const workloadMemberSet = new Set(workloadMembers);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('authoritative direct policies must be an object');
  }
  const policies = new Map();
  for (const [resource, bindings] of Object.entries(raw)) {
    const expected = exactDirectPolicies.get(resource);
    if (!expected) throw new Error(`unsupported authoritative direct policy resource ${resource}`);
    if (ancestors.has(resource)) {
      throw new Error(`authoritative direct policy ${resource} overlaps an ancestor`);
    }
    if (!Array.isArray(bindings)) {
      throw new Error(`authoritative direct policy ${resource} bindings must be an array`);
    }
    const expectedRoles = new Set(expected.map(({ role }) => role));
    const relevant = bindings.filter((binding, index) => {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)
        || typeof binding.role !== 'string'
        || !Array.isArray(binding.members) || binding.members.length === 0
        || binding.members.some((member) => typeof member !== 'string' || !member)) {
        throw new Error(
          `authoritative direct policy ${resource} binding ${index} cannot be classified safely`
        );
      }
      return expectedRoles.has(binding.role)
        || binding.members.some((member) => workloadMemberSet.has(member));
    });
    policies.set(
      resource,
      canonicalDirectBindings(relevant, `authoritative direct policy ${resource}`)
    );
  }
  if (policies.size === 0) throw new Error('authoritative direct policies must not be empty');
  return policies;
}

export function assertInheritedIamSearch(
  raw,
  {
    ancestorResources,
    directPolicies,
    authoritativeDirectPolicies,
    authoritativeWorkloadMembers,
    permissionRules,
    trustedPlatformBindings = {},
    adminMembers,
  }
) {
  if (!Array.isArray(raw)) {
    throw new Error('Cloud Asset IAM search response must be an array');
  }
  const ancestors = normalizeAncestorResources(ancestorResources);
  const exactDirectPolicies = normalizeDirectPolicies(directPolicies, ancestors);
  const authoritativePolicies = authoritativeDirectPolicies == null
    ? new Map()
    : normalizeAuthoritativeDirectPolicies(
      authoritativeDirectPolicies,
      ancestors,
      exactDirectPolicies,
      authoritativeWorkloadMembers
    );
  for (const [resource, actual] of authoritativePolicies) {
    const expected = exactDirectPolicies.get(resource);
    if (!expected || JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`authoritative direct policy ${resource} differs from the allowlist`);
    }
  }
  const missingAuthoritativePolicies = [...exactDirectPolicies.keys()]
    .filter((resource) => !authoritativePolicies.has(resource));
  if (authoritativeDirectPolicies != null && missingAuthoritativePolicies.length > 0) {
    throw new Error(
      `authoritative direct policies omitted resources: ${missingAuthoritativePolicies.join(',')}`
    );
  }
  const rules = normalizePermissionRules(permissionRules);
  const trustedBindings = normalizeTrustedPlatformBindings(trustedPlatformBindings);
  const admins = new Set(splitExact(adminMembers, 'admin members'));
  if ([...admins].some((member) => !ADMIN_PATTERN.test(member))) {
    throw new Error('inherited access may be allowed only to explicit user admins');
  }

  const effective = new Map();
  const observedDirectPolicies = new Set();
  for (const [resultIndex, result] of raw.entries()) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error(`Cloud Asset search result ${resultIndex} must be an object`);
    }
    if (exactDirectPolicies.has(result.resource)) {
      if (observedDirectPolicies.has(result.resource)) {
        throw new Error(`Cloud Asset search duplicated direct policy ${result.resource}`);
      }
      const actual = canonicalDirectBindings(
        result.policy?.bindings,
        `Cloud Asset direct policy ${result.resource}`
      );
      const expected = exactDirectPolicies.get(result.resource);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Cloud Asset direct policy ${result.resource} differs from the allowlist`);
      }
      observedDirectPolicies.add(result.resource);
      continue;
    }
    if (!ancestors.has(result.resource)) {
      throw new Error(`Cloud Asset search escaped the exact ancestor scope at ${result.resource}`);
    }
    const bindings = result.policy?.bindings;
    const matchedPermissions = result.explanation?.matchedPermissions;
    if (!Array.isArray(bindings) || !matchedPermissions || typeof matchedPermissions !== 'object'
      || Array.isArray(matchedPermissions)) {
      throw new Error(`Cloud Asset search result ${resultIndex} is missing policy explanation`);
    }
    const bindingRoles = new Set(bindings.map((binding) => binding?.role));
    const explainedRoles = new Set(Object.keys(matchedPermissions));
    if (bindingRoles.has(undefined)
      || bindingRoles.size !== explainedRoles.size
      || [...bindingRoles].some((role) => !explainedRoles.has(role))) {
      throw new Error(`Cloud Asset search result ${resultIndex} has mismatched role explanation`);
    }
    for (const [bindingIndex, binding] of bindings.entries()) {
      if (!PREDEFINED_ROLE_PATTERN.test(binding.role)) {
        throw new Error(`Cloud Asset search returned unresolved custom role ${binding.role}`);
      }
      const explained = matchedPermissions[binding.role]?.permissions;
      if (!Array.isArray(explained)
        || explained.some((permission) => typeof permission !== 'string')
        || new Set(explained).size !== explained.length) {
        throw new Error(
          `Cloud Asset search result ${resultIndex} has invalid permissions for ${binding.role}`
        );
      }
      const relevant = explained.filter((permission) => rules.has(permission));
      if (relevant.length === 0) continue;
      if (binding.condition != null) {
        throw new Error(
          `Cloud Asset search result ${resultIndex}/${bindingIndex} has an unresolved IAM condition`
        );
      }
      if (!Array.isArray(binding.members) || binding.members.length === 0
        || binding.members.some((member) => typeof member !== 'string' || !member)) {
        throw new Error(`Cloud Asset search result ${resultIndex}/${bindingIndex} has invalid members`);
      }
      for (const permission of relevant) {
        const allowed = new Set([
          ...admins,
          ...rules.get(permission),
          ...(trustedBindings.get(binding.role) || []),
        ]);
        for (const member of binding.members) {
          if (member.startsWith('group:')) {
            throw new Error(`Cloud Asset IAM search cannot prove expanded group ${member}`);
          }
          if (!allowed.has(member)) {
            throw new Error(
              `unexpected inherited principal ${member} for ${permission} via ${binding.role}`
            );
          }
          if (!effective.has(permission)) effective.set(permission, new Set());
          effective.get(permission).add(member);
        }
      }
    }
  }
  const missingDirectPolicies = [...exactDirectPolicies.keys()]
    .filter((resource) =>
      !observedDirectPolicies.has(resource) && !authoritativePolicies.has(resource)
    );
  if (missingDirectPolicies.length > 0) {
    throw new Error(`Cloud Asset search omitted direct policies: ${missingDirectPolicies.join(',')}`);
  }
  return Object.fromEntries([...effective.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([permission, members]) => [permission, [...members].sort()]));
}

function main() {
  const mode = process.argv[2];
  if (mode === 'normalize-admins') {
    process.stdout.write(`${normalizeAdminPrincipals(required('--principals'))}\n`);
    return;
  }
  if (mode === 'assert-inherited-search') {
    const raw = JSON.parse(readFileSync(0, 'utf8'));
    assertInheritedIamSearch(raw, {
      ancestorResources: required('--ancestor-resources'),
      directPolicies: required('--direct-policies'),
      authoritativeDirectPolicies: argument('--authoritative-direct-policies'),
      authoritativeWorkloadMembers: argument('--authoritative-workload-members'),
      permissionRules: required('--permission-rules'),
      trustedPlatformBindings: required('--trusted-platform-bindings'),
      adminMembers: argument('--admin-members') || '',
    });
    return;
  }
  throw new Error(
    'usage: workflow-v2-effective-iam.mjs <normalize-admins|assert-inherited-search> ...'
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
