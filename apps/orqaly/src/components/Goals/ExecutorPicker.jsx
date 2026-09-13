/**
 * ExecutorPicker — cascading selector for goal executor assignment.
 * Asks: who will handle this goal? → Organization / Consilium / Team / Agent
 * Then: which organization? → conditional secondary picker.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import { listOrganizations } from '../../services/organizationService';
import { getAllConcilium } from '../../services/conciliumService';
import { getAllTeams, getAllAgentTeams } from '../../services/conciliumTeamsService';
import { getAgents } from '../../services/agentHubService';
import { getOrgTeamMap } from '../../services/orgTeamService';
import { getOrgAgentMap } from '../../services/orgAgentService';
import { pickDefaultOrgId } from '../../utils/defaultOrganization';

import AppIcon from '../icons/AppIcon';

const EXECUTOR_TYPES = [
  {
    value: 'organization',
    label: 'Organization',
    icon: CorporateFareOutlinedIcon,
    hint: 'Consilium decides who handles it',
  },
  {
    value: 'consilium',
    label: 'Consilium',
    icon: GavelOutlinedIcon,
    hint: 'Specific board evaluates & assigns',
  },
  { value: 'team', label: 'Team', icon: GroupsOutlinedIcon, hint: 'Assign directly to a team' },
  { value: 'agent', label: 'Agent', icon: SmartToyOutlinedIcon, hint: 'Assign to a single agent' },
];

export default function ExecutorPicker({
  executorType,
  setExecutorType,
  orgId,
  setOrgId,
  executorId,
  setExecutorId,
  conciliumId,
  setConciliumId,
}) {
  const theme = useTheme();
  const [orgs, setOrgs] = useState([]);
  const [boards, setBoards] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [allAgentsList, setAllAgentsList] = useState([]);
  const [orgTeamIds, setOrgTeamIds] = useState([]);
  const [orgAgentIds, setOrgAgentIds] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load orgs, boards, teams, agents on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [orgRes, boardRes, govTeams, agentTeams] = await Promise.all([
          listOrganizations().catch(() => ({ organizations: [] })),
          getAllConcilium().catch(() => []),
          getAllTeams().catch(() => []),
          getAllAgentTeams().catch(() => []),
        ]);
        if (cancelled) return;
        const orgList = orgRes.organizations || orgRes || [];
        setOrgs(orgList);
        const defaultOrgId = pickDefaultOrgId(orgList);
        if (defaultOrgId && !orgId) setOrgId(defaultOrgId);
        setBoards(Array.isArray(boardRes) ? boardRes : []);
        // Merge teams with dedup
        const seen = new Set();
        const merged = [...govTeams, ...agentTeams].filter((t) => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
        setAllTeams(merged);
        setAllAgentsList(getAgents());
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When org changes, load its teams/agents and auto-resolve consilium
  useEffect(() => {
    if (!orgId) {
      setOrgTeamIds([]);
      setOrgAgentIds([]);
      return;
    }
    (async () => {
      const [teamMap, agentMap] = await Promise.all([
        getOrgTeamMap([orgId]).catch(() => ({})),
        getOrgAgentMap([orgId]).catch(() => ({})),
      ]);
      setOrgTeamIds(teamMap[orgId] || []);
      setOrgAgentIds(agentMap[orgId] || []);
    })();
    // Auto-set consilium from org
    const org = orgs.find((o) => o.id === orgId);
    if (org?.consilium_id && setConciliumId) {
      setConciliumId(org.consilium_id);
    }
  }, [orgId, orgs, setConciliumId]);

  // Filtered lists scoped to selected org
  const orgTeams = useMemo(() => {
    if (!orgTeamIds.length) return allTeams;
    const idSet = new Set(orgTeamIds);
    return allTeams.filter((t) => idSet.has(t.id));
  }, [allTeams, orgTeamIds]);

  const orgAgents = useMemo(() => {
    if (!orgAgentIds.length) return allAgentsList;
    const idSet = new Set(orgAgentIds);
    return allAgentsList.filter((a) => idSet.has(a.id) || idSet.has(a.agent_id));
  }, [allAgentsList, orgAgentIds]);

  const handleTypeChange = (val) => {
    setExecutorType(val);
    setExecutorId(null);
  };

  const handleOrgChange = (val) => {
    setOrgId(val);
    setExecutorId(null);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="caption" color="text.secondary">
          Loading organizations...
        </Typography>
      </Box>
    );
  }

  const showSecondary = executorType !== 'organization';

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, fontSize: '0.82rem' }}>
        Who will handle this goal?
      </Typography>
      {/* Executor Type */}
      <FormControl
        size="small"
        fullWidth
        sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      >
        <InputLabel>Executor</InputLabel>
        <Select
          label="Executor"
          value={executorType}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          {EXECUTOR_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <MenuItem key={t.value} value={t.value}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AppIcon fallback={Icon} sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {t.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                    >
                      {t.hint}
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
      {/* Organization picker — always shown */}
      <FormControl
        size="small"
        fullWidth
        sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      >
        <InputLabel>Organization</InputLabel>
        <Select
          label="Organization"
          value={orgId || ''}
          onChange={(e) => handleOrgChange(e.target.value || null)}
        >
          <MenuItem value="">
            <Typography variant="body2" color="text.secondary">
              Select organization
            </Typography>
          </MenuItem>
          {orgs.map((org) => (
            <MenuItem key={org.id} value={org.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AppIcon
                  name="CorporateFareOutlined"
                  fallback={CorporateFareOutlinedIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
                <Typography variant="body2">{org.name}</Typography>
                {org.consilium_id && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto' }}>
                    has consilium
                  </Typography>
                )}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {orgs.length === 0 && (
        <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mb: 1 }}>
          No organizations found. Create one in the Organizations page first.
        </Typography>
      )}
      {/* Secondary picker — conditional */}
      <Collapse in={showSecondary && !!orgId}>
        {executorType === 'consilium' && (
          <FormControl
            size="small"
            fullWidth
            sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          >
            <InputLabel>Consilium Board</InputLabel>
            <Select
              label="Consilium Board"
              value={conciliumId || ''}
              onChange={(e) => {
                setConciliumId(e.target.value || null);
                setExecutorId(e.target.value || null);
              }}
            >
              <MenuItem value="">
                <Typography variant="body2" color="text.secondary">
                  Select board
                </Typography>
              </MenuItem>
              {boards.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AppIcon
                      name="GavelOutlined"
                      fallback={GavelOutlinedIcon}
                      sx={{ fontSize: 16, color: 'text.secondary' }}
                    />
                    <Typography variant="body2">{b.name}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {executorType === 'team' && (
          <FormControl
            size="small"
            fullWidth
            sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          >
            <InputLabel>Team</InputLabel>
            <Select
              label="Team"
              value={executorId || ''}
              onChange={(e) => setExecutorId(e.target.value || null)}
            >
              <MenuItem value="">
                <Typography variant="body2" color="text.secondary">
                  Select team
                </Typography>
              </MenuItem>
              {orgTeams.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AppIcon
                      name="GroupsOutlined"
                      fallback={GroupsOutlinedIcon}
                      sx={{ fontSize: 16, color: 'text.secondary' }}
                    />
                    <Typography variant="body2">{t.name}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {executorType === 'agent' && (
          <FormControl
            size="small"
            fullWidth
            sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          >
            <InputLabel>Agent</InputLabel>
            <Select
              label="Agent"
              value={executorId || ''}
              onChange={(e) => setExecutorId(e.target.value || null)}
            >
              <MenuItem value="">
                <Typography variant="body2" color="text.secondary">
                  Select agent
                </Typography>
              </MenuItem>
              {orgAgents.map((a) => (
                <MenuItem key={a.id || a.agent_id} value={a.id || a.agent_id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AppIcon
                      name="SmartToyOutlined"
                      fallback={SmartToyOutlinedIcon}
                      sx={{ fontSize: 16, color: 'text.secondary' }}
                    />
                    <Typography variant="body2">{a.role || a.name || a.agent_id}</Typography>
                    {a.category && (
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {a.category}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Collapse>
    </Box>
  );
}
