/**
 * Thin wrapper around /api/app?path=design-comments for the DesignReview UI.
 *
 * Mirrors the pattern PageBuilder.jsx already uses for landing-pages, so
 * components don't need to know about the URL/auth plumbing. Keeps the
 * frontend free of any direct knowledge of api/ implementation details.
 */
import { supabase } from '../../lib/supabase';

async function callDesignComments({ op, method = 'GET', id, goalId, body }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const params = new URLSearchParams({ path: 'design-comments', op });
  if (id) params.set('id', id);
  if (goalId) params.set('goalId', goalId);
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
    throw new Error(err.error || `Design comments API error ${res.status}`);
  }
  return res.json();
}

export function listComments(goalId) {
  return callDesignComments({ op: 'list', goalId });
}

export function createComment({
  goalId,
  elementSelector,
  elementText,
  commentText,
  deploymentUrl,
}) {
  return callDesignComments({
    op: 'create',
    method: 'POST',
    body: { goalId, elementSelector, elementText, commentText, deploymentUrl },
  });
}

export function updateComment({ id, status, commentText }) {
  return callDesignComments({
    op: 'update',
    method: 'PATCH',
    id,
    body: { status, commentText },
  });
}

export function deleteComment(id) {
  return callDesignComments({ op: 'delete', method: 'DELETE', id });
}

export function applyComments(goalId) {
  return callDesignComments({ op: 'apply', method: 'POST', goalId });
}
