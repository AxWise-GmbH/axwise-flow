/**
 * useAssistantSetup - loads/persists the CURRENT AI assistant and exposes the
 * full list so the console can switch between assistants (each scoped to an
 * organization). Source of truth is the `assistants` table via assistantsService.
 *
 * The public shape ({ setup, config, steps, activated, save, markStep,
 * setActivated, refresh, loading, error }) is unchanged so existing consumers
 * (useAssistantConsole, the setup wizard) keep working transparently. It is
 * extended with the assistant list + CRUD ({ assistants, currentId, current,
 * name, organizationId, createAssistant, switchAssistant, renameAssistant,
 * removeAssistant }).
 *
 * Single-writer model: the console only reads; the wizard / explicit actions
 * write. `save()` creates the user's first assistant on demand when none exists,
 * so brand-new users get an assistant the moment they start setup - no
 * auto-create race between the (read-only) console and the wizard.
 *
 * Every save still mirrors into the legacy localStorage keys so un-migrated
 * readers (Dashboard, SimpleOrganizations) keep working.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadAssistants,
  createAssistant as apiCreate,
  switchAssistant as apiSwitch,
  renameAssistant as apiRename,
  deleteAssistant as apiDelete,
  saveAssistant as apiSave,
} from '../services/assistantsService';

const LS_CONFIG = 'orch_assistant_config';
const LS_ACTIVE = 'orch_assistant_active';

const EMPTY = { config: {}, steps: {}, activated: false, updatedAt: null };

/** Mirror the current assistant into the legacy keys so old readers stay correct. */
function mirrorLegacy(current) {
  if (typeof window === 'undefined' || !current) return;
  try {
    if (current.config && Object.keys(current.config).length > 0) {
      localStorage.setItem(LS_CONFIG, JSON.stringify(current.config));
    }
    localStorage.setItem(LS_ACTIVE, current.activated ? 'true' : 'false');
  } catch {
    // localStorage may be unavailable (private mode) - non-fatal.
  }
}

export function useAssistantSetup({ enabled = true } = {}) {
  const [assistants, setAssistants] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyList = useCallback((list, nextCurrentId) => {
    if (!mounted.current) return;
    setAssistants(list);
    const cid = nextCurrentId ?? (list.find((a) => a.isCurrent) || list[0] || null)?.id ?? null;
    setCurrentId(cid);
    mirrorLegacy(list.find((a) => a.id === cid) || null);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { assistants: list, currentId: cid } = await loadAssistants();
      applyList(list, cid);
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled, applyList]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const current = assistants.find((a) => a.id === currentId) || null;
  const setup = current
    ? {
        config: current.config,
        steps: current.steps,
        activated: current.activated,
        updatedAt: current.updatedAt,
      }
    : EMPTY;

  /** Persist a partial patch to the current assistant, creating one if needed. */
  const save = useCallback(
    async (patch = {}) => {
      let id = currentId;
      let list = assistants;
      if (!id) {
        // First write for a brand-new user: create their assistant, then save into it.
        const created = await apiCreate({});
        list = created.assistants || [];
        id = created.currentId || created.assistant?.id || null;
      }
      const saved = id ? await apiSave(id, patch) : null;
      if (saved) {
        list = list.map((a) => (a.id === saved.id ? { ...a, ...saved } : a));
      }
      applyList(list, id);
      return saved
        ? {
            config: saved.config,
            steps: saved.steps,
            activated: saved.activated,
            updatedAt: saved.updatedAt,
          }
        : setup;
    },
    [currentId, assistants, applyList, setup]
  );

  const markStep = useCallback((key, value = true) => save({ steps: { [key]: value } }), [save]);
  const setActivated = useCallback((value) => save({ activated: Boolean(value) }), [save]);

  /** Create a new assistant (becomes current) and refresh the list. */
  const createAssistant = useCallback(
    async ({ organizationId = null, name } = {}) => {
      const res = await apiCreate({ organizationId, name });
      applyList(res.assistants || [], res.currentId);
      return res.assistant || null;
    },
    [applyList]
  );

  const switchAssistant = useCallback(
    async (id) => {
      const res = await apiSwitch(id);
      applyList(res.assistants || [], res.currentId);
    },
    [applyList]
  );

  const renameAssistant = useCallback(
    async (id, name) => {
      const res = await apiRename(id, name);
      applyList(res.assistants || [], res.currentId);
    },
    [applyList]
  );

  const removeAssistant = useCallback(
    async (id) => {
      const res = await apiDelete(id);
      applyList(res.assistants || [], res.currentId);
    },
    [applyList]
  );

  return {
    setup,
    config: setup.config,
    steps: setup.steps,
    activated: setup.activated,
    loading,
    error,
    refresh,
    save,
    markStep,
    setActivated,
    // Multi-assistant extensions:
    assistants,
    currentId,
    current,
    name: current?.name || null,
    organizationId: current?.organizationId || null,
    createAssistant,
    switchAssistant,
    renameAssistant,
    removeAssistant,
  };
}
