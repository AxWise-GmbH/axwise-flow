import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { ChevronGlyph, OrqanixMark } from './ui/Glyphs';
import { INSTANT_HOME, INSTANT_PAGES } from './pages/instantPages';
import { IndustryIcon } from './pages/solutions/solutionIcons';
import { SOLUTIONS_BASE, SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';

const SOLUTIONS = 'solutions';
// Pages marked nav: false keep their route but stay out of the bar and the phone menu.
const NAV_PAGES = INSTANT_PAGES.filter((page) => page.nav !== false);
// "Solutions" sits after Features, in the bar and in the phone menu alike.
const NAV_ITEMS = [...NAV_PAGES.slice(0, 2), SOLUTIONS, ...NAV_PAGES.slice(2)];

// Pointing at the button opens the panel only if the pointer stays; leaving closes it only
// if the pointer does not come back. Long enough to cross the gap, short enough to feel live.
const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 240;
// People often click the button they have just pointed at. That click means "open", but only
// for a moment; after it, a click on an open panel closes it again.
const HOVER_CLICK_GRACE_MS = 600;

function SolutionLinks({ pathname, linkClass, iconClass, onPick }) {
  return SOLUTIONS_MENU.map(({ slug, label, line }, index) => (
    <li key={slug} style={{ '--i': index }}>
      <RouterLink
        to={solutionPath(slug)}
        className={linkClass}
        aria-current={pathname === solutionPath(slug) ? 'page' : undefined}
        onClick={onPick}
      >
        <IndustryIcon slug={slug} className={iconClass} />
        <span>
          <b>{label}</b>
          <small>{line}</small>
        </span>
      </RouterLink>
    </li>
  ));
}

function SolutionsDropdown({ pathname, active }) {
  // The panel remembers the path it was opened on, so any navigation closes it by itself.
  const [openedOn, setOpenedOn] = useState(null);
  const open = openedOn === pathname;
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const timer = useRef(0);
  const hoverOpenedAt = useRef(-Infinity);

  const show = () => setOpenedOn(pathname);
  const hide = () => setOpenedOn(null);
  const cancelTimer = () => window.clearTimeout(timer.current);

  useEffect(() => cancelTimer, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setOpenedOn(null);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpenedOn(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const onEnter = (event) => {
    if (event.pointerType !== 'mouse') return;
    cancelTimer();
    if (open) return;
    timer.current = window.setTimeout(() => {
      hoverOpenedAt.current = performance.now();
      show();
    }, HOVER_OPEN_MS);
  };

  const onLeave = (event) => {
    if (event.pointerType !== 'mouse') return;
    cancelTimer();
    timer.current = window.setTimeout(hide, HOVER_CLOSE_MS);
  };

  const onClick = () => {
    cancelTimer();
    const justHoverOpened = performance.now() - hoverOpenedAt.current < HOVER_CLICK_GRACE_MS;
    if (open && !justHoverOpened) hide();
    else show();
    hoverOpenedAt.current = -Infinity;
  };

  const onBlur = (event) => {
    if (event.relatedTarget && !rootRef.current?.contains(event.relatedTarget)) hide();
  };

  return (
    <div
      ref={rootRef}
      className="oi-sol"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onBlur={onBlur}
    >
      <button
        ref={buttonRef}
        type="button"
        className="oi-nav-link oi-sol-button"
        aria-expanded={open}
        aria-controls="oi-solutions-panel"
        data-active={active}
        onClick={onClick}
      >
        Solutions
        <ChevronGlyph className="oi-sol-chevron" />
      </button>
      <div id="oi-solutions-panel" className="oi-sol-panel" hidden={!open}>
        <ul className="oi-sol-grid">
          <SolutionLinks
            pathname={pathname}
            linkClass="oi-sol-link"
            iconClass="oi-sol-icon"
            onPick={hide}
          />
        </ul>
        <p className="oi-sol-foot">
          <span>One desktop app</span>
          <span>Ten kinds of work</span>
        </p>
      </div>
    </div>
  );
}

export default function InstantTopBar() {
  // Clear over the hero's light; frosted once content scrolls underneath it.
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const onSolutions = pathname.startsWith(`${SOLUTIONS_BASE}/`);
  const [sheetSolutions, setSheetSolutions] = useState(onSolutions);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="oi-bar" data-scrolled={scrolled} data-open={open}>
      <div className="oi-container oi-bar-row">
        <RouterLink to={INSTANT_HOME} aria-label="Orqanix - home" className="oi-brand">
          <OrqanixMark className="oi-brand-mark" />
          Orqanix
        </RouterLink>

        <nav aria-label="Main navigation" className="oi-nav">
          {NAV_ITEMS.map((item) =>
            item === SOLUTIONS ? (
              <SolutionsDropdown key={SOLUTIONS} pathname={pathname} active={onSolutions} />
            ) : (
              <RouterLink
                key={item.path}
                to={item.path}
                className="oi-nav-link"
                aria-current={pathname === item.path ? 'page' : undefined}
              >
                {item.label}
              </RouterLink>
            )
          )}
          {/* Every page ends with the download block, so the same anchor works everywhere. */}
          <a href="#download" className="oi-nav-cta">
            Try For Free
          </a>
        </nav>

        <button
          type="button"
          className="oi-menu-toggle"
          aria-expanded={open}
          aria-controls="oi-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="oi-sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <span className="oi-menu-icon" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>

      <nav id="oi-mobile-menu" aria-label="Menu" className="oi-sheet-menu" hidden={!open}>
        {NAV_ITEMS.map((item, index) =>
          item === SOLUTIONS ? (
            <div key={SOLUTIONS} className="oi-sheet-group" style={{ '--i': index }}>
              <button
                type="button"
                className="oi-sheet-link oi-sheet-button"
                aria-expanded={sheetSolutions}
                aria-controls="oi-sheet-solutions"
                data-active={onSolutions}
                onClick={() => setSheetSolutions((value) => !value)}
              >
                <span aria-hidden="true">0{index + 1}</span>
                Solutions
                <ChevronGlyph className="oi-sheet-chevron" />
              </button>
              <ul id="oi-sheet-solutions" className="oi-sheet-sub" hidden={!sheetSolutions}>
                <SolutionLinks
                  pathname={pathname}
                  linkClass="oi-sheet-sublink"
                  iconClass="oi-sheet-subicon"
                  onPick={() => setOpen(false)}
                />
              </ul>
            </div>
          ) : (
            <RouterLink
              key={item.path}
              to={item.path}
              className="oi-sheet-link"
              style={{ '--i': index }}
              aria-current={pathname === item.path ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true">0{index + 1}</span>
              {item.label}
            </RouterLink>
          )
        )}
        <a href="#download" className="oi-sheet-cta" onClick={() => setOpen(false)}>
          Try For Free
        </a>
      </nav>
    </header>
  );
}
