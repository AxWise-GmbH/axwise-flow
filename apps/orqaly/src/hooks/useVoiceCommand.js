const VOICE_OPEN_EVENT = 'orch-open-voice-command';

export function openVoiceCommand() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VOICE_OPEN_EVENT));
}

export function subscribeVoiceCommandOpen(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(VOICE_OPEN_EVENT, handler);
  return () => window.removeEventListener(VOICE_OPEN_EVENT, handler);
}
