import { useId, useState } from 'react';
import { ChevronGlyph } from './Glyphs';

/**
 * The page's one disclosure. Closed content stays in the DOM (hidden) so another
 * element can still point at it with aria-describedby.
 */
export default function More({
  id,
  label = 'More',
  openLabel = 'Less',
  defaultOpen = false,
  row = false,
  children,
}) {
  const autoId = useId();
  const regionId = id ?? autoId;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={row ? 'oi-more oi-more-row' : 'oi-more'}>
      <button
        type="button"
        className="oi-more-toggle"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? openLabel : label}</span>
        <ChevronGlyph className="oi-more-chevron" />
      </button>
      <div id={regionId} className="oi-more-region" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
