import { useEffect } from 'react';

/**
 * When `highlightId` changes to a DOM id present in the mounted section, scroll
 * it into view and briefly flash its background so the user sees the search hit.
 */
export function useAnchorHighlight(highlightId, flashColor) {
  useEffect(() => {
    if (!highlightId || typeof document === 'undefined') return undefined;
    const el = document.getElementById(highlightId);
    if (!el) return undefined;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prevTransition = el.style.transition;
    const prevBg = el.style.backgroundColor;
    el.style.transition = 'background-color 0.25s ease';
    el.style.backgroundColor = flashColor || 'rgba(16,185,129,0.15)';
    const t = setTimeout(() => {
      el.style.backgroundColor = prevBg;
      const t2 = setTimeout(() => {
        el.style.transition = prevTransition;
      }, 300);
      el.dataset.docFlashCleanup = String(t2);
    }, 1300);
    return () => clearTimeout(t);
  }, [highlightId, flashColor]);
}

export default useAnchorHighlight;
