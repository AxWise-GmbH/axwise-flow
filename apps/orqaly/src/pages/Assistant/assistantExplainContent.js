/**
 * Copy for the Assistant console "Explain?" guided tour (shared ExplainTour).
 *
 * One entry per ASSISTANT_BLOCK_DEFS id (AssistantPage.jsx). Each entry answers:
 * what the block shows (`how`), where its data comes from (`source`), what setup
 * it needs (`needs`), and a primary CTA (`cta`).
 *
 * `cta` is either:
 *   { label, step }  - opens the setup wizard at that step via openEdit(step)
 *   { label, to }    - navigates to a route
 * Steps match AssistantPage's openEdit() vocabulary: keys, channel, voice, data,
 * brief, insights. Plain hyphens only (project rule).
 */
export const ASSISTANT_EXPLAIN = {
  profile: {
    title: 'Core',
    source:
      'Your assistant_setup config (provider, model, tone, temperature) via useAssistantSetup.',
    how: 'Editable provider/model/tone dropdowns and a creativity slider that map straight to the model call.',
    needs: ['An assistant created for your account', 'An LLM provider and model selected'],
    cta: { label: 'Edit profile & model', step: 'keys' },
  },
  voice: {
    title: 'Voice',
    source:
      'assistant_setup.config.voice plus a live reachability probe to the local Voicebox app (/health).',
    how: 'Shows the voice provider, reachable status, language and voice profile, with a sample to play.',
    needs: [
      'A voice provider configured (Voicebox or built-in)',
      'For Voicebox: the local app running and reachable',
    ],
    cta: { label: 'Configure voice', step: 'voice' },
  },
  channels: {
    title: 'Channels',
    source: 'The communication_channels table via communicatorService.getChannels().',
    how: 'Lists your connected channels (Telegram, Slack, Web) with a connected/inactive status, plus an add button.',
    needs: ['At least one channel connected (status active)', 'One active channel per platform'],
    cta: { label: 'Connect a channel', step: 'channel' },
  },
  communication: {
    title: 'Communication Activity',
    source: 'Inbound rows from the communication_logs table, bucketed into a daily series.',
    how: 'A messages-per-day bar chart over 7/30/90 days; assistant and agent self-sends are excluded.',
    needs: ['A connected channel', 'Inbound messages recorded in the window'],
    cta: { label: 'Connect a channel', step: 'channel' },
  },
  chat: {
    title: 'Assistant Chat',
    source:
      'Live replies from the assistant-chat endpoint (your provider/model); history from assistant_chat_messages.',
    how: 'Chat with your assistant inline - type, attach files or dictate by voice - or switch to Goal to turn a message into a goal. Expand for a full-screen view.',
    needs: ['An assistant created with a provider and model selected'],
    cta: { label: 'Edit profile & model', step: 'keys' },
  },
  data: {
    title: 'Data',
    source: 'Knowledge base documents the assistant can draw on.',
    how: 'Summarises what the assistant knows and lets you manage the underlying knowledge.',
    needs: ['Knowledge base documents added for this assistant'],
    cta: { label: 'Manage knowledge', step: 'data' },
  },
  contacts: {
    title: 'Contacts',
    source: 'Your saved contacts (with their organization), shown with platform icons.',
    how: 'Lists known people the assistant talks to and lets you add or remove contacts.',
    needs: ['Contacts added (manually or matched from conversations)'],
    cta: { label: 'Manage contacts', step: 'data' },
  },
  brief: {
    title: 'Company Brief',
    source: 'Your company brief answers (the interview that grounds the assistant).',
    how: 'Shows brief completion status with quick access to review or answer the questions.',
    needs: ['The company brief interview started or completed'],
    cta: { label: 'Answer company brief', step: 'brief' },
  },
  arena: {
    title: 'Arena',
    body: 'Your people and your agents on the same daily job. Register what your team delivered, send an agent at the same brief, rate both, and Arena keeps score by department with real cost, time and rework.',
    cta: { label: 'Open Arena', to: '/arena' },
  },
  team: {
    title: 'Contributions',
    source: 'Team chat threads and contribution activity from the communicator and knowledge base.',
    how: 'Shows recent team conversation and what the assistant has contributed.',
    needs: ['Team activity in the communicator', 'Contributions recorded in the knowledge base'],
    cta: { label: 'Open Communicator', to: '/communicator' },
  },
  insights: {
    title: 'Insights',
    source: 'Analysis generated over your assistant activity.',
    how: 'Surfaces patterns and suggestions; you can generate a fresh batch on demand.',
    needs: ['Enough activity to analyse', 'Insights generated at least once'],
    cta: { label: 'Generate insights', step: 'insights' },
  },
  conversations: {
    title: 'Conversations',
    source: 'communication_logs grouped into threads by thread_id.',
    how: 'A searchable table of conversations - channel, participants, last message and time - filterable by channel and date.',
    needs: ['A connected channel', 'Messages exchanged in a thread'],
    cta: { label: 'Open Communicator', to: '/communicator' },
  },
  usage: {
    title: 'Usage',
    source:
      '/api/ops?path=usage-analytics across the assistant sources (chat, replies, TTS, brief) from llm_usage.',
    how: 'A tokens/cost donut with a per-model breakdown and a trend sparkline; toggle Tokens vs Cost.',
    needs: ['An LLM provider connected', 'Assistant LLM calls recorded'],
    cta: { label: 'Connect an LLM provider', step: 'keys' },
  },
};

export default ASSISTANT_EXPLAIN;
