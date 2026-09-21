/*
 * Scripted content for the "Watch it work" demo. Four scenes, one shape.
 *
 * Packs list FIRST DRAFTS in file types the desktop app can write today: text, tables,
 * web pages and vector layouts. No image or office files, and no step that hands work to an
 * outside service. watchItWork.scenes.test.js enforces both rules.
 *
 * `files` is the Workspace's Files card. For business, product and campaign it is the owner's
 * own list, named as the owner wrote it (2026-09-21); it may show PDF and image files, so the
 * pack rules above skip those three lists and the test pins their names word for word
 * instead. The review scene's files are ours and follow the pack rules like everything else.
 * `step` is the roadmap step (0-based) that writes the file, which is what fills the card in
 * while the plan runs.
 */

const PLAN_REPLY = "Here's my plan: 5 steps. I'll do them one at a time and show you each result.";
const ASK_LINE = 'Can I ask for a few details first?';

const CALLOUTS = {
  gate: 'It asks first',
  workspace: 'Workspace opens',
  plan: 'The plan',
  results: 'Your files',
};

export const ASSUMPTIONS_LINE =
  'Made with general assumptions. Answer 3 questions to fit it to you.';

// answers: one chosen option index per question, null where the visitor skipped it.
function withFittedLine(scene) {
  return {
    ...scene,
    fittedTo: (answers) =>
      `fitted to: ${scene.questions
        .map((question, index) => question.options[answers[index]])
        .filter(Boolean)
        .join(' · ')}`,
  };
}

export const SCENES = [
  {
    id: 'business',
    label: 'Start a business',
    chatTitle: 'New business',
    request: 'I want to open a small coffee roastery next spring. What do I need to do first?',
    planReply: PLAN_REPLY,
    askLine: ASK_LINE,
    steps: [
      'Understand your idea',
      'Check the market',
      'Costs and paperwork',
      'Marketing materials',
      'Accounts to open',
    ],
    questions: [
      { label: 'Where will you register?', options: ['Latvia', 'Estonia', 'Germany', 'Other'] },
      {
        label: 'How much to start?',
        options: ['Under €10k', '€10–50k', 'Over €50k', 'Not sure'],
      },
      { label: 'How will you sell?', options: ['Online', 'Own shop', 'To cafés'] },
    ],
    pack: {
      title: 'First steps in a new business · first drafts',
      columns: [
        {
          title: 'DOCS',
          items: [
            'documents-checklist.md',
            'business-plan.md',
            'marketing-plan.md',
            'marketing-projections.csv',
            'budget.csv',
            'forecast-6-12-18-24.csv',
            'guide-links-templates.md',
          ],
        },
        {
          title: 'MATERIALS',
          items: [
            'Banner layouts (HTML/SVG)',
            '8 landing-page drafts (HTML)',
            'Presentation outline',
            'Investor pitch outline',
            'Partner pitch outline',
          ],
        },
        { title: 'ACCOUNTS', items: ['Accounts to open', 'Sign-up checklist'] },
      ],
    },
    files: [
      { name: 'Business Plan', type: 'document', folder: 'plan', step: 2 },
      { name: 'Marketing Strategy for EU', type: 'document', folder: 'market', step: 3 },
      { name: 'Company Landing Page', type: 'web', folder: 'site', step: 3 },
      { name: 'List of AI Agents to Support', type: 'spreadsheet', folder: 'team', step: 4 },
    ],
    callouts: CALLOUTS,
  },
  {
    id: 'product',
    label: 'Launch a product',
    chatTitle: 'Product launch',
    request: 'I make handmade candles and want to launch a gift set this autumn. Where do I start?',
    planReply: PLAN_REPLY,
    askLine: ASK_LINE,
    steps: [
      'Understand your product',
      'Study the buyers',
      'Pricing and costs',
      'Launch materials',
      'Launch checklist',
    ],
    questions: [
      {
        label: 'Who is it for?',
        options: ['Gift buyers', 'Regular customers', 'Other shops', 'Not sure'],
      },
      {
        label: 'Where will you sell it?',
        options: ['Own website', 'A marketplace', 'Local shops', 'Markets'],
      },
      { label: 'What price range?', options: ['Budget', 'Mid-range', 'Premium'] },
    ],
    pack: {
      title: 'Launching a new product · first drafts',
      columns: [
        {
          title: 'DOCS',
          items: [
            'launch-plan.md',
            'product-brief.md',
            'pricing.csv',
            'launch-budget.csv',
            'customer-questions.md',
            'guide-links-templates.md',
          ],
        },
        {
          title: 'MATERIALS',
          items: [
            'Product page drafts (HTML)',
            'Banner layouts (HTML/SVG)',
            'Launch announcement draft',
            'Retailer pitch outline',
            'Presentation outline',
          ],
        },
        { title: 'CHECKLISTS', items: ['Launch-day checklist', 'Supplier checklist'] },
      ],
    },
    files: [
      { name: 'Research & Examples', type: 'document', folder: 'research', step: 1 },
      { name: 'Prototype Image', type: 'image', folder: 'design', step: 3 },
      { name: 'Roadmap', type: 'pdf', folder: 'plan', step: 4 },
    ],
    callouts: CALLOUTS,
  },
  {
    id: 'campaign',
    label: 'Plan a campaign',
    chatTitle: 'Campaign plan',
    request:
      'I run a small yoga studio and want more people in our spring classes. Can you plan a campaign?',
    planReply: PLAN_REPLY,
    askLine: ASK_LINE,
    steps: [
      'Understand your offer',
      'Know your audience',
      'Message and channels',
      'Campaign materials',
      'Calendar and budget',
    ],
    questions: [
      {
        label: 'Who do you want to reach?',
        options: ['New customers', 'Past customers', 'Local people', 'Not sure'],
      },
      {
        label: 'Which channel matters most?',
        options: ['Social media', 'Search ads', 'Local flyers', 'Not sure'],
      },
      { label: 'How big is the budget?', options: ['Small', 'Medium', 'Large'] },
    ],
    pack: {
      title: 'Planning a campaign · first drafts',
      columns: [
        {
          title: 'DOCS',
          items: [
            'campaign-plan.md',
            'audience-notes.md',
            'message-guide.md',
            'campaign-calendar.csv',
            'campaign-budget.csv',
          ],
        },
        {
          title: 'MATERIALS',
          items: [
            'Landing-page drafts (HTML)',
            'Banner layouts (HTML/SVG)',
            'Flyer layout (HTML)',
            'Ad copy draft',
            'Caption ideas draft',
          ],
        },
        { title: 'CHECKLISTS', items: ['Campaign start checklist', 'Weekly review checklist'] },
      ],
    },
    files: [
      { name: 'SMM Roadmap', type: 'pdf', folder: 'plan', step: 2 },
      { name: 'Social Media Account Access', type: 'document', folder: 'access', step: 3 },
      { name: 'SMM Post Texts', type: 'document', folder: 'posts', step: 3 },
    ],
    callouts: CALLOUTS,
  },
  {
    id: 'review',
    label: 'Review my company',
    chatTitle: 'Company review',
    request:
      'I run a small design studio. Can you review my company and tell me what to fix first?',
    planReply: PLAN_REPLY,
    askLine: ASK_LINE,
    steps: [
      'Understand your company',
      'Review the finances',
      'Sales and marketing',
      'Team and tools',
      'Priorities to fix',
    ],
    questions: [
      {
        label: 'What should I check most?',
        options: ['Money', 'Sales', 'Team', 'Everything'],
      },
      { label: 'How big is the team?', options: ['Just me', 'Small team', 'Growing team'] },
      {
        label: 'What can you share?',
        options: ['Accounts export', 'Website link', 'Nothing yet'],
      },
    ],
    pack: {
      title: 'Reviewing your company · first drafts',
      columns: [
        {
          title: 'DOCS',
          items: [
            'company-audit-report.md',
            'finance-health-check.csv',
            'sales-and-marketing-review.md',
            'team-and-tools-review.md',
            'action-plan.md',
          ],
        },
        { title: 'MATERIALS', items: ['Owner briefing draft', 'Summary slides outline'] },
        { title: 'CHECKLISTS', items: ['Fix-first checklist', 'Monthly review checklist'] },
      ],
    },
    files: [
      { name: 'Finance Health Check', type: 'spreadsheet', folder: 'finance', step: 1 },
      { name: 'Sales & Marketing Review', type: 'document', folder: 'review', step: 2 },
      { name: 'Company Audit Report', type: 'document', folder: 'review', step: 4 },
      { name: 'Action Plan', type: 'document', folder: 'plan', step: 4 },
    ],
    callouts: CALLOUTS,
  },
].map(withFittedLine);
