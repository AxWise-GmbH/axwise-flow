/**
 * OrgAssignDialog — assign teams, agents, parent org, or consilium to an organization.
 * Props: { open, onClose, orgId, orgName, mode: 'team'|'agent'|'parent'|'consilium', currentIds, externalItems, onSave }
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Checkbox,
  TextField,
  InputAdornment,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import SearchIcon from '@mui/icons-material/Search';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import LinkIcon from '@mui/icons-material/Link';
import { getAgents, syncAgentsFromSupabase } from '../../services/agentHubService';
import { getAllTeams, getAllAgentTeams } from '../../services/conciliumTeamsService';
import { getAllTeams as getJobPoolTeams } from '../../services/teamService';

import AppIcon from '../icons/AppIcon';

const MODE_CONFIG = {
  team: { label: 'Teams', icon: GroupsOutlinedIcon, color: 'primary', single: false },
  agent: { label: 'Agents', icon: SmartToyOutlinedIcon, color: 'success', single: false },
  parent: { label: 'Parent Org', icon: AccountTreeOutlinedIcon, color: 'warning', single: true },
  consilium: { label: 'Consilium', icon: LinkIcon, color: 'info', single: true },
};

export default function OrgAssignDialog({
  open,
  onClose,
  orgId,
  orgName,
  mode = 'team',
  currentIds = [],
  externalItems,
  onSave,
}) {
  const theme = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.team;
  const isTeam = mode === 'team';
  const isAgent = mode === 'agent';
  const singleSelect = cfg.single;
  const accentColor = theme.palette[cfg.color]?.main || theme.palette.primary.main;

  // Load available items
  useEffect(() => {
    if (!open) return;
    setSelected([...currentIds]);
    setSearch('');

    // For parent/consilium, items come from parent component
    if (externalItems) {
      setItems(externalItems);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        if (isTeam) {
          const [govTeams, agentTeams, jobTeams] = await Promise.all([
            getAllTeams().catch(() => []),
            getAllAgentTeams().catch(() => []),
            getJobPoolTeams().catch(() => []),
          ]);
          const seen = new Set();
          const merged = [...govTeams, ...agentTeams, ...jobTeams].filter((t) => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });
          setItems(merged);
        } else if (isAgent) {
          await syncAgentsFromSupabase();
          setItems(getAgents());
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, mode, isTeam, isAgent, currentIds, externalItems]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => {
      const name = isAgent ? item.role || item.name || '' : item.name || '';
      return name.toLowerCase().includes(q);
    });
  }, [items, search, isAgent]);

  const getItemId = (item) => (isAgent ? item.agent_id || item.id : item.id);
  const getItemLabel = (item) => (isAgent ? item.role || item.name || item.agent_id : item.name);

  const toggle = (id) => {
    if (singleSelect) {
      setSelected((prev) => (prev.includes(id) ? [] : [id]));
    } else {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selected);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const Icon = cfg.icon;
  const searchPlaceholder = `Search ${cfg.label.toLowerCase()}...`;
  const emptyLabel = `No ${cfg.label.toLowerCase()} found`;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title={singleSelect ? `Set ${cfg.label}` : `Assign ${cfg.label}`}
      subtitle={orgName || undefined}
      icon={Icon}
      iconVariant={cfg.color}
      primaryLabel={saving ? 'Saving...' : 'Save'}
      onPrimary={handleSave}
      primaryLoading={saving}
      contentSx={{ pt: 1, pb: 1 }}
    >
      <TextField
        size="small"
        fullWidth
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 16 }} />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 1.5, ...FORM_FIELD_SX }}
      />
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {!loading && filtered.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
          {emptyLabel}
        </Typography>
      )}
      {!loading && filtered.length > 0 && (
        <Box sx={{ maxHeight: 280, overflowY: 'auto', pr: 0.5 }}>
          {filtered.map((item) => {
            const id = getItemId(item);
            const label = getItemLabel(item);
            const memberCount = item.members?.length ?? item.agents?.length ?? 0;
            const plural = memberCount === 1 ? '' : 's';
            let sub = '';
            if (isTeam) sub = `${memberCount} member${plural}`;
            else if (isAgent) sub = item.category || item.connection_type || '';
            const isChecked = selected.includes(id);
            return (
              <Box
                key={id}
                onClick={() => toggle(id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  borderRadius: 1.5,
                  cursor: 'pointer',
                  bgcolor: isChecked ? alpha(accentColor, 0.08) : 'transparent',
                  '&:hover': { bgcolor: alpha(accentColor, 0.06) },
                  mb: 0.25,
                  border: '1px solid',
                  borderColor: isChecked ? alpha(accentColor, 0.3) : 'transparent',
                }}
              >
                <Checkbox
                  checked={isChecked}
                  onChange={() => toggle(id)}
                  size="small"
                  sx={{ p: 0, color: accentColor, '&.Mui-checked': { color: accentColor } }}
                  onClick={(e) => e.stopPropagation()}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: isChecked ? 600 : 400 }} noWrap>
                    {label}
                  </Typography>
                  {sub && (
                    <Typography variant="caption" color="text.secondary">
                      {sub}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
      {selected.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            flexWrap: 'wrap',
            mt: 1.5,
            pt: 1.5,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mb: 0.5 }}>
            Selected{!singleSelect && ` (${selected.length})`}:
          </Typography>
          {selected.map((id) => {
            const item = items.find((it) => getItemId(it) === id);
            const label = item ? getItemLabel(item) : id;
            return (
              <Chip
                key={id}
                label={label}
                size="small"
                onDelete={() => toggle(id)}
                sx={{ fontSize: '0.7rem', bgcolor: alpha(accentColor, 0.1), color: accentColor }}
              />
            );
          })}
        </Box>
      )}
    </FormDialog>
  );
}
