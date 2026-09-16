/**
 * useOrgProgress - top-bar progress for the Organizations flow (simple mode).
 *
 * Mirrors the 4 milestone signals the on-page OrgProgressTracker uses, so the
 * top-bar pill and the on-page block stay in sync:
 *   1. create org       - any organization exists
 *   2. activate assistant - localStorage 'orch_assistant_active' === 'true'
 *   3. add consilium     - any concilium board exists
 *   4. hire team         - any concilium team exists
 *
 * Fetches only when { enabled } (i.e. on the org route), so it adds no cost to
 * other pages that mount the always-present TopBar.
 */
import { useState, useEffect, useMemo } from 'react';
import { listOrganizations } from '../../services/organizationService';
import { getAllConcilium } from '../../services/conciliumService';
import { getAllTeams } from '../../services/conciliumTeamsService';

const TOTAL = 4;

function readAssistant() {
  try {
    return localStorage.getItem('orch_assistant_active') === 'true';
  } catch {
    return false;
  }
}

export function useOrgProgress({ enabled = true } = {}) {
  const [orgs, setOrgs] = useState(null);
  const [boards, setBoards] = useState(null);
  const [teams, setTeams] = useState(null);
  const [hasAssistant, setHasAssistant] = useState(readAssistant);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    (async () => {
      const [o, b, t] = await Promise.all([
        listOrganizations().catch(() => []),
        getAllConcilium().catch(() => []),
        getAllTeams().catch(() => []),
      ]);
      if (!active) return;
      setOrgs(o || []);
      setBoards(b || []);
      setTeams(t || []);
      setHasAssistant(readAssistant());
    })();
    return () => {
      active = false;
    };
  }, [enabled]);

  return useMemo(() => {
    const loading = enabled && (orgs === null || boards === null || teams === null);
    const signals = [
      (orgs?.length || 0) > 0,
      hasAssistant,
      (boards?.length || 0) > 0,
      (teams?.length || 0) > 0,
    ];
    const completed = signals.filter(Boolean).length;
    return { completed, total: TOTAL, loading, allDone: completed === TOTAL };
  }, [enabled, orgs, boards, teams, hasAssistant]);
}

export default useOrgProgress;
