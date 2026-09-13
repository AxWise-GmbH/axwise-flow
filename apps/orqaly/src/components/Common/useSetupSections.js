import { useCallback, useState } from 'react';

/**
 * Which sections of a setup panel are open.
 *
 * The two panels want opposite defaults and the difference is real, not an
 * inconsistency to iron out: Assistant setup is a sequence you work through, so
 * one section at a time; Goal setup is four decisions about one goal, so all of
 * them at once. This is the whole of that difference, so `SetupSection` itself
 * stays dumb and fully controlled.
 *
 * In 'multi' the state tracks which sections are *collapsed*, not which are
 * open. That inversion is what lets everything start open without the hook ever
 * being told what the sections are - no key list to pass in, no effect syncing
 * state to props, and nothing hidden on the first paint.
 *
 * @param {{ mode?: 'single' | 'multi', initial?: string | null }} [opts]
 *   `initial` is the section open at mount in 'single' mode; ignored in 'multi'.
 * @returns {{ isExpanded: (key: string) => boolean,
 *             toggle: (key: string, next: boolean) => void }}
 */
export default function useSetupSections({ mode = 'single', initial = null } = {}) {
  const [openKey, setOpenKey] = useState(initial ?? false);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const isExpanded = useCallback(
    (key) => (mode === 'multi' ? !collapsed.has(key) : openKey === key),
    [mode, collapsed, openKey]
  );

  const toggle = useCallback(
    (key, next) => {
      if (mode === 'multi') {
        setCollapsed((prev) => {
          const wasCollapsed = prev.has(key);
          if (next === !wasCollapsed) return prev;
          const nextSet = new Set(prev);
          if (next) nextSet.delete(key);
          else nextSet.add(key);
          return nextSet;
        });
        return;
      }
      setOpenKey(next ? key : false);
    },
    [mode]
  );

  return { isExpanded, toggle };
}
