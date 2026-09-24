import { useEffect, useRef } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { NAV_PRODUCTS, productPath } from './pages/products/productsMenu';
import { aimsAt, rove, useProductPick, warmScenes } from './useNavMenus';
import { useT } from './i18n/useT';
import './ProductsPanel.css';

// A pointer on its way to the preview crosses other rows; the preview waits this long for it.
const AIM_MS = 150;
// Desktop pointers fetch the scenes while the page is idle, so the first hover plays at once.
// Safari has no requestIdleCallback; it waits this long instead.
const IDLE_PRELOAD = '(min-width: 1200px) and (hover: hover)';
const IDLE_FALLBACK_MS = 1500;

/**
 * One layer per listed product in a preview card, the lit one shown. CSS crossfades them and
 * takes an unlit layer off the page once it has faded, so each switch starts the story from
 * the top.
 */
export function SceneLayers({ scenes, active }) {
  return (
    scenes &&
    NAV_PRODUCTS.map(({ slug }) => (
      <div key={slug} className="oi-pp-slot" data-on={active === slug || undefined}>
        <scenes.ProductScene slug={slug} cut="menu" />
      </div>
    ))
  );
}

/**
 * The bar's Products panel: the listed products on the left, a live preview of the lit one on
 * the right. Leaving a row keeps it lit. The preview card is aria-hidden and takes no focus:
 * the rows are the way in, and a click on the card opens the lit product too.
 */
export default function ProductsPanel({ open, pathname, hide }) {
  const [active, pick, scenes, current] = useProductPick(open, pathname);
  const { t } = useT();
  const navigate = useNavigate();
  const stage = useRef(null);
  const point = useRef(null);
  const wait = useRef(0);
  const stopWait = () => window.clearTimeout(wait.current);

  useEffect(() => {
    if (window.matchMedia?.(IDLE_PRELOAD).matches) {
      (window.requestIdleCallback ?? ((warm) => setTimeout(warm, IDLE_FALLBACK_MS)))(warmScenes);
    }
  }, []);

  // A closed (or gone) panel keeps no pending pick and no old pointer to aim from.
  useEffect(
    () => () => {
      window.clearTimeout(wait.current);
      point.current = null;
    },
    [open]
  );

  return (
    <div id="oi-products-panel" className="oi-pp" hidden={!open}>
      <ul
        className="oi-pp-list"
        aria-label={t('nav.products', 'Products')}
        onKeyDown={(event) => rove(event, 'ArrowUp', 'ArrowDown')}
        onPointerMove={(event) => {
          point.current = event;
        }}
      >
        {NAV_PRODUCTS.map(({ slug, label, line, soon }) => (
          <li key={slug}>
            <RouterLink
              to={productPath(slug)}
              className="oi-pp-row"
              data-on={active === slug || undefined}
              aria-current={current === slug ? 'page' : undefined}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'mouse') return;
                stopWait();
                if (aimsAt(point.current, event, stage.current.getBoundingClientRect())) {
                  wait.current = window.setTimeout(() => pick(slug), AIM_MS);
                } else pick(slug);
              }}
              onFocus={() => pick(slug)}
              onClick={hide}
            >
              <b>{t(`products.${slug}.label`, label)}</b>
              <small>{t(`products.${slug}.line`, line)}</small>
              {soon && <em className="oi-pp-soon">{t('products.soon', 'Coming soon')}</em>}
            </RouterLink>
          </li>
        ))}
      </ul>
      <div
        ref={stage}
        className="oi-pp-stage"
        aria-hidden="true"
        dir="ltr"
        onPointerEnter={stopWait}
        onClick={() => {
          // On the lit product's own page, no second history entry (as its row link does).
          navigate(productPath(active), { replace: active === current });
          hide();
        }}
      >
        <SceneLayers scenes={scenes} active={active} />
      </div>
    </div>
  );
}
