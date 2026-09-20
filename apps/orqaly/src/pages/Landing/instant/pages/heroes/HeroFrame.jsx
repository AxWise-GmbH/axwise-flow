import './heroFrame.css';

/**
 * The shared skeleton of a sub-page's first block: the words on the left, the page's own
 * picture on the right, and an optional row under both. Each page supplies the picture, so
 * the three openings differ in what they show and agree in how they are laid out.
 *
 * `visual` is decoration or a set of links; it never carries the only copy of a fact.
 */
export default function HeroFrame({
  id,
  tag,
  title,
  line,
  className = '',
  visual,
  foot,
  children,
}) {
  return (
    <section className={`oph ${className}`.trim()} aria-labelledby={id}>
      <i className="oph-glow" aria-hidden="true" />
      <div className="oi-container">
        <div className="oph-grid">
          <div className="oph-text">
            <p className="oi-tag oi-tag-bracket oph-rise" style={{ '--i': 0 }}>
              {tag}
            </p>
            <h1 id={id} className="oph-title oph-rise" style={{ '--i': 1 }}>
              {title}
            </h1>
            <p className="oph-lede oph-rise" style={{ '--i': 2 }}>
              {line}
            </p>
            {children && (
              <div className="oph-extra oph-rise" style={{ '--i': 3 }}>
                {children}
              </div>
            )}
          </div>
          {visual && <div className="oph-visual">{visual}</div>}
        </div>
        {foot && (
          <div className="oph-foot oph-rise" style={{ '--i': 4 }}>
            {foot}
          </div>
        )}
      </div>
    </section>
  );
}
