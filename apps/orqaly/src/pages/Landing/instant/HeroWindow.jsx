import { CheckGlyph, OrqanixMark } from './ui/Glyphs';
import './HeroWindow.css';

const LINK_LABEL =
  'Preview of the Orqanix desktop app: the assistant asks for details while the Workspace roadmap shows step 3 of 5. Jump to the interactive demo.';

const ICON_PATHS = {
  plus: 'M8 3.5v9M3.5 8h9',
  book: 'M8 4.6C6.8 3.7 5 3.3 2.5 3.3v8.5c2.5 0 4.3.4 5.5 1.3 1.2-.9 3-1.3 5.5-1.3V3.3c-2.5 0-4.3.4-5.5 1.3zM8 4.6v8.5',
  clock: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5v3.2l2 1.3',
  sliders:
    'M3 5h5.5M11.5 5H13M3 11h1.5M7.5 11H13M8.5 5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0zM4.5 11a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z',
  agents:
    'M2.4 8a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0zM10.4 4a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0zM10.4 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0zM5.4 7.2l5.1-2.5M5.4 8.8l5.1 2.5',
  mic: 'M8 2.5a1.8 1.8 0 0 0-1.8 1.8v3.4a1.8 1.8 0 0 0 3.6 0V4.3A1.8 1.8 0 0 0 8 2.5zM4.2 7.5a3.8 3.8 0 0 0 7.6 0M8 11.3v2.2',
  file: 'M4.5 2.5H9l3 3v8H4.5zM9 2.5v3h3',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  spark: 'M8 2.5l1.3 3.6 3.7 1.4-3.7 1.4L8 12.5 6.7 8.9 3 7.5l3.7-1.4zM12.2 11.2v2.3M11 12.4h2.4',
  plug: 'M6 2.5v3M10 2.5v3M4.5 5.5h7v2.2a3.5 3.5 0 0 1-7 0zM8 11.2v2.3',
  tools:
    'M3 13l5.2-5.2M9.2 3.6a2.8 2.8 0 0 0 3.2 3.9l-1.7-1.7.6-1.6 1.6-.6L11.2 1.9a2.8 2.8 0 0 0-2 1.7zM3.4 3.4l2.2 2.2',
  history: 'M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.6 2.8v2.4H5M8 5.2v3l2 1.2',
  chevron: 'M5.5 6.5L8 9l2.5-2.5',
};

const ROADMAP = [
  ['done', 'Your idea'],
  ['done', 'Market'],
  ['now', 'Costs'],
  ['pending', 'Marketing'],
  ['pending', 'Accounts'],
];

const PROGRESS = ['full', 'full', 'half', 'empty', 'empty'];

function Icon({ name }) {
  return (
    <svg viewBox="0 0 16 16" className="hw-icon" aria-hidden="true" focusable="false">
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

function NavRow({ icon, children }) {
  return (
    <span className="hw-nav-row">
      <Icon name={icon} />
      <span>{children}</span>
    </span>
  );
}

function FileRow({ region, name, tag, children }) {
  return (
    <div className="hw-file" data-region={region}>
      <Icon name="file" />
      <span className="hw-file-name">{name}</span>
      <span className="hw-file-tag">{tag}</span>
      {children}
    </div>
  );
}

/**
 * A picture of the desktop app in its dark theme. It is one link to the demo with a
 * written label, so its insides are hidden from assistive tech and hold nothing
 * focusable. Nothing in it changes state; the small loops (a status ping, a caret)
 * are CSS only and say "this is running", not "this is a video".
 */
export default function HeroWindow() {
  return (
    <a className="hw-link" href="#watch" aria-label={LINK_LABEL}>
      <div className="hw-window" aria-hidden="true">
        <span className="hw-traffic">
          <i />
          <i />
          <i />
        </span>
        <div className="hw-sidebar">
          <span className="hw-brand">
            <OrqanixMark className="hw-mark" />
            Orqanix
          </span>
          <NavRow icon="plus">New Chat</NavRow>
          <span className="hw-label hw-chats-label">RECENT</span>
          <span className="hw-chat-row hw-chat-row-selected">New business</span>
          <span className="hw-chat-row">Website</span>
          <span className="hw-label hw-chats-label">PINNED</span>
          <span className="hw-chat-row">Brand guide</span>
          <div className="hw-nav-sections">
            <div className="hw-nav-group" data-region="llms">
              <NavRow icon="spark">Intelligence</NavRow>
            </div>
            <div className="hw-nav-group" data-region="plugins">
              <NavRow icon="plug">Plugins</NavRow>
            </div>
            <NavRow icon="tools">Instruments</NavRow>
            <NavRow icon="history">History</NavRow>
          </div>
        </div>

        <div className="hw-chat">
          <p className="hw-bubble">
            I want to open a small coffee roastery next spring. What do I need to do first?
          </p>
          <p className="hw-reply">Here&apos;s my plan: 5 steps.</p>
          <div className="hw-subagent" data-region="orchestration">
            <Icon name="agents" />
            <span className="hw-subagent-name">Market research</span>
            <span className="hw-subagent-dot">·</span>
            <span className="hw-subagent-link">View session</span>
          </div>
          <div className="hw-question">
            <div className="hw-question-head">
              <span className="hw-question-title">Your Turn to Answer</span>
              <span className="hw-question-count">0 of 3 answered</span>
            </div>
            <p className="hw-question-text">Where will you register?</p>
            <div className="hw-chips">
              <span className="hw-chip">Latvia</span>
              <span className="hw-chip">Estonia</span>
            </div>
          </div>
          <div className="hw-composer" data-region="ready">
            <i className="hw-caret" />
            <span className="hw-placeholder">Ask whatever&apos;s on your mind.</span>
            <span className="hw-mic" data-region="voice">
              <Icon name="mic" />
            </span>
          </div>
        </div>

        <div className="hw-workspace">
          <div className="hw-workspace-head">
            <span>Workspace</span>
            <Icon name="close" />
          </div>
          <div className="hw-workspace-body">
            <div className="hw-status" data-region="layering">
              <div className="hw-status-row">
                <span className="hw-pill">
                  <i />
                  Needs you
                </span>
                <span className="hw-status-step">Step 3 of 5</span>
              </div>
              <div className="hw-progress">
                {PROGRESS.map((fill, index) => (
                  <span key={index} className={`hw-segment hw-segment-${fill}`}>
                    <i />
                  </span>
                ))}
              </div>
            </div>

            <div className="hw-roadmap" data-region="orchestration">
              <span className="hw-label">ROADMAP</span>
              <ol className="hw-steps">
                {ROADMAP.map(([state, title]) => (
                  <li key={title} className={`hw-step hw-step-${state}`}>
                    <span className="hw-marker">
                      {state === 'done' && <CheckGlyph className="hw-marker-check" />}
                      {state === 'now' && <i />}
                    </span>
                    <span className="hw-step-title">{title}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="hw-files">
              <span className="hw-label">LATEST FILES</span>
              <FileRow region="build" name="business-plan.md" tag="EDITED">
                <span className="hw-file-diff">
                  <span className="hw-diff-added">+12</span>{' '}
                  <span className="hw-diff-removed">−3</span>
                </span>
              </FileRow>
              <FileRow region="build" name="landing-a.html" tag="NEW" />
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
