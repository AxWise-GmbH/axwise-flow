import { useEffect, useRef } from 'react';
import Reveal from './ui/Reveal';
import { OrqanixMark } from './ui/Glyphs';
import { Seen } from './SpeedStrip';
import { useT } from './i18n/useT';
import './sections.css';

function LaptopGlyph() {
  return (
    <svg className="ois-glyph" viewBox="0 0 220 150" focusable="false">
      <path className="ois-draw" pathLength="1" d="M44 112V22a8 8 0 0 1 8-8h116a8 8 0 0 1 8 8v90" />
      <path
        className="ois-draw"
        pathLength="1"
        d="M14 112h192l-9.5 13.2a8 8 0 0 1-6.5 3.3H30a8 8 0 0 1-6.5-3.3z"
      />
      <path className="ois-draw" pathLength="1" d="M92 112c0 3.5 2.5 6 6 6h24c3.5 0 6-2.5 6-6" />
      <path className="ois-draw ois-draw-quiet" pathLength="1" d="M62 40h46" />
      <path className="ois-draw ois-draw-quiet" pathLength="1" d="M62 58h78" />
      <path className="ois-draw ois-draw-quiet" pathLength="1" d="M62 76h30" />
    </svg>
  );
}

function CloudGlyph() {
  return (
    <svg className="ois-glyph" viewBox="0 0 220 150" focusable="false">
      <path
        className="ois-draw"
        pathLength="1"
        d="M62 126h96A31 31 0 0 0 164 64.5 46 46 0 0 0 80 53 38 38 0 0 0 62 126z"
      />
    </svg>
  );
}

// Two lanes: what the AI needs goes out on one, its answer comes back on the other.
function Wire({ vertical = false }) {
  const lanes = vertical ? ['M18 0V100', 'M42 100V0'] : ['M0 18H100', 'M100 42H0'];
  return (
    <svg
      className={vertical ? 'ois-wire ois-wire-v' : 'ois-wire ois-wire-h'}
      viewBox={vertical ? '0 0 60 100' : '0 0 100 60'}
      // Stretched on purpose: a straight lane only gets longer, its stroke stays a hairline.
      preserveAspectRatio="none"
      focusable="false"
    >
      {lanes.map((d, lane) => (
        <g key={d} className={`ois-lane ois-lane-${lane}`}>
          <path className="ois-lane-rail" d={d} />
          <path className="ois-lane-tail" d={d} pathLength="100" />
          <path className="ois-lane-head" d={d} pathLength="100" />
        </g>
      ))}
    </svg>
  );
}

export default function PrivacyPreface() {
  const { t } = useT('pg');
  const sceneRef = useRef(null);

  // The scene is decoration and takes no pointer events itself, so the section listens
  // and hands each glass panel the pointer position for its spotlight.
  useEffect(() => {
    const scene = sceneRef.current;
    const section = scene?.closest('section');
    if (!section) return undefined;
    let raf = 0;
    let point = null;
    const paint = () => {
      raf = 0;
      for (const panel of scene.querySelectorAll('.ois-panel')) {
        const box = panel.getBoundingClientRect();
        panel.style.setProperty('--mx', `${point.x - box.left}px`);
        panel.style.setProperty('--my', `${point.y - box.top}px`);
      }
    };
    const onMove = (event) => {
      if (event.pointerType !== 'mouse') return;
      point = { x: event.clientX, y: event.clientY };
      if (!raf) raf = requestAnimationFrame(paint);
    };
    section.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      section.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <Seen
      as="section"
      id="what-stays"
      className="oi-section ois-section ois-ruled ois-privacy"
      aria-labelledby="what-stays-heading"
    >
      <div className="oi-container">
        <Seen className="ois-gate ois-head">
          <Reveal as="h2" id="what-stays-heading" className="oi-h2">
            {t('pg.privacy.title', 'What stays on your Mac')}
          </Reveal>
          <Reveal as="p" className="oi-line" delay={90}>
            {t(
              'pg.privacy.line',
              "On your Mac: files, commands, chat history. In the cloud: the AI's thinking."
            )}
          </Reveal>
        </Seen>
        <Seen className="ois-gate ois-scene-gate" threshold={0.3} aria-hidden="true" dir="ltr">
          <div ref={sceneRef} className="ois-scene">
            <Reveal className="ois-panel ois-panel-mac">
              <p className="oi-tag oi-tag-bracket">{t('pg.privacy.mac', 'On your Mac')}</p>
              <div className="ois-glyph-stage">
                <div className="ois-glyph-box">
                  <LaptopGlyph />
                </div>
              </div>
            </Reveal>
            <Reveal className="ois-wires" delay={260}>
              <Wire />
              <Wire vertical />
            </Reveal>
            <Reveal className="ois-panel ois-panel-cloud" delay={130}>
              <p className="oi-tag oi-tag-bracket">{t('pg.privacy.cloud', 'In the cloud')}</p>
              <div className="ois-glyph-stage">
                <div className="ois-glyph-box">
                  <CloudGlyph />
                  <OrqanixMark className="ois-cloud-mark" />
                </div>
              </div>
            </Reveal>
          </div>
        </Seen>
      </div>
    </Seen>
  );
}
