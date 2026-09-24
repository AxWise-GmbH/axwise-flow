import { useCallback, useEffect, useRef, useState } from 'react';
import SpeedHero, { measuredOn } from './heroes/SpeedHero';
import Reveal from '../ui/Reveal';
import CountUp from '../ui/CountUp';
import { Seen } from '../SpeedStrip';
import { SKIP_KEYS, localeWords, localize } from '../i18n/localize';
import { useT } from '../i18n/useT';
import './SpeedPage.css';

const UNIT = ' s';
const AXIS_SECONDS = 90;
const AXIS_TICKS = [0, 30, 60, 90];
const STACKED_QUERY = '(max-width: 640px)';

// The race is a fixed, short choreography, not real time. A square-root scale keeps the
// order and the feel of the three runs while the shortest one still lasts long enough to see.
const RACE_MS = 2000;
const LONGEST_SECONDS = 84.04;

const RUNS = [
  { id: 'answer', seconds: 1.86, value: 1.9, decimals: 1, label: 'a direct answer' },
  { id: 'summary', seconds: 19.08, value: 19, decimals: 0, label: 'a short summary' },
  { id: 'document', seconds: 84.04, value: 84, decimals: 0, label: 'an 8-page document' },
];

// `pages` lists the text lines on each sheet, front sheet first; `step` is how far each
// sheet behind peeks out.
const MADE = [
  { id: 'answer', time: '1.86 s', title: 'A direct answer', line: '137 tokens.', pages: [3] },
  {
    id: 'summary',
    time: '19.08 s',
    title: 'A short summary',
    line: '767 words, about a page and a half.',
    pages: [10, 5],
    step: 44,
  },
  {
    id: 'document',
    time: '84.04 s',
    title: 'A full planning document',
    line: '3,951 words, about 8 pages.',
    pages: [10, 10, 10, 10, 10, 10, 10, 6],
    step: 22,
  },
];

const METHOD = [
  'Measured once each, on 18 September 2026.',
  'In the Orqanix cloud preview, not in the desktop app.',
  'One test scenario: a food-compliance project for a retailer in Estonia.',
  'Not averages. Your times will differ with the task, the load and the AI model version.',
  'These are single documents. A full starter pack is many pieces and takes longer.',
  'The 84-second run finished with evidence gaps flagged by its own audit.',
];

// The opening dial links each of its readouts down to the card of what that run made.
function cardId(id) {
  return `speed-run-${id}`;
}

const HERO_RUNS = RUNS.map((run) => ({ ...run, href: `#${cardId(run.id)}` }));

// Words in other languages: pg.speed.run.<id>.label, pg.speed.made.<id>.*, pg.speed.rules.<n>.
// Times and numbers stay as written.
const SPEED_SKIP = new Set([...SKIP_KEYS, 'time']);
const localRun = (run, t) => localize(run, `pg.speed.run.${run.id}`, t, SPEED_SKIP);
const localMade = (item, t) => localize(item, `pg.speed.made.${item.id}`, t, SPEED_SKIP);

export function speedWords() {
  return Object.assign(
    localeWords(METHOD, 'pg.speed.rules'),
    ...RUNS.map((run) => localeWords(run, `pg.speed.run.${run.id}`, SPEED_SKIP)),
    ...MADE.map((item) => localeWords(item, `pg.speed.made.${item.id}`, SPEED_SKIP))
  );
}

const WAVE_MS = 110;

const PAGE = { width: 60, height: 84, margin: 8, firstLine: 13, lineGap: 6.6 };
const GLYPH = { width: 224, height: 100 };
// Line lengths as a share of the text width; the short ones read as paragraph ends.
const LINE_SHARES = [1, 0.92, 0.97, 0.58, 1, 0.9, 0.96, 0.72, 1];

function index(i) {
  return String(i + 1).padStart(2, '0');
}

function runMs(seconds) {
  return Math.round(RACE_MS * Math.sqrt(seconds / LONGEST_SECONDS));
}

/** A glass surface that answers the pointer: CSS reads --mx/--my, set once per frame. */
function useSpotlight() {
  const latest = useRef(null);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return useCallback((event) => {
    latest.current = { el: event.currentTarget, x: event.clientX, y: event.clientY };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const { el, x, y } = latest.current;
      const box = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${x - box.left}px`);
      el.style.setProperty('--my', `${y - box.top}px`);
    });
  }, []);
}

function ReplayGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="osp-replay-glyph" aria-hidden="true" focusable="false">
      <path d="M13.2 8.4a5.2 5.2 0 1 1-1.6-4.2" />
      <path d="M13.5 1.8v2.9h-2.9" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="osp-arrow" aria-hidden="true" focusable="false">
      <path d="M2.5 8h11M9.5 4l4 4-4 4" />
    </svg>
  );
}

/** One light track. Decoration: the figure beside it carries the number for readers. */
function Lane({ seconds }) {
  const share = seconds / AXIS_SECONDS;
  return (
    <div className="osp-lane" aria-hidden="true">
      {AXIS_TICKS.map((tick) => (
        <i key={tick} className="osp-tick" style={{ '--x': tick / AXIS_SECONDS }} />
      ))}
      <i className="osp-rail" />
      <i className="osp-gate" />
      <div className="osp-lit">
        <i className="osp-glow" />
        <i className="osp-trail" />
        <i className="osp-sweep" />
      </div>
      <div className="osp-runner" data-flag={share > 0.5 ? 'before' : 'after'}>
        <i className="osp-head" />
        <span className="osp-flag">
          {seconds.toFixed(2)}
          {UNIT}
        </span>
      </div>
    </div>
  );
}

/** True while the tracks are stacked for a phone; the breakpoint mirrors SpeedPage.css. */
function useStacked() {
  const [stacked, setStacked] = useState(
    () => globalThis.window?.matchMedia?.(STACKED_QUERY)?.matches ?? false
  );

  useEffect(() => {
    const query = globalThis.window?.matchMedia?.(STACKED_QUERY);
    if (!query?.addEventListener) return undefined;
    const onChange = () => setStacked(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return stacked;
}

function Track({ item, position, run, stageSeen, stacked }) {
  return (
    <Seen
      as="li"
      className="osp-row"
      threshold={0.55}
      style={{
        '--p': item.seconds / AXIS_SECONDS,
        '--run': `${runMs(item.seconds)}ms`,
        '--sd': `${position * 150}ms`,
      }}
    >
      {(rowSeen) => {
        // Side by side, the three leave the gate together. Stacked on a phone only one track
        // fits the screen at a time, so each one goes when it is reached.
        const go = stacked ? rowSeen : stageSeen;
        return (
          <div className="osp-track" data-go={go}>
            <span className="osp-idx" aria-hidden="true">
              {index(position)}
            </span>
            {/* A new key restarts the lights; Replay only has to count. */}
            <Lane key={run} seconds={item.seconds} />
            <div className="osp-figure">
              <p className="oi-stat-value osp-value">
                {/* The count starts when the track goes, not on page load. */}
                {go ? (
                  <CountUp key={run} value={item.value} decimals={item.decimals} suffix={UNIT} />
                ) : (
                  `${item.value.toFixed(item.decimals)}${UNIT}`
                )}
              </p>
              <p className="osp-label">{item.label}</p>
            </div>
          </div>
        );
      }}
    </Seen>
  );
}

function Race() {
  const { t } = useT('pg');
  const [run, setRun] = useState(0);
  const stacked = useStacked();
  const onPointerMove = useSpotlight();

  return (
    <>
      <Seen className="ois-gate">
        <Reveal>
          <Seen className="osp-stage" threshold={0.4} onPointerMove={onPointerMove}>
            {(stageSeen) => (
              <>
                <i className="osp-bloom" aria-hidden="true" />
                <ul className="osp-rows" role="list">
                  {RUNS.map((item, i) => (
                    <Track
                      key={item.id}
                      item={localRun(item, t)}
                      position={i}
                      run={run}
                      stageSeen={stageSeen}
                      stacked={stacked}
                    />
                  ))}
                </ul>
                <div className="osp-track osp-axis" aria-hidden="true">
                  <div className="osp-axis-lane">
                    {AXIS_TICKS.map((tick) => (
                      <span
                        key={tick}
                        className="osp-axis-label"
                        style={{ '--x': tick / AXIS_SECONDS }}
                      >
                        {tick}
                      </span>
                    ))}
                  </div>
                  <span className="osp-axis-unit">{t('pg.speed.seconds', 'seconds')}</span>
                </div>
              </>
            )}
          </Seen>
        </Reveal>
      </Seen>
      <Seen className="ois-gate osp-under">
        <Reveal as="p" className="osp-note">
          {t('pg.speed.note', 'Animation is sped up. Figures are real.')}
        </Reveal>
        <Reveal delay={90}>
          <button type="button" className="osp-replay" onClick={() => setRun((n) => n + 1)}>
            <ReplayGlyph />
            {t('pg.speed.replay', 'Replay')}
          </button>
        </Reveal>
      </Seen>
    </>
  );
}

/** Sheets of line-art paper: the more that was written, the more sheets and lines. */
function PageGlyph({ pages, step = 0 }) {
  const x0 = (GLYPH.width - PAGE.width - (pages.length - 1) * step) / 2;
  const y0 = (GLYPH.height - PAGE.height) / 2;
  const textWidth = PAGE.width - 2 * PAGE.margin;
  // Painted back to front, so each sheet covers the one behind it.
  const backToFront = pages.map((lines, sheet) => ({ lines, sheet })).reverse();

  return (
    <svg
      viewBox={`0 0 ${GLYPH.width} ${GLYPH.height}`}
      className="osp-glyph"
      aria-hidden="true"
      focusable="false"
    >
      {backToFront.map(({ lines, sheet }) => (
        <g
          key={sheet}
          className="osp-leaf"
          transform={`translate(${x0 + sheet * step} ${y0})`}
          style={{ '--depth': sheet }}
        >
          <rect
            className="osp-sheet osp-draw"
            width={PAGE.width}
            height={PAGE.height}
            rx="5"
            pathLength="1"
            style={{ '--i': sheet * 2 }}
          />
          {Array.from({ length: lines }, (_, l) => {
            const share = l === lines - 1 ? 0.5 : LINE_SHARES[l % LINE_SHARES.length];
            const y = PAGE.firstLine + l * PAGE.lineGap;
            return (
              <path
                key={l}
                className="osp-ink osp-draw"
                d={`M${PAGE.margin} ${y}h${(textWidth * share).toFixed(1)}`}
                pathLength="1"
                style={{ '--i': sheet * 2 + l + 2 }}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}

function MadeCard({ item, position }) {
  const onPointerMove = useSpotlight();
  const titleId = `speed-made-${item.id}`;

  return (
    <Reveal
      as="article"
      className="oi-card osp-card"
      aria-labelledby={titleId}
      delay={position * WAVE_MS}
      onPointerMove={onPointerMove}
    >
      <div className="osp-card-top">
        <p className="oi-tag osp-time">{item.time}</p>
        <span className="osp-card-idx" aria-hidden="true">
          {index(position)}
        </span>
      </div>
      <div className="osp-glyph-stage">
        <PageGlyph pages={item.pages} step={item.step} />
      </div>
      <h3 id={titleId} className="osp-card-title">
        {item.title}
      </h3>
      <p className="oi-line osp-card-line">{item.line}</p>
    </Reveal>
  );
}

export default function SpeedPage() {
  const { t, lang } = useT('pg');
  return (
    <>
      <SpeedHero runs={HERO_RUNS.map((run) => localRun(run, t))} methodHref="#speed-method" />

      <Seen
        as="section"
        id="speed-race"
        className="oi-section ois-section ois-ruled osp-race"
        aria-labelledby="speed-race-heading"
      >
        <div className="oi-container">
          <Seen className="ois-gate ois-head">
            <Reveal as="p" className="oi-tag oi-tag-bracket">
              {t('pg.speed.race.tag', 'The cloud side · {date}', { date: measuredOn(lang) })}
            </Reveal>
            <Reveal as="h2" id="speed-race-heading" className="oi-h2" delay={90}>
              {t('pg.speed.race.title', 'Three timings')}
            </Reveal>
          </Seen>
          <Race />
        </div>
      </Seen>

      <Seen
        as="section"
        id="speed-made"
        className="oi-section ois-section ois-ruled osp-made"
        aria-labelledby="speed-made-heading"
      >
        <div className="oi-container">
          <Seen className="ois-gate ois-head">
            <Reveal as="p" className="oi-tag oi-tag-bracket">
              {t('pg.speed.made.tag', 'The output')}
            </Reveal>
            <Reveal as="h2" id="speed-made-heading" className="oi-h2" delay={90}>
              {t('pg.speed.made.title', 'What each run made')}
            </Reveal>
          </Seen>
          <div className="osp-cards">
            {MADE.map((item, i) => (
              // One gate per card: on a phone they stack, and each arrives as it is reached.
              <Seen key={item.id} id={cardId(item.id)} className="ois-gate osp-card-slot">
                <MadeCard item={localMade(item, t)} position={i} />
              </Seen>
            ))}
          </div>
        </div>
      </Seen>

      <Seen
        as="section"
        id="speed-method"
        className="oi-section ois-section ois-ruled osp-method"
        aria-labelledby="speed-method-heading"
      >
        <div className="oi-container osp-method-layout">
          <Seen className="ois-gate osp-method-head">
            <Reveal as="p" className="oi-tag oi-tag-bracket">
              {t('pg.speed.method.tag', 'The fine print')}
            </Reveal>
            <Reveal as="h2" id="speed-method-heading" className="oi-h2" delay={90}>
              {t('pg.speed.method.title', 'How we measured')}
            </Reveal>
            <Reveal as="p" className="oi-line osp-method-line" delay={180}>
              {t('pg.speed.method.line', 'The limits matter as much as the numbers.')}
            </Reveal>
          </Seen>
          <div>
            <ol className="osp-rules" role="list">
              {localize(METHOD, 'pg.speed.rules', t).map((text, i) => (
                <Seen as="li" key={text} className="ois-gate osp-rule">
                  <Reveal className="osp-rule-inner">
                    <span className="osp-rule-idx" aria-hidden="true">
                      {index(i)}
                    </span>
                    <p className="osp-rule-text">{text}</p>
                  </Reveal>
                </Seen>
              ))}
            </ol>
            <Seen className="ois-gate osp-link-row">
              <Reveal as="p">
                <a className="oi-link osp-link" href="/benchmark">
                  <span>{t('pg.speed.benchmark', 'Open the full benchmark page')}</span>
                  <ArrowGlyph />
                </a>
              </Reveal>
            </Seen>
          </div>
        </div>
      </Seen>
    </>
  );
}
