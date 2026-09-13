import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useMicRecorder - minimal MediaRecorder wrapper for press-to-record capture.
 * Records microphone audio into a single Blob, then releases the mic. Used by
 * the Voicebox speech-in path (the blob is POSTed to /transcribe). The browser
 * Web-Speech path (useVoiceControl) is a separate fallback and does not use this.
 *
 *   const { recording, start, stop, error, isSupported } = useMicRecorder();
 *   await start();              // begins capture (prompts for mic permission)
 *   const blob = await stop();  // resolves the recorded Blob (or null if empty)
 *
 * Mic permission / no-device errors mirror useVoiceControl's friendly messages.
 */

// Preferred container/codec order. Whisper accepts webm/opus and mp4/m4a;
// Safari only does mp4. An empty string means "let the browser decide".
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export function useMicRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator?.mediaDevices?.getUserMedia;

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!isSupported) {
      setError('Recording is not supported in this browser. Use Chrome or Edge, or type instead.');
      return false;
    }
    if (recorderRef.current) return true; // already recording

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Please enable microphone permissions to use voice.');
      } else if (name === 'NotFoundError') {
        setError('No microphone found. Connect a microphone or type your message instead.');
      } else {
        setError('Microphone access is required. Allow it in your browser settings and try again.');
      }
      return false;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    try {
      recorder.start();
    } catch {
      recorderRef.current = null;
      releaseStream();
      setError('Could not start recording. Please try again.');
      return false;
    }
    setRecording(true);
    return true;
  }, [isSupported, releaseStream]);

  /** Stop recording and resolve the recorded Blob (or null if nothing captured). */
  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      releaseStream();
      setRecording(false);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        recorderRef.current = null;
        releaseStream();
        setRecording(false);
        resolve(blob.size > 0 ? blob : null);
      };
      try {
        recorder.stop();
      } catch {
        recorderRef.current = null;
        releaseStream();
        setRecording(false);
        resolve(null);
      }
    });
  }, [releaseStream]);

  // Release the mic if the component unmounts mid-recording.
  useEffect(
    () => () => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      releaseStream();
    },
    [releaseStream]
  );

  const clearError = useCallback(() => setError(null), []);

  return { recording, start, stop, error, isSupported, clearError };
}
