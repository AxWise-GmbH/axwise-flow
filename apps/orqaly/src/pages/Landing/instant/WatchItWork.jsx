import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { DesktopDownloadButton } from '../simple/DesktopDownload';
import DemoCallout, { DemoCalloutCaption } from './DemoCallouts';
import More from './ui/More';
import { CheckGlyph, ChevronGlyph, OrqanixMark } from './ui/Glyphs';
import { ASSUMPTIONS_LINE, SCENES } from './watchItWork.scenes';
import {
  NODE_MS,
  STEP_COUNT,
  TICK_MS,
  activeStep,
  answeredCount,
  initialState,
  introBeat,
  reducer,
  typedCount,
  workspaceStatus,
} from './watchItWorkMachine';
import './WatchItWork.css';

const CHOICES = [
  ['ask', 'Sure, ask me'],
  ['proceed', 'Proceed with assumptions'],
];

const STATUS_LABELS = { waiting: 'Needs you', working: 'Working', done: 'Done' };

const CONTROL_LABELS = {
  idle: 'Play from the start',
  playing: 'Pause demo',
  paused: 'Resume demo',
  awaiting: 'Skip to results',
  complete: 'Replay demo',
};

const ANNOUNCEMENTS = {
  intro: 'Playing the example from the start.',
  gate: 'The plan is ready. Choose a next step.',
  question: 'Your turn. Three questions are waiting.',
  answer: 'Your turn. Three questions are waiting.',
  build: 'Working through the five steps.',
  results: 'The steps are done. The files are appearing.',
  complete: 'Example complete. The first drafts are listed.',
};

// The window gets a head start on its fade before the first result moves.
const RISE_OFFSET = 3;

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// The desktop app's thin line icons, drawn on a 16px grid (the gear on 24).
const LINE_ICONS = {
  newChat:
    'M3.2 2.8h9.6a1.2 1.2 0 0 1 1.2 1.2v6a1.2 1.2 0 0 1-1.2 1.2H8.4l-3 2.4v-2.4H3.2A1.2 1.2 0 0 1 2 10V4a1.2 1.2 0 0 1 1.2-1.2zM8 5v4M6 7h4',
  spark: 'M8 2.5l1.3 3.6 3.7 1.4-3.7 1.4L8 12.5 6.7 8.9 3 7.5l3.7-1.4zM12.2 11.2v2.3M11 12.4h2.4',
  plug: 'M6 2.5v3M10 2.5v3M4.5 5.5h7v2.2a3.5 3.5 0 0 1-7 0zM8 11.2v2.3',
  tools:
    'M3 13l5.2-5.2M9.2 3.6a2.8 2.8 0 0 0 3.2 3.9l-1.7-1.7.6-1.6 1.6-.6L11.2 1.9a2.8 2.8 0 0 0-2 1.7zM3.4 3.4l2.2 2.2',
  history: 'M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.6 2.8v2.4H5M8 5.2v3l2 1.2',
  clip: 'M12.6 7.4l-4.9 4.9a2.7 2.7 0 0 1-3.8-3.8l5.3-5.3a1.8 1.8 0 0 1 2.5 2.5L6.5 10.9a.9.9 0 0 1-1.2-1.2l4.5-4.5',
  sliders:
    'M3 5h5.5M11.5 5H13M3 11h1.5M7.5 11H13M8.5 5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0zM4.5 11a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z',
  mic: 'M8 2.5a1.8 1.8 0 0 0-1.8 1.8v3.4a1.8 1.8 0 0 0 3.6 0V4.3A1.8 1.8 0 0 0 8 2.5zM4.2 7.5a3.8 3.8 0 0 0 7.6 0M8 11.3v2.2',
  send: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7',
  panel: 'M2.5 3.5h11v9h-11zM9.5 3.5v9M9.5 6.5h4M9.5 9.5h4',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  doc: 'M4 1.75h5.25L12.5 5v9.25H4zM9 1.75v3.5h3.5M6 8.5h4.5M6 11h4.5',
  table: 'M2.5 3.5h11v9h-11zM2.5 6.5h11M2.5 9.5h11M6.5 3.5v9',
  code: 'M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5',
  list: 'M2.5 4.4l1.2 1.2 2-2.3M8 4.5h5.5M2.5 10.4l1.2 1.2 2-2.3M8 10.5h5.5',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
};

function LineIcon({ name }) {
  const wide = name === 'gear';
  return (
    <svg
      viewBox={wide ? '0 0 24 24' : '0 0 16 16'}
      className="wiw-line-icon"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={LINE_ICONS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={wide ? 1.9 : 1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function fileKind(name) {
  if (/\.csv$/.test(name)) return 'table';
  if (/\.md$/.test(name)) return 'doc';
  return /HTML|SVG/.test(name) ? 'code' : 'list';
}

const SIDEBAR_SECTIONS = [
  ['spark', 'Intelligence'],
  ['plug', 'Plugins'],
  ['tools', 'Instruments'],
  ['history', 'History'],
];

// The desktop app's left menu, as scenery: hidden from assistive tech, nothing in it focusable.
function AppSidebar({ chatTitle }) {
  return (
    <div className="wiw-sidebar" aria-hidden="true">
      <span className="wiw-dots wiw-side-traffic">
        <i />
        <i />
        <i />
        <LineIcon name="panel" />
      </span>
      <span className="wiw-side-brand">
        <OrqanixMark className="wiw-side-mark" />
        <span className="wiw-side-text">Orqanix</span>
      </span>
      <span className="wiw-side-item wiw-side-new">
        <LineIcon name="newChat" />
        <span className="wiw-side-text">New Chat</span>
      </span>
      <span className="wiw-side-chats">
        <span className="wiw-side-label">
          <span className="wiw-side-text">RECENT</span>
        </span>
        <span className="wiw-side-chat" data-selected="true">
          <span className="wiw-side-text">{chatTitle}</span>
          <i />
        </span>
        <span className="wiw-side-chat">
          <span className="wiw-side-text">Getting started</span>
        </span>
        <span className="wiw-side-label">
          <span className="wiw-side-text">PINNED</span>
        </span>
        <span className="wiw-side-chat">
          <span className="wiw-side-text">Brand guide</span>
        </span>
      </span>
      <span className="wiw-side-foot">
        {SIDEBAR_SECTIONS.map(([icon, label]) => (
          <span className="wiw-side-item" key={label}>
            <LineIcon name={icon} />
            <span className="wiw-side-text">{label}</span>
          </span>
        ))}
      </span>
      <span className="wiw-side-settings">
        <LineIcon name="gear" />
        <span className="wiw-side-text">Settings</span>
      </span>
    </div>
  );
}

// The app's composer card. Scenery too: the demo's real controls are the cards above it.
function Composer() {
  return (
    <div className="wiw-composer" aria-hidden="true">
      <span className="wiw-composer-copy">Ask whatever&apos;s on your mind.</span>
      <span className="wiw-composer-controls">
        <LineIcon name="clip" />
        <LineIcon name="sliders" />
        <span className="wiw-composer-spacer" />
        <LineIcon name="mic" />
        <span className="wiw-send">
          <LineIcon name="send" />
        </span>
      </span>
    </div>
  );
}

// Mounted only while the card is open, so a replay or a new scenario starts unpicked.
function StepChoices({ labelledBy, onStart, autoPicked }) {
  const [picked, setPicked] = useState(null);
  const name = useId();

  return (
    <form
      className="wiw-card-body"
      onSubmit={(event) => {
        event.preventDefault();
        if (picked) onStart(picked);
      }}
    >
      <div className="wiw-choices" role="radiogroup" aria-labelledby={labelledBy}>
        {CHOICES.map(([value, label]) => (
          <label className="wiw-choice" key={value}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={(picked ?? autoPicked) === value}
              onChange={() => setPicked(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="wiw-card-foot">
        <button type="submit" className="wiw-button" disabled={!picked}>
          Start
        </button>
      </div>
    </form>
  );
}

function StepCard({ open, started, rise, headingRef, onStart, autoPicked, children }) {
  const titleId = useId();
  return (
    <section className={rise ? 'wiw-card wiw-rise' : 'wiw-card'} aria-labelledby={titleId}>
      <div className="wiw-card-head">
        <h3 className="wiw-card-title" id={titleId} ref={headingRef} tabIndex={-1}>
          Choose a next step
          {started && <span className="wiw-card-note"> · Started</span>}
        </h3>
      </div>
      {open && <StepChoices labelledBy={titleId} onStart={onStart} autoPicked={autoPicked} />}
      {children}
    </section>
  );
}

function QuestionCard({ questions, answers, open, sent, headingRef, onAnswer, onSend }) {
  const titleId = useId();
  const count = answers.filter((answer) => answer !== null).length;
  const sendLabel = count === 0 ? 'Send' : `Send ${count} ${count === 1 ? 'answer' : 'answers'}`;

  return (
    <section className="wiw-card wiw-rise" aria-labelledby={titleId}>
      <div className="wiw-card-head">
        <h3 className="wiw-card-title" id={titleId} ref={headingRef} tabIndex={-1}>
          Your Turn to Answer
          {sent && <span className="wiw-card-note"> · Answers sent</span>}
        </h3>
        {!sent && (
          <span className="wiw-card-count">
            {count} of {questions.length} answered
          </span>
        )}
      </div>
      {open && (
        <form
          className="wiw-card-body wiw-rise"
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <ol className="wiw-questions">
            {questions.map((question, questionIndex) => (
              <li key={question.label}>
                <p className="wiw-question-label">
                  <span
                    className="wiw-question-number"
                    data-answered={answers[questionIndex] !== null}
                    aria-hidden="true"
                  >
                    {answers[questionIndex] === null ? questionIndex + 1 : <CheckGlyph />}
                  </span>
                  {question.label}
                </p>
                <div className="wiw-options" role="group" aria-label={question.label}>
                  {question.options.map((option, optionIndex) => (
                    <button
                      type="button"
                      className="wiw-option"
                      key={option}
                      aria-pressed={answers[questionIndex] === optionIndex}
                      onClick={() => onAnswer(questionIndex, optionIndex)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <div className="wiw-card-foot">
            <button type="submit" className="wiw-button" disabled={count === 0}>
              {sendLabel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function WorkspacePanel({ state, scene }) {
  const titleId = useId();
  const status = workspaceStatus(state);
  const current = activeStep(state);
  const beat = introBeat(state);
  const stepStateAt = (index) => (index < current ? 'done' : index === current ? 'now' : 'pending');

  return (
    <aside className="wiw-workspace" aria-labelledby={titleId}>
      <div className="wiw-workspace-head">
        <h3 className="wiw-workspace-title" id={titleId}>
          Workspace
        </h3>
        <LineIcon name="close" />
      </div>
      <div className="wiw-workspace-body">
        {/* During the typed intro the panel fills in the order the real one does: status once
            the request is sent, roadmap once the plan arrives. Hidden parts keep their space. */}
        <div
          className="wiw-status-card"
          data-arrived={beat >= 1}
          aria-hidden={beat < 1 || undefined}
        >
          <span className="wiw-status" data-state={status}>
            <span className="wiw-status-dot" aria-hidden="true" />
            {STATUS_LABELS[status]}
          </span>
          <p className="wiw-stepline" data-arrived={beat >= 2}>
            Step {Math.min(current + 1, STEP_COUNT)} of {STEP_COUNT}
          </p>
          <div className="wiw-progress" data-arrived={beat >= 2} aria-hidden="true">
            {scene.steps.map((step, index) => (
              <span key={step} data-state={stepStateAt(index)} />
            ))}
          </div>
        </div>
        <div
          className="wiw-roadmap-block"
          data-arrived={beat >= 2}
          aria-hidden={beat < 2 || undefined}
        >
          <p className="wiw-label wiw-roadmap-label">Roadmap</p>
          <ol className="wiw-roadmap">
            {scene.steps.map((step, index) => (
              <li key={step} data-state={stepStateAt(index)}>
                <span className="wiw-marker" aria-hidden="true">
                  {stepStateAt(index) === 'done' && <CheckGlyph />}
                  {stepStateAt(index) === 'now' && <i />}
                </span>
                <span>
                  {step}
                  {stepStateAt(index) !== 'pending' && (
                    <span className="oi-sr-only">, {stepStateAt(index)}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <DemoCallout name="plan" node={state.node} callouts={scene.callouts} />
        </div>
      </div>
      <DemoCallout name="workspace" node={state.node} callouts={scene.callouts} />
    </aside>
  );
}

function Results({ scene, state, headingRef }) {
  const titleId = useId();
  const { columns } = scene.pack;
  // Items rise one after another across columns, which is also the roadmap's order.
  const firstRise = columns.map(
    (_, index) =>
      RISE_OFFSET +
      2 +
      columns.slice(0, index).reduce((total, column) => total + column.items.length, 0)
  );

  return (
    <div className="wiw-results" role="group" aria-labelledby={titleId}>
      <h3
        className="wiw-pack-title wiw-rise"
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
        style={{ '--i': RISE_OFFSET }}
      >
        {scene.pack.title}
      </h3>
      <p className="wiw-fitted wiw-rise" style={{ '--i': RISE_OFFSET + 1 }}>
        {state.assumptions ? ASSUMPTIONS_LINE : scene.fittedTo(state.answers)}
      </p>
      <div className="wiw-pack">
        {columns.map((column, columnIndex) => (
          <section className="wiw-pack-column" key={column.title} aria-label={column.title}>
            <h4
              className="wiw-label wiw-pack-label wiw-rise"
              style={{ '--i': firstRise[columnIndex] }}
            >
              {column.title}
            </h4>
            <ul className="wiw-files">
              {column.items.map((item, itemIndex) => (
                <li
                  className="wiw-file wiw-rise"
                  key={item}
                  style={{ '--i': firstRise[columnIndex] + itemIndex }}
                >
                  <LineIcon name={fileKind(item)} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="wiw-advice">Drafts to review, not legal or financial advice.</p>
      <DemoCallout name="results" node={state.node} callouts={scene.callouts} />
    </div>
  );
}

export default function WatchItWork({ downloadDescriptionId = 'instant-download-release' }) {
  const [state, dispatch] = useReducer(reducer, SCENES[0].id, initialState);
  const { node, playback } = state;
  const sceneIndex = Math.max(
    0,
    SCENES.findIndex((item) => item.id === state.sceneId)
  );
  const scene = SCENES[sceneIndex];

  // The demo plays itself, in a loop, while it is on screen. The first thing a visitor
  // does inside it ends that: from then on it is theirs to drive.
  const [auto, setAuto] = useState(() => !prefersReducedMotion());
  const [inView, setInView] = useState(false);
  const [autoPicked, setAutoPicked] = useState(null);
  const sectionRef = useRef(null);
  const takeOver = () => setAuto(false);

  const pills = useRef([]);
  const startedAt = useRef(0);
  const stepHeading = useRef(null);
  const questionHeading = useRef(null);
  const resultsHeading = useRef(null);

  const beat = introBeat(state);
  const typed = typedCount(state, scene.request.length);
  const questionShown = state.choice === 'ask' && node !== 'gate';
  const resultsShown = node === 'results' || node === 'complete';

  useEffect(() => {
    if (playback !== 'playing') return undefined;
    // Backdating the start by what already played is what lets a resume pick up mid-node.
    const clock = Date.now() - state.elapsed;
    startedAt.current = clock;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - clock;
      // The tick that ends a node is this interval's last: a later one would carry the old
      // clock into the next node.
      if (elapsed >= NODE_MS[node]) window.clearInterval(timer);
      dispatch({ type: 'TICK', node, elapsed, requestLength: scene.request.length });
    }, TICK_MS);
    return () => window.clearInterval(timer);
    // One clock per playing stretch: start it when a node starts or resumes, not on each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, node]);

  useEffect(() => {
    if (questionShown && !auto) questionHeading.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionShown]);

  useEffect(() => {
    if (resultsShown && !auto) resultsHeading.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsShown]);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The director: one small step per beat, each chosen from where the demo stands now.
  const answered = answeredCount(state);
  useEffect(() => {
    if (!auto) return undefined;
    if (!inView) {
      if (playback === 'playing') {
        dispatch({ type: 'PAUSE', elapsed: Date.now() - startedAt.current });
      }
      return undefined;
    }
    let delay = 0;
    let act = null;
    if (playback === 'paused') {
      act = () => dispatch({ type: 'RESUME', reducedMotion: false });
    } else if (node === 'gate' && playback === 'idle') {
      delay = 700;
      act = () => dispatch({ type: 'PLAY_INTRO', reducedMotion: false });
    } else if (node === 'gate' && playback === 'awaiting') {
      delay = autoPicked ? 900 : 1100;
      act = autoPicked
        ? () => dispatch({ type: 'START', choice: 'ask', reducedMotion: false })
        : () => setAutoPicked('ask');
    } else if (node === 'answer' && answered < scene.questions.length) {
      delay = 850;
      const question = state.answers.findIndex((answer) => answer === null);
      // Not always the first chip, so the three questions do not look filled in by rote.
      const option = (question + 1) % scene.questions[question].options.length;
      act = () => dispatch({ type: 'ANSWER', question, option });
    } else if (node === 'answer') {
      delay = 900;
      act = () => dispatch({ type: 'SEND', reducedMotion: false });
    } else if (node === 'complete') {
      delay = 5200;
      act = () => {
        setAutoPicked(null);
        dispatch({ type: 'RESET', sceneId: SCENES[(sceneIndex + 1) % SCENES.length].id });
      };
    }
    if (!act) return undefined;
    const timer = window.setTimeout(act, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, inView, node, playback, answered, autoPicked, sceneIndex]);

  function handlePillKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focused = pills.current.findIndex((button) => button?.contains(event.target));
    const from = focused === -1 ? sceneIndex : focused;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? SCENES.length - 1
          : (from + (event.key === 'ArrowRight' ? 1 : -1) + SCENES.length) % SCENES.length;
    takeOver();
    dispatch({ type: 'RESET', sceneId: SCENES[next].id });
    pills.current[next]?.focus();
  }

  // Start and Send unmount the button that was pressed; park focus on the card's heading,
  // which stays, so it never falls back to the top of the page.
  function handleStart(choice) {
    takeOver();
    stepHeading.current?.focus();
    dispatch({ type: 'START', choice, reducedMotion: prefersReducedMotion() });
  }

  function handleSend() {
    takeOver();
    questionHeading.current?.focus();
    dispatch({ type: 'SEND', reducedMotion: prefersReducedMotion() });
  }

  function handleControl() {
    takeOver();
    const reducedMotion = prefersReducedMotion();
    if (playback === 'idle') dispatch({ type: 'PLAY_INTRO', reducedMotion });
    else if (playback === 'playing') {
      dispatch({ type: 'PAUSE', elapsed: Date.now() - startedAt.current });
    } else if (playback === 'paused') dispatch({ type: 'RESUME', reducedMotion });
    else if (playback === 'awaiting') dispatch({ type: 'SKIP', reducedMotion });
    else dispatch({ type: 'REPLAY' });
  }

  return (
    <section
      ref={sectionRef}
      id="watch"
      className="wiw oi-section"
      data-auto={auto}
      aria-labelledby="watch-heading"
      data-playback={playback}
      data-node={node}
    >
      <div className="oi-container">
        <div className="wiw-head">
          <h2 className="oi-h2 wiw-heading" id="watch-heading">
            Watch it work
          </h2>
          <p className="oi-line wiw-line">Example demo · sped up</p>
          <More>
            <p>
              Scripted example. Real runs take minutes and give you drafts to review, not legal or
              financial advice. "Proceed" makes the same pack with general assumptions.
            </p>
          </More>
        </div>

        <div
          className="wiw-pills"
          role="group"
          aria-label="Choose an example"
          onKeyDown={handlePillKey}
        >
          {SCENES.map((item, index) => (
            <button
              type="button"
              className="wiw-pill"
              key={item.id}
              ref={(element) => {
                pills.current[index] = element;
              }}
              aria-pressed={index === sceneIndex}
              onClick={() => {
                takeOver();
                dispatch({ type: 'RESET', sceneId: item.id });
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Reserves the height of the tallest frame, so whatever swaps inside, the page
            below the demo stays where it is. The app window stays put; "goes black" is the
            chat and the Workspace fading out of it before the pack rises on its canvas. */}
        <div className="wiw-body">
          <div className="wiw-app">
            <AppSidebar chatTitle={scene.chatTitle} />
            <div className="wiw-titlebar">
              <span className="wiw-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <p className="wiw-title">
                {scene.chatTitle}
                <ChevronGlyph />
              </p>
              <span className="wiw-brand" aria-hidden="true">
                <OrqanixMark />
                Orqanix
                <LineIcon name="panel" />
              </span>
            </div>

            <div className="wiw-stage">
              {node !== 'complete' && (
                <div
                  className="wiw-window"
                  data-fading={node === 'results'}
                  inert={node === 'results'}
                  aria-hidden={node === 'results' || undefined}
                >
                  <div className="wiw-chat">
                    <p className="wiw-user" data-typing={beat === 0}>
                      <span className="oi-sr-only">You: </span>
                      {beat === 0 ? (
                        <>
                          {scene.request.slice(0, typed)}
                          <span className="wiw-caret" aria-hidden="true" />
                          {/* The untyped rest holds the bubble at its final size while it fills. */}
                          <span className="wiw-untyped" aria-hidden="true">
                            {scene.request.slice(typed)}
                          </span>
                        </>
                      ) : (
                        scene.request
                      )}
                    </p>
                    {beat >= 2 && (
                      <p className={node === 'intro' ? 'wiw-reply wiw-rise' : 'wiw-reply'}>
                        <span className="oi-sr-only">Orqanix: </span>
                        {scene.planReply}
                      </p>
                    )}
                    {beat >= 3 && (
                      <p className={node === 'intro' ? 'wiw-reply wiw-rise' : 'wiw-reply'}>
                        {scene.askLine}
                      </p>
                    )}
                    {node !== 'intro' && (
                      <StepCard
                        key={scene.id}
                        open={node === 'gate'}
                        started={state.choice !== null}
                        rise={node === 'gate' && playback === 'awaiting'}
                        headingRef={stepHeading}
                        onStart={handleStart}
                        autoPicked={autoPicked}
                      >
                        <DemoCallout name="gate" node={node} callouts={scene.callouts} />
                      </StepCard>
                    )}
                    {questionShown && (
                      <QuestionCard
                        questions={scene.questions}
                        answers={state.answers}
                        open={node === 'answer'}
                        sent={node !== 'question' && node !== 'answer' && answeredCount(state) > 0}
                        headingRef={questionHeading}
                        onAnswer={(question, option) => {
                          takeOver();
                          dispatch({ type: 'ANSWER', question, option });
                        }}
                        onSend={handleSend}
                      />
                    )}
                    <Composer />
                  </div>

                  <WorkspacePanel state={state} scene={scene} />
                </div>
              )}

              {resultsShown && <Results scene={scene} state={state} headingRef={resultsHeading} />}
            </div>
          </div>

          <DemoCalloutCaption node={node} callouts={scene.callouts} />

          <div className="wiw-controls">
            <button type="button" className="wiw-control" onClick={handleControl}>
              {CONTROL_LABELS[playback]}
            </button>
            {node === 'complete' && <DesktopDownloadButton descriptionId={downloadDescriptionId} />}
          </div>
        </div>

        <p className="oi-sr-only" role="status">
          {playback === 'paused' ? 'Demo paused.' : ANNOUNCEMENTS[node]}
        </p>
      </div>
    </section>
  );
}
