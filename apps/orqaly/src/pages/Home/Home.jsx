import { useSimpleMode } from '../../hooks/useSimpleMode';
import PageLayout from '../../components/Common/PageLayout';
import Dashboard from '../Dashboard/Dashboard';
import HomeOverview from './HomeOverview';

/**
 * Home route.
 *  - Simple mode: the full Dashboard ("Cockpit") shell (AI-orb hero + goal
 *    prompt + Metrics/History tabs), with the Metrics tab swapped for the Home
 *    org overview via the Dashboard `metricsOverride` prop.
 *  - Advanced mode: the plain org overview (unchanged).
 */
export default function Home() {
  const { simpleMode } = useSimpleMode();

  if (simpleMode) {
    return <Dashboard metricsOverride={<HomeOverview />} />;
  }

  return (
    <PageLayout showTitleBlock={false}>
      <HomeOverview />
    </PageLayout>
  );
}
