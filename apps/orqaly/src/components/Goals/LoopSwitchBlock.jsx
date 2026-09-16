/**
 * LoopSwitchBlock — reusable "Loop this goal" toggle with explainer.
 *
 * Rendered in 3 contexts:
 *   "create"    — inside the New Goal dialog (controls the create-payload flag)
 *   "open"      — at the top of the Pipeline tab on an open goal
 *   "completed" — inside FinalResultsSection after a goal finishes; also
 *                 surfaces a "Review continuation →" button when the loop
 *                 has already spawned a child.
 *
 * Visual shape matches the existing Theory Mode block in GoalCreateDialog.
 */
import { Box, Typography, Switch, Button, Chip, useTheme, alpha, Tooltip } from '@mui/material';
import LoopOutlinedIcon from '@mui/icons-material/LoopOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

import AppIcon from '../icons/AppIcon';

const EXPLAINER = {
  create:
    "Keep going automatically. When this goal finishes, its next steps, risks, and roadmap become the brief for a new goal. Each new goal also refines this goal's deliverables with the latest strategy. Turn off any time to stop the chain.",
  open: 'Loop is on while this stays checked. On completion, a continuation goal will spawn and pick up where this one leaves off — until you toggle off here or on the latest goal in the chain.',
  completed:
    "This goal is done. Toggle on to keep going — a continuation will spawn from this goal's next steps, risks, and roadmap. The continuation will also refine this goal's deliverables with its new strategy.",
};

export default function LoopSwitchBlock({
  value = false,
  onChange,
  context = 'open',
  disabled = false,
  loopPaused = false,
  loopPausedReason = null,
  continuationGoalId = null,
  onOpenContinuation = null,
  loopDepth = 0,
  chainSpendUsd = null,
  chainGoalCount = null,
  sx = {},
}) {
  const theme = useTheme();
  const active = !!value;
  const showContinuation = context === 'completed' && continuationGoalId;
  const showChainStats = (loopDepth > 0 || chainGoalCount > 1) && typeof chainSpendUsd === 'number';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1.5,
        borderRadius: 2,
        bgcolor: active
          ? alpha(theme.palette.primary.main, 0.06)
          : alpha(theme.palette.text.primary, 0.03),
        border: '1px solid',
        borderColor: active ? alpha(theme.palette.primary.main, 0.25) : 'divider',
        transition: 'all 0.2s',
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <AppIcon
          name="LoopOutlined"
          fallback={LoopOutlinedIcon}
          sx={{ fontSize: 22, color: active ? 'primary.main' : 'text.secondary' }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                fontSize: '0.85rem',
                color: active ? 'primary.main' : 'text.primary',
              }}
            >
              Loop this goal
            </Typography>
            {loopPaused && (
              <Tooltip title={loopPausedReason || 'Chain paused — toggle to re-enable'} arrow>
                <Chip
                  size="small"
                  icon={
                    <AppIcon
                      name="WarningAmberOutlined"
                      fallback={WarningAmberOutlinedIcon}
                      sx={{ fontSize: 14 }}
                    />
                  }
                  label="Paused"
                  color="warning"
                  variant="outlined"
                  sx={{ fontSize: '0.6rem', height: 18 }}
                />
              </Tooltip>
            )}
            {showChainStats && (
              <Chip
                size="small"
                label={`${chainGoalCount || 1} goals · $${Number(chainSpendUsd).toFixed(2)}`}
                variant="outlined"
                sx={{ fontSize: '0.6rem', height: 18 }}
              />
            )}
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.7rem', display: 'block', mt: 0.25, lineHeight: 1.45 }}
          >
            {EXPLAINER[context] || EXPLAINER.open}
          </Typography>
        </Box>
        <Switch
          checked={active}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
          size="small"
          color="primary"
        />
      </Box>
      {showContinuation && (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
            pt: 0.5,
            borderTop: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <Typography
            variant="caption"
            sx={{ flex: 1, fontSize: '0.7rem', color: 'text.secondary' }}
          >
            A continuation has already spawned from this goal.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            endIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 14 }} />}
            onClick={() => onOpenContinuation?.(continuationGoalId)}
            sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.25 }}
          >
            Review continuation
          </Button>
        </Box>
      )}
    </Box>
  );
}
