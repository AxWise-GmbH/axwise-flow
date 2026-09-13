/**
 * TTS Service - unified text-to-speech with Voicebox + ElevenLabs + browser.
 *
 * speak()         → routes by provider: 'voicebox' (local desktop, host speakers)
 *                   → 'elevenlabs' (cloud, in-tab audio) → browser speechSynthesis,
 *                   each falling back to the next on failure.
 * stopSpeaking()  → stops Voicebox host playback, ElevenLabs audio, and browser TTS
 * isSpeaking()    → returns boolean
 */
import { speak as vbSpeak, awaitSpeakDone as vbAwaitDone, stop as vbStop } from './voiceboxService';

// ── State ────────────────────────────────────────────────────────────────────

let currentAudio = null; // HTMLAudioElement for ElevenLabs
let currentBlobUrl = null; // revoke on stop
let speaking = false;
let audioUnlocked = false; // iOS requires a user-gesture unlock

// ── iOS audio unlock ─────────────────────────────────────────────────────────

/**
 * iOS Safari blocks Audio.play() unless triggered by a user gesture.
 * Call this once on the first user tap/click to unlock audio playback.
 */
export function unlockAudioContext() {
  if (audioUnlocked) return;
  try {
    const a = new Audio();
    a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    a.volume = 0;
    const p = a.play();
    if (p) p.catch(() => {});
    audioUnlocked = true;
  } catch {
    // silent
  }
}

// ── ElevenLabs TTS ───────────────────────────────────────────────────────────

async function speakWithElevenLabs({ text, voiceId, token, onStart, onEnd, onError }) {
  // Cancel any previous playback
  stopSpeaking();

  try {
    const res = await fetch('/api/app?path=tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, voiceId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'TTS failed' }));
      throw new Error(err.error || `TTS HTTP ${res.status}`);
    }

    const blob = await res.blob();
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(blob);

    const audio = new Audio(currentBlobUrl);
    currentAudio = audio;

    audio.onplay = () => {
      speaking = true;
      onStart?.();
    };
    audio.onended = () => {
      speaking = false;
      cleanup();
      onEnd?.();
    };
    audio.onerror = () => {
      speaking = false;
      cleanup();
      onError?.(new Error('Audio playback failed'));
    };

    await audio.play();
  } catch (err) {
    speaking = false;
    cleanup();
    onError?.(err);
    throw err; // let caller know it failed (for fallback)
  }
}

function cleanup() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  currentAudio = null;
}

// ── Browser TTS fallback ─────────────────────────────────────────────────────

function speakWithBrowserTTS({ text, lang, rate, pitch, onStart, onEnd }) {
  if (typeof window === 'undefined') return;
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance === 'undefined')
    return;

  const content = String(text || '').trim();
  if (!content) return;

  try {
    const utterance = new window.SpeechSynthesisUtterance(content.slice(0, 320));
    utterance.lang = lang || 'en-US';
    utterance.rate = Number(rate || 1);
    utterance.pitch = Number(pitch || 1);
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices?.() || [];
    const preferred =
      voices.find((v) => v.lang === utterance.lang) ||
      voices.find((v) => v.lang?.startsWith((utterance.lang || '').split('-')[0]));
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.cancel();

    utterance.onstart = () => {
      speaking = true;
      onStart?.();
    };
    utterance.onend = () => {
      speaking = false;
      onEnd?.();
    };
    utterance.onerror = () => {
      speaking = false;
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  } catch {
    speaking = false;
    onEnd?.();
  }
}

// ── Unified speak() ──────────────────────────────────────────────────────────

/**
 * Speak text aloud. Routes by provider, each falling back to the next.
 *
 * @param {Object} opts
 * @param {string} opts.text - Text to speak
 * @param {'voicebox'|'elevenlabs'|'browser'} opts.provider - TTS provider
 * @param {string} [opts.voiceId] - ElevenLabs voice ID
 * @param {string} [opts.token] - Supabase JWT for API auth
 * @param {string} [opts.baseUrl] - Voicebox base URL (provider 'voicebox')
 * @param {string} [opts.profile] - Voicebox voice profile name/id
 * @param {string} [opts.clientId] - Voicebox X-Voicebox-Client-Id
 * @param {Object} [opts.voiceSettings] - Browser TTS settings (lang, rate, pitch)
 * @param {Function} [opts.onStart] - Called when speech starts
 * @param {Function} [opts.onEnd] - Called when speech ends
 */
export async function speak({
  text,
  provider,
  voiceId,
  token,
  baseUrl,
  profile,
  clientId,
  voiceSettings = {},
  onStart,
  onEnd,
}) {
  if (!text?.trim()) return;

  // Voicebox: the local desktop app plays the audio on the host's own speakers
  // and returns a generation id we can watch to completion. On any failure we
  // fall through to the ElevenLabs/browser ladder below.
  if (provider === 'voicebox') {
    try {
      stopSpeaking();
      const { id } = await vbSpeak(text, { baseUrl, profile, clientId });
      speaking = true;
      onStart?.();
      await vbAwaitDone(id, { baseUrl });
      speaking = false;
      onEnd?.();
      return;
    } catch (err) {
      speaking = false;
      console.warn('[TTS] Voicebox failed, falling back:', err?.message);
      // fall through to ElevenLabs/browser
    }
  }

  // ElevenLabs is used when explicitly chosen, or as the next rung after a
  // failed Voicebox attempt when a token is available.
  const useElevenLabs = (provider === 'elevenlabs' || provider === 'voicebox') && token;

  if (useElevenLabs) {
    try {
      await speakWithElevenLabs({
        text,
        voiceId,
        token,
        onStart,
        onEnd,
        onError: (err) => {
          console.warn('[TTS] ElevenLabs failed, falling back to browser:', err?.message);
          // Fallback to browser TTS on ElevenLabs failure
          speakWithBrowserTTS({
            text,
            lang: voiceSettings.language,
            rate: voiceSettings.rate,
            pitch: voiceSettings.pitch,
            onStart,
            onEnd,
          });
        },
      });
      return;
    } catch {
      // speakWithElevenLabs already triggered onError → browser fallback
      return;
    }
  }

  // Browser TTS directly
  speakWithBrowserTTS({
    text,
    lang: voiceSettings.language,
    rate: voiceSettings.rate,
    pitch: voiceSettings.pitch,
    onStart,
    onEnd,
  });
}

// ── Stop + status ────────────────────────────────────────────────────────────

export function stopSpeaking() {
  speaking = false;

  // Cancel Voicebox host playback (best-effort; async, fire-and-forget).
  vbStop();

  // Stop ElevenLabs audio
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // ignore
    }
    cleanup();
  }

  // Stop browser TTS
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking() {
  return speaking;
}
