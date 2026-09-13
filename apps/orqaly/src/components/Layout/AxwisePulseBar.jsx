import { useAxwise } from '../../hooks/useAxwise';
import PulseBar from './PulseBar';

/**
 * Mounts the AxWise PulseBar only when AxWise is enabled (backend flag + the
 * per-device visibility toggle). Gating at the mount - rather than inside
 * PulseBar - means the usePulseFeed poll never starts when AxWise is off.
 */
export default function AxwisePulseBar() {
  const { isAxwiseEnabled } = useAxwise();
  return isAxwiseEnabled ? <PulseBar /> : null;
}
