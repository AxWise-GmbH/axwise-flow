/**
 * Is the user writing right now?
 *
 * Simple mode uses this as its one "get out of the way" signal: while a chat or
 * goal composer has focus the dock steps aside and the composer drops to the
 * footer, so the screen belongs to the conversation and the keyboard instead
 * of to chrome.
 *
 * Read from the document rather than from a composer's own state on purpose.
 * The composers report focus differently, and a shell-level component has no
 * business being wired into each one. Composer roots opt in with an explicit
 * data attribute so a history filter or dialog field cannot reshape the hero or
 * hide the dock.
 */
import { useEffect, useState } from 'react';

export const COMPOSER_TEXT_ENTRY_SELECTOR = '[data-composer-text-entry]';

/** Elements whose focus means the user is writing, not reading. */
export function isTextEntry(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  // Buttons, checkboxes and the like are inputs but take no text.
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'color'].includes(
    (el.type || 'text').toLowerCase()
  );
}

/** A text entry that belongs to an explicitly marked chat/goal composer. */
export function isComposerTextEntry(el) {
  return (
    isTextEntry(el) &&
    typeof el.closest === 'function' &&
    Boolean(el.closest(COMPOSER_TEXT_ENTRY_SELECTOR))
  );
}

/**
 * @returns {boolean} true while a marked chat/goal composer has focus.
 */
export default function useTextEntryFocused() {
  // Seeded, not set from the effect: focus can already be in a field when this
  // mounts (a re-render mid-typing), and correcting that afterwards would cost a
  // second render with the chrome visibly flashing back on in between.
  const [focused, setFocused] = useState(() => isComposerTextEntry(document.activeElement));

  useEffect(() => {
    const onFocusIn = (e) => setFocused(isComposerTextEntry(e.target));
    // relatedTarget is where focus is going. Blurring from one field straight
    // into another must not flicker the chrome back on for a frame.
    const onFocusOut = (e) => setFocused(isComposerTextEntry(e.relatedTarget));

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return focused;
}
