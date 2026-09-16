/**
 * useAgentMemory — Hook for managing agent-scoped long-term memory.
 *
 * When ownerType === 'agent', fetches the combined view (direct + goal-linked)
 * via list-agent-memory op. Otherwise falls back to the generic list.
 * Exposes per-source counts and search latency for the Status Bar.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listDocuments,
  addDocument,
  deleteDocument,
  searchAgentMemory,
  listAgentMemory,
} from '../services/knowledgeBaseService';

const CONTENT_TYPE_COUNT_KEY = {
  note: 'notes',
  file: 'files',
  link: 'links',
  conversation: 'conversations',
};
const CATEGORY_COUNT_KEY = {
  'agent-report': 'reports',
  'job-memory': 'jobs',
  'agent-work-memory': 'work',
  osja_lesson: 'lessons',
};

function computeCounts(memories) {
  const c = {
    total: memories.length,
    notes: 0,
    files: 0,
    links: 0,
    conversations: 0,
    reports: 0,
    jobs: 0,
    work: 0,
    lessons: 0,
    goalLinked: 0,
  };
  let lastTs = 0;
  for (const m of memories) {
    if (m.source_tag === 'goal-linked') c.goalLinked += 1;
    const ctKey = CONTENT_TYPE_COUNT_KEY[m.content_type || 'note'];
    if (ctKey) c[ctKey] += 1;
    const catKey = CATEGORY_COUNT_KEY[m.category];
    if (catKey) c[catKey] += 1;
    const ts = Date.parse(m.updated_at || m.created_at || 0) || 0;
    if (ts > lastTs) lastTs = ts;
  }
  return { ...c, lastUpdatedAt: lastTs ? new Date(lastTs).toISOString() : null };
}

export function useAgentMemory(ownerType, ownerId) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSearchMs, setLastSearchMs] = useState(null);

  const fetch = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    try {
      let data;
      if (ownerType === 'agent') {
        data = await listAgentMemory(ownerId, { limit: 200 });
      } else {
        data = await listDocuments({ owner_type: ownerType, owner_id: ownerId, limit: 100 });
      }
      setMemories(Array.isArray(data) ? data : data?.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const addMemory = useCallback(
    async (doc) => {
      const result = await addDocument({ ...doc, owner_type: ownerType, owner_id: ownerId });
      await fetch();
      return result;
    },
    [ownerType, ownerId, fetch]
  );

  const removeMemory = useCallback(async (id) => {
    await deleteDocument(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const search = useCallback(
    async (query) => {
      if (!query || !ownerId) return [];
      const t0 = performance.now();
      try {
        const res = await searchAgentMemory(query, ownerType, ownerId, { limit: 5 });
        setLastSearchMs(Math.round(performance.now() - t0));
        return res;
      } catch (e) {
        setLastSearchMs(Math.round(performance.now() - t0));
        throw e;
      }
    },
    [ownerType, ownerId]
  );

  // Per-source counts — used by the Status Bar and Activation preview.
  const counts = useMemo(() => computeCounts(memories), [memories]);

  return {
    memories,
    loading,
    error,
    counts,
    lastSearchMs,
    refetch: fetch,
    addMemory,
    removeMemory,
    search,
  };
}
