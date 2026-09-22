import BannerStage, { Words } from './BannerStage';
import './wires.css';

/*
 * Connect any agent: an ask leaves the chat as a pulse, the Orqanix orb picks one of six
 * agents and sends it down that wire, and the result pulses back into the chat as a reply.
 * Three asks per loop (Manus, CrewAI, Grok). All timing lives in wires.css.
 */

// The two canvases in scene units: wide (16:7) and phone (4:5).
const LAYOUTS = {
  wide: { w: 100, h: 43.75, orb: [66, 22], r: 7, port: [32, 22] },
  phone: { w: 41.67, h: 52.08, orb: [20.83, 39.5], r: 6.4, port: [20.83, 25] },
};

// pick: which ask the agent answers (1-3); 0 = it rests this loop.
const AGENTS = [
  { name: 'Grok', pick: 3, wide: [43.5, 13.5], phone: [6.6, 32.5] },
  { name: 'Meta Muse', pick: 0, wide: [66, 6], phone: [35.1, 32.5] },
  { name: 'Manus', pick: 1, wide: [88.5, 13.5], phone: [35.1, 39.5] },
  { name: 'OpenClaw', pick: 0, wide: [88.5, 30.5], phone: [6.6, 46.5] },
  { name: 'CrewAI', pick: 2, wide: [66, 38], phone: [35.1, 46.5] },
  { name: 'Hermes', pick: 0, wide: [43.5, 30.5], phone: [6.6, 39.5] },
];

const ASKS = [
  ['Find 20 cafés in Riga', 'Manus'],
  ['Plan a launch week', 'CrewAI'],
  ['What is trending today?', 'Grok'],
];

const round = (n) => Math.round(n * 100) / 100;

function rim({ orb: [ox, oy], r }, [x, y]) {
  const angle = Math.atan2(y - oy, x - ox);
  return [ox + Math.cos(angle) * r, oy + Math.sin(angle) * r];
}

// Orb rim to agent, bent the same way for all six so they read as one turning wheel.
function agentWire(box, end) {
  const [sx, sy] = rim(box, end);
  const [x, y] = end;
  const cx = (sx + x) / 2 - (y - sy) * 0.14;
  const cy = (sy + y) / 2 + (x - sx) * 0.14;
  return `M${round(sx)} ${round(sy)}Q${round(cx)} ${round(cy)} ${x} ${y}`;
}

// Two layers per canvas: the quiet wires, and a glowing one for pulses and used wires.
function Wires({ layout }) {
  const box = LAYOUTS[layout];
  const [ex, ey] = rim(box, box.port);
  const talk = `M${box.port.join(' ')}L${round(ex)} ${round(ey)}`;
  const frame = { viewBox: `0 0 ${box.w} ${box.h}`, preserveAspectRatio: 'none' };
  return (
    <>
      <svg className={`nb-wires-svg nb-wires-${layout}`} {...frame}>
        <path className="nb-wires-line" d={talk} />
        <g className="nb-wires-base">
          {AGENTS.map((agent) => (
            <path key={agent.name} d={agentWire(box, agent[layout])} />
          ))}
        </g>
      </svg>
      <svg className={`nb-wires-svg nb-wires-glow nb-wires-${layout}`} {...frame}>
        {AGENTS.filter((agent) => agent.pick).map((agent) => {
          const d = agentWire(box, agent[layout]);
          return (
            <g key={agent.name} data-pick={agent.pick}>
              <path className="nb-wires-lit" d={d} pathLength="100" />
              <path className="nb-wires-go" d={d} pathLength="100" />
            </g>
          );
        })}
        <path className="nb-wires-talk" d={talk} pathLength="100" />
      </svg>
    </>
  );
}

export default function WiresBanner({ className = '' }) {
  return (
    <BannerStage scene="wires" className={`nb-wires ${className}`}>
      <Wires layout="wide" />
      <Wires layout="phone" />

      <div className="nb-wires-orb">
        <svg viewBox="0 0 100 100">
          <g className="nb-wires-ring nb-wires-ring-outer">
            <circle cx="50" cy="50" r="46" pathLength="100" />
          </g>
          <g className="nb-wires-ring nb-wires-ring-mid">
            <circle cx="50" cy="50" r="36" />
            <circle className="nb-wires-node" cx="86" cy="50" r="1.8" />
            <circle className="nb-wires-node" cx="14" cy="50" r="1.8" />
          </g>
          <g className="nb-wires-ring nb-wires-ring-ticks">
            <circle cx="50" cy="50" r="27" pathLength="100" />
          </g>
        </svg>
        <span className="nb-wires-ping" />
        <span className="nb-wires-core" />
      </div>

      {AGENTS.map(({ name, pick, wide, phone }) => (
        <span
          key={name}
          className="nb-chip nb-wires-agent"
          data-pick={pick || undefined}
          style={{ '--x': wide[0], '--y': wide[1], '--px': phone[0], '--py': phone[1] }}
        >
          <i />
          <Words of={name} />
        </span>
      ))}

      <div className="nb-window nb-wires-chat">
        <div className="nb-window-bar">
          <i />
          <i />
          <i />
        </div>
        <div className="nb-wires-log">
          {ASKS.map(([ask, agent], index) => (
            <div key={agent} className="nb-wires-pair" data-pick={index + 1}>
              <span className="nb-bubble nb-bubble-me nb-wires-ask">
                <Words of={ask} />
              </span>
              <span className="nb-chip nb-wires-reply">
                <span className="nb-tick">
                  <svg viewBox="0 0 16 16">
                    <path d="M4 8.4l2.6 2.6L12 5.6" />
                  </svg>
                </span>
                <Words of={agent} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <span className="nb-wires-port" />
    </BannerStage>
  );
}
