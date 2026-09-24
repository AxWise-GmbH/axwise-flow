import { CheckGlyph } from '../../ui/Glyphs';
import { useT } from '../../i18n/useT';
import { SolutionIcon } from './solutionIcons';
import './scenes.css';

// Bar heights of the call waveform, as shares of the full height. Fixed, so the picture is
// the same on every render and needs no script to move: CSS breathes each bar in place.
const WAVE = [
  0.3, 0.55, 0.8, 0.45, 0.95, 0.6, 0.35, 0.7, 1, 0.5, 0.75, 0.4, 0.9, 0.55, 0.3, 0.65, 0.85, 0.45,
  0.7, 0.35, 0.6, 0.9, 0.5, 0.3,
];

// Words for a state, said to screen readers next to the drawn mark.
function stateWord(t, state) {
  return {
    done: t('sp.scene.state.done', 'Done'),
    now: t('sp.scene.state.now', 'In progress'),
    next: t('sp.scene.state.next', 'Next'),
  }[state];
}

// `--i` is the step's place in the entrance; scenes.css turns it into a delay.
function step(index) {
  return { '--i': index };
}

function ChatScene({ scene, t }) {
  return (
    <>
      <ul className="osc-chat">
        {scene.messages.map((message, index) => (
          <li
            key={message.text}
            className="osc-step osc-bubble"
            data-from={message.from}
            style={step(index)}
          >
            <span className="oi-sr-only">
              {message.from === 'you' ? t('sp.scene.chat.you', 'You:') : 'Orqanix:'}{' '}
            </span>
            {message.text}
          </li>
        ))}
      </ul>
      <p className="osc-composer" aria-hidden="true">
        {t('sp.scene.chat.composer', 'Say what you need')}
        <SolutionIcon name="voice" className="osc-composer-icon" />
      </p>
    </>
  );
}

function CallScene({ scene, t }) {
  return (
    <>
      <div className="osc-wave" aria-hidden="true">
        {WAVE.map((height, index) => (
          <i key={index} style={{ '--h': height, '--n': index }} />
        ))}
      </div>
      <ul className="osc-call">
        {scene.lines.map((line, index) => (
          <li
            key={line.text}
            className="osc-step osc-call-line"
            data-from={line.from}
            style={step(index)}
          >
            <span className="osc-who">{line.from === 'app' ? 'Orqanix' : t('sp.scene.call.caller', 'Caller')}</span>
            <span>{line.text}</span>
          </li>
        ))}
      </ul>
      <p className="osc-step osc-outcome" style={step(scene.lines.length)}>
        <CheckGlyph className="osc-outcome-check" />
        {scene.outcome}
      </p>
    </>
  );
}

function DocScene({ scene, t }) {
  return (
    <>
      <ol className="osc-doc">
        {scene.lines.map((line, index) => (
          <li key={line} className="osc-step" style={step(index)}>
            {line}
          </li>
        ))}
      </ol>
      <p className="osc-step osc-note" style={step(scene.lines.length)}>
        <SolutionIcon name="pen" className="osc-note-icon" />
        {scene.note}
      </p>
    </>
  );
}

function TableScene({ scene, t }) {
  return (
    <table className="osc-table" style={{ '--cols': scene.columns.length }}>
      <thead>
        <tr>
          {scene.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {scene.rows.map((row, index) => (
          <tr key={row.join('|')} className="osc-step" style={step(index)}>
            {row.map((cell, cellIndex) => (
              // Cells can repeat within a row ("England" twice), so the column is the key.
              <td key={scene.columns[cellIndex]}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BoardScene({ scene, t }) {
  // Cards enter one after another across the lanes, so each lane starts where the last ended.
  const starts = scene.lanes.map((_, index) =>
    scene.lanes.slice(0, index).reduce((count, lane) => count + lane.cards.length, 0)
  );
  return (
    <div className="osc-board">
      {scene.lanes.map((lane, laneIndex) => (
        <section key={lane.title} className="osc-lane" aria-label={lane.title}>
          <p className="osc-lane-title">
            {lane.title}
            <span aria-hidden="true">{lane.cards.length}</span>
          </p>
          <ul>
            {lane.cards.map((card, index) => (
              <li key={card} className="osc-step osc-card" style={step(starts[laneIndex] + index)}>
                {card}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TimelineScene({ scene, t }) {
  return (
    <ol className="osc-timeline">
      {scene.steps.map((item, index) => (
        <li
          key={item.label}
          className="osc-step osc-tick"
          data-state={item.state}
          style={step(index)}
        >
          <i className="osc-node" aria-hidden="true">
            {item.state === 'done' && <CheckGlyph className="osc-node-check" />}
          </i>
          <span className="osc-tick-label">
            <span className="oi-sr-only">{stateWord(t, item.state)}: </span>
            {item.label}
          </span>
          {item.meta && <span className="osc-tick-meta">{item.meta}</span>}
        </li>
      ))}
    </ol>
  );
}

function slotWord(t, state) {
  return {
    booked: t('sp.scene.slot.booked', 'Booked'),
    held: t('sp.scene.slot.held', 'Held'),
    free: t('sp.scene.slot.free', 'Free'),
  }[state];
}

function mailWord(t, state) {
  return {
    replied: t('sp.scene.mail.replied', 'Replied'),
    draft: t('sp.scene.mail.draft', 'Draft'),
    waiting: t('sp.scene.mail.waiting', 'Waiting'),
  }[state];
}

function tileWord(t, state) {
  return {
    ok: t('sp.scene.tile.ok', 'Done'),
    now: t('sp.scene.tile.now', 'In progress'),
    alert: t('sp.scene.tile.alert', 'Needs attention'),
  }[state];
}
const CAL_FROM = 9;
const CAL_ROWS = 8;
const MAP_H = 56;
const CHART_H = 44;

/** A state drawn as a shape, so it reads without colour: check disc, live ring, diamond. */
function Mark({ state }) {
  return (
    <i className="osc-mark" data-state={state} aria-hidden="true">
      {(state === 'ok' || state === 'replied' || state === 'done') && (
        <CheckGlyph className="osc-mark-check" />
      )}
    </i>
  );
}

function CalendarScene({ scene, t }) {
  const hours = Array.from({ length: CAL_ROWS + 1 }, (_, index) => CAL_FROM + index);
  return (
    <>
      <div className="osc-cal" style={{ '--days': scene.days.length, '--rows': CAL_ROWS }}>
        <span aria-hidden="true" />
        {scene.days.map((day) => (
          <span key={day} className="osc-cal-day">
            {day}
          </span>
        ))}
        <div className="osc-cal-hours" aria-hidden="true">
          {hours.map((hour) => (
            <i key={hour}>{String(hour).padStart(2, '0')}</i>
          ))}
        </div>
        {scene.days.map((day, dayIndex) => (
          <ul key={day} className="osc-cal-col">
            {scene.slots.map(
              (slot, index) =>
                slot.day === dayIndex && (
                  <li
                    key={slot.label}
                    className="osc-step osc-slot"
                    data-state={slot.state}
                    style={{ '--i': index, '--s': slot.start - CAL_FROM, '--l': slot.len }}
                  >
                    <span className="osc-slot-label">
                      <span className="oi-sr-only">{slotWord(t, slot.state)}: </span>
                      {slot.label}
                    </span>
                  </li>
                )
            )}
          </ul>
        ))}
      </div>
      {scene.note && (
        <p className="osc-step osc-outcome" style={step(scene.slots.length)}>
          <SolutionIcon name="calendar" className="osc-note-icon" />
          {scene.note}
        </p>
      )}
    </>
  );
}

function MapScene({ scene, t }) {
  const y = (pin) => (pin.y / 100) * MAP_H;
  // The route turns at right angles, and a street runs under every leg of it. It leaves a pin
  // sideways and arrives from above or below, so a label sits left of its pin, or under it.
  const route = scene.pins
    .map((pin, index) => (index === 0 ? `M${pin.x} ${y(pin)}` : `H${pin.x} V${y(pin)}`))
    .join(' ');
  return (
    <>
      <div className="osc-map">
        <svg
          viewBox={`0 0 100 ${MAP_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <g className="osc-map-blocks">
            <rect x="4" y="5" width="17" height="11" rx="1.5" />
            <rect x="52" y="37" width="20" height="13" rx="1.5" />
            <rect x="76" y="6" width="13" height="8" rx="1.5" />
            <rect x="26" y="40" width="12" height="10" rx="1.5" />
          </g>
          <g className="osc-map-streets">
            {scene.pins.map((pin) => (
              <path key={pin.label} d={`M${pin.x} 0V${MAP_H}M0 ${y(pin)}H100`} />
            ))}
            <path d={`M24 0V${MAP_H}M50 0V${MAP_H}M75 0V${MAP_H}M0 9H100M0 28H100M0 47H100`} />
            <path d={`M0 ${MAP_H - 6}L100 4`} />
          </g>
          <path
            className="osc-map-contour"
            d={`M0 20C18 12 26 34 44 30S70 8 100 18M0 26C18 18 26 40 44 36S70 14 100 24`}
          />
          <path className="osc-map-route-bed" d={route} />
          <path className="osc-draw osc-map-route" d={route} pathLength="1" />
        </svg>
        <ol>
          {scene.pins.map((pin, index) => (
            <li
              key={pin.label}
              className="osc-step osc-pin"
              data-state={pin.state}
              data-side={pin.x < 30 ? 'below' : 'left'}
              style={{ '--i': index, left: `${pin.x}%`, top: `${pin.y}%` }}
            >
              <i className="osc-pin-dot" aria-hidden="true">
                {index + 1}
              </i>
              <span className="osc-pin-label">
                <span className="oi-sr-only">{stateWord(t, pin.state)}: </span>
                {pin.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {scene.note && (
        <p className="osc-step osc-outcome" style={step(scene.pins.length)}>
          <CheckGlyph className="osc-outcome-check" />
          {scene.note}
        </p>
      )}
    </>
  );
}

function ChartScene({ scene, t }) {
  const { series, bars = series, xLabels, callout } = scene;
  const count = series.length;
  const top = Math.max(...series, ...bars) * 1.35;
  const px = (index) => ((index + 0.5) / count) * 100;
  const py = (value) => CHART_H - 1 - (value / top) * (CHART_H - 4);
  const line = series.map((value, index) => `${index ? 'L' : 'M'}${px(index)} ${py(value)}`);
  const barWidth = (100 / count) * 0.46;
  const align =
    callout.at / (count - 1) > 0.7 ? 'end' : callout.at / (count - 1) < 0.3 ? 'start' : 'mid';
  return (
    <>
      <p className="osc-chart-title">{scene.title}</p>
      <div className="osc-chart">
        <svg viewBox={`0 0 100 ${CHART_H}`} aria-hidden="true" focusable="false">
          <path
            className="osc-chart-grid"
            d={`M0 ${CHART_H - 1}H100M0 ${CHART_H * 0.66}H100M0 ${CHART_H * 0.33}H100`}
          />
          {bars.map((value, index) => (
            <rect
              key={index}
              className="osc-grow osc-chart-bar"
              style={step(index)}
              x={px(index) - barWidth / 2}
              y={py(value)}
              width={barWidth}
              height={CHART_H - 1 - py(value)}
              rx="0.8"
            />
          ))}
          <path
            className="osc-fade osc-chart-area"
            style={step(count + 3)}
            d={`${line.join('')}V${CHART_H - 1}H${px(0)}Z`}
          />
          <path
            className="osc-draw osc-chart-line"
            style={step(count)}
            d={line.join('')}
            pathLength="1"
          />
          {series.map((value, index) => (
            <circle
              key={index}
              className="osc-fade osc-chart-point"
              data-on={index === callout.at}
              style={step(count + 3)}
              cx={px(index)}
              cy={py(value)}
              r={index === callout.at ? 1.5 : 0.9}
            />
          ))}
        </svg>
        <p
          className="osc-step osc-callout"
          data-align={align}
          style={{
            '--i': count + 4,
            left: `${px(callout.at)}%`,
            top: `${(py(series[callout.at]) / CHART_H) * 100}%`,
          }}
        >
          <i className="osc-live" aria-hidden="true" />
          {callout.text}
        </p>
      </div>
      <ul className="osc-chart-x" style={{ '--cols': count }}>
        {xLabels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </>
  );
}

function InboxScene({ scene, t }) {
  const open = scene.threads.findIndex((thread) => thread.state === 'draft');
  return (
    <ul className="osc-inbox">
      {scene.threads.map((thread, index) => (
        <li
          key={thread.subject}
          className="osc-step osc-mail"
          data-state={thread.state}
          data-open={index === open}
          style={step(index)}
        >
          <i className="osc-mail-avatar" aria-hidden="true">
            {thread.from.charAt(0)}
          </i>
          <span className="osc-mail-from">{thread.from}</span>
          <span className="osc-mail-tag">{thread.tag}</span>
          <span className="osc-mail-state">
            <Mark state={thread.state} />
            {mailWord(t, thread.state)}
          </span>
          <span className="osc-mail-subject">{thread.subject}</span>
          {index === open && (
            <div className="osc-step osc-draft" style={step(scene.threads.length)}>
              <p className="osc-draft-to">
                <SolutionIcon name="pen" className="osc-note-icon" />
                <span>{scene.draft.to}</span>
              </p>
              {scene.draft.lines.map((line, lineIndex) => (
                <p
                  key={line}
                  className="osc-step osc-draft-line"
                  style={step(scene.threads.length + 1 + lineIndex)}
                >
                  {line}
                  {lineIndex === scene.draft.lines.length - 1 && <i className="osc-caret" />}
                </p>
              ))}
              <p className="osc-draft-actions" aria-hidden="true">
                <span>{t('sp.scene.inbox.approve', 'Approve')}</span>
                <span>{t('sp.scene.inbox.edit', 'Edit')}</span>
              </p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function GraphScene({ scene, t }) {
  const lit = new Set(scene.highlight);
  const onPath = (a, b) => {
    const at = scene.highlight.indexOf(a);
    return at >= 0 && (scene.highlight[at + 1] === b || scene.highlight[at - 1] === b);
  };
  const last = scene.highlight[scene.highlight.length - 1];
  return (
    <div className="osc-graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {scene.links.map(([a, b], index) => (
          <line
            key={`${a}-${b}`}
            className="osc-draw osc-link"
            data-lit={onPath(a, b)}
            style={step(onPath(a, b) ? scene.links.length + 1 : index * 0.5)}
            x1={scene.nodes[a].x}
            y1={scene.nodes[a].y}
            x2={scene.nodes[b].x}
            y2={scene.nodes[b].y}
            pathLength="1"
          />
        ))}
      </svg>
      <ul>
        {scene.nodes.map((node, index) => (
          <li
            key={node.label}
            className="osc-step osc-gnode"
            data-role={node.role}
            data-lit={lit.has(index)}
            style={{ '--i': index * 0.6, left: `${node.x}%`, top: `${node.y}%` }}
          >
            {index === last && <i className="osc-live" aria-hidden="true" />}
            {node.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TilesScene({ scene, t }) {
  return (
    <>
      <p className="osc-chart-title">{scene.title}</p>
      <ul className="osc-tiles">
        {scene.cells.map((cell, index) => (
          <li
            key={cell.label}
            className="osc-step osc-tile"
            data-state={cell.state}
            style={step(index)}
          >
            <Mark state={cell.state} />
            <span className="osc-tile-label">
              <span className="oi-sr-only">{tileWord(t, cell.state)}: </span>
              {cell.label}
            </span>
            {cell.meta && <span className="osc-tile-meta">{cell.meta}</span>}
          </li>
        ))}
      </ul>
      <ul className="osc-step osc-legend" style={step(scene.cells.length)}>
        {scene.legend.map((label, index) => (
          <li key={label}>
            <Mark state={['ok', 'now', 'alert'][index]} />
            {label}
          </li>
        ))}
      </ul>
    </>
  );
}

function PaperScene({ scene, t }) {
  const after = scene.rows.length + 1;
  return (
    <div className="osc-paper-stage">
      <div className="osc-step osc-paper" style={step(0)}>
        <p className="osc-paper-heading">{scene.heading}</p>
        {scene.to && <p className="osc-paper-to">{scene.to}</p>}
        <dl>
          {scene.rows.map(([label, value], index) => (
            <div key={label} className="osc-step" style={step(index + 1)}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          {scene.total && (
            <div className="osc-step osc-paper-total" style={step(after)}>
              <dt>{scene.total[0]}</dt>
              <dd>{scene.total[1]}</dd>
            </div>
          )}
        </dl>
        <div className="osc-paper-lines" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p className="osc-stamp" style={step(after + 1)}>
          <CheckGlyph className="osc-mark-check" />
          {scene.stamp}
        </p>
      </div>
    </div>
  );
}

// A fixed, uneven waveform: two slow waves multiplied, so it looks recorded, not drawn.
const CLIP_WAVE = Array.from(
  { length: 84 },
  (_, index) => 0.18 + 0.82 * Math.abs(Math.sin(index * 1.7) * Math.cos(index * 0.23))
);

function ClipsScene({ scene, t }) {
  return (
    <>
      <p className="osc-clips-source">
        <SolutionIcon name="camera" className="osc-note-icon" />
        {scene.source}
      </p>
      <div className="osc-clips-track">
        <svg
          viewBox={`0 0 ${CLIP_WAVE.length} 20`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {CLIP_WAVE.map((height, index) => (
            <rect
              key={index}
              x={index + 0.25}
              y={10 - height * 9}
              width="0.5"
              height={height * 18}
            />
          ))}
        </svg>
        <ul>
          {scene.cuts.map((cut, index) => (
            <li
              key={cut.label}
              className="osc-step osc-cut"
              style={{ '--i': index, left: `${cut.start}%`, width: `${cut.len}%` }}
            >
              <span>{cut.label}</span>
            </li>
          ))}
        </ul>
        <i className="osc-playhead" aria-hidden="true" />
      </div>
      <ul className="osc-clips-out">
        {scene.outputs.map((output, index) => (
          <li key={output} className="osc-step osc-out" style={step(scene.cuts.length + index)}>
            <i className="osc-out-thumb" aria-hidden="true" />
            {output}
          </li>
        ))}
      </ul>
    </>
  );
}

function PhoneScene({ scene, t }) {
  return (
    <div className="osc-phone-stage">
      <div className="osc-step osc-phone" style={step(0)}>
        <i className="osc-phone-notch" aria-hidden="true" />
        <p className="osc-phone-title">{scene.title}</p>
        <ul className="osc-phone-thread">
          {scene.messages.map((message, index) => (
            <li
              key={message.text}
              className="osc-step osc-bubble"
              data-from={message.from === 'app' ? 'you' : 'them'}
              style={step(index + 1)}
            >
              <span className="oi-sr-only">
                {message.from === 'app' ? 'Orqanix:' : t('sp.scene.phone.reply', 'Reply:')}{' '}
              </span>
              {message.text}
            </li>
          ))}
        </ul>
        <p className="osc-step osc-phone-actions" style={step(scene.messages.length + 1)}>
          {scene.actions.map((action) => (
            <span key={action}>{action}</span>
          ))}
        </p>
      </div>
    </div>
  );
}

// Each kind's body, and the title and tag on its window bar.
const KINDS = {
  chat: { Body: ChatScene, title: () => 'Orqanix', tag: (t) => t('sp.scene.chat.tag', 'Chat') },
  call: {
    Body: CallScene,
    title: (scene) => scene.caller,
    tag: (t) => t('sp.scene.call.tag', 'Voice · live'),
  },
  doc: { Body: DocScene, title: (scene) => scene.file, tag: (t) => t('sp.scene.doc.tag', 'Draft') },
  table: {
    Body: TableScene,
    title: (scene) => scene.file,
    tag: (t) => t('sp.scene.table.tag', 'Table'),
  },
  board: {
    Body: BoardScene,
    title: (scene, t) => t('sp.scene.board.title', 'Board'),
    tag: (t) => t('sp.scene.board.tag', 'Tasks'),
  },
  timeline: {
    Body: TimelineScene,
    title: (scene, t) => t('sp.scene.timeline.title', 'Activity'),
    tag: (t) => t('sp.scene.timeline.tag', 'Every step'),
  },
  calendar: {
    Body: CalendarScene,
    title: (scene, t) => t('sp.scene.calendar.title', 'Calendar'),
    tag: (t) => t('sp.scene.calendar.tag', 'Week'),
  },
  map: {
    Body: MapScene,
    title: (scene, t) => t('sp.scene.map.title', 'Map'),
    tag: (t) => t('sp.scene.map.tag', 'Route'),
  },
  chart: {
    Body: ChartScene,
    title: (scene, t) => t('sp.scene.chart.title', 'Report'),
    tag: (t) => t('sp.scene.chart.tag', 'Trend'),
  },
  inbox: {
    Body: InboxScene,
    title: (scene, t) => t('sp.scene.inbox.title', 'Inbox'),
    tag: (t) => t('sp.scene.inbox.tag', 'Mail'),
  },
  graph: {
    Body: GraphScene,
    title: (scene, t) => t('sp.scene.graph.title', 'Connections'),
    tag: (t) => t('sp.scene.graph.tag', 'Graph'),
  },
  tiles: {
    Body: TilesScene,
    title: (scene, t) => t('sp.scene.tiles.title', 'Status'),
    tag: (t) => t('sp.scene.tiles.tag', 'Live'),
  },
  paper: {
    Body: PaperScene,
    title: (scene, t) => t('sp.scene.paper.title', 'Document'),
    tag: (t) => t('sp.scene.paper.tag', 'Draft'),
  },
  clips: {
    Body: ClipsScene,
    title: (scene, t) => t('sp.scene.clips.title', 'Editor'),
    tag: (t) => t('sp.scene.clips.tag', 'Clips'),
  },
  phone: {
    Body: PhoneScene,
    title: (scene, t) => t('sp.scene.phone.title', 'Messages'),
    tag: (t) => t('sp.scene.phone.tag', 'Mobile'),
  },
};

/**
 * One small dark app panel. `play` starts its one-shot entrance; until then the steps wait
 * unseen, and with reduced motion they are simply there.
 */
export default function Scene({ scene, play = true, className = '' }) {
  const { t } = useT('sp');
  const kind = KINDS[scene.kind];
  if (!kind) return null;
  const { Body } = kind;
  return (
    // A picture of an app window: it keeps its left-to-right layout in every language.
    <div className={`osc ${className}`.trim()} data-kind={scene.kind} data-play={play} dir="ltr">
      <div className="osc-bar">
        <span className="osc-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="osc-title">{kind.title(scene, t)}</span>
        <span className="osc-kind">{kind.tag(t)}</span>
      </div>
      <div className="osc-body">
        <Body scene={scene} t={t} />
      </div>
    </div>
  );
}
