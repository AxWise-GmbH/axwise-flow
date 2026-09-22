import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import Reveal from '../ui/Reveal';
import { Badge } from '../ui/Card';
import { Seen } from '../SpeedStrip';
import { DEEP_DIVE_IDS, FEATURES, localizeFeature } from './features.data';
import { useT } from '../i18n/useT';
import FeatureDeepDives from './FeatureDeepDives';
import './FeaturesPage.css';

const PHONE_QUERY = '(max-width: 820px)';
const EXPLORER_ID = 'features-explorer';

/** Every feature, in the current language. */
function useFeatures() {
  const { t } = useT('pg');
  return FEATURES.map((feature) => localizeFeature(feature, t));
}

// 24-unit line icons, one stroke weight. Every path draws itself (pathLength 1, see the CSS).
const ICON_PATHS = {
  panel: [
    'M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
    'M14 4.5v15',
    'M16.75 9h1.5',
    'M16.75 12h1.5',
  ],
  flow: [
    'M3 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
    'M3 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
    'M17 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
    'M7 6h4.5A1.5 1.5 0 0 1 13 7.5v9a1.5 1.5 0 0 1-1.5 1.5H7',
    'M13 12h4',
  ],
  tracker: [
    'M4 6.5 5.5 8 8 5.25',
    'M11.5 6.75H20',
    'M4 12.5 5.5 14 8 11.25',
    'M11.5 12.75H20',
    'M4.25 18.75a1.75 1.75 0 1 0 3.5 0 1.75 1.75 0 0 0-3.5 0z',
    'M11.5 18.75H17',
  ],
  folder: [
    'M3.5 7a2 2 0 0 1 2-2h3.4L11 7.25h7.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
    'M3.5 11h17',
  ],
  book: [
    'M12 6.6C10 5.2 7.4 4.8 4 5.1v13c3.4-.3 6 .1 8 1.5 2-1.4 4.6-1.8 8-1.5v-13c-3.4-.3-6 .1-8 1.5z',
    'M12 6.6v13',
  ],
  mic: [
    'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z',
    'M5.5 11.5a6.5 6.5 0 0 0 13 0',
    'M12 18v2.5',
  ],
  browser: [
    'M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
    'M3.5 9.25h17',
    'M6.4 6.9h.01',
    'M8.9 6.9h.01',
  ],
  plug: ['M9 3.5v4', 'M15 3.5v4', 'M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0z', 'M12 16.5v4'],
  lock: [
    'M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 6 10.5z',
    'M8 10.5V8a4 4 0 0 1 8 0v2.5',
    'M12 14.5v2',
  ],
  key: [
    'M8 11.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M10.9 12.7 19.5 4',
    'M15.7 7.8 18 10.1',
    'M18.2 5.3l1.9 1.9',
  ],
  code: ['M8.5 7l-5 5 5 5', 'M15.5 7l5 5-5 5', 'M13.5 5l-3 14'],
  clock: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 7.5V12l3 2'],
  chip: [
    'M8 6.5h8A1.5 1.5 0 0 1 17.5 8v8a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 16V8A1.5 1.5 0 0 1 8 6.5z',
    'M10 10h4v4h-4z',
    'M10 3.5v3',
    'M14 3.5v3',
    'M10 17.5v3',
    'M14 17.5v3',
    'M3.5 10h3',
    'M3.5 14h3',
    'M17.5 10h3',
    'M17.5 14h3',
  ],
  prompt: [
    'M5.5 3.5h9l4 4v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z',
    'M14.5 3.5v4h4',
    'M7.5 11.5 10 13.5l-2.5 2',
    'M12 16h4',
  ],
  layers: ['M12 3.5 20.5 8 12 12.5 3.5 8z', 'M3.5 12 12 16.5 20.5 12', 'M3.5 16 12 20.5 20.5 16'],
  calendar: [
    'M5.5 5.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z',
    'M3.5 10h17',
    'M8 3.5v4',
    'M16 3.5v4',
    'M12 13v2.5l1.75 1',
  ],
  box: ['M12 3.5 20 7.75v8.5L12 20.5 4 16.25v-8.5z', 'M4 7.75 12 12l8-4.25', 'M12 12v8.5'],
  spark: [
    'M12 3.5c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6z',
    'M18.5 15.5c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5z',
  ],
};

function FeatureIcon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} pathLength="1" />
      ))}
    </svg>
  );
}

function twoDigits(value) {
  return String(value).padStart(2, '0');
}

// The data marks a condition in plain words (read in English); the badge only repeats which kind it is.
function noteBadge(note, t) {
  if (/switch/i.test(note)) return t('pg.features.badge.switch', 'you switch it on');
  if (/setup/i.test(note)) return t('pg.features.badge.setup', 'needs setup');
  return null;
}

function ids(feature) {
  return {
    panel: `feature-${feature.id}`,
    name: `feature-${feature.id}-name`,
    today: `feature-${feature.id}-today`,
  };
}

/** The words of one feature: the main text, its condition if any, and a second line under "Also". */
function FeatureText({ feature }) {
  const { t } = useT('pg');
  const badge = feature.note ? noteBadge(feature.english.note, t) : null;
  return (
    <>
      <p id={ids(feature).today} className="oif-today">
        {feature.today}
      </p>
      {feature.note && (
        <p className="oif-note">
          {badge && <Badge>{badge}</Badge>}
          <span>{feature.note}</span>
        </p>
      )}
      {feature.also && (
        <p className="oif-also">
          <span className="oi-tag oif-also-tag">{t('pg.features.also', 'Also')}</span>
          <span className="oif-also-text">{feature.also}</span>
        </p>
      )}
    </>
  );
}

function subscribeToPhone(onChange) {
  const query = globalThis.window?.matchMedia?.(PHONE_QUERY);
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isPhone() {
  return globalThis.window?.matchMedia?.(PHONE_QUERY)?.matches ?? false;
}

function prefersReducedMotion() {
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function bringIntoView(element) {
  // Optional call: jsdom has no scrollIntoView.
  element?.scrollIntoView?.({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}

/*
 * A link to #feature-<id> (a shared address, or a link from elsewhere) opens that feature.
 * On a desktop that feature's panel is hidden until it is picked, so the browser has
 * nothing to scroll to: each layout lands the link itself. `arrive` shows the feature and
 * returns the element to bring into view. The location key is watched too, so following
 * the same link twice lands twice.
 */
function useFeatureJump(arrive) {
  const { hash, key } = useLocation();
  useEffect(() => {
    const index = FEATURES.findIndex((feature) => hash === `#${ids(feature).panel}`);
    if (index === -1) return undefined;
    const element = arrive(index);
    // One frame later: on a fresh load the sub-page shell scrolls to the top in this same
    // commit, after this effect, and would cancel the landing.
    const frame = requestAnimationFrame(() => bringIntoView(element));
    return () => cancelAnimationFrame(frame);
  }, [hash, key, arrive]);
}

// The stage's light follows the mouse across the whole explorer, one write per frame.
function usePointerLight() {
  const stageRef = useRef(null);
  const frame = useRef(0);
  const point = useRef(null);

  const track = useCallback((event) => {
    if (event.pointerType !== 'mouse') return;
    point.current = { x: event.clientX, y: event.clientY };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const stage = stageRef.current;
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      // Over the list the light waits at the stage's near edge, level with the pointer.
      const x = Math.min(box.width, Math.max(0, point.current.x - box.left));
      const y = Math.min(box.height, Math.max(0, point.current.y - box.top));
      stage.style.setProperty('--lx', `${x}px`);
      stage.style.setProperty('--ly', `${y}px`);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return [stageRef, track];
}

const KEY_TARGETS = {
  ArrowDown: (index) => index + 1,
  ArrowUp: (index) => index - 1,
  Home: () => 0,
  End: () => FEATURES.length - 1,
};

/** Desktop: the list on the left picks which feature the glass stage on the right shows. */
function Explorer() {
  const { t } = useT('pg');
  const features = useFeatures();
  // The feature that just left stays painted for one short fade, so the change is a cross-fade.
  const [view, setView] = useState({ active: 0, leaving: -1 });
  const rows = useRef([]);
  const [stageRef, trackPointer] = usePointerLight();
  const { active, leaving } = view;

  const select = useCallback((index) => {
    setView((current) =>
      current.active === index ? current : { active: index, leaving: current.active }
    );
  }, []);

  // Focus moves with the jump, so the keyboard carries on from the feature it asked for.
  const arrive = useCallback(
    (index) => {
      select(index);
      rows.current[index]?.focus({ preventScroll: true });
      return document.getElementById(EXPLORER_ID);
    },
    [select]
  );
  useFeatureJump(arrive);

  const onKeyDown = (event) => {
    const target = KEY_TARGETS[event.key];
    if (!target) return;
    event.preventDefault();
    const next = Math.min(FEATURES.length - 1, Math.max(0, target(active)));
    select(next);
    rows.current[next]?.focus();
  };

  const onPanelAnimationEnd = (event) => {
    if (event.target !== event.currentTarget) return;
    setView((current) => (current.leaving === -1 ? current : { ...current, leaving: -1 }));
  };

  return (
    <Seen
      id={EXPLORER_ID}
      className="oif-explorer"
      threshold={0.12}
      style={{ '--active': active, '--p': (active + 1) / FEATURES.length }}
      onPointerMove={trackPointer}
    >
      <div className="oif-index">
        <ul className="oif-list" aria-label={t('pg.features.list', 'Features')}>
          {features.map((feature, index) => (
            <li key={feature.id} className="oif-row" style={{ '--i': index }}>
              <button
                type="button"
                ref={(element) => {
                  rows.current[index] = element;
                }}
                className="oif-row-button"
                aria-pressed={index === active}
                aria-controls={ids(feature).panel}
                aria-describedby={ids(feature).today}
                onClick={() => select(index)}
                onFocus={() => select(index)}
                onKeyDown={onKeyDown}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') select(index);
                }}
              >
                <FeatureIcon name={feature.icon} className="oif-icon oif-row-icon" />
                <span className="oif-row-name">{feature.name}</span>
                <span className="oif-row-index" aria-hidden="true">
                  {twoDigits(index + 1)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <i className="oif-rail" aria-hidden="true" />
      </div>

      <div ref={stageRef} className="oif-stage">
        <i className="oif-light" aria-hidden="true" />
        <div className="oif-glass">
          {/* Remounted on every change so the streak of light crosses the top edge again. */}
          <i key={active} className="oif-streak" aria-hidden="true" />
          <div className="oif-stage-head" aria-hidden="true">
            <p className="oi-tag oif-count">
              <b>{twoDigits(active + 1)}</b> / {twoDigits(FEATURES.length)}
            </p>
            <span className="oif-progress">
              <i />
            </span>
            <p className="oi-tag oif-status">{t('pg.features.ready', 'Ready')}</p>
          </div>
          <div className="oif-panels">
            {features.map((feature, index) => (
              <article
                key={feature.id}
                id={ids(feature).panel}
                className="oif-panel"
                aria-labelledby={ids(feature).name}
                hidden={index !== active}
                aria-hidden={index === leaving ? true : undefined}
                data-leaving={index === leaving}
                onAnimationEnd={index === leaving ? onPanelAnimationEnd : undefined}
              >
                <FeatureIcon name={feature.icon} className="oif-icon oif-panel-icon" />
                <h3 id={ids(feature).name} className="oif-name">
                  {feature.name}
                </h3>
                <FeatureText feature={feature} />
                <span className="oif-numeral" aria-hidden="true">
                  {twoDigits(index + 1)}
                </span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </Seen>
  );
}

/** Phones: no panes. Every feature is its own card and arrives as it is reached. */
function CardColumn() {
  const { t } = useT('pg');
  const features = useFeatures();
  const arrive = useCallback((index) => {
    const card = document.getElementById(ids(FEATURES[index]).panel);
    card?.focus({ preventScroll: true });
    return card;
  }, []);
  useFeatureJump(arrive);

  return (
    <ul className="oif-cards" aria-label={t('pg.features.list', 'Features')}>
      {features.map((feature, index) => (
        <Seen
          as="li"
          key={feature.id}
          id={ids(feature).panel}
          className="oif-gate oif-card-slot"
          tabIndex={-1}
        >
          <Reveal as="article" className="oif-card" aria-labelledby={ids(feature).name}>
            <div className="oif-card-top">
              <span className="oif-card-badge">
                <FeatureIcon name={feature.icon} className="oif-icon oif-card-icon" />
              </span>
              <p className="oi-tag oif-count" aria-hidden="true">
                <b>{twoDigits(index + 1)}</b> / {twoDigits(FEATURES.length)}
              </p>
            </div>
            <h3 id={ids(feature).name} className="oif-name">
              {feature.name}
            </h3>
            <div className="oif-card-text">
              <FeatureText feature={feature} />
            </div>
          </Reveal>
        </Seen>
      ))}
    </ul>
  );
}

function FeatureIndex() {
  const { t } = useT('pg');
  const phone = useSyncExternalStore(subscribeToPhone, isPhone, () => false);
  return (
    <Seen
      as="section"
      id="features-all"
      className="oi-section oif-section"
      aria-labelledby="features-all-heading"
    >
      <div className="oi-container">
        <Seen className="oif-gate oif-head oif-head-split">
          <div className="oif-head-main">
            <Reveal as="h1" id="features-all-heading" className="oi-h2">
              {t('pg.features.title', 'In the app today')}
            </Reveal>
          </div>
          <Reveal as="p" className="oi-small oif-legend" delay={90}>
            {t('pg.features.legend', 'Some parts are off until you switch them on.')}
          </Reveal>
        </Seen>
        {phone ? <CardColumn /> : <Explorer />}
      </div>
    </Seen>
  );
}

// One style write per frame, on whichever card the mouse is over.
function useCardSpotlight() {
  const frame = useRef(0);
  const last = useRef(null);

  const track = useCallback((event) => {
    if (event.pointerType !== 'mouse') return;
    const card = event.target.closest?.('.oif-rest-card');
    if (!card) return;
    last.current = { card, x: event.clientX, y: event.clientY };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const { card: surface, x, y } = last.current;
      const box = surface.getBoundingClientRect();
      surface.style.setProperty('--mx', `${x - box.left}px`);
      surface.style.setProperty('--my', `${y - box.top}px`);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return track;
}

/** The eight features without a story of their own, as one compact grid. */
function RestGrid() {
  const { t } = useT('pg');
  const trackPointer = useCardSpotlight();
  const rest = useFeatures().filter((feature) => !DEEP_DIVE_IDS.includes(feature.id));
  return (
    <Seen
      as="section"
      id="features-rest"
      className="oi-section oif-section oif-ruled"
      aria-labelledby="features-rest-heading"
    >
      <div className="oi-container">
        <Seen className="oif-gate oif-head">
          <Reveal as="h2" id="features-rest-heading" className="oi-h2">
            {t('pg.features.rest', 'And the rest')}
          </Reveal>
        </Seen>
        <Seen as="ul" className="oif-rest" threshold={0.08} onPointerMove={trackPointer}>
          {rest.map((feature, index) => (
            <li key={feature.id} className="oif-rest-slot" style={{ '--i': index }}>
              <article className="oif-rest-card" aria-labelledby={`rest-${feature.id}-name`}>
                <span className="oif-rest-badge">
                  <FeatureIcon name={feature.icon} className="oif-icon oif-rest-icon" />
                </span>
                <h3 id={`rest-${feature.id}-name`} className="oif-rest-name">
                  {feature.name}
                </h3>
                <p className="oif-rest-text">{feature.today}</p>
              </article>
            </li>
          ))}
        </Seen>
      </div>
    </Seen>
  );
}

// The owner took the opening wall ("Everything it does.", FeaturesHero) off, with the rule
// under it and the "Feature by feature" tag, so the page starts at the explorer and its
// heading is the page's h1. FeaturesHero stays in heroes/, unused, with its own tests.
export default function FeaturesPage() {
  return (
    <>
      <FeatureIndex />
      <FeatureDeepDives />
      <RestGrid />
    </>
  );
}
