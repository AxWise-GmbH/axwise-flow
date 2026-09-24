import { Link } from 'react-router-dom';
import { Seen } from '../../SpeedStrip';
import HeroFrame from './HeroFrame';
import { useT } from '../../i18n/useT';
import './FeaturesHero.css';

/*
 * The wall is laid like brickwork. A course is a row of tile widths, in twelfths of the
 * wall, and every course is the one above it shifted by one tile, so no joint sits over
 * another. Three walls are laid at once and the width of the screen picks one: `wide` beside
 * the words, `mid` under them on a tablet, `slim` on a phone.
 */
const COURSES = { wide: [5, 4, 3], mid: [4, 2, 3, 3], slim: [7, 5] };

function span(course, index) {
  const row = Math.floor(index / course.length);
  const slot = index % course.length;
  return course[(slot + row) % course.length];
}

function placement(index) {
  const style = { '--i': index };
  for (const [wall, course] of Object.entries(COURSES)) {
    style[`--ohf-${wall}-span`] = span(course, index);
  }
  return style;
}

function twoDigits(value) {
  return String(value).padStart(2, '0');
}

// One circle per ring: a dashed stroke as wide as the ring turns into fine radial lines.
// The path is measured four units to a line, one drawn and three dark (the dash is in the CSS).
const ORB_RINGS = [
  { r: 214, width: 92, lines: 300, className: 'ohf-orb-outer' },
  { r: 150, width: 30, lines: 180, className: 'ohf-orb-inner' },
];

function OrbGhost() {
  return (
    <svg className="ohf-orb" viewBox="0 0 560 560" aria-hidden="true" focusable="false">
      {ORB_RINGS.map((ring) => (
        <circle
          key={ring.className}
          className={ring.className}
          cx="280"
          cy="280"
          r={ring.r}
          strokeWidth={ring.width}
          pathLength={ring.lines * 4}
        />
      ))}
    </svg>
  );
}

function Tile({ item, index }) {
  const style = placement(index);
  return (
    <li className="ohf-slot" style={style} data-mid-span={style['--ohf-mid-span']}>
      <Link className="ohf-tile" to={{ hash: item.hash }}>
        <span className="ohf-top">
          {item.icon}
          <i className="ohf-ruler" aria-hidden="true" />
          <span className="ohf-number" aria-hidden="true">
            {twoDigits(index + 1)}
          </span>
          <svg className="ohf-go" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 2.5v10.5" />
            <path d="M3.5 8.75 8 13.25l4.5-4.5" />
          </svg>
        </span>
        <span className="ohf-name">{item.name}</span>
      </Link>
    </li>
  );
}

/**
 * The opening of the Features page: the whole product on one wall. Every feature is a tile,
 * and every tile is a link to that feature further down the page.
 *
 * `items` is `{ id, name, hash, icon }` in page order. The page owns the anchors and the
 * icons, so the wall cannot drift away from what it links to.
 */
export default function FeaturesHero({ id, tag, title, line, items }) {
  const { t } = useT('pg');
  const wall = (
    <Seen as="nav" className="ohf-wall" aria-label={t('pg.featureshero.nav', 'Jump to a feature')}>
      <OrbGhost />
      <div className="ohf-head">
        <p className="oi-tag ohf-head-label">{t('pg.featureshero.jump', 'Jump to')}</p>
        <span className="ohf-head-rule" aria-hidden="true" />
        <p className="oi-tag ohf-head-count" aria-hidden="true">
          01 &ndash; {twoDigits(items.length)}
        </p>
      </div>
      <ol className="ohf-courses">
        {items.map((item, index) => (
          <Tile key={item.id} item={item} index={index} />
        ))}
      </ol>
    </Seen>
  );

  return <HeroFrame id={id} tag={tag} title={title} line={line} visual={wall} />;
}
