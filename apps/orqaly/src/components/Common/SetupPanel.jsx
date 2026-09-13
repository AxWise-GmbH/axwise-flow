import { createContext, useContext, useEffect, useState } from 'react';
import { Box, Drawer, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AppIcon from '../icons/AppIcon';
import { panelSurfaceTokens } from '../../theme/panelSurface';
import { stepEntranceSx } from '../../theme/wizardGlow';

/**
 * The setup panel shell: a right-hand drawer with a sticky header and a body
 * that scrolls under it.
 *
 * Assistant setup and Goal setup were two copies of this - the Drawer block,
 * the header, the body scroller and the token ladder were byte-identical
 * between the two files, and the only thing that had drifted was 2px of header
 * padding nobody chose. This is the promoted one, the way
 * `Common/WizardStepper.jsx` is the promoted stepper.
 *
 * It deliberately renders no control of its own beyond the close button. The
 * Assistant panel's tests pin the assistant selector as the *first* combobox in
 * the drawer; a shell that quietly added a field above `headerContent` would
 * break that from a distance, so the header is a slot rather than a layout.
 */

const SetupPanelMountedContext = createContext(false);

/** True once the drawer has finished sliding in - see the entrance note below. */
export function useSetupPanelMounted() {
  return useContext(SetupPanelMountedContext);
}

/**
 * Publishes that "settled" flag to `SetupSection`s rendered outside a drawer -
 * the Settings page stacks the same sections on a pane that is simply there.
 * Without it every section inherits the context default (false) and sits at
 * `opacity: 0` forever, because the entrance never gets its landing signal.
 */
export function SetupPanelMounted({ value = true, children }) {
  return (
    <SetupPanelMountedContext.Provider value={value}>{children}</SetupPanelMountedContext.Provider>
  );
}

/**
 * A body block that is not a section - an org picker, a footer link - joining
 * the same entrance stagger so it does not pop in against sections that fade.
 */
export function SetupPanelItem({ index = 0, children, sx }) {
  const mounted = useSetupPanelMounted();
  return (
    <Box sx={{ ...stepEntranceSx(mounted, index, { base: 0, step: 45 }), ...sx }}>{children}</Box>
  );
}

export default function SetupPanel({
  open,
  onClose,
  title,
  closeLabel = 'Close',
  subtitle = null,
  headerContent = null,
  width = 400,
  entrance = true,
  children,
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const tokens = panelSurfaceTokens(theme);

  // The drawer paper slides in over `enteringScreen`; the contents wait for it
  // to land and then settle in behind it. Overlapping the two makes the fade
  // illegible against a moving background, and animating the header on top of
  // its own arrival reads as a glitch rather than as motion. Keyed off `open`
  // so the entrance replays every time the panel is opened.
  const [mounted, setMounted] = useState(!entrance);
  useEffect(() => {
    if (!entrance) return undefined;
    if (!open) {
      setMounted(false);
      return undefined;
    }
    const timer = setTimeout(() => setMounted(true), theme.transitions.duration.enteringScreen);
    return () => clearTimeout(timer);
  }, [open, entrance, theme.transitions.duration.enteringScreen]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: tokens.paperSx({ width, fullScreen }) } }}
    >
      <Box sx={tokens.headerSx}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ color: tokens.textDim }}
            aria-label={closeLabel}
          >
            <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
        {subtitle && (
          <Typography variant="caption" sx={{ color: tokens.textDim }}>
            {subtitle}
          </Typography>
        )}
        {headerContent}
      </Box>

      <SetupPanelMounted value={mounted}>
        <Box sx={tokens.bodySx}>{children}</Box>
      </SetupPanelMounted>
    </Drawer>
  );
}
