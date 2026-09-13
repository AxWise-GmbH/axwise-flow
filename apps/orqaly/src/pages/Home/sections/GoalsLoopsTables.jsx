import { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Link,
  Skeleton,
} from '@mui/material';
import RankedTable from '../../Reports/components/RankedTable';
import PanelCard, { HOME_BLOCK_BODY_HEIGHT } from './PanelCard';
import ViewAllButton from './ViewAllButton';
import useInView from '../../../components/Common/useInView';
import { staggerSx } from '../../../components/Common/stagger';
import GoalDetailDialog from '../../../components/Goals/GoalDetailDialog';
import AgentDetailDialog from '../../../components/AgentHub/AgentDetailDialog';

/** ISO timestamp -> "dd.mm.yy hh:mm" (locale-independent). */
function formatStarted(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const HEAD_SX = {
  fontWeight: 700,
  color: 'text.secondary',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  fontSize: '0.62rem',
  borderBottom: '1px solid',
  borderColor: 'divider',
  py: 0.75,
  bgcolor: 'background.paper',
};
const CELL_SX = { border: 0, py: 0.85, fontSize: '0.8rem' };

// Goals table column proportions (column order comes from the row keys:
// Goal · Status · Phase · Date). Goal stays wide; Status is roomy enough to show
// its full label (tighter cell padding so the chip isn't clipped); Date is narrow
// with the time stacked under the date.
const GOALS_COLUMN_META = {
  goal: { width: '40%' },
  status: { width: '21%', px: 0.75 },
  phase: { width: '22%' },
  date: { width: '17%', whiteSpace: 'pre-line', verticalAlign: 'top' },
};

/**
 * Compact loops table. Each row is a looped goal: clickable Agent (→ agent
 * detail popup) and Goal (→ goal detail popup), the loop count, and when it
 * started. Rows are shaped by `getLoops()` (see useHomeData).
 */
function LoopsMiniTable({ rows = [], loading = false, rowSx, onAgentClick, onGoalClick }) {
  if (loading) {
    return (
      <Box sx={{ px: 1, py: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={28} sx={{ mb: 0.75, borderRadius: 1 }} />
        ))}
      </Box>
    );
  }
  if (!rows.length) {
    return (
      <Box sx={{ px: 1, py: 3, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          No active loops yet.
        </Typography>
      </Box>
    );
  }
  return (
    <TableContainer sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <Table size="small" stickyHeader sx={{ '& td, & th': { borderColor: 'divider' } }}>
        <TableHead>
          <TableRow>
            <TableCell sx={HEAD_SX}>Agent</TableCell>
            <TableCell sx={HEAD_SX}>Goal</TableCell>
            <TableCell sx={{ ...HEAD_SX, textAlign: 'right' }}>Loops</TableCell>
            <TableCell sx={{ ...HEAD_SX, display: { xs: 'none', sm: 'table-cell' } }}>
              Started
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => {
            const hasAgent = Boolean(r.agent_id);
            return (
              <TableRow
                key={r.loop_id || i}
                sx={{ ...(rowSx ? rowSx(i) : {}), '&:last-child td': { border: 0 } }}
              >
                <TableCell sx={CELL_SX}>
                  {hasAgent ? (
                    <Link
                      component="button"
                      type="button"
                      underline="hover"
                      onClick={() => onAgentClick(r)}
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        textAlign: 'left',
                        color: 'text.primary',
                      }}
                    >
                      {r.agent_name}
                    </Link>
                  ) : (
                    <Typography
                      component="span"
                      sx={{ fontSize: '0.8rem', color: 'text.disabled' }}
                    >
                      {r.agent_name || 'Unassigned'}
                    </Typography>
                  )}
                  {r.agent_role && (
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.1 }}
                    >
                      {r.agent_role}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ ...CELL_SX, maxWidth: 160 }}>
                  <Link
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={() => onGoalClick(r)}
                    sx={{
                      fontSize: '0.8rem',
                      textAlign: 'left',
                      color: 'text.primary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      maxWidth: '100%',
                    }}
                  >
                    {r.goal_title || 'Untitled goal'}
                  </Link>
                </TableCell>
                <TableCell sx={{ ...CELL_SX, textAlign: 'right', fontWeight: 700 }}>
                  {r.max_loops ? `${r.loops}/${r.max_loops}` : r.loops}
                </TableCell>
                <TableCell
                  sx={{
                    ...CELL_SX,
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                    display: { xs: 'none', sm: 'table-cell' },
                  }}
                >
                  {formatStarted(r.started_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * Two-up: "Goals in Action" and "Loops from Agents". Each collapses to a single
 * column under md. The Goals panel reuses RankedTable; the Loops panel uses a
 * custom table so the Agent and Goal cells are independently clickable.
 */
export default function GoalsLoopsTables({
  goals = { rows: [] },
  loops = { rows: [] },
  loading = false,
  onViewAllGoals,
  onViewAllLoops,
  delay = 0,
  // Which of the two panels to render. Each can be hosted as its own dashboard
  // block, so a single panel renders full width.
  panels = ['goals', 'loops'],
}) {
  const [goalsRef, goalsIn] = useInView();
  const [loopsRef, loopsIn] = useInView();
  const [detailGoalId, setDetailGoalId] = useState(null);
  const [detailAgent, setDetailAgent] = useState(null);

  const showGoals = panels.includes('goals');
  const showLoops = panels.includes('loops');
  const cols = showGoals && showLoops ? '1fr 1fr' : '1fr';

  return (
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: cols } }}>
      {showGoals && (
        <PanelCard
          title="Goals in Action"
          subtitle="Live goals execution with actionable tasks"
          action={<ViewAllButton count={goals.total} onClick={onViewAllGoals} />}
          delay={delay}
          bodyHeight={HOME_BLOCK_BODY_HEIGHT}
        >
          <Box
            ref={goalsRef}
            sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          >
            <RankedTable
              data={goals.rows}
              maxRows={200}
              maxHeight="100%"
              loading={loading}
              showRank={false}
              columnMeta={GOALS_COLUMN_META}
              onRowClick={(row) => setDetailGoalId(row._id)}
              rowSx={(i) => staggerSx(i, goalsIn)}
            />
          </Box>
        </PanelCard>
      )}
      {showLoops && (
        <PanelCard
          title="Loops from Agents"
          subtitle="Feedback loops and actions initiated by agents"
          action={<ViewAllButton count={loops.total} onClick={onViewAllLoops} />}
          delay={delay}
          bodyHeight={HOME_BLOCK_BODY_HEIGHT}
        >
          <Box
            ref={loopsRef}
            sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          >
            <LoopsMiniTable
              rows={loops.rows}
              loading={loading}
              rowSx={(i) => staggerSx(i, loopsIn)}
              onAgentClick={(r) =>
                setDetailAgent({ id: r.agent_id, name: r.agent_name, role: r.agent_role })
              }
              onGoalClick={(r) => setDetailGoalId(r.goal_id)}
            />
          </Box>
        </PanelCard>
      )}

      {detailGoalId && (
        <GoalDetailDialog open goalId={detailGoalId} onClose={() => setDetailGoalId(null)} />
      )}
      {detailAgent && (
        <AgentDetailDialog open agent={detailAgent} onClose={() => setDetailAgent(null)} />
      )}
    </Box>
  );
}
