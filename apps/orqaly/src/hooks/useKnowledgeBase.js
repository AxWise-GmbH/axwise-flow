import { useState, useEffect, useCallback } from 'react';
import { listDocuments, listTags, listKBAgents } from '../services/knowledgeBaseService';

/**
 * Hook for knowledge base data loading with filters.
 * @param {object} [filters] - { category, category_group, owner_type, owner_id, content_type, is_pinned, date_from, date_to, agent_name, search_text, organization_id, concilium_id }
 */
export function useKnowledgeBase(filters = {}) {
  const [documents, setDocuments] = useState([]);
  const [tags, setTags] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filterKey = JSON.stringify(filters);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docs, tagList, agentList] = await Promise.all([
        listDocuments(filters),
        listTags(),
        listKBAgents(),
      ]);
      setDocuments(Array.isArray(docs) ? docs : []);
      setTags(Array.isArray(tagList) ? tagList : []);
      setAgents(Array.isArray(agentList) ? agentList : []);
    } catch (err) {
      setError(err.message || 'Failed to load knowledge base');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { documents, tags, agents, loading, error, refetch: fetch };
}
