/**
 * [module: frontend]
 * Goal Unit Service — CRUD for business units (departments) and goal grouping.
 */
import { supabase } from '../lib/supabase';

function getBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return import.meta.env.VITE_API_BASE || '';
  }
  return '';
}

async function apiFetch(path, opts = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${getBase()}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function adoptBusiness(goalId, { orgName, orgType, industry, description }) {
  return apiFetch('/api/app?path=goals&op=adopt-business', {
    method: 'POST',
    body: JSON.stringify({ goalId, orgName, orgType, industry, description }),
  });
}

export async function implementExisting(
  goalId,
  { orgId, unitId, unitName, orgName, orgType, industry, description, context } = {}
) {
  return apiFetch('/api/app?path=goals&op=implement-existing', {
    method: 'POST',
    body: JSON.stringify({
      goalId,
      orgId,
      unitId,
      unitName,
      orgName,
      orgType,
      industry,
      description,
      context,
    }),
  });
}

export async function replaceUnit(goalId, unitId, mode, replaceGoalId) {
  return apiFetch('/api/app?path=goals&op=replace-unit', {
    method: 'POST',
    body: JSON.stringify({ goalId, unitId, mode, replaceGoalId }),
  });
}

export async function createUnit({ name, unitType, orgId, goalIds }) {
  return apiFetch('/api/app?path=goals&op=create-unit', {
    method: 'POST',
    body: JSON.stringify({ name, unitType, orgId, goalIds }),
  });
}

export async function listUnits(orgId) {
  const qs = orgId ? `&org_id=${encodeURIComponent(orgId)}` : '';
  return apiFetch(`/api/app?path=goals&op=list-units${qs}`);
}

export async function updateUnit(unitId, updates) {
  return apiFetch('/api/app?path=goals&op=update-unit', {
    method: 'POST',
    body: JSON.stringify({ unitId, ...updates }),
  });
}

export async function duplicateGoal(goalId) {
  return apiFetch('/api/app?path=goals&op=duplicate', {
    method: 'POST',
    body: JSON.stringify({ goalId }),
  });
}
