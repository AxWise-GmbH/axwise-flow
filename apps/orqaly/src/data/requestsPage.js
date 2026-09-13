// Marketing copy for /control/requests — mirrors Job Pool goals + GoalDetailDialog

export const REQUESTS_HUB_INTRO = {
  eyebrow: 'Goal lifecycle',
  title: 'Every ask becomes a goal you run end to end.',
  subtitle:
    'Submit through Smart Request in Job Pool, watch the pipeline form teams and tools, steer with the goal actions menu, and finish with deliverables, report, and deployment — same surfaces as /job-pool.',
};

export const GOAL_PILLARS = [
  {
    id: 'launch',
    iconName: 'RocketLaunchOutlined',
    title: 'Launch',
    body: 'Smart Request wizard: voice or text intake, files, Consilium team pick, and cost estimate before the goal is created.',
    linkLabel: 'Smart Request · 3 steps',
  },
  {
    id: 'pipeline',
    iconName: 'AccountTreeOutlined',
    title: 'Pipeline',
    body: 'Analysis through executing — feasibility, planning, team formation, tool setup, estimates, and approval gates.',
    linkLabel: 'Goal detail · Pipeline tab',
  },
  {
    id: 'steer',
    iconName: 'TuneOutlined',
    title: 'Steer',
    body: 'Pause, resume, heal, setup tools, autopilot, loop, Pulse, workflow, and Talk with Team-Lead while the goal runs.',
    linkLabel: 'Actions menu',
  },
  {
    id: 'finish',
    iconName: 'InventoryOutlined',
    title: 'Finish',
    body: 'Work log, report, deliverables, agent ratings, deployment URL, adopt or implement to an org, retry on failure.',
    linkLabel: 'Result tab',
  },
];

export const SPOTLIGHT_LAUNCH = {
  eyebrow: 'Launch',
  title: 'Smart Request turns the ask into a goal.',
  body: 'The same three-step wizard in Job Pool: structured intake, Consilium assembles the solution and team, then you confirm and submit — the goal lands in your Goals list.',
  bullets: [
    'Voice, text, and file attachments on step one',
    'AI team composition and pipeline cost estimate',
    'Optional workflow attach before submit',
    'Also submit via voice, web, Telegram, email, or webhook',
  ],
};

export const SPOTLIGHT_PIPELINE = {
  eyebrow: 'Pipeline & work',
  title: 'See every stage until agents execute.',
  body: 'Goal detail opens on Pipeline, then Work Log while active, with live execution cards, budget bar, and theory preview — matching GoalDetailDialog in the app.',
  bullets: [
    'Stages: Analysis → PO doc → PM plan → team → tools → estimates → executing',
    'Awaiting approval, tools, or PO input when humans must decide',
    'Work log and activity log tabs on the goal card',
    'Token spend and phase budget visible as work progresses',
  ],
};

export const SPOTLIGHT_ACTIONS = {
  eyebrow: 'Steer & recover',
  title: 'Full control from the actions menu.',
  body: 'Everything in GoalActionsMenu: operational fixes, org handoff, automation settings, and team-lead chat — without leaving the goal.',
  bullets: [
    'Setup Tools, Heal Now, Pause, Resume, Cancel',
    'Adopt to New Business · Implement in Existing',
    'Loop, Add Pulse, Attach Workflow, Autopilot on/off',
    'Talk with Team-Lead · open continuation goals',
  ],
};

export const SPOTLIGHT_RESULTS = {
  eyebrow: 'Finish & intake',
  title: 'Deliverables, report, and the next ask.',
  body: 'Completed goals surface final results, deployment links, and agent ratings. New asks still arrive from every channel and become goals in Job Pool.',
  bullets: [
    'Report tab with metrics, retrospective, and deliverables',
    'Rate agents individually after completion',
    'Retry failed or cancelled goals from the goals list',
    'Inbox-style intake for channel-submitted work',
  ],
};
