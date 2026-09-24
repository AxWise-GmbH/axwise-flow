import BannerStage, { Words } from './BannerStage';
import './merge.css';

// 16 x 16 line icons.
const ICONS = {
  ask: 'M3 3.5h10v7H7.2L4.5 13v-2.5H3z',
  search: 'M7.2 3a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4zM10.3 10.3 13 13',
  table: 'M3 3.5h10v9H3zM3 6.5h10M3 9.5h10M6.5 3.5v9',
  doc: 'M4.5 2.5H9l3 3v8H4.5zM9 2.5v3h3M6.5 8.5h3M6.5 10.8h3',
  who: 'M8 3a2.3 2.3 0 1 1 0 4.6A2.3 2.3 0 0 1 8 3zM3.8 13a4.2 4.2 0 0 1 8.4 0',
  checks: 'M3.5 8.3l3 3 6-6.3',
  fallback: 'M6 4.5l-3 3 3 3M3 7.5h6.5a3 3 0 0 1 0 6H8',
};

// Two line rings glide together and become the one orb.
const RINGS = [
  ['decide', 'AxWise', 'decides'],
  ['do', 'Orqaly', 'does'],
];

// What AxWise decides for the task.
const DECISION = [
  ['who', 'research agent'],
  ['checks', '2'],
  ['fallback', 'a person'],
];

// The tools Orqaly works with, lit in turn.
const TOOLS = ['search', 'table', 'doc'];

// Task in, file out, and a link from each half of the orb to its card.
const WIRES = ['in', 'out', 'decide', 'tools'];

function Icon({ name }) {
  return (
    <svg viewBox="0 0 16 16" className="nb-icon" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

/*
 * AxWise decides, Orqaly does the work: two rings merge into the Orqanix orb, then one task
 * passes through it. The decide half pops a decision card, the do half lights its tools, and
 * the finished file leaves on the right.
 */
export default function MergeBanner({ className = '' }) {
  return (
    <BannerStage scene="merge" className={`nb-merge ${className}`}>
      <div className="nb-merge-stage">
        {WIRES.map((wire) => (
          <i key={wire} className={`nb-merge-wire nb-merge-wire-${wire}`} />
        ))}
        <i className="nb-merge-packet nb-merge-packet-in" />
        <i className="nb-merge-packet nb-merge-packet-out" />

        <i className="nb-merge-bloom" />
        <i className="nb-merge-burst" />
        {RINGS.map(([side]) => (
          <svg
            key={side}
            className={`nb-merge-ring nb-merge-ring-${side}`}
            viewBox="0 0 100 100"
            focusable="false"
          >
            <circle className="nb-merge-spokes" cx="50" cy="50" r="41" pathLength="360" />
            <circle className="nb-merge-rim" cx="50" cy="50" r="33" />
          </svg>
        ))}
        {RINGS.map(([side, name, verb]) => (
          <span key={side} className={`nb-chip nb-merge-label nb-merge-label-${side}`}>
            <b>
              <Words of={name} />
            </b>
            <span>
              <Words of={verb} />
            </span>
          </span>
        ))}
        <span className="nb-merge-mark">
          <Words of="Orqanix" />
        </span>

        <div className="nb-merge-task">
          <span className="nb-merge-task-icon">
            <Icon name="ask" />
          </span>
          <Words of="Check my supplier contracts" />
        </div>

        <div className="nb-merge-decide">
          {DECISION.map(([key, value]) => (
            <span key={key} className="nb-merge-row">
              <Icon name={key} />
              <span className="nb-merge-key">
                <Words of={key} />
              </span>
              <Words of={value} />
            </span>
          ))}
        </div>

        <div className="nb-merge-tools">
          {TOOLS.map((tool) => (
            <span key={tool} className="nb-merge-tool">
              <Icon name={tool} />
            </span>
          ))}
        </div>

        <div className="nb-merge-file nb-file">
          <span className="nb-file-icon">
            <Icon name="doc" />
          </span>
          <span className="nb-mono">
            <Words of="contract-review.md" />
          </span>
          <span className="nb-tick nb-merge-tick">
            <Icon name="checks" />
          </span>
        </div>
      </div>
    </BannerStage>
  );
}
