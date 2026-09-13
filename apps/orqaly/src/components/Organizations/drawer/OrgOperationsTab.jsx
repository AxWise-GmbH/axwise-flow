import { useNavigate } from 'react-router-dom';
import { Box, Typography, Paper, CircularProgress, Divider, alpha, useTheme } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import OrgOperationsSection from './OrgOperationsSection';
import ActivityItem from './ActivityItem';
import { buildOrgDeepLink } from './orgDrawerConstants';

import AppIcon from '../../icons/AppIcon';

export default function OrgOperationsTab({ orgId, activity, loadingActivity }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const counts = activity?.counts || {};
  const items = activity?.items || [];
  const previews = activity?.previews || {};
  const workflowItems = previews.workflows || [];
  const dashboardItems = previews.dashboards || [];

  if (loadingActivity) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <>
      <OrgOperationsSection
        title="Workflows"
        count={counts.workflows ?? 0}
        countLabel="workflows"
        onViewAll={() => navigate(buildOrgDeepLink('/workflow', orgId))}
        emptyMessage={
          workflowItems.length === 0 ? 'No workflows linked to this organization yet' : undefined
        }
      >
        {workflowItems.map((wf) => (
          <Paper
            key={wf.id}
            elevation={0}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              mb: 0.75,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <AppIcon
              name="AccountTreeOutlined"
              fallback={AccountTreeOutlinedIcon}
              sx={{ fontSize: 18, color: '#8B5CF6' }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }} noWrap>
              {wf.name || wf.title}
            </Typography>
          </Paper>
        ))}
      </OrgOperationsSection>
      <Divider sx={{ mb: 2 }} />
      <OrgOperationsSection
        title="Monitoring"
        count={counts.dashboards ?? 0}
        countLabel="dashboards"
        onViewAll={() => navigate(buildOrgDeepLink('/dashboards', orgId))}
        emptyMessage={
          dashboardItems.length === 0
            ? 'No dashboards yet — create one to monitor this organization'
            : undefined
        }
      >
        {dashboardItems.map((d) => (
          <Paper
            key={d.id}
            elevation={0}
            onClick={() => navigate(buildOrgDeepLink(`/dashboards/${d.id}`, orgId))}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              mb: 0.75,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.35) },
            }}
          >
            <AppIcon
              name="DashboardCustomize"
              fallback={DashboardCustomizeIcon}
              sx={{ fontSize: 18, color: theme.palette.primary.main }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }} noWrap>
                {d.title}
              </Typography>
              {d.description && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {d.description}
                </Typography>
              )}
            </Box>
          </Paper>
        ))}
      </OrgOperationsSection>
      <Divider sx={{ mb: 2 }} />
      <OrgOperationsSection
        title="Activity"
        count={items.length}
        countLabel="recent events"
        onViewAll={() => navigate(buildOrgDeepLink('/audit-log', orgId))}
        emptyMessage="No activity recorded yet"
      >
        {items.slice(0, 5).map((item) => (
          <ActivityItem key={item.id || item.created_at} item={item} />
        ))}
      </OrgOperationsSection>
    </>
  );
}
