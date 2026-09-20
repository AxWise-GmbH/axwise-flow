/*
 * Scripted content for the "Watch it work" demo. Three scenes, one shape.
 *
 * Packs list FIRST DRAFTS in file types the desktop app can write today: text, tables,
 * web pages and vector layouts. No image or office files, and no step that hands work to an
 * outside service. watchItWork.scenes.test.js enforces both rules.
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
    callouts: CALLOUTS,
  },
].map(withFittedLine);
