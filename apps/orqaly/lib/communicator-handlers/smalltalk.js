/**
 * [module: connection-hub]
 * Smalltalk fast-path — match casual chat patterns BEFORE the LLM.
 *
 * The bot's LLM call costs ~$0.001 per turn. For pleasantries like "hi",
 * "thanks", "👍" that's wasted spend AND the reply feels robotic. This module
 * intercepts those messages and replies instantly from a small templated pool
 * — varied enough to feel natural, free enough to use forever.
 *
 * Substantive requests (anything with platform nouns or action verbs) fall
 * through to the LLM unchanged.
 *
 * Usage from the worker (lib/agent-handlers/communicator-process.js):
 *
 *   import { matchSmalltalk } from '.../smalltalk.js';
 *   const small = matchSmalltalk(text, { personality, firstName });
 *   if (small) {
 *     await sendOutbound(botToken, chatId, small.reply);
 *     // log with cost: 0, parsed_intent: 'smalltalk', metadata.intent: small.intent
 *     return;
 *   }
 *   // else: fall through to processAssistantMessage(...)
 */

// ── Anti-trigger guards ────────────────────────────────────────────────────
// Even if a greeting word is present, fall through to LLM when the text
// contains any of these — they signal a real request.

const SUBSTANTIVE_VERBS = /\b(list|show|get|create|make|send|give|fetch|find|search|build|run|start|stop|cancel|delete|archive|update|edit|set|change|schedule|generate|summari[sz]e|analy[sz]e|explain|tell\s+me\s+about|whats?|what['']?s|whens?|where|who|how\s+(many|much|do|did|is|are)|why|do|does)\b/i;

const PLATFORM_NOUNS = /\b(goal|goals|partner|partners|project|projects|task|tasks|report|reports?|agent|agents?|file|files?|channel|channels?|workflow|workflows?|knowledge|kb|tool|tools?|marketplace|listing|listings?|board|boards?|consilium|invest(ment)?|investments?|deal|deals?|investor|investors?|pool|pools?|commit(ment)?|commitments?|organi[sz]ation|organi[sz]ations?|company|companies|revenue|spend|profit|roi|budget|status|summary|digest|kpi|metric|trend|history|audit)\b/i;

function isSubstantive(text) {
  if (!text) return false;
  if (text.length > 50) return true; // long messages are almost never smalltalk
  if (/\d/.test(text)) return true; // numbers usually mean a real request
  if (PLATFORM_NOUNS.test(text)) return true;
  // Verb alone is enough only if it's the main verb of a question/command
  // (avoid false positives on "have a nice day")
  if (SUBSTANTIVE_VERBS.test(text)) {
    // Allow common smalltalk that contains substantive-looking words
    if (/^(thanks?\s+for\s+(asking|that|the\s+help)|how\s+(are\s+you|is\s+it\s+going|do\s+you\s+do))\b/i.test(text)) return false;
    return true;
  }
  return false;
}

// ── Pattern matchers per intent ────────────────────────────────────────────
// Each returns true if the (already normalised) text matches.

const PATTERNS = {
  greeting: /^(hi+|hello+|hey+|heya|heyy+|hola|holla|yo+|sup|howdy|good\s+(morning|afternoon|evening)|morning|afternoon|evening|gm|gn|good\s+night|nighty|nighty\s+night|hej|halo|salut|salam|namaste|приве[тт]|здравствуй(те)?|привіт|hallo|guten\s+(tag|morgen|abend)|ciao(?!\s)|aloha)$/i,
  goodbye: /^(bye+|byeee+|goodbye|cya|see\s+(ya|you)(\s+later)?|ttyl|gtg|gotta\s+go|ciao\s+ciao|adios|adieu|tschuss|tschüss|au\s+revoir|до\s+свидания|пока|bb|catch\s+you\s+later|laters)$/i,
  thanks: /^(thanks?|thank\s+you|thx|tnx|ty+|cheers|much\s+(appreciated|obliged)|thanks?\s*[!.]*|danke(\s+schön)?|gracias|merci|спасибо|дякую|toda|сяба|ευχαριστώ)$/i,
  affirm: /^(yes+|yeah+|yep+|yup|yass+|sure|ok+|okay+|k+|kk+|cool+|nice+|awesome+|perfect+|great|sweet|got\s+it|gotcha|sounds?\s+good|works\s+for\s+me|absolutely|definitely|of\s+course|alright|aight|fine|word|right|true|fair|exactly|indeed|да+|ага|конечно|ладно)$/i,
  negate: /^(no+|nope+|nah+|not\s+really|not\s+now|no\s+thanks?|never\s+mind|nvm|nm|нет|неа)$/i,
  pleasantry: /^(how\s+(are\s+you|are\s+u|r\s+u|is\s+it\s+going|are\s+things|have\s+you\s+been)\??|hru|whats?\s+up|what\s*['']?s\s+up|wassup|whatcha\s+(doin|doing|up\s+to))$/i,
  laugh: /^(lol+|lmao+|rofl|haha+|hehe+|heh+|jaja+|kkk+|xd+|😂+|🤣+)$/i,
  confused: /^(\?+|huh\??|what\??|wat\??|wut\??|idk|i\s+don'?t\s+know|hm+|hmm+|что\??|что\s+ты)$/i,
  noise: /^([.…]+|k|kk|kkk|—|-|hm|mm+)$/i,
};

// Pure-emoji detection. Telegram emoji often include skin tones + ZWJ joiners.
// We accept ANY message that contains only emoji + whitespace as a reaction.
const EMOJI_ONLY = /^[\s\p{Extended_Pictographic}\p{Emoji_Presentation}‍️]+$/u;

function classifyEmoji(text) {
  // Match by string-includes — character classes mis-handle multi-codepoint emoji.
  const has = (list) => list.some((e) => text.includes(e));
  // Order matters: more specific intents first (thanks/greeting/laugh) before generic affirm.
  if (has(['🙏', '❤️', '♥', '💖', '💕', '💗', '😍', '🥰'])) return 'thanks';
  if (has(['👋', '🤝']))                                    return 'greeting';
  if (has(['😂', '🤣', '😆', '😄', '🙃']))                  return 'laugh';
  if (has(['🤔', '❓', '❔']))                              return 'confused';
  if (has(['👎', '❌']))                                    return 'negate';
  if (has(['👍', '👌', '🙌', '✅', '✔', '💯', '🆗']))      return 'affirm';
  return 'reaction'; // catch-all emoji
}

// ── Response pools per personality ─────────────────────────────────────────
// Each intent × personality has 3–5 variants. {name} expands to " <FirstName>"
// with a leading space when known, or "" otherwise — preserves grammar.

const POOLS = {
  professional: {
    greeting: ['Hello{name}.', 'Good day{name}.', 'Hello — how can I help?', 'Hello{name}. Ready when you are.'],
    goodbye: ['Goodbye{name}.', 'Take care.', 'Talk soon.'],
    thanks: ['You\'re welcome.', 'Glad to help.', 'My pleasure{name}.', 'Anytime.'],
    affirm: ['Acknowledged.', 'Understood.', 'Noted.', 'On it.'],
    negate: ['Understood.', 'No problem.', 'Acknowledged.'],
    pleasantry: ['All systems nominal — what can I help with?', 'Operational. How can I assist?', 'Ready and well — what do you need?'],
    laugh: ['😄', 'Glad you enjoyed that.', '👍'],
    confused: ['Could you rephrase? Try /help for what I can do.', 'I\'m not sure — try /help for a list of commands.', 'Sorry, can you clarify? /help shows what I can do.'],
    reaction: ['👍', 'Acknowledged.', '✓'],
    noise: ['👍', 'Standing by.'],
  },
  friendly: {
    greeting: ['Hey{name}! 👋', 'Hi there!', 'Hello{name}, good to hear from you!', 'Hey! What\'s on your mind?', 'Heya{name}!'],
    goodbye: ['Catch you later{name}! 👋', 'Bye{name}!', 'Talk soon!', 'See you around!'],
    thanks: ['You got it{name}! 😊', 'Anytime!', 'Happy to help!', 'My pleasure!', 'No worries at all 🙌'],
    affirm: ['Awesome 👍', 'Got it!', 'On it{name}!', 'Sweet — done.', 'Nice 💪'],
    negate: ['No worries.', 'All good!', 'Got it — let me know if you change your mind.'],
    pleasantry: ['Doing great, thanks for asking! What can I do for you?', 'All good here{name}! What\'s up?', 'Living the dream 😄 What do you need?'],
    laugh: ['😂', 'Haha, glad you liked that!', '🤣 right?', '😄'],
    confused: ['Hmm, not sure what you mean — try /help for what I can do! 🤔', 'Could you say that another way? Or hit /help.', '🤷 try /help and I\'ll show you my tricks'],
    reaction: ['👍', '✨', '🙌'],
    noise: ['👀', '👋'],
  },
  technical: {
    greeting: ['Acknowledged.', 'Online.', 'Ready.', 'Hello{name}.'],
    goodbye: ['Disconnecting.', 'Session closed.', 'Standing down.'],
    thanks: ['Logged.', 'Confirmed.', 'Acknowledged.'],
    affirm: ['Confirmed.', 'Acknowledged.', '+1', 'OK.'],
    negate: ['Acknowledged.', 'Skipped.', 'No-op.'],
    pleasantry: ['Operational. State your request.', 'Status: nominal. Awaiting input.'],
    laugh: ['👍', 'Noted.'],
    confused: ['Parse error. Try /help for supported commands.', 'No match. /help for reference.'],
    reaction: ['✓', '+1'],
    noise: ['Standing by.'],
  },
  creative: {
    greeting: ['Heya{name}! ✨', 'Greetings, traveler! 🚀', 'Hi friend{name}!', 'Salutations! 🌟', 'A wild user appears! 🌱'],
    goodbye: ['Farewell{name}! ✨', 'Until next time, friend! 🌙', 'May your goals run swiftly! 🏃'],
    thanks: ['Always 🌟', 'For you, anytime{name}! 💫', 'A pleasure, truly! 🙇', 'My circuits hum with joy 🎶'],
    affirm: ['Onward! 🚀', 'As you wish! ✨', 'Engaging hyperdrive 🌠', 'Aye aye{name}! 🫡'],
    negate: ['No worries, dear traveler 🌿', 'All paths welcome 🛤️'],
    pleasantry: ['Operating in the cosmic flow ✨ what brings you here?', 'Vibing! 🌈 What\'s the mission?'],
    laugh: ['😂✨', 'A worthy laugh! 🎭', '🤣 chef\'s kiss'],
    confused: ['The map is unclear, friend 🗺️ — try /help for a compass.', 'Lost in translation 🌀 try /help'],
    reaction: ['✨', '🌟', '🙌'],
    noise: ['👁️', '✨'],
  },
  minimal: {
    greeting: ['Hi.', '👋', 'Hey.', 'Hello.'],
    goodbye: ['Bye.', '👋'],
    thanks: ['👍', 'np', 'sure'],
    affirm: ['👍', 'ok', '✓'],
    negate: ['ok', '👍'],
    pleasantry: ['Fine. You?'],
    laugh: ['😄', '👍'],
    confused: ['/help'],
    reaction: ['👍'],
    noise: ['👍'],
  },
};

// ── Normalisation ──────────────────────────────────────────────────────────

function normalise(text) {
  if (!text) return '';
  // Strip leading/trailing whitespace + trailing punctuation (one or more).
  return String(text).trim().replace(/[\s.,!?;:~`'"-]+$/u, '').toLowerCase();
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Try to match a smalltalk pattern. Returns { reply, intent } or null.
 *
 * @param {string} text — raw user input
 * @param {object} opts
 * @param {string} [opts.personality='professional']
 * @param {string} [opts.firstName] — optional first name for personalisation
 * @param {string} [opts.lastBotIntent] — reserved for v2 context awareness
 * @returns {{ reply: string, intent: string } | null}
 */
export function matchSmalltalk(text, opts = {}) {
  const personality = POOLS[opts.personality] ? opts.personality : 'professional';
  const firstName = (opts.firstName || '').trim();

  const raw = String(text || '').trim();
  if (!raw) return null;

  // Substantive guard — anything that looks like a real request goes to LLM.
  if (isSubstantive(raw)) return null;

  // Pre-normalise specials: pure-? / pure-. would otherwise get stripped
  // to '' by `normalise` and lose their intent signal.
  if (/^[?¿]+$/u.test(raw)) {
    return { reply: pickFrom(POOLS[personality].confused, firstName), intent: 'confused' };
  }
  if (/^[.…]+$/u.test(raw)) {
    return { reply: pickFrom(POOLS[personality].noise, firstName), intent: 'noise' };
  }

  // Pure-emoji fast path before normalising (lowercase strips emoji info).
  if (EMOJI_ONLY.test(raw)) {
    const intent = classifyEmoji(raw);
    return { reply: pickFrom(POOLS[personality][intent] || POOLS[personality].reaction, firstName), intent };
  }

  const normalised = normalise(raw);
  if (!normalised) {
    return { reply: pickFrom(POOLS[personality].noise, firstName), intent: 'noise' };
  }

  // Length sanity: smalltalk is short.
  if (normalised.length > 35) return null;

  for (const [intent, pattern] of Object.entries(PATTERNS)) {
    if (pattern.test(normalised)) {
      const pool = POOLS[personality][intent] || POOLS[personality].affirm;
      return { reply: pickFrom(pool, firstName), intent };
    }
  }

  return null;
}

function pickFrom(pool, firstName) {
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  const nameSlot = firstName ? ` ${firstName}` : '';
  return tpl.replace(/\{name\}/g, nameSlot);
}

// Expose internals for tests.
export const __internals = { isSubstantive, normalise, classifyEmoji, PATTERNS, EMOJI_ONLY };
