import { Navigate } from 'react-router-dom';
import { useAxwise } from '../../hooks/useAxwise';

/**
 * Gates AxWise-only routes (e.g. /axwise-analytics). Renders children unless we
 * positively know AxWise is disabled (backend flag off or the user hid the
 * overlay), in which case it redirects. Rendering while the flag is still
 * loading avoids an infinite spinner if the prefs fetch fails; the target page
 * is read-only and degrades to empty states, so a brief render is harmless.
 */
export default function AxwiseRouteGuard({ children, redirectTo = '/home' }) {
  const { loaded, isAxwiseEnabled } = useAxwise();
  if (loaded && !isAxwiseEnabled) return <Navigate to={redirectTo} replace />;
  return children;
}
