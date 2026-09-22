import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { ChevronGlyph, OrqanixMark } from './ui/Glyphs';
import { INSTANT_HOME, INSTANT_PAGES } from './pages/instantPages';
import { IndustryIcon } from './pages/solutions/solutionIcons';
import { SOLUTIONS_BASE, SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';
import {
  NAV_PRODUCTS,
  findProduct,
  productFromPath,
  productPath,
} from './pages/products/productsMenu';
import ProductsPanel, { SceneLayers } from './ProductsPanel';
import useNavMenus, { rove, useProductPick, warmScenes } from './useNavMenus';
import { useT } from './i18n/useT';

const SOLUTIONS = 'solutions';
// Pages marked nav: false keep their route but stay out of the bar and the phone menu.
const NAV_PAGES = INSTANT_PAGES.filter((page) => page.nav !== false);
// "Solutions" sits after Features, in the bar and in the phone menu alike. "Products" leads
// both, ahead of these.
const NAV_ITEMS = [...NAV_PAGES.slice(0, 2), SOLUTIONS, ...NAV_PAGES.slice(2)];

// The phone menu's exit, as long as its animation in chrome.css.
const SHEET_EXIT_MS = 180;
// From this width the bar shows its own links, so an open phone menu closes.
const WIDE_SCREEN = '(min-width: 1200px)';

function prefersReducedMotion() {
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/**
 * 'open', 'closing' or 'closed'. Something that closes stays on screen as 'closing' for
 * exitMs, so its exit can play, and is hidden after that. Reduced motion hides it at once.
 */
function useExit(open, exitMs) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setClosing(!open && !prefersReducedMotion());
  }

  useEffect(() => {
    if (!closing) return undefined;
    const timer = window.setTimeout(() => setClosing(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [closing, exitMs]);

  if (open) return 'open';
  return closing ? 'closing' : 'closed';
}

// The phone menu is a bento of tiles. Each page tile says in a few words what is behind it:
// the page's own opening line.
const TILES = {
  'how-it-works': { glyph: 'steps', line: 'Five steps, one chat' },
  features: { glyph: 'grid', line: 'In the app today' },
};
const tileLine = (t, slug) =>
  ({
    'how-it-works': t('nav.tile.how', 'Five steps, one chat'),
    features: t('nav.tile.features', 'In the app today'),
  })[slug];

const TILE_GLYPHS = {
  steps:
    'M1.4 8a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M6.4 8a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M11.4 8a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M4.6 8h1.8M9.6 8h1.8',
  grid: 'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z',
  arrow: 'M5 11 11 5M6 5h5v5',
};

function TileGlyph({ name, className }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path
        d={TILE_GLYPHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SolutionLinks({ pathname, linkClass, iconClass, onPick }) {
  const { t } = useT();
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
          <b>{t(`solutions.${slug}.label`, label)}</b>
          <small>{t(`solutions.${slug}.line`, line)}</small>
        </span>
      </RouterLink>
    </li>
  ));
}

// A bar button with its panel under it. Products and Solutions share the look and the open
// state (useNavMenus); `menu` is what menu(id) returned for it.
function NavMenu({ id, label, menu, active, children }) {
  return (
    <div className="oi-sol" {...menu.root}>
      <button
        type="button"
        className="oi-nav-link oi-sol-button"
        aria-controls={`oi-${id}-panel`}
        data-active={active}
        {...menu.button}
      >
        {label}
        <ChevronGlyph className="oi-sol-chevron" />
      </button>
      {children}
    </div>
  );
}

// The phone menu's Products tile: a row of tabs, a live preview of the picked product, its
// line and a link to its page. The pick starts on the product page you are on, else Desktop
// App, and is forgotten once the menu has closed (useProductPick).
function ProductsTile({ pathname, on, onPick }) {
  const [tab, pick, scenes, current] = useProductPick(on, pathname);
  const { label, line, soon } = findProduct(tab);
  const { t } = useT();
  const name = t(`products.${tab}.label`, label);

  // The picked tab slides into view in its sideways row.
  useEffect(() => {
    if (!on) return;
    const picked = document.getElementById(`oi-pp-tab-${tab}`);
    picked.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [on, tab]);

  // First in the bento; it rises with the first page tile (no --i of its own).
  return (
    <div className="oi-bento-tile oi-bento-wide" data-active={Boolean(current)}>
      <p className="oi-bento-head oi-bento-name">{t('nav.products', 'Products')}</p>
      {/* Left and Right walk the tabs (roving focus); the preview follows focus. */}
      <div
        role="tablist"
        aria-label={t('nav.products', 'Products')}
        className="oi-pp-tabs"
        onKeyDown={(event) => rove(event, 'ArrowLeft', 'ArrowRight')}
      >
        {NAV_PRODUCTS.map((item) => {
          const choose = () => pick(item.slug);
          return (
            <button
              key={item.slug}
              id={`oi-pp-tab-${item.slug}`}
              type="button"
              role="tab"
              className="oi-pp-tab"
              aria-selected={item.slug === tab}
              aria-controls="oi-pp-tabpanel"
              tabIndex={item.slug === tab ? 0 : -1}
              onClick={choose}
              onFocus={choose}
            >
              {t(`products.${item.slug}.label`, item.label)}
            </button>
          );
        })}
      </div>
      <div
        id="oi-pp-tabpanel"
        role="tabpanel"
        aria-labelledby={`oi-pp-tab-${tab}`}
        className="oi-pp-card"
      >
        <div className="oi-pp-stage" aria-hidden="true">
          <SceneLayers scenes={scenes} active={tab} />
        </div>
        <p className="oi-bento-line">
          {t(`products.${tab}.line`, line)}{' '}
          {soon && <em className="oi-pp-soon">{t('products.soon', 'Coming soon')}</em>}
        </p>
        <RouterLink to={productPath(tab)} className="oi-pp-open" onClick={onPick}>
          {t('nav.open', 'Open {name}', { name })}
          <TileGlyph name="arrow" className="oi-bento-arrow" />
        </RouterLink>
      </div>
    </div>
  );
}

export default function InstantTopBar() {
  const { t } = useT();
  // Clear over the hero's light; frosted once content scrolls underneath it.
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  // The phone menu remembers the path it was opened on, so any navigation closes it by itself.
  const [openedOn, setOpenedOn] = useState(null);
  const open = openedOn === pathname;
  const sheet = useExit(open, SHEET_EXIT_MS);
  const menu = useNavMenus(pathname);
  const products = menu('products', warmScenes);
  const solutions = menu(SOLUTIONS);
  // Lit on the pages the menu lists; a page kept out of the menu (nav: false) leaves it dark.
  const onProducts = NAV_PRODUCTS.includes(productFromPath(pathname));
  const onSolutions = pathname.startsWith(`${SOLUTIONS_BASE}/`);
  const headerRef = useRef(null);
  const toggleRef = useRef(null);
  const close = () => setOpenedOn(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The open sheet covers the whole screen: the page under it stays put and out of reach
  // (no scrolling, no tabbing, nothing for a screen reader) until it closes.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    const header = headerRef.current;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const covered = [...(header?.parentElement?.children ?? [])].filter(
      (element) => element !== header && !element.hasAttribute('inert')
    );
    for (const element of covered) element.setAttribute('inert', '');

    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setOpenedOn(null);
      toggleRef.current?.focus();
    };
    const wide = window.matchMedia?.(WIDE_SCREEN);
    const onWide = (event) => {
      if (event.matches) setOpenedOn(null);
    };
    document.addEventListener('keydown', onKey);
    wide?.addEventListener?.('change', onWide);
    return () => {
      root.style.overflow = overflow;
      for (const element of covered) element.removeAttribute('inert');
      document.removeEventListener('keydown', onKey);
      wide?.removeEventListener?.('change', onWide);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="oi-bar" data-scrolled={scrolled} data-menu={sheet}>
      <div className="oi-container oi-bar-row">
        <RouterLink to={INSTANT_HOME} aria-label={t('nav.home', 'Orqanix - home')} className="oi-brand">
          <OrqanixMark className="oi-brand-mark" />
          Orqanix
        </RouterLink>

        <nav aria-label={t('nav.main', 'Main navigation')} className="oi-nav">
          <NavMenu id="products" label={t('nav.products', 'Products')} menu={products} active={onProducts}>
            <ProductsPanel open={products.open} pathname={pathname} hide={products.hide} />
          </NavMenu>
          {NAV_ITEMS.map((item) =>
            item === SOLUTIONS ? (
              <NavMenu
                key={item}
                id={item}
                label={t('nav.solutions', 'Solutions')}
                menu={solutions}
                active={onSolutions}
              >
                <div id="oi-solutions-panel" className="oi-sol-panel" hidden={!solutions.open}>
                  <ul className="oi-sol-grid">
                    <SolutionLinks
                      pathname={pathname}
                      linkClass="oi-sol-link"
                      iconClass="oi-sol-icon"
                      onPick={solutions.hide}
                    />
                  </ul>
                  <p className="oi-sol-foot">
                    <span>{t('nav.solutions.app', 'One desktop app')}</span>
                    <span>{t('nav.solutions.line', 'Ten kinds of work')}</span>
                  </p>
                </div>
              </NavMenu>
            ) : (
              <RouterLink
                key={item.path}
                to={item.path}
                className="oi-nav-link"
                aria-current={pathname === item.path ? 'page' : undefined}
              >
                {t(`pages.${item.slug}.label`, item.label)}
              </RouterLink>
            )
          )}
          {/* Every page ends with the download block, so the same anchor works everywhere. */}
          <a href="#download" className="oi-nav-cta">
            {t('nav.cta', 'Try For Free')}
          </a>
        </nav>

        <button
          ref={toggleRef}
          type="button"
          className="oi-menu-toggle"
          aria-expanded={open}
          aria-controls="oi-mobile-menu"
          onClick={() => setOpenedOn(open ? null : pathname)}
        >
          <span className="oi-sr-only">{open ? t('nav.menu.close', 'Close menu') : t('nav.menu.open', 'Open menu')}</span>
          <span className="oi-menu-icon" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>

      <nav
        id="oi-mobile-menu"
        aria-label={t('nav.menu', 'Menu')}
        className="oi-sheet-menu"
        data-state={sheet}
        hidden={sheet === 'closed'}
      >
        <div className="oi-container oi-sheet-inner">
          <div className="oi-bento">
            <ProductsTile pathname={pathname} on={sheet !== 'closed'} onPick={close} />
            {NAV_ITEMS.map((item, index) =>
              item === SOLUTIONS ? (
                <div
                  key={SOLUTIONS}
                  className="oi-bento-tile oi-bento-wide"
                  style={{ '--i': index }}
                  data-active={onSolutions}
                >
                  <p className="oi-bento-head">
                    <span id="oi-sheet-solutions-name" className="oi-bento-name">
                      {t('nav.solutions', 'Solutions')}
                    </span>
                    <span className="oi-bento-line">
                      {t('nav.solutions.line', 'Ten kinds of work')}
                    </span>
                  </p>
                  <ul className="oi-bento-chips" aria-labelledby="oi-sheet-solutions-name">
                    <SolutionLinks
                      pathname={pathname}
                      linkClass="oi-bento-chip"
                      iconClass="oi-bento-chip-icon"
                      onPick={close}
                    />
                  </ul>
                </div>
              ) : (
                <RouterLink
                  key={item.path}
                  to={item.path}
                  className="oi-bento-tile"
                  style={{ '--i': index }}
                  aria-current={pathname === item.path ? 'page' : undefined}
                  aria-label={t(`pages.${item.slug}.label`, item.label)}
                  aria-describedby={TILES[item.slug] ? `oi-tile-${item.slug}` : undefined}
                  onClick={close}
                >
                  <span className="oi-bento-top">
                    <span className="oi-bento-badge">
                      <TileGlyph name={TILES[item.slug]?.glyph ?? 'arrow'} />
                    </span>
                    <TileGlyph name="arrow" className="oi-bento-arrow" />
                  </span>
                  <span className="oi-bento-name">{t(`pages.${item.slug}.label`, item.label)}</span>
                  {TILES[item.slug] && (
                    <span id={`oi-tile-${item.slug}`} className="oi-bento-line">
                      {tileLine(t, item.slug)}
                    </span>
                  )}
                </RouterLink>
              )
            )}
          </div>
          <a
            href="#download"
            className="oi-sheet-cta"
            style={{ '--i': NAV_ITEMS.length }}
            onClick={close}
          >
            {t('nav.cta', 'Try For Free')}
          </a>
        </div>
      </nav>
    </header>
  );
}
