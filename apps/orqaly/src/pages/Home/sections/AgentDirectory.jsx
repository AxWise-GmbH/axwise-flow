import { useMemo, useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Button,
  Menu,
  MenuItem,
  Checkbox,
  ListItemText,
  Chip,
  Avatar,
  LinearProgress,
  Typography,
  Skeleton,
  InputAdornment,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PanelCard from './PanelCard';
import useInView from '../../../components/Common/useInView';
import { staggerSx } from '../../../components/Common/stagger';

import AppIcon from '../../../components/icons/AppIcon';

const STATUS_COLOR = { Active: 'success', Idle: 'warning', Offline: 'default' };
const STATUS_OPTIONS = ['all', 'Active', 'Idle', 'Offline'];
const OPTIONAL_COLUMNS = ['team', 'lastActive'];
const COLUMN_LABEL = { team: 'Team', lastActive: 'Last Active' };

function initials(name) {
  return String(name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function toCsv(rows) {
  const headers = ['name', 'type', 'status', 'team', 'lastActive', 'tasks', 'successRate'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(rows) {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'agent-directory.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function StatusChip({ status }) {
  return (
    <Chip
      label={status}
      size="small"
      color={STATUS_COLOR[status] || 'default'}
      variant="outlined"
      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
    />
  );
}

function SuccessBar({ value }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 90 }}>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, value)}
        sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.divider, 0.5) }}
      />
      <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 32 }}>
        {value}%
      </Typography>
    </Box>
  );
}

/**
 * Agent Directory: searchable, filterable, exportable. Renders a horizontally
 * scrollable table on md+ and a card list on phones.
 */
export default function AgentDirectory({ agents = { rows: [] }, loading = false, delay = 0 }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [filterEl, setFilterEl] = useState(null);
  const [columnsEl, setColumnsEl] = useState(null);
  const [hiddenCols, setHiddenCols] = useState([]);
  const [bodyRef, inView] = useInView();

  const filtered = useMemo(() => {
    const list = agents.rows || [];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      const matchesStatus = status === 'all' || r.status === status;
      const matchesQuery =
        !q ||
        [r.name, r.type, r.team].some((f) =>
          String(f || '')
            .toLowerCase()
            .includes(q)
        );
      return matchesStatus && matchesQuery;
    });
  }, [agents.rows, search, status]);

  const showCol = (key) => !hiddenCols.includes(key);
  const toggleCol = (key) =>
    setHiddenCols((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]));

  const toolbar = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1.25 }}>
      <TextField
        size="small"
        placeholder="Search agents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ flex: { xs: '1 1 100%', sm: '1 1 220px' }, order: { xs: 3, sm: 0 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 18 }} />
            </InputAdornment>
          ),
        }}
      />
      <Button
        size="small"
        variant="outlined"
        startIcon={<AppIcon name="FilterList" fallback={FilterListIcon} sx={{ fontSize: 16 }} />}
        onClick={(e) => setFilterEl(e.currentTarget)}
      >
        {status === 'all' ? 'Filters' : status}
      </Button>
      {!isPhone && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<AppIcon name="ViewColumn" fallback={ViewColumnIcon} sx={{ fontSize: 16 }} />}
          onClick={(e) => setColumnsEl(e.currentTarget)}
        >
          Columns
        </Button>
      )}
      <Button
        size="small"
        variant="outlined"
        startIcon={
          <AppIcon
            name="FileDownloadOutlined"
            fallback={FileDownloadOutlinedIcon}
            sx={{ fontSize: 16 }}
          />
        }
        onClick={() => downloadCsv(filtered)}
      >
        Export
      </Button>

      <Menu anchorEl={filterEl} open={Boolean(filterEl)} onClose={() => setFilterEl(null)}>
        {STATUS_OPTIONS.map((opt) => (
          <MenuItem
            key={opt}
            selected={status === opt}
            onClick={() => {
              setStatus(opt);
              setFilterEl(null);
            }}
          >
            {opt === 'all' ? 'All statuses' : opt}
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={columnsEl} open={Boolean(columnsEl)} onClose={() => setColumnsEl(null)}>
        {OPTIONAL_COLUMNS.map((key) => (
          <MenuItem key={key} onClick={() => toggleCol(key)} dense>
            <Checkbox
              edge="start"
              checked={showCol(key)}
              tabIndex={-1}
              disableRipple
              size="small"
            />
            <ListItemText primary={COLUMN_LABEL[key]} />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );

  let body;
  if (loading) {
    body = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={44} animation="wave" />
        ))}
      </Box>
    );
  } else if (!filtered.length) {
    body = (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No agents match your filters yet.
      </Typography>
    );
  } else if (isPhone) {
    body = (
      <Box ref={bodyRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {filtered.map((a, i) => (
          <Box
            key={i}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              ...staggerSx(i, inView),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <Avatar sx={{ width: 28, height: 28, fontSize: '0.72rem', bgcolor: 'primary.main' }}>
                {initials(a.name)}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                  {a.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {a.type}
                </Typography>
              </Box>
              <StatusChip status={a.status} />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {a.team} · {a.tasks} tasks · {a.lastActive}
              </Typography>
            </Box>
            <Box sx={{ mt: 0.5 }}>
              <SuccessBar value={a.successRate} />
            </Box>
          </Box>
        ))}
      </Box>
    );
  } else {
    body = (
      <Box
        sx={{
          overflowX: 'auto',
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha(theme.palette.primary.main, 0.3),
            borderRadius: 3,
          },
        }}
      >
        <Table size="small" stickyHeader sx={{ minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Agent</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              {showCol('team') && <TableCell sx={{ fontWeight: 700 }}>Team</TableCell>}
              {showCol('lastActive') && <TableCell sx={{ fontWeight: 700 }}>Last Active</TableCell>}
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                Tasks
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Success Rate</TableCell>
            </TableRow>
          </TableHead>
          <TableBody ref={bodyRef}>
            {filtered.map((a, i) => (
              <TableRow key={i} hover sx={staggerSx(i, inView)}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar
                      sx={{ width: 26, height: 26, fontSize: '0.68rem', bgcolor: 'primary.main' }}
                    >
                      {initials(a.name)}
                    </Avatar>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {a.name}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>
                    {a.type}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusChip status={a.status} />
                </TableCell>
                {showCol('team') && <TableCell sx={{ fontSize: '0.8rem' }}>{a.team}</TableCell>}
                {showCol('lastActive') && (
                  <TableCell sx={{ fontSize: '0.8rem' }}>{a.lastActive}</TableCell>
                )}
                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                  {a.tasks}
                </TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <SuccessBar value={a.successRate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    );
  }

  return (
    <PanelCard title="Agent Directory" subtitle="All agents in your organization" delay={delay}>
      {toolbar}
      {body}
    </PanelCard>
  );
}
