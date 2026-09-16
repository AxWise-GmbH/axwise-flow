# Voice feature debug — task list and errors

## Symptom
- UI shows **"Voice not supported — click to type your command"**.
- Microphone button is visible but voice is never enabled.

## Root cause analysis

| # | Error / cause | Location | Fix |
|---|----------------|----------|-----|
| 1 | **Secure context too strict** | `useVoiceControl.js` → `getNativeSpeechRecognition()` | `window.isSecureContext` can be false in some dev setups (e.g. IP-based HTTP). Treat `localhost` and `127.0.0.1` as secure so native API is attempted. |
| 2 | **Async support detection race** | `useVoiceControl.js` → `useEffect` for support | `isSupported` starts false; Azure load is async. If Azure key is missing, we never set true. Native is checked sync but only when secure context passes. Ensure localhost is treated as secure so native path runs. |
| 3 | **No fallback message for Firefox** | `VoiceControlButton.jsx` / `getVoiceUnsupportedMessage` | When unsupported, show a clearer message (e.g. "Use Chrome/Edge over HTTPS, or type your command") so users know how to get voice or use type mode. |
| 4 | **SpeechRecognition availability** | `getNativeSpeechRecognition()` | Some environments expose `webkitSpeechRecognition` only after a delay. Re-check support once when document becomes visible so we don’t miss it. |

## Fixes applied
1. Treat `localhost` and `127.0.0.1` as secure in `getNativeSpeechRecognition()` so voice works in dev over HTTP.
2. Re-run support detection on `visibilitychange` (tab focus) so support is updated if context/permissions change.
3. Improve unsupported message to mention Chrome/Edge and HTTPS.
4. Ensure `webkitSpeechRecognition` is preferred when present (Safari) and class is valid before returning.

## Test plan (×3)
1. Open app in **Chrome** on **HTTPS** (e.g. Vercel URL) → click mic → voice should be supported and listening.
2. Open app on **http://localhost** → click mic → voice should be supported (after fix).
3. Open **VoiceConfirmationModal** via "click to type your command" → type "go to dashboard" → approve → should navigate.

After fixes, run the above 3 tests, then deploy to Vercel.
