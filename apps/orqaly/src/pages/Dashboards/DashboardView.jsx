import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, CircularProgress, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import ShareIcon from '@mui/icons-material/Share';
import ScheduleIcon from '@mui/icons-material/Schedule';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import DashboardGrid from '../../components/Dashboards/DashboardGrid';
import DashboardFilterBar from '../../components/Dashboards/DashboardFilterBar';
import ShareDialog from '../../components/Dashboards/ShareDialog';
import ScheduleDialog from '../../components/Dashboards/ScheduleDialog';
import useDashboardData from '../../hooks/useDashboardData';
import { getDashboard } from '../../services/dashboardService';

import AppIcon from '../../components/icons/AppIcon';

/**
 * Read-only dashboard renderer.
 */
export default function DashboardView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgFilter = searchParams.get('org_id') || '';
  const theme = useTheme();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [globalFilters, setGlobalFilters] = useState({
    time_range: { kind: 'last_n_days', value: 30 },
  });
  const [crossFilter, setCrossFilter] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getDashboard(id)
      .then((d) => {
        if (!alive) return;
        setDashboard(d);
        if (d?.config?.global_filters) {
          setGlobalFilters({
            time_range: { kind: 'last_n_days', value: 30 },
            ...d.config.global_filters,
          });
        }
      })
      .catch((e) => alive && setError(e.message || 'Failed to load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!orgFilter) return;
    setGlobalFilters((prev) => ({ ...prev, org_id: orgFilter }));
  }, [orgFilter]);

  const effectiveFilters = crossFilter
    ? { ...globalFilters, [crossFilter.dim]: crossFilter.value }
    : globalFilters;

  const {
    resultsById,
    loading: dataLoading,
    refresh,
  } = useDashboardData(dashboard?.config?.blocks || [], effectiveFilters);

  const handleSegmentClick = useCallback(({ dim, value }) => {
    if (!dim) return;
    setCrossFilter({ dim, value });
  }, []);

  // Click-through: a row whose dim looks like an entity id navigates to that entity.
  const handleRowClick = useCallback(
    ({ dim, value }) => {
      const routes = {
        goal_id: (v) => `/goals/${v}`,
        business_id: (v) => `/businesses?selected=${encodeURIComponent(v)}`,
        partner_id: (v) => `/partners/${v}`,
        agent_id: (v) => `/agent-hub?agent=${encodeURIComponent(v)}`,
      };
      const build = routes[dim];
      if (build && value) {
        navigate(build(value));
        return;
      }
      handleSegmentClick({ dim, value });
    },
    [navigate, handleSegmentClick]
  );

  if (loading) {
    return (
      <PageLayout showTitleBlock={false}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      </PageLayout>
    );
  }
  if (!dashboard) {
    return (
      <PageLayout showTitleBlock={false}>
        <EmptyState
          title="Couldn't load dashboard"
          description={error || 'Dashboard not found.'}
          actionLabel="Back to list"
          onAction={() => navigate('/dashboards')}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={dashboard.title} subtitle={dashboard.description || ' '}>
      <BentoCard
        title={dashboard.title}
        subtitle={`${dashboard.config?.blocks?.length || 0} blocks · ${
          dashboard.can_edit ? 'Click "Edit" to drag, resize, or reconfigure blocks' : 'View only'
        }`}
        icon={DashboardCustomizeIcon}
        iconColor={theme.palette.primary.main}
        action={
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            <Button
              size="small"
              startIcon={<AppIcon name="ArrowBack" fallback={ArrowBackIcon} />}
              onClick={() => navigate('/dashboards')}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Back
            </Button>
            {dashboard.can_edit && (
              <Button
                size="small"
                startIcon={<AppIcon name="Share" fallback={ShareIcon} />}
                onClick={() => setShareOpen(true)}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Share
              </Button>
            )}
            {dashboard.can_edit && (
              <Button
                size="small"
                startIcon={<AppIcon name="Schedule" fallback={ScheduleIcon} />}
                onClick={() => setScheduleOpen(true)}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Schedule
              </Button>
            )}
            {dashboard.can_edit && (
              <Button
                size="small"
                variant="contained"
                startIcon={<AppIcon name="Edit" fallback={EditIcon} />}
                onClick={() => navigate(`/dashboards/${id}/edit`)}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Edit
              </Button>
            )}
          </Box>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <DashboardFilterBar
            filters={globalFilters}
            onChange={setGlobalFilters}
            onRefresh={refresh}
            activeCrossFilter={crossFilter}
            onClearCrossFilter={() => setCrossFilter(null)}
          />
          <DashboardGrid
            blocks={dashboard.config?.blocks || []}
            layout={dashboard.config?.layout || []}
            resultsById={resultsById}
            loading={dataLoading}
            editable={false}
            onSegmentClick={handleSegmentClick}
            onRowClick={handleRowClick}
          />
        </Box>
      </BentoCard>
      <ShareDialog open={shareOpen} dashboardId={id} onClose={() => setShareOpen(false)} />
      <ScheduleDialog open={scheduleOpen} dashboardId={id} onClose={() => setScheduleOpen(false)} />
    </PageLayout>
  );
}
