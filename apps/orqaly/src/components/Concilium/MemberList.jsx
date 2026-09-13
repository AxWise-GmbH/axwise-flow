/**
 * MemberList — Modernized member listing with filter popover, card/list toggle, CSS grid.
 */
import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  alpha,
  CircularProgress,
  Popover,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import EmptyState from '../Common/EmptyState';
import { useConciliumMembers } from '../../hooks/useConciliumMembers';
import { MEMBER_ROLES, MEMBER_PROVIDERS } from '../../services/conciliumMembersService';
import MemberForm from './MemberForm';
import MemberCard from './MemberCard';
import MemberDetailDialog from './MemberDetailDialog';
import AddAgentAsMemberDialog from './AddAgentAsMemberDialog';
import AgentAvatar from '../AgentHub/AgentAvatar';

import AppIcon from '../icons/AppIcon';

const PROVIDER_COLORS = {
  groq: '#F55036',
  openai: '#10A37F',
  anthropic: '#D4A574',
  deepseek: '#5B6EF5',
  glm: '#1E88E5',
  gemini: '#4285F4',
};
const ROLE_COLORS = {
  chairman: '#7C3AED',
  evaluator: '#2563EB',
  auditor: '#D97706',
  specialist: '#059669',
  observer: '#64748B',
};

export default function MemberList({ concilium, theme, isDark }) {
  const [selectedBoard, setSelectedBoard] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [detailMember, setDetailMember] = useState(null);
  const [viewMode, setViewMode] = useState('card');

  // Filters
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [quarantineFilter, setQuarantineFilter] = useState('');

  // List view sort
  const [orderBy, setOrderBy] = useState('name');
  const [order, setOrder] = useState('asc');

  const boardId = selectedBoard || (concilium.length > 0 ? concilium[0].id : '');
  const currentBoard = concilium.find((c) => c.id === boardId) || null;
  const {
    members,
    loading,
    addMember,
    editMember,
    removeMember,
    quarantineMember,
    unquarantineMember,
  } = useConciliumMembers(boardId);

  const hasActiveFilters = !!(search.trim() || roleFilter || providerFilter || quarantineFilter);

  const filtered = useMemo(() => {
    let list = members;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.role || '').toLowerCase().includes(q) ||
          (m.provider || '').toLowerCase().includes(q)
      );
    }
    if (roleFilter)
      list = list.filter(
        (m) => (typeof m.role === 'object' ? m.role?.value : m.role) === roleFilter
      );
    if (providerFilter)
      list = list.filter(
        (m) => (typeof m.provider === 'object' ? m.provider?.value : m.provider) === providerFilter
      );
    if (quarantineFilter === 'active') list = list.filter((m) => !m.quarantined);
    if (quarantineFilter === 'quarantined') list = list.filter((m) => m.quarantined);

    // Sort for list view
    if (viewMode === 'list') {
      list = [...list].sort((a, b) => {
        const aVal = a[orderBy] || '';
        const bVal = b[orderBy] || '';
        const cmp =
          typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
        return order === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [members, search, roleFilter, providerFilter, quarantineFilter, viewMode, orderBy, order]);

  const openCreate = () => {
    setEditingMember(null);
    setFormOpen(true);
  };
  const openEdit = (m) => {
    setEditingMember(m);
    setFormOpen(true);
  };

  const handleSave = async (data) => {
    if (editingMember) {
      await editMember(editingMember.id, data);
    } else {
      await addMember({ ...data, conciliumId: boardId });
    }
    setFormOpen(false);
  };

  const handleSort = (col) => {
    setOrder(orderBy === col && order === 'asc' ? 'desc' : 'asc');
    setOrderBy(col);
  };

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('');
    setProviderFilter('');
    setQuarantineFilter('');
  };

  return (
    <Box>
      {/* ===== Toolbar ===== */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {/* Filter button */}
        <IconButton
          size="small"
          onClick={(e) => setFilterAnchorEl(e.currentTarget)}
          sx={{
            border: '1px solid',
            borderRadius: 2,
            px: 1.25,
            borderColor: hasActiveFilters ? 'primary.main' : 'divider',
            color: hasActiveFilters ? 'primary.main' : 'text.secondary',
            position: 'relative',
          }}
        >
          <AppIcon name="TuneRounded" fallback={TuneRoundedIcon} sx={{ fontSize: 18 }} />
          {hasActiveFilters && (
            <Box
              sx={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 7,
                height: 7,
                bgcolor: 'error.main',
                borderRadius: '50%',
              }}
            />
          )}
        </IconButton>

        {/* View toggle */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.5, borderRadius: 2 } }}
        >
          <ToggleButton value="card">
            <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 18 }} />
          </ToggleButton>
          <ToggleButton value="list">
            <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 18 }} />
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        {/* Add from my agents — seat activated Agent Hub agents onto this board */}
        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="PersonOutline" fallback={PersonOutlineIcon} />}
          onClick={() => setAgentDialogOpen(true)}
          disabled={!boardId}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            mr: 1,
            borderColor: alpha(theme.palette.info.main, 0.4),
            color: 'info.main',
          }}
        >
          Add from my agents
        </Button>

        {/* Add Member */}
        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={openCreate}
          disabled={!boardId}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            borderColor: alpha(theme.palette.primary.main, 0.4),
            color: 'primary.main',
          }}
        >
          Add Member
        </Button>
      </Box>
      {/* ===== Filter Popover ===== */}
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => setFilterAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: { borderRadius: 3, minWidth: 320, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' },
          },
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2.5,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name="TuneRounded"
              fallback={TuneRoundedIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Filters
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Narrow down members
            </Typography>
          </Box>
        </Box>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Board
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={boardId}
                onChange={(e) => setSelectedBoard(e.target.value)}
                displayEmpty
                sx={{ borderRadius: 2 }}
              >
                {concilium.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Search
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="SearchOutlined" fallback={SearchIcon} sx={{ fontSize: 16 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Role
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                displayEmpty
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Roles</MenuItem>
                {MEMBER_ROLES.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Provider
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                displayEmpty
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Providers</MenuItem>
                {MEMBER_PROVIDERS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Status
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={quarantineFilter}
                onChange={(e) => setQuarantineFilter(e.target.value)}
                displayEmpty
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="quarantined">Quarantined</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            size="small"
            onClick={resetFilters}
            sx={{ textTransform: 'none', fontWeight: 600, color: 'primary.main' }}
          >
            Reset filters
          </Button>
        </Box>
      </Popover>
      {/* ===== Content ===== */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ p: 3 }}>
          <EmptyState
            icon={PersonOutlineIcon}
            title="No members"
            description={boardId ? 'Add members to this board.' : 'Select a board first.'}
            actionLabel="Add Member"
            onAction={openCreate}
          />
        </Box>
      ) : viewMode === 'card' ? (
        /* ===== Card Grid ===== */
        <Box
          sx={{
            p: { xs: 1.25, sm: 1.5 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            gap: 1.5,
          }}
        >
          {filtered.map((m) => (
            <MemberCard key={m.id} member={m} isDark={isDark} onClick={() => setDetailMember(m)} />
          ))}
        </Box>
      ) : (
        /* ===== List View ===== */
        <TableContainer sx={{ maxHeight: 'calc(100vh - 340px)', overflowX: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={orderBy === 'name'}
                    direction={orderBy === 'name' ? order : 'asc'}
                    onClick={() => handleSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Provider</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Model</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>
                  <TableSortLabel
                    active={orderBy === 'totalEvaluations'}
                    direction={orderBy === 'totalEvaluations' ? order : 'asc'}
                    onClick={() => handleSort('totalEvaluations')}
                  >
                    Evals
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Avg Time</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Cost</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((m) => {
                const roleVal = typeof m.role === 'object' ? m.role?.value : m.role;
                const provVal = typeof m.provider === 'object' ? m.provider?.value : m.provider;
                const modelVal = typeof m.model === 'object' ? m.model?.value : m.model;
                const roleColor = ROLE_COLORS[roleVal] || '#888';
                const provColor = PROVIDER_COLORS[provVal] || '#888';
                return (
                  <TableRow
                    key={m.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setDetailMember(m)}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AgentAvatar profile={{ display_name: m.name }} size="small" />
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {m.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={roleVal}
                        size="small"
                        sx={{
                          height: 22,
                          fontWeight: 600,
                          fontSize: '0.62rem',
                          textTransform: 'capitalize',
                          bgcolor: alpha(roleColor, isDark ? 0.15 : 0.1),
                          color: roleColor,
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={provVal}
                        size="small"
                        sx={{
                          height: 22,
                          fontWeight: 600,
                          fontSize: '0.62rem',
                          bgcolor: alpha(provColor, isDark ? 0.15 : 0.1),
                          color: provColor,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {modelVal || 'Default'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {m.totalEvaluations || 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption">
                        {m.avgResponseTimeMs ? `${m.avgResponseTimeMs}ms` : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption">
                        ${m.avgCostUsd?.toFixed(4) || '0.0000'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {m.quarantined ? (
                        <Chip
                          label="Quarantined"
                          size="small"
                          color="error"
                          sx={{ height: 22, fontWeight: 600, fontSize: '0.62rem' }}
                        />
                      ) : (
                        <Chip
                          label="Active"
                          size="small"
                          color="success"
                          sx={{ height: 22, fontWeight: 600, fontSize: '0.62rem' }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {/* ===== Member Form Dialog ===== */}
      <MemberForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        editing={editingMember}
        theme={theme}
        isDark={isDark}
      />
      {/* ===== Add-from-my-agents Dialog ===== */}
      <AddAgentAsMemberDialog
        open={agentDialogOpen}
        onClose={() => setAgentDialogOpen(false)}
        onAdd={(data) => addMember({ ...data, conciliumId: boardId })}
        existingNames={members.map((m) => m.name)}
      />
      {/* ===== Member Detail Dialog ===== */}
      <MemberDetailDialog
        member={detailMember}
        open={!!detailMember}
        onClose={() => setDetailMember(null)}
        onEdit={() => {
          openEdit(detailMember);
          setDetailMember(null);
        }}
        onSave={editMember}
        onDelete={() => {
          if (detailMember) removeMember(detailMember.id);
          setDetailMember(null);
        }}
        onQuarantine={() => {
          if (detailMember) quarantineMember(detailMember.id, 'Manual quarantine');
          setDetailMember(null);
        }}
        onUnquarantine={() => {
          if (detailMember) unquarantineMember(detailMember.id);
          setDetailMember(null);
        }}
        board={currentBoard}
        isDark={isDark}
      />
    </Box>
  );
}
