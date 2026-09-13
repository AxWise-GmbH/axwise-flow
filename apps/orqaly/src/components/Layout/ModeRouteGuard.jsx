import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSimpleMode } from '../../hooks/useSimpleMode';

/** Routes simple-mode users may visit (dock + Reports hub instruments + settings). */
export const SIMPLE_ALLOWED_PREFIXES = [
  '/home',
  '/dashboard',
  '/organizations',
  '/hub',
  '/marketplace',
  '/settings',
  '/setup',
  '/assistant',
  '/goals',
  '/job-pool',
  '/my-agents',
  // Reports hub — primary cards + Instruments block
  '/dashboards',
  '/reports',
  '/communicator',
  '/knowledge-base',
  '/workflow',
  '/task-manager',
  '/projects',
  // Simple-mode Organizations action tiles link out to these surfaces.
  '/consilium',
  '/investments',
  '/tools',
  '/arena',
  '/agent-hub',
  // Home org-metric tiles (ROI / Invested) deep-link here.
  '/finances',
];

/** Advanced-only landing routes simple users should not stay on (post-login guard). */
const ADVANCED_ENTRY_PREFIXES = ['/partners'];

function isAllowedInSimpleMode(pathname) {
  if (pathname === '/') return true;
  return SIMPLE_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAdvancedEntry(pathname) {
  return ADVANCED_ENTRY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Keeps simple-mode users on dock-friendly routes; advanced users may visit
 * /dashboard via the sidebar — post-login routing sends them to /agent-hub.
 */
export default function ModeRouteGuard({ children }) {
  const { simpleMode } = useSimpleMode();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!simpleMode) return;
    if (!isAllowedInSimpleMode(pathname) || isAdvancedEntry(pathname)) {
      navigate('/dashboard', { replace: true });
    }
  }, [simpleMode, pathname, navigate]);

  return children;
}
