import { useEffect, useState } from 'react';
import LineOrb from '../../../../components/Common/LineOrb';
import { ORB_ACCENT } from '../palette';

const MIN_MS = 900;
const MAX_MS = 2600;
const FADE_MS = 700;

/**
 * The opening curtain: the line-orb breathing on black while the fonts arrive,
 * then it swells and dissolves into the page. Decoration only; the page under it
 * is already rendered, so readers and tests never wait for it.
 */
export default function Loader() {
  const [phase, setPhase] = useState('show');

  useEffect(() => {
    let done = false;
    const leave = () => {
      if (done) return;
      done = true;
      setPhase('leave');
    };
    const started = Date.now();
    const whenReady = () => setTimeout(leave, Math.max(0, MIN_MS - (Date.now() - started)));
    // Fonts decide when the headline stops shifting; never wait longer than MAX_MS for them.
    const fonts = document.fonts?.ready;
    if (fonts) fonts.then(whenReady);
    else whenReady();
    const cap = setTimeout(leave, MAX_MS);
    return () => {
      done = true;
      clearTimeout(cap);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'leave') return undefined;
    const timer = setTimeout(() => setPhase('gone'), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'gone') return null;

  return (
    <div className="oi-loader" data-phase={phase} data-orb aria-hidden="true">
      <LineOrb size={220} accent={ORB_ACCENT} speed={1.6} title="" />
    </div>
  );
}
