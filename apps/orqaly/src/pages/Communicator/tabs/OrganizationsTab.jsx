/**
 * OrganizationsTab - unified org communication hub (timeline + command dispatch).
 */
import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Chip,
  Alert,
  Skeleton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItemButton,
  ListItemText,
  InputAdornment,
  alpha,
  useTheme,
} from '@mui/material';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import EmptyState from '../../../components/Common/EmptyState';
import { useOrgCommander } from '../../../hooks/useOrgCommander';

import AppIcon from '../../../components/icons/AppIcon';

const SOURCE_LABELS = {
  all: 'All',
  goal_history: 'Goals',
  activity: 'Activity',
  consilium: 'Consilium',
  command: 'Commands',
};

export default function OrganizationsTab({ onNavigate }) {
  const theme = useTheme();
  const commander = useOrgCommander();
  const [search, setSearch] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const [command, setCommand] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  const selectedOrg = commander.orgs.find((o) => o.id === commander.selectedOrgId);

  const filteredOrgs = useMemo(() => {
    if (!orgSearch.trim()) return commander.orgs;
    const q = orgSearch.toLowerCase();
    return commander.orgs.filter((o) => (o.name || '').toLowerCase().includes(q));
  }, [commander.orgs, orgSearch]);

  const filteredEvents = useMemo(() => {
    let list = commander.events;
    if (sourceFilter !== 'all') list = list.filter((e) => e.source === sourceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.title || '').toLowerCase().includes(q) ||
          (e.body || '').toLowerCase().includes(q) ||
          (e.subtitle || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [commander.events, sourceFilter, search]);

  useEffect(() => {
    const first = commander.roster.targets[0];
    if (first) setTargetKey(`${first.type}:${first.id}`);
  }, [commander.selectedOrgId, commander.roster.targets]);

  const target =
    commander.roster.targets.find((t) => `${t.type}:${t.id}` === targetKey) ||
    commander.roster.targets[0];

  async function handleDispatch() {
    if (!commander.selectedOrgId || !target || !command.trim()) return;
    const goalId = await commander.dispatch({
      orgId: commander.selectedOrgId,
      target,
      command,
    });
    if (goalId) setCommand('');
  }

  function handleOpenEvent(evt) {
    const link = evt.deepLink;
    if (!link || !onNavigate) return;
    onNavigate(link);
  }

  if (commander.loadingOrgs) {
    return (
      <Box sx={{ p: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={48} sx={{ mb: 1, borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  if (commander.orgs.length === 0) {
    return (
      <EmptyState
        icon={BusinessOutlinedIcon}
        title="No organizations"
        description="Create an organization on the Organizations page, assign teams and agents, then return here to command and monitor them in one place."
      />
    );
  }

  return (
    <Box
      sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5, minHeight: 420 }}
    >
      {/* Org list */}
      <Paper
        variant="outlined"
        sx={{ width: { md: 220 }, flexShrink: 0, borderRadius: 2.5, overflow: 'hidden' }}
      >
        <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search orgs..."
            value={orgSearch}
            onChange={(e) => setOrgSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 16 }} />
                </InputAdornment>
              ),
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.78rem' } }}
          />
        </Box>
        <List sx={{ maxHeight: 400, overflow: 'auto', p: 0 }}>
          {filteredOrgs.map((o) => (
            <ListItemButton
              key={o.id}
              selected={commander.selectedOrgId === o.id}
              onClick={() => commander.setSelectedOrgId(o.id)}
              sx={{ py: 0.75 }}
            >
              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                    {o.name}
                  </Typography>
                }
                secondary={o.industry || o.org_type || ''}
              />
            </ListItemButton>
          ))}
        </List>
      </Paper>
      {/* Main pane */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {commander.error && (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {commander.error}
          </Alert>
        )}

        {selectedOrg && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {selectedOrg.name}
            </Typography>
            {commander.scope && (
              <Chip
                size="small"
                label={`${commander.scope.goalCount} goals`}
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
            {commander.roster.consilium && (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`Consilium: ${commander.roster.consilium.name}`}
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
            <Button
              size="small"
              startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 14 }} />}
              onClick={commander.refresh}
              sx={{ ml: 'auto', textTransform: 'none' }}
            >
              Refresh
            </Button>
          </Box>
        )}

        {/* Roster summary */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {commander.roster.teams.map((t) => (
            <Chip key={t.id} size="small" label={`Team: ${t.name}`} sx={{ fontSize: '0.65rem' }} />
          ))}
          {commander.roster.agents.slice(0, 6).map((a) => (
            <Chip
              key={a.id || a.agent_id}
              size="small"
              variant="outlined"
              label={a.name || a.agent_id}
              sx={{ fontSize: '0.65rem' }}
            />
          ))}
        </Box>

        {/* Timeline */}
        <Paper variant="outlined" sx={{ flex: 1, borderRadius: 2.5, p: 1.25, minHeight: 200 }}>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
            {Object.entries(SOURCE_LABELS).map(([id, label]) => (
              <Chip
                key={id}
                label={label}
                size="small"
                color={sourceFilter === id ? 'primary' : 'default'}
                variant={sourceFilter === id ? 'filled' : 'outlined'}
                onClick={() => setSourceFilter(id)}
                sx={{ fontSize: '0.65rem', height: 22, cursor: 'pointer' }}
              />
            ))}
          </Box>
          <TextField
            size="small"
            fullWidth
            placeholder="Search timeline..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.78rem' } }}
          />
          {commander.loadingTimeline ? (
            [1, 2, 3].map((i) => (
              <Skeleton key={i} height={40} sx={{ mb: 0.75, borderRadius: 1.5 }} />
            ))
          ) : filteredEvents.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ py: 3, textAlign: 'center', fontSize: '0.82rem' }}
            >
              No communication for this org yet. Dispatch a command below, or link goals with this
              org_id.
            </Typography>
          ) : (
            <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
              {filteredEvents.map((evt) => (
                <Box
                  key={evt.id}
                  sx={{
                    mb: 0.75,
                    p: 1,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.6),
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <Chip
                          label={evt.source}
                          size="small"
                          sx={{ height: 18, fontSize: '0.55rem', fontWeight: 700 }}
                        />
                        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                          {evt.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ ml: 'auto', fontSize: '0.62rem' }}
                        >
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : ''}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.78rem', mt: 0.35, color: 'text.secondary' }}
                        noWrap
                      >
                        {evt.body}
                      </Typography>
                      {evt.subtitle && (
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.65rem', color: 'text.disabled' }}
                        >
                          {evt.subtitle}
                        </Typography>
                      )}
                    </Box>
                    {evt.deepLink && onNavigate && (
                      <Button
                        size="small"
                        onClick={() => handleOpenEvent(evt)}
                        sx={{ minWidth: 0, p: 0.5 }}
                      >
                        <AppIcon
                          name="OpenInNewOutlined"
                          fallback={OpenInNewOutlinedIcon}
                          sx={{ fontSize: 16 }}
                        />
                      </Button>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Paper>

        {/* Command composer */}
        <Paper
          variant="outlined"
          sx={{ p: 1.25, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.03) }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'text.secondary',
            }}
          >
            Dispatch command
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
            <FormControl size="small" sx={{ minWidth: { sm: 200 }, flex: 1 }}>
              <InputLabel>Target</InputLabel>
              <Select
                value={
                  targetKey ||
                  (commander.roster.targets[0]
                    ? `${commander.roster.targets[0].type}:${commander.roster.targets[0].id}`
                    : '')
                }
                label="Target"
                onChange={(e) => setTargetKey(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                {commander.roster.targets.map((t) => (
                  <MenuItem key={`${t.type}:${t.id}`} value={`${t.type}:${t.id}`}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            placeholder="Instruction for the selected target..."
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' } }}
          />
          <Button
            variant="contained"
            startIcon={<AppIcon name="Send" fallback={SendIcon} />}
            onClick={handleDispatch}
            disabled={commander.dispatching || !command.trim() || !target}
            sx={{ mt: 1, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            {commander.dispatching ? 'Dispatching…' : 'Dispatch'}
          </Button>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 0.75, fontSize: '0.68rem' }}
          >
            Creates a goal for this org and runs the agent pipeline. Messages appear in this
            timeline and in Goal History.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
