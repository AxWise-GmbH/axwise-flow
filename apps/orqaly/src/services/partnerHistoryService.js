/**
 * Partner History — actions and events per partner.
 * Uses Supabase when configured, else localStorage.
 * When Supabase is used (production), we do not seed dummy history.
 */
import * as partnerHistoryBackend from './partnerHistoryBackend';
import { hasSupabase } from '../lib/supabase';

/** Get history entries for a partner, optionally filtered by type. */
export async function getHistory(partnerId, type = null) {
  return partnerHistoryBackend.getHistory(partnerId, type);
}

/** Add one entry. */
export async function addEntry(partnerId, entry) {
  const newEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  return partnerHistoryBackend.addEntry(partnerId, newEntry);
}

/** Tab types and labels. */
export const HISTORY_TABS = [{ id: 'all', label: 'All' }];

const SEED_ENTRIES = (partnerName) => {
  const now = new Date();
  return [
    {
      type: 'conversation',
      title: `${partnerName} started a chat on WhatsApp`,
      detail: 'Operator: Andrew Vance',
      meta: { tag: 'WhatsApp', tagColor: '#25D366' },
      createdAt: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
      relativeTime: '12 min ago',
    },
    {
      type: 'file',
      title: 'File has been uploaded',
      body: 'my-cool-file.jpg',
      detail: 'Added by: Lora Adams',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      relativeTime: '2 hours ago',
    },
    {
      type: 'interaction',
      title: 'Triggered an event',
      body: 'webinar-email-follow-up',
      bodyHighlight: true,
      detail: 'source Christmas Promotion Website · Triggered by: John Lock',
      createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      relativeTime: '1 day ago',
    },
    {
      type: 'note',
      title: 'Follow-up call scheduled',
      detail: 'Added by: Andrew Vance',
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      relativeTime: '2 days ago',
    },
    {
      type: 'reminder',
      title: 'Contract renewal due',
      detail: 'Reminder set by: Lora Adams',
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      relativeTime: '3 days ago',
    },
    {
      type: 'rating',
      title: 'Quality score updated',
      detail: 'Score: 4.5/5',
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      relativeTime: '5 days ago',
    },
  ];
};

/** Ensure partner has some seed entries (called when none exist). Skipped when using Supabase (production). */
export async function seedHistoryIfEmpty(partnerId, partnerName = 'Partner') {
  if (hasSupabase()) return;
  return partnerHistoryBackend.seedHistoryIfEmpty(
    partnerId,
    partnerName,
    SEED_ENTRIES(partnerName)
  );
}

/**
 * Log a partner data change to history.
 * @param {string} partnerId
 * @param {object} oldValues  — previous values for the changed fields
 * @param {object} newValues  — new values for the changed fields
 * @param {string} action     — e.g. 'Updated details', 'Archived', 'Created'
 */
export async function logChange(partnerId, oldValues, newValues, action = 'Updated details') {
  const changedFields = [];
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  for (const key of allKeys) {
    const oldVal = oldValues[key];
    const newVal = newValues[key];
    const oldStr = Array.isArray(oldVal) ? oldVal.join(', ') : String(oldVal ?? '');
    const newStr = Array.isArray(newVal) ? newVal.join(', ') : String(newVal ?? '');
    if (oldStr !== newStr) {
      changedFields.push({ field: key, from: oldStr, to: newStr });
    }
  }
  if (changedFields.length === 0) return null;

  const fieldNames = changedFields.map((c) => c.field).join(', ');
  const entry = {
    type: 'change',
    title: action,
    detail: `Changed: ${fieldNames}`,
    meta: {
      tag: 'Data change',
      tagColor: '#6366F1',
      changedFields,
    },
  };
  return addEntry(partnerId, entry);
}

export const partnerHistoryService = {
  getHistory,
  addEntry,
  logChange,
  seedHistoryIfEmpty,
};

export default partnerHistoryService;
