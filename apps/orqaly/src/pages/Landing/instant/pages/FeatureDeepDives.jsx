import { Seen } from '../SpeedStrip';
import { CheckGlyph } from '../ui/Glyphs';
import { DEEP_DIVE_IDS, FEATURES } from './features.data';
import './FeatureDeepDives.css';
import { DropboxMark, GoogleDriveMark, NotionMark, ObsidianMark } from '../brandMarks';

// The app's left menu, top to bottom.
const MENU = ['New Chat', 'Recent', 'Pinned', 'Intelligence', 'Plugins', 'Instruments', 'History'];

// The same little job runs through all four mocks.
const ROADMAP = ['Your idea', 'Market', 'Costs', 'Marketing', 'Accounts'];
const ROADMAP_NOW = 3;

const FILES = [
  ['business-plan.md', 'EDITED'],
  ['landing-a.html', 'NEW'],
  ['costs.csv', 'NEW'],
];

// The kanban board: three lanes, each card a task with the kind of work it is.
const BOARD = [
  {
    lane: 'To do',
    cards: [
      ['Sign-up checklist', 'Accounts'],
      ['Partner pitch outline', 'Materials'],
    ],
  },
  {
    lane: 'Working',
    cards: [
      ['Landing-page drafts', 'Web'],
      ['Start-up budget', 'Docs'],
    ],
  },
  {
    lane: 'Done',
    cards: [
      ['Market research', 'Research'],
      ['Business plan', 'Docs'],
      ['Marketing plan', 'Marketing'],
    ],
  },
];

// Where knowledge comes from: name, one line, logo, and whether the mock shows it linked.
const SOURCES = [
  ['Notion', 'Sync your pages, or use them live.', NotionMark, true],
  ['Obsidian', 'Import a vault export.', ObsidianMark, false],
  ['Google Drive', 'Sync files, or import exports.', GoogleDriveMark, false],
  ['Dropbox', 'Connect to sync or import files.', DropboxMark, false],
];

// The flow chart: five boxes (x, y, label) and the six lines between them, in drawing order.
const NODES = [
  [86, 6, ROADMAP[0]],
  [4, 84, ROADMAP[1]],
  [86, 84, ROADMAP[2]],
  [168, 84, ROADMAP[3]],
  [86, 162, ROADMAP[4]],
];

const EDGES = [
  'M120 34V60H38V84',
  'M120 34V84',
  'M120 34V60H202V84',
  'M38 112V138H120V162',
  'M120 112V162',
  'M202 112V138H120',
];

const STORIES = DEEP_DIVE_IDS.map((id) => FEATURES.find((feature) => feature.id === id));

function twoDigits(value) {
  return String(value).padStart(2, '0');
}

// A story only re-cuts the feature's own words: its sentences, then the note, then the second line.
function storyLines(feature) {
  const sentences = feature.today
    .split(/\.\s+/)
    .map((sentence) => (sentence.endsWith('.') ? sentence : `${sentence}.`));
  return [...sentences, feature.note, feature.also].filter(Boolean);
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
    surface.style.setProperty('--mx', `${point.x - box.left}px`);
    surface.style.setProperty('--my', `${point.y - box.top}px`);
  });
}

function FileGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="ofd-glyph" aria-hidden="true" focusable="false">
      <path d="M4 1.75h5.25L12.5 5v9.25h-8.5zM9 2v3.25h3.25" />
    </svg>
  );
}

function Pill({ state, children }) {
  return (
    <span className="ofd-pill" data-state={state}>
      {state === 'done' ? <CheckGlyph className="ofd-pill-check" /> : <i />}
      {children}
    </span>
  );
}

function Ghost({ width }) {
  return <i className="ofd-ghost" style={{ '--w': `${width}%` }} />;
}

/** The app window: a title bar, the left menu when the story needs it, and the part on show. */
function AppWindow({ title, menu, children }) {
  return (
    <>
      <div className="ofd-bar">
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      <div className="ofd-body">
        {menu && (
          <ul className="ofd-menu">
            {MENU.map((item) => (
              <li key={item} data-on={item === menu}>
                {item}
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </>
  );
}

function WorkspaceMock() {
  return (
    <AppWindow title="Orqanix" menu="New Chat">
      <div className="ofd-chat">
        <span className="ofd-bubble">
          <Ghost width={100} />
          <Ghost width={62} />
        </span>
        <Ghost width={88} />
        <Ghost width={72} />
        <Ghost width={80} />
        <span className="ofd-composer">Ask whatever&apos;s on your mind.</span>
      </div>
      <div className="ofd-panel">
        <div className="ofd-panel-head ofd-in" style={{ '--i': 0 }}>
          <span>Workspace</span>
          <span className="ofd-pills">
            <Pill state="working">Working</Pill>
            <Pill state="waiting">Needs you</Pill>
            <Pill state="done">Done</Pill>
          </span>
        </div>
        <div className="ofd-progress ofd-in" style={{ '--i': 1 }}>
          <i />
        </div>
        <span className="ofd-label ofd-in" style={{ '--i': 2 }}>
          FILES
        </span>
        {FILES.map(([name, tag], index) => (
          <div key={name} className="ofd-row ofd-in" style={{ '--i': index + 3 }}>
            <FileGlyph />
            <span className="ofd-row-name">{name}</span>
            <span className="ofd-filetag">{tag}</span>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

function FlowMock() {
  return (
    <AppWindow title="Workspace">
      <div className="ofd-panel ofd-road-pane">
        <span className="ofd-label ofd-in" style={{ '--i': 0 }}>
          ROADMAP
        </span>
        <div className="ofd-road-wrap">
          <ol className="ofd-road">
            {ROADMAP.map((title, index) => (
              <li
                key={title}
                className="ofd-step"
                data-state={
                  index < ROADMAP_NOW ? 'done' : index === ROADMAP_NOW ? 'now' : 'pending'
                }
                style={{ '--i': index }}
              >
                <span className="ofd-marker">
                  {index < ROADMAP_NOW && <CheckGlyph className="ofd-marker-check" />}
                  {index === ROADMAP_NOW && <i />}
                </span>
                <span className="ofd-step-name">{title}</span>
              </li>
            ))}
          </ol>
          <i className="ofd-road-light" />
        </div>
      </div>
      <div className="ofd-panel ofd-chart-pane">
        <span className="ofd-label ofd-in" style={{ '--i': 1 }}>
          FLOW CHART
        </span>
        <svg viewBox="0 0 240 196" className="ofd-chart" aria-hidden="true" focusable="false">
          {EDGES.map((d, index) => (
            <path key={d} className="ofd-edge" d={d} pathLength="1" style={{ '--i': index }} />
          ))}
          <path className="ofd-pulse" d="M120 34V162" pathLength="1" />
          {NODES.map(([x, y, label], index) => (
            <g key={label} className="ofd-node" style={{ '--i': index }}>
              <rect x={x} y={y} width="68" height="28" rx="9" pathLength="1" />
              <text x={x + 34} y={y + 17.5} textAnchor="middle">
                {label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </AppWindow>
  );
}

// A kanban board: what is waiting, what the agents are on right now, what is finished.
// The lanes arrive left to right, then their cards top to bottom.
function TrackerMock() {
  let turn = 1;
  return (
    <AppWindow title="Task tracker">
      <div className="ofd-panel ofd-board-panel">
        <div className="ofd-panel-head ofd-in" style={{ '--i': 0 }}>
          <Pill state="working">Working</Pill>
          <span className="ofd-board-count">7 tasks</span>
        </div>
        <div className="ofd-board">
          {BOARD.map(({ lane, cards }) => {
            const state = lane === 'Working' ? 'live' : lane === 'Done' ? 'done' : 'todo';
            return (
              <div key={lane} className="ofd-lane" data-state={state}>
                <span className="ofd-lane-head ofd-in" style={{ '--i': turn++ }}>
                  <span className="ofd-label">{lane}</span>
                  <b>{cards.length}</b>
                </span>
                {cards.map(([name, kind], index) => (
                  <div
                    key={name}
                    className="ofd-task ofd-in"
                    data-lift={state === 'live' && index === 0 ? '' : undefined}
                    style={{ '--i': turn++ }}
                  >
                    <span className="ofd-task-kind">{kind}</span>
                    <span className="ofd-task-name">{name}</span>
                    {state === 'live' && <span className="ofd-task-bar" />}
                    {state === 'done' && <CheckGlyph className="ofd-task-check" />}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </AppWindow>
  );
}

// Knowledge storage: drop files in, or connect the places your knowledge already lives.
function KnowledgeMock() {
  return (
    <AppWindow title="Knowledge storage">
      <div className="ofd-panel ofd-kb">
        <div className="ofd-drop ofd-in" style={{ '--i': 0 }}>
          <svg viewBox="0 0 24 24" className="ofd-drop-glyph" aria-hidden="true" focusable="false">
            <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96 5.75 5.75 0 0 1 11.2 0A4.5 4.5 0 0 1 17 18.5" />
            <path d="M12 19v-7.5M9 14l3-3 3 3" />
          </svg>
          <span className="ofd-drop-title">Drop files here, or click to browse</span>
          <span className="ofd-drop-note">Up to 20 files, 5 MB each</span>
          {/* Three files fly in and land, over and over: the drop zone shows what it is for. */}
          <span className="ofd-drop-files" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <span className="ofd-label ofd-in" style={{ '--i': 1 }}>
          Connected sources
        </span>
        {SOURCES.map(([name, line, Logo, linked], index) => (
          <div key={name} className="ofd-source ofd-in" style={{ '--i': index + 2 }}>
            <span className="ofd-source-logo">
              <Logo />
            </span>
            <span className="ofd-source-text">
              <span className="ofd-row-name">{name}</span>
              <span className="ofd-source-line">{line}</span>
            </span>
            <span className="ofd-connect" data-linked={linked || undefined}>
              {linked ? 'Connected' : 'Connect'}
            </span>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

const MOCKS = {
  workspace: WorkspaceMock,
  flow: FlowMock,
  tracker: TrackerMock,
  knowledge: KnowledgeMock,
};

function Story({ feature, index }) {
  const Mock = MOCKS[feature.id];
  const [lead, ...rest] = storyLines(feature);
  const headingId = `deep-${feature.id}-heading`;
  return (
    <Seen
      as="section"
      id={`deep-${feature.id}`}
      className="oi-section oif-section oif-ruled ofd-section"
      aria-labelledby={headingId}
      data-side={index % 2 ? 'left' : 'right'}
    >
      <div className="oi-container ofd-story">
        <div className="ofd-words">
          <p className="oi-tag oi-tag-bracket ofd-rise" style={{ '--i': 0 }}>
            {twoDigits(index + 1)} / {twoDigits(STORIES.length)}
          </p>
          <h2 id={headingId} className="oi-h2 ofd-title ofd-rise" style={{ '--i': 1 }}>
            {feature.name}
          </h2>
          <p className="ofd-lead ofd-rise" style={{ '--i': 2 }}>
            {lead}
          </p>
          <ul className="ofd-lines">
            {rest.map((line, lineIndex) => (
              <li key={line} className="ofd-line ofd-rise" style={{ '--i': lineIndex + 3 }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <Seen className="ofd-visual" threshold={0.3} aria-hidden="true">
          <div className="ofd-mock" data-mock={feature.id} onPointerMove={trackPointer}>
            <Mock />
          </div>
        </Seen>
      </div>
    </Seen>
  );
}

/** Four features up close: a few of their own words beside a moving piece of the app. */
export default function FeatureDeepDives() {
  return STORIES.map((feature, index) => (
    <Story key={feature.id} feature={feature} index={index} />
  ));
}
