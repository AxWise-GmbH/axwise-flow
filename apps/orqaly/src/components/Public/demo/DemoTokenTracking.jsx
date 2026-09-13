import { Box, Chip, LinearProgress, Stack, Typography, alpha, useTheme } from '@mui/material';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import { formatTokens } from '../../../utils/formatTokens';

import AppIcon from '../../icons/AppIcon';

const GOAL_TITLE = 'Launch Pro tier pricing page by Friday';

const STEPS = [
  { phase: 'Research', model: 'Groq', tokens: '1.2k', cost: '$0.02', highlight: false },
  { phase: 'Draft copy', model: 'GPT-4o', tokens: '3.4k', cost: '$0.11', highlight: true },
  { phase: 'Brand review', model: 'Claude', tokens: '890', cost: '$0.04', highlight: false },
  { phase: 'QA pass', model: 'GPT-4o', tokens: '620', cost: '$0.03', highlight: false },
];

const TOKEN_SUMMARY = {
  total: 6110,
  prompt: 4220,
  completion: 1890,
  costUsd: 0.2,
  budgetUsd: 2.0,
  calls: 4,
  activePhase: 'Build',
  activePhaseCost: 0.11,
};

const PHASE_BARS = [
  { label: 'Plan', tokens: 1340, pct: 0.22 },
  { label: 'Build', tokens: 2930, pct: 0.48 },
  { label: 'Review', tokens: 1840, pct: 0.3 },
];

const MODEL_BREAKDOWN = [
  { model: 'Groq', tokens: 1200 },
  { model: 'GPT-4o', tokens: 4020 },
  { model: 'Claude', tokens: 890 },
];

function MiniStat({ label, value, sub, color, accent }) {
  const theme = useTheme();
  const tone = color || theme.palette.text.primary;
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1.5,
        bgcolor: alpha(accent || theme.palette.primary.main, 0.06),
        border: '1px solid',
        borderColor: alpha(accent || theme.palette.primary.main, 0.18),
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: '0.58rem',
          fontWeight: 700,
          color: 'text.disabled',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: tone, lineHeight: 1.2, mt: 0.25 }}>
        {value}
      </Typography>
      {sub ? (
        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.2 }}>
          {sub}
        </Typography>
      ) : null}
    </Box>
  );
}

export default function DemoTokenTracking() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const success = theme.palette.success.main;
  const info = theme.palette.info.main;
  const warning = theme.palette.warning.main;
  const isDark = theme.palette.mode === 'dark';

  const remaining = TOKEN_SUMMARY.budgetUsd - TOKEN_SUMMARY.costUsd;
  const budgetPct = Math.min(100, (TOKEN_SUMMARY.costUsd / TOKEN_SUMMARY.budgetUsd) * 100);

  return (
    <Box
      role="img"
      aria-label="Orqaly token tracking: per-step token usage, costs, and model switching inside a goal"
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: 2.5,
          py: 1.25,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Stack direction="row" spacing={0.6}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#FF5F57', 0.7) }} />
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#FEBC2E', 0.7) }} />
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#28C840', 0.7) }} />
        </Stack>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', flex: 1, textAlign: 'center' }}>
          orqaly.com / goals / token-tracking
        </Typography>
        <Box sx={{ width: 36 }} />
      </Stack>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1.5,
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AppIcon
            name='TrackChangesOutlined'
            fallback={TrackChangesOutlinedIcon}
            sx={{ fontSize: 18 }} />
        </Box>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: { xs: '0.82rem', md: '0.88rem' },
              color: 'text.primary',
              lineHeight: 1.3,
            }}
          >
            {GOAL_TITLE}
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.72rem' }, color: 'text.secondary' }}>
            {TOKEN_SUMMARY.calls} steps · live token burn
          </Typography>
        </Stack>
        <Chip
          label={`${formatTokens(TOKEN_SUMMARY.total)} total`}
          size="small"
          sx={{
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            fontWeight: 700,
            fontSize: '0.68rem',
            height: 22,
            flexShrink: 0,
          }}
        />
      </Stack>
      <Stack spacing={1} sx={{ p: { xs: 1.75, md: 2.25 } }}>
        {STEPS.map((step) => (
          <Stack
            key={step.phase}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 1, sm: 1.25 }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            sx={{
              p: { xs: 1.25, md: 1.5 },
              borderRadius: 2,
              border: `1px solid ${step.highlight ? alpha(primary, 0.45) : theme.palette.divider}`,
              bgcolor: step.highlight
                ? alpha(primary, isDark ? 0.08 : 0.06)
                : isDark
                  ? alpha('#fff', 0.02)
                  : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '0.78rem', md: '0.82rem' },
                  color: 'text.primary',
                }}
              >
                {step.phase}
              </Typography>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                <Chip
                  label={step.model}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    bgcolor: alpha(theme.palette.text.primary, 0.06),
                    color: 'text.secondary',
                  }}
                />
                <Typography sx={{ fontSize: { xs: '0.72rem', md: '0.75rem' }, color: 'text.secondary' }}>
                  {step.tokens} tokens · {step.cost}
                </Typography>
              </Stack>
            </Box>
            {step.highlight ? (
              <Chip
                icon={<AppIcon
                  name='SwapHorizOutlined'
                  fallback={SwapHorizOutlinedIcon}
                  sx={{ fontSize: '14px !important' }} />}
                label="Switch model"
                size="small"
                variant="outlined"
                sx={{
                  borderColor: alpha(primary, 0.5),
                  color: 'primary.main',
                  fontWeight: 700,
                  fontSize: '0.68rem',
                  height: 26,
                  flexShrink: 0,
                }}
              />
            ) : null}
          </Stack>
        ))}
      </Stack>
      <Box
        sx={{
          px: { xs: 2, md: 2.5 },
          py: { xs: 1.5, md: 2 },
          borderTop: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Typography
          sx={{
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            mb: 1.25,
          }}
        >
          Amount of tokens
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
            mb: 1,
          }}
        >
          <MiniStat
            label="Tokens"
            value={TOKEN_SUMMARY.total.toLocaleString()}
            sub={`${TOKEN_SUMMARY.prompt.toLocaleString()} in · ${TOKEN_SUMMARY.completion.toLocaleString()} out`}
            accent={primary}
          />
          <MiniStat
            label="Cost"
            value={`$${TOKEN_SUMMARY.costUsd.toFixed(2)}`}
            sub={`of $${TOKEN_SUMMARY.budgetUsd.toFixed(2)} budget`}
            color="primary.main"
            accent={warning}
          />
          <MiniStat
            label="Remaining"
            value={`$${remaining.toFixed(2)}`}
            sub={`${budgetPct.toFixed(0)}% used`}
            color={success}
            accent={success}
          />
          <MiniStat
            label="Now"
            value={TOKEN_SUMMARY.activePhase}
            sub={`$${TOKEN_SUMMARY.activePhaseCost.toFixed(2)} this phase`}
            accent={info}
          />
        </Box>

        <LinearProgress
          variant="determinate"
          value={budgetPct}
          color="success"
          sx={{ height: 6, borderRadius: 3, mb: 1.5 }}
        />

        <Typography
          sx={{
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'text.disabled',
            mb: 0.75,
          }}
        >
          By model
        </Typography>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {MODEL_BREAKDOWN.map(({ model, tokens }) => (
            <Chip
              key={model}
              label={`${model} ${formatTokens(tokens)}`}
              size="small"
              variant="outlined"
              sx={{
                height: 24,
                fontSize: '0.68rem',
                fontWeight: 700,
                borderColor: alpha(primary, 0.35),
                color: 'text.secondary',
              }}
            />
          ))}
          <Chip
            label={`${TOKEN_SUMMARY.calls} calls · ${MODEL_BREAKDOWN.length} models`}
            size="small"
            sx={{
              height: 24,
              fontSize: '0.65rem',
              fontWeight: 600,
              bgcolor: alpha(theme.palette.text.primary, 0.06),
              color: 'text.secondary',
            }}
          />
        </Stack>

        <Typography
          sx={{
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            mb: 1,
          }}
        >
          Spend by phase
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="flex-end" sx={{ height: 72, mb: 1.25 }}>
          {PHASE_BARS.map(({ label, tokens, pct }) => (
            <Stack
              key={label}
              alignItems="center"
              justifyContent="flex-end"
              sx={{ flex: 1, minWidth: 0, height: '100%' }}
            >
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  color: 'text.primary',
                  mb: 0.5,
                  lineHeight: 1,
                }}
              >
                {formatTokens(tokens)}
              </Typography>
              <Box
                sx={{
                  width: '100%',
                  maxWidth: 48,
                  height: Math.round(48 * pct),
                  minHeight: 12,
                  borderRadius: 1,
                  bgcolor: alpha(primary, 0.35 + pct * 0.4),
                  mx: 'auto',
                }}
              />
              <Typography
                sx={{
                  fontSize: '0.65rem',
                  color: 'text.secondary',
                  mt: 0.75,
                  fontWeight: 600,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {label}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.6rem',
                  color: 'text.disabled',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                {Math.round(pct * 100)}%
              </Typography>
            </Stack>
          ))}
        </Stack>

        <Typography
          sx={{
            fontSize: '0.72rem',
            color: 'text.secondary',
            textAlign: { xs: 'left', sm: 'right' },
          }}
        >
          Best result on Draft copy · GPT-4o
        </Typography>
      </Box>
    </Box>
  );
}
