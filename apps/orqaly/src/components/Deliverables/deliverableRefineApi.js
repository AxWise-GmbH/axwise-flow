/**
 * Thin wrapper around /api/app?path=deliverable-refine for the "Improve
 * quality" flow. Mirrors the same shape as designCommentsApi.js so the
 * VersionPicker component never needs to know about URL plumbing or auth.
 */
import { supabase } from '../../lib/supabase';

async function callDeliverableRefine({ op, method = 'GET', kind, parentId, body }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const params = new URLSearchParams({ path: 'deliverable-refine', op });
  if (kind) params.set('kind', kind);
  if (parentId) params.set('parent_id', parentId);

  const res = await fetch(`/api/app?${params}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error || `Deliverable refine API error ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export function listRefinements(kind, parentId) {
  return callDeliverableRefine({ op: 'list', kind, parentId });
}

export function startRefinement({ kind, parentId, prompt }) {
  return callDeliverableRefine({
    op: 'start',
    method: 'POST',
    body: { kind, parent_id: parentId, prompt },
  });
}
