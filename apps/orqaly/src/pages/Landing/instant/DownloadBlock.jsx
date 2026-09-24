import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LineOrb from '../../../components/Common/LineOrb';
import More from './ui/More';
import Reveal from './ui/Reveal';
import { Seen } from './SpeedStrip';
import { DesktopDownloadButton, DesktopReleaseDetails } from '../simple/DesktopDownload';
import { DESKTOP_RELEASE } from '../simple/desktop-release';
import { useT } from './i18n/useT';
import './sections.css';
import { useOrbAccent } from './useInstantTheme';

const RELEASE_ID = 'instant-download-release';
const FIRST_OPEN_ID = 'instant-download-first-open';
const SIZE_MB = Math.round(DESKTOP_RELEASE.bytes / 1_000_000);

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

// `details`: the More with the release facts and first-open steps. Without it (How it works,
// owner 2026-09-21) the facts stay in the page, hidden, as the button's description.
export default function DownloadBlock({ details = true }) {
  const { t } = useT();
  const orbInk = useOrbAccent();
  // Kept as strings: a bare ">" is not valid JSX text.
  const willItRun = t(
    'download.willitrun',
    'Will it run? Apple menu > About This Mac > Chip: Apple M1 or newer.'
  );
  const firstOpenSteps = [
    ['dmg', t('download.firstopen.dmg', 'Open the DMG and drag Orqanix Preview to Applications.')],
    [
      'open',
      t(
        'download.firstopen.open',
        'Open it. If macOS blocks it: System Settings > Privacy & Security > Open Anyway.'
      ),
    ],
    ['signin', t('download.firstopen.signin', 'Sign in with your Orqanix account.')],
  ];
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
            accent={orbInk}
            speed={0.6}
            title=""
          />
        </div>
      </div>
      <div className="oi-container oi-container-narrow ois-centered ois-download-copy">
        <h2 id="instant-download-heading" className="oi-h2 ois-finale">
          <Reveal as="span" className="ois-finale-line">
            {t('download.title.1', 'Start with the work')}
          </Reveal>{' '}
          <Reveal as="span" className="ois-finale-line" delay={160}>
            {t('download.title.2', 'in front of you.')}
          </Reveal>
        </h2>
        <Reveal className="ois-download-action" delay={340}>
          <DesktopDownloadButton descriptionId={RELEASE_ID} />
        </Reveal>
        <Reveal as="p" className="oi-tag" delay={420}>
          {t('download.tag', 'Free · M1 Mac or newer · {size} MB', { size: SIZE_MB })}
        </Reveal>
        {details ? (
          <Reveal delay={500}>
            <More>
              <DesktopReleaseDetails id={RELEASE_ID} showChecksum />
              <p>{willItRun}</p>
              <p id={FIRST_OPEN_ID} className="oi-tag ois-subhead">
                {t('download.firstopen.title', 'First open')}
              </p>
              <ol className="ois-steps" aria-labelledby={FIRST_OPEN_ID}>
                {firstOpenSteps.map(([key, step]) => (
                  <li key={key}>{step}</li>
                ))}
              </ol>
              <p>
                {t('download.other', 'Windows or Intel Mac? Not yet.')}{' '}
                <Link className="oi-link ois-link-target" to="/goals">
                  {t('download.web', 'Try the web version')}
                </Link>
              </p>
            </More>
          </Reveal>
        ) : (
          <div hidden>
            <DesktopReleaseDetails id={RELEASE_ID} />
          </div>
        )}
      </div>
    </Seen>
  );
}
