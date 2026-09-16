/**
 * Side panels for the Consilium topology canvas: version history (restorable
 * snapshots) and the per-action activity feed. Both are lazy-loading MUI drawers.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Chip,
  Divider,
  CircularProgress,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';

import AppIcon from '../../icons/AppIcon';
import { listVersions, listActivity } from '../../../services/consiliumTopologyService';

function formatWhen(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

const ACTION_LABELS = {
  seed: 'Seeded from database',
  save: 'Saved',
  reseed: 'Re-seeded from database',
  restore: 'Restored a version',
  node_add: 'Added a node',
  node_move: 'Moved a node',
  node_delete: 'Deleted a node',
  edge_connect: 'Connected nodes',
  edge_disconnect: 'Disconnected nodes',
};

export function VersionsPanel({ open, onClose, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { versions: v } = await listVersions();
      setVersions(v || []);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 320, p: 2 }} role="region" aria-label="Version history">
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
          Version history
        </Typography>
        <Divider sx={{ mb: 1 }} />
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : versions.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
            No versions saved yet.
          </Typography>
        ) : (
          <List dense>
            {versions.map((v) => (
              <ListItem
                key={v.id || v.version}
                secondaryAction={
                  <Button
                    size="small"
                    startIcon={<AppIcon fallback={RestoreIcon} sx={{ fontSize: 16 }} />}
                    onClick={() => onRestore?.(v.version)}
                    sx={{ textTransform: 'none' }}
                  >
                    Restore
                  </Button>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={`v${v.version}`}
                        size="small"
                        sx={{ height: 20, fontWeight: 700 }}
                      />
                      <Typography variant="body2" noWrap>
                        {v.label || 'save'}
                      </Typography>
                    </Box>
                  }
                  secondary={formatWhen(v.created_at)}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
}

export function ActivityPanel({ open, onClose }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { activity: a } = await listActivity(150);
      setActivity(a || []);
    } catch {
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 340, p: 2 }} role="region" aria-label="Activity feed">
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
          Activity
        </Typography>
        <Divider sx={{ mb: 1 }} />
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : activity.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
            No activity recorded yet.
          </Typography>
        ) : (
          <List dense>
            {activity.map((a) => (
              <ListItem key={a.id} disableGutters>
                <ListItemText
                  primary={ACTION_LABELS[a.action] || a.action}
                  secondary={formatWhen(a.created_at)}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
}
