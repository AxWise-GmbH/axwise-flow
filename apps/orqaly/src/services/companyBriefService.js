/**
 * Frontend client for /api/app?path=company-brief — the assistant's discovery
 * quiz (semantic mapping). Used by CompanyBriefCard.
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

async function post(body) {
  const res = await fetch(`${getBase()}/api/app?path=company-brief`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Company brief request failed');
  return data;
}

/**
 * Ask the server for the next adaptive question given the answers so far.
 * -> { briefId, question:{ id, text }, index, max, done }
 */
export function nextBriefQuestion({ briefId } = {}) {
  return post({ action: 'next-question', briefId });
}

/**
 * Legacy fixed-batch generator. Kept as a graceful fallback for backends that
 * don't support `next-question` yet. -> { briefId, questions:[{ id, text }] }
 */
export function generateBriefQuestions() {
  return post({ action: 'generate-questions' });
}

/** Save one answer. -> { ok } */
export function answerBriefQuestion({ briefId, questionId, question, answer }) {
  return post({ action: 'answer', briefId, questionId, question, answer });
}

/** Load the current brief + answers. -> { brief, answers } */
export async function getCompanyBrief() {
  const res = await fetch(`${getBase()}/api/app?path=company-brief`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load company brief');
  return data;
}
