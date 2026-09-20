import Reveal from '../../ui/Reveal';
import { InfoHead } from './InfoParts';

const ICONS = {
  hello: 'M4 5h16v11H10l-6 4z',
  privacy: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  security: 'M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6z',
};

/** Three ways to write to us, each one big card that is the mail link itself. */
export default function ContactPage({ page }) {
  return (
    <section className="oi-container oin-top" aria-labelledby="instant-page-heading">
      <InfoHead page={page} />
      <ul className="oin-channels">
        {page.channels.map(({ icon, title, text, email }, index) => (
          <Reveal as="li" key={title} delay={index * 90}>
            <a className="oin-channel" href={`mailto:${email}`}>
              <svg className="oin-channel-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d={ICONS[icon]} />
              </svg>
              <h2>{title}</h2>
              <p>{text}</p>
              <span className="oin-channel-mail">
                {email}
                <i aria-hidden="true">→</i>
              </span>
            </a>
          </Reveal>
        ))}
      </ul>
      {page.operator && <p className="oi-small oin-operator">{page.operator}</p>}
    </section>
  );
}
