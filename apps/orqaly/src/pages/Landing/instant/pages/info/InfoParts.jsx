import DirArrow from '../../ui/DirArrow';
/** The opening lines every text page shares: bracketed label, title, one line. */
export function InfoHead({ page, center = false }) {
  return (
    <header className={center ? 'oin-head oin-head-center' : 'oin-head'}>
      <p className="oi-tag oi-tag-bracket oip-rise" style={{ '--i': 0 }}>
        {page.tag}
      </p>
      <h1 id="instant-page-heading" className="oin-h1 oip-rise" style={{ '--i': 1 }}>
        {page.title}
      </h1>
      <p className="oip-lede oip-rise" style={{ '--i': 2 }}>
        {page.line}
      </p>
    </header>
  );
}

/** The body of one legal section: bullets, then paragraphs, then links. */
export function SectionCopy({ text = [], list, links }) {
  return (
    <div className="oin-copy">
      {list && (
        <ul className="oin-list">
          {list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {text.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {links?.map(({ label, href }) => (
        <a key={href} className="oin-mail" href={href}>
          {label}
          <DirArrow />
        </a>
      ))}
    </div>
  );
}

/** The big outlined number on a card; decoration, the heading carries the meaning. */
export function Numeral({ index }) {
  return (
    <span className="oin-numeral" aria-hidden="true">
      {String(index + 1).padStart(2, '0')}
    </span>
  );
}
