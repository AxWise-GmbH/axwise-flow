/**
 * [module: frontend]
 *
 * The four scenarios the "watch a team build it" demo types out, and the three
 * places the finished work lands.
 *
 * SHARED BY TWO PAGES ON PURPOSE. `/` draws them in
 * `pages/Landing/sections/HeroAnimatedDemo.jsx` on the site's green theme, and
 * `/standart` draws the same run in `pages/Standart/mocks/MockTeamBuild.jsx` in
 * mono. Two copies of this table would drift the moment either page gained a
 * fifth scenario, and the drift would be invisible - both pages would still
 * look finished.
 *
 * WHY `destinationsPlain` EXISTS BESIDE `destinations`.
 * The green version names the payment rails the finished product would use
 * (Stripe, Apple Pay). `/standart` may not: `standartCopy.safety.test.js` bans
 * the word on that page because `lib/integrations/stripe-connect.js` is gated on
 * an env var it does not have and CLAUDE.md marks Payments "(planned)" - a
 * marketing page must not name a rail no money has moved through. So the plain
 * set says what is actually true of a shipped result: orders can be taken.
 *
 * The two arrays are positional and must stay the same length as
 * `DESTINATION_SLOTS`; `agentDemoCases.test.js` checks both, and checks that no
 * payment vendor survives into the plain set.
 */

/**
 * The three fixed slots every scenario ships into. The title is the slot; the
 * per-case string underneath it is what that scenario put there.
 *
 * `iconName`/`fallbackName` are MUI outlined icon names, resolved by the caller
 * - this module stays data-only so it can be read as prose and so
 * react-refresh does not see a module exporting both data and components.
 */
export const DESTINATION_SLOTS = [
  { id: 'domain', title: 'Live on your domain', iconName: 'PublicOutlined' },
  { id: 'channels', title: 'On your channels', iconName: 'CampaignOutlined' },
  { id: 'money', title: 'Taking real payments', iconName: 'PaymentsOutlined' },
];

/** The same three slots, named without a payment rail. See the docblock. */
export const DESTINATION_SLOTS_PLAIN = [
  { id: 'domain', title: 'Live on your domain' },
  { id: 'channels', title: 'On your channels' },
  { id: 'money', title: 'Taking real orders' },
];

/** The prompt the demo opens on, exported so a test can assert the first frame. */
export const HERO_DEMO_FIRST_PROMPT = 'I want to build a landing page for my SaaS';

/**
 * @typedef {object} DemoCase
 * @property {string} prompt          what the reader appears to type
 * @property {string|null} tint       an accent for the green page; ignored in mono
 * @property {{label: string, done: string}[]} steps
 * @property {{label: string, iconName: string}[]} badges  the three result cards
 * @property {string[]} destinations       three strings, one per DESTINATION_SLOTS
 * @property {string[]} destinationsPlain  the same three, naming no payment rail
 */

/** @type {DemoCase[]} */
export const CASES = [
  {
    prompt: HERO_DEMO_FIRST_PROMPT,
    tint: null,
    steps: [
      { label: 'Choosing tool · Framer…', done: 'Tool: Framer' },
      { label: 'Wireframing layout…', done: 'Layout wireframed' },
      { label: 'Writing hero copy…', done: 'Copy written' },
      { label: 'Deploying to the web…', done: 'Page live' },
    ],
    badges: [
      { label: 'Hero designed', iconName: 'BrushOutlined' },
      { label: 'Copy written', iconName: 'ArticleOutlined' },
      { label: 'Page live', iconName: 'PublicOutlined' },
    ],
    destinations: ['acmehq.io/launch', 'LinkedIn · X · ProductHunt', 'Stripe checkout live'],
    destinationsPlain: ['acmehq.io/launch', 'LinkedIn · X · ProductHunt', 'Checkout live'],
  },
  {
    prompt: 'I want an iOS app to rent saunas nearby',
    tint: '#f59e0b',
    steps: [
      { label: 'Choosing tool · Xcode + Figma…', done: 'Tool: Xcode + Figma' },
      { label: 'Uploading brand assets…', done: 'Brand assets loaded' },
      { label: 'Designing screens…', done: 'Screens designed' },
      { label: 'Wiring booking & payments…', done: 'Booking flow live' },
      { label: 'Building TestFlight bundle…', done: 'TestFlight ready' },
    ],
    badges: [
      { label: 'Screens designed', iconName: 'PhoneIphoneOutlined' },
      { label: 'Booking flow live', iconName: 'EventAvailableOutlined' },
      { label: 'TestFlight ready', iconName: 'CloudUploadOutlined' },
    ],
    destinations: ['saunas.app', 'Instagram · TikTok · Maps', 'Apple Pay · Stripe'],
    destinationsPlain: ['saunas.app', 'Instagram · TikTok · Maps', 'Bookings taking money'],
  },
  {
    prompt: 'I want a 30-second product video',
    tint: '#d946ef',
    steps: [
      { label: 'Choosing tool · Runway…', done: 'Tool: Runway' },
      { label: 'Uploading footage & refs…', done: 'Materials uploaded' },
      { label: 'Writing the script…', done: 'Script ready' },
      { label: 'Storyboarding scenes…', done: 'Storyboard set' },
      { label: 'Rendering the cut…', done: 'Video rendered' },
    ],
    badges: [
      { label: 'Script ready', iconName: 'SubtitlesOutlined' },
      { label: 'Storyboard set', iconName: 'MovieOutlined' },
      { label: 'Video rendered', iconName: 'PlayCircleOutlined' },
    ],
    destinations: ['acme.video/promo', 'YouTube · TikTok · Reels', 'Tracked affiliate links'],
    destinationsPlain: ['acme.video/promo', 'YouTube · TikTok · Reels', 'Tracked affiliate links'],
  },
  {
    prompt: 'I want a pitch deck for investors',
    tint: '#6366f1',
    steps: [
      { label: 'Choosing tool · Slides…', done: 'Tool: Slides' },
      { label: 'Uploading research notes…', done: 'Research uploaded' },
      { label: 'Building the narrative…', done: 'Story arc set' },
      { label: 'Designing the slides…', done: 'Slides designed' },
    ],
    badges: [
      { label: 'Story arc set', iconName: 'AutoStoriesOutlined' },
      { label: 'Slides designed', iconName: 'SlideshowOutlined' },
      { label: 'Talking points', iconName: 'RecordVoiceOverOutlined' },
    ],
    destinations: ['pitch.acmehq.com', 'Sent to investor inboxes', 'Pre-commit form live'],
    destinationsPlain: ['pitch.acmehq.com', 'Sent to investor inboxes', 'Pre-commit form live'],
  },
];
