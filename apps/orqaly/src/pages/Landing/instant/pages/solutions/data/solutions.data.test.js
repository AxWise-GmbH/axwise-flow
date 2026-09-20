import { describe, expect, it } from 'vitest';
import { SOLUTION_SLUGS } from '../solutionsMenu';
import { loadSolution } from './index';

// Every data file that exists is checked, so a page written later is held to the same contract.
const modules = import.meta.glob(['./*.js', '!./index.js', '!./*.test.js'], { eager: true });
const pages = Object.entries(modules).map(([file, module]) => [file, module.default]);

const ICONS = [
  'voice',
  'message',
  'mail',
  'document',
  'calendar',
  'chart',
  'search',
  'cart',
  'truck',
  'users',
  'clock',
  'spark',
  'plug',
  'folder',
  'check',
  'globe',
  'pen',
  'money',
  'box',
  'tool',
  'home',
  'book',
  'scale',
  'camera',
];
const BANNED =
  /\b(planned|beta|soon|coming|shield|soc ?2|verified|production|guaranteed?|slack|telegram|orqaly|axwise)\b|zero hallucination|\d\s*(x|times)\s+faster|\d\s*%/i;

function words(text) {
  return text.trim().split(/\s+/).length;
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function within(value, low, high) {
  return typeof value === 'number' && value >= low && value <= high;
}

function unique(list) {
  return new Set(list).size === list.length;
}

const SCENE_RULES = {
  chat: (scene) =>
    scene.messages.length >= 3 &&
    scene.messages.length <= 4 &&
    scene.messages.every((item) => ['you', 'app'].includes(item.from) && isText(item.text)),
  call: (scene) =>
    isText(scene.caller) &&
    isText(scene.outcome) &&
    scene.lines.length >= 3 &&
    scene.lines.length <= 4 &&
    scene.lines.every((item) => ['caller', 'app'].includes(item.from) && isText(item.text)),
  doc: (scene) =>
    isText(scene.file) &&
    isText(scene.note) &&
    scene.lines.length >= 4 &&
    scene.lines.length <= 6 &&
    scene.lines.every(isText),
  table: (scene) =>
    isText(scene.file) &&
    scene.columns.length >= 3 &&
    scene.columns.length <= 4 &&
    scene.rows.length >= 3 &&
    scene.rows.length <= 4 &&
    scene.rows.every((row) => row.length === scene.columns.length && row.every(isText)),
  board: (scene) =>
    scene.lanes.length === 3 &&
    scene.lanes.every(
      (lane) =>
        isText(lane.title) &&
        lane.cards.length >= 1 &&
        lane.cards.length <= 3 &&
        lane.cards.every(isText)
    ),
  timeline: (scene) =>
    scene.steps.length >= 4 &&
    scene.steps.length <= 5 &&
    scene.steps.every((item) => isText(item.label) && ['done', 'now', 'next'].includes(item.state)),
  // The calendar shows 09 to 17, so every block has to sit inside those eight hours.
  calendar: (scene) =>
    scene.days.length === 5 &&
    scene.days.every(isText) &&
    unique(scene.slots.map((slot) => slot.label)) &&
    within(scene.slots.length, 5, 8) &&
    scene.slots.some((slot) => slot.state === 'held') &&
    scene.slots.every(
      (slot) =>
        isText(slot.label) &&
        ['booked', 'held', 'free'].includes(slot.state) &&
        within(slot.day, 0, 4) &&
        isCount(slot.start) &&
        isCount(slot.len) &&
        slot.start >= 9 &&
        slot.start + slot.len <= 17
    ) &&
    (scene.note === undefined || isText(scene.note)),
  map: (scene) =>
    within(scene.pins.length, 3, 5) &&
    unique(scene.pins.map((pin) => pin.label)) &&
    scene.pins.every(
      (pin) =>
        isText(pin.label) &&
        ['done', 'now', 'next'].includes(pin.state) &&
        within(pin.x, 5, 95) &&
        within(pin.y, 10, 90)
    ) &&
    (scene.note === undefined || isText(scene.note)),
  chart: (scene) =>
    isText(scene.title) &&
    within(scene.series.length, 6, 8) &&
    scene.series.every(isCount) &&
    (scene.bars === undefined ||
      (scene.bars.length === scene.series.length && scene.bars.every(isCount))) &&
    scene.xLabels.length === scene.series.length &&
    scene.xLabels.every(isText) &&
    unique(scene.xLabels) &&
    within(scene.callout.at, 0, scene.series.length - 1) &&
    isText(scene.callout.text),
  inbox: (scene) =>
    within(scene.threads.length, 3, 4) &&
    unique(scene.threads.map((thread) => thread.subject)) &&
    scene.threads.filter((thread) => thread.state === 'draft').length === 1 &&
    scene.threads.every(
      (thread) =>
        isText(thread.from) &&
        isText(thread.subject) &&
        isText(thread.tag) &&
        ['replied', 'draft', 'waiting'].includes(thread.state)
    ) &&
    isText(scene.draft.to) &&
    within(scene.draft.lines.length, 2, 3) &&
    scene.draft.lines.every(isText),
  graph: (scene) =>
    within(scene.nodes.length, 5, 7) &&
    unique(scene.nodes.map((node) => node.label)) &&
    scene.nodes.filter((node) => node.role === 'core').length === 1 &&
    scene.nodes.every(
      (node) =>
        isText(node.label) &&
        ['core', 'node'].includes(node.role) &&
        within(node.x, 5, 95) &&
        within(node.y, 5, 95)
    ) &&
    scene.links.length >= scene.nodes.length - 1 &&
    scene.links.every(
      (link) => link.length === 2 && link[0] !== link[1] && link.every((end) => scene.nodes[end])
    ) &&
    scene.highlight.length >= 2 &&
    // The lit path has to run along links that exist.
    scene.highlight.every(
      (end, index) =>
        index === 0 ||
        scene.links.some((link) => link.includes(end) && link.includes(scene.highlight[index - 1]))
    ),
  tiles: (scene) =>
    isText(scene.title) &&
    within(scene.cells.length, 8, 12) &&
    unique(scene.cells.map((cell) => cell.label)) &&
    scene.cells.every(
      (cell) =>
        isText(cell.label) &&
        ['ok', 'now', 'alert'].includes(cell.state) &&
        (cell.meta === undefined || isText(cell.meta))
    ) &&
    scene.legend.length === 3 &&
    scene.legend.every(isText),
  paper: (scene) =>
    isText(scene.heading) &&
    isText(scene.stamp) &&
    (scene.to === undefined || isText(scene.to)) &&
    within(scene.rows.length, 3, 5) &&
    unique(scene.rows.map((row) => row[0])) &&
    scene.rows.every((row) => row.length === 2 && row.every(isText)) &&
    (scene.total === undefined || (scene.total.length === 2 && scene.total.every(isText))),
  clips: (scene) =>
    isText(scene.source) &&
    within(scene.cuts.length, 3, 5) &&
    unique(scene.cuts.map((cut) => cut.label)) &&
    scene.cuts.every(
      (cut, index) =>
        isText(cut.label) &&
        cut.start >= 0 &&
        cut.len >= 8 &&
        cut.start + cut.len <= 96 &&
        // Cuts run left to right and never overlap.
        (index === 0 || cut.start >= scene.cuts[index - 1].start + scene.cuts[index - 1].len)
    ) &&
    within(scene.outputs.length, 2, 4) &&
    scene.outputs.every(isText),
  phone: (scene) =>
    isText(scene.title) &&
    within(scene.messages.length, 2, 3) &&
    scene.messages.every((item) => ['app', 'them'].includes(item.from) && isText(item.text)) &&
    within(scene.actions.length, 1, 2) &&
    scene.actions.every(isText),
};

const OLD_KINDS = ['chat', 'call', 'doc', 'table', 'board', 'timeline'];
const isNewKind = (kind) => kind in SCENE_RULES && !OLD_KINDS.includes(kind);
const kindsOf = (page) => page.spotlights.map((spotlight) => spotlight.scene.kind);

describe('solutions data', () => {
  it('has one file for every slug in the menu', () => {
    expect(pages.map(([file]) => file.slice(2, -3)).sort()).toEqual([...SOLUTION_SLUGS].sort());
  });

  it('loads a page by slug and answers null for an unknown one', async () => {
    await expect(loadSolution('healthcare')).resolves.toMatchObject({ slug: 'healthcare' });
    await expect(loadSolution('index')).resolves.toBeNull();
    await expect(loadSolution('nowhere')).resolves.toBeNull();
  });

  it('gives the ten opening windows at least seven different pictures, never two alike in a row', () => {
    const bySlug = Object.fromEntries(pages.map(([, page]) => [page.slug, page]));
    const openings = SOLUTION_SLUGS.map((slug) => bySlug[slug].spotlights[2].scene.kind);
    expect(new Set(openings).size).toBeGreaterThanOrEqual(7);
    openings.forEach((kind, index) => {
      if (index > 0) expect(kind, SOLUTION_SLUGS[index]).not.toBe(openings[index - 1]);
    });
  });

  it('never gives two pages the same set of pictures', () => {
    const sets = pages.map(([, page]) => [...kindsOf(page)].sort().join(','));
    expect(new Set(sets).size).toBe(sets.length);
  });

  describe.each(pages)('%s', (file, page) => {
    it('is named after its slug', () => {
      expect(SOLUTION_SLUGS).toContain(page.slug);
      expect(file).toBe(`./${page.slug}.js`);
    });

    it('keeps the opening short', () => {
      expect(words(page.eyebrow)).toBeLessThanOrEqual(3);
      expect(words(page.title)).toBeLessThanOrEqual(8);
      expect(words(page.subtitle)).toBeLessThanOrEqual(28);
      expect(isText(page.agentsTitle)).toBe(true);
      expect(isText(page.closing)).toBe(true);
    });

    it('has four pillars within their limits', () => {
      expect(page.pillars).toHaveLength(4);
      expect(new Set(page.pillars.map((pillar) => pillar.id)).size).toBe(4);
      for (const pillar of page.pillars) {
        expect(ICONS).toContain(pillar.icon);
        expect(words(pillar.title)).toBeLessThanOrEqual(4);
        expect(words(pillar.body)).toBeLessThanOrEqual(16);
        expect(words(pillar.stat)).toBeLessThanOrEqual(3);
        expect(pillar.stat).not.toMatch(/\d/);
      }
    });

    it('has four spotlights within their limits, with a valid scene each', () => {
      expect(page.spotlights).toHaveLength(4);
      expect(new Set(page.spotlights.map((spotlight) => spotlight.id)).size).toBe(4);
      for (const spotlight of page.spotlights) {
        expect(words(spotlight.eyebrow)).toBe(1);
        expect(words(spotlight.title)).toBeLessThanOrEqual(8);
        expect(words(spotlight.body)).toBeLessThanOrEqual(34);
        expect(spotlight.bullets).toHaveLength(4);
        for (const bullet of spotlight.bullets) expect(words(bullet)).toBeLessThanOrEqual(6);
        const rule = SCENE_RULES[spotlight.scene.kind];
        expect(rule, `unknown scene kind "${spotlight.scene.kind}"`).toBeTypeOf('function');
        expect(rule(spotlight.scene), `${spotlight.id}: ${spotlight.scene.kind} scene`).toBe(true);
      }
      const kinds = new Set(kindsOf(page));
      expect(kinds.size).toBeGreaterThanOrEqual(3);
      // Mostly illustrations: three or more of the new kinds, one text panel at most.
      expect([...kinds].filter(isNewKind).length).toBeGreaterThanOrEqual(3);
      expect(kindsOf(page).filter((kind) => OLD_KINDS.includes(kind)).length).toBeLessThanOrEqual(
        1
      );
      expect(isNewKind(page.spotlights[2].scene.kind), 'the opening window').toBe(true);
    });

    it('has six agents within their limits', () => {
      expect(page.agents).toHaveLength(6);
      expect(new Set(page.agents.map((agent) => agent.name)).size).toBe(6);
      for (const agent of page.agents) {
        expect(words(agent.name)).toBeLessThanOrEqual(3);
        expect(words(agent.line)).toBeLessThanOrEqual(9);
      }
    });

    it('points at three other pages', () => {
      expect(page.related).toHaveLength(3);
      expect(new Set(page.related).size).toBe(3);
      for (const slug of page.related) {
        expect(SOLUTION_SLUGS).toContain(slug);
        expect(slug).not.toBe(page.slug);
      }
    });

    it('promises nothing it should not', () => {
      for (const text of strings(page)) expect(text).not.toMatch(BANNED);
    });
  });
});
