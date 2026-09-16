/**
 * Goal lead chat service — talk to a goal's team lead.
 * Wraps POST /api/app?path=goal-lead-chat with Supabase bearer auth.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Send a message to the goal's team lead.
 *
 * @param {object} args
 * @param {string} args.goalId
 * @param {string} args.message
 * @param {Array<{sender:string,text:string}>} [args.history]
 * @param {'cheap'|'model'|'consilium'} [args.mode]
 * @param {string} [args.provider]  required when mode==='model'
 * @param {string} [args.model]     required when mode==='model'
 * @param {string} [args.boardId]   optional Consilium board id (mode==='consilium')
 * @returns {Promise<{reply:string, actions?:Array<{type:string,label:string,summary:string,params:object}>, mode:string, provider?:string, model?:string, council?:Array, boardName?:string}>}
 */
export async function sendLeadMessage({
  goalId,
  message,
  history,
  mode = 'cheap',
  provider,
  model,
  boardId,
}) {
  const res = await fetch(`${getBase()}/api/app?path=goal-lead-chat`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ goalId, message, history, mode, provider, model, boardId }),
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    /* non-JSON proxy/error page */
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}
