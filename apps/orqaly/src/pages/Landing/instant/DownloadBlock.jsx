import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LineOrb from '../../../components/Common/LineOrb';
import More from './ui/More';
import Reveal from './ui/Reveal';
import { Seen } from './SpeedStrip';
import { DesktopDownloadButton, DesktopReleaseDetails } from '../simple/DesktopDownload';
import { DESKTOP_RELEASE } from '../simple/desktop-release';
import './sections.css';
import { ORB_ACCENT } from './palette';

const RELEASE_ID = 'instant-download-release';
const FIRST_OPEN_ID = 'instant-download-first-open';
const SIZE_MB = Math.round(DESKTOP_RELEASE.bytes / 1_000_000);

// Kept as strings: a bare ">" is not valid JSX text.
const WILL_IT_RUN = 'Will it run? Apple menu > About This Mac > Chip: Apple M1 or newer.';
const FIRST_OPEN_STEPS = [
  'Open the DMG and drag Orqanix Preview to Applications.',
  'Open it. If macOS blocks it: System Settings > Privacy & Security > Open Anyway.',
  'Sign in with your Orqanix account.',
];

const ORB_MAX = 560;
const ORB_MIN = 300;
// The canvas is drawn at this share of its on-screen size and zoomed back up in CSS
// (.oi-orb-zoom in perf.css): a soft light behind the button does not need every pixel.
const ORB_RENDER_SCALE = 0.65;

function orbSizeFor(width) {
  return Math.round(Math.min(ORB_MAX, Math.max(ORB_MIN, width * 0.86)));
}

// LineOrb takes its size in pixels, and its canvas costs by the pixel, so a phone gets a
// smaller orb rather than a big one scaled down.
function useOrbSize() {
  const [size, setSize] = useState(() => orbSizeFor(globalThis.window?.innerWidth ?? 1440));

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      setSize(orbSizeFor(window.innerWidth));
    };
    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return size;
}

export default function DownloadBlock() {
  const stageRef = useRef(null);
  const orbSize = useOrbSize();

  // The light leans toward the pointer. The stage itself takes no pointer events, so the
  // section listens; CSS turns --px/--py (-1 to 1) into slow transforms.
  useEffect(() => {
    const stage = stageRef.current;
    const section = stage?.closest('section');
    if (!section) return undefined;
    let raf = 0;
    let point = null;
    const paint = () => {
      raf = 0;
      const box = section.getBoundingClientRect();
      const x = point ? ((point.x - box.left) / box.width) * 2 - 1 : 0;
      const y = point ? ((point.y - box.top) / box.height) * 2 - 1 : 0;
      stage.style.setProperty('--px', x.toFixed(3));
      stage.style.setProperty('--py', y.toFixed(3));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onMove = (event) => {
      if (event.pointerType !== 'mouse') return;
      point = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onLeave = () => {
      point = null;
      schedule();
    };
    section.addEventListener('pointermove', onMove, { passive: true });
    section.addEventListener('pointerleave', onLeave);
    return () => {
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <Seen
      as="section"
      id="download"
      className="oi-section ois-section ois-gate ois-download"
      aria-labelledby="instant-download-heading"
      threshold={0.3}
    >
      <div ref={stageRef} className="ois-download-stage" aria-hidden="true">
        <div className="ois-bloom" />
        <div className="ois-download-orb" data-orb aria-hidden="true">
          <LineOrb
            className="oi-orb-zoom"
            style={{ '--oi-orb-zoom': 1 / ORB_RENDER_SCALE }}
            size={Math.round(orbSize * ORB_RENDER_SCALE)}
            accent={ORB_ACCENT}
            speed={0.6}
            title=""
          />
        </div>
      </div>
      <div className="oi-container oi-container-narrow ois-centered ois-download-copy">
        <h2 id="instant-download-heading" className="oi-h2 ois-finale">
          <Reveal as="span" className="ois-finale-line">
            Start with the work
          </Reveal>{' '}
          <Reveal as="span" className="ois-finale-line" delay={160}>
            in front of you.
          </Reveal>
        </h2>
        <Reveal className="ois-download-action" delay={340}>
          <DesktopDownloadButton descriptionId={RELEASE_ID} />
        </Reveal>
        <Reveal as="p" className="oi-tag" delay={420}>
          Free · M1 Mac or newer · {SIZE_MB} MB
        </Reveal>
        <Reveal delay={500}>
          <More>
            <DesktopReleaseDetails id={RELEASE_ID} showChecksum />
            <p>{WILL_IT_RUN}</p>
            <p id={FIRST_OPEN_ID} className="oi-tag ois-subhead">
              First open
            </p>
            <ol className="ois-steps" aria-labelledby={FIRST_OPEN_ID}>
              {FIRST_OPEN_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>
              Windows or Intel Mac? Not yet.{' '}
              <Link className="oi-link ois-link-target" to="/goals">
                Try the web version
              </Link>
            </p>
          </More>
        </Reveal>
      </div>
    </Seen>
  );
}
