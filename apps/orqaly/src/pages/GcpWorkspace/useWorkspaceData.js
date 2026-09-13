import { useAuth } from '@clerk/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import {
  normalizeDelegatedAgents,
  normalizeOverview,
  normalizeWorkspace,
} from './workspaceViewModel.js';

function endpointMissing(error) {
  return error?.status === 404 || error?.code === 'NOT_FOUND' || error?.code === 'UNKNOWN_ROUTE';
}

export async function loadOverviewResource(client) {
  if (typeof client.overview === 'function') {
    try {
      const [overview, threads] = await Promise.all([
        client.overview({ limit: 50 }),
        client.assistantThreads({ limit: 50 }),
      ]);
      return normalizeOverview({ ...overview, threads: threads?.threads || [] });
    } catch (error) {
      if (!endpointMissing(error)) throw error;
    }
  }

  const [threads, workflows] = await Promise.all([
    client.assistantThreads({ limit: 50 }),
    client.list({ limit: 50 }),
  ]);
  return normalizeOverview({
    threads: threads?.threads || [],
    workflows: workflows?.workflows || workflows?.runs || [],
  });
}

export async function loadActivityResource(client) {
  if (typeof client.activity !== 'function') return [];
  try {
    const response = await client.activity({ limit: 50 });
    return Array.isArray(response?.activities) ? response.activities : [];
  } catch (error) {
    if (endpointMissing(error)) return [];
    throw error;
  }
}

export async function loadWorkspaceResource(client) {
  if (typeof client.workspace === 'function') {
    try {
      return normalizeWorkspace(await client.workspace());
    } catch (error) {
      if (!endpointMissing(error)) throw error;
    }
  }

  return normalizeWorkspace(await client.session());
}

export async function loadDelegatedAgentsResource(client) {
  if (typeof client.agents !== 'function') return [];
  try {
    return normalizeDelegatedAgents(await client.agents({ limit: 50 }));
  } catch (error) {
    if (endpointMissing(error)) return [];
    throw error;
  }
}

const EMPTY_OVERVIEW = normalizeOverview();
const EMPTY_WORKSPACE = normalizeWorkspace();
const EMPTY_DELEGATED_AGENTS = Object.freeze([]);

export function useWorkspaceData({
  overview: includeOverview = false,
  workspace: includeWorkspace = false,
  activity: includeActivity = false,
} = {}) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const client = useMemo(() => createWorkflowV2Client(getToken), [getToken]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    loading: true,
    error: null,
    overview: EMPTY_OVERVIEW,
    workspace: EMPTY_WORKSPACE,
    delegatedAgents: EMPTY_DELEGATED_AGENTS,
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return undefined;
    let current = true;

    const overviewPromise = includeOverview
      ? loadOverviewResource(client)
      : Promise.resolve(EMPTY_OVERVIEW);
    const workspacePromise = includeWorkspace
      ? loadWorkspaceResource(client)
      : Promise.resolve(EMPTY_WORKSPACE);
    const delegatedAgentsPromise = includeWorkspace
      ? loadDelegatedAgentsResource(client)
      : Promise.resolve(EMPTY_DELEGATED_AGENTS);
    const activityPromise = includeActivity ? loadActivityResource(client) : Promise.resolve([]);

    Promise.all([overviewPromise, workspacePromise, delegatedAgentsPromise, activityPromise])
      .then(([overview, workspace, delegatedAgents, activity]) => {
        if (!current) return;
        setState({
          loading: false,
          error: null,
          overview: activity.length ? { ...overview, activity } : overview,
          workspace,
          delegatedAgents,
        });
      })
      .catch((error) => {
        if (!current) return;
        setState((previous) => ({ ...previous, loading: false, error }));
      });

    return () => {
      current = false;
    };
  }, [
    client,
    includeActivity,
    includeOverview,
    includeWorkspace,
    isLoaded,
    isSignedIn,
    refreshKey,
  ]);

  const refresh = useCallback(() => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    setRefreshKey((value) => value + 1);
  }, []);
  return { ...state, refresh };
}
