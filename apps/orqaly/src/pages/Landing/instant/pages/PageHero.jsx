import LineOrb from '../../../../components/Common/LineOrb';
import { useOrbAccent } from '../useInstantTheme';

// The box in pages.css is 720px. The canvas is drawn at half that and zoomed back up from
// its corner (.oi-orb-zoom in perf.css): it is a soft light bleeding off the edge, and a
// 1440px backing store on a retina screen is the costliest thing a sub-page paints.
const ORB_SIZE = 720;
const ORB_RENDER_SCALE = 0.5;

/**
 * The opening of every sub-page: a bracketed label, a very large light title and one
 * line, with the line-orb burning off the right edge as the page's light.
 */
export default function PageHero({ id, tag, title, line }) {
  const orbInk = useOrbAccent();
  return (
    <section className="oip-hero" aria-labelledby={id}>
      <div className="oip-hero-orb" data-orb aria-hidden="true">
        <i className="oip-hero-bloom" />
        <LineOrb
          className="oi-orb-zoom oi-orb-zoom-corner"
          style={{ '--oi-orb-zoom': 1 / ORB_RENDER_SCALE }}
          size={ORB_SIZE * ORB_RENDER_SCALE}
          accent={orbInk}
          hollow={0.64}
          speed={0.6}
          title=""
        />
      </div>
      <div className="oi-container oip-hero-text">
        <p className="oi-tag oi-tag-bracket oip-rise" style={{ '--i': 0 }}>
          {tag}
        </p>
        <h1 id={id} className="oip-title oip-rise" style={{ '--i': 1 }}>
          {title}
        </h1>
        <p className="oip-lede oip-rise" style={{ '--i': 2 }}>
          {line}
        </p>
      </div>
    </section>
  );
}
