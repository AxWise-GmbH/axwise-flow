import Reveal from '../../ui/Reveal';
import { InfoHead, SectionCopy } from './InfoParts';

/** Opens with a map of where your data goes; the full text follows beside a sticky index. */
export default function PrivacyPage({ page }) {
  return (
    <>
      <section className="oi-container oin-top" aria-labelledby="instant-page-heading">
        <InfoHead page={page} />
        <div className="oin-map" role="group" aria-label="Where your data goes">
          {page.map.map(({ title, home, items }, index) => (
            <Reveal
              key={title}
              delay={index * 110}
              className={home ? 'oin-lane oin-lane-home' : 'oin-lane'}
            >
              <p className="oi-tag">{title}</p>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
        <p className="oin-promise">{page.promise}</p>
      </section>

      <div className="oi-container oin-doc">
        <nav aria-label="On this page" className="oin-index">
          <p className="oi-tag">On this page</p>
          <ol>
            {page.sections.map(({ title }, index) => (
              <li key={title}>
                <a href={`#part-${index + 1}`}>{title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div>
          {page.sections.map(({ title, ...copy }, index) => (
            <section
              key={title}
              id={`part-${index + 1}`}
              className="oin-part"
              aria-labelledby={`part-${index + 1}-heading`}
            >
              <h2 id={`part-${index + 1}-heading`}>{title}</h2>
              <SectionCopy {...copy} />
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
