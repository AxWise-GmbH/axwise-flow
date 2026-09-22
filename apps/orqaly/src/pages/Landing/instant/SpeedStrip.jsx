import { useEffect, useRef, useState } from 'react';
import More from './ui/More';
import Reveal from './ui/Reveal';
import CountUp from './ui/CountUp';
import { Stat } from './ui/Card';
import { useT } from './i18n/useT';
import './sections.css';

// The same three runs as the Speed page, so the labels share its words (pg.speed.run.<id>.label).
const STATS = [
  { id: 'answer', value: 1.9, decimals: 1, label: 'a direct answer' },
  { id: 'summary', value: 19, decimals: 0, label: 'a short summary' },
  { id: 'document', value: 84, decimals: 0, label: 'an 8-page document' },
];

const UNIT = ' s';

function startsSeen() {
  if (typeof IntersectionObserver === 'undefined') return true;
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/**
 * A scroll gate, shared by every static section.
 *
 * The app's useInView also flips on a 600 ms safety timer, so a Reveal or CountUp far below
 * the fold would play before anyone scrolls to it. A gate holds its contents in the dark
 * (see .ois-gate in sections.css) until it has really been scrolled into view: data-seen
 * sticks once true, data-live follows the viewport so looping decoration can rest off screen.
 * Children may be a function of `seen`.
 */
export function Seen({ as: Tag = 'div', threshold = 0.15, children, ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(startsSeen);
  const [live, setLive] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        setLive(entry.isIntersecting);
        // The ratio reported at a crossing can land a hair under the threshold itself.
        if (entry.isIntersecting && entry.intersectionRatio >= threshold * 0.95) setSeen(true);
      },
      { threshold: [0, threshold], rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return (
    <Tag ref={ref} data-seen={seen} data-live={live} {...rest}>
      {typeof children === 'function' ? children(seen) : children}
    </Tag>
  );
}

export default function SpeedStrip() {
  const { t } = useT('pg');
  return (
    <Seen
      as="section"
      id="speed"
      className="oi-section ois-section ois-speed"
      aria-labelledby="speed-heading"
    >
      <div className="oi-container">
        <Seen className="ois-gate ois-head">
          <Reveal as="p" className="oi-tag oi-tag-bracket">
            {t('pg.strip.tag', 'The cloud side, measured')}
          </Reveal>
          <Reveal as="h2" id="speed-heading" className="oi-h2" delay={90}>
            {t('pages.speed.label', 'Speed')}
          </Reveal>
        </Seen>
        <Seen as="dl" className="oi-stat-row ois-stat-row" threshold={0.35}>
          {(seen) =>
            STATS.map((stat) => (
              <Stat
                key={stat.label}
                label={t(`pg.speed.run.${stat.id}.label`, stat.label)}
                // The count starts when the row arrives, not when the page loads.
                value={
                  seen ? (
                    <CountUp value={stat.value} decimals={stat.decimals} suffix={UNIT} />
                  ) : (
                    `${stat.value.toFixed(stat.decimals)}${UNIT}`
                  )
                }
              />
            ))
          }
        </Seen>
        <Seen className="ois-gate ois-under-stats">
          <Reveal as="p" className="oi-tag ois-quiet">
            {t('pg.strip.when', 'Single runs · Sept 2026')}
          </Reveal>
          <Reveal delay={90}>
            <More>
              <p className="ois-measure">
                {t(
                  'pg.strip.measure',
                  'Measured once each on 18 Sep 2026 in the Orqanix cloud preview, not in the desktop app, one test scenario. Exact: 1.86 s · 19.08 s (767 words) · 84.04 s (3,951 words). Not averages; yours will differ. A full starter pack is many pieces and takes longer.'
                )}
              </p>
              <p>
                <a className="oi-link ois-link-target" href="/benchmark">
                  {t('pg.speed.method.title', 'How we measured')}
                </a>
              </p>
            </More>
          </Reveal>
        </Seen>
      </div>
    </Seen>
  );
}
