/**
 * [module: frontend]
 * GoalActionsMenu — sectioned Actions dropdown for GoalDetailDialog.
 */
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Divider,
  Box,
  Button,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import HealingOutlinedIcon from '@mui/icons-material/HealingOutlined';
import PauseCircleOutlinedIcon from '@mui/icons-material/PauseCircleOutlined';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import LoopOutlinedIcon from '@mui/icons-material/LoopOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GlassIcon from '../icons/GlassIcon';

const SECTION_SX = {
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: 'text.disabled',
  lineHeight: '28px',
  bgcolor: 'background.paper',
};

export default function GoalActionsMenu({
  anchorEl,
  open,
  onClose,
  goal,
  onSetupTools,
  onCloseDialog,
  onHeal,
  onAction,
  onOpenDialog,
  onOpenContinuation,
  fullView,
  onToggleFullView,
  // The Simple goal thread. Two of these controls are answered by the thread
  // itself there, and offering them again from a menu is offering a second,
  // worse route to something already on screen.
  simple = false,
}) {
  const theme = useTheme();
  const glow = theme.palette.primary.main;
  if (!goal) return null;

  const closeAnd = (fn) => () => {
    onClose();
    fn?.();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { sx: { minWidth: 220, bgcolor: 'background.paper', backgroundImage: 'none' } },
      }}
    >
      {/* ── Contextual status actions ── */}
      {goal.status === 'awaiting_tools' && (
        <MenuItem
          onClick={closeAnd(() => {
            onSetupTools?.(goal);
            onCloseDialog?.();
          })}
        >
          <ListItemIcon>
            <GlassIcon name="Build" fallback={BuildOutlinedIcon} size={20} tone="info" />
          </ListItemIcon>
          <ListItemText>Setup Tools</ListItemText>
        </MenuItem>
      )}
      {['failed', 'needs_human', 'awaiting_tools', 'paused', 'awaiting_po_input'].includes(
        goal.status
      ) && (
        <MenuItem onClick={closeAnd(onHeal)}>
          <ListItemIcon>
            <GlassIcon
              name="HealingOutlined"
              fallback={HealingOutlinedIcon}
              size={20}
              tone="warning"
            />
          </ListItemIcon>
          <ListItemText>Heal Now</ListItemText>
        </MenuItem>
      )}
      {goal.status === 'active' && (
        <MenuItem onClick={closeAnd(() => onAction('pause'))}>
          <ListItemIcon>
            <GlassIcon
              name="PauseCircleOutlined"
              fallback={PauseCircleOutlinedIcon}
              size={20}
              tone="warning"
            />
          </ListItemIcon>
          <ListItemText>Pause</ListItemText>
        </MenuItem>
      )}
      {goal.status === 'paused' && (
        <MenuItem onClick={closeAnd(() => onAction('resume'))}>
          <ListItemIcon>
            <GlassIcon
              name="PlayCircleOutlined"
              fallback={PlayCircleOutlinedIcon}
              size={20}
              tone="success"
            />
          </ListItemIcon>
          <ListItemText>Resume</ListItemText>
        </MenuItem>
      )}

      {/* ── Organizations Control ── */}
      <ListSubheader disableSticky sx={SECTION_SX}>
        Organizations Control
      </ListSubheader>
      <MenuItem onClick={closeAnd(() => onOpenDialog('adopt'))}>
        <ListItemIcon>
          <GlassIcon
            name="BusinessOutlined"
            fallback={BusinessOutlinedIcon}
            size={20}
            tone="brand"
          />
        </ListItemIcon>
        <ListItemText>Adopt to New Business</ListItemText>
      </MenuItem>
      <MenuItem onClick={closeAnd(() => onOpenDialog('implement'))}>
        <ListItemIcon>
          <GlassIcon
            name="Build"
            fallback={IntegrationInstructionsOutlinedIcon}
            size={20}
            tone="info"
          />
        </ListItemIcon>
        <ListItemText>Implement in Existing</ListItemText>
      </MenuItem>

      {/* ── Goal Settings ── */}
      <ListSubheader disableSticky sx={SECTION_SX}>
        Goal Settings
      </ListSubheader>
      {goal.loop_enabled === false ? (
        <MenuItem onClick={closeAnd(() => onAction('toggle-loop-on'))}>
          <ListItemIcon>
            <GlassIcon name="Sync" fallback={SyncOutlinedIcon} size={20} tone="brand" />
          </ListItemIcon>
          <ListItemText>Loop this request ON</ListItemText>
        </MenuItem>
      ) : (
        <MenuItem onClick={closeAnd(() => onAction('toggle-loop-off'))}>
          <ListItemIcon>
            <GlassIcon name="Sync" fallback={SyncOutlinedIcon} size={20} tone="neutral" />
          </ListItemIcon>
          <ListItemText>Loop this request OFF</ListItemText>
        </MenuItem>
      )}
      <MenuItem onClick={closeAnd(() => onOpenDialog('pulse'))}>
        <ListItemIcon>
          <GlassIcon
            name="LightbulbOutlined"
            fallback={LightbulbOutlinedIcon}
            size={20}
            tone="warning"
          />
        </ListItemIcon>
        <ListItemText>Add Pulse</ListItemText>
      </MenuItem>
      <MenuItem onClick={closeAnd(() => onOpenDialog('workflow'))}>
        <ListItemIcon>
          <GlassIcon
            name="AccountTreeOutlined"
            fallback={AccountTreeOutlinedIcon}
            size={20}
            tone="info"
          />
        </ListItemIcon>
        <ListItemText>{goal.workflow_id ? 'Change Workflow' : 'Attach Workflow'}</ListItemText>
      </MenuItem>
      {goal.autopilot_enabled === false ? (
        <MenuItem onClick={closeAnd(() => onAction('toggle-autopilot-on'))}>
          <ListItemIcon>
            <GlassIcon
              name="PlayCircleOutlined"
              fallback={PlayCircleOutlinedIcon}
              size={20}
              tone="success"
            />
          </ListItemIcon>
          <ListItemText>Turn Autopilot ON</ListItemText>
        </MenuItem>
      ) : (
        <MenuItem onClick={closeAnd(() => onAction('toggle-autopilot-off'))}>
          <ListItemIcon>
            <GlassIcon
              name="PauseCircleOutlined"
              fallback={PauseCircleOutlinedIcon}
              size={20}
              tone="neutral"
            />
          </ListItemIcon>
          <ListItemText>Turn Autopilot OFF</ListItemText>
        </MenuItem>
      )}
      {/* Goal View toggle. Advanced only: Simple has its own Thread/Dashboard
          switch in the run header, governing the surface the user is looking
          at, and a second view control in a menu was a different answer to the
          same question. */}
      {!simple && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ px: 1.5, py: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'text.secondary',
                }}
              >
                Goal View
              </Typography>
              {/* Pill toggle */}
              <Box
                sx={{
                  position: 'relative',
                  display: 'flex',
                  borderRadius: 999,
                  bgcolor: alpha(glow, 0.06),
                  border: '1px solid',
                  borderColor: alpha(glow, 0.15),
                  p: '2px',
                  minWidth: 120,
                }}
              >
                {/* Sliding indicator */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 2,
                    left: fullView ? 'calc(50% + 1px)' : 2,
                    width: 'calc(50% - 3px)',
                    height: 'calc(100% - 4px)',
                    borderRadius: 999,
                    bgcolor: glow,
                    boxShadow: `0 0 8px ${alpha(glow, 0.35)}, 0 0 2px ${alpha(glow, 0.5)}`,
                    transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 0,
                  }}
                />
                <Box
                  component="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (fullView) {
                      onToggleFullView?.();
                    }
                    onClose();
                  }}
                  sx={{
                    all: 'unset',
                    position: 'relative',
                    zIndex: 1,
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 0.5,
                    px: 1,
                    cursor: 'pointer',
                    borderRadius: 999,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    color: !fullView ? '#0a0f0d' : alpha(glow, 0.6),
                    transition: 'color 0.2s ease',
                    userSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Short
                </Box>
                <Box
                  component="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!fullView) {
                      onToggleFullView?.();
                    }
                    onClose();
                  }}
                  sx={{
                    all: 'unset',
                    position: 'relative',
                    zIndex: 1,
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 0.5,
                    px: 1,
                    cursor: 'pointer',
                    borderRadius: 999,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    color: fullView ? '#0a0f0d' : alpha(glow, 0.6),
                    transition: 'color 0.2s ease',
                    userSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Full
                </Box>
              </Box>
            </Box>
          </Box>
        </>
      )}
      {goal.continuation_goal_id && (
        <MenuItem
          onClick={closeAnd(() => {
            onOpenContinuation?.(goal.continuation_goal_id);
            onCloseDialog?.();
          })}
        >
          <ListItemIcon>
            <GlassIcon name="OpenInNew" fallback={OpenInNewIcon} size={20} tone="brand" />
          </ListItemIcon>
          <ListItemText>Review continuation →</ListItemText>
        </MenuItem>
      )}

      {/* ── Destructive ── */}
      {!['completed', 'failed', 'cancelled'].includes(goal.status) && [
        <Divider key="cancel-divider" sx={{ my: 0.5 }} />,
        <MenuItem key="cancel" onClick={closeAnd(() => onAction('cancel'))}>
          <ListItemIcon>
            <GlassIcon name="Close" fallback={CancelOutlinedIcon} size={20} tone="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Cancel Goal</ListItemText>
        </MenuItem>,
      ]}
      <Box sx={{ px: 1.25, pt: 0.5, pb: 0.25 }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={closeAnd(() => onAction('delete'))}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.75rem',
            borderRadius: 2,
            py: 0.65,
            color: 'error.main',
            borderColor: alpha(theme.palette.error.main, 0.35),
            '&:hover': {
              borderColor: 'error.main',
              bgcolor: alpha(theme.palette.error.main, 0.08),
            },
          }}
        >
          Remove Goal
        </Button>
      </Box>

      {/* Talk with Team-Lead. Advanced only: in Simple the composer under the
          thread already sends to the team lead, so this opened a second chat
          about the same goal, in a dialog over the conversation it duplicates. */}
      {!simple && [
        <Divider key="lead-divider" sx={{ my: 0.75 }} />,
        <Box key="lead-chat" sx={{ px: 1.25, pb: 1.25, pt: 0.25 }}>
          <Button
            fullWidth
            variant="contained"
            startIcon={
              <GlassIcon
                name="SpeechBubble"
                fallback={ForumOutlinedIcon}
                size={18}
                tone="neutral"
              />
            }
            onClick={closeAnd(() => onOpenDialog('leadChat'))}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.78rem',
              borderRadius: 2,
              py: 0.85,
              background: `linear-gradient(135deg, ${glow}, ${theme.palette.primary.dark || glow})`,
              boxShadow: `0 0 10px ${alpha(glow, 0.45)}, 0 0 22px ${alpha(glow, 0.2)}`,
              animation: 'teamLeadGlow 2.4s ease-in-out infinite',
              '@keyframes teamLeadGlow': {
                '0%, 100%': {
                  boxShadow: `0 0 8px ${alpha(glow, 0.35)}, 0 0 16px ${alpha(glow, 0.15)}`,
                },
                '50%': {
                  boxShadow: `0 0 14px ${alpha(glow, 0.65)}, 0 0 28px ${alpha(glow, 0.35)}, 0 0 40px ${alpha(glow, 0.15)}`,
                },
              },
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.primary.light || glow}, ${glow})`,
                boxShadow: `0 0 16px ${alpha(glow, 0.7)}, 0 0 32px ${alpha(glow, 0.35)}`,
              },
            }}
          >
            Talk with Team-Lead
          </Button>
        </Box>,
      ]}
    </Menu>
  );
}
