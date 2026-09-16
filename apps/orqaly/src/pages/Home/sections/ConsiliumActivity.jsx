import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  Chip,
  Button,
  Popover,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import useCountUp from '../../Reports/hooks/useCountUp';
import GaugeKpi from '../../Reports/components/GaugeKpi';
import useInView from '../../../components/Common/useInView';
import { staggerSx } from '../../../components/Common/stagger';
import { formatDateTime } from '../../../utils/formatters';
import { getAllMembers, MEMBER_ROLES } from '../../../services/conciliumMembersService';
import { getEvaluationHistory } from '../../../services/conciliumService';
import PanelCard from './PanelCard';

import AppIcon from '../../../components/icons/AppIcon';

const ROLE_LABEL = Object.fromEntries(MEMBER_ROLES.map((r) => [r.value, r.label]));
const roleLabel = (role) =>
  ROLE_LABEL[role] || (role ? role[0].toUpperCase() + role.slice(1) : 'Member');

/** Small count column entry (Boards / Members / Decisions). Optionally a button. */
function CountStat({ iconNode, label, value, sublabel, onClick, trailing }) {
  const theme = useTheme();
  const color = theme.palette.primary.main;
  const animated = useCountUp(Number(value) || 0);
  const interactive = typeof onClick === 'function';
  return (
    <Box
      component={interactive ? 'button' : 'div'}
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-label={interactive ? label : undefined}
      sx={{
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        appearance: 'none',
        background: 'transparent',
        border: 'none',
        p: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        cursor: interactive ? 'pointer' : 'default',
        borderRadius: 1.5,
        transition: 'opacity 0.15s',
        '&:hover': interactive ? { opacity: 0.8 } : undefined,
        '&:focus-visible': interactive
          ? { outline: `2px solid ${color}`, outlineOffset: 2 }
          : undefined,
      }}
    >
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: 1.5,
          bgcolor: alpha(color, 0.14),
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {iconNode}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}
          >
            {Math.round(animated).toLocaleString()}
          </Typography>
          {trailing}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 160,
          }}
        >
          {sublabel || label}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Members entry: the count + an inline preview of up to 3 members (Name · Role),
 * plus a "More (+N)" button that opens the full list when there are more than 3.
 */
function MembersStat({ iconNode, total, members, loading, onMore }) {
  const list = Array.isArray(members) ? members : [];
  const preview = list.slice(0, 3);
  const extra = list.length - preview.length;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <CountStat iconNode={iconNode} label="Members" value={total} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, pl: 4.5 }}>
        {loading && preview.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            Loading…
          </Typography>
        ) : preview.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No members
          </Typography>
        ) : (
          preview.map((m) => (
            <Typography
              key={m.id || m.name}
              variant="caption"
              color="text.secondary"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}
            >
              {m.name}{' '}
              <Box component="span" sx={{ opacity: 0.7 }}>
                ({roleLabel(m.role)})
              </Box>
            </Typography>
          ))
        )}
        {extra > 0 && (
          <Button
            size="small"
            onClick={onMore}
            sx={{
              alignSelf: 'flex-start',
              textTransform: 'none',
              fontWeight: 700,
              minWidth: 0,
              px: 0.5,
              py: 0,
            }}
          >
            More (+{extra})
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** A 0-10 score pill, colored by band. */
function ScorePill({ score }) {
  const theme = useTheme();
  const s = Number(score) || 0;
  const color =
    s >= 8
      ? theme.palette.success.main
      : s >= 6
        ? theme.palette.primary.main
        : s >= 4
          ? theme.palette.warning.main
          : theme.palette.text.disabled;
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 0.25,
        px: 0.75,
        py: 0.25,
        borderRadius: 1.5,
        bgcolor: alpha(color, 0.12),
        border: '1px solid',
        borderColor: alpha(color, 0.3),
      }}
    >
      <Typography
        component="span"
        sx={{ fontWeight: 800, fontSize: '0.8rem', color, lineHeight: 1 }}
      >
        {s.toFixed(1)}
      </Typography>
      <Typography
        component="span"
        sx={{ fontWeight: 600, fontSize: '0.6rem', color: 'text.secondary' }}
      >
        / 10
      </Typography>
    </Box>
  );
}

/** Inline approval bar — track + animated fill (grows once in view). */
function ApprovalBar({ value, inView, delay = 0 }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const color =
    pct >= 70
      ? theme.palette.success.main
      : pct >= 40
        ? theme.palette.warning.main
        : theme.palette.error.main;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, minWidth: 120 }}>
      <Box
        sx={{
          flexGrow: 1,
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.divider, 0.6),
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: inView ? `${pct}%` : 0,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${alpha(color, 0.7)}, ${color})`,
            transition: 'width 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
            transitionDelay: `${delay}ms`,
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 58 }}>
        {pct.toFixed(0)}% appr
      </Typography>
    </Box>
  );
}

function StatusChip({ status }) {
  const theme = useTheme();
  const s = String(status || 'active').toLowerCase();
  const map = {
    active: { label: 'Active', color: theme.palette.success.main },
    paused: { label: 'Paused', color: theme.palette.warning.main },
    disbanded: { label: 'Disbanded', color: theme.palette.text.disabled },
  };
  const cfg = map[s] || { label: status || '—', color: theme.palette.text.secondary };
  return (
    <Chip
      size="small"
      label={cfg.label}
      sx={{
        height: 20,
        fontSize: '0.65rem',
        fontWeight: 700,
        color: cfg.color,
        bgcolor: alpha(cfg.color, 0.12),
        border: '1px solid',
        borderColor: alpha(cfg.color, 0.3),
      }}
    />
  );
}

/** One decision card in the horizontal carousel. */
function DecisionCard({ decision }) {
  const theme = useTheme();
  const approved = decision.approved;
  const outcome =
    approved === true
      ? { label: 'Approved', color: theme.palette.success.main, Icon: CheckCircleRoundedIcon }
      : approved === false
        ? { label: 'Rejected', color: theme.palette.error.main, Icon: CancelRoundedIcon }
        : {
            label: 'Pending',
            color: theme.palette.text.secondary,
            Icon: HourglassEmptyRoundedIcon,
          };
  const { Icon } = outcome;
  const score = Number(decision.overall_score) || 0;
  return (
    <Box
      sx={{
        flex: '0 0 auto',
        width: 230,
        scrollSnapAlign: 'start',
        p: 1.25,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.paper, 0.5),
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Icon sx={{ fontSize: 16, color: outcome.color }} />
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            color: outcome.color,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            flexGrow: 1,
          }}
        >
          {outcome.label}
        </Typography>
        <ScorePill score={score} />
      </Box>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: 54,
        }}
      >
        {decision.summary || 'Consilium decision'}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 'auto' }}>
        {decision.decision_level && (
          <Chip
            size="small"
            label={String(decision.decision_level).toLowerCase()}
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, textTransform: 'capitalize' }}
          />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {decision.created_at ? formatDateTime(decision.created_at) : ''}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Consilium Activity — aggregate approval/score gauges plus interactive controls
 * for a selected board:
 *  - Boards: shows the active board's name; with multiple boards it opens a
 *    picker to switch the active board (drives members + decisions below).
 *  - Members: opens a popover listing each member as "Name — Role".
 *  - Decisions: the count; a horizontal carousel of the active board's latest
 *    decisions renders below.
 * The per-board breakdown rows remain for the multi-board overview, each still
 * deep-linking to the Consilium page via onBoardClick.
 *
 * Members + decisions are fetched on demand for the active board (live), or read
 * from `consilium.membersByBoard` / `consilium.decisionsByBoard` in demo mode.
 */

/** Recompute the summary totals from a (possibly org-scoped) board subset. */
function computeTotals(boards) {
  const decisions = boards.reduce((s, b) => s + (Number(b.decisions) || 0), 0);
  const approxApproved = boards.reduce(
    (s, b) => s + ((Number(b.approvalRate) || 0) / 100) * (Number(b.decisions) || 0),
    0
  );
  const scored = boards.filter((b) => (Number(b.decisions) || 0) > 0);
  return {
    boards: boards.length,
    members: boards.reduce((s, b) => s + (Number(b.memberCount) || 0), 0),
    decisions,
    approvalRate: decisions > 0 ? Math.round((approxApproved / decisions) * 1000) / 10 : 0,
    avgScore:
      decisions > 0
        ? Math.round(
            (scored.reduce(
              (s, b) => s + (Number(b.avgScore) || 0) * (Number(b.decisions) || 0),
              0
            ) /
              decisions) *
              10
          ) / 10
        : 0,
  };
}

/** Board ids belonging to `orgId` and all of its descendant orgs. */
function scopedBoardIds(orgId, orgs) {
  const childrenByParent = {};
  for (const o of orgs) {
    const p = o.parent_id || null;
    (childrenByParent[p] = childrenByParent[p] || []).push(o);
  }
  const ids = new Set();
  const stack = [orgId];
  while (stack.length) {
    const id = stack.pop();
    const org = orgs.find((o) => o.id === id);
    if (org?.consilium_id) ids.add(org.consilium_id);
    for (const child of childrenByParent[id] || []) stack.push(child.id);
  }
  return ids;
}

export default function ConsiliumActivity({
  consilium,
  orgs = [],
  selectedOrgId = null,
  loading = false,
  demo = false,
  onBoardClick,
  onAttachBoard,
}) {
  const theme = useTheme();
  const allBoards = consilium?.boards || [];
  const [contentRef, inView] = useInView();

  // Scope to the selected org + descendants when a selection exists.
  const scopeIds = selectedOrgId && orgs.length ? scopedBoardIds(selectedOrgId, orgs) : null;
  const boards = useMemo(
    () => (scopeIds ? allBoards.filter((b) => scopeIds.has(b.id)) : allBoards),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allBoards, selectedOrgId]
  );
  const totals = scopeIds ? computeTotals(boards) : consilium?.totals || {};

  // Active board drives the members popover + decisions carousel.
  const [activeBoardId, setActiveBoardId] = useState(null);
  useEffect(() => {
    if (!boards.length) {
      setActiveBoardId(null);
      return;
    }
    if (!boards.some((b) => b.id === activeBoardId)) setActiveBoardId(boards[0].id);
  }, [boards, activeBoardId]);
  const activeBoard = boards.find((b) => b.id === activeBoardId) || null;

  // Popover anchors.
  const [boardAnchor, setBoardAnchor] = useState(null);
  const [memberAnchor, setMemberAnchor] = useState(null);

  // Members for the active board — fetched eagerly so the inline 3-member
  // preview is available without opening the full list.
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  useEffect(() => {
    if (!activeBoardId) {
      setMembers([]);
      return undefined;
    }
    let stale = false;
    if (demo) {
      setMembers(consilium?.membersByBoard?.[activeBoardId] || []);
      return undefined;
    }
    setMembersLoading(true);
    getAllMembers(activeBoardId)
      .then((rows) => {
        if (!stale) setMembers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!stale) setMembers([]);
      })
      .finally(() => {
        if (!stale) setMembersLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [activeBoardId, demo, consilium]);

  // Latest decisions for the active board (drives the carousel).
  const [decisions, setDecisions] = useState([]);
  const [decisionsLoading, setDecisionsLoading] = useState(false);
  useEffect(() => {
    if (!activeBoardId) {
      setDecisions([]);
      return undefined;
    }
    let stale = false;
    if (demo) {
      setDecisions(consilium?.decisionsByBoard?.[activeBoardId] || []);
      return undefined;
    }
    setDecisionsLoading(true);
    getEvaluationHistory(activeBoardId, 10)
      .then((rows) => {
        if (!stale) setDecisions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!stale) setDecisions([]);
      })
      .finally(() => {
        if (!stale) setDecisionsLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [activeBoardId, demo, consilium]);

  const selectedOrgName = selectedOrgId ? orgs.find((o) => o.id === selectedOrgId)?.name || '' : '';
  const subtitle = selectedOrgName
    ? `Decisions for ${selectedOrgName}`
    : 'Decisions across all your AI boards';
  const orgNameForBoard = (boardId) =>
    (orgs || []).find((o) => o.consilium_id === boardId)?.name || '—';

  if (loading) {
    return (
      <PanelCard title="Consilium Activity" subtitle={subtitle}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
          <Skeleton
            variant="rounded"
            width={180}
            height={150}
            animation="wave"
            sx={{ borderRadius: 2 }}
          />
          <Skeleton
            variant="rounded"
            width={180}
            height={150}
            animation="wave"
            sx={{ borderRadius: 2 }}
          />
        </Box>
        <Skeleton variant="rounded" height={140} animation="wave" sx={{ borderRadius: 2 }} />
      </PanelCard>
    );
  }

  const multiBoard = boards.length > 1;

  return (
    <PanelCard title="Consilium Activity" subtitle={subtitle}>
      {/* Aggregate gauges + interactive counts */}
      <Box
        ref={contentRef}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: { xs: 2, sm: 3 },
          justifyContent: { xs: 'center', sm: 'flex-start' },
          mb: boards.length ? 1 : 0,
        }}
      >
        <Box sx={{ ...staggerSx(0, inView), width: 180 }}>
          <GaugeKpi
            label="Approval"
            value={Number(totals.approvalRate) || 0}
            target={100}
            format="percent"
            height={150}
          />
        </Box>
        <Box sx={{ ...staggerSx(1, inView), width: 180 }}>
          <GaugeKpi
            label="Avg Score"
            value={Number(totals.avgScore) || 0}
            target={10}
            height={150}
          />
        </Box>
        <Box
          sx={{
            ...staggerSx(2, inView),
            display: 'flex',
            flexDirection: { xs: 'row', sm: 'column' },
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: { xs: 'center', sm: 'flex-start' },
            gap: { xs: 2.5, sm: 1.5 },
            py: 1,
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          {/* Boards — shows the active board name; opens a picker when multiple. */}
          <CountStat
            iconNode={
              <AppIcon name="GavelOutlined" fallback={GavelOutlinedIcon} sx={{ fontSize: 15 }} />
            }
            label="Boards"
            value={totals.boards ?? boards.length}
            sublabel={activeBoard ? activeBoard.name : 'Boards'}
            onClick={multiBoard ? (e) => setBoardAnchor(e.currentTarget) : undefined}
            trailing={
              multiBoard ? (
                <AppIcon
                  name="ExpandMoreRounded"
                  fallback={ExpandMoreRoundedIcon}
                  sx={{ fontSize: 16, color: 'text.secondary' }}
                />
              ) : null
            }
          />
          {/* Members — inline preview of up to 3, with a "More" button for the rest. */}
          <MembersStat
            iconNode={
              <AppIcon name="GroupsOutlined" fallback={GroupsOutlinedIcon} sx={{ fontSize: 15 }} />
            }
            total={totals.members ?? 0}
            members={members}
            loading={membersLoading}
            onMore={(e) => setMemberAnchor(e.currentTarget)}
          />
          <CountStat
            iconNode={
              <AppIcon
                name="AssignmentTurnedInOutlined"
                fallback={AssignmentTurnedInOutlinedIcon}
                sx={{ fontSize: 15 }}
              />
            }
            label="Decisions"
            value={totals.decisions ?? 0}
          />
        </Box>
      </Box>
      {/* Board picker popover */}
      <Popover
        open={Boolean(boardAnchor)}
        anchorEl={boardAnchor}
        onClose={() => setBoardAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: 260,
              maxHeight: 360,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            px: 1.5,
            pt: 1.5,
            pb: 0.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: 'text.secondary',
          }}
        >
          Select a board
        </Typography>
        <Box sx={{ pb: 1 }}>
          {boards.map((b) => (
            <Box
              key={b.id}
              component="button"
              type="button"
              onClick={() => {
                setActiveBoardId(b.id);
                setBoardAnchor(null);
              }}
              sx={{
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                width: '100%',
                appearance: 'none',
                border: 'none',
                background:
                  b.id === activeBoardId ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1,
                cursor: 'pointer',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
              }}
            >
              <AppIcon
                name="GavelOutlined"
                fallback={GavelOutlinedIcon}
                sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }}
              />
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  flexGrow: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {b.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {b.memberCount} · {b.decisions} dec
              </Typography>
            </Box>
          ))}
        </Box>
      </Popover>
      {/* Members popover */}
      <Popover
        open={Boolean(memberAnchor)}
        anchorEl={memberAnchor}
        onClose={() => setMemberAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: 280,
              maxHeight: 360,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            px: 1.5,
            pt: 1.5,
            pb: 0.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: 'text.secondary',
          }}
        >
          {activeBoard ? `${activeBoard.name} — members` : 'Members'}
        </Typography>
        <Box sx={{ pb: 1, maxHeight: 300, overflowY: 'auto' }}>
          {membersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : members.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1.5 }}>
              No members yet.
            </Typography>
          ) : (
            members.map((m) => (
              <Box
                key={m.id || m.name}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75 }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    bgcolor: alpha(theme.palette.primary.main, 0.14),
                    color: 'primary.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '0.7rem',
                    fontWeight: 800,
                  }}
                >
                  {(m.name || '?').slice(0, 1).toUpperCase()}
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 'auto', flexShrink: 0 }}
                >
                  ({roleLabel(m.role)})
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Popover>
      {/* Empty state */}
      {boards.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: onAttachBoard ? 1.5 : 0 }}>
            {selectedOrgName
              ? `No Consilium board for ${selectedOrgName}.`
              : 'No Consilium boards yet.'}
          </Typography>
          {onAttachBoard && (
            <Button
              size="small"
              variant="outlined"
              startIcon={
                <AppIcon name="GavelOutlined" fallback={GavelOutlinedIcon} sx={{ fontSize: 16 }} />
              }
              onClick={() => onAttachBoard(selectedOrgId)}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              {selectedOrgName ? 'Attach a board' : 'Create a board'}
            </Button>
          )}
        </Box>
      ) : (
        <>
          {/* Per-board breakdown rows (multi-board overview; deep-links out) */}
          <Box>
            {boards.map((b, i) => {
              const interactive = typeof onBoardClick === 'function';
              return (
                <Box
                  key={b.id}
                  component={interactive ? 'button' : 'div'}
                  type={interactive ? 'button' : undefined}
                  onClick={interactive ? () => onBoardClick(b.id) : undefined}
                  sx={{
                    ...staggerSx(i, inView, { base: 250 }),
                    font: 'inherit',
                    color: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.75,
                    appearance: 'none',
                    background:
                      b.id === activeBoardId
                        ? alpha(theme.palette.primary.main, 0.05)
                        : 'transparent',
                    border: 'none',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    textAlign: 'left',
                    width: '100%',
                    px: 1,
                    py: 1.25,
                    cursor: interactive ? 'pointer' : 'default',
                    transition: 'background-color 0.15s',
                    '&:hover': interactive
                      ? { bgcolor: alpha(theme.palette.primary.main, 0.08) }
                      : undefined,
                    '&:focus-visible': interactive
                      ? { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 }
                      : undefined,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        minWidth: 0,
                        flexGrow: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.name}
                    </Typography>
                    <StatusChip status={b.status} />
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {orgNameForBoard(b.id)} · {b.memberCount} members
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      flexWrap: 'wrap',
                      mt: 0.25,
                    }}
                  >
                    <ApprovalBar value={b.approvalRate} inView={inView} delay={300 + i * 60} />
                    <ScorePill score={b.avgScore} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      {Number(b.decisions) || 0} dec
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Latest decisions carousel for the active board */}
          <Box sx={{ mt: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  color: 'text.secondary',
                }}
              >
                Latest decisions
              </Typography>
              {activeBoard && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  · {activeBoard.name}
                </Typography>
              )}
            </Box>
            {decisionsLoading ? (
              <Box sx={{ display: 'flex', gap: 1.25 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    variant="rounded"
                    width={230}
                    height={120}
                    animation="wave"
                    sx={{ borderRadius: 2.5, flex: '0 0 auto' }}
                  />
                ))}
              </Box>
            ) : decisions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
                No decisions recorded for this board yet.
              </Typography>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  gap: 1.25,
                  overflowX: 'auto',
                  pb: 1,
                  mx: -0.5,
                  px: 0.5,
                  scrollSnapType: 'x mandatory',
                  WebkitOverflowScrolling: 'touch',
                  '&::-webkit-scrollbar': { height: 6 },
                  '&::-webkit-scrollbar-thumb': {
                    bgcolor: alpha(theme.palette.text.primary, 0.15),
                    borderRadius: 3,
                  },
                }}
              >
                {decisions.map((d) => (
                  <DecisionCard key={d.id} decision={d} />
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </PanelCard>
  );
}
