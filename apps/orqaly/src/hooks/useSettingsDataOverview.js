/**
 * useSettingsDataOverview - minimal data source for the Settings page's
 * "Data Base" section (Data / Contacts / Conversations cards, reused
 * verbatim from the Assistant Console). Deliberately lighter than
 * useAssistantConsole: fans out to only the 3 services this section needs
 * (no voice/usage/brief/team-chat/channels/setup). Always live data -
 * Settings has no demo-mode toggle.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { listDocuments, listTags } from '../services/knowledgeBaseService';
import { listContacts } from '../services/contactsService';
import { listOrganizations } from '../services/organizationService';
import { getLogs } from '../services/communicatorService';
import { buildKnowledgeData, groupThreads } from '../pages/Assistant/format';

// Empty-safe shapes so the reused cards never read undefined - mirrors
// useAssistantConsole's EMPTY_KNOWLEDGE / contacts-from-[] pattern.
const EMPTY_KNOWLEDGE = {
  counts: { notes: 0, files: 0, links: 0 },
  connectors: [],
  tags: [],
  tagsMore: 0,
};
const EMPTY_STATE = {
  knowledge: EMPTY_KNOWLEDGE,
  contacts: { list: [], total: 0, mail: 0, phone: 0 },
  organizations: [],
  conversations: [],
};

// Service responses are inconsistently shaped (bare array vs. { data / organizations / contacts }) -
// normalize defensively, same spirit as useAssistantConsole's asArray.
function asArray(x) {
  if (Array.isArray(x)) return x;
  return x?.data || x?.organizations || x?.contacts || [];
}

function settled(result, fallback) {
  return result?.status === 'fulfilled' ? result.value : fallback;
}

export function useSettingsDataOverview() {
  const [state, setState] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docsR, tagsR, contactsR, orgsR, logsR] = await Promise.allSettled([
        listDocuments({ limit: 200 }),
        listTags(),
        listContacts(),
        listOrganizations(),
        getLogs({ limit: 1000 }),
      ]);

      const documents = asArray(settled(docsR, []));
      const tags = asArray(settled(tagsR, []));
      const contactList = asArray(settled(contactsR, []));
      const organizations = asArray(settled(orgsR, []));
      const logs = asArray(settled(logsR, []));

      if (!mounted.current) return;
      setState({
        knowledge: documents.length ? buildKnowledgeData(documents, tags) : EMPTY_KNOWLEDGE,
        contacts: {
          list: contactList,
          total: contactList.length,
          mail: contactList.filter((c) => c.contact_type === 'mail').length,
          phone: contactList.filter((c) => c.contact_type !== 'mail').length,
        },
        organizations,
        conversations: logs.length ? groupThreads(logs) : [],
      });
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, loading, error, refetch: load };
}
