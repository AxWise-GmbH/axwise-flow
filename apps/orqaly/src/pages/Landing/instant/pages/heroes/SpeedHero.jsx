import { memo, useCallback, useEffect, useRef, useState } from 'react';
import HeroFrame from './HeroFrame';
import './SpeedHero.css';

// One lap of the face is 90 seconds, the same scale as the race tracks further down, so the
// longest run nearly closes the ring and the shortest barely leaves the top.
const FACE_SECONDS = 90;
const NUMERALS = [0, 30, 60];

// The drawing is laid out on a 640 unit square; every radius below is in those units.
const SIZE = 640;
const CENTRE = SIZE / 2;
// Shortest run on the inside lane, longest on the outside.
const LANES = [224, 236, 248];
const RADIUS = { hub: 210, index: 190, numeral: 307, hand: [210, 298], trail: 275 };
// Degrees of fine line left out around each numeral.
const NUMERAL_GAP = 6;
const COMET_DEGREES = 26;
const TRAIL_DEGREES = 34;

// The sweep replays the three stopwatch readings in a few seconds; it is not real time.
const SWEEP_MS = 2600;
// The face arrives first, then the hand goes.
const SWEEP_DELAY_MS = 500;
// A tab that was in the background comes back with one huge frame; never jump the hand by it.
const LONGEST_FRAME_MS = 64;

const UNIT = ' s';

function angleOf(seconds) {
  return (seconds / FACE_SECONDS) * 360;
}

/** A point on the face; degrees run clockwise from twelve o'clock. */
function point(radius, degrees) {
  const turn = (degrees * Math.PI) / 180;
  return [CENTRE + radius * Math.sin(turn), CENTRE - radius * Math.cos(turn)];
}

function arc(radius, from, to) {
  const [x0, y0] = point(radius, from);
  const [x1, y1] = point(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** A full ring that starts at twelve o'clock, so a dash pattern on it counts degrees from zero. */
function ring(radius) {
  const top = `${CENTRE} ${CENTRE - radius}`;
  const bottom = `${CENTRE} ${CENTRE + radius}`;
  return `M${top}A${radius} ${radius} 0 1 1 ${bottom}A${radius} ${radius} 0 1 1 ${top}`;
}

/** Where a point of the drawing sits on the HTML box above it, as CSS percentages. */
function place(radius, degrees) {
  const [x, y] = point(radius, degrees);
  return { '--x': `${((x / SIZE) * 100).toFixed(3)}%`, '--y': `${((y / SIZE) * 100).toFixed(3)}%` };
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function sweepIsStill() {
  if (typeof requestAnimationFrame !== 'function') return true;
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/**
 * Follows the viewport. Seen (SpeedStrip.jsx) keeps this to itself as data-live; the sweep is
 * driven from script, so it needs the value as well to rest while the block is off screen.
 */
function useOnScreen() {
  const ref = useRef(null);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return [ref, onScreen];
}

/**
 * The seconds the hand points at, from zero up to `total`. One clock drives the hand, the
 * arcs and the digits, so they cannot drift apart. With motion switched off it starts and
 * stays at `total`: the finished reading, and no frame is ever requested.
 */
function useSweep(total, onScreen) {
  const [still] = useState(sweepIsStill);
  const [seconds, setSeconds] = useState(still ? total : 0);
  const [run, setRun] = useState(0);
  const clock = useRef({ run: 0, ms: 0 });

  useEffect(() => {
    if (still || !onScreen) return undefined;
    const state = clock.current;
    if (state.run !== run) {
      state.run = run;
      state.ms = 0;
    }
    if (state.ms >= SWEEP_DELAY_MS + SWEEP_MS) return undefined;

    let frame = 0;
    let last = 0;
    const tick = (now) => {
      if (last) state.ms += Math.min(now - last, LONGEST_FRAME_MS);
      last = now;
      const t = Math.min(1, Math.max(0, (state.ms - SWEEP_DELAY_MS) / SWEEP_MS));
      setSeconds(total * easeInOut(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [still, onScreen, run, total]);

  const replay = useCallback(() => {
    setSeconds(0);
    setRun((n) => n + 1);
  }, []);

  return { seconds, still, replay };
}

function ArrowDownGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="ohs-arrow" aria-hidden="true" focusable="false">
      <path d="M8 2.5v11M4 9.5l4 4 4-4" />
    </svg>
  );
}

function ReplayGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="ohs-replay-glyph" aria-hidden="true" focusable="false">
      <path d="M13.2 8.4a5.2 5.2 0 1 1-1.6-4.2" />
      <path d="M13.5 1.8v2.9h-2.9" />
    </svg>
  );
}

/** The still part of the dial. It never changes, so the sweep never re-renders it. */
const Face = memo(function Face() {
  const step = 360 / NUMERALS.length;
  return (
    <svg className="ohs-face" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient
          id="ohs-corona-fade"
          gradientUnits="userSpaceOnUse"
          cx={CENTRE}
          cy={CENTRE}
          r={CENTRE}
        >
          <stop offset="0.9" className="ohs-stop-pale" />
          <stop offset="1" className="ohs-stop-clear" />
        </radialGradient>
      </defs>
      {/* The line-orb's ring of fine lines, one per degree, fading outwards. */}
      {NUMERALS.map((numeral, i) => {
        const from = i * step + NUMERAL_GAP;
        const to = (i + 1) * step - NUMERAL_GAP;
        return (
          <path
            key={numeral}
            className="ohs-corona"
            d={arc(RADIUS.numeral, from, to)}
            pathLength={to - from}
            stroke="url(#ohs-corona-fade)"
          />
        );
      })}
      {/* pathLength 360 turns the dash pattern into degrees: 4 degrees is one second. */}
      <path className="ohs-tick ohs-tick-half" d={ring(286)} pathLength="360" />
      <path className="ohs-tick ohs-tick-second" d={ring(281)} pathLength="360" />
      <path className="ohs-tick ohs-tick-major" d={ring(275)} pathLength="360" />
      {LANES.map((radius) => (
        <circle key={radius} className="ohs-guide" cx={CENTRE} cy={CENTRE} r={radius} />
      ))}
      <circle className="ohs-guide ohs-hub" cx={CENTRE} cy={CENTRE} r={RADIUS.hub} />
    </svg>
  );
});

/** One run on its lane: the arc from zero, the light at its head and the marker it leaves. */
function Lane({ run, radius, seconds, quiet }) {
  const at = Math.min(seconds, run.seconds);
  const end = angleOf(run.seconds);
  const head = angleOf(at);
  const [mx, my] = point(radius, end);
  const [lx, ly] = point(RADIUS.hub, end);

  return (
    <g className="ohs-lane" data-locked={at >= run.seconds} data-quiet={quiet}>
      <path
        className="ohs-arc"
        d={arc(radius, 0, end)}
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={1 - at / run.seconds}
      />
      <g transform={`rotate(${head.toFixed(3)} ${CENTRE} ${CENTRE})`}>
        {/* The offset keeps the light from reaching back past twelve o'clock. */}
        <path
          className="ohs-comet"
          d={arc(radius, -COMET_DEGREES, 0)}
          pathLength={COMET_DEGREES}
          strokeDasharray={COMET_DEGREES}
          strokeDashoffset={Math.min(COMET_DEGREES, head) - COMET_DEGREES}
          stroke="url(#ohs-comet-light)"
        />
      </g>
      <g className="ohs-marker">
        <path
          className="ohs-leader"
          d={`M${mx.toFixed(2)} ${my.toFixed(2)}L${lx.toFixed(2)} ${ly.toFixed(2)}`}
        />
        <circle className="ohs-ping" cx={mx} cy={my} r="9" />
        <circle className="ohs-marker-ring" cx={mx} cy={my} r="9" />
        <circle className="ohs-marker-dot" cx={mx} cy={my} r="4" />
      </g>
    </g>
  );
}

/** Everything the clock moves: three lanes and the hand of light. */
function Sweep({ runs, seconds, total, active }) {
  const [cometX, cometY] = point(LANES[1], -COMET_DEGREES);
  const [trailX, trailY] = point(RADIUS.trail, -TRAIL_DEGREES);
  const [handFrom, handTo] = RADIUS.hand;

  return (
    <svg
      className="ohs-sweep"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      data-moving={seconds > 0 && seconds < total}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Both lights fade along the chord from their tail to the head at twelve o'clock. */}
        <linearGradient
          id="ohs-comet-light"
          gradientUnits="userSpaceOnUse"
          x1={cometX}
          y1={cometY}
          x2={CENTRE}
          y2={CENTRE - LANES[1]}
        >
          <stop offset="0" className="ohs-stop-clear" />
          <stop offset="1" className="ohs-stop-ink" />
        </linearGradient>
        <linearGradient
          id="ohs-trail-light"
          gradientUnits="userSpaceOnUse"
          x1={trailX}
          y1={trailY}
          x2={CENTRE}
          y2={CENTRE - RADIUS.trail}
        >
          <stop offset="0" className="ohs-stop-clear" />
          <stop offset="1" className="ohs-stop-light" />
        </linearGradient>
      </defs>
      {runs.map((run, i) => (
        <Lane
          key={run.id}
          run={run}
          radius={LANES[i]}
          seconds={seconds}
          quiet={active !== null && active !== run.id}
        />
      ))}
      <g
        className="ohs-hand"
        transform={`rotate(${angleOf(seconds).toFixed(3)} ${CENTRE} ${CENTRE})`}
      >
        <path
          className="ohs-hand-trail"
          d={arc(RADIUS.trail, -TRAIL_DEGREES, 0)}
          stroke="url(#ohs-trail-light)"
        />
        <path className="ohs-hand-glow" d={`M${CENTRE} ${CENTRE - handFrom}V${CENTRE - handTo}`} />
        <path className="ohs-hand-line" d={`M${CENTRE} ${CENTRE - handFrom}V${CENTRE - handTo}`} />
      </g>
    </svg>
  );
}

function Readout({ run, position, seconds, onHover, onFocus }) {
  const at = Math.min(seconds, run.seconds);

  return (
    <li style={{ '--i': position }}>
      {/* A click keeps the focus on the link; letting go of it here means the dial is not
          still holding one lane lit when the visitor scrolls back up. */}
      <a
        className="ohs-row"
        href={run.href}
        data-locked={at >= run.seconds}
        onPointerEnter={() => onHover(run.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onFocus(run.id)}
        onBlur={() => onFocus(null)}
        onClick={() => onFocus(null)}
      >
        <span className="ohs-idx" aria-hidden="true">
          {String(position + 1).padStart(2, '0')}
        </span>
        <span className="ohs-value">
          {/* Readers get the measured figure once; only the visible digits count. */}
          <span className="oi-sr-only">
            {run.seconds.toFixed(2)}
            {UNIT}
          </span>
          <span aria-hidden="true">
            {at.toFixed(2)}
            <span className="ohs-unit">{UNIT}</span>
          </span>
        </span>
        <span className="ohs-label">{run.label}</span>
        <ArrowDownGlyph />
      </a>
    </li>
  );
}

function Instrument({ runs }) {
  const total = Math.max(...runs.map((run) => run.seconds));
  const [ref, onScreen] = useOnScreen();
  const { seconds, still, replay } = useSweep(total, onScreen);
  // The readout under the pointer, or else the one with the keyboard, lights its lane.
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);
  const active = hovered ?? focused;

  return (
    // data-live is the landing's contract for resting loops off screen (perf.css).
    <div ref={ref} className="ohs" data-live={onScreen}>
      <div className="ohs-dial">
        <Face />
        <Sweep runs={runs} seconds={seconds} total={total} active={active} />
        <div className="ohs-marks" aria-hidden="true">
          {NUMERALS.map((numeral) => (
            <span
              key={numeral}
              className="ohs-numeral"
              style={place(RADIUS.numeral, angleOf(numeral))}
            >
              {numeral}
            </span>
          ))}
          {runs.map((run, i) => (
            <span
              key={run.id}
              className="ohs-halo"
              data-locked={seconds >= run.seconds}
              data-lit={active === run.id}
              style={{ ...place(LANES[i], angleOf(run.seconds)), '--i': i }}
            />
          ))}
          {runs.map((run, i) => (
            <span
              key={run.id}
              className="ohs-index"
              data-locked={seconds >= run.seconds}
              data-lit={active === run.id}
              style={place(RADIUS.index, angleOf(run.seconds))}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
          ))}
        </div>
        <ul className="ohs-plate" role="list" aria-label="How these were measured">
          <li>Single runs</li>
          <li>18 Sep 2026</li>
          <li>Orqanix cloud</li>
        </ul>
      </div>
      <div className="ohs-side">
        <ol className="ohs-readouts" role="list" aria-label="Measured timings">
          {runs.map((run, i) => (
            <Readout
              key={run.id}
              run={run}
              position={i}
              seconds={seconds}
              onHover={setHovered}
              onFocus={setFocused}
            />
          ))}
        </ol>
        {/* With motion switched off there is no sweep, so there is nothing to replay. */}
        {!still && (
          <div className="ohs-controls">
            <span className="ohs-note">Sweep sped up</span>
            <button type="button" className="ohs-replay" onClick={replay}>
              <ReplayGlyph />
              <span>
                Replay<span className="oi-sr-only"> the dial</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The Speed page's opening: a stopwatch face that replays the three measured runs once, then
 * rests on the finished reading. Each readout links down to what that run made.
 *
 * `runs` is `{ id, seconds, label, href }`, shortest first; the page owns the ids it links to.
 */
export default function SpeedHero({ runs, methodHref }) {
  return (
    <HeroFrame
      id="speed-page-heading"
      tag="Speed"
      title="Measured, not promised."
      line="Three real timings from the Orqanix cloud, with the date and the limits next to them."
      className="ohs-hero"
      visual={<Instrument runs={runs} />}
    >
      <a className="ohs-method" href={methodHref}>
        <span>How we measured</span>
        <ArrowDownGlyph />
      </a>
    </HeroFrame>
  );
}
