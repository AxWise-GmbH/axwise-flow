import { Link as RouterLink } from 'react-router-dom';
import HeroFrame from '../heroes/HeroFrame';
import DownloadBlock from '../../DownloadBlock';
import Reveal from '../../ui/Reveal';
import { Seen } from '../../SpeedStrip';
import { useT } from '../../i18n/useT';
import Scene from './scenes';
import { localizeSolution } from './data';
import SolutionHeroVisual from './SolutionHeroVisual';
import { IndustryIcon, SolutionIcon } from './solutionIcons';
import { SOLUTIONS_MENU, solutionPath } from './solutionsMenu';
import './SolutionPage.css';

const HOW_IT_WORKS = '/instant/how-it-works';

function index2(index) {
  return String(index + 1).padStart(2, '0');
}

function ArrowGlyph({ className }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// An agent's mark: a small orbit, the same figure as the sphere that opens the page.
function AgentMark() {
  return (
    <svg viewBox="0 0 28 28" className="osl-agent-mark" aria-hidden="true" focusable="false">
      <circle cx="14" cy="14" r="10" />
      <circle className="osl-agent-moon" cx="14" cy="4" r="2" />
    </svg>
  );
}

function Pillars({ pillars }) {
  const { t } = useT('sp');
  return (
    <Seen
      as="section"
      className="oi-section ois-section osl-pillars"
      aria-labelledby="osl-pillars-heading"
    >
      <div className="oi-container">
        <Seen className="ois-gate osl-head">
          <Reveal as="h2" id="osl-pillars-heading" className="oi-h2">
            {t('sp.pillars.title', 'Four jobs, handled.')}
          </Reveal>
        </Seen>
        <Seen as="ul" className="ois-gate osl-band" threshold={0.2}>
          {pillars.map((pillar, index) => (
            <li key={pillar.id}>
              <Reveal className="osl-pillar" delay={index * 110}>
                <p className="osl-pillar-top">
                  <span className="osl-index" aria-hidden="true">
                    {index2(index)}
                  </span>
                  <SolutionIcon name={pillar.icon} className="osl-pillar-icon" />
                </p>
                <h3 className="osl-pillar-title">{pillar.title}</h3>
                <p className="osl-pillar-body">{pillar.body}</p>
                <p className="osl-stat">{pillar.stat}</p>
              </Reveal>
            </li>
          ))}
        </Seen>
      </div>
    </Seen>
  );
}

function Spotlight({ spotlight, index }) {
  const headingId = `osl-spot-${spotlight.id}`;
  return (
    <Seen
      as="article"
      className="ois-gate osl-spot"
      data-flip={index % 2 === 1}
      aria-labelledby={headingId}
      threshold={0.3}
    >
      {(seen) => (
        <>
          <div className="osl-spot-text">
            <Reveal as="p" className="oi-tag osl-spot-tag">
              <span aria-hidden="true">{index2(index)}</span>
              {spotlight.eyebrow}
            </Reveal>
            <Reveal as="h2" id={headingId} className="osl-spot-title" delay={90}>
              {spotlight.title}
            </Reveal>
            <Reveal as="p" className="oi-line osl-spot-body" delay={180}>
              {spotlight.body}
            </Reveal>
            <Reveal as="ul" className="osl-bullets" delay={270}>
              {spotlight.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </Reveal>
          </div>
          <Reveal className="osl-spot-scene" delay={140}>
            <Scene scene={spotlight.scene} play={seen} />
          </Reveal>
        </>
      )}
    </Seen>
  );
}

function Agents({ title, agents }) {
  return (
    <Seen
      as="section"
      className="oi-section ois-section osl-agents"
      aria-labelledby="osl-agents-heading"
    >
      <div className="oi-container">
        <Seen className="ois-gate osl-head">
          <Reveal as="h2" id="osl-agents-heading" className="oi-h2">
            {title}
          </Reveal>
        </Seen>
        <Seen as="ol" className="ois-gate osl-mosaic" threshold={0.2}>
          {agents.map((agent, index) => (
            <li key={agent.name}>
              <Reveal className="osl-agent" delay={index * 80}>
                <p className="osl-agent-top" aria-hidden="true">
                  <span className="osl-index">{index2(index)}</span>
                  <AgentMark />
                </p>
                <h3 className="osl-agent-name">{agent.name}</h3>
                <p className="osl-agent-line">{agent.line}</p>
              </Reveal>
            </li>
          ))}
        </Seen>
      </div>
    </Seen>
  );
}

function Related({ slug, related }) {
  const picks = related
    .map((item) => SOLUTIONS_MENU.find((entry) => entry.slug === item))
    .filter(Boolean);
  const { t } = useT('sp');
  const label = (item) => t(`solutions.${item.slug}.label`, item.label);
  return (
    <Seen
      as="section"
      className="oi-section ois-section osl-related"
      aria-labelledby="osl-related-heading"
    >
      <div className="oi-container">
        <Seen className="ois-gate osl-head">
          <Reveal as="h2" id="osl-related-heading" className="oi-h2">
            {t('sp.related.title', 'Other kinds of work.')}
          </Reveal>
        </Seen>
        <Seen as="ul" className="ois-gate osl-related-grid" threshold={0.2}>
          {picks.map((item, index) => (
            <li key={item.slug}>
              <Reveal delay={index * 110}>
                <RouterLink to={solutionPath(item.slug)} className="osl-related-link">
                  <IndustryIcon slug={item.slug} className="osl-related-icon" />
                  <span className="osl-related-label">{label(item)}</span>
                  <span className="osl-related-line">
                    {t(`solutions.${item.slug}.line`, item.line)}
                  </span>
                  <ArrowGlyph className="osl-related-arrow" />
                </RouterLink>
              </Reveal>
            </li>
          ))}
        </Seen>
        <nav className="osl-all" aria-labelledby="osl-all-heading">
          <p id="osl-all-heading" className="oi-tag">
            {t('sp.related.all', 'All solutions')}
          </p>
          <ul>
            {SOLUTIONS_MENU.map((item) => (
              <li key={item.slug}>
                <RouterLink
                  to={solutionPath(item.slug)}
                  className="osl-all-link"
                  aria-current={item.slug === slug ? 'page' : undefined}
                >
                  {label(item)}
                </RouterLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Seen>
  );
}

/** One Solutions page, drawn from one data object (see ./data). */
export default function SolutionPage({ data: english }) {
  const { t } = useT('sp');
  // Every word of the page in the current language (English data, keys sp.<slug>.<path>).
  const data = localizeSolution(english, t);
  // The opening window plays the third job, so the first thing below it is a new picture.
  const openingScene = data.spotlights[2].scene;
  return (
    <>
      <HeroFrame
        id="osl-heading"
        className="osl-hero"
        title={data.title}
        line={data.subtitle}
        visual={<SolutionHeroVisual pillars={data.pillars} scene={openingScene} />}
      >
        <div className="osl-actions">
          <a href="#download" className="osl-cta">
            {t('sp.hero.download', 'Download for macOS')}
          </a>
          <RouterLink to={HOW_IT_WORKS} className="osl-quiet">
            {t('sp.hero.how', 'See how it works')}
            <ArrowGlyph className="osl-quiet-arrow" />
          </RouterLink>
        </div>
      </HeroFrame>

      <Pillars pillars={data.pillars} />

      <section className="oi-section ois-section osl-spots" aria-label={t('sp.spots.label', 'How it helps')}>
        <div className="oi-container">
          {data.spotlights.map((spotlight, index) => (
            <Spotlight key={spotlight.id} spotlight={spotlight} index={index} />
          ))}
        </div>
      </section>

      <Agents title={data.agentsTitle} agents={data.agents} />
      <Related slug={data.slug} related={data.related} />

      <Seen className="ois-gate osl-closing">
        <Reveal as="p" className="osl-closing-line">
          {data.closing}
        </Reveal>
      </Seen>
      <DownloadBlock />
    </>
  );
}
