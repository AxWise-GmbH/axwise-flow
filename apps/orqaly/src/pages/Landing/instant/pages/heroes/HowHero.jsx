import { useId, useState } from 'react';
import { Seen } from '../../SpeedStrip';
import { CheckGlyph } from '../../ui/Glyphs';
import HeroFrame from './HeroFrame';
import { TRACKS, stationPlace, stepAnchor } from './howHeroTrack';
import { useT } from '../../i18n/useT';
import './HowHero.css';

// One loop of the picture. The light travels to a station, the station plays its scene,
// and so on down the line; then the finished journey is held, and it all goes dark again.
const TRAVEL_MS = 1400;
const PLAY_MS = 1800;
const HOLD_MS = 2800;
const RESET_MS = 900;

// The travelling light is three dashes on the same line: `span` is a dash's length in
// pulses, `lead` the share of it that runs ahead of the light's own position.
const PULSE_PARTS = [
  { name: 'glow', span: 1.7, lead: 0.5 },
  { name: 'tail', span: 2.6, lead: 0.1 },
  { name: 'core', span: 0.55, lead: 0.5 },
];

const WAVE_BARS = [
  [-18, 8],
  [-12, 16],
  [-6, 26],
  [0, 18],
  [6, 28],
  [12, 14],
  [18, 8],
];
const WAVE_MID = -10;

const PLAN_ROWS = [
  [-17, 19],
  [0, 12],
  [17, 16],
];

const WORK_LINES = [
  [-12, 15, -14],
  [-25, 22, -1],
  [-25, 6, 12],
];

function SayScene() {
  return (
    <>
      {WAVE_BARS.map(([x, height], index) => (
        <line
          key={x}
          className="ohw-bar"
          x1={x}
          x2={x}
          y1={WAVE_MID - height / 2}
          y2={WAVE_MID + height / 2}
          style={{ '--k': index }}
        />
      ))}
      <rect className="ohw-soft" x="-27" y="9" width="54" height="15" rx="7.5" />
      <line className="ohw-write" x1="-19" x2="8" y1="16.5" y2="16.5" style={{ '--k': 2 }} />
      <line className="ohw-caret" x1="14" x2="14" y1="13" y2="20" />
    </>
  );
}

function PlanScene() {
  return (
    <>
      <line className="ohw-soft" x1="-18" x2="-18" y1="-17" y2="17" />
      {PLAN_ROWS.map(([y, end], index) => (
        <g key={y} style={{ '--k': index }}>
          <circle className="ohw-marker" cx="-18" cy={y} r="4.5" />
          <circle className="ohw-fill" cx="-18" cy={y} r="2.4" />
          <line className="ohw-write" x1="-7" x2={end} y1={y} y2={y} />
        </g>
      ))}
    </>
  );
}

function AskScene() {
  return (
    <>
      <path d="M-6 -17a6 6 0 1 1 9.2 5.1c-2.2 1.4-3.2 2.6-3.2 5.2" />
      <circle className="ohw-dot" cx="0" cy="-1.4" r="1.4" />
      <rect className="ohw-pick" x="-29" y="6" width="27" height="16" rx="8" />
      <rect className="ohw-soft" x="-29" y="6" width="27" height="16" rx="8" />
      <rect className="ohw-soft" x="2" y="6" width="27" height="16" rx="8" />
      <line className="ohw-soft" x1="-21" x2="-10" y1="14" y2="14" />
      <line className="ohw-soft" x1="10" x2="21" y1="14" y2="14" />
      <circle className="ohw-tap" cx="-15.5" cy="14" r="11" />
    </>
  );
}

function WorkScene() {
  return (
    <>
      <path d="M-25 -19l6 5-6 5" />
      {WORK_LINES.map(([x1, x2, y], index) => (
        <line
          key={y}
          className="ohw-write"
          x1={x1}
          x2={x2}
          y1={y}
          y2={y}
          style={{ '--k': index }}
        />
      ))}
      <line className="ohw-caret" x1="12" x2="12" y1="8" y2="16" />
    </>
  );
}

function ReviewScene() {
  return (
    <g transform="translate(-3 -2)">
      <path d="M-15 -24h17l11 11v33h-28z" />
      <path className="ohw-soft" d="M2 -24v11h11" />
      <line className="ohw-soft" x1="-8" x2="3" y1="-5" y2="-5" />
      <line className="ohw-soft" x1="-8" x2="6" y1="3" y2="3" />
      <circle className="ohw-seal" cx="13" cy="19" r="10" />
      <path className="ohw-tick" d="M8.2 19.2l3.4 3.6 6.4-7.4" pathLength="1" />
    </g>
  );
}

// The five stations, in the order of the page's steps: the word on the link, and its scene.
const STATIONS = [
  { label: 'Say', Scene: SayScene },
  { label: 'Plan', Scene: PlanScene },
  { label: 'Ask', Scene: AskScene },
  { label: 'Work', Scene: WorkScene },
  { label: 'Review', Scene: ReviewScene },
];

export function howHeroWords() {
  return Object.fromEntries(
    STATIONS.map((station, index) => [`pg.howhero.station.${index}`, station.label])
  );
}

// Without a real browser (tests) or with reduced motion the journey is simply finished.
function journeyIsStill() {
  if (typeof IntersectionObserver === 'undefined') return true;
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

// Beats come in pairs, one pair per station: on the even beat the light travels to it, on
// the odd one its scene plays. Two more close the loop: the finished journey is held, then
// everything goes dark. `reached` is the station that is awake; `leg` is the stretch of line
// the light last travelled.
function readBeat(beat, count) {
  if (beat === count * 2) return { phase: 'hold', reached: count, leg: count - 1, ms: HOLD_MS };
  if (beat > count * 2) return { phase: 'reset', reached: -1, leg: count - 1, ms: RESET_MS };
  return {
    phase: 'run',
    reached: Math.ceil(beat / 2) - 1,
    leg: Math.floor(beat / 2),
    ms: beat % 2 === 0 ? TRAVEL_MS : PLAY_MS,
  };
}

function stationState(index, reached) {
  if (index > reached) return 'idle';
  return index === reached ? 'now' : 'done';
}

// A plain click glides to the step and takes the keyboard with it. Anything else (a new
// tab, reduced motion, no script) is left to the link itself, which jumps there.
function glideToStep(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  const { hash } = event.currentTarget;
  const step = document.getElementById(hash.slice(1));
  if (!step?.scrollIntoView || journeyIsStill()) return;
  event.preventDefault();
  step.scrollIntoView({ behavior: 'smooth', block: 'start' });
  step.focus({ preventScroll: true });
  window.history.pushState(null, '', hash);
}

/** A faint slice of the line-orb behind the journey. One dashed circle per ring of lines. */
function Backdrop() {
  return (
    <svg className="ohw-ring" viewBox="-300 -300 600 600" aria-hidden="true" focusable="false">
      <circle className="ohw-ring-inner" r="236" strokeWidth="44" pathLength="1200" />
      <circle className="ohw-ring-outer" r="279" strokeWidth="42" pathLength="1200" />
    </svg>
  );
}

function Track({ name, track, leg, still }) {
  const id = `ohw-${name}-${useId().replace(/\W/g, '')}`;
  const from = leg === 0 ? 0 : track.stops[leg - 1];
  const to = track.stops[leg];
  const fade = {
    gradientUnits: 'userSpaceOnUse',
    x1: track.start[0],
    y1: track.start[1],
    x2: track.fadeEnd[0],
    y2: track.fadeEnd[1],
  };

  return (
    <svg
      className={`ohw-track ohw-track-${name}`}
      viewBox={`0 0 ${track.width} ${track.height}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-rail`} {...fade}>
          <stop className="ohw-rail-from" offset="0" />
          <stop className="ohw-rail-to" offset="1" />
        </linearGradient>
        <linearGradient id={`${id}-lit`} {...fade}>
          <stop className="ohw-lit-from" offset="0" />
          <stop className="ohw-lit-to" offset="1" />
        </linearGradient>
      </defs>
      <path className="ohw-rail" d={track.d} pathLength="100" stroke={`url(#${id}-rail)`} />
      {/* Keyed by leg: a new leg is a new element, so its animation starts from the top. */}
      <g key={leg} className="ohw-run">
        {['ohw-lit ohw-lit-glow', 'ohw-lit'].map((className) => (
          <path
            key={className}
            className={className}
            d={track.d}
            pathLength="100"
            stroke={`url(#${id}-lit)`}
            style={{ '--from': 100 - from, '--to': 100 - to }}
          />
        ))}
        {!still && (
          <g className="ohw-pulse">
            {PULSE_PARTS.map((part) => {
              const length = track.pulse * part.span;
              const behind = length * (1 - part.lead);
              return (
                <path
                  key={part.name}
                  className={`ohw-pulse-${part.name}`}
                  d={track.d}
                  pathLength="100"
                  strokeDasharray={`${length.toFixed(2)} 300`}
                  style={{ '--from': behind - from, '--to': behind - to }}
                />
              );
            })}
          </g>
        )}
      </g>
    </svg>
  );
}

// A short ring of lines with every other one running on: the line-orb, at station size.
function OrbLines({ lit = false }) {
  return (
    <g className={lit ? 'ohw-lines ohw-lines-lit' : 'ohw-lines'}>
      <circle r="53" strokeWidth="8" pathLength="288" />
      <circle className="ohw-lines-long" r="59.5" strokeWidth="5" pathLength="288" />
    </g>
  );
}

function Station({ step, index, total, state }) {
  const { t } = useT('pg');
  const { Scene } = STATIONS[index];
  const label = t(`pg.howhero.station.${index}`, STATIONS[index].label);
  return (
    <li className="ohw-station" data-state={state} style={stationPlace(index)}>
      <a
        className="ohw-link"
        href={`#${stepAnchor(step.number)}`}
        aria-label={t('pg.howhero.link', '{label}. Step {n} of {total}: {title}', {
          label,
          n: index + 1,
          total,
          title: step.title,
        })}
        onClick={glideToStep}
      >
        <span className="ohw-orb">
          <i className="ohw-aura" />
          <i className="ohw-disc" />
          <svg className="ohw-art" viewBox="-64 -64 128 128" aria-hidden="true" focusable="false">
            <OrbLines />
            <OrbLines lit />
            <g className="ohw-scene" transform="scale(1.14)">
              <Scene />
            </g>
          </svg>
        </span>
        <span className="ohw-label">
          <span className="ohw-num">
            {step.number}
            <CheckGlyph className="ohw-done" />
          </span>
          <span className="ohw-name">{label}</span>
        </span>
      </a>
    </li>
  );
}

function Journey({ steps }) {
  const { t } = useT('pg');
  const [still] = useState(journeyIsStill);
  const [beat, setBeat] = useState(still ? steps.length * 2 : 0);
  const { phase, reached, leg, ms } = readBeat(beat, steps.length);

  return (
    <Seen
      as="nav"
      className="ohw-stage"
      dir="ltr"
      aria-label={t('pg.howhero.nav', 'The five steps')}
      data-still={still}
      data-phase={phase}
      style={{ '--ohw-travel': `${TRAVEL_MS}ms` }}
    >
      <Backdrop />
      <div className="ohw-field">
        {Object.entries(TRACKS).map(([name, track]) => (
          <Track key={name} name={name} track={track} leg={leg} still={still} />
        ))}
        <ol className="ohw-stations">
          {steps.map((step, index) => (
            <Station
              key={step.number}
              step={step}
              index={index}
              total={steps.length}
              state={stationState(index, reached)}
            />
          ))}
        </ol>
      </div>
      {/*
       * The only clock is a CSS animation: each beat is a fresh element, and its end starts
       * the next one. So the loop pauses with the block and can never drift from the light.
       */}
      {!still && (
        <i
          key={beat}
          className="ohw-clock"
          style={{ '--ohw-beat': `${ms}ms` }}
          onAnimationEnd={() => setBeat((current) => (current + 1) % (steps.length * 2 + 2))}
          aria-hidden="true"
        />
      )}
    </Seen>
  );
}

/**
 * The opening of "How it works": the whole journey in one glance, and the way into it.
 * `steps` are the page's own steps ({ number, title }); every station links to one.
 */
export default function HowHero({ id, tag, title, line, steps }) {
  return (
    <HeroFrame id={id} tag={tag} title={title} line={line} visual={<Journey steps={steps} />} />
  );
}
