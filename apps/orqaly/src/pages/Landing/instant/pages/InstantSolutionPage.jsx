import { Component, Suspense, use, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import InstantLayout from '../InstantLayout';
import DownloadBlock from '../DownloadBlock';
import { useT } from '../i18n/useT';
import PageHero from './PageHero';
import SolutionPage from './solutions/SolutionPage';
import { loadSolution } from './solutions/data';
import { SOLUTIONS_MENU, solutionPath } from './solutions/solutionsMenu';

// One request per page, shared by every render. A failed request is forgotten, so coming
// back to the page tries again instead of replaying the old failure.
const requests = new Map();

function requestSolution(slug) {
  if (!requests.has(slug)) {
    requests.set(
      slug,
      loadSolution(slug).then(
        (data) => {
          if (!data) throw new Error(`No solution data for "${slug}"`);
          return data;
        },
        (error) => {
          requests.delete(slug);
          throw error;
        }
      )
    );
  }
  return requests.get(slug);
}

// Copy that fails to load or render (a stale chunk after a deploy, a network drop) must not
// take the header, the download block and the footer down with it.
class BodyBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous) {
    if (previous.slug !== this.props.slug && this.state.failed) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Body({ slug }) {
  return <SolutionPage data={use(requestSolution(slug))} />;
}

function Skeleton() {
  return (
    <div className="oi-container osl-skel" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

export default function InstantSolutionPage() {
  const { slug } = useParams();
  const { t } = useT('sp');
  const entry = SOLUTIONS_MENU.find((item) => item.slug === slug);

  // A new page starts at its top; the router keeps the old scroll position otherwise.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!entry) return <Navigate to={solutionPath(SOLUTIONS_MENU[0].slug)} replace />;

  const label = t(`solutions.${entry.slug}.label`, entry.label);
  return (
    <InstantLayout title={t('sp.page.title', '{label} · Orqanix', { label })} translated>
      <BodyBoundary
        slug={slug}
        fallback={
          <>
            <PageHero
              id="instant-solution-heading"
              tag={t('sp.page.tag', 'Solutions · {label}', { label })}
              title={label}
              line={t('sp.page.failed', 'This page did not load. Please try again in a moment.')}
            />
            <DownloadBlock />
          </>
        }
      >
        <Suspense fallback={<Skeleton />}>
          <Body key={slug} slug={slug} />
        </Suspense>
      </BodyBoundary>
    </InstantLayout>
  );
}
