import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import LineOrb from '../../../components/Common/LineOrb';
import Reveal from './ui/Reveal';
import { Seen } from './SpeedStrip';
import { ORB_ACCENT } from './palette';
import {
  AnthropicMark,
  FigmaMark,
  GeminiMark,
  GitHubMark,
  OpenAIMark,
  SupabaseMark,
} from './brandMarks';
import './IntegrationsHub.css';

const HEADING_ID = 'integrations-heading';
const MODELS_ID = 'integrations-models';
const TOOLS_ID = 'integrations-tools';

// Six equal cards. Each shows its product's own mark (see brandMarks.jsx).
const MODELS = [
  { key: 'gemini', name: 'Gemini', type: 'LLM', Mark: GeminiMark },
  { key: 'openai', name: 'OpenAI', type: 'LLM', Mark: OpenAIMark },
  { key: 'anthropic', name: 'Anthropic', type: 'LLM', Mark: AnthropicMark },
];

const TOOLS = [
  { key: 'github', name: 'GitHub', type: 'Tool', Mark: GitHubMark },
  { key: 'figma', name: 'Figma', type: 'Tool', Mark: FigmaMark },
  { key: 'supabase', name: 'Supabase', type: 'Tool', Mark: SupabaseMark },
];

const ITEMS = [...MODELS, ...TOOLS];

const CONNECTORS = [
  'Playwright',
  'Chrome DevTools',
  'Asana',
  'Netlify',
  'Neon',
  'MongoDB',
  'Square',
  'Tavily Web Search',
  'Exa Search',
  'PDF Reader',
  'YouTube Transcript',
  'Excalidraw',
  'Context7',
  'Repomix',
  'Fetch',
];

// How long a tapped card keeps its line lit where there is no hover to end it.
const TAP_HOLD = 2600;

/* Geometry ---------------------------------------------------------------------- */

// The light is a dash of a real length in pixels, so it looks the same on a short wire
// and on the long phone spine. CSS reads the numbers below from custom properties.
const TAIL = 58;
const PULSE = 120;
const SPINE_X = 7;
const CORNER = 16;
// The wires plug straight into the orb: its strokes reach about 0.4 of its box, and the
// wires end just inside that edge, where the light is.
const RING_RATIO = 0.37;
// Length of a rounded corner drawn as a quadratic with both arms equal to 1.
const CORNER_LENGTH = 1.6232;

const round = (value) => Math.round(value * 10) / 10;

function cubicLength(p0, p1, p2, p3) {
  let length = 0;
  let last = p0;
  for (let step = 1; step <= 24; step += 1) {
    const t = step / 24;
    const u = 1 - t;
    const point = [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
    length += Math.hypot(point[0] - last[0], point[1] - last[1]);
    last = point;
  }
  return length;
}

// Desktop: a smooth curve from the card's inner edge to a point on the ring round the orb.
function sideWire(card, side, slot, ring) {
  const dir = side === 'left' ? 1 : -1;
  const x1 = side === 'left' ? card.left + card.width : card.left;
  const y1 = card.top + card.height / 2;
  const run = Math.abs(ring.cx - dir * ring.r - x1);
  // With little room the outer wires land further round the ring, so they never kink.
  const spread = 20 + (Math.max(0, 150 - Math.max(50, run)) / 100) * 22;
  const theta = ((slot - 1) * spread * Math.PI) / 180;
  const ux = -dir * Math.cos(theta);
  const uy = Math.sin(theta);
  const ex = ring.cx + ux * ring.r;
  const ey = ring.cy + uy * ring.r;
  const span = Math.abs(ex - x1);
  const c1 = [x1 + dir * span * 0.5, y1];
  const c2 = [ex + ux * span * 0.55, ey + uy * span * 0.55];
  return {
    d: `M${round(x1)} ${round(y1)}C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(ex)} ${round(ey)}`,
    length: cubicLength([x1, y1], c1, c2, [ex, ey]),
    dock: [round(ex), round(ey)],
  };
}

// Phone: every card plugs into one spine down the left edge, which turns into the orb.
function spineWire(card, ring) {
  const x1 = card.left;
  const y1 = card.top + card.height / 2;
  const ex = ring.cx - ring.r;
  const ey = ring.cy;
  const c = Math.max(4, Math.min(CORNER, x1 - SPINE_X - 2));
  const d =
    `M${round(x1)} ${round(y1)}H${SPINE_X + c}Q${SPINE_X} ${round(y1)} ${SPINE_X} ${round(y1 - c)}` +
    `V${round(ey + c)}Q${SPINE_X} ${round(ey)} ${SPINE_X + c} ${round(ey)}H${round(ex)}`;
  const length =
    x1 - SPINE_X - c + (y1 - c - (ey + c)) + (ex - SPINE_X - c) + 2 * CORNER_LENGTH * c;
  return { d, length: Math.max(length, 1), dock: [round(ex), round(ey)] };
}

function rectWithin(node, root) {
  let left = 0;
  let top = 0;
  let step = node;
  while (step && step !== root) {
    left += step.offsetLeft;
    top += step.offsetTop;
    step = step.offsetParent;
  }
  return { left, top, width: node.offsetWidth, height: node.offsetHeight };
}

function nominalCard(side, slot) {
  return { left: side === 'left' ? 0 : 862, top: 42 + slot * 108, width: 330, height: 84 };
}

function buildGeometry({ width, height, stacked, orb, ring, cards }) {
  const wires = {};
  for (const [side, items] of [
    ['left', MODELS],
    ['right', TOOLS],
  ]) {
    items.forEach((item, slot) => {
      const card = cards[item.key];
      wires[item.key] = stacked ? spineWire(card, ring) : sideWire(card, side, slot, ring);
    });
  }
  return { width, height, stacked, orb, ring, wires };
}

// What is drawn before the first measurement, and in tests where nothing has a size.
const NOMINAL = buildGeometry({
  width: 1192,
  height: 342,
  stacked: false,
  orb: 230,
  ring: { cx: 596, cy: 192, r: 230 * RING_RATIO },
  cards: Object.fromEntries(
    [
      ['left', MODELS],
      ['right', TOOLS],
    ].flatMap(([side, items]) => items.map((item, slot) => [item.key, nominalCard(side, slot)]))
  ),
});

function measure(hub, core) {
  const width = hub.offsetWidth;
  const height = hub.offsetHeight;
  if (!width || !height) return null;
  const coreBox = rectWithin(core, hub);
  const orb = coreBox.width;
  const ring = {
    cx: coreBox.left + coreBox.width / 2,
    cy: coreBox.top + coreBox.height / 2,
    r: round(orb * RING_RATIO),
  };
  const cards = {};
  for (const node of hub.querySelectorAll('[data-wire]')) {
    cards[node.dataset.wire] = rectWithin(node, hub);
  }
  if (Object.keys(cards).length !== ITEMS.length) return null;
  // Stacked when the tools no longer sit to the right of the orb.
  const stacked = cards[TOOLS[0].key].left < ring.cx;
  return buildGeometry({ width, height, stacked, orb, ring, cards });
}

function sameGeometry(a, b) {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.orb === b.orb &&
    a.stacked === b.stacked &&
    Object.keys(a.wires).every((key) => a.wires[key].d === b.wires[key].d)
  );
}

/* Wires ------------------------------------------------------------------------- */

function Wire({ wire, index, active, beat }) {
  const { d, length, dock } = wire;
  const total = round(length + PULSE + 40);
  return (
    <g
      className="oih-wire"
      data-active={active}
      style={{
        '--i': index,
        '--t0': TAIL,
        '--t1': round(-length),
        '--tm': round(-length * 0.46),
        '--p0': PULSE,
        '--p1': round(-length),
        '--travel': `${Math.round(3600 + length * 5)}ms`,
      }}
    >
      <path className="oih-rail" d={d} pathLength="1" />
      <path className="oih-lit" d={d} />
      <path className="oih-tail-soft" d={d} strokeDasharray={`${TAIL} ${total}`} />
      <path className="oih-tail" d={d} strokeDasharray={`${TAIL} ${total}`} />
      {/* A new key restarts the run, so a tap sends a fresh pulse. */}
      <path key={beat} className="oih-pulse" d={d} strokeDasharray={`${PULSE} ${total}`} />
      <circle className="oih-dock-halo" cx={dock[0]} cy={dock[1]} r="7" />
      <circle className="oih-dock" cx={dock[0]} cy={dock[1]} r="2.5" />
    </g>
  );
}

/* Cards ------------------------------------------------------------------------- */

function HubCard({ item, slot, onActive, onTap }) {
  const { Mark } = item;
  return (
    <li className="oih-slot" style={{ '--d': `${200 + slot * 110}ms` }}>
      <button
        type="button"
        className="oih-card"
        data-wire={item.key}
        onClick={() => onTap(item.key)}
        onFocus={() => onActive(item.key)}
        onBlur={() => onActive(null)}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') onActive(item.key);
        }}
        onPointerLeave={() => onActive(null)}
      >
        <span className="oih-tile">
          <Mark className="oih-mark" />
        </span>
        <span className="oih-text">
          <span className="oih-name">{item.name}</span>{' '}
          <span className="oih-type">{item.type}</span>
        </span>
        <span className="oih-live" />
      </button>
    </li>
  );
}

function HubList({ id, label, area, items, onActive, onTap }) {
  return (
    <>
      <p id={id} className={`oi-tag oih-label oih-label-${area}`}>
        {label}
      </p>
      {/* A gate per list: on a phone they stack, and each arrives as it is reached. */}
      <Seen as="ul" className={`oih-gate oih-list oih-list-${area}`} aria-labelledby={id}>
        {items.map((item, slot) => (
          <HubCard key={item.key} item={item} slot={slot} onActive={onActive} onTap={onTap} />
        ))}
      </Seen>
    </>
  );
}

/* Section ------------------------------------------------------------------------ */

export default function IntegrationsHub() {
  const hubRef = useRef(null);
  const coreRef = useRef(null);
  const releaseRef = useRef(0);
  const [geometry, setGeometry] = useState(NOMINAL);
  const [active, setActive] = useState(null);
  const [beat, setBeat] = useState(0);

  // The wires are drawn in real pixels, so they are laid again whenever the hub changes size.
  useLayoutEffect(() => {
    const hub = hubRef.current;
    const core = coreRef.current;
    if (!hub || !core) return undefined;
    let raf = 0;
    const lay = () => {
      raf = 0;
      const next = measure(hub, core);
      if (next) setGeometry((current) => (sameGeometry(current, next) ? current : next));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(lay);
    };
    lay();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(hub);
    observer?.observe(core);
    // Webfonts can move the cards a little after the first layout.
    document.fonts?.ready?.then(schedule).catch(() => {});
    return () => {
      observer?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // The glass of the card under the pointer answers it: one card, one write per frame.
  useEffect(() => {
    const hub = hubRef.current;
    if (!hub) return undefined;
    let raf = 0;
    let point = null;
    let card = null;
    const paint = () => {
      raf = 0;
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${Math.round(point.x - box.left)}px`);
      card.style.setProperty('--my', `${Math.round(point.y - box.top)}px`);
    };
    const onMove = (event) => {
      if (event.pointerType !== 'mouse') return;
      card = event.target.closest?.('.oih-card') ?? null;
      if (!card) return;
      point = { x: event.clientX, y: event.clientY };
      if (!raf) raf = requestAnimationFrame(paint);
    };
    hub.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      hub.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(releaseRef.current), []);

  const hold = (key) => {
    window.clearTimeout(releaseRef.current);
    setActive(key);
  };

  // A tap or a press sends a fresh pulse. Touch has no hover to end, so the light lets go
  // by itself after a moment.
  const tap = (key) => {
    hold(key);
    setBeat((count) => count + 1);
    if (!window.matchMedia?.('(hover: hover)')?.matches) {
      releaseRef.current = window.setTimeout(() => setActive(null), TAP_HOLD);
    }
  };

  return (
    <Seen
      as="section"
      id="integrations"
      className="oi-section oih-section oih-ruled"
      aria-labelledby={HEADING_ID}
    >
      <div className="oi-container">
        <Seen className="oih-gate oih-head">
          <div className="oih-head-main">
            <Reveal as="p" className="oi-tag oi-tag-bracket">
              Integrations
            </Reveal>
            <Reveal as="h2" id={HEADING_ID} className="oi-h2 oih-h2" delay={90}>
              Plug in any LLM &amp; Tool
            </Reveal>
          </div>
          <Reveal as="p" className="oi-line oih-lead" delay={180}>
            One workspace for everything.
          </Reveal>
        </Seen>

        <Seen className="oih-gate oih-hub-gate" threshold={0.2}>
          <div
            ref={hubRef}
            className="oih-hub"
            data-stacked={geometry.stacked}
            data-swell={active !== null}
          >
            <svg
              className="oih-wires"
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {ITEMS.map((item, index) => (
                <Wire
                  key={item.key}
                  index={index}
                  wire={geometry.wires[item.key]}
                  active={active === item.key}
                  beat={active === item.key ? beat : 0}
                />
              ))}
            </svg>

            <HubList
              id={MODELS_ID}
              label="Models"
              area="models"
              items={MODELS}
              onActive={hold}
              onTap={tap}
            />

            <div ref={coreRef} className="oih-core" data-orb aria-hidden="true">
              <div className="oih-bloom-wrap">
                <div className="oih-bloom" />
              </div>
              <div className="oih-orb">
                <LineOrb size={geometry.orb} accent={ORB_ACCENT} speed={0.7} title="" />
              </div>
            </div>

            <HubList
              id={TOOLS_ID}
              label="Tools"
              area="tools"
              items={TOOLS}
              onActive={hold}
              onTap={tap}
            />
          </div>
        </Seen>

        <Seen className="oih-gate oih-after">
          {/* Focusable so that the keyboard can stop the movement too. */}
          <Reveal className="oih-marquee" role="group" aria-label="Connectors" tabIndex={0}>
            <div className="oih-track">
              <ul className="oih-pills">
                {CONNECTORS.map((name) => (
                  <li key={name} className="oih-pill">
                    {name}
                  </li>
                ))}
              </ul>
              <ul className="oih-pills" aria-hidden="true">
                {CONNECTORS.map((name) => (
                  <li key={name} className="oih-pill">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal as="p" className="oi-small oih-note-line" delay={120}>
            50+ connectors.
          </Reveal>
        </Seen>
      </div>
    </Seen>
  );
}
