/**
 * EntityCard - one card per usage-directory item.
 *
 * Renders a single goal/agent/team/consilium/organization with its LLM usage
 * rollup: header (icon + name + status chip), a 3-col mini-metrics grid
 * (Calls / Total Tokens / Cost), a secondary row of the entity's own counts +
 * relations, and a footer with createdAt and an optional external-link button
 * (when item.link is set). The whole card is clickable to drill down via the
 * onOpen(item) callback. Visible fields are driven by a small per-entity config
 * so each type surfaces the relations that matter for it.
 */
import { Box, Paper, Typography, Chip, IconButton, Tooltip, alpha, useTheme } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';
import { formatTokens } from '../../utils/formatTokens';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

import AppIcon from '../icons/AppIcon';

// ── Per-entity field config ──────────────────────────────────────
// icon: header icon; color: accent palette key; counts(): the secondary
// chip row (label + value) derived from the item's counts/relations.

const STATUS_COLORS = {
  active: 'success',
  running: 'info',
  completed: 'success',
  done: 'success',
  pending: 'warning',
  draft: 'default',
  failed: 'error',
  error: 'error',
  cancelled: 'default',
  archived: 'default',
};

function statusColor(status) {
  if (!status) return 'default';
  return STATUS_COLORS[String(status).toLowerCase()] || 'default';
}

/** "12" / "1,200" style integer; "0" for empty (never em dash). */
function fmtInt(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Compact token label for the metrics grid; "0" when empty. */
function fmtTokens(value) {
  return formatTokens(value) || '0';
}

/** Cost with small-amount precision so sub-cent spend stays visible. */
function fmtCost(value) {
  const v = Number(value || 0);
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return formatCurrency(v);
}

/** Short date label, "-" when missing. */
function fmtDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

const ENTITY_CONFIG = {
  goal: {
    icon: FlagOutlinedIcon,
    color: 'primary',
    relations: (item) => {
      const rel = [];
      if (item.organization?.name)
        rel.push({ label: 'Organization', value: item.organization.name });
      if (item.consilium?.name) rel.push({ label: 'Consilium', value: item.consilium.name });
      if (item.team?.name) rel.push({ label: 'Team', value: item.team.name });
      if (item.agentsUsed != null) rel.push({ label: 'Agents', value: fmtInt(item.agentsUsed) });
      return rel;
    },
  },
  organization: {
    icon: CorporateFareOutlinedIcon,
    color: 'secondary',
    relations: (item) => {
      const c = item.counts || {};
      const rel = [];
      if (item.orgType) rel.push({ label: 'Type', value: item.orgType });
      if (item.parentCompany?.name) rel.push({ label: 'Parent', value: item.parentCompany.name });
      rel.push({ label: 'Goals', value: fmtInt(c.goals) });
      rel.push({ label: 'Teams', value: fmtInt(c.teams) });
      rel.push({ label: 'Agents', value: fmtInt(c.agents) });
      return rel;
    },
  },
  consilium: {
    icon: GavelOutlinedIcon,
    color: 'info',
    relations: (item) => {
      const c = item.counts || {};
      return [
        { label: 'Goals', value: fmtInt(c.goals) },
        { label: 'Completed', value: fmtInt(c.goalsCompleted) },
        { label: 'Teams', value: fmtInt(c.teams) },
        { label: 'Agents', value: fmtInt(c.agents) },
      ];
    },
  },
  team: {
    icon: GroupsOutlinedIcon,
    color: 'warning',
    relations: (item) => {
      const c = item.counts || {};
      return [
        { label: 'Members', value: fmtInt(c.members) },
        { label: 'Goals', value: fmtInt(c.goals) },
        { label: 'Completed', value: fmtInt(c.goalsCompleted) },
        { label: 'Agents', value: fmtInt(c.agents) },
      ];
    },
  },
  agent: {
    icon: SmartToyOutlinedIcon,
    color: 'success',
    relations: (item) => {
      const c = item.counts || {};
      return [
        { label: 'Goals', value: fmtInt(c.goalsUsedIn) },
        { label: 'Completed', value: fmtInt(c.goalsCompleted) },
      ];
    },
  },
};

export default function EntityCard({ entity = 'goal', item, onOpen }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const config = ENTITY_CONFIG[entity] || ENTITY_CONFIG.goal;
  const Icon = config.icon;
  const accent = theme.palette[config.color]?.main || theme.palette.primary.main;

  const usage = item?.usage || {};
  const relations = config.relations(item || {});
  const hasError = Number(usage.errorCalls || 0) > 0;

  const handleOpenLink = (e) => {
    e.stopPropagation();
    if (item?.link) navigate(item.link);
  };

  const metrics = [
    { label: 'Calls', value: fmtInt(usage.calls) },
    { label: 'Total Tokens', value: fmtTokens(usage.totalTokens) },
    { label: 'Cost', value: fmtCost(usage.cost), accent: true },
  ];

  return (
    <Paper
      variant="outlined"
      data-testid={`entity-card-${item?.id}`}
      onClick={() => onOpen?.(item)}
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        borderRadius: 2.5,
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: 'primary.main',
          transform: 'translateY(-2px)',
          boxShadow: createHoverGlowShadow(theme),
        },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            flexShrink: 0,
            bgcolor: alpha(accent, 0.14),
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon fallback={Icon} sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
            {item?.name || 'Unknown'}
          </Typography>
          {item?.status && (
            <Chip
              label={item.status}
              size="small"
              color={statusColor(item.status)}
              variant="outlined"
              sx={{
                height: 18,
                fontSize: '0.62rem',
                fontWeight: 600,
                mt: 0.35,
                textTransform: 'capitalize',
              }}
            />
          )}
        </Box>
      </Box>
      {/* Mini-metrics grid */}
      <Paper
        elevation={0}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 0.5,
          p: 1.25,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.text.primary, 0.02),
          border: '1px solid',
          borderColor: alpha(theme.palette.text.primary, 0.05),
        }}
      >
        {metrics.map((m) => (
          <Box key={m.label} sx={{ textAlign: 'center', minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.58rem',
                fontWeight: 600,
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {m.label}
            </Typography>
            <Typography
              noWrap
              sx={{
                fontSize: '0.95rem',
                fontWeight: 800,
                color: m.accent ? 'success.main' : 'text.primary',
              }}
            >
              {m.value}
            </Typography>
          </Box>
        ))}
      </Paper>
      {/* Labeled relations meta */}
      {relations.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 0.75,
          }}
        >
          {relations.map((r) => (
            <Box key={r.label} sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: '0.56rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                }}
              >
                {r.label}
              </Typography>
              <Typography
                noWrap
                title={String(r.value)}
                sx={{ fontSize: '0.8rem', fontWeight: 600 }}
              >
                {r.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {/* Error indicator */}
      {hasError && (
        <Box>
          <Chip
            label={`${fmtInt(usage.errorCalls)} errors`}
            size="small"
            color="error"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.65rem' }}
          />
        </Box>
      )}
      {/* Footer */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mt: 'auto',
          pt: 0.25,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {fmtDate(item?.createdAt)}
        </Typography>
        {item?.link && (
          <Tooltip title="Open">
            <IconButton
              size="small"
              onClick={handleOpenLink}
              aria-label={`Open ${item?.name || 'item'}`}
              sx={{ color: 'primary.main' }}
            >
              <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Paper>
  );
}
