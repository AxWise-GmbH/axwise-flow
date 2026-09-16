import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Checkbox,
  CircularProgress,
  Divider,
} from '@mui/material';
import { listOrganizations } from '../../services/organizationService';
import { reconcileBoardOrgs } from './reconcileBoardOrgs';

/**
 * Link a Consilium board to one or more organizations. The org→board link is
 * stored one-way on organizations.consilium_id, so this dialog just sets/clears
 * that field for the orgs the user checks. Orgs linked to a *different* board
 * are left untouched.
 *
 * Props: { open, board: { id, name }, onClose, onChanged }
 */
export default function BoardOrgLinkDialog({ open, board, onClose, onChanged }) {
  const [orgs, setOrgs] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !board) return;
    let cancelled = false;
    setLoading(true);
    listOrganizations()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setOrgs(list);
        setChecked(new Set(list.filter((o) => o.consilium_id === board.id).map((o) => o.id)));
      })
      .catch(() => {
        if (!cancelled) setOrgs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, board]);

  const toggle = useCallback((id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!board) return;
    setSaving(true);
    try {
      await reconcileBoardOrgs(board.id, checked, orgs);
      onChanged?.();
      onClose?.();
    } catch {
      /* leave dialog open so the user can retry */
    } finally {
      setSaving(false);
    }
  }, [board, orgs, checked, onChanged, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Link organizations
        <Typography
          variant="caption"
          sx={{ display: 'block', color: 'text.secondary', fontWeight: 500 }}
        >
          Choose which organizations “{board?.name || 'this board'}” governs.
        </Typography>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={28} />
          </Box>
        ) : orgs.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No organizations yet.
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {orgs.map((o) => {
              const otherBoard = o.consilium_id && o.consilium_id !== board?.id;
              return (
                <ListItemButton key={o.id} onClick={() => toggle(o.id)} disabled={saving}>
                  <Checkbox edge="start" checked={checked.has(o.id)} tabIndex={-1} disableRipple />
                  <ListItemText
                    primary={o.name}
                    secondary={otherBoard ? 'Linked to another board' : o.org_type || undefined}
                    primaryTypographyProps={{ fontWeight: 600, fontSize: '0.85rem' }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none', fontWeight: 600 }}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || loading}
          variant="contained"
          disableElevation
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
