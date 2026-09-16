import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { persistLastSettingsTab, readLastSettingsTab, resolveActiveTab } from './settingsSections';
import { withViewTransition } from '../../theme/settingsMotion';

/**
 * Which Settings tab is on screen, and how you move between them.
 *
 * The URL owns the answer: `?section=security` is the param the assistant's
 * context drawer has always linked with and which this page used to ignore
 * entirely, so a tab can now be linked to, shared and reloaded. A bare
 * `/settings` reopens whichever tab you left off on, and an id that is not on
 * the rail - a stale link, or a section hidden through the view options - falls
 * through to the first tab rather than leaving the page blank.
 *
 * `focusBlockKey` carries a pick from search across the tab change: the pane
 * opens that block and scrolls to it, then calls `clearFocus`.
 *
 * @param {string[]} tabIds The tabs the rail is currently showing, in order.
 */
export default function useSettingsTab(tabIds) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rememberedTab, setRememberedTab] = useState(readLastSettingsTab);
  const [focusBlockKey, setFocusBlockKey] = useState(null);

  const requestedTab = searchParams.get('section') || searchParams.get('tab');
  const activeTab = resolveActiveTab(requestedTab, rememberedTab, tabIds);

  const selectTab = useCallback(
    (id, blockKey = null) => {
      if (!id) return;
      // The browser cross-fades the outgoing pane into the incoming one where it
      // can; the pane's own entrance covers the browsers that cannot.
      withViewTransition(() => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('section', id);
            next.delete('tab');
            return next;
          },
          { replace: true }
        );
        persistLastSettingsTab(id);
        setRememberedTab(id);
        setFocusBlockKey(blockKey);
        window.scrollTo?.({ top: 0, behavior: 'smooth' });
      });
    },
    [setSearchParams]
  );

  const clearFocus = useCallback(() => setFocusBlockKey(null), []);

  return { activeTab, focusBlockKey, selectTab, clearFocus };
}
