import { useEffect, useRef, useState } from 'react';
import { stepAnchor } from './heroes/howHeroTrack';
import PrivacyPreface from '../PrivacyPreface';
import { Seen } from '../SpeedStrip';
import More from '../ui/More';
import Reveal from '../ui/Reveal';
import { CheckGlyph, OrqanixMark } from '../ui/Glyphs';
import './HowItWorksPage.css';

// How far down the window the travelling light rides while the story is being read.
const HEAD_AT = 0.64;
// Stacked, a step's picture sits under its words, so the light rides higher to leave it room.
const HEAD_AT_STACKED = 0.5;
const STACKED_BELOW = 760;
// The share of the remaining distance the light covers each frame: it glides, never snaps.
const HEAD_EASE = 0.14;

const ICON_PATHS = {
  file: 'M4.5 2.5H9l3 3v8H4.5zM9 2.5v3h3',
  mic: 'M8 2.5a1.8 1.8 0 0 0-1.8 1.8v3.4a1.8 1.8 0 0 0 3.6 0V4.3A1.8 1.8 0 0 0 8 2.5zM4.2 7.5a3.8 3.8 0 0 0 7.6 0M8 11.3v2.2',
  terminal: 'M2.5 3.5h11v9h-11zM5 6.6l1.9 1.6L5 9.8M8.4 10h2.6',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  stop: 'M5.5 5.5h5v5h-5z',
};

const ROADMAP = [
  ['done', 'Your idea'],
  ['now', 'Market'],
  ['pending', 'Costs'],
  ['pending', 'Marketing'],
  ['pending', 'Accounts'],
];

const PROGRESS = ['full', 'half', 'empty', 'empty', 'empty'];

// Stand-in text lines for the change preview: what happened to the line, and its width in %.
const DIFF_LINES = [
  ['same', 62],
  ['removed', 78],
  ['added', 86],
  ['added', 54],
  ['same', 70],
];

function Icon({ name }) {
  return (
    <svg viewBox="0 0 16 16" className="hiw-icon" aria-hidden="true" focusable="false">
      <path
        d={ICON_PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Pill({ state, children }) {
  return (
    <span className="hiw-pill" data-state={state}>
      {state === 'done' ? <CheckGlyph className="hiw-pill-check" /> : <i />}
      {children}
    </span>
  );
}

function ComposerMock() {
  return (
    <>
      <div className="hiw-newchat hiw-in" style={{ '--i': 0 }}>
        <OrqanixMark className="hiw-newchat-mark" />
      </div>
      <div className="hiw-composer hiw-in" style={{ '--i': 1 }}>
        <span className="hiw-attachment hiw-in" style={{ '--i': 3 }}>
          <Icon name="file" />
          notes.pdf
        </span>
        <div className="hiw-composer-row">
          <i className="hiw-caret" />
          <span className="hiw-placeholder">Ask whatever&apos;s on your mind.</span>
          <span className="hiw-wave">
            {[0, 1, 2, 3, 4].map((bar) => (
              <i key={bar} style={{ '--b': bar }} />
            ))}
          </span>
          <span className="hiw-tool hiw-tool-lit">
            <Icon name="mic" />
          </span>
        </div>
      </div>
    </>
  );
}

function RoadmapMock() {
  return (
    <>
      <div className="hiw-panel-head hiw-in" style={{ '--i': 0 }}>
        <span>Workspace</span>
        <Icon name="close" />
      </div>
      <div className="hiw-status hiw-in" style={{ '--i': 1 }}>
        <div className="hiw-status-row">
          <Pill state="working">Working</Pill>
          <span className="hiw-quiet">Step 2 of 5</span>
        </div>
        <div className="hiw-progress">
          {PROGRESS.map((fill, index) => (
            <span key={index} className={`hiw-segment hiw-segment-${fill}`}>
              <i />
            </span>
          ))}
        </div>
      </div>
      <span className="hiw-label hiw-in" style={{ '--i': 2 }}>
        ROADMAP
      </span>
      <ol className="hiw-roadmap">
        {ROADMAP.map(([state, title], index) => (
          <li
            key={title}
            className={`hiw-road hiw-road-${state} hiw-in`}
            style={{ '--i': index + 3 }}
          >
            <span className="hiw-marker">
              {state === 'done' && <CheckGlyph className="hiw-marker-check" />}
              {state === 'now' && <i />}
            </span>
            {title}
          </li>
        ))}
      </ol>
    </>
  );
}

function QuestionMock() {
  return (
    <>
      <div className="hiw-status-row hiw-in" style={{ '--i': 0 }}>
        <Pill state="waiting">Needs you</Pill>
        <span className="hiw-quiet">Step 3 of 5</span>
      </div>
      <div className="hiw-question hiw-in" style={{ '--i': 1 }}>
        <div className="hiw-question-head">
          <span className="hiw-strong">Your Turn to Answer</span>
          <span className="hiw-quiet">0 of 3 answered</span>
        </div>
        <p className="hiw-question-text hiw-in" style={{ '--i': 2 }}>
          <span className="hiw-question-number">1</span>
          Where will you register?
        </p>
        <div className="hiw-chips hiw-in" style={{ '--i': 3 }}>
          <span className="hiw-chip hiw-chip-tap">Latvia</span>
          <span className="hiw-chip">Estonia</span>
        </div>
        {[2, 3].map((number) => (
          <p key={number} className="hiw-question-text hiw-in" style={{ '--i': number + 2 }}>
            <span className="hiw-question-number">{number}</span>
            <i className="hiw-ghost-line" style={{ '--w': number === 2 ? '58%' : '44%' }} />
          </p>
        ))}
        <div className="hiw-question-foot hiw-in" style={{ '--i': 6 }}>
          <span className="hiw-send">Send 3 answers</span>
        </div>
      </div>
    </>
  );
}

function ActivityMock() {
  return (
    <>
      <div className="hiw-status-row hiw-in" style={{ '--i': 0 }}>
        <Pill state="working">Working</Pill>
        <span className="hiw-stop">
          <Icon name="stop" />
        </span>
      </div>
      <div className="hiw-action hiw-in" style={{ '--i': 1 }}>
        <Icon name="file" />
        <span className="hiw-action-name">Wrote business-plan.md</span>
        <CheckGlyph className="hiw-action-check" />
      </div>
      <div className="hiw-action hiw-action-live hiw-in" style={{ '--i': 2 }}>
        <Icon name="terminal" />
        <span className="hiw-action-name">Ran a command</span>
        <span className="hiw-spinner" />
        <div className="hiw-output">
          {[72, 48, 60].map((width, index) => (
            <i
              key={width}
              className="hiw-ghost-line"
              style={{ '--w': `${width}%`, '--b': index }}
            />
          ))}
          <i className="hiw-caret" />
        </div>
      </div>
    </>
  );
}

function ReviewMock() {
  return (
    <>
      <div className="hiw-status-row hiw-in" style={{ '--i': 0 }}>
        <Pill state="done">Done</Pill>
        <span className="hiw-quiet">Step 5 of 5</span>
      </div>
      <div className="hiw-filerow hiw-filerow-open hiw-in" style={{ '--i': 1 }}>
        <Icon name="file" />
        <span className="hiw-action-name">business-plan.md</span>
        <span className="hiw-diffcount">
          <span className="hiw-added">+12</span> <span className="hiw-removed">−3</span>
        </span>
        <span className="hiw-filetag">EDITED</span>
      </div>
      <div className="hiw-diff hiw-in" style={{ '--i': 2 }}>
        {DIFF_LINES.map(([kind, width], index) => (
          <span key={index} className={`hiw-diffline hiw-diffline-${kind}`}>
            <i className="hiw-ghost-line" style={{ '--w': `${width}%` }} />
          </span>
        ))}
      </div>
      <div className="hiw-filerow hiw-in" style={{ '--i': 3 }}>
        <Icon name="file" />
        <span className="hiw-action-name">landing-a.html</span>
        <span className="hiw-filetag">NEW</span>
      </div>
    </>
  );
}

const STEPS = [
  {
    number: '01',
    title: 'Say what you need',
    line: 'Type it or say it. Add files if they help.',
    Mock: ComposerMock,
  },
  {
    number: '02',
    title: 'It makes a plan',
    line: 'A live roadmap: every stage, and the one running now.',
    Mock: RoadmapMock,
  },
  {
    number: '03',
    title: 'It asks when it needs you',
    line: 'Tap the answers, or the next step to start.',
    Mock: QuestionMock,
  },
  {
    number: '04',
    title: 'It works on your Mac',
    line: 'Real files, real commands. You see every action and can stop any run.',
    Mock: ActivityMock,
  },
  {
    number: '05',
    title: 'You review the result',
    line: 'Preview each file, compare the changes, open or save it.',
    Mock: ReviewMock,
  },
];

// The level is how far the dial is turned: how much the app may do before it asks.
const RULES = [
  {
    tag: 'Asks always',
    title: 'Approve everything',
    line: 'It asks before every action.',
    level: 0,
  },
  {
    tag: 'Asks sometimes',
    title: 'Only the risky ones',
    line: 'It asks when an action looks risky.',
    level: 1,
  },
  {
    tag: 'Asks never',
    title: 'Let it run',
    line: 'It works without asking. This is how the app starts.',
    level: 2,
  },
];

const DIAL_STOPS = [-80, 0, 80];
const DIAL_SWEEP = 120;

// Without a real browser (tests) or with reduced motion the story is simply all there.
function storyIsStill() {
  if (typeof IntersectionObserver === 'undefined') return true;
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

// One style write per frame per surface, however often the pointer reports.
const pendingPoints = new WeakMap();

function trackPointer(event) {
  if (event.pointerType !== 'mouse') return;
  const surface = event.currentTarget;
  const waiting = pendingPoints.has(surface);
  pendingPoints.set(surface, { x: event.clientX, y: event.clientY });
  if (waiting) return;
  requestAnimationFrame(() => {
    const point = pendingPoints.get(surface);
    pendingPoints.delete(surface);
    const box = surface.getBoundingClientRect();
    const x = point.x - box.left;
    const y = point.y - box.top;
    surface.style.setProperty('--mx', `${x}px`);
    surface.style.setProperty('--my', `${y}px`);
    // -1 .. 1 across the surface, for the slight lean toward the pointer.
    surface.style.setProperty('--tx', (x / box.width - 0.5) * 2);
    surface.style.setProperty('--ty', (y / box.height - 0.5) * 2);
  });
}

function releasePointer(event) {
  event.currentTarget.style.setProperty('--tx', 0);
  event.currentTarget.style.setProperty('--ty', 0);
}

function stepState(index, reached) {
  if (index >= reached) return 'next';
  return index === reached - 1 ? 'now' : 'past';
}

function Story() {
  const railRef = useRef(null);
  const nodeRefs = useRef([]);
  const [still] = useState(storyIsStill);
  const [reached, setReached] = useState(still ? STEPS.length : 0);

  useEffect(() => {
    const rail = railRef.current;
    if (still || !rail) return undefined;
    let raf = 0;
    let head = 0;

    const frame = () => {
      raf = 0;
      const box = rail.getBoundingClientRect();
      const at = window.innerWidth < STACKED_BELOW ? HEAD_AT_STACKED : HEAD_AT;
      // The page opens on the story, so the light never rests above the first step: the
      // first screen always shows one step lit, not an empty rail.
      const first = nodeRefs.current[0]?.getBoundingClientRect();
      const floor = first ? first.top + first.height / 2 - box.top : 0;
      const target = Math.min(box.height, Math.max(floor, window.innerHeight * at - box.top));
      head += (target - head) * HEAD_EASE;
      if (Math.abs(target - head) < 0.5) head = target;
      const passed = nodeRefs.current.filter((node) => {
        if (!node) return false;
        const nodeBox = node.getBoundingClientRect();
        return nodeBox.top + nodeBox.height / 2 - box.top <= head + 1;
      }).length;

      rail.style.setProperty('--hiw-y', `${head}px`);
      rail.style.setProperty('--hiw-p', box.height > 0 ? head / box.height : 0);
      setReached(passed);
      if (head !== target) raf = requestAnimationFrame(frame);
    };

    const request = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    request();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    return () => {
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [still]);

  return (
    <div className="hiw-story" data-still={still}>
      <div ref={railRef} className="hiw-rail" aria-hidden="true">
        <i className="hiw-rail-lit" />
        <i className="hiw-rail-head" />
      </div>
      <ol className="hiw-steps">
        {STEPS.map((step, index) => {
          const Mock = step.Mock;
          return (
            <li
              key={step.number}
              // Each step keeps its anchor (#how-step-01 and on), so a link can open the page
              // at a step; it can take focus, so the keyboard follows such a jump.
              id={stepAnchor(step.number)}
              tabIndex={-1}
              className="hiw-step"
              data-state={still ? 'lit' : stepState(index, reached)}
            >
              <div className="hiw-step-copy">
                <span className="hiw-num" data-n={step.number} aria-hidden="true">
                  {step.number}
                </span>
                <h3 className="hiw-step-title">{step.title}</h3>
                <p className="hiw-step-line">{step.line}</p>
              </div>
              <span
                ref={(node) => {
                  nodeRefs.current[index] = node;
                }}
                className="hiw-node"
                aria-hidden="true"
              >
                <i className="hiw-node-dot" />
                <i className="hiw-node-ping" />
                <i className="hiw-node-link" />
              </span>
              <div className="hiw-step-mock" aria-hidden="true">
                <i className="hiw-mock-bloom" />
                <div
                  className="hiw-mock"
                  onPointerMove={trackPointer}
                  onPointerLeave={releasePointer}
                >
                  <Mock />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function polar(radius, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return [Math.sin(angle) * radius, -Math.cos(angle) * radius];
}

function arc(radius) {
  const [x1, y1] = polar(radius, -DIAL_SWEEP);
  const [x2, y2] = polar(radius, DIAL_SWEEP);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${radius} ${radius} 0 1 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** A three-stop dial. Path lengths are in degrees, so a stop's angle is also its dash length. */
function Dial({ level }) {
  const angle = DIAL_STOPS[level];
  return (
    <svg
      className="hiw-dial"
      viewBox="-100 -96 200 160"
      style={{ '--a': `${angle}deg`, '--len': angle + DIAL_SWEEP }}
      aria-hidden="true"
      focusable="false"
    >
      <path className="hiw-dial-bezel" d={arc(88)} pathLength="240" />
      <path className="hiw-dial-track" d={arc(70)} pathLength="240" />
      <path className="hiw-dial-fill" d={arc(70)} pathLength="240" />
      <path className="hiw-dial-light" d={arc(70)} pathLength="240" />
      {DIAL_STOPS.map((stop, index) => {
        const [cx, cy] = polar(70, stop);
        return (
          <circle
            key={stop}
            className={index <= level ? 'hiw-dial-stop hiw-dial-stop-lit' : 'hiw-dial-stop'}
            cx={cx.toFixed(2)}
            cy={cy.toFixed(2)}
            r={index === level ? 5 : 3.5}
          />
        );
      })}
      <circle className="hiw-dial-face" r="47" />
      <g className="hiw-dial-hand">
        <path d="M0 -20V-39" />
        <circle cy="-39" r="2.6" />
      </g>
    </svg>
  );
}

// The owner took the opening picture ("You say it. It does it.", HowHero) off, with the rule
// under it and the "From request to result" tag, so the page starts at the story and its
// heading is the page's h1. HowHero stays in heroes/, unused, with its own tests.
export default function HowItWorksPage() {
  return (
    <>
      <Seen
        as="section"
        id="how-steps"
        className="oi-section ois-section hiw-steps-section"
        aria-labelledby="how-steps-heading"
        // The story is several screens tall, so only a sliver of it is ever in view at once.
        threshold={0.02}
      >
        <div className="oi-container">
          <Seen className="ois-gate ois-head hiw-head">
            <Reveal as="h1" id="how-steps-heading" className="oi-h2">
              Five steps, one chat
            </Reveal>
          </Seen>
          <Story />
          <Seen className="ois-gate hiw-story-more">
            <Reveal>
              <More>
                <ul>
                  <li>
                    The plan sits in a side panel beside the chat, with the status, the files and
                    the results.
                  </li>
                  <li>It previews the pages and files it builds, inside the app.</li>
                  <li>What it makes are drafts to review, not legal or financial advice.</li>
                </ul>
              </More>
            </Reveal>
          </Seen>
        </div>
      </Seen>

      <PrivacyPreface />

      <Seen
        as="section"
        id="how-control"
        className="oi-section ois-section ois-ruled hiw-control"
        aria-labelledby="how-control-heading"
      >
        <div className="oi-container">
          <Seen className="ois-gate ois-head ois-head-split">
            <div className="ois-head-main">
              <Reveal as="p" className="oi-tag oi-tag-bracket">
                Control
              </Reveal>
              <Reveal as="h2" id="how-control-heading" className="oi-h2" delay={90}>
                You set the rules
              </Reveal>
            </div>
            <Reveal as="p" className="oi-line" delay={180}>
              Choose how much it may do without asking. Change it any time in Settings.
            </Reveal>
          </Seen>
          <div className="hiw-rules">
            {RULES.map((rule, index) => (
              // Each card is its own gate, so a stacked dial is set as it is reached.
              <Seen key={rule.title} className="ois-gate hiw-rule-slot" threshold={0.3}>
                <Reveal
                  as="article"
                  className="oi-card hiw-rule"
                  delay={index * 140}
                  tabIndex={0}
                  aria-label={rule.title}
                  onPointerMove={trackPointer}
                >
                  <p className="oi-tag hiw-rule-tag">
                    <span>{rule.tag}</span>
                    <span className="hiw-rule-index" aria-hidden="true">
                      0{index + 1}
                    </span>
                  </p>
                  <Dial level={rule.level} />
                  <h3 className="hiw-rule-title">{rule.title}</h3>
                  <p className="oi-line hiw-rule-line">{rule.line}</p>
                </Reveal>
              </Seen>
            ))}
          </div>
          <Seen className="ois-gate hiw-stopline">
            <Reveal as="p" className="oi-small hiw-stopline-text">
              <span className="hiw-stop" aria-hidden="true">
                <Icon name="stop" />
              </span>
              You can stop any run at any moment.
            </Reveal>
          </Seen>
        </div>
      </Seen>
    </>
  );
}
