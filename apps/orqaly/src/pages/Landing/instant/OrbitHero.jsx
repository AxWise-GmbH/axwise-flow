import { useEffect, useRef, useState } from 'react';
import LineOrb from '../../../components/Common/LineOrb';
import { DesktopDownloadButton, DesktopReleaseDetails } from '../simple/DesktopDownload';
import More from './ui/More';
import HeroPulse from './HeroPulse';
import './OrbitHero.css';
import { ORB_ACCENT } from './palette';

const ORB_SIZES = [
  ['(min-width: 1200px)', 1040],
  ['(min-width: 700px)', 820],
];
const ORB_SIZE_PHONE = 540;
// The orb is the costliest thing on the page: thousands of strokes on a canvas a
// thousand pixels wide, every frame. It is a soft glow, so it is drawn smaller and
// zoomed up in CSS - a fraction of the pixels, the same size on screen.
const ORB_RENDER_SCALE = 0.6;
// LineOrb is a fixed-size square; this hangs it by its centre from a zero-size anchor.
const ORB_CENTRED_SX = {
  position: 'absolute',
  top: 0,
  left: 0,
  transform: 'translate(-50%, -50%)',
};

// One line-art icon per label, so the pill reads at a glance without its sentence.
const LABEL_ICONS = {
  ready: <path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12l1-7.5Z" />,
  orchestration: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="18" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M12 7.2v4.3M12 11.5 6.2 16M12 11.5l5.8 4.5" />
    </>
  ),
  layering: <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Zm-9 9 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />,
  llms: (
    <>
      <circle cx="8.5" cy="9" r="5" />
      <circle cx="15.5" cy="9" r="5" />
      <circle cx="12" cy="15" r="5" />
    </>
  ),
  plugins: <path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0V8ZM12 18v3" />,
  voice: (
    <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  ),
  build: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12v9M12 12 4 7.5" />,
};

// The owner's seven, in the owner's order. `key` names the part of the scene that lights
// up (data-region in HeroPulse) and the label's station in OrbitHero.css.
const LABELS = [
  {
    key: 'ready',
    tag: 'Ready to use',
    line: 'sign in and start, nothing to set up',
    tier: 'big',
    status: 'Ready to use highlighted: the message box, where you type or say what you need.',
  },
  {
    key: 'orchestration',
    tag: 'Orchestration',
    line: 'several AI agents, one plan',
    tier: 'big',
    status: 'Orchestration highlighted: three AI agents in a row, Research, Plan and Build.',
  },
  {
    key: 'layering',
    tag: 'Cognitive layer',
    line: 'cloud thinking, local doing, step by step',
    tier: 'big',
    status: 'Cognitive layer highlighted: thinks in the cloud, works on your Mac.',
  },
  {
    key: 'llms',
    tag: 'Multi LLMs',
    line: 'Gemini, OpenAI or Anthropic, your choice',
    tier: 'small',
    status: 'Multi LLMs highlighted: the model chooser under the message box.',
  },
  {
    key: 'plugins',
    tag: 'Plug-in library',
    line: '50+ connectors, switched on one by one',
    tier: 'small',
    status: 'Plug-in library highlighted: the plug-ins chip under the message box.',
  },
  {
    key: 'voice',
    tag: 'Voice control',
    line: 'talk instead of typing',
    tier: 'small',
    status: 'Voice control highlighted: the microphone in the message box.',
  },
  {
    key: 'build',
    tag: 'Build anything',
    line: 'documents, web pages and tools, made for you',
    tier: 'big',
    status: 'Build anything highlighted: the finished files, from a business plan to a web page.',
  },
];

const STATUS = Object.fromEntries(LABELS.map(({ key, status }) => [key, status]));

function matches(query) {
  return globalThis.window?.matchMedia?.(query)?.matches ?? false;
}

function pickOrbSize() {
  return ORB_SIZES.find(([query]) => matches(query))?.[1] ?? ORB_SIZE_PHONE;
}

// The orb is a canvas with a pixel size, so it follows the layout's breakpoints
// instead of stretching: a phone must not paint a desktop-sized backing store.
function useOrbSize() {
  const [size, setSize] = useState(pickOrbSize);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const lists = ORB_SIZES.map(([query]) => window.matchMedia(query));
    const update = () => setSize(pickOrbSize());
    lists.forEach((list) => list.addEventListener('change', update));
    return () => lists.forEach((list) => list.removeEventListener('change', update));
  }, []);

  return size;
}

/**
 * The scene leans toward the mouse. Only two custom properties are written, at most
 * once per frame; CSS turns them into transforms and eases between the values, so
 * there is no animation loop to keep alive.
 */
function useSceneTilt(stageRef) {
  const frame = useRef(0);
  const point = useRef(null);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const apply = () => {
    frame.current = 0;
    const stage = stageRef.current;
    if (!stage) return;
    const at = point.current;
    if (!at) {
      stage.style.removeProperty('--oh-px');
      stage.style.removeProperty('--oh-py');
      return;
    }
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    stage.style.setProperty('--oh-px', clamp(((at.x - box.left) / box.width) * 2 - 1).toFixed(3));
    stage.style.setProperty('--oh-py', clamp(((at.y - box.top) / box.height) * 2 - 1).toFixed(3));
  };

  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(apply);
  };

  return {
    onPointerMove: (event) => {
      // A finger has no resting position to lean toward, and reduced motion means still.
      if (event.pointerType !== 'mouse' || matches('(prefers-reduced-motion: reduce)')) return;
      point.current = { x: event.clientX, y: event.clientY };
      schedule();
    },
    onPointerLeave: () => {
      if (!point.current) return;
      point.current = null;
      schedule();
    },
  };
}

function HeadlinePart({ line, children }) {
  return (
    <span className="oh-mask">
      <span className="oh-rise" style={{ '--oh-line': line }}>
        {children}
      </span>
    </span>
  );
}

export default function OrbitHero() {
  const [sticky, setSticky] = useState(null);
  const [preview, setPreview] = useState(null);
  const [offscreen, setOffscreen] = useState(false);
  const [heroOffscreen, setHeroOffscreen] = useState(false);
  const heroRef = useRef(null);
  const stageRef = useRef(null);
  const pointerFocus = useRef(false);
  const orbSize = useOrbSize();
  const tilt = useSceneTilt(stageRef);
  const active = preview ?? sticky;
  const hasActive = active !== null;

  // Safari does not focus a button on click, so Escape is heard on the document,
  // and only while something is lit.
  useEffect(() => {
    if (!hasActive) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setSticky(null);
      setPreview(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasActive]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // The title's travelling light and the button's sheen live outside the stage; they rest
  // once the whole hero has scrolled away (see perf.css).
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setHeroOffscreen(!entry.isIntersecting));
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const endPreview = (key) => setPreview((current) => (current === key ? null : current));

  return (
    <section
      ref={heroRef}
      className="oh-hero"
      aria-labelledby="instant-hero-heading"
      data-offscreen={heroOffscreen ? '' : undefined}
    >
      <div className="oi-container">
        <div className="oh-grid">
          <div className="oh-text">
            {/* Each word group is its own mask, so every line rises by itself however
                the headline wraps. The text itself is unchanged. */}
            <h1 id="instant-hero-heading" className="oh-title">
              <HeadlinePart line={0}>Instant</HeadlinePart>{' '}
              <HeadlinePart line={1}>Intelligence.</HeadlinePart>
              <span className="oh-accent">
                <HeadlinePart line={2}>On your Apple</HeadlinePart>{' '}
                <HeadlinePart line={3}>computers.</HeadlinePart>
              </span>
            </h1>
            <p className="oh-lead">
              Say what you need. AI agents research, plan and make the real files, right on your
              Mac.
            </p>
            <div className="oh-more">
              <More id="instant-hero-more">
                <p>
                  The AI thinks in the cloud and does the work on your Mac. Tell it what you need in
                  plain words: it researches, plans and makes the real files, from a business plan
                  to web pages. Every step and file sits beside the chat for you to check. No
                  coding, nothing else to install.
                </p>
                <DesktopReleaseDetails id="instant-hero-release" />
              </More>
            </div>
            <div className="oh-lines">
              <p className="oi-line">For founders and small teams.</p>
              <p className="oi-line">Free during the early version.</p>
            </div>
            {/* Described by the release facts inside the closed More: hidden, not dropped. */}
            <div className="oh-cta">
              <DesktopDownloadButton descriptionId="instant-hero-release" />
            </div>
          </div>

          <div
            ref={stageRef}
            className="oh-stage"
            data-active={active ?? undefined}
            data-offscreen={offscreen ? '' : undefined}
            {...tilt}
          >
            <div className="oh-scene">
              <div className="oh-orb" data-orb aria-hidden="true">
                <i className="oh-bloom" />
                <div className="oh-orb-lines" style={{ '--oh-orb-zoom': 1 / ORB_RENDER_SCALE }}>
                  <LineOrb
                    size={Math.round(orbSize * ORB_RENDER_SCALE)}
                    accent={ORB_ACCENT}
                    hollow={0.64}
                    speed={0.7}
                    title="Orqanix line-orb"
                    sx={ORB_CENTRED_SX}
                  />
                </div>
              </div>

              <div className="oh-window">
                <div className="oh-window-float">
                  <div className="oh-window-tilt">
                    <HeroPulse paused={offscreen} />
                    <span className="oh-glare" aria-hidden="true">
                      <i />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <ul className="oh-labels" aria-label="What you are looking at">
              {LABELS.map(({ key, tag, line, tier }, index) => (
                <li key={key} data-key={key} style={{ '--oh-i': index }}>
                  <button
                    type="button"
                    className="oh-label"
                    data-tier={tier}
                    data-current={active === key ? '' : undefined}
                    aria-pressed={sticky === key}
                    onPointerEnter={(event) => {
                      // A touch also fires pointerenter; only a mouse can "point at" a label.
                      if (event.pointerType === 'mouse') setPreview(key);
                    }}
                    onPointerLeave={() => endPreview(key)}
                    onPointerDown={() => {
                      pointerFocus.current = true;
                    }}
                    onFocus={() => {
                      // Focus that comes from a press must not preview, or the light would
                      // stay on after a second click releases the label.
                      if (!pointerFocus.current) setPreview(key);
                    }}
                    onBlur={() => {
                      pointerFocus.current = false;
                      endPreview(key);
                    }}
                    onClick={() => {
                      pointerFocus.current = false;
                      setSticky((current) => (current === key ? null : key));
                    }}
                  >
                    <span className="oh-label-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        {LABEL_ICONS[key]}
                      </svg>
                    </span>
                    <span className="oi-tag oh-label-tag">{tag}</span>
                    <span className="oh-label-line">{line}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="oi-sr-only" role="status">
              {hasActive ? STATUS[active] : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="oh-cue" aria-hidden="true">
        <i />
      </div>
    </section>
  );
}
