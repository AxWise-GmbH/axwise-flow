import { createContext, useContext } from 'react';

/**
 * Lightweight context so Home sections can tell whether the dashboard is
 * showing demo (sample) data or live data, without prop-drilling `demo`
 * through every section. Provided by HomeOverview; consumed by PanelCard
 * (and any section) to render a "DEMO" tag.
 */
export const HomeModeContext = createContext({ demo: false });

export function useHomeMode() {
  return useContext(HomeModeContext);
}

export default HomeModeContext;
