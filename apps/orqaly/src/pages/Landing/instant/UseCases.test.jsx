import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UseCases from './UseCases';

// [slug, pill, title, line, request] in the Solutions menu's order.
const CASES = [
  [
    'healthcare',
    'HEALTHCARE',
    'Front desk work that never piles up.',
    'After-hours calls, reminders, coverage checks and intake summaries, ready for staff to review.',
    "Draft the reminders for tomorrow's appointments.",
  ],
  [
    'real-estate',
    'REAL ESTATE',
    'Leads answered while you are at viewings.',
    'Listing replies, viewings in your calendar, follow-ups and offer drafts.',
    "Reply to today's listing questions and book the viewings.",
  ],
  [
    'ecommerce',
    'E-COMMERCE',
    'Your store keeps moving while you sleep.',
    'Order updates, supplier threads, customer questions and the returns queue.',
    "Sort today's returns and draft the replies.",
  ],
  [
    'restaurants',
    'HOTELS & RESTAURANTS',
    'Guest requests sorted before anyone chases.',
    'Housekeeping, room service, extras and table bookings, sent to the right person.',
    "Route this morning's guest requests.",
  ],
  [
    'education',
    'EDUCATION',
    'Admin hours given back to teaching.',
    'Lesson plans, student summaries and guidance notes, drafted from your own materials.',
    'Draft a lesson plan from unit four.',
  ],
  [
    'legal',
    'LEGAL',
    'The groundwork done. The judgement stays yours.',
    'Client maps, structured reports and meeting notes, as drafts for a lawyer to review.',
    'Prepare a report from these meeting notes.',
  ],
  [
    'marketing',
    'MARKETING',
    'Ship the content. Explain the numbers.',
    'Social packs, content drafts and client reports, prepared for your team.',
    'Plan a spring campaign for my shop.',
  ],
  [
    'creators',
    'CREATORS',
    'One studio for every platform you post on.',
    'Topic research, scripts, the publishing calendar and sponsor reports.',
    'Turn this video into a week of posts.',
  ],
  [
    'freelancers',
    'FREELANCERS',
    'Proposal to payment without the admin spiral.',
    'Discovery notes, proposals, invoices and polite payment reminders.',
    'Write a proposal from the call notes.',
  ],
  [
    'manufacturing',
    'MANUFACTURING',
    'Suppliers, stock and quality in one place.',
    'Supplier email, stock answers, quality logs and early warning when a date slips.',
    'Which deliveries are slipping this week?',
  ],
];

// The cards link into the router, so the block always renders inside one.
const renderCases = () =>
  render(
    <MemoryRouter>
      <UseCases />
    </MemoryRouter>
  );

const dots = () => screen.getAllByRole('button', { name: /^Go to case \d+$/ });
const currentDot = () => dots().findIndex((dot) => dot.getAttribute('aria-current') === 'true');
const slides = () => screen.getAllByRole('group');

beforeEach(() => {
  // jsdom has no element scrolling; the carousel must not depend on it to move its state.
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  delete Element.prototype.scrollTo;
  delete Element.prototype.scrollIntoView;
});

describe('UseCases', () => {
  it('is one labelled section with the tag, the heading and the one line', () => {
    const { container } = renderCases();
    const section = container.querySelector('section#cases');
    const heading = screen.getByRole('heading', { level: 2, name: 'One app. Many jobs.' });
    expect(section).toHaveAttribute('aria-labelledby', heading.id);
    expect(screen.getByText("How it's used")).toHaveClass('oi-tag-bracket');
    expect(
      screen.getByText('Pick yours. Every result is a first draft for you to review.')
    ).toBeInTheDocument();
  });

  it('is a carousel of eight slides with the tags, titles, lines and requests verbatim', () => {
    renderCases();
    const track = screen.getByRole('region', { name: 'Use cases' });
    expect(track).toHaveAttribute('aria-roledescription', 'carousel');
    expect(track).toHaveAttribute('tabindex', '0');

    const all = within(track).getAllByRole('group');
    expect(all).toHaveLength(10);
    all.forEach((slide, i) => {
      const [slug, tag, title, line, ask] = CASES[i];
      expect(slide).toHaveAttribute('aria-roledescription', 'slide');
      expect(slide).toHaveAttribute('aria-label', `${i + 1} of 10`);
      expect(within(slide).getByText(tag)).toBeInTheDocument();
      expect(within(slide).getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
      expect(within(slide).getByText(line)).toBeInTheDocument();
      expect(within(slide).getByText('Ask')).toBeInTheDocument();
      expect(within(slide).getByText(ask)).toBeInTheDocument();
      expect(within(slide).getByRole('link')).toHaveAttribute('href', `/instant/solutions/${slug}`);
    });
  });

  it('starts on the first case and never moves on its own', () => {
    vi.useFakeTimers();
    try {
      renderCases();
      expect(currentDot()).toBe(0);
      vi.advanceTimersByTime(60000);
      expect(currentDot()).toBe(0);
      expect(slides()[0]).toHaveAttribute('data-current', 'true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves the current case with the previous and next buttons', () => {
    renderCases();
    const prev = screen.getByRole('button', { name: 'Previous case' });
    const next = screen.getByRole('button', { name: 'Next case' });
    expect(dots()).toHaveLength(10);
    // A loop has no ends, so neither arrow is ever switched off.
    expect(prev).not.toHaveAttribute('aria-disabled');
    expect(next).not.toHaveAttribute('aria-disabled');

    fireEvent.click(next);
    expect(currentDot()).toBe(1);
    expect(dots().filter((dot) => dot.hasAttribute('aria-current'))).toHaveLength(1);
    expect(slides()[1]).toHaveAttribute('data-current', 'true');
    expect(slides()[0]).toHaveAttribute('data-current', 'false');

    fireEvent.click(next);
    expect(currentDot()).toBe(2);
    fireEvent.click(prev);
    expect(currentDot()).toBe(1);
    expect(screen.getByText('Showing case 2 of 10')).toBeInTheDocument();
  });

  it('jumps with the pagination dots and loops round at both ends', () => {
    renderCases();
    fireEvent.click(screen.getByRole('button', { name: 'Go to case 10' }));
    expect(currentDot()).toBe(9);
    // After the eighth case, next starts over at the first.
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }));
    expect(currentDot()).toBe(0);
    expect(screen.getByText('Showing case 1 of 10')).toBeInTheDocument();
    // And previous from the first goes back to the eighth.
    fireEvent.click(screen.getByRole('button', { name: 'Previous case' }));
    expect(currentDot()).toBe(9);
  });

  it('answers the arrow, Home and End keys on the focused track', () => {
    renderCases();
    const track = screen.getByRole('region', { name: 'Use cases' });
    track.focus();
    fireEvent.keyDown(track, { key: 'ArrowRight' });
    fireEvent.keyDown(track, { key: 'ArrowRight' });
    expect(currentDot()).toBe(2);
    fireEvent.keyDown(track, { key: 'ArrowLeft' });
    expect(currentDot()).toBe(1);
    fireEvent.keyDown(track, { key: 'End' });
    expect(currentDot()).toBe(9);
    fireEvent.keyDown(track, { key: 'Home' });
    expect(currentDot()).toBe(0);
  });

  it('brings a card to the middle when it is clicked', () => {
    renderCases();
    fireEvent.click(screen.getByText('LEGAL'));
    expect(currentDot()).toBe(5);
  });

  it('types only the current request and keeps every request readable', () => {
    const { container } = renderCases();
    const letters = () => container.querySelectorAll('.ouc-ch').length;
    expect(letters()).toBe(CASES[0][4].length);
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }));
    expect(letters()).toBe(CASES[1][4].length);
    // The card that was left stays written out, as plain text.
    expect(slides()[0].querySelector('.ouc-typed')).toHaveAttribute('data-state', 'done');
    CASES.forEach(([, , , , ask]) => expect(screen.getByText(ask)).toBeInTheDocument());
  });

  it('says what the requests are in the exact small line', () => {
    renderCases();
    const note = screen.getByText('Example requests. Results are drafts, not advice.');
    expect(note).toHaveClass('oi-small');
  });

  it('draws everything itself and marks nothing as unfinished', () => {
    const { container } = renderCases();
    expect(container.querySelectorAll('img, iframe, video, canvas')).toHaveLength(0);
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    });
    expect(container.querySelector('[data-planned]')).toBeNull();
    expect(container.textContent).not.toMatch(
      /planned|soon|coming|beta|what's next|not in the app/i
    );
  });
  it('gives every card a way to its Solutions page, live only on the card in front', () => {
    renderCases();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(10);
    expect(links[0]).toHaveAccessibleName('Healthcare: see the page');
    expect(links[0]).not.toHaveAttribute('tabindex');
    links.slice(1).forEach((link) => expect(link).toHaveAttribute('tabindex', '-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Go to case 6' }));
    const after = screen.getAllByRole('link');
    expect(after[5]).toHaveAccessibleName('Legal: see the page');
    expect(after[5]).not.toHaveAttribute('tabindex');
    expect(after[0]).toHaveAttribute('tabindex', '-1');
  });

  it('says on each card what its Solutions page says in its headline', () => {
    const pages = import.meta.glob(['./pages/solutions/data/*.js', '!**/*.test.js'], {
      eager: true,
    });
    const titles = Object.fromEntries(
      Object.values(pages)
        .map((page) => page.default)
        .filter((page) => page?.slug)
        .map((page) => [page.slug, page.title])
    );
    expect(Object.keys(titles)).toHaveLength(10);
    for (const [slug, , title] of CASES) expect(title).toBe(titles[slug]);
  });
});
