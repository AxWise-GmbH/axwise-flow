/**
 * useOrgCommander — org roster, unified timeline, command dispatch.
 */
import { useState, useCallback, useEffect } from 'react';
import { listOrganizations } from '../services/organizationService';
import { createGoal } from '../services/goalService';
import { getOrgCommunicationTimeline, addLog } from '../services/communicatorService';
import { supabase } from '../lib/supabase';
import { EMPTY_ORG_ROSTER, loadOrgRoster } from './useOrgRoster';
import { executorPayloadForTarget } from '../components/JobPool/NewGoal/goalExecutorTarget';

function normalizeOrgs(res) {
  if (Array.isArray(res)) return res;
  return res?.data || res?.organizations || [];
}

export function useOrgCommander() {
  const [orgs, setOrgs] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [roster, setRoster] = useState(EMPTY_ORG_ROSTER);
  const [events, setEvents] = useState([]);
  const [scope, setScope] = useState(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState(null);

  const loadOrgs = useCallback(async () => {
    setLoadingOrgs(true);
    setError(null);
    try {
      const res = await listOrganizations();
      const list = normalizeOrgs(res);
      setOrgs(list);
      setSelectedOrgId((prev) => {
        if (prev && list.some((o) => o.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  const loadRoster = useCallback(
    async (orgId) => {
      setRoster(await loadOrgRoster({ orgId, orgs }));
    },
    [orgs]
  );

  const loadTimeline = useCallback(async (orgId) => {
    if (!orgId) {
      setEvents([]);
      return;
    }
    setLoadingTimeline(true);
    setError(null);
    try {
      const data = await getOrgCommunicationTimeline(orgId);
      setEvents(data.events || []);
      setScope(data.scope || null);
    } catch (e) {
      setError(e.message);
      setEvents([]);
    } finally {
      setLoadingTimeline(false);
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (selectedOrgId) {
      loadRoster(selectedOrgId);
      loadTimeline(selectedOrgId);
    }
  }, [selectedOrgId, loadRoster, loadTimeline]);

  const dispatch = useCallback(
    async ({ orgId, target, command }) => {
      if (!orgId || !target || !command?.trim()) return null;
      const org = orgs.find((o) => o.id === orgId);
      setDispatching(true);
      setError(null);
      try {
        const title = command.trim().slice(0, 120);
        const payload = {
          title,
          description: command.trim(),
          org_id: orgId,
          ...executorPayloadForTarget(target),
          data: {
            metadata: {
              source: 'communicator-org-command',
              target_type: target.type,
              target_id: target.id,
              target_label: target.label,
            },
          },
        };

        const created = await createGoal(payload);
        const goalId = created?.id || created?.data?.id || created?.goal?.id;

        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          await addLog({
            sender_type: 'user',
            sender_id: user?.id || null,
            sender_name: user?.email?.split('@')[0] || 'You',
            content: `[${target.label}] ${command.trim()}`,
            context_type: 'organization',
            context_id: orgId,
            context_label: org?.name || 'Organization',
            platform: 'internal',
            metadata: {
              org_id: orgId,
              goal_id: goalId,
              target_type: target.type,
              target_id: target.id,
            },
          });
        } catch (logErr) {
          console.warn('[useOrgCommander] comm log failed (run migration 152?):', logErr);
        }

        await loadTimeline(orgId);
        return goalId;
      } catch (e) {
        setError(e.message);
        return null;
      } finally {
        setDispatching(false);
      }
    },
    [orgs, loadTimeline]
  );

  return {
    orgs,
    selectedOrgId,
    setSelectedOrgId,
    roster,
    events,
    scope,
    loadingOrgs,
    loadingTimeline,
    dispatching,
    error,
    dispatch,
    refresh: () => {
      loadOrgs();
      if (selectedOrgId) loadTimeline(selectedOrgId);
    },
  };
}
