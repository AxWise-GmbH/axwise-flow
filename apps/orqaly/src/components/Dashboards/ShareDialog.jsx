import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Switch,
  Chip,
  CircularProgress,
  Stack,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import FormDialog from '../Common/FormDialog';
import {
  listShareGroups,
  listDashboardShares,
  shareDashboard,
  unshareDashboard,
} from '../../services/dashboardService';

/**
 * Per-dashboard sharing UI. Lets the owner toggle which share groups the
 * dashboard is visible to and whether they have edit permission.
 */
export default function ShareDialog({ open, dashboardId, onClose }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [groups, setGroups] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sharedMap = new Map(shares.map((s) => [s.group_id, s]));

  const load = useCallback(async () => {
    if (!dashboardId) return;
    setLoading(true);
    setError('');
    try {
      const [g, s] = await Promise.all([listShareGroups(), listDashboardShares(dashboardId)]);
      setGroups(g.owned || []);
      setShares(s || []);
    } catch (err) {
      setError(err.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleToggleShare = async (groupId, currentlyShared) => {
    try {
      if (currentlyShared) {
        await unshareDashboard(dashboardId, groupId);
        setShares((prev) => prev.filter((s) => s.group_id !== groupId));
      } else {
        await shareDashboard(dashboardId, groupId, false);
        const group = groups.find((g) => g.id === groupId);
        setShares((prev) => [...prev, { group_id: groupId, name: group?.name, can_edit: false }]);
      }
    } catch (err) {
      setError(err.message || 'Failed to update share');
    }
  };

  const handleToggleEdit = async (groupId, nextCanEdit) => {
    try {
      await shareDashboard(dashboardId, groupId, nextCanEdit);
      setShares((prev) =>
        prev.map((s) => (s.group_id === groupId ? { ...s, can_edit: nextCanEdit } : s))
      );
    } catch (err) {
      setError(err.message || 'Failed to update permission');
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Share dashboard"
      icon={GroupIcon}
      paperSx={{ borderRadius: isMobile ? 0 : 3, m: { xs: 0, sm: 4 } }}
      contentSx={{ pt: 2, px: { xs: 1.75, sm: 3 } }}
      hideCancel
      primaryLabel="Done"
      onPrimary={onClose}
    >
      {loading ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
          {error}
        </Typography>
      ) : groups.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            No share groups yet
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Create a group in Settings → Share groups, then return here to share.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            href="/settings/groups"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Open Share groups
          </Button>
        </Box>
      ) : (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Toggle each group to share. Set "Can edit" to allow group members to modify the
            dashboard.
          </Typography>
          {groups.map((g) => {
            const shared = sharedMap.has(g.id);
            const canEdit = sharedMap.get(g.id)?.can_edit;
            return (
              <Box
                key={g.id}
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: shared ? alpha(theme.palette.primary.main, 0.4) : 'divider',
                  bgcolor: shared ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {g.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {g.member_count || 0} members
                  </Typography>
                </Box>
                {shared && (
                  <Chip
                    size="small"
                    label={canEdit ? 'Can edit' : 'View only'}
                    onClick={() => handleToggleEdit(g.id, !canEdit)}
                    color={canEdit ? 'secondary' : 'default'}
                    variant={canEdit ? 'filled' : 'outlined'}
                    sx={{ fontWeight: 600, fontSize: '0.65rem', cursor: 'pointer' }}
                  />
                )}
                <Switch
                  checked={shared}
                  onChange={() => handleToggleShare(g.id, shared)}
                  color="primary"
                />
              </Box>
            );
          })}
        </Stack>
      )}
    </FormDialog>
  );
}
