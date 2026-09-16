/**
 * AI Assistant Conversation Service
 *
 * Generates natural, varied, context-aware replies.
 * Key design rules:
 *  1. NEVER repeat the exact same reply twice in a row.
 *  2. Always reference what the user said — paraphrase their words.
 *  3. Guide users toward actionable commands when appropriate.
 *  4. Track conversation depth so later replies feel like a real dialogue.
 *  5. Vary tone per AI mode.
 *  6. Support async LLM-powered replies with personality + fallback to templates.
 */
import { assistantChatApi } from './assistantChatApiService.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

let _replyCounter = 0;
function nextVariant(options) {
  if (!Array.isArray(options) || options.length === 0) return '';
  _replyCounter += 1;
  return options[_replyCounter % options.length];
}

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase();
}

function getRecentAssistantMessages(chatHistory = [], count = 3) {
  const msgs = [];
  for (let i = chatHistory.length - 1; i >= 0 && msgs.length < count; i -= 1) {
    if (chatHistory[i]?.role === 'assistant') msgs.push(normalize(chatHistory[i]?.message || ''));
  }
  return msgs;
}

function wasRecentlySaid(candidate, chatHistory) {
  const recent = getRecentAssistantMessages(chatHistory, 4);
  const norm = normalize(candidate);
  return recent.some((r) => r === norm || (norm.length > 40 && r.startsWith(norm.slice(0, 40))));
}

function avoidRepeating(candidates, chatHistory) {
  if (typeof candidates === 'string') candidates = [candidates];
  for (const c of candidates) {
    if (!wasRecentlySaid(c, chatHistory)) return c;
  }
  // All options were recently said — modify the first one
  const fallback = candidates[0] || '';
  const suffixes = [
    '\n\nLet me know what to do next.',
    '\n\nWhat would you like me to work on?',
    "\n\nI'm ready for your next instruction.",
    "\n\nJust say the word and I'll execute.",
    '\n\nTell me the next step you need.',
  ];
  return fallback + nextVariant(suffixes);
}

function extractUserTopic(text) {
  const t = normalize(text);
  // Remove filler words to get the core topic
  return t
    .replace(
      /^(hey|hi|hello|please|can you|could you|i want to|i need to|i'd like to|let's|let me|go ahead and|help me|show me)\s*/g,
      ''
    )
    .replace(/\s*(please|thanks|thank you|now|asap|right now|quickly)$/g, '')
    .trim();
}

// ── Mode-specific personality ───────────────────────────────────────────────

const MODE_PERSONALITY = {
  'Traffic Optimization Mode': {
    greeting: 'Traffic ops ready. What traffic patterns or routing should I analyze?',
    capabilities:
      'I specialize in traffic analysis, partner routing optimization, conversion tracking, and reallocating traffic for maximum ROI.',
    style: 'performance-focused',
  },
  'Partner Strategy Mode': {
    greeting: 'Partner strategy active. Which partner relationship or onboarding should I handle?',
    capabilities:
      'I manage partner lifecycle end-to-end: onboarding, performance monitoring, agreement configuration, and strategic allocation.',
    style: 'relationship-focused',
  },
  'Project Management Mode': {
    greeting: 'Project management engaged. Which project should I organize or create?',
    capabilities:
      'I handle project creation, task breakdown, milestone tracking, workflow binding, team assignments, and deadline management.',
    style: 'delivery-focused',
  },
  'Infrastructure Integrity Mode': {
    greeting:
      'Infrastructure check active. What system health or workflow issue should I diagnose?',
    capabilities:
      'I monitor system health, detect broken workflows, repair data inconsistencies, validate permissions, and ensure structural integrity.',
    style: 'reliability-focused',
  },
  'Executive Insight Mode': {
    greeting: 'Executive dashboard ready. What metrics, KPIs, or strategic overview do you need?',
    capabilities:
      'I provide cross-module analytics, KPI tracking, financial impact analysis, risk forecasting, and strategic recommendations across all operations.',
    style: 'strategic',
  },
};

function getPersonality(mode) {
  return MODE_PERSONALITY[mode] || MODE_PERSONALITY['Executive Insight Mode'];
}

// ── Public API ──────────────────────────────────────────────────────────────

export function buildActionSummaryReply(actions = [], mode = 'Executive Insight Mode') {
  const executable = (actions || []).filter(
    (a) => a.type !== 'assistant_reply' && a.type !== 'info'
  );
  const infos = (actions || []).filter((a) => a.type === 'info');

  if (executable.length === 0 && infos.length === 0) {
    return 'I didn\'t detect a specific action in that. Could you rephrase? For example: "create a project called X" or "show me all partners".';
  }

  const personality = getPersonality(mode);
  const actionLabels = executable
    .slice(0, 4)
    .map((a) => `• ${a.label}`)
    .join('\n');
  const infoLabels = infos
    .slice(0, 3)
    .map((a) => `• ${a.label}`)
    .join('\n');

  const parts = [];
  if (executable.length > 0) {
    const openers = [
      `Got it. I've identified ${executable.length} action${executable.length > 1 ? 's' : ''} to execute:`,
      `Here's what I'll do — ${executable.length} operation${executable.length > 1 ? 's' : ''} ready:`,
      `Understood. I've prepared ${executable.length} step${executable.length > 1 ? 's' : ''}:`,
      `I mapped your request to ${executable.length} executable action${executable.length > 1 ? 's' : ''}:`,
    ];
    parts.push(`${nextVariant(openers)}\n${actionLabels}`);

    if (executable.some((a) => a.requiresConfirmation)) {
      parts.push('\nSome actions need your confirmation before I proceed.');
    }
  }

  if (infos.length > 0) {
    parts.push(
      `\nI also have ${infos.length} insight${infos.length > 1 ? 's' : ''} ready:\n${infoLabels}`
    );
  }

  parts.push(
    `\n\nOperating in ${personality.style} mode. Review the panel and say "go ahead" to execute, or tell me to adjust.`
  );

  return parts.join('');
}

export function buildConversationalReply({
  text,
  chatHistory = [],
  mode = 'Executive Insight Mode',
}) {
  const t = normalize(text);
  const topic = extractUserTopic(text);
  const personality = getPersonality(mode);
  const conversationDepth = (chatHistory || []).filter((m) => m?.role === 'user').length;

  // ── Empty input ─────────────────────────────────────────────────────────
  if (!t) {
    return avoidRepeating(
      [
        "I'm here and ready. What do you need me to do?",
        "Standing by. Tell me your goal and I'll handle it.",
        `${personality.greeting}`,
      ],
      chatHistory
    );
  }

  // ── Greetings ───────────────────────────────────────────────────────────
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening)|howdy|what's up)\b/.test(t)) {
    if (conversationDepth <= 1) {
      return avoidRepeating(
        [
          `Hi! ${personality.greeting}`,
          `Hello! ${personality.capabilities} What should I tackle first?`,
          `Hey! I'm ready in ${mode}. What outcome do you want?`,
        ],
        chatHistory
      );
    }
    return avoidRepeating(
      [
        'Welcome back. Where were we? Tell me the next step.',
        "Hey again! What's next on the agenda?",
        'Hi! Ready to continue. What should I do next?',
      ],
      chatHistory
    );
  }

  // ── Affirmation / confirmation ──────────────────────────────────────────
  if (
    /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|proceed|confirmed?|absolutely|right|correct|exactly)\b/.test(
      t
    )
  ) {
    return avoidRepeating(
      [
        'On it. What specifically should I execute?',
        "Got the green light. Tell me the action and I'll handle it.",
        "Ready to go. What's the task?",
        "Confirmed. Give me the details and I'll get it done.",
        'Understood. Just tell me what to create, update, or check.',
        "Let's move. What should I do first?",
      ],
      chatHistory
    );
  }

  // ── Thanks / positive feedback ──────────────────────────────────────────
  if (/\b(thanks|thank you|great|awesome|perfect|nice|good job|well done|excellent)\b/.test(t)) {
    return avoidRepeating(
      [
        "You're welcome! What's the next thing I should handle?",
        "Glad that worked. I can keep going — what's next?",
        'Happy to help. Want me to move to the next action?',
        'Noted. Ready for your next instruction.',
        'Anytime. What should I tackle now?',
        'Good to hear. Point me at the next task.',
      ],
      chatHistory
    );
  }

  // ── Help / capabilities ─────────────────────────────────────────────────
  if (
    /\b(help|what can you do|capabilit|what do you know|what are your|how do you work)\b/.test(t)
  ) {
    return avoidRepeating(
      [
        `${personality.capabilities}\n\nTry saying things like:\n• "Create a project called Germany Campaign"\n• "Add a partner named Nova with group Webmaster"\n• "Build a workflow for lead qualification"\n• "Assign partner X to project Y"\n• "Show me all tasks"\n• "What needs my attention?"\n• "Run a system health check"`,
        `Here's what I can do in ${mode}:\n\n• Create projects, partners, tasks, and workflows\n• Link and assign entities to each other\n• Show summaries, metrics, and reports\n• Run system checks and fix issues\n• Navigate anywhere in the platform\n\nJust tell me what you need in plain language.`,
      ],
      chatHistory
    );
  }

  // ── Problems / errors ───────────────────────────────────────────────────
  if (/\b(not working|broken|issue|problem|error|bug|wrong|fail|crash|stuck)\b/.test(t)) {
    return avoidRepeating(
      [
        `I hear you — something's not right with ${topic || 'that'}. Let me help troubleshoot. Can you tell me:\n1. What you were trying to do\n2. What happened instead\n\nI'll diagnose and fix it step by step.`,
        `Got it, there's an issue with ${topic || 'this'}. I can run a diagnostic check or you can describe what went wrong and I'll isolate the cause.`,
        `Understood. Let me look into ${topic || 'this'} right away. Would you like me to run a full system health check, or should I focus on a specific area?`,
      ],
      chatHistory
    );
  }

  // ── "What now" / next steps ─────────────────────────────────────────────
  if (/\b(what should i do|next step|what now|what's next|now what|what else|continue)\b/.test(t)) {
    return avoidRepeating(
      [
        'Here are some useful next steps:\n• Create or review a project\n• Check partner performance\n• Build a new workflow\n• See what needs attention\n\nPick one, or tell me your own goal.',
        `In ${mode}, I'd suggest:\n• Run "show summary" for a quick overview\n• Check "what needs my attention" for urgent items\n• Or tell me a specific task and I'll execute it right away.`,
        'Give me a specific goal and I\'ll break it down. For example: "Set up a new partner called X, create a project for them, and add a task to review their contract."',
      ],
      chatHistory
    );
  }

  // ── Questions about the platform ────────────────────────────────────────
  if (/^(what|how|where|when|who|why|which|can|does|is|are)\b/.test(t) || t.endsWith('?')) {
    return avoidRepeating(
      [
        `Good question about "${topic}". I can look into that for you. If it's about data or metrics, try asking me to "show summary" or "show ${topic}". If you want me to take action, just tell me what to do.`,
        `About "${topic}" — I can help you with that. Do you want me to show you information, navigate to the relevant page, or take a specific action?`,
        `I can answer that. For "${topic}", would you like a data overview, a detailed breakdown, or should I perform an action?`,
      ],
      chatHistory
    );
  }

  // ── Compound / multi-part request that wasn't fully parsed ──────────────
  if (
    /\b(and|also|plus|additionally|as well|on top of that|furthermore|moreover)\b/.test(t) &&
    t.length > 50
  ) {
    return avoidRepeating(
      [
        `I see you have multiple requests in there about "${topic}". Let me handle them one at a time. What's the first thing I should do?`,
        `That's a complex request. I can break "${topic}" into individual steps. Would you like me to create a plan first, or should I start executing right away?`,
        `Got it — multiple objectives around "${topic}". I'll process them sequentially. Say "go ahead" to start, or rephrase each part separately for more precision.`,
      ],
      chatHistory
    );
  }

  // ── Fallback: acknowledge what they said, guide toward action ───────────
  const contextual = topic
    ? [
        `I understand you want to work on "${topic}". To turn that into an action, try phrasing it as a command. For example:\n• "Create a project called ${topic}"\n• "Show me ${topic}"\n• "Fix issues with ${topic}"`,
        `Got it — "${topic}". I can help with that. Would you like me to create something, show data, or take a different action? Just tell me specifically.`,
        `About "${topic}" — tell me exactly what you need: create, update, delete, show, or analyze? I'll execute immediately.`,
      ]
    : [
        'I\'m ready to help. Tell me a specific action and I\'ll execute it. Examples:\n• "Create a new project"\n• "Show all partners"\n• "Run a system check"\n• "What needs my attention?"',
        `I am in ${mode} and ready. Give me a concrete goal and I will break it into steps and execute.`,
        'I need a bit more detail to act on that. What exactly would you like me to create, show, or fix?',
      ];

  return avoidRepeating(contextual, chatHistory);
}

// ── Personality IDs ─────────────────────────────────────────────────────────

export const ASSISTANT_PERSONALITIES = [
  { id: 'professional', label: 'Professional', description: 'Concise, data-driven' },
  { id: 'friendly', label: 'Friendly', description: 'Warm, encouraging' },
  { id: 'technical', label: 'Technical', description: 'Detailed, precise' },
  { id: 'creative', label: 'Creative', description: 'Novel, metaphorical' },
  { id: 'minimal', label: 'Minimal', description: 'Ultra-brief' },
];

// ── Async LLM-powered reply (with template fallback) ────────────────────────

/**
 * Generate a conversational reply using LLM backend, falling back to local templates.
 * @param {{ text: string, chatHistory: Array, mode: string, personality: string, token: string }} opts
 * @returns {Promise<{ message: string, fromLlm: boolean }>}
 */
export async function buildAsyncConversationalReply({
  text,
  chatHistory = [],
  mode = 'Executive Insight Mode',
  personality = 'professional',
  token,
  assistantMode,
  boardId,
}) {
  // Talk mode + boardId → consilium-discuss (multi-member brainstorm)
  if (assistantMode === 'talk' && boardId) {
    try {
      const result = await assistantChatApi({
        action: 'consilium-discuss',
        topic: text,
        boardId,
        token,
      });
      if (result?.discussion?.length) {
        const lines = result.discussion
          .map((m) => `• ${m.memberName} (${m.position}): ${m.opinion}`)
          .join('\n');
        const header = result.consensus
          ? `Consensus: ${result.consensus.dominantPosition} (avg confidence ${result.consensus.averageConfidence}/10)\n\n`
          : '';
        return { message: `${header}${lines}`, fromLlm: true, source: 'consilium' };
      }
      if (result?.message) {
        return { message: result.message, fromLlm: true };
      }
    } catch {
      // fall through to natural-reply
    }
  }

  // Try LLM-powered reply via backend
  try {
    const history = chatHistory.slice(-6).map((m) => ({
      role: m.role || 'user',
      content: m.message || m.content || '',
    }));

    const contextLines = [`Operating in ${mode}`];
    if (assistantMode === 'talk') {
      contextLines.push(
        'The user is in TALK mode — brainstorming, not requesting actions. Do not suggest tools or actions, respond conversationally.'
      );
    }

    const result = await assistantChatApi({
      action: 'natural-reply',
      message: text,
      personality,
      context: contextLines.join('. '),
      history,
      token,
    });

    if (result?.message) {
      return { message: result.message, fromLlm: true, cost: result.cost };
    }
  } catch {
    // Fallback to local templates
  }

  // Fallback: use existing template-based reply
  return {
    message: buildConversationalReply({ text, chatHistory, mode }),
    fromLlm: false,
  };
}

/**
 * Send a message to the LLM function-calling endpoint for intent parsing.
 * @param {{ message: string, history: Array, personality: string, userRole: string, memories: string[], token: string }} opts
 * @returns {Promise<{ calls: Array, message: string }>}
 */
export async function parseLlmIntent({
  message,
  history = [],
  personality = 'professional',
  userRole = 'admin',
  memories = [],
  token,
}) {
  const formattedHistory = history.slice(-6).map((m) => ({
    role: m.role || 'user',
    content: m.message || m.content || '',
  }));

  return assistantChatApi({
    action: 'chat',
    message,
    history: formattedHistory,
    personality,
    userRole,
    memories,
    token,
  });
}
