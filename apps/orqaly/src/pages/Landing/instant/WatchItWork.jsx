import { useEffect, useId, useReducer, useRef, useState } from 'react';
import DemoCallout, { DemoCalloutCaption } from './DemoCallouts';
import { CheckGlyph, ChevronGlyph, OrqanixMark } from './ui/Glyphs';
import WorkspaceFiles from './WorkspaceFiles';
import { SCENES, localScene, sceneKey } from './watchItWork.scenes';
import { useT } from './i18n/useT';
import {
  NODE_MS,
  STEP_COUNT,
  TICK_MS,
  activeStep,
  answeredCount,
  filmOption,
  finishedState,
  initialState,
  introBeat,
  reducer,
  sceneProgress,
  typedCount,
  workspaceStatus,
} from './watchItWorkMachine';
import './WatchItWork.css';

const CHOICES = ['ask', 'proceed'];

/*
 * The owner, 2026-09-21: the demo only plays. It asks the visitor for nothing, so it has no
 * Play / Skip / Replay / Download buttons, and nothing inside the window can be clicked: the
 * film makes every pick itself and loops through the four examples. The example tabs stay
 * above it (owner: bring them back): they follow the film, and a click only jumps ahead.
 * The window is hidden from assistive tech, since it changes by itself every few seconds;
 * an sr-only line in the section (wiw.description) tells the same story in words.
 */

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

// The desktop app's left menu, as scenery: hidden from assistive tech, nothing in it focusable.
function AppSidebar({ chatTitle }) {
  const { t } = useT();
  const sections = [
    ['spark', t('wiw.side.intelligence', 'Intelligence')],
    ['plug', t('wiw.side.plugins', 'Plugins')],
    ['tools', t('wiw.side.instruments', 'Instruments')],
    ['history', t('wiw.side.history', 'History')],
  ];
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
        <span className="wiw-side-text">{t('wiw.side.new', 'New Chat')}</span>
      </span>
      <span className="wiw-side-chats">
        <span className="wiw-side-label">
          <span className="wiw-side-text">{t('wiw.side.recent', 'RECENT')}</span>
        </span>
        <span className="wiw-side-chat" data-selected="true">
          <span className="wiw-side-text">{chatTitle}</span>
          <i />
        </span>
        <span className="wiw-side-chat">
          <span className="wiw-side-text">{t('wiw.side.start', 'Getting started')}</span>
        </span>
        <span className="wiw-side-label">
          <span className="wiw-side-text">{t('wiw.side.pinned', 'PINNED')}</span>
        </span>
        <span className="wiw-side-chat">
          <span className="wiw-side-text">{t('wiw.side.brand', 'Brand guide')}</span>
        </span>
      </span>
      <span className="wiw-side-foot">
        {sections.map(([icon, label]) => (
          <span className="wiw-side-item" key={icon}>
            <LineIcon name={icon} />
            <span className="wiw-side-text">{label}</span>
          </span>
        ))}
      </span>
      <span className="wiw-side-settings">
        <LineIcon name="gear" />
        <span className="wiw-side-text">{t('wiw.side.settings', 'Settings')}</span>
      </span>
    </div>
  );
}

// The app's composer card. Scenery, like everything in the window.
function Composer() {
  const { t } = useT();
  return (
    <div className="wiw-composer" aria-hidden="true">
      <span className="wiw-composer-copy">
        {t('wiw.composer', "Ask whatever's on your mind.")}
      </span>
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

// The app's two cards as the film shows them: its picks light up, nothing takes a click.
function StepCard({ open, started, rise, picked, children }) {
  const { t } = useT();
  const labels = {
    ask: t('wiw.choice.ask', 'Sure, ask me'),
    proceed: t('wiw.choice.proceed', 'Proceed with assumptions'),
  };
  return (
    <section className={rise ? 'wiw-card wiw-rise' : 'wiw-card'}>
      <div className="wiw-card-head">
        <h3 className="wiw-card-title">
          {t('wiw.gate.title', 'Choose a next step')}
          {started && (
            <span className="wiw-card-note"> · {t('wiw.gate.started', 'Started')}</span>
          )}
        </h3>
      </div>
      {open && (
        <div className="wiw-card-body">
          <div className="wiw-choices">
            {CHOICES.map((value) => (
              <span className="wiw-choice" key={value} data-checked={picked === value}>
                <i className="wiw-radio" />
                <span>{labels[value]}</span>
              </span>
            ))}
          </div>
          <div className="wiw-card-foot">
            <span className="wiw-button" data-ready={picked !== null}>
              {t('wiw.gate.start', 'Start')}
            </span>
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

function QuestionCard({ questions, answers, open, sent }) {
  const { t } = useT();
  const count = answers.filter((answer) => answer !== null).length;
  const sendLabel =
    count === 0
      ? t('wiw.send.none', 'Send')
      : count === 1
        ? t('wiw.send.one', 'Send 1 answer')
        : t('wiw.send.many', 'Send {count} answers', { count });

  return (
    <section className="wiw-card wiw-rise">
      <div className="wiw-card-head">
        <h3 className="wiw-card-title">
          {t('wiw.questions.title', 'Your Turn to Answer')}
          {sent && (
            <span className="wiw-card-note"> · {t('wiw.questions.sent', 'Answers sent')}</span>
          )}
        </h3>
        {!sent && (
          <span className="wiw-card-count">
            {t('wiw.questions.count', '{count} of {total} answered', {
              count,
              total: questions.length,
            })}
          </span>
        )}
      </div>
      {open && (
        <div className="wiw-card-body wiw-rise">
          <ol className="wiw-questions">
            {questions.map((question, questionIndex) => (
              <li key={questionIndex}>
                <p className="wiw-question-label">
                  <span
                    className="wiw-question-number"
                    data-answered={answers[questionIndex] !== null}
                  >
                    {answers[questionIndex] === null ? questionIndex + 1 : <CheckGlyph />}
                  </span>
                  {question.label}
                </p>
                <div className="wiw-options">
                  {question.options.map((option, optionIndex) => (
                    <span
                      className="wiw-option"
                      key={optionIndex}
                      data-picked={answers[questionIndex] === optionIndex}
                    >
                      {option}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <div className="wiw-card-foot">
            <span className="wiw-button" data-ready={count > 0}>
              {sendLabel}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function WorkspacePanel({ state, scene }) {
  const { t } = useT();
  const statusLabels = {
    waiting: t('wiw.status.waiting', 'Needs you'),
    working: t('wiw.status.working', 'Working'),
    done: t('wiw.status.done', 'Done'),
  };
  const stepWords = { done: t('wiw.step.done', 'done'), now: t('wiw.step.now', 'now') };
  const titleId = useId();
  const roadmapId = useId();
  const status = workspaceStatus(state);
  const current = activeStep(state);
  const beat = introBeat(state);
  const stepStateAt = (index) => (index < current ? 'done' : index === current ? 'now' : 'pending');

  return (
    <aside className="wiw-workspace" aria-labelledby={titleId}>
      <div className="wiw-workspace-head">
        <h3 className="wiw-workspace-title" id={titleId}>
          {t('wiw.workspace', 'Workspace')}
        </h3>
        <LineIcon name="close" />
      </div>
      <div className="wiw-workspace-body">
        {/* During the typed intro the panel fills in the order the real one does: status once
            the request is sent, roadmap and files once the plan arrives. Hidden parts keep
            their space. */}
        <div
          className="wiw-status-card"
          data-arrived={beat >= 1}
          aria-hidden={beat < 1 || undefined}
        >
          <span className="wiw-status" data-state={status}>
            <span className="wiw-status-dot" aria-hidden="true" />
            {statusLabels[status]}
          </span>
          <p className="wiw-stepline" data-arrived={beat >= 2}>
            {t('wiw.stepline', 'Step {step} of {total}', {
              step: Math.min(current + 1, STEP_COUNT),
              total: STEP_COUNT,
            })}
          </p>
          <div className="wiw-progress" data-arrived={beat >= 2} aria-hidden="true">
            {scene.steps.map((step, index) => (
              <span key={index} data-state={stepStateAt(index)} />
            ))}
          </div>
        </div>
        <div
          className="wiw-roadmap-block"
          data-arrived={beat >= 2}
          aria-hidden={beat < 2 || undefined}
        >
          <p className="wiw-label wiw-roadmap-label" id={roadmapId}>
            {t('wiw.roadmap', 'Roadmap')}
          </p>
          <ol className="wiw-roadmap" aria-labelledby={roadmapId}>
            {scene.steps.map((step, index) => (
              <li key={index} data-state={stepStateAt(index)}>
                <span className="wiw-marker" aria-hidden="true">
                  {stepStateAt(index) === 'done' && <CheckGlyph />}
                  {stepStateAt(index) === 'now' && <i />}
                </span>
                <span>
                  {step}
                  {stepStateAt(index) !== 'pending' && (
                    <span className="oi-sr-only">, {stepWords[stepStateAt(index)]}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <DemoCallout name="plan" node={state.node} callouts={scene.callouts} />
        </div>
        <WorkspaceFiles files={scene.files} state={state} arrived={beat >= 2} />
      </div>
      <DemoCallout name="workspace" node={state.node} callouts={scene.callouts} />
    </aside>
  );
}

function Results({ scene, state }) {
  const { t } = useT();
  const titleId = useId();
  // The owner's picks, in the words the chips showed.
  const picks = scene.questions
    .map((question, index) => question.options[state.answers[index]])
    .filter(Boolean)
    .join(' · ');
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
      <h3 className="wiw-pack-title wiw-rise" id={titleId} style={{ '--i': RISE_OFFSET }}>
        {scene.pack.title}
      </h3>
      <p className="wiw-fitted wiw-rise" style={{ '--i': RISE_OFFSET + 1 }}>
        {state.assumptions
          ? t('wiw.assumptions', 'Made with general assumptions. Answer 3 questions to fit it to you.')
          : t('wiw.fitted', 'fitted to: {picks}', { picks })}
      </p>
      <div className="wiw-pack">
        {columns.map((column, columnIndex) => (
          <section className="wiw-pack-column" key={columnIndex} aria-label={column.title}>
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
                  key={itemIndex}
                  style={{ '--i': firstRise[columnIndex] + itemIndex }}
                >
                  <LineIcon name={item.kind} />
                  <span>{item.name}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="wiw-advice">
        {t('wiw.advice', 'Drafts to review, not legal or financial advice.')}
      </p>
      <DemoCallout name="results" node={state.node} callouts={scene.callouts} />
    </div>
  );
}

function PauseGlyph({ paused }) {
  return (
    <svg viewBox="0 0 16 16" className="wiw-pause-glyph" aria-hidden="true" focusable="false">
      {paused ? (
        <path d="M5.5 3.8v8.4L12.2 8z" fill="currentColor" />
      ) : (
        <path d="M5.5 4v8M10.5 4v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function WatchItWork() {
  const { t } = useT();
  // Under reduced motion the film does not roll: it rests on the first example's finished
  // pack, and the pause button can start it.
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [state, dispatch] = useReducer(reducer, paused, (still) =>
    still ? finishedState(SCENES[0]) : initialState(SCENES[0].id)
  );
  const { node, playback } = state;
  const sceneIndex = Math.max(
    0,
    SCENES.findIndex((item) => item.id === state.sceneId)
  );
  // The film's own logic runs on SCENES (ids, counts); what shows is in the visitor's language.
  const scene = localScene(SCENES[sceneIndex], t);

  // The film rolls while it is on screen and not paused, and rests where it stands otherwise.
  const [inView, setInView] = useState(false);
  const [picked, setPicked] = useState(null);
  const sectionRef = useRef(null);
  const startedAt = useRef(0);
  const running = inView && !paused;
  const tabs = useRef([]);

  // A tab jumps the film to that example. Playing, it starts there and rolls on; paused, it
  // shows that example's finished pack. Either way the film keeps its own pace.
  function showScene(index) {
    const target = SCENES[index];
    setPicked(null);
    if (paused) dispatch({ type: 'SHOW', state: finishedState(target) });
    else dispatch({ type: 'RESET', sceneId: target.id });
  }

  function handleTabKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focused = tabs.current.findIndex((button) => button?.contains(event.target));
    const from = focused === -1 ? sceneIndex : focused;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? SCENES.length - 1
          : (from + (event.key === 'ArrowRight' ? 1 : -1) + SCENES.length) % SCENES.length;
    showScene(next);
    tabs.current[next]?.focus();
  }

  const beat = introBeat(state);
  // Typed by character, not UTF-16 unit, so no script splits a letter in half. A language
  // switch mid-type just changes the text: the count follows the new request's length.
  const requestChars = Array.from(scene.request);
  const requestLength = useRef(requestChars.length);
  requestLength.current = requestChars.length;
  const typed = typedCount(state, requestChars.length);
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
      dispatch({ type: 'TICK', node, elapsed, requestLength: requestLength.current });
    }, TICK_MS);
    return () => window.clearInterval(timer);
    // One clock per playing stretch: start it when a node starts or resumes, not on each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, node]);

  // On phones the tabs slide sideways: keep the playing one in view, moving only the row.
  useEffect(() => {
    const button = tabs.current[sceneIndex];
    const row = button?.parentElement;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const left = button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2;
    row.scrollTo?.({ left: Math.max(0, left), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [sceneIndex]);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The director: one small step per beat, each chosen from where the film stands now.
  const answered = answeredCount(state);
  useEffect(() => {
    if (!running) {
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
      delay = picked ? 900 : 1100;
      act = picked
        ? () => dispatch({ type: 'START', choice: 'ask', reducedMotion: false })
        : () => setPicked('ask');
    } else if (node === 'answer' && answered < scene.questions.length) {
      delay = 850;
      const question = state.answers.findIndex((answer) => answer === null);
      act = () => dispatch({ type: 'ANSWER', question, option: filmOption(scene, question) });
    } else if (node === 'answer') {
      delay = 900;
      act = () => dispatch({ type: 'SEND', reducedMotion: false });
    } else if (node === 'complete') {
      delay = 5200;
      act = () => {
        setPicked(null);
        dispatch({ type: 'RESET', sceneId: SCENES[(sceneIndex + 1) % SCENES.length].id });
      };
    }
    if (!act) return undefined;
    const timer = window.setTimeout(act, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, node, playback, answered, picked, sceneIndex]);

  return (
    <section
      ref={sectionRef}
      id="watch"
      className="wiw oi-section"
      aria-labelledby="watch-heading"
      data-playback={playback}
      data-node={node}
      data-paused={paused}
    >
      <div className="oi-container">
        <div className="wiw-head">
          <h2 className="oi-h2 wiw-heading" id="watch-heading">
            {t('wiw.heading', 'Watch it work')}
          </h2>
          <p className="oi-line wiw-line">{t('wiw.line', 'Example demo · sped up')}</p>
        </div>
        <p className="oi-sr-only">
          {t(
            'wiw.description',
            'A sped-up example that plays by itself: you ask for something, Orqanix makes a five-step plan, asks three questions, works through the steps and lists the first drafts it made.'
          )}
        </p>

        {/* The four examples as tabs: the playing one lights up and fills as its scene runs.
            They follow the film by themselves; a click only jumps ahead. */}
        <div className="wiw-pills" role="group" aria-label={t('wiw.examples', 'Examples')} onKeyDown={handleTabKey}>
          {SCENES.map((item, index) => (
            <button
              type="button"
              className="wiw-pill"
              key={item.id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              aria-pressed={index === sceneIndex}
              onClick={() => showScene(index)}
              style={
                index === sceneIndex
                  ? { '--wiw-progress': sceneProgress(state).toFixed(3) }
                  : undefined
              }
            >
              <span className="wiw-pill-label">{t(sceneKey(item.id, 'label'), item.label)}</span>
            </button>
          ))}
        </div>

        {/* Reserves the height of the tallest frame, so whatever swaps inside, the page
            below the demo stays where it is. The app window stays put; "goes black" is the
            chat and the Workspace fading out of it before the pack rises on its canvas. */}
        <div className="wiw-body">
          <div className="wiw-app" dir="ltr" aria-hidden="true" inert>
            <AppSidebar chatTitle={scene.chatTitle} />
            <div className="wiw-titlebar">
              <span className="wiw-dots">
                <i />
                <i />
                <i />
              </span>
              <p className="wiw-title">
                {scene.chatTitle}
                <ChevronGlyph />
              </p>
              <span className="wiw-brand">
                <OrqanixMark />
                Orqanix
                <LineIcon name="panel" />
              </span>
            </div>

            <div className="wiw-stage">
              {node !== 'complete' && (
                <div className="wiw-window" data-fading={node === 'results'}>
                  <div className="wiw-chat">
                    <p className="wiw-user" data-typing={beat === 0}>
                      {beat === 0 ? (
                        <>
                          {requestChars.slice(0, typed).join('')}
                          <span className="wiw-caret" />
                          {/* The untyped rest holds the bubble at its final size while it fills. */}
                          <span className="wiw-untyped">{requestChars.slice(typed).join('')}</span>
                        </>
                      ) : (
                        scene.request
                      )}
                    </p>
                    {beat >= 2 && (
                      <p className={node === 'intro' ? 'wiw-reply wiw-rise' : 'wiw-reply'}>
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
                        picked={picked}
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
                      />
                    )}
                    <Composer />
                  </div>

                  <WorkspacePanel state={state} scene={scene} />
                </div>
              )}

              {resultsShown && <Results scene={scene} state={state} />}
            </div>
          </div>

          <DemoCalloutCaption node={node} callouts={scene.callouts} />

          {/* The one control: autoplaying motion has to be stoppable. An icon, not a prompt. */}
          <div className="wiw-controls">
            <button
              type="button"
              className="wiw-pause"
              aria-label={paused ? t('wiw.play', 'Play demo') : t('wiw.pause', 'Pause demo')}
              onClick={() => setPaused((value) => !value)}
            >
              <PauseGlyph paused={paused} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
