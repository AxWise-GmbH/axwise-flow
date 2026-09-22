import { useT } from '../../../i18n/useT';
import { Chip, Icon, SceneStage } from './kit';

// Its look (./models.css) is imported by ModelsPage, the only place this scene plays while the
// header menu leaves Personalised Models out (nav: false). That keeps it off the header's
// scenes chunk. If the product returns to the menu, import it here again (a test holds this).

// [icon, name, x, y]: where each file waits, in card units (the card is 100 wide, 62.5 tall).
// The last four, nameless and further back, only stream in on the hero cut.
const FILES = [
  ['doc', 'notes.pdf', 14, 13],
  ['mail', 'Inbox', 86, 13],
  ['sheet', 'prices.xlsx', 14, 45],
  ['image', 'brand.png', 86, 45],
  ['chat', '', 6, 29],
  ['folder', '', 94, 29],
  ['doc', '', 31, 5],
  ['sheet', '', 69, 5],
];

// One ridge of the print, from the core out: each a little wider, taller and lower.
const ridge = (i) => (
  <ellipse
    key={i}
    cy={i * 0.3 - 1.6}
    rx={2 + i * 1.45}
    ry={2.4 + i * 1.62}
    pathLength="100"
    strokeDashoffset={(i * 37) % 100}
  />
);

// The print's four ridge groups from the inside out, then the four lit arcs (one on each
// group's outer ridge). Each is its own box (an HTML layer around the SVG, since Chrome only
// moves HTML boxes on the compositor), so it turns and fades without redrawing.
const LAYERS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [2], [5], [8], [11]];

// Your files drift into a core of turning rings. Each one that lands locks a group of rings
// and leaves a lit arc, until the rings settle into a print no other business has: your model.
export default function ModelsScene({ cut = 'menu', className = '' }) {
  const { t } = useT('pp');
  return (
    <SceneStage product="personalised-models" cut={cut} className={className}>
      <i className="ppm-glow" />
      <svg className="ppm-links" viewBox="0 0 100 62.5">
        {FILES.map(([, , x, y], k) => {
          // Each path stops at the rim of the print, whatever its length.
          const f = 21 / Math.hypot(x - 50, y - 27);
          return <path key={k} d={`M${x} ${y}L${50 + (x - 50) * f} ${27 + (y - 27) * f}`} />;
        })}
      </svg>
      <i className="ppm-scan" />
      <div className="ppm-core">
        {LAYERS.map((layer, k) => (
          <i key={k}>
            <svg viewBox="-23 -23 46 46">{layer.map(ridge)}</svg>
          </i>
        ))}
      </div>
      {FILES.map(([icon, name, x, y], k) => (
        <span key={k} className="ppm-file" style={{ '--x': x, '--y': y }}>
          <Icon name={icon} />
          <b>{name === 'Inbox' ? t('pp.models.scene.inbox', 'Inbox') : name}</b>
        </span>
      ))}
      <div className="ppm-label">
        <b>{t('pp.models.scene.model', 'Your model')}</b>
        {/* The menu row beside the card already says it, so only the hero shows the pill. */}
        {cut === 'hero' && <Chip data-soon>{t('products.soon', 'Coming soon')}</Chip>}
      </div>
    </SceneStage>
  );
}
