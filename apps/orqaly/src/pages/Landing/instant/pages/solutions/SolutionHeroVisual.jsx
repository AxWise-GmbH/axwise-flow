import { Seen } from '../../SpeedStrip';
import Scene from './scenes';
import { SolutionIcon } from './solutionIcons';

// Meridians of a sphere seen from the front: one height, narrowing widths. The same idea as
// the brand's line-orb, drawn once as plain ellipses so it costs nothing to keep on screen.
const ORBIT_RADIUS = 270;
const MERIDIANS = [1, 0.92, 0.74, 0.5, 0.22];

function Pill({ pillar, index }) {
  return (
    <span className="osl-hv-pill" style={{ '--i': index }}>
      <SolutionIcon name={pillar.icon} className="osl-hv-pill-icon" />
      {pillar.title}
      <i className="osl-hv-lead" />
    </span>
  );
}

/**
 * The opening picture of a Solutions page: the app window playing one of the page's scenes,
 * with the four jobs it takes on wired into it. Decoration only; every word in it is said
 * again further down the page.
 */
export default function SolutionHeroVisual({ pillars, scene }) {
  return (
    <Seen className="osl-hv" aria-hidden="true" threshold={0.05} dir="ltr">
      <svg className="osl-hv-orbit" viewBox="0 0 600 600" aria-hidden="true" focusable="false">
        <g className="osl-hv-meridians">
          {MERIDIANS.map((share) => (
            <ellipse key={share} cx="300" cy="300" rx={ORBIT_RADIUS * share} ry={ORBIT_RADIUS} />
          ))}
          <ellipse cx="300" cy="300" rx={ORBIT_RADIUS} ry={ORBIT_RADIUS * 0.34} />
        </g>
        <g className="osl-hv-ring">
          <circle cx="300" cy="300" r="292" />
          <circle className="osl-hv-moon" cx="300" cy="8" r="3" />
          <circle className="osl-hv-moon" cx="553" cy="446" r="2" />
        </g>
      </svg>
      <div className="osl-hv-pills" data-row="top">
        {pillars.slice(0, 2).map((pillar, index) => (
          <Pill key={pillar.id} pillar={pillar} index={index} />
        ))}
      </div>
      <Scene scene={scene} className="osl-hv-window" />
      <div className="osl-hv-pills" data-row="bottom">
        {pillars.slice(2).map((pillar, index) => (
          <Pill key={pillar.id} pillar={pillar} index={index + 2} />
        ))}
      </div>
    </Seen>
  );
}
