import BannerStage, { Words } from './BannerStage';
import './phone.css';

const ICONS = {
  back: 'M10 3.5 5.5 8l4.5 4.5',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  plus: 'M8 4.5v7M4.5 8h7',
  tick: 'M4 8.4l2.7 2.6L12 5.6',
  folder: 'M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z',
  phone:
    'M5.5 1.5h5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM7.2 12.5h1.6',
  doc: 'M4.5 2.5H9l3 3v8H4.5zM9 2.5v3h3M6.5 8.5h3M6.5 10.8h3',
  sheet: 'M3 3.5h10v9H3zM3 6.5h10M3 9.5h10M6.5 3.5v9',
  send: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7',
  web: 'M2.5 3.5h11v9h-11zM2.5 6h11M6.3 8.3 4.8 9.6l1.5 1.3M9.7 8.3l1.5 1.3-1.5 1.3',
};

// The ask is typed on two lines so it fits the phone's input.
const TYPED = ['Plan my coffee', 'roastery launch'];
const STEPS = ['Research', 'Plan', 'Build'];
const FILES = [
  ['doc', 'plan.md'],
  ['sheet', 'costs.csv'],
  ['web', 'site.html'],
];

// The dotted arc from the phone to the Mac, one per layout. One viewBox unit is one --u.
const ARCS = [
  ['wide', '0 0 19 13', 'M1.9 12C5.6 1.5 13.4 1.5 17.1 12'],
  ['tall', '0 0 17 21', 'M1 1.5C11 1.5 15.5 9 9.5 19.4'],
];

// A ring marks each end of the arc: its first and last points.
function arcEnds(d) {
  const n = d.match(/[\d.]+/g).map(Number);
  return [n[0], n[1], n.at(-2), n.at(-1)];
}

function Icon({ name }) {
  return (
    <svg className="nb-icon" viewBox="0 0 16 16">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Start a task on the phone, pick up the files on the Mac.
export default function PhoneBanner({ className = '' }) {
  return (
    <BannerStage scene="phone" className={`nb-phone ${className}`}>
      <i className="nb-phone-glow" />

      <div className="nb-phone-device">
        <div className="nb-phone-screen">
          <i className="nb-phone-island" />
          <div className="nb-phone-head">
            <Icon name="back" />
            <i className="nb-phone-orb" />
            <Icon name="more" />
          </div>
          <div className="nb-phone-chat">
            <span className="nb-bubble nb-bubble-me nb-phone-ask">
              <Words of={TYPED.join(' ')} />
            </span>
            <div className="nb-phone-steps">
              {STEPS.map((step) => (
                <div key={step} className="nb-phone-step">
                  <span className="nb-phone-mark">
                    <svg className="nb-phone-spin" viewBox="0 0 16 16">
                      <circle cx="8" cy="8" r="6" pathLength="100" />
                    </svg>
                    <span className="nb-tick">
                      <Icon name="tick" />
                    </span>
                  </span>
                  <Words of={step} />
                </div>
              ))}
            </div>
          </div>
          <div className="nb-phone-compose">
            <div className="nb-phone-typed">
              {TYPED.map((line) => (
                <span key={line} className="nb-phone-line">
                  <span className="nb-type" style={{ '--n': line.length }}>
                    <Words of={line} />
                  </span>
                  <span className="nb-phone-caret">
                    <i className="nb-caret" />
                  </span>
                </span>
              ))}
            </div>
            <div className="nb-phone-actions">
              <span className="nb-phone-plus">
                <Icon name="plus" />
              </span>
              <span className="nb-phone-send">
                <Icon name="send" />
              </span>
            </div>
          </div>
          <i className="nb-phone-home" />
        </div>
      </div>

      <div className="nb-window nb-phone-mac">
        <div className="nb-window-bar">
          <i />
          <i />
          <i />
        </div>
        <div className="nb-phone-mac-body">
          <div className="nb-phone-side">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="nb-phone-ws">
            <div className="nb-phone-ws-head">
              <Icon name="folder" />
              <Words of="Workspace" />
              <span className="nb-phone-from">
                <Icon name="phone" />
              </span>
            </div>
            <div className="nb-phone-files">
              {FILES.map(([kind, name]) => (
                <div key={name} className="nb-phone-slot">
                  <div className="nb-file nb-phone-file">
                    <span className="nb-file-icon">
                      <Icon name={kind} />
                    </span>
                    <span className="nb-phone-file-name">
                      <Words of={name} />
                    </span>
                    <span className="nb-phone-state">
                      <span className="nb-phone-writing">
                        <Words of="writing" />
                        <i />
                      </span>
                      <span className="nb-tick">
                        <Icon name="tick" />
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {ARCS.map(([key, box, d]) => {
        const [x1, y1, x2, y2] = arcEnds(d);
        return (
          <svg key={key} className={`nb-phone-arc nb-phone-arc-${key}`} viewBox={box}>
            <path className="nb-phone-arc-dots" d={d} />
            <path className="nb-phone-arc-trail" d={d} pathLength="100" />
            <path className="nb-phone-arc-dot nb-phone-arc-halo" d={d} pathLength="100" />
            <path className="nb-phone-arc-dot" d={d} pathLength="100" />
            <circle className="nb-phone-ping nb-phone-ping-from" cx={x1} cy={y1} r="0.5" />
            <circle className="nb-phone-ping nb-phone-ping-to" cx={x2} cy={y2} r="0.5" />
            <circle className="nb-phone-end" cx={x1} cy={y1} r="0.42" />
            <circle className="nb-phone-end" cx={x2} cy={y2} r="0.42" />
          </svg>
        );
      })}
    </BannerStage>
  );
}
