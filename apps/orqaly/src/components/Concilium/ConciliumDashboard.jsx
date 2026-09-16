/**
 * ConciliumDashboard — Top-level component with sub-tabs for the Consilium module.
 * Replaces the monolithic ConciliumTab in AgentHub.
 */
import { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import TuneIcon from '@mui/icons-material/Tune';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import BoardList from './BoardList';
import MemberList from './MemberList';
import CriteriaPanel from './CriteriaPanel';
import AgentLifecyclePanel from './AgentLifecyclePanel';
import TeamPanel from './TeamPanel';
import AnalyticsDashboard from './AnalyticsDashboard';
import SecurityEventsPanel from './SecurityEventsPanel';

import AppIcon from '../icons/AppIcon';

const SUB_TABS = [
  {
    key: 'boards',
    label: 'Boards',
    icon: <AppIcon name="GroupsOutlined" fallback={GroupsOutlinedIcon} sx={{ fontSize: 18 }} />,
  },
  {
    key: 'members',
    label: 'Members',
    icon: <AppIcon name="PersonOutline" fallback={PersonOutlineIcon} sx={{ fontSize: 18 }} />,
  },
  {
    key: 'criteria',
    label: 'Criteria',
    icon: <AppIcon name="Tune" fallback={TuneIcon} sx={{ fontSize: 18 }} />,
  },
  {
    key: 'agents',
    label: 'Agents',
    icon: <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} sx={{ fontSize: 18 }} />,
  },
  {
    key: 'teams',
    label: 'Teams',
    icon: (
      <AppIcon name="Diversity3Outlined" fallback={Diversity3OutlinedIcon} sx={{ fontSize: 18 }} />
    ),
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: <AppIcon name="Timeline" fallback={TimelineIcon} sx={{ fontSize: 18 }} />,
  },
  {
    key: 'security',
    label: 'Security',
    icon: <AppIcon name="ShieldOutlined" fallback={ShieldOutlinedIcon} sx={{ fontSize: 18 }} />,
  },
];

export default function ConciliumDashboard({
  concilium,
  addConcilium,
  editConcilium,
  removeConcilium,
  jobs,
  user,
  theme,
  isDark,
  openActivityLog,
}) {
  const [subTab, setSubTab] = useState('boards');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 1 }}>
        <Tabs
          value={subTab}
          onChange={(_, v) => setSubTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              py: 0.5,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
            },
          }}
        >
          {SUB_TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} icon={t.icon} iconPosition="start" />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {subTab === 'boards' && (
          <BoardList
            concilium={concilium}
            addConcilium={addConcilium}
            editConcilium={editConcilium}
            removeConcilium={removeConcilium}
            jobs={jobs}
            user={user}
            theme={theme}
            isDark={isDark}
            openActivityLog={openActivityLog}
          />
        )}
        {subTab === 'members' && <MemberList concilium={concilium} theme={theme} isDark={isDark} />}
        {subTab === 'criteria' && (
          <CriteriaPanel concilium={concilium} theme={theme} isDark={isDark} />
        )}
        {subTab === 'agents' && <AgentLifecyclePanel theme={theme} isDark={isDark} />}
        {subTab === 'teams' && <TeamPanel theme={theme} isDark={isDark} />}
        {subTab === 'analytics' && <AnalyticsDashboard theme={theme} isDark={isDark} />}
        {subTab === 'security' && <SecurityEventsPanel theme={theme} isDark={isDark} />}
      </Box>
    </Box>
  );
}
