/**
 * Copy for the Home "Explain?" guided tour (see HomeExplainTour.jsx).
 *
 * One entry per HOME_BLOCK_DEFS id (homeTemplates.js). Each entry answers three
 * questions for a block: what it shows (`how`), where its data comes from
 * (`source`), and what setup is required for it to populate (`needs`).
 *
 * Keep `source`/`how` to a sentence or two and `needs` to a few short bullets -
 * this renders inside a small popup next to the highlighted block.
 *
 * `cta` is the primary "complete this step" action shown in the popup:
 *   { label, kind: 'quick-action' | 'navigate', action?, to? }
 * - 'quick-action' fires the global `orch-quick-action` event (QuickActionDialogs)
 *   so the dialog opens in place on Home; `action` is one of org|keys|assistant.
 * - 'navigate' routes to `to`, where `?action=create` auto-opens that page's
 *   create dialog.
 */
export const HOME_EXPLAIN = {
  org_metrics: {
    title: 'Key Stats',
    source:
      'Organization hierarchy loaded by useOrgOverview, composed from the organizations, agent_teams, agents, tools and team_tasks tables.',
    how: 'Six animated bars - Units, Teams, Consilium, Agents, Tools and open Tasks - sized relative to the largest value. Click a bar to open that feature.',
    needs: [
      'At least one organization, selected in the org picker',
      'Child organizations for the Units count',
      'Teams created and agents assigned to them',
      'Tools connected (active) and team tasks created',
    ],
    cta: { label: 'Create organization', kind: 'quick-action', action: 'org' },
  },
  goals: {
    title: 'Goals in Action',
    source: 'Live goals list via /api/app?path=goals&op=list (the goals table).',
    how: 'Each row shows a goal title, a colour-coded status chip and its phase progress, newest first. Click a row to open the goal detail.',
    needs: [
      'At least one goal created (a title is required)',
      'Goals progress through the pipeline as the Consilium works them',
    ],
    cta: { label: 'Create a goal', kind: 'navigate', to: '/job-pool?action=create' },
  },
  loops: {
    title: 'Loops from Agents',
    source: 'Looped goals via /api/app?path=goals&op=loops (goals joined with agent data).',
    how: 'Shows the agent, the goal, the loop count (current/max) and when it started. Agent and goal cells link to their detail views.',
    needs: [
      'A goal with looping enabled (loop_enabled) or already iterating',
      'An agent assigned as the team lead for the goal',
      'The goal started inside the selected time window',
    ],
    cta: { label: 'Create a goal', kind: 'navigate', to: '/job-pool?action=create' },
  },
  performance: {
    title: 'Performance',
    source:
      'LLM usage timeseries via /api/ops?path=usage-analytics&entity=all for the selected date range.',
    how: 'A trend chart of Tokens, Calls and Activity per day over the time window. Toggle lines on/off from the legend.',
    needs: [
      'LLM calls made (any provider) during the selected window',
      'A wider window (30/90 days) if recent activity is sparse',
    ],
    cta: { label: 'Connect an LLM provider', kind: 'quick-action', action: 'keys' },
  },
  activity: {
    title: 'Activity',
    source:
      'Agent operations (team_tasks, agent reports, workflows, projects) merged with human actions from the audit_log table.',
    how: 'An hourly sparkline plus a table of Instrument, Action, Persona and time. Toggle between Agents and Human actors.',
    needs: [
      'Agents doing work (tasks, reports, workflows) or user actions recorded in the audit log',
      'Activity inside the selected time window',
    ],
    cta: { label: 'Set up your assistant', kind: 'quick-action', action: 'assistant' },
  },
  communicator: {
    title: 'Communicator',
    source: 'Recent goal-room messages from the goal_messages table (scoped to your goals).',
    how: 'An auto-scrolling feed of agent, Consilium and system messages with category chips. Click a message to expand or open the full conversation.',
    needs: [
      'Goals with agents and a goal room created',
      'Messages sent to the room inside the selected window',
    ],
    cta: { label: 'Create a goal', kind: 'navigate', to: '/job-pool?action=create' },
  },
  llm_usage: {
    title: 'LLM Usage',
    source: 'Usage analytics via /api/ops?path=usage-analytics&entity=all (45s client cache).',
    how: 'A donut of tokens by model (top 6 + Other) alongside KPIs - cost, calls, avg tokens, quality - with trend sparklines.',
    needs: [
      'LLM calls made through any provider (Groq, OpenAI, Anthropic, GLM, Qwen, Gemini or local Ollama)',
      'Usage tracked and aggregated by the backend',
    ],
    cta: { label: 'Connect an LLM provider', kind: 'quick-action', action: 'keys' },
  },
  data_ops: {
    title: 'Data Operations',
    source:
      'Knowledge base writes read from the knowledge_documents table (joined with agents for authorship).',
    how: 'A table of document Type, Name, Action, authoring Agent and time. Names and agents link to their detail views.',
    needs: [
      'Knowledge base documents created (by you or an agent), each with a title and type',
      'Documents written inside the selected time window',
    ],
    cta: { label: 'Add to Knowledge Base', kind: 'navigate', to: '/knowledge-base?action=create' },
  },
  org_structure: {
    title: 'Organization',
    source:
      'Organization hierarchy from useOrgOverview (the organizations table, joined on parent_id).',
    how: 'A hierarchy view: the parent org, the selected org highlighted, and a grid of its sub-organizations.',
    needs: [
      'Organizations created with parent/child relationships and an org type',
      'An organization selected in the org picker',
    ],
    cta: { label: 'Create organization', kind: 'quick-action', action: 'org' },
  },
  consilium: {
    title: 'Consilium Activity',
    source:
      'Boards and evaluations from the concilium, concilium_members and concilium_evaluations tables.',
    how: 'Approval and score gauges, board/member/decision counts, a per-board breakdown and a carousel of the latest decisions.',
    needs: [
      'A Consilium board created and attached to the organization',
      'At least one board member',
      'Evaluations recorded (with a score and approval flag)',
    ],
    cta: { label: 'Create a board', kind: 'navigate', to: '/consilium?action=create' },
  },
};

export default HOME_EXPLAIN;
