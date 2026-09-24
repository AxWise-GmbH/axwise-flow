import { Component, Suspense, lazy, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import InstantLayout from '../../InstantLayout';
import DownloadBlock from '../../DownloadBlock';
import { useT } from '../../i18n/useT';
import { findProduct, productPath } from './productsMenu';
import '../pages.css';

// One chunk per product page, so a visitor downloads only the page they opened. A glob only
// lists files that exist, so a body not written yet shows the holding block instead.
const loaders = import.meta.glob([
  './DesktopPage.jsx',
  './MobilePage.jsx',
  './ApiPage.jsx',
  './BotPage.jsx',
  './ModelsPage.jsx',
  './EnterprisePage.jsx',
]);
// Each body is named after the last word of its slug: assistant-bot opens BotPage.jsx.
const BODIES = {};
for (const [file, load] of Object.entries(loaders)) {
  BODIES[file.slice(2, -8).toLowerCase()] = lazy(load);
}

// A page body that fails to load or render (a stale chunk after a deploy, a network drop)
// must not take the header, the download block and the footer down with it. It is keyed by
// slug, so the next product starts clean.
class BodyBoundary extends Component {
  state = {};

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function InstantProductPage() {
  const { t } = useT('pp');
  const { slug } = useParams();
  const product = findProduct(slug);

  // A new page starts at its top; the router keeps the old scroll position otherwise.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  // A bare /instant/products, or a product that does not exist, opens the Desktop App.
  if (!product) return <Navigate to={productPath('desktop')} replace />;
  const Body = BODIES[slug.split('-').pop()];
  // The menu entry in the current language (the words are the menus' own keys), so every
  // body shows the same name and line as the header.
  const shown = {
    ...product,
    label: t(`products.${product.slug}.label`, product.label),
    line: t(`products.${product.slug}.line`, product.line),
  };
  const holding = (
    <section className="oi-section oi-container">
      <h1 className="oip-title">{shown.label}</h1>
      <p className="oip-lede">
        {t('pp.holding', 'This page did not load. Please try again in a moment.')}
      </p>
    </section>
  );

  return (
    <InstantLayout title={`Orqanix — ${shown.label}`} translated>
      <BodyBoundary key={slug} fallback={holding}>
        <Suspense fallback={<div className="oip-loading" aria-hidden="true" />}>
          {Body ? <Body product={shown} /> : holding}
        </Suspense>
      </BodyBoundary>
      <DownloadBlock />
    </InstantLayout>
  );
}
