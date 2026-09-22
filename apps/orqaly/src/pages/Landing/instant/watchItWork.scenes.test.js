import { describe, expect, it } from 'vitest';
import { ASSUMPTIONS_LINE, SCENES } from './watchItWork.scenes';
import { FILE_TYPES } from './WorkspaceFiles';

// File types the app cannot write, and verbs that would claim it reaches outside the Mac.
const NOT_TODAY =
  /\.(png|jpe?g|gif|pptx?|pdf|docx?|key)\b|publish|post(s|ed|ing)?\b|send(s|ing)?\b|email|Slack|Telegram/i;

// The page-level guard only sees the first frame of the first scene; these words are banned
// from every scene.
const OVERCLAIM = /\bverified\b|\bproduction\b|sources checked/i;

// What a pack item may be: a text, table, web or vector file, or a named first draft.
const DRAFT_ITEM = /\.(md|csv|html|svg)$|\((HTML|HTML\/SVG)\)$|\b(outline|draft|checklist)$/;

function stringsIn(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

const packItems = (scene) => scene.pack.columns.flatMap((column) => column.items);

// The Workspace's Files card. The first three lists are the owner's own (2026-09-21), PDFs
// and an image included, so the draft-type rules below skip them and this pins them word for
// word instead. The review list is ours: pinned here too, but it gets no exemption.
const OWNER_FILES = {
  business: [
    ['Business Plan', 'document'],
    ['Marketing Strategy for EU', 'document'],
    ['Company Landing Page', 'web'],
    ['List of AI Agents to Support', 'spreadsheet'],
  ],
  product: [
    ['Research & Examples', 'document'],
    ['Prototype Image', 'image'],
    ['Roadmap', 'pdf'],
  ],
  campaign: [
    ['SMM Roadmap', 'pdf'],
    ['Social Media Account Access', 'document'],
    ['SMM Post Texts', 'document'],
  ],
  review: [
    ['Finance Health Check', 'spreadsheet'],
    ['Sales & Marketing Review', 'document'],
    ['Company Audit Report', 'document'],
    ['Action Plan', 'document'],
  ],
};

const OWNER_LISTS = ['business', 'product', 'campaign'];
const withoutOwnerFiles = (scene) =>
  OWNER_LISTS.includes(scene.id) ? { ...scene, files: [] } : scene;

describe('watchItWork scenes', () => {
  it('offers exactly four scenes with unique ids and the agreed labels', () => {
    expect(SCENES.map((scene) => scene.id)).toEqual(['business', 'product', 'campaign', 'review']);
    expect(SCENES.map((scene) => scene.label)).toEqual([
      'Start a business',
      'Launch a product',
      'Plan a campaign',
      'Review my company',
    ]);
    expect(new Set(SCENES.map((scene) => scene.chatTitle)).size).toBe(4);
  });

  it('gives every scene the same shape', () => {
    const shape = Object.keys(SCENES[0]).sort();
    expect(shape).toEqual(
      [
        'askLine',
        'callouts',
        'chatTitle',
        'files',
        'fittedTo',
        'id',
        'label',
        'pack',
        'planReply',
        'questions',
        'request',
        'steps',
      ].sort()
    );
    for (const scene of SCENES) {
      expect(Object.keys(scene).sort()).toEqual(shape);
      expect(Object.keys(scene.callouts).sort()).toEqual(['gate', 'plan', 'results', 'workspace']);
      expect(scene.request.match(/[.?]/g).length).toBeLessThanOrEqual(2);
    }
  });

  it('plans five short steps and asks three questions with three or four options each', () => {
    for (const scene of SCENES) {
      expect(scene.steps).toHaveLength(5);
      expect(new Set(scene.steps).size).toBe(5);
      for (const step of scene.steps) {
        const words = step.split(/\s+/).length;
        expect(words).toBeGreaterThanOrEqual(2);
        expect(words).toBeLessThanOrEqual(4);
      }

      expect(scene.questions).toHaveLength(3);
      expect(new Set(scene.questions.map((question) => question.label)).size).toBe(3);
      for (const question of scene.questions) {
        expect(question.label).toMatch(/\?$/);
        expect(question.options.length).toBeGreaterThanOrEqual(3);
        expect(question.options.length).toBeLessThanOrEqual(4);
        expect(new Set(question.options).size).toBe(question.options.length);
      }
    }
  });

  it('packs first drafts into two or three columns of at most seven items', () => {
    for (const scene of SCENES) {
      expect(scene.pack.title).toMatch(/ · first drafts$/);
      expect(scene.pack.columns.length).toBeGreaterThanOrEqual(2);
      expect(scene.pack.columns.length).toBeLessThanOrEqual(3);
      expect(new Set(scene.pack.columns.map((column) => column.title)).size).toBe(
        scene.pack.columns.length
      );
      for (const column of scene.pack.columns) {
        expect(column.items.length).toBeGreaterThanOrEqual(1);
        expect(column.items.length).toBeLessThanOrEqual(7);
      }
      expect(new Set(packItems(scene)).size).toBe(packItems(scene).length);
    }
  });

  it("lists the owner's files in the Workspace, each written by one roadmap step", () => {
    for (const scene of SCENES) {
      expect(scene.files.map((file) => [file.name, file.type])).toEqual(OWNER_FILES[scene.id]);
      expect(scene.files.length).toBeGreaterThanOrEqual(3);
      expect(scene.files.length).toBeLessThanOrEqual(4);
      for (const file of scene.files) {
        expect(Object.keys(file).sort()).toEqual(['folder', 'name', 'step', 'type']);
        expect(FILE_TYPES).toContain(file.type);
        expect(file.folder).toMatch(/^[a-z]+$/);
        expect(Number.isInteger(file.step)).toBe(true);
        expect(file.step).toBeGreaterThanOrEqual(0);
        expect(file.step).toBeLessThan(scene.steps.length);
        expect(file.name).not.toMatch(OVERCLAIM);
      }
      // Listed in the order the run writes them.
      const steps = scene.files.map((file) => file.step);
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
    }
  });

  it('never lists a file the app cannot write or a step that leaves the Mac', () => {
    for (const scene of SCENES) {
      for (const text of stringsIn(withoutOwnerFiles(scene))) {
        expect(text).not.toMatch(NOT_TODAY);
        expect(text).not.toMatch(OVERCLAIM);
      }
    }
    expect(ASSUMPTIONS_LINE).not.toMatch(NOT_TODAY);
  });

  it('keeps the owner-approved first scene word for word', () => {
    const [business] = SCENES;
    expect(business).toMatchObject({
      chatTitle: 'New business',
      request: 'I want to open a small coffee roastery next spring. What do I need to do first?',
      planReply: "Here's my plan: 5 steps. I'll do them one at a time and show you each result.",
      askLine: 'Can I ask for a few details first?',
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
      callouts: {
        gate: 'It asks first',
        workspace: 'Workspace opens',
        plan: 'The plan',
        results: 'Your files',
      },
    });
    expect(business.pack).toEqual({
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
    });
  });

  it('writes the other scenes as drafts only, without numbers or results promised', () => {
    for (const scene of SCENES.slice(1)) {
      for (const item of packItems(scene)) expect(item).toMatch(DRAFT_ITEM);
      const written = stringsIn({ ...scene, planReply: '' });
      for (const text of written) expect(text).not.toMatch(/\d|%|guarantee|faster|\bmore sales\b/i);
    }
  });

  it('says what the answers changed, from the chosen options only', () => {
    const [business, product] = SCENES;
    expect(business.fittedTo([0, 1, 0])).toBe('fitted to: Latvia · €10–50k · Online');
    expect(business.fittedTo([null, 3, null])).toBe('fitted to: Not sure');
    expect(product.fittedTo([0, 0, 2])).toBe('fitted to: Gift buyers · Own website · Premium');
    expect(ASSUMPTIONS_LINE).toBe(
      'Made with general assumptions. Answer 3 questions to fit it to you.'
    );
  });
});
