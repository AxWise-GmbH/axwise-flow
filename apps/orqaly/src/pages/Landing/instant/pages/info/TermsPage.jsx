import Reveal from '../../ui/Reveal';
import { InfoHead, SectionCopy, Numeral } from './InfoParts';

/** Four facts to take away, then every clause as its own numbered card. */
export default function TermsPage({ page }) {
  return (
    <>
      <section className="oi-container oin-top" aria-labelledby="instant-page-heading">
        <InfoHead page={page} />
        <ul className="oin-facts" aria-label="The short version">
          {page.facts.map(({ big, text }, index) => (
            <Reveal as="li" key={big} delay={index * 80}>
              <strong>{big}</strong>
              <span>{text}</span>
            </Reveal>
          ))}
        </ul>
      </section>

      <div className="oi-container oin-clauses">
        {page.sections.map(({ title, ...copy }, index) => (
          <section key={title} className="oin-clause" aria-labelledby={`clause-${index + 1}`}>
            <Numeral index={index} />
            <h2 id={`clause-${index + 1}`}>{title}</h2>
            <SectionCopy {...copy} />
          </section>
        ))}
      </div>
    </>
  );
}
