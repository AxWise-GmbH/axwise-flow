import ExplainTour from '../../components/Common/ExplainTour';
import { HOME_EXPLAIN } from './homeExplainContent';

/**
 * Home dashboard's guided tour - the shared ExplainTour wired with the Home copy.
 * The active-block glow is applied in HomeOverview (see explainGlowSx).
 */
export default function HomeExplainTour(props) {
  return <ExplainTour content={HOME_EXPLAIN} {...props} />;
}
