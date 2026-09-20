import SimpleExamples from '../simple/SimpleExamples';
import { Seen } from './SpeedStrip';
import './sections.css';
import './examplesDark.css';

/**
 * The "Examples" block of the Instant landing: the same five use cases and the same
 * interactive desktop demo as "/", drawn in the app's dark theme with the new left menu.
 *
 * Nothing is forked. SimpleExamples hands variant="instant" to the demo, which adds the
 * .opd-dark class and swaps its sidebar; every colour lives in examplesDark.css, scoped
 * under .oix (the section chrome) and .opd-dark (the window), so "/" cannot be touched.
 * Seen gives the block the same self-drawing top rule as its neighbours.
 */
export default function InstantExamples() {
  return (
    <Seen className="oix ois-section ois-ruled" threshold={0.08}>
      <SimpleExamples variant="instant" />
    </Seen>
  );
}
