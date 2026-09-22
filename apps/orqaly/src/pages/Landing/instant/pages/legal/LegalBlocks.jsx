import { Link as RouterLink } from 'react-router-dom';
import { fillCompany, plainText } from './legal.docs';
import { findLegalDoc, legalPath } from './legal.links';

// Inside a text: [label](href) links, and plain email addresses, which become mail links.
const INLINE =
  /\[([^\]]+)\]\(([^)\s]+)\)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

function InlineLink({ href, region, children }) {
  const legal = href.match(/^\/instant\/legal\/([a-z-]+)(#[a-z0-9-]+)?$/);
  if (legal) {
    // A document that is not shown yet (its company facts are empty) stays plain text.
    if (!findLegalDoc(legal[1])) return children;
    return (
      <RouterLink to={`${legalPath(legal[1], region)}${legal[2] ?? ''}`}>{children}</RouterLink>
    );
  }
  if (href.startsWith('https://')) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return <a href={href}>{children}</a>;
}

/** A text with its company facts filled in and its links made live. */
export function Inline({ text, region }) {
  const filled = fillCompany(text);
  const parts = [];
  let last = 0;
  for (const match of filled.matchAll(INLINE)) {
    if (match.index > last) parts.push(filled.slice(last, match.index));
    parts.push(
      match[3] ? (
        <a key={match.index} href={`mailto:${match[3]}`}>
          {match[3]}
        </a>
      ) : (
        <InlineLink key={match.index} href={match[2]} region={region}>
          {match[1]}
        </InlineLink>
      )
    );
    last = match.index + match[0].length;
  }
  if (last < filled.length) parts.push(filled.slice(last));
  return parts;
}

/**
 * A translated sentence with elements in it: a line such as "Write to {email}." keeps the {email}
 * blank (t fills only the values it is given), and each blank becomes its element, wherever
 * the language puts it.
 */
export function Sentence({ text, parts }) {
  return text
    .split(/\{(\w+)\}/)
    .map((piece, index) => (index % 2 ? (parts[piece] ?? `{${piece}}`) : piece))
    .map((piece, index) => (typeof piece === 'string' ? piece : <span key={index}>{piece}</span>));
}

function Table({ block, region }) {
  const head = block.head.map(plainText);
  return (
    <div className="olg-table-wrap">
      <table className="olg-table">
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                // On a phone each row stacks, and the label says which column a cell is.
                <td key={cellIndex} data-label={head[cellIndex]}>
                  <Inline text={cell} region={region} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One block of a document. `number` is the section number an h2 carries. */
export function LegalBlock({ block, region, number }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2 id={block.id} className="olg-h2">
          <a href={`#${block.id}`} className="olg-num" aria-hidden="true" tabIndex={-1}>
            {number}.
          </a>
          {plainText(block.text)}
        </h2>
      );
    case 'h3':
      return (
        <h3 id={block.id} className="olg-h3">
          {plainText(block.text)}
        </h3>
      );
    case 'list':
      return (
        <ul className="olg-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline text={item} region={region} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return <Table block={block} region={region} />;
    case 'note':
      return (
        <p className="olg-callout">
          <Inline text={block.text} region={region} />
        </p>
      );
    default:
      return (
        <p>
          <Inline text={block.text} region={region} />
        </p>
      );
  }
}
