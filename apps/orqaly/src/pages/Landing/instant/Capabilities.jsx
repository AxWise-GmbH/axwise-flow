import { useEffect, useRef } from 'react';
import { Seen } from './SpeedStrip';
import { PLANNED, STRIP_NOTES, stripKey } from './capabilities.data';
import { useT } from './i18n/useT';
import './sections.css';

/*
 * One line drawing per strip card, in the order of the data: lock, key, sound wave, browser
 * window, connected nodes, id card, folder. Every shape carries pathLength="1" so the CSS can
 * draw it with one stroke-dashoffset, whatever its real length.
 */
const STRIP_ICONS = [
  <>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" pathLength="1" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" pathLength="1" />
    <path d="M12 14.2v2.2" pathLength="1" />
  </>,
  <>
    <circle cx="8" cy="16" r="4" pathLength="1" />
    <path d="M10.9 13.1 20 4" pathLength="1" />
    <path d="m16.4 7.6 2.8 2.8" pathLength="1" />
    <path d="m13.6 10.4 2 2" pathLength="1" />
  </>,
  <>
    <path d="M4 10.5v3" pathLength="1" />
    <path d="M8 7.5v9" pathLength="1" />
    <path d="M12 4v16" pathLength="1" />
    <path d="M16 8v8" pathLength="1" />
    <path d="M20 10.5v3" pathLength="1" />
  </>,
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" pathLength="1" />
    <path d="M3 9h18" pathLength="1" />
    <path d="M6 6.8h2.4" pathLength="1" />
    <path d="M7 14.2h6.5" pathLength="1" />
  </>,
  <>
    <circle cx="12" cy="12" r="2.6" pathLength="1" />
    <path d="M9.9 10.4 6.6 7.8" pathLength="1" />
    <path d="M14.3 10.7 17.6 8.6" pathLength="1" />
    <path d="M13.2 14.3 15.1 17.4" pathLength="1" />
    <circle cx="5.2" cy="6.7" r="1.8" pathLength="1" />
    <circle cx="19.1" cy="7.6" r="1.8" pathLength="1" />
    <circle cx="16" cy="18.9" r="1.8" pathLength="1" />
  </>,
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" pathLength="1" />
    <circle cx="8.6" cy="10.8" r="2" pathLength="1" />
    <path d="M5.6 16c.5-1.7 1.6-2.5 3-2.5s2.5.8 3 2.5" pathLength="1" />
    <path d="M14.5 10h4" pathLength="1" />
    <path d="M14.5 13.5h2.6" pathLength="1" />
  </>,
  <>
    <path
      d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.4l2.1 2.5h7.5A2.5 2.5 0 0 1 21 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5Z"
      pathLength="1"
    />
    <path d="M3 11h18" pathLength="1" />
  </>,
];

// A name added to the data before it has a drawing still gets a quiet mark.
const STRIP_ICON_FALLBACK = <circle cx="12" cy="12" r="5" pathLength="1" />;

/** The seven cards. The strip renders them twice; the second copy only feeds the loop. */
function StripCards({ copy = false }) {
  const { t } = useT();
  // The arrival wave runs on through the second copy, for screens wide enough to show it.
  const offset = copy ? PLANNED.length : 0;
  return (
    <ul className="ois-strip-list" aria-hidden={copy ? 'true' : undefined}>
      {PLANNED.map((item, index) => (
        <li key={item} className="ois-strip-slot" style={{ '--i': index + offset }}>
          <div className="ois-strip-card">
            <span className="ois-strip-tile">
              <svg
                className="ois-strip-glyph"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                {STRIP_ICONS[index] ?? STRIP_ICON_FALLBACK}
              </svg>
            </span>
            <div className="ois-strip-text">
              <p className="ois-strip-name">{t(stripKey(item, 'name'), item)}</p>
              <p className="ois-strip-note">{t(stripKey(item, 'note'), STRIP_NOTES[item])}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const DRIFT_PX_PER_FRAME = 0.55;
const RESUME_MS = 1400;

/**
 * An endless carousel that is also an ordinary scroller. It glides to the right on its own,
 * for ever; a hand on it (hover, drag, swipe, wheel, arrow keys) holds it still, and it
 * moves on again a moment after the hand is gone. The motion writes scrollLeft, so gliding
 * and dragging are the same thing to the browser and never fight.
 */
function useStripRail() {
  const railRef = useRef(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const canGlide = !reduced && typeof requestAnimationFrame === 'function';
    let raf = 0;
    let resumeTimer = 0;
    let onScreen = false;
    let held = false;
    let drag = null;
    // Sub-pixel steps would be rounded away by scrollLeft; carry the remainder here.
    let carry = 0;

    // The row is rendered twice. One copy's width is the loop's period: step over it and the
    // picture is identical, so the jump back cannot be seen.
    const period = () => {
      const lists = rail.querySelectorAll('.ois-strip-list');
      return lists.length > 1 ? lists[1].offsetLeft - lists[0].offsetLeft : 0;
    };
    const wrap = () => {
      const span = period();
      if (!span) return;
      if (rail.scrollLeft >= span) rail.scrollLeft -= span;
      else if (rail.scrollLeft <= 0) rail.scrollLeft += span;
    };
    const glide = () => {
      raf = 0;
      if (held || !onScreen) return;
      carry += DRIFT_PX_PER_FRAME;
      const whole = Math.floor(carry);
      if (whole) {
        carry -= whole;
        // Decreasing scrollLeft moves the cards to the right.
        rail.scrollLeft -= whole;
        wrap();
      }
      raf = requestAnimationFrame(glide);
    };
    const start = () => {
      if (canGlide && !raf && !held && onScreen) {
        rail.setAttribute('data-drifting', '');
        raf = requestAnimationFrame(glide);
      }
    };
    const hold = () => {
      held = true;
      window.clearTimeout(resumeTimer);
      rail.removeAttribute('data-drifting');
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const release = () => {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        held = false;
        start();
      }, RESUME_MS);
    };
    const nudge = () => {
      hold();
      release();
    };
    const onDown = (event) => {
      hold();
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = { x: event.clientX, left: rail.scrollLeft };
      rail.setPointerCapture?.(event.pointerId);
      rail.setAttribute('data-dragging', '');
    };
    const onMove = (event) => {
      if (!drag) return;
      rail.scrollLeft = drag.left - (event.clientX - drag.x);
      const before = rail.scrollLeft;
      wrap();
      // A wrap moves the rail under the hand; move the drag's origin with it.
      drag.left += rail.scrollLeft - before;
    };
    const onUp = () => {
      drag = null;
      rail.removeAttribute('data-dragging');
      release();
    };
    const onLeave = () => {
      if (!drag) release();
    };

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting;
            start();
          });
    observer?.observe(rail);
    rail.addEventListener('pointerenter', hold);
    rail.addEventListener('pointerleave', onLeave);
    rail.addEventListener('pointerdown', onDown);
    rail.addEventListener('pointermove', onMove);
    rail.addEventListener('pointerup', onUp);
    rail.addEventListener('pointercancel', onUp);
    rail.addEventListener('wheel', nudge, { passive: true });
    rail.addEventListener('keydown', nudge);
    rail.addEventListener('focusin', hold);
    rail.addEventListener('focusout', release);
    rail.addEventListener('scroll', wrap, { passive: true });
    // Start one full row in, so there is room to glide right from the first frame.
    rail.scrollLeft = period() || 1;
    return () => {
      observer?.disconnect();
      window.clearTimeout(resumeTimer);
      if (raf) cancelAnimationFrame(raf);
      rail.removeEventListener('pointerenter', hold);
      rail.removeEventListener('pointerleave', onLeave);
      rail.removeEventListener('pointerdown', onDown);
      rail.removeEventListener('pointermove', onMove);
      rail.removeEventListener('pointerup', onUp);
      rail.removeEventListener('pointercancel', onUp);
      rail.removeEventListener('wheel', nudge);
      rail.removeEventListener('keydown', nudge);
      rail.removeEventListener('focusin', hold);
      rail.removeEventListener('focusout', release);
      rail.removeEventListener('scroll', wrap);
    };
  }, []);

  return railRef;
}

export default function Capabilities() {
  const { t } = useT();
  const railRef = useStripRail();
  return (
    <Seen
      as="section"
      id="control"
      className="oi-section oi-section-tight ois-section"
      aria-label={t('cap.section', 'More inside')}
    >
      <div className="oi-container">
        <Seen className="ois-gate ois-strip-gate">
          {/*
           * "oi-planned" is only a hook other tests find the strip by. The rail is an ordinary
           * sideways scroller that also glides on its own, endlessly: see useStripRail.
           */}
          <div
            className="oi-planned ois-strip"
            role="group"
            aria-label={t('cap.strip.label', 'More capabilities')}
          >
            <div
              ref={railRef}
              className="ois-strip-rail"
              tabIndex={0}
              role="region"
              aria-label={t('cap.strip.rail', 'Capabilities, scroll sideways')}
            >
              <div className="ois-strip-track">
                <StripCards />
                <StripCards copy />
              </div>
            </div>
          </div>
        </Seen>
      </div>
    </Seen>
  );
}
