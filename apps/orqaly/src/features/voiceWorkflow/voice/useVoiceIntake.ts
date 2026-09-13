import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VoiceIntakeEvents {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
}

export interface VoiceIntakeOptions {
  partialDebounceMs?: number;
  finalizeAfterMs?: number; // treat "silence" as final
}

/**
 * Voice intake layer.
 * - Accept partial + final transcripts (string input)
 * - Debounce partial updates
 * - Finalize intent on pause/end
 *
 * This is UI/transport agnostic: you can wire STT streaming into pushPartial/pushFinal.
 */
export function useVoiceIntake(events: VoiceIntakeEvents, options?: VoiceIntakeOptions) {
  const partialDebounceMs = options?.partialDebounceMs ?? 350;
  const finalizeAfterMs = options?.finalizeAfterMs ?? 950;

  const [partial, setPartial] = useState('');
  const [finalText, setFinalText] = useState('');

  const lastPartialRef = useRef('');
  const debounceTimer = useRef<number | null>(null);
  const finalizeTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    if (finalizeTimer.current) window.clearTimeout(finalizeTimer.current);
    debounceTimer.current = null;
    finalizeTimer.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const scheduleFinalize = useCallback(
    (text: string) => {
      if (finalizeTimer.current) window.clearTimeout(finalizeTimer.current);
      finalizeTimer.current = window.setTimeout(() => {
        const t = String(text || '').trim();
        if (!t) return;
        setFinalText(t);
        events.onFinal?.(t);
      }, finalizeAfterMs);
    },
    [events, finalizeAfterMs]
  );

  const pushPartial = useCallback(
    (text: string) => {
      const t = String(text || '');
      lastPartialRef.current = t;
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        const debounced = lastPartialRef.current;
        setPartial(debounced);
        events.onPartial?.(debounced);
        scheduleFinalize(debounced);
      }, partialDebounceMs);
    },
    [events, partialDebounceMs, scheduleFinalize]
  );

  const pushFinal = useCallback(
    (text: string) => {
      clearTimers();
      const t = String(text || '').trim();
      setPartial('');
      if (!t) return;
      setFinalText(t);
      events.onFinal?.(t);
    },
    [clearTimers, events]
  );

  const reset = useCallback(() => {
    clearTimers();
    setPartial('');
    setFinalText('');
  }, [clearTimers]);

  const state = useMemo(() => ({ partial, finalText }), [partial, finalText]);

  return { state, pushPartial, pushFinal, reset };
}
