import BannerStage, { Words } from './BannerStage';
import './window.css';

// 16px line icons, drawn like the app's.
const PATHS = {
  plus: 'M8 3.5v9M3.5 8h9',
  chip: 'M5 5h6v6H5zM6.5 2.5V5M9.5 2.5V5M6.5 11v2.5M9.5 11v2.5M2.5 6.5H5M2.5 9.5H5M11 6.5h2.5M11 9.5h2.5',
  panel: 'M2.5 3.5h11v9h-11zM10 3.5v9',
  send: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7',
  spark: 'M8 2.5l1.3 3.6 3.7 1.4-3.7 1.4L8 12.5 6.7 8.9 3 7.5l3.7-1.4z',
  tick: 'M3 8.5 6.5 12 13 4.5',
  doc: 'M4.5 2.5H9l3 3v8H4.5zM9 2.5v3h3M6.5 8.5h3M6.5 10.8h3',
  sheet: 'M3 3.5h10v9H3zM3 6.5h10M3 9.5h10M6.5 3.5v9',
  web: 'M2.5 3.5h11v9h-11zM2.5 6h11M6.3 8.3 4.8 9.6l1.5 1.3M9.7 8.3l1.5 1.3-1.5 1.3',
};

const ASK = 'Open a small coffee roastery';

// Faint rows and roadmap steps are bars (their lengths in %): shapes, not words.
const RECENT = [58, 74];
const PINNED = [66];
const STEPS = [72, 56, 84, 64, 46];

const FILES = [
  ['doc', 'Business Plan'],
  ['doc', 'Market Research'],
  ['sheet', 'Costs'],
  ['web', 'Landing Page'],
];

function Icon({ name }) {
  return (
    <svg viewBox="0 0 16 16" className="nb-icon">
      <path d={PATHS[name]} />
    </svg>
  );
}

/*
 * Orqanix for Mac: one app window. The ask is typed and sent, two reply lines rise, the
 * Workspace roadmap ticks off five steps as its bar fills, and the four files land. All the
 * timing lives in window.css.
 */
export default function WindowBanner({ className = '' }) {
  return (
    <BannerStage scene="window" className={`nb-window-banner ${className}`}>
      <div className="nb-window nb-window-app">
        <div className="nb-window-bar nb-window-top">
          <i />
          <i />
          <i />
          <span className="nb-chip nb-window-chip">
            <Icon name="chip" />
            <Words of="Apple silicon" />
          </span>
        </div>

        <div className="nb-window-side">
          <span className="nb-window-side-new">
            <Icon name="plus" />
            <Words of="New Chat" />
          </span>
          <span className="nb-window-side-label">
            <Words of="Recent" />
          </span>
          <span className="nb-window-side-row nb-window-side-active">
            <i style={{ width: '80%' }} />
          </span>
          {RECENT.map((width) => (
            <span key={width} className="nb-window-side-row">
              <i style={{ width: `${width}%` }} />
            </span>
          ))}
          <span className="nb-window-side-label">
            <Words of="Pinned" />
          </span>
          {PINNED.map((width) => (
            <span key={width} className="nb-window-side-row">
              <i style={{ width: `${width}%` }} />
            </span>
          ))}
        </div>

        <div className="nb-window-chat">
          <div className="nb-bubble nb-bubble-me nb-window-ask">
            <span className="nb-window-ghost">
              <Words of={ASK} />
            </span>
            <span className="nb-window-typed">
              <span className="nb-type" style={{ '--n': ASK.length }}>
                <Words of={ASK} />
              </span>
              <span className="nb-window-caret">
                <i className="nb-caret" />
              </span>
            </span>
          </div>
          <div className="nb-window-reply">
            <span className="nb-window-avatar">
              <Icon name="spark" />
            </span>
            <span className="nb-window-lines">
              <i />
              <i />
            </span>
          </div>
          <div className="nb-window-composer">
            <i />
            <span className="nb-window-send">
              <Icon name="send" />
            </span>
          </div>
        </div>

        <div className="nb-window-ws">
          <div className="nb-window-ws-head">
            <Words of="Workspace" />
            <Icon name="panel" />
          </div>
          <div className="nb-window-ws-body">
            <div className="nb-window-status">
              <i className="nb-window-live" />
              <span className="nb-window-track">
                <i />
              </span>
            </div>
            <div className="nb-window-cards">
              <div className="nb-window-card">
                <span className="nb-window-label">
                  <Words of="Roadmap" />
                </span>
                <div className="nb-window-roadmap">
                  <span className="nb-window-cursor" />
                  <ol className="nb-window-steps">
                    {STEPS.map((width) => (
                      <li key={width} className="nb-window-step">
                        <span className="nb-window-ring" />
                        <i className="nb-window-step-bar" style={{ width: `${width}%` }} />
                        <span className="nb-tick nb-window-done">
                          <Icon name="tick" />
                        </span>
                        <i
                          className="nb-window-step-bar nb-window-step-lit"
                          style={{ width: `${width}%` }}
                        />
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="nb-window-card">
                <span className="nb-window-label">
                  <Words of="Files" />
                </span>
                <ul className="nb-window-files">
                  {FILES.map(([kind, name]) => (
                    <li key={name} className="nb-window-slot">
                      <span className="nb-file">
                        <span className="nb-file-icon">
                          <Icon name={kind} />
                        </span>
                        <Words of={name} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <span className="nb-window-glint" />
        </div>
      </div>
    </BannerStage>
  );
}
