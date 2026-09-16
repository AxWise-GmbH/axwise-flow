import { useState, useRef, useCallback, useEffect } from 'react';

const SILENCE_DURATION_MS = 3000;

/** Browsers that do not support Web Speech API SpeechRecognition natively. */
const UNSUPPORTED_BROWSERS = /Firefox|Seamonkey|K-Meleon|Iceweasel/i;

function isMobileSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Safari/i.test(ua) && /iPhone|iPad|iPod/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua);
}

function getBrowserName() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return null;
  const ua = navigator.userAgent;
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Edg/i.test(ua)) return 'Edge';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  return null;
}

function isSecureContextOrLocalhost() {
  if (typeof window === 'undefined' || !window.location) return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '';
}

function getNativeSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  if (!isSecureContextOrLocalhost()) return null;
  if (UNSUPPORTED_BROWSERS.test(navigator.userAgent || '')) return null;
  const Klass = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  if (!Klass || typeof Klass.prototype?.start !== 'function') return null;
  return Klass;
}

/** Load Azure Speech ponyfill for browsers without native SpeechRecognition (e.g. Firefox).
 *  Fetches a short-lived token from /api/speech-token (key stays server-side). */
async function loadAzureSpeechRecognition() {
  try {
    const { getAuthHeaders } = await import('../lib/supabaseEdge');
    const headers = await getAuthHeaders();
    const tokenRes = await fetch('/api/speech-token', { headers });
    if (!tokenRes.ok) return null;
    const { token: authToken, region } = await tokenRes.json();
    if (!authToken) return null;
    const { createSpeechRecognitionPonyfill } = await import('web-speech-cognitive-services');
    const { SpeechRecognition } = await createSpeechRecognitionPonyfill({
      credentials: { region, authorizationToken: authToken },
      enableTelemetry: false,
    });
    return typeof SpeechRecognition === 'function' ? SpeechRecognition : null;
  } catch {
    return null;
  }
}

/** Call from components to show a friendly "not supported" message. */
export function getVoiceUnsupportedMessage() {
  const browser = getBrowserName();
  if (browser === 'Firefox') {
    return 'Voice is not supported in Firefox. Use Chrome or Edge over HTTPS, or type your command below.';
  }
  return 'Voice works in Chrome/Edge over HTTPS. Use this page on HTTPS or type your command below.';
}

/**
 * Voice control hook: Web Speech API, 3s silence auto-stop, manual stop.
 * @param {{ onListeningEnd?: (transcript: string) => void }} [options]
 * @returns {{
 *   state: 'idle'|'listening'|'processing',
 *   transcript: string,
 *   error: string|null,
 *   isSupported: boolean,
 *   startListening: () => void,
 *   stopListening: () => void,
 *   clearTranscript: () => void,
 *   setState: (s: string) => void,
 * }}
 */
export function useVoiceControl(options = {}) {
  const { onListeningEnd, onError, language = 'en-US' } = options;
  const onListeningEndRef = useRef(onListeningEnd);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onListeningEndRef.current = onListeningEnd;
    onErrorRef.current = onError;
  }, [onListeningEnd, onError]);

  const [state, setState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);
  const recognitionClassRef = useRef(null); // Azure polyfill class when native not available
  const silenceTimerRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const retryCountRef = useRef(0);
  const startListeningRef = useRef(null);
  const pauseRequestedRef = useRef(false);
  const MAX_NETWORK_RETRIES = 1;

  const updateSupport = useCallback(() => {
    const native = getNativeSpeechRecognition();
    if (native) {
      setIsSupported(true);
      return;
    }
    if (recognitionClassRef.current) {
      setIsSupported(true);
      return;
    }
    loadAzureSpeechRecognition().then((Klass) => {
      if (Klass) {
        recognitionClassRef.current = Klass;
        setIsSupported(true);
      }
    });
  }, []);

  useEffect(() => {
    updateSupport();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateSupport();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [updateSupport]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    pauseRequestedRef.current = false;
    clearSilenceTimer();
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.abort();
      } catch {
        // ignore abort errors
      }
      recognitionRef.current = null;
    }
    if (state === 'listening') {
      const final = finalTranscriptRef.current;
      setState('idle');
      setTranscript(final);
      // Process accumulated transcript so manual stop behaves like auto-stop
      if (final && onListeningEndRef.current) {
        onListeningEndRef.current(final);
      }
    }
  }, [state, clearSilenceTimer]);

  const pauseListening = useCallback(() => {
    pauseRequestedRef.current = true;
    clearSilenceTimer();
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (state === 'listening') {
      setState('paused');
      setTranscript(finalTranscriptRef.current);
    }
  }, [state, clearSilenceTimer]);

  const startListening = useCallback(
    (fromRetry = false, append = false) => {
      const SpeechRecognition = getNativeSpeechRecognition() || recognitionClassRef.current;
      if (!SpeechRecognition) {
        setError(getVoiceUnsupportedMessage());
        return;
      }
      if (!fromRetry) retryCountRef.current = 0;
      setError(null);
      if (!append) {
        setTranscript('');
        finalTranscriptRef.current = '';
      }
      clearSilenceTimer();

      const startRecognition = async () => {
        // Chrome (and some others) require microphone permission to be granted before
        // SpeechRecognition will work. Request it explicitly so the user gets a clear prompt.
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
          } catch (err) {
            const name = err?.name || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
              setError('Please enable microphone permissions to use voice control.');
              setState('idle');
              onErrorRef.current?.();
              return;
            }
            if (name === 'NotFoundError') {
              setError(
                'No microphone found. Connect a microphone or type your command in the dialog.'
              );
              setState('idle');
              onErrorRef.current?.();
              return;
            }
            setError(
              'Microphone access is required. Please allow it in your browser settings and try again.'
            );
            setState('idle');
            onErrorRef.current?.();
            return;
          }
        }

        const recognition = new SpeechRecognition();
        const mobileSafari = isMobileSafari();
        // Mobile Safari doesn't support continuous mode reliably — use single-shot
        // and restart on onend to simulate continuous listening.
        recognition.continuous = !mobileSafari;
        recognition.interimResults = true;
        recognition.lang = language || 'en-US';
        recognitionRef.current = recognition;

        recognition.onresult = (event) => {
          clearSilenceTimer();
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;
            if (result.isFinal) {
              final += text;
            } else {
              interim += text;
            }
          }
          if (final) {
            finalTranscriptRef.current = (finalTranscriptRef.current + final).trim();
            setTranscript(finalTranscriptRef.current + (interim ? ` ${interim}` : ''));
          } else if (interim) {
            setTranscript(
              finalTranscriptRef.current + (finalTranscriptRef.current ? ' ' : '') + interim
            );
          }
          silenceTimerRef.current = setTimeout(() => {
            try {
              recognition.stop();
            } catch {
              // ignore stop errors
            }
          }, SILENCE_DURATION_MS);
        };

        recognition.onend = () => {
          clearSilenceTimer();
          if (recognitionRef.current === recognition) {
            // Mobile Safari single-shot mode: auto-restart if still meant to listen
            if (mobileSafari && !pauseRequestedRef.current && !finalTranscriptRef.current) {
              try {
                recognition.start();
                return;
              } catch {
                // fall through to normal end handling
              }
            }
            recognitionRef.current = null;
            const final = finalTranscriptRef.current;
            if (pauseRequestedRef.current) {
              pauseRequestedRef.current = false;
              setState('paused');
              setTranscript(final);
              return;
            }
            setState((s) => (s === 'listening' ? 'idle' : s));
            setTranscript(final);
            if (final && onListeningEndRef.current) {
              onListeningEndRef.current(final);
            }
          }
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setError('Please enable microphone permissions to use voice control.');
            setState('idle');
            onErrorRef.current?.();
            return;
          }
          if (event.error === 'no-speech') {
            setError('No voice input detected. Please try again.');
            setState('idle');
            onErrorRef.current?.();
            return;
          }
          if (event.error === 'audio-capture') {
            setError(
              'No microphone found. Connect a microphone or type your command in the dialog.'
            );
            setState('idle');
            onErrorRef.current?.();
            return;
          }
          if (event.error === 'aborted') {
            setError(null);
            return;
          }
          if (event.error === 'network') {
            if (retryCountRef.current < MAX_NETWORK_RETRIES) {
              retryCountRef.current += 1;
              recognitionRef.current = null;
              setState('idle');
              setTimeout(() => startListeningRef.current?.(true), 600);
              return;
            }
            retryCountRef.current = 0;
            setError(
              'Voice needs an internet connection (speech is processed online). Check your connection, try again, or type your command in the dialog.'
            );
            setState('idle');
            onErrorRef.current?.();
            return;
          }
          setError(
            event.error
              ? `Recognition error: ${event.error}. You can type your command in the dialog instead.`
              : 'Could not process speech. Try typing your command in the dialog.'
          );
          setState('idle');
          onErrorRef.current?.();
        };

        setState('listening');
        try {
          recognition.start();
        } catch {
          setError('Could not start microphone. Please try again.');
          setState('idle');
          onErrorRef.current?.();
        }
      };

      startRecognition();
    },
    [clearSilenceTimer, language]
  );

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const resumeListening = useCallback(() => {
    if (state !== 'paused') return;
    startListening(false, true); // append mode
  }, [state, startListening]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    finalTranscriptRef.current = '';
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [clearSilenceTimer]);

  return {
    state,
    transcript,
    error,
    isSupported,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    clearTranscript,
    clearError,
    setState,
  };
}
