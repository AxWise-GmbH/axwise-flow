import { ProductScene } from './scenes';
import More from '../../ui/More';
import Reveal from '../../ui/Reveal';
import { Seen } from '../../SpeedStrip';
import { useT } from '../../i18n/useT';
import './ModelsPage.css';
// The scene's own look rides with this page, not the header (see ModelsScene).
import './scenes/models.css';

// The one action, asked twice: under the name and again at the close.
function Cta() {
  const { t } = useT('pp');
  return (
    <a className="ppm-cta" href="mailto:hello@orqanix.com?subject=Personalised%20Models">
      {t('pp.models.cta', "Tell me when it's ready")}
    </a>
  );
}

// The page's words, in the current language (t from useT).
// Each card draws its small glyph in CSS (::before).
const points = (t) => [
  [
    t('pp.models.will.words.title', 'Learns your words'),
    t(
      'pp.models.will.words.text',
      'Your documents, your terms, your tone. It writes the way your team writes.'
    ),
  ],
  [
    t('pp.models.will.data.title', 'Knows your data'),
    t(
      'pp.models.will.data.text',
      'Answers from what your business knows: products, prices, processes and past work.'
    ),
  ],
  [
    t('pp.models.will.yours.title', 'Yours alone'),
    t(
      'pp.models.will.yours.text',
      'One model for your company, trained only on the material you choose.'
    ),
  ],
];

const steps = (t) => [
  [
    t('pp.models.how.choose.title', 'Choose what it learns from'),
    t('pp.models.how.choose.text', 'Pick the folders and documents that matter.'),
  ],
  [
    t('pp.models.how.train.title', 'We train your model'),
    t('pp.models.how.train.text', 'It learns from that material only.'),
  ],
  [
    t('pp.models.how.use.title', 'Use it in Orqanix'),
    t('pp.models.how.use.text', 'Pick it like any other model, in any chat.'),
  ],
];

const questions = (t) => [
  [
    t('pp.models.faq.when.q', 'When will it be ready?'),
    t('pp.models.faq.when.a', 'We’ll post it on the News page and write to everyone who asked.'),
  ],
  [
    t('pp.models.faq.shared.q', 'Is my material shared with anyone?'),
    t('pp.models.faq.shared.a', 'No. It is used only to train your own model.'),
  ],
];

// One section: its h2, the paragraph right under it, then the rest. Nothing shows before
// the section is really scrolled to (the gate).
function Part({ id, title, line, className, children }) {
  return (
    <Seen
      as="section"
      className={`oi-section ois-section ois-gate ${className}`}
      aria-labelledby={id}
    >
      <div className="oi-container">
        <Reveal as="h2" id={id} className="oi-h2">
          {title}
        </Reveal>
        {line && (
          <Reveal as="p" className="ppm-line" delay={90}>
            {line}
          </Reveal>
        )}
        {children}
      </div>
    </Seen>
  );
}

// A graphite card: a mark on top (a glyph, or the step's number), then the title and one line.
function Cards({ as, items, className, marks }) {
  const List = as;
  return (
    <List className={`ppm-cards ${className}`}>
      {items.map(([title, line], i) => (
        <Reveal as="li" key={title} className="ppm-card" delay={i * 110}>
          {marks && <span aria-hidden="true">0{i + 1}</span>}
          <h3>{title}</h3>
          <p>{line}</p>
        </Reveal>
      ))}
    </List>
  );
}

// The quietest page: one calm centred column. The only place the site says "Coming soon".
export default function ModelsPage({ product }) {
  const { t } = useT('pp');
  return (
    <>
      <section className="ppm-hero" aria-labelledby="ppm-title">
        <div className="oi-container">
          <p className="ppm-soon" data-soon>
            {t('products.soon', 'Coming soon')}
          </p>
          <h1 id="ppm-title" className="ppm-title">
            {product.label}
          </h1>
          {/* One sentence per block, so a line never breaks between the two. */}
          <p className="ppm-lede">
            <span>
              {t(
                'pp.models.lede.1',
                'A model trained on how your business works: your documents, your words and your way of doing things.'
              )}
            </span>{' '}
            <span>
              {t(
                'pp.models.lede.2',
                'It will run inside Orqanix, next to the models you already use.'
              )}
            </span>
          </p>
          <Cta />
          <div className="ppm-stage">
            <ProductScene slug={product.slug} cut="hero" />
          </div>
        </div>
      </section>

      <Part
        id="ppm-will"
        title={t('pp.models.will.title', 'What it will do')}
        line={t(
          'pp.models.will.line',
          'General AI models know a lot about the world and little about your company. A\u00a0personalised model starts from your own material, so its answers sound like you and use what your business already knows.'
        )}
        className="ppm-will"
      >
        <Cards as="ul" items={points(t)} className="ppm-points" />
      </Part>

      <Part id="ppm-how" title={t('pp.models.how.title', 'How it will work')} className="ppm-how">
        <Cards as="ol" items={steps(t)} className="ppm-steps" marks />
      </Part>

      <Part
        id="ppm-first"
        title={t('pp.models.first.title', 'Want to be first?')}
        line={t('pp.models.first.line', 'Write to us, and we’ll tell you when it’s ready.')}
        className="ois-ruled ppm-first"
      >
        <Reveal delay={180}>
          <Cta />
        </Reveal>
      </Part>

      <Part id="ppm-faq" title={t('faq.title', 'Questions')} className="ois-ruled ppm-faq">
        <div className="ois-faq">
          {questions(t).map(([question, answer], i) => (
            <Reveal key={question} className="ois-faq-row" delay={i * 80}>
              <span className="ois-faq-index" aria-hidden="true">
                0{i + 1}
              </span>
              <More row label={question} openLabel={question}>
                <p>{answer}</p>
              </More>
            </Reveal>
          ))}
        </div>
      </Part>
    </>
  );
}
