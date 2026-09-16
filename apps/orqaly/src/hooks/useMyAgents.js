import { useState, useEffect, useCallback } from 'react';
import { getMyAgents, getMyAgentStats } from '../services/myAgentsService';
import { getAllTeams, getAllAgentTeams } from '../services/conciliumTeamsService';
import { listProfiles } from '../services/agentProfileService';
import { PREDEFINED_AGENT_PROFILES } from '../config/predefinedAgentProfiles';

export function useMyAgents() {
  const [agents, setAgents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [stats, setStats] = useState({
    totalAgents: 0,
    avgRating: 0,
    totalSpend: 0,
    activeJobs: 0,
    pendingApproval: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [agentData, agentTeamData, conciliumTeamData, dbProfiles] = await Promise.all([
        getMyAgents(),
        getAllAgentTeams().catch(() => []),
        getAllTeams().catch(() => []),
        listProfiles().catch(() => []),
      ]);
      // Use DB profiles if available, otherwise fall back to predefined config
      const profiles = dbProfiles && dbProfiles.length > 0 ? dbProfiles : PREDEFINED_AGENT_PROFILES;

      // Build multiple lookup maps for robust matching
      const byId = new Map();
      const byRole = new Map();
      const byCodename = new Map();
      for (const p of profiles) {
        if (p.agent_id) byId.set(p.agent_id, p);
        if (p.job_title) byRole.set(p.job_title.toLowerCase(), p);
        if (p.role) byRole.set(p.role.toLowerCase(), p);
        if (p.agentName) byCodename.set(p.agentName.toLowerCase(), p);
      }
      // Attach profile: try ID → role → codename
      for (const agent of agentData) {
        const profile =
          byId.get(agent.supabaseId) ||
          byId.get(agent.agentId) ||
          byRole.get((agent.role || '').toLowerCase()) ||
          byRole.get((agent.agentName || '').toLowerCase()) ||
          byCodename.get((agent.agentName || '').toLowerCase());
        if (profile) {
          // Derive headshot_path if missing
          if (!profile.headshot_path && profile.display_name) {
            profile.headshot_path =
              profile.display_name
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '') + '.jpg';
          }
          agent.profile = profile;
          if (profile.display_name) agent.agentName = profile.display_name;
          // Override generic "general" role with actual job title from profile
          if (profile.job_title && (!agent.role || agent.role === 'general')) {
            agent.role = profile.job_title;
          }
          // Use profile cost if agent has none
          if (!agent.costPerTask && profile.cost_per_task) {
            agent.costPerTask = Number(profile.cost_per_task);
          }
        }
      }
      setAgents(agentData);
      // Merge agent teams (primary) + concilium teams (legacy), deduplicate by id
      const allTeams = [...(agentTeamData || []), ...(conciliumTeamData || [])];
      const seen = new Set();
      const deduped = allTeams.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      setTeams(deduped);
      setStats(getMyAgentStats(agentData));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { agents, teams, stats, loading, error, refetch };
}
