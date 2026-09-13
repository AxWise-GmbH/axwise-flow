/**
 * OrgDetailDrawer — slide-in panel: Overview, Results, Teams, Operations, Finances, Governance.
 */
import { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Chip,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { getOrgFinances, getOrgActivity } from '../../services/organizationService';
import { ORG_TAB, ORG_TAB_LABELS } from './drawer/orgDrawerConstants';
import OrgOverviewTab from './drawer/OrgOverviewTab';
import OrgResultsTab from './drawer/OrgResultsTab';
import OrgTeamsTab from './drawer/OrgTeamsTab';
import OrgOperationsTab from './drawer/OrgOperationsTab';
import OrgFinancesTab from './drawer/OrgFinancesTab';
import OrgGovernanceTab from './drawer/OrgGovernanceTab';

import AppIcon from '../icons/AppIcon';

const DRAWER_WIDTH = 620;

const EMPTY_FINANCES = {
  invested: 0,
  returned: 0,
  expenses: 0,
  net_profit: 0,
  roi: 0,
  token_spend: 0,
  ad_spend: 0,
  service_cost: 0,
  infrastructure: 0,
};

const EMPTY_ACTIVITY = {
  items: [],
  counts: {
    tasks: 0,
    workflows: 0,
    knowledge_base: 0,
    agents: 0,
    teams: 0,
    completed_goals: 0,
    active_goals: 0,
    dashboards: 0,
  },
  previews: { workflows: [], dashboards: [] },
  scope_ids: [],
};

export default function OrgDetailDrawer({
  open,
  onClose,
  org,
  orgTeamMap,
  orgAgentMap,
  allTeams,
  allAgents,
  concilium,
  orgs,
  getTypeColor,
  getTypeLabel,
  onAttachConsilium,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tab, setTab] = useState(ORG_TAB.OVERVIEW);
  const [finances, setFinances] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loadingFinances, setLoadingFinances] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const orgId = org?.id;
  const typeColor = org ? getTypeColor(org.org_type) : '#888';

  useEffect(() => {
    if (!open || !orgId) return;
    setTab(ORG_TAB.OVERVIEW);
    setLoadingFinances(true);
    getOrgFinances(orgId)
      .then((data) => setFinances(data[orgId] || EMPTY_FINANCES))
      .catch(() => setFinances(EMPTY_FINANCES))
      .finally(() => setLoadingFinances(false));

    setLoadingActivity(true);
    getOrgActivity(orgId)
      .then((data) => setActivity(data))
      .catch(() => setActivity(EMPTY_ACTIVITY))
      .finally(() => setLoadingActivity(false));
  }, [open, orgId]);

  const teamIds = orgTeamMap?.[orgId] || [];
  const agentIds = orgAgentMap?.[orgId] || [];
  const teams = teamIds.map((tid) => allTeams.find((t) => t.id === tid)).filter(Boolean);
  const agents = agentIds
    .map((aid) => allAgents.find((a) => (a.agent_id || a.id) === aid))
    .filter(Boolean);
  const parentOrg = org?.parent_id ? orgs.find((o) => o.id === org.parent_id) : null;
  const consiliumBoard = org?.consilium_id
    ? (concilium || []).find((c) => c.id === org.consilium_id)
    : null;
  const childOrgs = orgs.filter((o) => o.parent_id === orgId);

  if (!org) return null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: isMobile ? '100%' : DRAWER_WIDTH, bgcolor: 'background.default' } },
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            bgcolor: alpha(typeColor, 0.12),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AppIcon
            name="CorporateFareOutlined"
            fallback={CorporateFareOutlinedIcon}
            sx={{ color: typeColor, fontSize: 24 }}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap>
            {org.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip
              label={getTypeLabel(org.org_type)}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 700,
                bgcolor: alpha(typeColor, 0.12),
                color: typeColor,
              }}
            />
            {org.industry && (
              <Chip
                label={org.industry}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.6rem' }}
              />
            )}
            {org.is_active ? (
              <Chip
                icon={
                  <AppIcon
                    name="CheckCircleOutline"
                    fallback={CheckCircleOutlineIcon}
                    sx={{ fontSize: '12px !important' }}
                  />
                }
                label="Active"
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.6rem' }}
              />
            ) : (
              <Chip
                icon={
                  <AppIcon
                    name="CancelOutlined"
                    fallback={CancelOutlinedIcon}
                    sx={{ fontSize: '12px !important' }}
                  />
                }
                label="Inactive"
                size="small"
                sx={{ height: 20, fontSize: '0.6rem' }}
              />
            )}
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          px: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 40,
          '& .MuiTab-root': {
            minHeight: 40,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.78rem',
          },
        }}
      >
        {ORG_TAB_LABELS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>
      <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2 }}>
        {tab === ORG_TAB.OVERVIEW && (
          <OrgOverviewTab
            org={org}
            parentOrg={parentOrg}
            consiliumBoard={consiliumBoard}
            finances={finances}
            counts={activity?.counts || {}}
            teamsCount={teams.length}
            loadingFinances={loadingFinances}
            onTabChange={setTab}
            concilium={concilium}
            onAttachConsilium={onAttachConsilium}
          />
        )}
        {tab === ORG_TAB.RESULTS && <OrgResultsTab orgId={orgId} />}
        {tab === ORG_TAB.TEAMS && (
          <OrgTeamsTab
            org={org}
            teams={teams}
            agents={agents}
            childOrgs={childOrgs}
            concilium={concilium}
            orgTeamMap={orgTeamMap}
            orgAgentMap={orgAgentMap}
            allTeams={allTeams}
            allAgents={allAgents}
            getTypeColor={getTypeColor}
            getTypeLabel={getTypeLabel}
          />
        )}
        {tab === ORG_TAB.OPERATIONS && (
          <OrgOperationsTab orgId={orgId} activity={activity} loadingActivity={loadingActivity} />
        )}
        {tab === ORG_TAB.FINANCES && (
          <OrgFinancesTab finances={finances} loadingFinances={loadingFinances} />
        )}
        {tab === ORG_TAB.GOVERNANCE && (
          <OrgGovernanceTab
            org={org}
            parentOrg={parentOrg}
            consiliumBoard={consiliumBoard}
            childOrgs={childOrgs}
            getTypeColor={getTypeColor}
            getTypeLabel={getTypeLabel}
            concilium={concilium}
            onAttachConsilium={onAttachConsilium}
          />
        )}
      </Box>
    </Drawer>
  );
}
