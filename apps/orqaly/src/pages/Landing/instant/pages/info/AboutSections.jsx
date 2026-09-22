import Reveal from '../../ui/Reveal';
import DirArrow from '../../ui/DirArrow';
import { Numeral } from './InfoParts';

/** A chapter's opening: bracketed number and name, a big title, one line. */
function ChapterHead({ index, tag, title, titleId, lede }) {
  return (
    <Reveal as="header" className="oin-chapter-head">
      <p className="oi-tag oi-tag-bracket">
        {String(index).padStart(2, '0')} · {tag}
      </p>
      {title && (
        <h2 id={titleId} className="oin-chapter-title">
          {title}
        </h2>
      )}
      {lede && <p className="oin-chapter-lede">{lede}</p>}
    </Reveal>
  );
}

/** Our story: a timeline whose line fills as the reader scrolls down it. */
export function AboutStory({ copy }) {
  return (
    <section id="about-story" className="oin-chapter" aria-labelledby="about-story-title">
      <ChapterHead
        index={1}
        tag={copy.tag}
        title={copy.title}
        titleId="about-story-title"
        lede={copy.lede}
      />
      <ol className="oin-story">
        {copy.steps.map((step, index) => (
          <Reveal as="li" key={step.title} className="oin-step" delay={60}>
            <span className="oin-step-dot" aria-hidden="true" />
            <div className="oin-step-when">
              {step.when && <time>{step.when}</time>}
              {step.who && <span>{step.who}</span>}
            </div>
            <div className="oin-step-card">
              <Numeral index={index} />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </Reveal>
        ))}
      </ol>
      <Reveal as="p" className="oin-story-close">
        {copy.close}
      </Reveal>
    </section>
  );
}

/** Our goal: models turn around one knowledge core that never moves, beside four points. */
export function AboutGoal({ copy }) {
  return (
    <section id="about-goal" className="oin-chapter" aria-labelledby="about-goal-title">
      <ChapterHead
        index={2}
        tag={copy.tag}
        title={copy.title}
        titleId="about-goal-title"
        lede={copy.lede}
      />
      <div className="oin-goal">
        <Reveal as="figure" className="oin-orbit">
          <div className="oin-orbit-stage" aria-hidden="true">
            <i className="oin-orbit-ring" />
            <i className="oin-orbit-ring oin-orbit-ring-outer" />
            <span className="oin-orbit-core">{copy.core}</span>
            <div className="oin-orbit-spin">
              {copy.orbit.map((label, index) => (
                <span key={label} className="oin-orbit-chip" style={{ '--n': index }}>
                  <span>{label}</span>
                </span>
              ))}
            </div>
          </div>
          <figcaption>{copy.caption}</figcaption>
        </Reveal>
        <ul className="oin-points">
          {copy.points.map(({ title, text }, index) => (
            <Reveal as="li" key={title} delay={index * 80} className="oin-point">
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
      <Reveal as="p" className="oin-goal-close">
        {copy.close}
      </Reveal>
    </section>
  );
}

/** Our mission: the statement, three stages of a space that grows, then the loop and the path. */
export function AboutMission({ copy }) {
  return (
    <section id="about-mission" className="oin-chapter" aria-labelledby="about-mission-title">
      <ChapterHead index={3} tag={copy.tag} />
      <Reveal as="h2" id="about-mission-title" className="oin-big">
        {copy.statement.map((sentence, index) => (
          <span key={sentence} className={index ? undefined : 'oin-big-lit'}>
            {sentence}{' '}
          </span>
        ))}
      </Reveal>
      <ol className="oin-principles">
        {copy.stages.map(({ title, text }, index) => (
          <Reveal as="li" key={title} delay={index * 90} className="oin-principle">
            <Numeral index={index} />
            <h3>{title}</h3>
            <p>{text}</p>
          </Reveal>
        ))}
      </ol>
      <Reveal className="oin-shift">
        <div className="oin-loop">
          <p className="oin-shift-label">{copy.loopLabel}</p>
          <ul>
            {copy.loop.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
        <DirArrow className="oin-shift-arrow" />
        <div className="oin-path">
          <p className="oin-shift-label">{copy.pathLabel}</p>
          <p className="oin-path-text">{copy.path}</p>
        </div>
      </Reveal>
      <Reveal as="p" className="oin-mission-text">
        {copy.text}
      </Reveal>
    </section>
  );
}

/** The founders: one card each, with a link to their LinkedIn profile. */
export function AboutFounders({ copy }) {
  return (
    <section id="about-founders" className="oin-chapter" aria-labelledby="about-founders-title">
      <ChapterHead
        index={4}
        tag={copy.tag}
        title={copy.title}
        titleId="about-founders-title"
      />
      <ul className="oin-founders">
        {copy.people.map((person, index) => (
          <Reveal as="li" key={person.href} delay={index * 90} className="oin-founder">
            <svg className="oin-founder-mark" viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="28" r="10" />
              <path d="M18 56c2-10 9.5-15 18-15s16 5 18 15" />
            </svg>
            <div className="oin-founder-name">
              <h3>{person.name}</h3>
              <p>{person.role}</p>
            </div>
            <p className="oin-founder-text">{person.text}</p>
            <ul className="oin-founder-facts">
              {[person.years, person.since, person.place].filter(Boolean).map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
            <a
              className="oin-founder-link"
              href={person.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
              <span aria-hidden="true">↗</span>
            </a>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
