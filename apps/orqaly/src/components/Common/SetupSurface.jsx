import { createContext, useContext } from 'react';
import { useTheme } from '@mui/material';
import { panelSurfaceTokens } from '../../theme/panelSurface';

/**
 * Which ground the setup components are standing on.
 *
 * `panelSurface.js` always had the seam - `mode: 'auto'` resolves the same
 * scale off the palette instead of pinning it to the drawers' own dark card -
 * but nothing could reach it, because `SetupSection` and `SetupRow` called
 * `panelSurfaceTokens(theme)` directly. Settings stacks those same sections on
 * a page that follows light/dark, so the mode has to travel with the tree.
 *
 * The default is 'dark', which is exactly what the two drawers were already
 * getting; wrapping nothing changes nothing.
 */
const SetupSurfaceContext = createContext('dark');

/** Read the tokens for whichever ground the nearest provider named. */
export function useSetupSurface() {
  const theme = useTheme();
  const mode = useContext(SetupSurfaceContext);
  return panelSurfaceTokens(theme, { mode });
}

export default function SetupSurface({ mode = 'dark', children }) {
  return <SetupSurfaceContext.Provider value={mode}>{children}</SetupSurfaceContext.Provider>;
}
