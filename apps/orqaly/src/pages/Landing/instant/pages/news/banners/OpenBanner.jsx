import BannerStage from './BannerStage';
import './open.css';

const ICONS = {
  folder: 'M2 4.5h4.2l1.4 1.6H14v6.4H2z',
  file: 'M4.5 2.5H9l3 3v8H4.5zM9 2.5v3h3',
};

// The repo's top level (backend/, apps/, docs/, LICENSE, README.md), drawn as icons and bars:
// the banner carries no words. The fourth row, LICENSE, is the one that opens.
const TREE = ['folder', 'folder', 'folder', 'file', 'file'];
const OPEN_ROW = 3;

// The commit graph, in its own units (42 x 30). Main runs along y = 15; one branch goes up,
// one goes down, and each comes back into main at a merge (x = 27 and 36).
const BRANCHES = [
  'M7 15C9 15 9 5.5 11 5.5H23C25 5.5 25 15 27 15',
  'M16 15C18 15 18 24.5 20 24.5H32C34 24.5 34 15 36 15',
];
const COMMITS = [
  [7, 15],
  [16, 15],
  [14, 5.5],
  [20, 5.5],
  [23, 24.5],
  [29, 24.5],
];
const MERGES = [27, 36];

function Icon({ name }) {
  return (
    <svg className="nb-open-ico" viewBox="0 0 16 16">
      <path d={ICONS[name]} />
    </svg>
  );
}

/*
 * Opening the source: a file tree opens its LICENSE, its title types in and a seal lands, then a
 * commit graph grows beside it. Main runs left to right, two branches split off, contributors
 * (plain rings) join them, and both merge back into main with a tick.
 */
export default function OpenBanner({ className = '' }) {
  return (
    <BannerStage scene="open" className={`nb-open ${className}`}>
      <div className="nb-window nb-open-editor">
        <div className="nb-window-bar">
          <i />
          <i />
          <i />
        </div>
        <div className="nb-open-body">
          <div className="nb-open-tree">
            {TREE.map((icon, i) => (
              <div
                key={i}
                className={i === OPEN_ROW ? 'nb-open-row nb-open-row-on' : 'nb-open-row'}
              >
                <Icon name={icon} />
                <i className="nb-open-name" />
                {i === OPEN_ROW && (
                  <>
                    <i className="nb-open-click" />
                    <svg className="nb-open-pointer" viewBox="0 0 16 16">
                      <path d="M3 1.5v11.5l3.1-2.8 2 4.3 2.1-1-2-4.2h4.3z" />
                    </svg>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="nb-open-pane">
            <div className="nb-open-tabs">
              <span className="nb-open-tab">
                <Icon name="file" />
                <i className="nb-open-tab-name" />
              </span>
            </div>
            <div className="nb-open-doc">
              <div className="nb-open-line">
                <div className="nb-open-title">
                  <span className="nb-open-words">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="nb-open-caret">
                    <i className="nb-caret" />
                  </span>
                </div>
                <svg className="nb-open-seal" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M7.6 12.4l3 3 5.8-6.2" pathLength="1" />
                </svg>
              </div>
              {[1, 2, 3, 4, 5].map((n) => (
                <i key={n} className={`nb-open-bar nb-open-bar-${n}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <i className="nb-open-wire" />
      <i className="nb-open-spark" />

      <div className="nb-open-graph">
        <svg viewBox="0 0 42 30">
          <path className="nb-open-track" d="M2 15H40" />
          {BRANCHES.map((d) => (
            <path key={d} className="nb-open-track" d={d} />
          ))}
          {BRANCHES.map((d, i) => (
            <path
              key={d}
              className={`nb-open-branch nb-open-branch-${i + 1}`}
              d={d}
              pathLength="1"
            />
          ))}
          <path className="nb-open-main" d="M2 15H40" pathLength="1" />
          <path className="nb-open-pulse" d="M2 15H40" pathLength="1" />
          {COMMITS.slice(2).map(([x, y], i) => {
            const up = y < 15;
            return (
              <g key={x} transform={`translate(${x} ${up ? 1.9 : 28.1})`}>
                <g className={`nb-open-person nb-open-person-${i + 1}`}>
                  <path d={up ? 'M0 1.35V2.95' : 'M0 -1.35V-2.95'} />
                  <circle r="1.35" />
                  <circle className="nb-open-dot" r="0.75" />
                </g>
              </g>
            );
          })}
          {COMMITS.map(([x, y], i) => (
            <circle
              key={x}
              className={`nb-open-commit nb-open-commit-${i + 1}`}
              cx={x}
              cy={y}
              r={y === 15 ? 0.75 : 0.65}
            />
          ))}
          <g transform="translate(2 15)">
            <g className="nb-open-root">
              <circle r="1.25" />
              <circle className="nb-open-dot" r="0.5" />
            </g>
          </g>
          {MERGES.map((x, i) => (
            <g key={x} transform={`translate(${x} 15)`}>
              <g className={`nb-open-tick nb-open-tick-${i + 1}`}>
                <circle r="1.15" />
                <path d="M-0.5 0.05L-0.12 0.42L0.52-0.38" />
              </g>
            </g>
          ))}
          <g transform="translate(40 15)">
            <circle className="nb-open-ripple" r="0.85" />
            <circle className="nb-open-head" r="0.85" />
          </g>
        </svg>
      </div>
    </BannerStage>
  );
}
