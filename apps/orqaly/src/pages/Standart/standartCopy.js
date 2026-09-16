/** Public copy for the personal-account GCP launch. */

export const SECTION_IDS = [
  'hero',
  'demo',
  'platform',
  'how',
  'proof',
  'features',
  'work',
  'many',
  'standart',
  'suite',
  'security',
  'principles',
  'mission',
  'pricing',
  'news',
  'cta',
];

export const NAV = {
  brand: 'Orqaly',
  brandHome: 'Orqaly - home',
  items: [
    {
      id: 'product',
      label: 'Product',
      columns: [
        {
          heading: 'Use Orqaly',
          desc: 'The launch workspace',
          links: [
            {
              label: 'Assistant',
              desc: 'Ask, refine, and start substantial work',
              to: '/assistant',
            },
            { label: 'Goals', desc: 'Approve and follow durable work', to: '/goals' },
          ],
        },
        {
          heading: 'Understand it',
          desc: 'The launch flow',
          links: [
            { label: 'Features', desc: 'Assistant and durable Goals', to: '/features' },
            { label: 'How it works', desc: 'From request to saved result', to: '/how-it-works' },
          ],
        },
      ],
      footer: { label: 'Open Assistant', to: '/assistant' },
    },
    { id: 'pricing', label: 'Pricing', to: '/pricing' },
    {
      id: 'resources',
      label: 'Resources',
      columns: [
        {
          heading: 'Learn',
          desc: 'Launch information',
          links: [
            { label: 'Docs', desc: 'Sign-in, Assistant, Goals, and approvals', to: '/docs' },
            { label: 'FAQ', desc: 'Answers about the launch product', to: '/faq' },
            { label: 'Security', desc: 'Authentication and GCP boundaries', to: '/security' },
          ],
        },
        {
          heading: 'Company',
          desc: 'About Orqaly',
          links: [
            { label: 'About', desc: 'Why we are building Orqaly', to: '/about' },
            { label: 'Contact', desc: 'Launch support information', to: '/contact' },
            { label: 'Status', desc: 'The launch service path', to: '/status' },
          ],
        },
      ],
    },
  ],
  signIn: { label: 'Log in', to: '/login' },
  cta: { label: 'Create account', to: '/signup' },
  skipToContent: 'Skip to content',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
};

export const HERO = {
  pill: { label: 'Personal accounts. Assistant. Durable Goals.', sectionId: 'how' },
  title: {
    bright: 'Give substantial work a',
    rotating: ['Clear Scope', 'Durable Goal', 'Review Point', 'Saved Result'],
    aria: 'Give substantial work a durable goal',
  },
  lead: 'Start in Assistant. When the work needs structure, turn it into a Goal, approve the scope and plan, and follow it to a saved result.',
  ctas: {
    primary: { label: 'Create account', to: '/signup' },
    secondary: { label: 'See how it works', to: '/how-it-works' },
  },
};

export const TEAM_DEMO = {
  heading: { bright: 'Start with a conversation,', dim: 'continue with a durable Goal.' },
  lead: 'Assistant handles the request. Goals keep the scope, plan, approvals, progress, artifacts, and final Markdown together.',
};

export const HOW_IT_WORKS = {
  eyebrow: 'How it works',
  heading: { bright: 'One request,', dim: 'with clear checkpoints.' },
  steps: [
    {
      num: '01',
      title: 'Ask',
      body: 'Describe the work in Assistant and refine the request in conversation.',
    },
    {
      num: '02',
      title: 'Start a Goal',
      body: 'Move substantial work into a durable Goal when it needs a tracked run.',
    },
    {
      num: '03',
      title: 'Approve scope',
      body: 'Review the exact objective, boundaries, deliverables, and assumptions before continuing.',
    },
    { num: '04', title: 'Approve plan', body: 'Review the planned tasks before execution begins.' },
    {
      num: '05',
      title: 'Keep the result',
      body: 'Return to the Goal for its status, artifacts, evidence, and downloadable Markdown.',
    },
  ],
};

export const PRODUCT_BENTO = {
  cards: [
    {
      id: 'assistant',
      title: 'Assistant for the first conversation',
      body: 'Ask a question, refine the request, receive a result, or start a Goal without leaving the conversation.',
      proof: 'Saved personal threads with explicit Goal handoff',
      mock: 'roomThread',
    },
    {
      id: 'goals',
      title: 'Durable Goals for substantial work',
      body: 'A Goal keeps its run state, scope, plan, approvals, artifacts, and final output together across visits.',
      proof: 'Server-backed workflow state on GCP',
      mock: 'workflowChain',
    },
    {
      id: 'approvals',
      title: 'Two decisions stay with you',
      body: 'The Goal waits for approval of the exact scope and then the exact plan before work continues.',
      proof: 'Scope approval, then plan approval',
      mock: 'boardVote',
    },
  ],
};

export const PROOF = {
  items: [
    {
      title: 'Personal sign-in',
      proof: 'Clerk protects the Assistant, Goals, and Settings routes',
    },
    {
      title: 'Durable progress',
      proof: 'Goal state is loaded from the GCP API rather than kept only in the browser',
    },
    { title: 'Explicit approvals', proof: 'Scope and plan each pause for a decision' },
    { title: 'Saved output', proof: 'Final Markdown can be viewed, copied, and downloaded' },
  ],
};

export const FEATURES = {
  heading: {
    bright: 'Everything needed for the launch flow.',
    dim: 'Nothing pretending to be more.',
  },
  cards: [
    {
      id: 'threads',
      title: 'Assistant conversations stay available.',
      body: 'Open recent threads and continue the conversation from your personal workspace.',
      proof: 'Active and archived thread state',
      mock: 'roomThread',
      span: 'sm',
    },
    {
      id: 'handoff',
      title: 'Substantial work can become a Goal.',
      body: 'Assistant makes the handoff explicit and links the resulting Goal back into the conversation.',
      proof: 'Assistant-to-Goal action and Goal link',
      mock: 'workflowChain',
      span: 'sm',
    },
    {
      id: 'scope',
      title: 'The scope is visible before you approve it.',
      body: 'Review the objective, deliverables, assumptions, boundaries, and acceptance criteria recorded for the Goal.',
      proof: 'Immutable scope artifact with a recorded identity',
      mock: 'knowledgeDiff',
      span: 'sm',
    },
    {
      id: 'plan',
      title: 'The plan is a separate decision.',
      body: 'After scope approval, inspect the planned tasks and approve the exact plan before execution.',
      proof: 'A second approval bound to the plan artifact',
      mock: 'workflowChain',
      span: 'wide',
    },
    {
      id: 'progress',
      title: 'A Goal remains a place you can return to.',
      body: 'See its current status, stages, attempts, approvals, and artifacts without reconstructing the work from chat.',
      proof: 'Durable run and stage records',
      mock: 'auditRows',
      span: 'wide',
    },
    {
      id: 'evidence',
      title: 'Evidence gaps are shown, not hidden.',
      body: 'The Goal can distinguish a complete result from one that still has explicit evidence gaps.',
      proof: 'Evidence readiness and gap states',
      mock: 'auditRows',
      span: 'sm',
    },
    {
      id: 'retry',
      title: 'A failed Assistant turn can start a new attempt.',
      body: 'When a failure is retryable, the interface offers one explicit retry instead of silently duplicating work.',
      proof: 'Retry lineage is recorded on the new turn',
      mock: 'firstRun',
      span: 'sm',
    },
    {
      id: 'markdown',
      title: 'The finished artifact is portable.',
      body: 'Read the final Markdown in the Goal, copy it, or download it as a file.',
      proof: 'Markdown artifact with stable identity',
      mock: 'knowledgeDiff',
      span: 'sm',
    },
  ],
};

export const JOBS = {
  heading: {
    bright: 'Use one flow for different kinds of work.',
    dim: 'The request changes. The checkpoints stay clear.',
  },
  jobs: [
    {
      id: 'research',
      label: 'Research brief',
      body: 'Ask for a structured brief, agree on what it must cover, and keep sources and evidence gaps with the Goal.',
      facts: [
        'Scope before execution',
        'Evidence status stays visible',
        'Final Markdown is downloadable',
      ],
      message: 'The brief is ready. Sources and open evidence gaps are attached.',
    },
    {
      id: 'comparison',
      label: 'Comparison',
      body: 'Define the options and decision criteria before the Goal produces a recommendation.',
      facts: [
        'Criteria recorded in scope',
        'Plan approved separately',
        'Recommendation kept with the run',
      ],
      message: 'The comparison is complete. The recommendation and limits are recorded.',
    },
    {
      id: 'analysis',
      label: 'Analysis',
      body: 'Turn a broad question into a bounded analysis with an explicit deliverable and acceptance criteria.',
      facts: [
        'Assumptions are visible',
        'Progress survives a refresh',
        'Result returns as Markdown',
      ],
      message: 'The analysis is complete. Assumptions remain visible beside it.',
    },
    {
      id: 'plan',
      label: 'Operational plan',
      body: 'Use Assistant to shape the request, then approve the scope and task plan inside a Goal.',
      facts: [
        'Two approval points',
        'Stages and attempts are inspectable',
        'Final output stays attached',
      ],
      message: 'The operational plan is ready with its approved scope and task history.',
    },
  ],
};

export const MANY = {
  heading: { bright: 'A durable Goal remembers the work.', dim: 'You do not have to.' },
  cards: [
    {
      id: 'state',
      title: 'The run has a durable state.',
      body: 'Leave the page and return without turning the Goal into a collection of browser-only progress indicators.',
      proof: 'State read back from the GCP API',
    },
    {
      id: 'stages',
      title: 'Stages and attempts remain inspectable.',
      body: 'The Goal shows which stage is active and keeps attempt history when execution needs another try.',
      proof: 'Stage status and attempt records',
      mock: 'supervisor',
    },
    {
      id: 'artifacts',
      title: 'Approvals point to exact artifacts.',
      body: 'The decision is tied to the scope or plan you reviewed, not to a label that can change later.',
      proof: 'Artifact identity and content hash',
    },
    {
      id: 'result',
      title: 'The result stays with its Goal.',
      body: 'The final Markdown and its artifact identity remain available from the run that produced them.',
      proof: 'View, copy, or download the final Markdown',
    },
  ],
};

export const STANDART_MODE = {
  heading: { bright: 'One workspace.', dim: 'Every retained module.' },
  body: 'Start in Assistant, move durable work into Goals, and keep agents, capabilities, knowledge, results, notifications, and activity connected around the same personal workspace.',
  note: 'Personal accounts remain the launch identity model.',
  facts: [
    'Home shows active work, approvals, and recent outcomes',
    'Assistant and Goals keep conversations and durable execution together',
    'The left menu keeps Structure, Intelligence, History, and account controls within reach',
  ],
  cta: { label: 'Open workspace', to: '/home' },
};

export const SUITE = {
  heading: { bright: 'The launch parts, plainly named.', dim: '' },
  cards: [
    {
      id: 'assistant',
      label: 'Assistant',
      body: 'The conversational starting point',
      proof: 'Saved personal threads',
      sectionId: 'platform',
    },
    {
      id: 'goal',
      label: 'Goal',
      body: 'A durable run for substantial work',
      proof: 'Persistent state on GCP',
      sectionId: 'many',
    },
    {
      id: 'scope',
      label: 'Scope',
      body: 'The exact work you approve',
      proof: 'Objective, boundaries, and deliverables',
      sectionId: 'features',
    },
    {
      id: 'plan',
      label: 'Plan',
      body: 'The tasks you approve next',
      proof: 'A separate approval checkpoint',
      sectionId: 'how',
    },
    {
      id: 'artifact',
      label: 'Result',
      body: 'Markdown kept with the Goal',
      proof: 'View, copy, and download',
      sectionId: 'work',
    },
  ],
};

export const SECURITY = {
  heading: { bright: 'A focused workspace', dim: 'with explicit boundaries.' },
  rows: [
    {
      id: 'auth',
      title: 'Protected routes require a Clerk session.',
      proof: 'Every authenticated workspace route sits behind the personal sign-in gate',
    },
    {
      id: 'api',
      title: 'The API verifies authentication again.',
      proof: 'The GCP service does not rely on the browser gate alone',
    },
    {
      id: 'personal',
      title: 'The launch account model is personal.',
      proof: 'No team or organization setup is part of this release',
    },
    {
      id: 'approval',
      title: 'Durable work waits at explicit checkpoints.',
      proof: 'Scope and plan approvals are recorded against exact artifacts',
    },
    {
      id: 'identity',
      title: 'Artifacts carry stable identities.',
      proof: 'The interface shows the artifact identifier and content hash',
    },
    {
      id: 'status',
      title: 'Incomplete evidence remains visible.',
      proof: 'The run can report evidence gaps instead of presenting them as complete',
    },
  ],
};

export const PRINCIPLES = {
  heading: { bright: 'At launch', dim: '' },
  items: [
    {
      id: 'focus',
      num: '01',
      title: 'Keep the product consolidated.',
      body: 'Agents, capabilities, knowledge, results, requests, and workflow views stay inside one retained workspace instead of returning as duplicate modules.',
    },
    {
      id: 'approval',
      num: '02',
      title: 'Keep decisions explicit.',
      body: 'Substantial work pauses for approval of its scope and plan before continuing.',
    },
    {
      id: 'record',
      num: '03',
      title: 'Keep the result with the run.',
      body: 'Progress, approvals, evidence, and final Markdown remain attached to the durable Goal.',
    },
  ],
};

export const MISSION = {
  eyebrow: 'Our mission',
  heading: { bright: 'Make agent work', dim: 'clear enough to approve.' },
  body: 'A conversation should be easy to start. Substantial work should also have a scope, a plan, checkpoints, and a durable result.',
  ctas: {
    primary: { label: 'Create account', to: '/signup' },
    secondary: { label: 'Read the docs', to: '/docs' },
  },
  links: [
    {
      label: 'Start in Assistant',
      desc: 'Shape the request in conversation',
      sectionId: 'platform',
    },
    { label: 'Continue in Goals', desc: 'Keep substantial work durable', sectionId: 'many' },
    { label: 'Approve scope and plan', desc: 'Two explicit checkpoints', sectionId: 'how' },
    { label: 'Keep the result', desc: 'Markdown and evidence stay attached', sectionId: 'work' },
  ],
};

export const PRICING = {
  heading: { bright: 'Launch access', dim: '' },
  lines: [
    {
      title: 'Commercial terms are not published yet.',
      body: 'Pricing will be stated before paid access begins.',
    },
    {
      title: 'No included credit is promised here.',
      body: 'Create a personal account to enter the focused launch workspace.',
    },
    {
      title: 'The launch product is intentionally consolidated.',
      body: 'Access covers the personal workspace, Assistant, durable Goals, Structure, Intelligence, History, notifications, activity, and Settings.',
    },
  ],
};

export const NEWS = {
  heading: { bright: 'Launch notes', dim: '' },
  allPostsLabel: 'All notes',
  readMore: 'See the related section',
};

export const FINAL_CTA = {
  heading: { bright: 'Start in Assistant.', dim: 'Move substantial work into a Goal.' },
  ctas: {
    primary: { label: 'Create account', to: '/signup' },
    secondary: { label: 'Log in', to: '/login' },
  },
  note: 'Personal accounts. One controlled agent workspace.',
};

export const FOOTER = {
  brand: 'Orqaly',
  blurb: 'Assistant for the conversation. Durable Goals for the work that must persist.',
  lanes: [
    {
      id: 'product',
      label: 'Product',
      links: [
        { label: 'Assistant', to: '/assistant' },
        { label: 'Goals', to: '/goals' },
        { label: 'Features', to: '/features' },
        { label: 'How it works', to: '/how-it-works' },
      ],
    },
    {
      id: 'account',
      label: 'Account',
      links: [
        { label: 'Create account', to: '/signup' },
        { label: 'Log in', to: '/login' },
        { label: 'Settings', to: '/settings' },
      ],
    },
    {
      id: 'resources',
      label: 'Resources',
      links: [
        { label: 'Docs', to: '/docs' },
        { label: 'FAQ', to: '/faq' },
        { label: 'Security', to: '/security' },
        { label: 'Status', to: '/status' },
      ],
    },
    {
      id: 'company',
      label: 'Company',
      links: [
        { label: 'About', to: '/about' },
        { label: 'Contact', to: '/contact' },
      ],
    },
    {
      id: 'launch',
      label: 'Launch',
      links: [
        { label: 'Launch access', to: '/pricing' },
        { label: 'Service status', to: '/status' },
      ],
    },
    {
      id: 'trust',
      label: 'Trust',
      links: [
        { label: 'Security', to: '/security' },
        { label: 'Privacy', to: '/privacy' },
      ],
    },
  ],
  legal: [
    { label: 'Privacy', to: '/privacy' },
    { label: 'Terms', to: '/terms' },
    { label: 'Cookies', to: '/cookies' },
    { label: 'Security', to: '/security' },
  ],
  copyright: 'Orqaly',
};

export const META = {
  title: 'Orqaly - Assistant and durable Goals',
  description:
    'Start in Assistant, move substantial work into a durable Goal, approve its scope and plan, and keep the resulting evidence and Markdown with the run.',
};
