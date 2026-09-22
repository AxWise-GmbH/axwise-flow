import BannerStage, { Words } from './BannerStage';
import './swarm.css';

const ASK = 'Summarize supplier emails';
// Six tiny models, one small job each, in the order they work.
const JOBS = ['read', 'sort', 'check', 'sum', 'write', 'cite'];
// One answer line per model, as a share of the card's width.
const LINES = [92, 70, 84, 58, 78, 46];

// Wire geometry in banner units, one set per canvas. Keep in step with swarm.css: the pill's
// centre and bottom, the node row (first centre, gap, top, bottom) and the card's top.
const CANVASES = [
  {
    name: 'wide',
    w: 100,
    h: 43.75,
    ask: { x: 42, y: 8.3, fan: 0.3 },
    row: { x: 16, gap: 10.4, top: 14.8, bottom: 21.8 },
    card: { x: 42, y: 27.3, fan: 0.36 },
  },
  {
    name: 'phone',
    w: 41.67,
    h: 52.08,
    ask: { x: 20.83, y: 9, fan: 0.5 },
    row: { x: 4.83, gap: 6.4, top: 16.8, bottom: 23.5 },
    card: { x: 15.3, y: 29.5, fan: 0.55 },
  },
];

const round = (value) => Math.round(value * 100) / 100;

// A soft S from (x1, y1) down to (x2, y2).
function curve(x1, y1, x2, y2) {
  const mid = round((y1 + y2) / 2);
  return `M${round(x1)} ${y1}C${round(x1)} ${mid} ${round(x2)} ${mid} ${round(x2)} ${y2}`;
}

function Wires({ canvas: { name, w, h, ask, row, card } }) {
  const xs = JOBS.map((_, index) => row.x + index * row.gap);
  const mid = row.x + row.gap * 2.5;
  const split = xs.map((x) => curve(ask.x + (x - mid) * ask.fan, ask.y, x, row.top));
  const merge = xs.map((x) => curve(x, row.bottom, card.x + (x - mid) * card.fan, card.y));
  return (
    <svg
      className={`nb-wires nb-swarm-wires nb-swarm-${name}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <g className="nb-swarm-split">
        {split.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g className="nb-swarm-merge">
        {merge.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {/* The pieces going out and the parts coming back: one travelling dot per wire. */}
      <g className="nb-swarm-pieces">
        {split.map((d) => (
          <path key={d} d={d} pathLength={100} />
        ))}
      </g>
      <g className="nb-swarm-parts">
        {merge.map((d) => (
          <path key={d} d={d} pathLength={100} />
        ))}
      </g>
    </svg>
  );
}

/*
 * Many tiny LLMs, one answer: the request splits into six small jobs, six tiny models work
 * one after another, their parts stack into one answer, and the cost bar stops below the
 * $0.01 goal (a goal, not a measurement).
 */
export default function SwarmBanner({ className = '' }) {
  return (
    <BannerStage scene="swarm" className={`nb-swarm ${className}`}>
      {CANVASES.map((canvas) => (
        <Wires key={canvas.name} canvas={canvas} />
      ))}

      <div className="nb-swarm-ask">
        <span className="nb-swarm-ask-text">
          <span className="nb-type nb-swarm-type" style={{ '--n': ASK.length }}>
            <Words of={ASK} />
          </span>
          <i className="nb-caret nb-swarm-caret" />
        </span>
        <span className="nb-swarm-send">
          <svg className="nb-icon" viewBox="0 0 16 16">
            <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
          </svg>
        </span>
      </div>

      <div className="nb-swarm-nodes">
        {JOBS.map((job) => (
          <span className="nb-swarm-node" key={job}>
            <span className="nb-mono nb-swarm-label">
              <Words of={job} />
            </span>
          </span>
        ))}
        <span className="nb-swarm-spot" />
      </div>

      <div className="nb-window nb-swarm-card">
        <div className="nb-window-bar">
          <i />
          <i />
          <i />
          <span className="nb-swarm-card-name">
            <Words of="answer" />
          </span>
          <span className="nb-tick nb-swarm-tick">
            <svg viewBox="0 0 16 16">
              <path d="M4 8.5l2.6 2.5L12 5.5" />
            </svg>
          </span>
        </div>
        <div className="nb-swarm-rows">
          {LINES.map((width, index) => (
            <span className="nb-swarm-row" key={JOBS[index]} style={{ '--w': `${width}%` }} />
          ))}
        </div>
      </div>

      <div className="nb-swarm-meter">
        <span className="nb-swarm-fill" />
        <span className="nb-swarm-goal">
          <span className="nb-mono nb-swarm-goal-label">
            <Words of="$0.01" />
            <Words of="goal" />
          </span>
        </span>
        <span className="nb-mono nb-swarm-cost">
          <Words of="cost" />
        </span>
      </div>
    </BannerStage>
  );
}
