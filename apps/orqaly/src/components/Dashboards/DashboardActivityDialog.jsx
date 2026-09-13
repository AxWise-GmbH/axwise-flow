import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Chip,
  alpha,
  keyframes,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import HistoryIcon from '@mui/icons-material/History';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EmptyState from '../Common/EmptyState';
import { listDashboards } from '../../services/dashboardService';
import { relativeTime, VisibilityChip } from './dashboardListHelpers';

import AppIcon from '../icons/AppIcon';

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/**
 * "Recent activity" panel — v1 sources from saved_dashboards.updated_at
 * (no separate audit table). Shows last 30 entries, newest first, with a
 * heuristic: if updated_at ≈ created_at then "created", else "edited".
 */
export default function DashboardActivityDialog({ open, onClose }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    listDashboards()
      .then((data) => {
        if (!alive) return;
        const merged = [
          ...(data?.owned || []).map((d) => ({ ...d, source: 'owned' })),
          ...(data?.shared || []).map((d) => ({ ...d, source: 'shared' })),
        ];
        merged.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        setItems(merged.slice(0, 30));
      })
      .catch((err) => alive && setError(err?.message || 'Failed to load activity'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open]);

  const events = useMemo(
    () =>
      items.map((d) => {
        const created = new Date(d.created_at).getTime();
        const updated = new Date(d.updated_at).getTime();
        const isCreate = Math.abs(updated - created) < 5_000; // within 5s = created event
        return {
          id: d.id,
          title: d.title,
          visibility: d.visibility,
          at: d.updated_at,
          kind: isCreate ? 'created' : 'edited',
          source: d.source,
        };
      }),
    [items]
  );

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Activity log"
      subtitle="Recent dashboard edits across your library"
      icon={HistoryIcon}
      iconVariant="info"
      paperSx={{ borderRadius: isMobile ? 0 : 3, overflow: 'hidden' }}
      contentSx={{ p: { xs: 1.5, sm: 2 }, minHeight: 320 }}
      hideFooter
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
          {error}
        </Typography>
      ) : events.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No recent activity"
          description="When you create or edit a dashboard, the change shows up here."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {events.map((e, i) => {
            const Icon = e.kind === 'created' ? AddCircleOutlineIcon : EditOutlinedIcon;
            const color =
              e.kind === 'created' ? theme.palette.success.main : theme.palette.primary.main;
            return (
              <Box
                key={e.id}
                onClick={() => {
                  navigate(`/dashboards/${e.id}`);
                  onClose();
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  px: 1.25,
                  py: 1,
                  borderRadius: 2,
                  cursor: 'pointer',
                  animation: `${fadeInUp} 0.24s ease-out`,
                  animationDelay: `${Math.min(i, 10) * 30}ms`,
                  animationFillMode: 'both',
                  '&:hover': {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.05),
                  },
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(color, 0.14),
                    color,
                    flexShrink: 0,
                  }}
                >
                  <AppIcon fallback={Icon} sx={{ fontSize: 16 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    You {e.kind} <strong>"{e.title}"</strong>
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary">
                      {relativeTime(e.at)}
                    </Typography>
                    <Box
                      sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled' }}
                    />
                    <VisibilityChip value={e.visibility} />
                    {e.source === 'shared' && (
                      <Chip
                        size="small"
                        label="shared"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                      />
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </FormDialog>
  );
}
