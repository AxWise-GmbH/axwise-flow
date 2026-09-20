import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from './ui/Reveal';
import { OrqanixMark } from './ui/Glyphs';
import { Seen } from './SpeedStrip';
import { SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';
import { industryPaths } from './pages/solutions/solutionIconPaths';
import './UseCases.css';

// One card per Solutions page, in the menu's order. The title is that page's own headline
// (a test keeps the two in step), so the card and the page it opens say the same thing.
const CARD_COPY = {
  healthcare: {
    title: 'Front desk work that never piles up.',
    line: 'After-hours calls, reminders, coverage checks and intake summaries, ready for staff to review.',
    ask: "Draft the reminders for tomorrow's appointments.",
  },
  'real-estate': {
    title: 'Leads answered while you are at viewings.',
    line: 'Listing replies, viewings in your calendar, follow-ups and offer drafts.',
    ask: "Reply to today's listing questions and book the viewings.",
  },
  ecommerce: {
    title: 'Your store keeps moving while you sleep.',
    line: 'Order updates, supplier threads, customer questions and the returns queue.',
    ask: "Sort today's returns and draft the replies.",
  },
  restaurants: {
    title: 'Guest requests sorted before anyone chases.',
    line: 'Housekeeping, room service, extras and table bookings, sent to the right person.',
    ask: "Route this morning's guest requests.",
  },
  education: {
    title: 'Admin hours given back to teaching.',
    line: 'Lesson plans, student summaries and guidance notes, drafted from your own materials.',
    ask: 'Draft a lesson plan from unit four.',
  },
  legal: {
    title: 'The groundwork done. The judgement stays yours.',
    line: 'Client maps, structured reports and meeting notes, as drafts for a lawyer to review.',
    ask: 'Prepare a report from these meeting notes.',
  },
  marketing: {
    title: 'Ship the content. Explain the numbers.',
    line: 'Social packs, content drafts and client reports, prepared for your team.',
    ask: 'Plan a spring campaign for my shop.',
  },
  creators: {
    title: 'One studio for every platform you post on.',
    line: 'Topic research, scripts, the publishing calendar and sponsor reports.',
    ask: 'Turn this video into a week of posts.',
  },
  freelancers: {
    title: 'Proposal to payment without the admin spiral.',
    line: 'Discovery notes, proposals, invoices and polite payment reminders.',
    ask: 'Write a proposal from the call notes.',
  },
  manufacturing: {
    title: 'Suppliers, stock and quality in one place.',
    line: 'Supplier email, stock answers, quality logs and early warning when a date slips.',
    ask: 'Which deliveries are slipping this week?',
  },
};

const CASES = SOLUTIONS_MENU.map(({ slug, label }) => ({
  slug,
  label,
  tag: label.toUpperCase(),
  glyph: industryPaths(slug),
  ...CARD_COPY[slug],
}));

const COUNT = CASES.length;
const clamp = (n) => Math.max(0, Math.min(COUNT - 1, n));
// The carousel is a loop: one step past either end lands on the other.
const loop = (n) => ((n % COUNT) + COUNT) % COUNT;
const two = (n) => String(n).padStart(2, '0');

let motionQuery = null;

function prefersReducedMotion() {
  motionQuery ??= globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  return motionQuery?.matches ?? false;
}

function Glyph({ paths, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths.map((d, n) => (
        <path key={d} d={d} pathLength="1" style={{ '--n': n }} />
      ))}
    </svg>
  );
}

function Arrow({ back = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={back ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6'} />
    </svg>
  );
}

/*
 * The request. Only the card that is typing right now is split into letters (CSS delays, no
 * timers), so the page carries some forty extra spans instead of three hundred. The split
 * letters are decoration; assistive tech reads the whole sentence from the hidden copy.
 * state: 'rest' (not read yet), 'typing' (current for the first time) or 'done'.
 */
function Request({ text, state, current }) {
  const typing = state === 'typing';
  return (
    <>
      {typing && <span className="oi-sr-only">{text}</span>}
      <span className="ouc-typed" data-state={state} aria-hidden={typing || undefined}>
        {typing
          ? Array.from(text, (letter, i) => (
              <span key={i} className="ouc-ch" style={{ '--i': i }}>
                {letter}
              </span>
            ))
          : text}
        {current && (
          <i className="ouc-caret" aria-hidden="true" style={{ '--i': typing ? text.length : 0 }} />
        )}
      </span>
    </>
  );
}

export default function UseCases() {
  const trackRef = useRef(null);
  const railRef = useRef(null);
  const indexRef = useRef(0);
  // Where the cards sit, read once per layout (never while scrolling): the scroll position
  // that centres the first card, the distance between two cards and the width of one.
  const geoRef = useRef(null);
  // What was last written to each slide and to the rail, so a frame only touches what moved.
  const paintedRef = useRef({ focus: [], pos: '' });
  // The card a button, dot or key is scrolling to; the scroll position is ignored until it
  // arrives, so the dots do not flicker through every card on the way.
  const headingRef = useRef(null);
  const landRef = useRef(0);
  const armedRef = useRef(false);
  const scrollFrame = useRef(0);
  const pointerFrame = useRef(0);
  const dragRef = useRef(null);
  const tiltRef = useRef({ card: null, last: null, x: 0, y: 0 });
  const swallowClick = useRef(false);

  const [index, setIndex] = useState(0);
  // Cards that were current and then left: their request stays typed.
  const [visited, setVisited] = useState(() => new Set());

  const select = useCallback((next) => {
    const from = indexRef.current;
    if (next === from) return;
    indexRef.current = next;
    setIndex(next);
    if (armedRef.current) setVisited((seen) => (seen.has(from) ? seen : new Set(seen).add(from)));
  }, []);

  const settle = useCallback(() => {
    const track = trackRef.current;
    if (track?.dataset.drag === 'settling') delete track.dataset.drag;
  }, []);

  // Runs at most once a frame and reads nothing but scrollLeft: finds the card nearest the
  // middle and hands every card its focus (1 in the middle, 0 a card-width away) so the
  // brightness and the lift follow the finger.
  const measure = useCallback(() => {
    scrollFrame.current = 0;
    const track = trackRef.current;
    const geo = geoRef.current;
    if (!track || !geo) return;
    const left = track.scrollLeft;
    const pos = Math.max(0, Math.min(COUNT - 1, (left - geo.lead) / geo.step));
    const still = prefersReducedMotion();
    const painted = paintedRef.current;

    for (let i = 0; i < COUNT; i += 1) {
      const gap = Math.abs(i - pos) * geo.step;
      const focus = still ? '' : Math.max(0, 1 - gap / geo.width).toFixed(3);
      if (focus === painted.focus[i]) continue;
      painted.focus[i] = focus;
      const { style } = track.children[i];
      if (focus) style.setProperty('--f', focus);
      else style.removeProperty('--f');
    }
    const at = pos.toFixed(3);
    if (at !== painted.pos) {
      painted.pos = at;
      railRef.current?.style.setProperty('--pos', at);
    }

    if (track.dataset.drag === 'settling' && Math.abs(left - landRef.current) < 1.5) settle();

    const nearest = Math.round(pos);
    if (headingRef.current !== null) {
      if (nearest !== headingRef.current) return;
      headingRef.current = null;
    }
    select(nearest);
    armedRef.current = true;
  }, [select, settle]);

  const queueMeasure = useCallback(() => {
    if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(measure);
  }, [measure]);

  const goTo = useCallback(
    (wanted) => {
      const track = trackRef.current;
      if (!track) return;
      const next = loop(wanted);
      const geo = geoRef.current;
      const left = geo ? geo.lead + next * geo.step : 0;
      armedRef.current = true;
      headingRef.current = next;
      landRef.current = left;
      select(next);
      if (!geo || Math.abs(track.scrollLeft - left) < 1.5) {
        headingRef.current = null;
        settle();
        return;
      }
      track.scrollTo?.({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    },
    [select, settle]
  );

  // Geometry comes from a ResizeObserver, so it is read when layout is already clean: no
  // forced layout while the page loads, and none while the row scrolls.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = 0;
    const resize = new ResizeObserver(() => {
      const view = track.clientWidth;
      const [first, second] = track.children;
      if (!view || view === lastWidth || !second) return;
      const opening = lastWidth === 0 && indexRef.current === 0;
      lastWidth = view;
      const width = first.offsetWidth;
      const step = second.offsetLeft - first.offsetLeft;
      const gap = step - width;
      // The room beside the first and last card, pinned in pixels: a percentage would move
      // every card, and with them the scroll position, whenever the browser re-lays the page
      // out at another width for a moment (a print preview, a capture).
      const edge = Math.round(Math.max(0, (view - width) / 2 - gap) * 10) / 10;
      track.style.setProperty('--ouc-edge', `${edge}px`);
      const geo = { width, step, lead: edge + gap + width / 2 - view / 2 };
      geoRef.current = geo;
      // Wide screens open a card or two in, so the row is full on both sides of the middle.
      const start = opening ? clamp(Math.min(2, Math.round((view - width) / 2 / step))) : null;
      if (start !== null) track.scrollLeft = geo.lead + start * step;
      else if (!dragRef.current) track.scrollLeft = geo.lead + indexRef.current * step;
      measure();
    });
    resize.observe(track);

    const frames = [scrollFrame, pointerFrame];
    return () => {
      resize.disconnect();
      for (const frame of frames) {
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
    };
  }, [measure]);

  // Pointer work, once a frame: a mouse drag moves the track, otherwise the card under the
  // pointer leans toward it and its highlight follows.
  const paintPointer = () => {
    pointerFrame.current = 0;
    const track = trackRef.current;
    const drag = dragRef.current;
    if (!track) return;
    if (drag?.moved) {
      track.scrollLeft = drag.to;
      return;
    }
    const tilt = tiltRef.current;
    if (tilt.last && tilt.last !== tilt.card) {
      tilt.last.style.removeProperty('--rx');
      tilt.last.style.removeProperty('--ry');
    }
    tilt.last = tilt.card;
    if (!tilt.card) return;
    const box = tilt.card.getBoundingClientRect();
    const px = (tilt.x - box.left) / box.width;
    const py = (tilt.y - box.top) / box.height;
    tilt.card.style.setProperty('--ry', `${((px - 0.5) * 9).toFixed(2)}deg`);
    tilt.card.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
    tilt.card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    tilt.card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  };

  const queuePointer = () => {
    if (!pointerFrame.current) pointerFrame.current = requestAnimationFrame(paintPointer);
  };

  const takeOver = () => {
    // The visitor is steering now: the scroll position decides which card is current.
    headingRef.current = null;
    settle();
  };

  const onPointerDown = (event) => {
    takeOver();
    swallowClick.current = false;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      left: trackRef.current.scrollLeft,
      from: indexRef.current,
      moved: false,
      lastX: event.clientX,
      lastT: event.timeStamp,
      speed: 0,
      to: 0,
    };
  };

  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const track = trackRef.current;
    const drag = dragRef.current;
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) {
        drag.moved = true;
        track.dataset.drag = 'true';
        track.setPointerCapture?.(event.pointerId);
        globalThis.getSelection?.()?.removeAllRanges();
        tiltRef.current.card = null;
      }
      if (drag.moved) {
        const dt = event.timeStamp - drag.lastT;
        if (dt > 0) drag.speed = 0.7 * ((event.clientX - drag.lastX) / dt) + 0.3 * drag.speed;
        drag.lastX = event.clientX;
        drag.lastT = event.timeStamp;
        drag.to = drag.left - dx;
        queuePointer();
        return;
      }
    }
    if (prefersReducedMotion()) return;
    const tilt = tiltRef.current;
    tilt.card = event.target.closest?.('.ouc-card') ?? null;
    tilt.x = event.clientX;
    tilt.y = event.clientY;
    queuePointer();
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved) return;
    const track = trackRef.current;
    swallowClick.current = true;
    if (track.hasPointerCapture?.(drag.id)) track.releasePointerCapture(drag.id);
    // Snap stays off until the glide lands, so the card eases home instead of jumping.
    track.dataset.drag = 'settling';
    const geo = geoRef.current;
    let land = geo ? Math.round((track.scrollLeft - geo.lead) / geo.step) : drag.from;
    // A quick flick that did not cross the halfway point still moves one card on.
    if (land === drag.from && Math.abs(drag.speed) > 0.35) land += drag.speed < 0 ? 1 : -1;
    goTo(land);
  };

  const onPointerLeave = () => {
    tiltRef.current.card = null;
    queuePointer();
  };

  const onClick = (event) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    const slide = event.target.closest?.('[data-slide]');
    if (slide) goTo(Number(slide.dataset.slide));
  };

  const onKeyDown = (event) => {
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: COUNT - 1 };
    if (!(event.key in moves) || event.target !== event.currentTarget) return;
    event.preventDefault();
    goTo(moves[event.key]);
  };

  const onScrollEnd = () => {
    headingRef.current = null;
    settle();
    queueMeasure();
  };

  const fresh = visited.size === 0;
  const stateOf = (i) => {
    if (visited.has(i)) return 'done';
    return i === index ? 'typing' : 'rest';
  };

  return (
    <Seen as="section" id="cases" className="oi-section ouc" aria-labelledby="cases-heading">
      <div className="oi-container">
        <Seen className="ouc-gate ouc-head">
          <div className="ouc-head-main">
            <Reveal as="p" className="oi-tag oi-tag-bracket">
              How it's used
            </Reveal>
            <Reveal as="h2" id="cases-heading" className="oi-h2" delay={90}>
              One app. Many jobs.
            </Reveal>
            <Reveal as="p" className="oi-line" delay={180}>
              Pick yours. Every result is a first draft for you to review.
            </Reveal>
          </div>
          <Reveal className="ouc-controls" delay={270}>
            <p className="ouc-count" aria-hidden="true">
              <b key={index}>{two(index + 1)}</b> / {two(COUNT)}
            </p>
            <button
              type="button"
              className="ouc-nav ouc-nav-prev"
              aria-label="Previous case"
              onClick={() => goTo(index - 1)}
            >
              <Arrow back />
            </button>
            <button
              type="button"
              className="ouc-nav ouc-nav-next"
              aria-label="Next case"
              onClick={() => goTo(index + 1)}
            >
              <Arrow />
            </button>
          </Reveal>
        </Seen>
      </div>

      <Seen className="ouc-stage" threshold={0.3} data-fresh={fresh}>
        <div className="ouc-row">
          <i className="ouc-glow" aria-hidden="true" />
          <i className="ouc-floor" aria-hidden="true">
            <i key={index} className="ouc-pulse" />
          </i>
          <div className="ouc-viewport">
            <div
              ref={trackRef}
              className="ouc-track"
              role="region"
              aria-roledescription="carousel"
              aria-label="Use cases"
              tabIndex={0}
              onScroll={queueMeasure}
              onScrollEnd={onScrollEnd}
              onWheel={takeOver}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerLeave={onPointerLeave}
              onClick={onClick}
              onKeyDown={onKeyDown}
            >
              {CASES.map((item, i) => (
                <div
                  key={item.tag}
                  className="ouc-slide"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${COUNT}`}
                  data-slide={i}
                  data-current={i === index}
                  style={{ '--enter': `${Math.abs(i - index) * 90}ms` }}
                >
                  <div className="ouc-lift">
                    <div className="ouc-card">
                      <i className="ouc-streak" aria-hidden="true" />
                      <Glyph paths={item.glyph} className="ouc-ghost" />
                      <div className="ouc-top">
                        <span className="ouc-tile">
                          <Glyph paths={item.glyph} className="ouc-icon" />
                        </span>
                        <p className="ouc-pill">{item.tag}</p>
                      </div>
                      <h3 className="ouc-title">{item.title}</h3>
                      <p className="ouc-line">{item.line}</p>
                      <div className="ouc-ask">
                        <p className="ouc-ask-label">
                          <OrqanixMark className="ouc-ask-mark" />
                          Ask
                        </p>
                        <p className="ouc-ask-text">
                          <Request text={item.ask} current={i === index} state={stateOf(i)} />
                        </p>
                      </div>
                      {/* Only the card in front is a way out: a side card's first job is to
                          come forward, and a drag must never end as a page change. */}
                      <Link
                        className="ouc-more"
                        to={solutionPath(item.slug)}
                        tabIndex={i === index ? undefined : -1}
                        aria-label={`${item.label}: see the page`}
                        onClick={(event) => {
                          if (swallowClick.current || i !== index) event.preventDefault();
                        }}
                      >
                        See the page
                        <Arrow />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="oi-container ouc-foot">
          <div ref={railRef} className="ouc-dots">
            {CASES.map((item, i) => (
              <button
                key={item.tag}
                type="button"
                className="ouc-dot"
                aria-label={`Go to case ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => goTo(i)}
              />
            ))}
            <i className="ouc-bead" aria-hidden="true" />
          </div>
          <p className="oi-small ouc-note">Example requests. Results are drafts, not advice.</p>
          <p className="oi-sr-only" aria-live="polite">
            {fresh ? '' : `Showing case ${index + 1} of ${COUNT}`}
          </p>
        </div>
      </Seen>
    </Seen>
  );
}
