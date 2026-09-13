import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// TS DOM lib doesn't always include SpeechRecognition types depending on config.
// Keep the surface area typed, but store the underlying browser objects as `any`.
type SpeechRecognitionLike = any;
type SpeechRecognitionEventLike = any;
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as SpeechRecognitionCtor | null;
}

export interface BrowserSpeechOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export interface BrowserSpeechEvents {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}

/**
 * Browser mic transcription using the Web Speech API (SpeechRecognition).
 * Works best in Chrome/Edge. On Safari/Firefox it may be unavailable.
 */
export function useBrowserSpeechRecognition(
  events: BrowserSpeechEvents,
  options?: BrowserSpeechOptions
) {
  const ctor = useMemo(() => getSpeechRecognitionCtor(), []);
  const supported = Boolean(ctor);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>('');

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!ctor) {
      const msg = 'Voice recognition is not supported in this browser';
      setError(msg);
      events.onError?.(msg);
      return;
    }

    setError('');
    const rec = new ctor();
    recRef.current = rec;

    rec.lang = options?.lang || 'en-US';
    rec.continuous = options?.continuous ?? true;
    rec.interimResults = options?.interimResults ?? true;

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e: any) => {
      const msg = e?.error ? String(e.error) : 'Speech recognition error';
      setError(msg);
      events.onError?.(msg);
      setListening(false);
    };

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = '';
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = String(r[0]?.transcript || '');
        if (r.isFinal) finalText += text;
        else interim += text;
      }
      if (interim.trim()) events.onPartial?.(interim.trim());
      if (finalText.trim()) events.onFinal?.(finalText.trim());
    };

    try {
      rec.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start speech recognition';
      setError(msg);
      events.onError?.(msg);
      setListening(false);
    }
  }, [ctor, events, options?.continuous, options?.interimResults, options?.lang]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  return { supported, listening, error, start, stop };
}
