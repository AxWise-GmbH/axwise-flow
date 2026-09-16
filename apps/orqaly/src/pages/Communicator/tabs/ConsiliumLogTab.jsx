/**
 * [module: connection-hub]
 * ConsiliumLogTab - decision audit trail with member votes + analytics.
 * Filters consolidated into a popover for mobile-friendly layout.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Button,
  Paper,
  MenuItem,
  Select,
  FormControl,
  Skeleton,
  Alert,
  Collapse,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Popover,
  Divider,
  useTheme,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ClearIcon from '@mui/icons-material/Clear';
import EmptyState from '../../../components/Common/EmptyState';
import { supabase, hasSupabase } from '../../../lib/supabase';
import VoteMeter from '../components/VoteMeter';
import PaneStatusStrip from '../components/PaneStatusStrip';

import AppIcon from '../../../components/icons/AppIcon';

const DECISION_LEVELS = ['all', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const LEVEL_COLORS = { LOW: 'success', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'error' };

function EvalCard({ evaluation, theme, onToggle, expanded }) {
  const score = Number(evaluation.overall_score) || 0;
  const scorePercent = Math.min(score * 10, 100);
  const ts = evaluation.created_at
    ? new Date(evaluation.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const members = evaluation.member_responses || [];

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1,
        borderRadius: 2.5,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        '&:hover': {
          borderColor: alpha(
            evaluation.approved ? theme.palette.success.main : theme.palette.error.main,
            0.3
          ),
        },
      }}
    >
      {/* Header */}
      <Box
        onClick={onToggle}
        sx={{
          p: 1.25,
          cursor: 'pointer',
          '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.01) },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          {evaluation.approved ? (
            <AppIcon
              name="CheckCircle"
              fallback={CheckCircleIcon}
              sx={{ color: 'success.main', fontSize: 20, mt: 0.25, flexShrink: 0 }}
            />
          ) : (
            <AppIcon
              name="Cancel"
              fallback={CancelIcon}
              sx={{ color: 'error.main', fontSize: 20, mt: 0.25, flexShrink: 0 }}
            />
          )}

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                {evaluation.boardName || 'Board'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                {ts}
              </Typography>
            </Box>

            <Typography
              variant="body2"
              sx={{
                mt: 0.4,
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                fontSize: '0.8rem',
                lineHeight: 1.45,
              }}
            >
              {evaluation.summary || evaluation.feedback?.slice(0, 200) || 'No summary'}
            </Typography>

            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}
            >
              <Chip
                label={evaluation.approved ? 'Approved' : 'Rejected'}
                size="small"
                color={evaluation.approved ? 'success' : 'error'}
                sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }}
              />
              {evaluation.consensus_type && (
                <Chip
                  label={evaluation.consensus_type}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              )}
              {evaluation.decision_level && (
                <Chip
                  label={evaluation.decision_level}
                  size="small"
                  color={LEVEL_COLORS[evaluation.decision_level] || 'default'}
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              )}
              {evaluation.human_review_required && (
                <Chip
                  label="Human"
                  size="small"
                  color="warning"
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}
                >
                  {score.toFixed(1)}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={scorePercent}
                  sx={{
                    width: 50,
                    height: 5,
                    borderRadius: 3,
                    bgcolor: alpha(theme.palette.text.primary, 0.06),
                  }}
                />
              </Box>
            </Box>

            {/* Vote-in-progress meter - visible without expanding */}
            {members.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <VoteMeter
                  members={members.map((m) => ({
                    id: m.memberId,
                    name: m.memberName || m.role || 'Member',
                    vote: m.approved == null ? 'pending' : m.approved ? 'approve' : 'reject',
                    opinion: m.feedback || m.reasoning || '',
                  }))}
                  compact
                />
              </Box>
            )}
          </Box>

          <IconButton size="small" sx={{ mt: -0.25 }}>
            {expanded ? (
              <AppIcon name="ExpandLess" fallback={ExpandLessIcon} sx={{ fontSize: 18 }} />
            ) : (
              <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Box>
      </Box>
      {/* Detail */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.25, pb: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
          {members.length > 0 && (
            <TableContainer sx={{ mt: 0.75 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.5 }}>
                      Member
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.5 }}>
                      Role
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        py: 0.5,
                        display: { xs: 'none', sm: 'table-cell' },
                      }}
                    >
                      Model
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.5 }}
                      align="center"
                    >
                      Vote
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 0.5 }} align="right">
                      Score
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((m, i) => (
                    <TableRow key={m.memberId || i}>
                      <TableCell sx={{ fontSize: '0.72rem', py: 0.4 }}>
                        {m.memberName || 'Member'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.72rem', py: 0.4 }}>{m.role || '-'}</TableCell>
                      <TableCell
                        sx={{
                          fontSize: '0.68rem',
                          fontFamily: 'monospace',
                          py: 0.4,
                          display: { xs: 'none', sm: 'table-cell' },
                        }}
                      >
                        {m.model || '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ py: 0.4 }}>
                        {m.approved ? (
                          <AppIcon
                            name="CheckCircle"
                            fallback={CheckCircleIcon}
                            sx={{ color: 'success.main', fontSize: 15 }}
                          />
                        ) : (
                          <AppIcon
                            name="Cancel"
                            fallback={CancelIcon}
                            sx={{ color: 'error.main', fontSize: 15 }}
                          />
                        )}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontSize: '0.72rem', fontWeight: 600, py: 0.4 }}
                      >
                        {(Number(m.overallScore) || 0).toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
            {evaluation.total_cost_usd > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Cost: <b>${Number(evaluation.total_cost_usd).toFixed(4)}</b>
              </Typography>
            )}
            {evaluation.total_tokens > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Tokens: <b>{evaluation.total_tokens.toLocaleString()}</b>
              </Typography>
            )}
            {evaluation.duration_ms > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Duration: <b>{(evaluation.duration_ms / 1000).toFixed(1)}s</b>
              </Typography>
            )}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function ConsiliumLogTab(props) {
  const {
    evaluations,
    loading,
    error,
    filters,
    analytics,
    analyticsLoading,
    applyFilters,
    resetFilters,
  } = props;

  const theme = useTheme();
  const [expandedId, setExpandedId] = useState(null);
  const [boards, setBoards] = useState([]);
  const [filterAnchor, setFilterAnchor] = useState(null);

  useEffect(() => {
    if (!hasSupabase()) return;
    supabase
      .from('concilium')
      .select('id, name')
      .order('name')
      .then(({ data }) => setBoards(data || []))
      .catch(() => {});
  }, []);

  const hasActiveFilters =
    filters.boardId ||
    filters.approved !== 'all' ||
    filters.decisionLevel !== 'all' ||
    filters.search;

  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.boardId) {
      const b = boards.find((x) => x.id === filters.boardId);
      chips.push({ label: b?.name || 'Board', key: 'boardId' });
    }
    if (filters.approved !== 'all')
      chips.push({ label: filters.approved === 'true' ? 'Approved' : 'Rejected', key: 'approved' });
    if (filters.decisionLevel !== 'all')
      chips.push({ label: filters.decisionLevel, key: 'decisionLevel' });
    if (filters.search)
      chips.push({
        label: `"${filters.search.length > 15 ? filters.search.slice(0, 15) + '…' : filters.search}"`,
        key: 'search',
      });
    return chips;
  }, [filters, boards]);

  if (loading && evaluations.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={72} sx={{ mb: 1, borderRadius: 2.5 }} />
        ))}
      </Box>
    );
  }

  // Stats for the pinned status strip
  const pendingCount = evaluations.filter((e) => e.approved == null).length;
  const todayCount = evaluations.filter((e) => {
    if (!e.created_at) return false;
    const d = new Date(e.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <Box>
      <PaneStatusStrip
        stats={[
          {
            value: pendingCount,
            label: 'In progress',
            color: pendingCount > 0 ? 'warning' : 'neutral',
            icon: HourglassEmptyOutlinedIcon,
          },
          { value: todayCount, label: 'Decided today', color: 'primary', icon: GavelOutlinedIcon },
          {
            value: evaluations.length,
            label: 'Total decisions',
            color: 'success',
            icon: CheckCircleOutlineIcon,
          },
        ]}
      />
      {/* ── Analytics ── */}
      {analytics && !analyticsLoading && (
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            mb: 2,
          }}
        >
          {[
            {
              label: 'Approval Rate',
              value: `${(analytics.approvalRate * 100).toFixed(0)}%`,
              color: theme.palette.success.main,
            },
            {
              label: 'Avg Confidence',
              value: `${analytics.avgConfidence.toFixed(1)}/10`,
              color: theme.palette.info.main,
            },
            { label: 'Total Decisions', value: analytics.total, color: theme.palette.primary.main },
            {
              label: 'Human Review',
              value: analytics.humanReviewCount,
              color: theme.palette.warning.main,
            },
          ].map((stat) => (
            <Paper
              key={stat.label}
              elevation={0}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(stat.color, 0.18),
                background: `linear-gradient(135deg, ${alpha(stat.color, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.65rem' }}
              >
                {stat.label}
              </Typography>
              <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.2, mt: 0.2 }}>
                {stat.value}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
      {/* ── Filter bar ── */}
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
        <IconButton
          size="small"
          onClick={(e) => setFilterAnchor(e.currentTarget)}
          sx={{
            border: '1px solid',
            borderColor: hasActiveFilters ? alpha(theme.palette.primary.main, 0.4) : 'divider',
            borderRadius: 2,
            p: 0.75,
            bgcolor: hasActiveFilters ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
          }}
        >
          <AppIcon
            name="TuneRounded"
            fallback={TuneRoundedIcon}
            sx={{ fontSize: 18, color: hasActiveFilters ? 'primary.main' : 'text.secondary' }}
          />
        </IconButton>

        {activeChips.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            size="small"
            onDelete={() =>
              applyFilters({
                [c.key]: c.key === 'approved' || c.key === 'decisionLevel' ? 'all' : '',
              })
            }
            deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
            sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
          />
        ))}

        <Box sx={{ flex: 1 }} />
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem' }}
        >
          {evaluations.length} decision{evaluations.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      {/* ── Filter Popover ── */}
      <Popover
        open={Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              minWidth: 300,
              maxWidth: 360,
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            },
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
              Filter decisions
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
              Search
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Search decisions..."
              value={filters.search}
              onChange={(e) => applyFilters({ search: e.target.value })}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 16 }} />
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
              Board
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filters.boardId}
                onChange={(e) => applyFilters({ boardId: e.target.value })}
                displayEmpty
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Boards</MenuItem>
                {boards.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name}
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
              Outcome
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filters.approved}
                onChange={(e) => applyFilters({ approved: e.target.value })}
                displayEmpty
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="true">Approved</MenuItem>
                <MenuItem value="false">Rejected</MenuItem>
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
              Decision Level
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filters.decisionLevel}
                onChange={(e) => applyFilters({ decisionLevel: e.target.value })}
                displayEmpty
                sx={{ borderRadius: 2 }}
              >
                {DECISION_LEVELS.map((l) => (
                  <MenuItem key={l} value={l}>
                    {l === 'all' ? 'All Levels' : l}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          {hasActiveFilters && (
            <Chip
              label="Clear all filters"
              size="small"
              variant="outlined"
              onDelete={() => {
                resetFilters();
                setFilterAnchor(null);
              }}
              deleteIcon={<AppIcon name="Clear" fallback={ClearIcon} sx={{ fontSize: 14 }} />}
              sx={{
                fontSize: '0.72rem',
                height: 28,
                borderRadius: '8px',
                color: 'text.secondary',
                alignSelf: 'flex-start',
              }}
            />
          )}
        </Box>
      </Popover>
      {error && (
        <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
          {error}
        </Alert>
      )}
      {/* ── Evaluations ── */}
      {evaluations.length === 0 ? (
        <EmptyState
          icon={GavelOutlinedIcon}
          title="No consilium decisions recorded yet"
          description={
            hasActiveFilters
              ? 'Try adjusting your filters.'
              : 'Decisions will appear here when consilium boards evaluate work.'
          }
          action={hasActiveFilters ? { label: 'Clear filters', onClick: resetFilters } : undefined}
        />
      ) : (
        evaluations.map((ev) => (
          <EvalCard
            key={ev.id}
            evaluation={ev}
            theme={theme}
            expanded={expandedId === ev.id}
            onToggle={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
          />
        ))
      )}
    </Box>
  );
}
