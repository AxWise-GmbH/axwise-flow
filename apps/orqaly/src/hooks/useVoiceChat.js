import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicRecorder } from './useMicRecorder';
import { useVoiceControl } from './useVoiceControl';
import {
  isAvailable,
  transcribe,
  speak as vbSpeak,
  awaitSpeakDone,
  stop as vbStop,
  ModelDownloadingError,
  DEFAULT_BASE_URL,
  DEFAULT_CLIENT_ID,
} from '../services/voiceboxService';
import { speak as ttsSpeak, stopSpeaking as ttsStop } from '../services/ttsService';

/**
 * useVoiceChat - one façade over the two-direction voice loop so the chat UI
 * stays simple. It routes each direction to Voicebox when the user has opted in
 * AND a local Voicebox is reachable, otherwise to the existing fallback stack:
 *
 *   speech-in : Voicebox /transcribe (mic blob)  →  else Web-Speech (useVoiceControl)
 *   voice-out : Voicebox /speak (host speakers)   →  else ElevenLabs / browser (ttsService)
 *
 * @param {object}   opts
 * @param {object}   [opts.voiceConfig]   config.voice = { provider, baseUrl, profileId, clientId }
 * @param {string}   [opts.token]         Supabase JWT (for the ElevenLabs fallback)
 * @param {object}   [opts.voiceSettings] { language, voiceId, rate, pitch, muted }
 * @param {Function} [opts.onTranscript]  called with the recognised text
 * @returns {{ micState, startMic, stopMic, speakReply, stopSpeaking, isSpeaking, voiceError, isSupported }}
 */
export function useVoiceChat({ voiceConfig, token, voiceSettings = {}, onTranscript } = {}) {
  const [micState, setMicState] = useState('idle'); // idle | recording | transcribing
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState(null);

  const recorder = useMicRecorder();
  const modeRef = useRef('voicebox'); // which path the current capture is using
  const micStateRef = useRef('idle');
  const isSpeakingRef = useRef(false);
  const speakAbortRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    micStateRef.current = micState;
  }, [micState]);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const baseUrl = voiceConfig?.baseUrl || DEFAULT_BASE_URL;
  const useVoicebox = voiceConfig?.provider === 'voicebox';

  // Browser Web-Speech fallback. Always instantiated (hooks can't be conditional);
  // only driven when the Voicebox path is unavailable.
  const handleWebSpeechEnd = useCallback((text) => {
    setMicState('idle');
    if (text) onTranscriptRef.current?.(text);
  }, []);
  const webSpeech = useVoiceControl({
    onListeningEnd: handleWebSpeechEnd,
    onError: () => setMicState('idle'),
    language: voiceSettings?.language || 'en-US',
  });

  const startWebSpeech = useCallback(() => {
    if (!webSpeech.isSupported) {
      setVoiceError(
        'Voice input is not available in this browser. Use Chrome or Edge, or type instead.'
      );
      return;
    }
    modeRef.current = 'webspeech';
    webSpeech.startListening();
    setMicState('recording');
  }, [webSpeech]);

  const startMic = useCallback(async () => {
    if (isSpeakingRef.current) return; // never record over our own voice
    if (micStateRef.current !== 'idle') return;
    setVoiceError(null);
    recorder.clearError?.();

    if (useVoicebox && recorder.isSupported) {
      const avail = await isAvailable({ baseUrl });
      if (avail.ok) {
        modeRef.current = 'voicebox';
        const started = await recorder.start();
        if (started) {
          setMicState('recording');
          return;
        }
        // Mic denied / no device - surface it; don't silently re-prompt.
        setVoiceError(recorder.error || 'Could not start the microphone.');
        return;
      }
      // Voicebox not reachable → fall back to browser speech for this capture.
      setVoiceError(
        'Voicebox is not reachable - using the built-in voice instead. ' +
          'Check it is running and that this site is allowed in its VOICEBOX_CORS_ORIGINS.'
      );
    }
    startWebSpeech();
  }, [useVoicebox, recorder, baseUrl, startWebSpeech]);

  const stopMic = useCallback(async () => {
    if (modeRef.current === 'webspeech') {
      webSpeech.stopListening(); // fires handleWebSpeechEnd with the final transcript
      return;
    }
    // Voicebox path: stop the recorder, transcribe the blob.
    setMicState('transcribing');
    let blob = null;
    try {
      blob = await recorder.stop();
    } catch {
      blob = null;
    }
    if (!blob) {
      setMicState('idle');
      return;
    }
    try {
      const text = await transcribe(blob, { baseUrl, language: voiceSettings?.language });
      setMicState('idle');
      if (text) onTranscriptRef.current?.(text);
    } catch (err) {
      setMicState('idle');
      if (err instanceof ModelDownloadingError) {
        setVoiceError(err.message);
      } else {
        setVoiceError(
          `Couldn't transcribe that. ${err?.message || 'Try again, or type your message.'}`
        );
      }
    }
  }, [recorder, webSpeech, baseUrl, voiceSettings?.language]);

  const stopSpeaking = useCallback(async () => {
    if (speakAbortRef.current) {
      try {
        speakAbortRef.current.abort();
      } catch {
        /* ignore */
      }
      speakAbortRef.current = null;
    }
    await vbStop();
    ttsStop();
    setIsSpeaking(false);
  }, []);

  const fallbackSpeak = useCallback(
    async (text) => {
      // ElevenLabs needs a token; otherwise the browser synthesiser. ttsService
      // chains ElevenLabs → browser internally on its own failures.
      const provider = useVoicebox
        ? token
          ? 'elevenlabs'
          : 'browser'
        : voiceConfig?.provider || (token ? 'elevenlabs' : 'browser');
      await ttsSpeak({
        text,
        provider,
        voiceId: voiceSettings?.voiceId,
        token,
        voiceSettings,
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
      });
    },
    [useVoicebox, token, voiceConfig?.provider, voiceSettings]
  );

  const speakReply = useCallback(
    async (text) => {
      const clean = String(text || '').trim();
      if (!clean || voiceSettings?.muted) return;
      if (micStateRef.current === 'recording') return; // don't talk over the user

      await stopSpeaking();

      if (useVoicebox) {
        const avail = await isAvailable({ baseUrl });
        if (avail.ok) {
          const controller = new AbortController();
          speakAbortRef.current = controller;
          try {
            setIsSpeaking(true);
            const { id } = await vbSpeak(clean, {
              baseUrl,
              profile: voiceConfig?.profileId,
              clientId: voiceConfig?.clientId || DEFAULT_CLIENT_ID,
            });
            await awaitSpeakDone(id, { baseUrl, signal: controller.signal });
            setIsSpeaking(false);
            return;
          } catch {
            setIsSpeaking(false);
            // fall through to the ElevenLabs/browser fallback
          } finally {
            if (speakAbortRef.current === controller) speakAbortRef.current = null;
          }
        }
      }
      await fallbackSpeak(clean);
    },
    [
      useVoicebox,
      baseUrl,
      voiceConfig?.profileId,
      voiceConfig?.clientId,
      voiceSettings?.muted,
      stopSpeaking,
      fallbackSpeak,
    ]
  );

  // Stop any playback if the consumer unmounts.
  useEffect(
    () => () => {
      stopSpeaking();
    },
    [stopSpeaking]
  );

  const isSupported = recorder.isSupported || webSpeech.isSupported;

  return {
    micState,
    startMic,
    stopMic,
    speakReply,
    stopSpeaking,
    isSpeaking,
    voiceError: voiceError || (modeRef.current === 'webspeech' ? webSpeech.error : null),
    isSupported,
  };
}
