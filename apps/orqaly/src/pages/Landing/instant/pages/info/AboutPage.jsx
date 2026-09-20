import Reveal from '../../ui/Reveal';
import { InfoHead, Numeral } from './InfoParts';

/** A manifesto: one centred line in the light, one big statement, three beliefs, a way in. */
export default function AboutPage({ page }) {
  return (
    <>
      <section className="oin-about-hero" aria-labelledby="instant-page-heading">
        <i className="oin-glow" aria-hidden="true" />
        <div className="oi-container">
          <InfoHead page={page} center />
        </div>
      </section>

      <div className="oi-container">
        <Reveal as="p" className="oin-big">
          {page.statement.map((sentence, index) => (
            <span key={sentence} className={index ? 'oin-big-lit' : undefined}>
              {sentence}{' '}
            </span>
          ))}
        </Reveal>

        <ol className="oin-principles" aria-label="What we believe">
          {page.principles.map(({ title, text }, index) => (
            <Reveal as="li" key={title} delay={index * 90} className="oin-principle">
              <Numeral index={index} />
              <h2>{title}</h2>
              <p>{text}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal as="section" className="oin-why" aria-labelledby="oin-why-heading">
          <h2 id="oin-why-heading" className="oi-tag oi-tag-bracket">
            Why we make it
          </h2>
          <p className="oin-why-text">{page.why}</p>
          <a className="oin-mail" href={`mailto:${page.email}`}>
            {page.email}
            <span aria-hidden="true">→</span>
          </a>
        </Reveal>
      </div>
    </>
  );
}
