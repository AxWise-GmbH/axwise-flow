import { useCallback, useEffect, useMemo, useState } from 'react';
import { listOrganizations } from '../../services/organizationService';
import { listStorageConnections } from '../../services/storageConnectionsService';
import { getUserPrefs } from '../../services/userPrefsService';
import { useUserApiKeys } from '../../hooks/useUserApiKeys';

const STORAGE_CHOICE_KEY = 'orchestratori_setup_storage_choice';
const CHATSYNC_DONE_KEY = 'orchestratori_setup_chatsync_done';
const LOCAL_LLM_PROVIDERS = ['llm:ollama', 'llm:local-openai'];
const DATABASE_PREFIX = 'database:';

const isLocalLlm = (p) => LOCAL_LLM_PROVIDERS.includes(p);
const isDatabase = (p) => typeof p === 'string' && p.startsWith(DATABASE_PREFIX);
/** The exact user-scoped provider used by normal goal execution. */
const isGoalGeminiKey = (provider) => provider === 'llm:gemini';

/**
 * Aggregates the 5 signals for the /setup wizard:
 *   1. workspace: any organization with a non-empty name (required)
 *   2. database:  a stored "database:*" Supabase credential exists
 *   3. keys:      at least one user-scoped Gemini key (required)
 *   4. storage:   a BYO storage connection exists OR the user chose platform storage
 *   5. localLlm:  a local engine key (Ollama / local OpenAI) is configured
 * Only workspace + keys are required to finish; the rest are skippable.
 *
 * Returns refresh handles so steps can re-check after they save.
 */
export function useSetupProgress() {
  const { keys, loading: keysLoading, refresh: refreshKeys } = useUserApiKeys();

  const [orgs, setOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [prefs, setPrefs] = useState(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [storage, setStorage] = useState([]);
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageChoice, setStorageChoice] = useState(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_CHOICE_KEY) || null;
  });
  const [chatSyncDone, setChatSyncDone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(CHATSYNC_DONE_KEY) === '1';
  });

  const refreshOrgs = useCallback(async () => {
    setOrgsLoading(true);
    try {
      const data = await listOrganizations();
      setOrgs(Array.isArray(data) ? data : data?.organizations || []);
    } catch {
      setOrgs([]);
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  const refreshPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const p = await getUserPrefs();
      setPrefs(p);
    } catch {
      setPrefs(null);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  const refreshStorage = useCallback(async () => {
    setStorageLoading(true);
    try {
      const rows = await listStorageConnections();
      setStorage(Array.isArray(rows) ? rows : []);
    } catch {
      setStorage([]);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshOrgs();
    refreshPrefs();
    refreshStorage();
  }, [refreshOrgs, refreshPrefs, refreshStorage]);

  const choosePlatformStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_CHOICE_KEY, 'platform');
    }
    setStorageChoice('platform');
  }, []);

  const clearStorageChoice = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_CHOICE_KEY);
    }
    setStorageChoice(null);
  }, []);

  const markChatSyncDone = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHATSYNC_DONE_KEY, '1');
    }
    setChatSyncDone(true);
  }, []);

  const refreshChatSync = useCallback(() => {
    if (typeof window === 'undefined') return;
    setChatSyncDone(window.localStorage.getItem(CHATSYNC_DONE_KEY) === '1');
  }, []);

  const workspaceDone = useMemo(() => orgs.some((o) => (o?.name || '').trim().length > 0), [orgs]);
  const keyList = keys || [];
  const databaseDone = keyList.some((k) => isDatabase(k.provider));
  const keysDone = keyList.some((k) => isGoalGeminiKey(k.provider));
  const localLlmDone = keyList.some((k) => isLocalLlm(k.provider));
  const storageDone = storage.length > 0 || storageChoice === 'platform';
  const defaultLlmDone = !!prefs?.defaultLlmPreset;

  const loading = orgsLoading || prefsLoading || storageLoading || keysLoading;

  // Only workspace + keys gate "finish"; the others are optional.
  const requiredSteps = [workspaceDone, keysDone];
  const completedRequired = requiredSteps.filter(Boolean).length;
  const allRequiredDone = completedRequired === requiredSteps.length;

  // Overall wizard progress (5 steps) drives the header "X of 5" + the stepper.
  const stepDone = [workspaceDone, databaseDone, keysDone, storageDone, localLlmDone];
  const completedSteps = stepDone.filter(Boolean).length;

  return {
    loading,
    workspace: { done: workspaceDone, orgs, refresh: refreshOrgs },
    database: { done: databaseDone, keys: keyList, refresh: refreshKeys },
    keys: { done: keysDone, keys: keyList, refresh: refreshKeys },
    localLlm: { done: localLlmDone, keys: keyList, refresh: refreshKeys },
    storage: {
      done: storageDone,
      connections: storage,
      choice: storageChoice,
      choosePlatform: choosePlatformStorage,
      clearChoice: clearStorageChoice,
      refresh: refreshStorage,
    },
    aiChatSync: { done: chatSyncDone, markDone: markChatSyncDone, refresh: refreshChatSync },
    // IDE sync is a placeholder step for now; optional so it never gates Finish.
    ideSync: { done: false, refresh: () => {} },
    defaultLlm: { done: defaultLlmDone, prefs, refresh: refreshPrefs },
    completedRequired,
    totalRequired: requiredSteps.length,
    allRequiredDone,
    completedSteps,
    totalSteps: stepDone.length,
    setupCompletedAt: prefs?.setupCompletedAt || null,
  };
}
