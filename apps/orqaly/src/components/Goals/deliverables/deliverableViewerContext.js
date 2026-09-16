/**
 * The channel between a result row and the popup it is being read inside.
 *
 * Apart from the viewer component so the module stays hooks-and-constants only:
 * a file that exports both a hook and a component loses fast refresh, and this
 * hook is imported by every group.
 */
import { createContext, useContext } from 'react';

export const DeliverableViewerContext = createContext(null);

/**
 * Open a deliverable in the surrounding popup.
 *
 * Returns null where no viewer is mounted, and the groups check for that before
 * offering a View button - a button that opens nothing is worse than no button,
 * and these groups also render on pages that have no popup to open into.
 */
export function useDeliverableViewer() {
  return useContext(DeliverableViewerContext);
}
