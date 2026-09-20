import { CheckGlyph } from './Glyphs';
import More from './More';
import Reveal from './Reveal';

// The card's glow follows the pointer; CSS reads --mx/--my (see .oi-card::before). The
// pointer reports far more often than the screen repaints: one measure and write per frame.
let pointerFrame = 0;
let pointerLast = null;

function trackPointer(event) {
  pointerLast = { card: event.currentTarget, x: event.clientX, y: event.clientY };
  if (pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0;
    const { card, x, y } = pointerLast;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${x - box.left}px`);
    card.style.setProperty('--my', `${y - box.top}px`);
  });
}

/** A capability card: a title, at most three short lines, the rest under More. */
export default function Card({ title, lines, more, delay = 0 }) {
  return (
    <Reveal
      as="section"
      className="oi-card"
      aria-label={title}
      delay={delay}
      onPointerMove={trackPointer}
    >
      <h3 className="oi-card-title">{title}</h3>
      <ul className="oi-card-lines">
        {lines.map((line) => (
          <li className="oi-card-line" key={line}>
            <CheckGlyph className="oi-check" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {more?.length > 0 && (
        <More label={`More about ${title.toLowerCase()}`} openLabel="Less">
          <ul>
            {more.map((item) => (
              <li key={item.text}>
                {item.text}
                {item.badge && (
                  <>
                    {' '}
                    <Badge>{item.badge}</Badge>
                  </>
                )}
              </li>
            ))}
          </ul>
        </More>
      )}
    </Reveal>
  );
}

export function Badge({ children }) {
  return <span className="oi-badge">{children}</span>;
}

export function Stat({ value, label }) {
  return (
    <div className="oi-stat">
      <dt className="oi-stat-label">{label}</dt>
      <dd className="oi-stat-value">{value}</dd>
    </div>
  );
}
