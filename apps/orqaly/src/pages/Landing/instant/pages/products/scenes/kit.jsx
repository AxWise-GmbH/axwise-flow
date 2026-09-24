import { Seen } from '../../../SpeedStrip';
import './kit.css';

/*
 * The scene kit: the stage every product scene plays in, plus a few small parts. Their look
 * and motion live in kit.css (the unit, the clock, the pause and reduced-motion rules, the
 * icon drawings), so the parts here cost almost nothing to ship. A scene is markup made of
 * these parts and its own classes; its own CSS says when things move, on the shared clock.
 * The stage is always left to right (dir="ltr"): a right-to-left language translates the
 * scene's words but never mirrors the picture.
 */
// Words a stylesheet draws (content: var(--name, 'English')), as CSS strings: { '--name': text }.
const cssWords = (words) =>
  words &&
  Object.fromEntries(Object.entries(words).map(([name, text]) => [name, JSON.stringify(text)]));

/**
 * `words` hands the stylesheet the labels it draws itself, in the current language:
 * { '--pd-ask': t(...) } becomes the CSS string var(--pd-ask) on the stage.
 */
export function SceneStage({ product, cut = 'menu', className = '', words, children }) {
  return (
    <Seen
      className={`ps ${className}`}
      style={cssWords(words)}
      data-product={product}
      data-cut={cut}
      aria-hidden="true"
      dir="ltr"
      threshold={0}
    >
      <div className="ps-scene">{children}</div>
    </Seen>
  );
}

// A 16px line icon, drawn in kit.css: doc, sheet, image, mail, phone, folder, tick, plus,
// chat, bot, user, team, spark, arrow, clock, code.
export function Icon({ name, className = '' }) {
  return <i className={`ps-icon ${className}`} data-i={name} />;
}

// A dark mini app window: the three dots and an optional `bar` on top, the children below.
export function Win({ bar, className = '', children }) {
  return (
    <div className={`ps-win ${className}`}>
      <div className="ps-win-bar">{bar}</div>
      {children}
    </div>
  );
}

// Mock text that is drawn, not written: one bar per entry of `w`, each that % of the line.
export function Bars({ w, className = '' }) {
  return (
    <span className={`ps-bars ${className}`}>
      {w.map((width, index) => (
        <i key={index} className="ps-bar" style={{ '--w': width }} />
      ))}
    </span>
  );
}

// A small pill. Extra props land on it: data-on lights it, data-soon marks "Coming soon".
export function Chip({ className = '', children, ...rest }) {
  return (
    <span className={`ps-chip ${className}`} {...rest}>
      {children}
    </span>
  );
}
