/**
 * useAgentSkills — React hook for browsing, installing, and managing agent skills.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  listSkills,
  getInstalledSkills,
  installSkill,
  uninstallSkill,
  updateCustomContent,
  toggleSkill,
  seedBundledSkills,
} from '../services/agentSkillsService';
import { BUNDLED_SKILLS } from '../config/bundledSkills';

const SEED_KEY = 'orch_skills_seeded_v1';

export default function useAgentSkills(agentId) {
  const [allSkills, setAllSkills] = useState([]);
  const [installedSkills, setInstalledSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* ── Auto-seed bundled skills on first load ─────────────────────────── */
  useEffect(() => {
    const alreadySeeded = typeof window !== 'undefined' && window.localStorage.getItem(SEED_KEY);
    if (alreadySeeded) return;

    seedBundledSkills(BUNDLED_SKILLS)
      .then(() => {
        if (typeof window !== 'undefined') window.localStorage.setItem(SEED_KEY, '1');
      })
      .catch((err) => {
        console.warn('[useAgentSkills] seed failed:', err.message);
      });
  }, []);

  /* ── Fetch all available skills ─────────────────────────────────────── */
  const fetchAllSkills = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSkills(filters);
      setAllSkills(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Fetch installed skills for the given agent ─────────────────────── */
  const fetchInstalledSkills = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getInstalledSkills(agentId);
      setInstalledSkills(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  /* ── Install a skill for the current agent ──────────────────────────── */
  const install = useCallback(
    async (skillId) => {
      if (!agentId) return;
      setError(null);
      try {
        await installSkill(agentId, skillId);
        await fetchInstalledSkills();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [agentId, fetchInstalledSkills]
  );

  /* ── Uninstall a skill ──────────────────────────────────────────────── */
  const uninstall = useCallback(
    async (skillId) => {
      if (!agentId) return;
      setError(null);
      try {
        await uninstallSkill(agentId, skillId);
        await fetchInstalledSkills();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [agentId, fetchInstalledSkills]
  );

  /* ── Update custom content for an installed skill ───────────────────── */
  const updateContent = useCallback(
    async (skillId, content) => {
      if (!agentId) return;
      setError(null);
      try {
        await updateCustomContent(agentId, skillId, content);
        await fetchInstalledSkills();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [agentId, fetchInstalledSkills]
  );

  /* ── Toggle skill active / inactive ─────────────────────────────────── */
  const toggle = useCallback(
    async (skillId, isActive) => {
      if (!agentId) return;
      setError(null);
      try {
        await toggleSkill(agentId, skillId, isActive);
        await fetchInstalledSkills();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [agentId, fetchInstalledSkills]
  );

  return {
    allSkills,
    installedSkills,
    loading,
    error,
    refetchAll: fetchAllSkills,
    refetchInstalled: fetchInstalledSkills,
    install,
    uninstall,
    updateContent,
    toggle,
  };
}
