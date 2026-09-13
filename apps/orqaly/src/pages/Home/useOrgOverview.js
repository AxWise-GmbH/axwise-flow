/**
 * useOrgOverview - organizations + per-org metrics for the Home overview.
 *
 * Lists the user's organizations and computes each one's Units, Teams,
 * Consilium, Agents, Tools, Tasks, ROI and Invested by composing the existing
 * org services (mirrors the aggregation in Organizations.jsx / SimpleOrganizations).
 * In demo mode it returns curated example organizations instead of hitting the
 * network so the selector visibly switches data.
 */
import { useCallback, useEffect, useState } from 'react';
import { listOrganizations, getOrgFinances } from '../../services/organizationService';
import { getOrgTeamMap } from '../../services/orgTeamService';
import { getOrgAgentMap } from '../../services/orgAgentService';
import { getAllTools } from '../../services/toolService';
import { loadTeamTasks } from '../../services/teamTaskBackend';
import { buildDemoOrgs } from './demoData';

/** Count tools that are active and actually connected (mirrors SimpleOrganizations). */
function countReadyTools(tools) {
  return (tools || []).filter((t) => {
    if (t.status !== 'active') return false;
    if (t.connectionType === 'internal') return true;
    if (t.connectionType === 'api') return !!t.credentialConfigured;
    if (t.connectionType === 'webhook') return !!t.credentialConfigured;
    if (t.connectionType === 'sdk') return !!t.sdkPackage;
    if (t.connectionType === 'composio') return !!t.composioApp;
    return false;
  }).length;
}

export function useOrgOverview({ demo = false } = {}) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(!demo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listOrganizations();
      const arr = Array.isArray(list) ? list : list?.organizations || [];
      const ids = arr.map((o) => o.id);
      const [teamMap, agentMap, finances, tools, tasks] = await Promise.all([
        getOrgTeamMap(ids).catch(() => ({})),
        getOrgAgentMap(ids).catch(() => ({})),
        getOrgFinances().catch(() => ({})),
        getAllTools().catch(() => []),
        loadTeamTasks().catch(() => []),
      ]);
      const readyTools = countReadyTools(tools);
      const computed = arr.map((o) => {
        const teamIds = new Set(teamMap[o.id] || []);
        const tasksForOrg = (tasks || []).filter((t) =>
          teamIds.has(t.jobPoolId || t.job_pool_id)
        ).length;
        const fin = finances[o.id] || {};
        return {
          id: o.id,
          name: o.name,
          org_type: o.org_type,
          industry: o.industry,
          parent_id: o.parent_id,
          consilium_id: o.consilium_id || null,
          metrics: {
            units: arr.filter((c) => c.parent_id === o.id).length,
            teams: (teamMap[o.id] || []).length,
            consilium: o.consilium_id ? 1 : 0,
            agents: (agentMap[o.id] || []).length,
            tools: readyTools,
            tasks: tasksForOrg,
            roi: Number(fin.roi) || 0,
            invested: Number(fin.invested) || 0,
          },
        };
      });
      setOrgs(computed);
    } catch {
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (demo) {
      setOrgs(buildDemoOrgs());
      setLoading(false);
      return;
    }
    load();
  }, [demo, load]);

  return { orgs, loading };
}

export default useOrgOverview;
