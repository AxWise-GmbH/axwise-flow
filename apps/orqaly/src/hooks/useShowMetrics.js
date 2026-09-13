import { useState, useCallback } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useSimpleMode } from './useSimpleMode';

const STORAGE_PREFIX = 'orch_show_metrics_';

function storageKey(pageKey, isMobile) {
  return `${STORAGE_PREFIX}${pageKey}${isMobile ? '__mobile' : ''}`;
}

function load(pageKey, isMobile, defaultShown) {
  try {
    const raw = localStorage.getItem(storageKey(pageKey, isMobile));
    if (raw === null) return defaultShown; // no saved preference: use the computed default
    return JSON.parse(raw) !== false;
  } catch {
    return defaultShown;
  }
}

function save(pageKey, isMobile, value) {
  try {
    localStorage.setItem(storageKey(pageKey, isMobile), JSON.stringify(value));
  } catch {
    /* localStorage unavailable (private mode, quota) - ignore */
  }
}

/**
 * Persisted show/hide metrics toggle for a page.
 *
 * In simple mode metrics start hidden everywhere (calm, beginner-friendly UI);
 * the toggle button still lets users reveal them. In advanced mode they are
 * shown by default on desktop and hidden by default on mobile (< md). The
 * preference is remembered per device: mobile uses a separate storage key so a
 * desktop preference never leaks into the mobile default.
 *
 * @param {string} pageKey - Unique key (e.g. 'dashboard', 'permissions', 'partners')
 * @returns {[boolean, function]} [showMetrics, setShowMetrics]
 */
export function useShowMetrics(pageKey) {
  const { simpleMode } = useSimpleMode();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  // Soft default: simple mode hides metrics until asked; advanced keeps the
  // desktop-shown / mobile-hidden behaviour. An explicit saved value always wins.
  const defaultShown = simpleMode ? false : !isMobile;
  const [showMetrics, setShowMetricsState] = useState(() => load(pageKey, isMobile, defaultShown));

  // Re-load when the device class (and thus storage key) changes, e.g. crossing
  // the breakpoint on resize/rotate. Adjusting state during render is React's
  // recommended alternative to a setState-in-effect and avoids a wasted commit.
  // Saving only happens on an explicit toggle, so this never clobbers the other
  // device's stored preference.
  const currentKey = storageKey(pageKey, isMobile);
  const [prevKey, setPrevKey] = useState(currentKey);
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setShowMetricsState(load(pageKey, isMobile, defaultShown));
  }

  const setShowMetrics = useCallback(
    (value) => {
      setShowMetricsState((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        save(pageKey, isMobile, next); // persist per device, only on explicit toggle
        return next;
      });
    },
    [pageKey, isMobile],
  );

  return [showMetrics, setShowMetrics];
}
