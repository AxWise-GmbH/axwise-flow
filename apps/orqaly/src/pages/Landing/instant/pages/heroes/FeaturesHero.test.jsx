import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FEATURES } from '../features.data';
import FeaturesHero from './FeaturesHero';

/*
 * FeaturesHero is not on any page now: the owner took it off "Features" (2026-09-21). It
 * stays here, tested on its own, so it can come back with one import.
 */

function Icon() {
  return (
    <svg className="ohf-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 4h16v16H4z" />
    </svg>
  );
}

const ITEMS = FEATURES.map((feature) => ({
  id: feature.id,
  name: feature.name,
  hash: `#feature-${feature.id}`,
  icon: <Icon />,
}));

function renderHero() {
  return render(
    <MemoryRouter>
      <FeaturesHero
        id="features-heading"
        tag="Features"
        title="Everything it does."
        line="Twelve things it does for you, one by one."
        items={ITEMS}
      />
    </MemoryRouter>
  );
}

function hero() {
  return document.querySelector('section[aria-labelledby="features-heading"]');
}

function tiles() {
  return within(screen.getByRole('navigation', { name: 'Jump to a feature' })).getAllByRole('link');
}

function stubMatchMedia(matches) {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: matches(query),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FeaturesHero (kept, not on a page)', () => {
  it('keeps the title, its id and the line, and names the block by its title', () => {
    renderHero();
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent(/^Everything it does\.$/);
    expect(title).toHaveAttribute('id', 'features-heading');
    expect(hero()).toContainElement(title);
    expect(within(hero()).getByText('Features')).toHaveClass('oi-tag-bracket');
    expect(within(hero()).getByText('Twelve things it does for you, one by one.')).toBeVisible();
  });

  it('lays exactly one tile per item, in order, each a link to that item', () => {
    renderHero();
    expect(tiles()).toHaveLength(ITEMS.length);
    tiles().forEach((link, index) => {
      expect(link).toHaveAccessibleName(ITEMS[index].name);
      expect(link.hash).toBe(ITEMS[index].hash);
      expect(hero()).toContainElement(link);
    });
  });

  it('numbers the tiles 01 to 18 for the eye only', () => {
    renderHero();
    tiles().forEach((link, index) => {
      const number = link.querySelector('.ohf-number');
      expect(number).toHaveTextContent(String(index + 1).padStart(2, '0'));
      expect(number).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('keeps every drawing out of the reading order and uses no image, frame, video or canvas', () => {
    renderHero();
    expect(hero().querySelectorAll('img, iframe, video, canvas')).toHaveLength(0);
    const drawings = hero().querySelectorAll('svg');
    expect(drawings.length).toBeGreaterThanOrEqual(13);
    for (const svg of drawings) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    }
    for (const decoration of hero().querySelectorAll('.ohf-ruler, .ohf-head-rule')) {
      expect(decoration).toHaveAttribute('aria-hidden', 'true');
    }
    // The owner took the band of light that swept across the wall off.
    expect(hero().querySelector('.ohf-light')).toBeNull();
    expect(hero().querySelector('.ohf-head-rule').children).toHaveLength(0);
  });

  it('adds two words of its own and none of the banned ones', () => {
    renderHero();
    const wall = screen.getByRole('navigation', { name: 'Jump to a feature' });
    const names = ITEMS.map((item, index) => `${String(index + 1).padStart(2, '0')}${item.name}`);
    expect(wall.textContent).toBe(`Jump to01 \u2013 18${names.join('')}`);
    expect(hero().textContent).not.toMatch(
      /planned|beta|\bsoon\b|coming|shield|SOC2|verified|production|guaranteed|Slack|Telegram|Orqaly|AxWise|zero hallucination|(\d|times) faster/i
    );
  });

  it('moves by CSS alone: it starts no frame loop and no interval, reduced motion or not', () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    const intervals = vi.spyOn(window, 'setInterval');
    renderHero();
    expect(tiles()).toHaveLength(18);
    cleanup();

    stubMatchMedia((query) => query === '(prefers-reduced-motion: reduce)');
    renderHero();
    for (const link of tiles()) expect(link).toBeVisible();
    expect(frames).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
  });
});
