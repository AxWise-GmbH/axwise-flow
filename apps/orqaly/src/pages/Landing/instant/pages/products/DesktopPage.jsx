import { Link } from 'react-router-dom';
import Reveal from '../../ui/Reveal';
import More from '../../ui/More';
import { Seen } from '../../SpeedStrip';
import { useT } from '../../i18n/useT';
import { ProductScene } from './scenes';
import { Icon } from './scenes/kit';
import './scenes/desktop-page.css';
import './DesktopPage.css';

// The page's words, in the current language (t from useT).
const strip = (t) => [
  [
    'ask',
    t('pp.desktop.strip.ask.title', 'Say it in plain words'),
    t(
      'pp.desktop.strip.ask.text',
      'No prompts to learn. Attach a file or use your voice if you like.'
    ),
  ],
  [
    'plan',
    t('pp.desktop.strip.plan.title', 'Watch every step'),
    t(
      'pp.desktop.strip.plan.text',
      'The roadmap shows what is done, what is running and what comes next.'
    ),
  ],
  [
    'files',
    t('pp.desktop.strip.files.title', 'Real files in your folder'),
    t(
      'pp.desktop.strip.files.text',
      'Documents, sheets, code and pages, marked NEW or EDITED as they change.'
    ),
  ],
];
const inside = (t) => [
  [
    'spark',
    t('pp.desktop.inside.model.title', 'Your choice of model'),
    t(
      'pp.desktop.inside.model.text',
      'Gemini by default. Connect OpenAI or Anthropic, or run open models on your Mac.'
    ),
  ],
  [
    'plus',
    t('pp.desktop.inside.connectors.title', '50+ connectors'),
    t(
      'pp.desktop.inside.connectors.text',
      'GitHub, Figma, a browser and more, switched on when you need them.'
    ),
  ],
  [
    'team',
    t('pp.desktop.inside.skills.title', 'Skills'),
    t(
      'pp.desktop.inside.skills.text',
      'Skills teach Orqanix how you and your team like things done.'
    ),
  ],
  [
    'chat',
    t('pp.desktop.inside.chats.title', 'Ten chats at once'),
    t('pp.desktop.inside.chats.text', 'Start several jobs and let them run side by side.'),
  ],
  [
    'clock',
    t('pp.desktop.inside.history.title', 'History'),
    t(
      'pp.desktop.inside.history.text',
      'Every chat is saved on your Mac. Search it, pin it, pick it up later.'
    ),
  ],
  [
    'doc',
    t('pp.desktop.inside.research.title', 'Research with sources'),
    t(
      'pp.desktop.inside.research.text',
      'Ask for research and get an answer with its sources, right in the Workspace.'
    ),
  ],
];
const questions = (t) => [
  [
    t('pp.desktop.faq.need.q', 'What do I need?'),
    t(
      'pp.desktop.faq.need.a',
      'A Mac with Apple silicon (M1 or newer) and an Orqanix sign-in. No API key needed.'
    ),
  ],
  [
    t('pp.desktop.faq.free.q', 'Is it free?'),
    t(
      'pp.desktop.faq.free.a',
      'Yes, it’s free during the early version. We’ll publish prices before any paid plan starts.'
    ),
  ],
  [
    t('pp.desktop.faq.files.q', 'Where do my files go?'),
    t(
      'pp.desktop.faq.files.a',
      'Into the project folder you choose on your Mac. Open, move or share them like any other file.'
    ),
  ],
  [
    t('pp.desktop.faq.confirm.q', 'Why does my Mac ask me to confirm the app?'),
    t(
      'pp.desktop.faq.confirm.a',
      'The first time you open it, macOS asks you to confirm. The steps are under More in the block below.'
    ),
  ],
];

// A graphite card playing one cut of the Desktop App scene.
function Card({ cut, className = '' }) {
  return (
    <div className={`pdp-card ${className}`}>
      <ProductScene slug="desktop" cut={cut} />
    </div>
  );
}

function Go({ to, children }) {
  return (
    <Link to={to} className="pdp-go">
      {children}
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

// A section: its h2, the paragraph right under it, then its pictures or cards. Its class is
// its heading's id (pdp-flow, pdp-runs, ...).
function Section({ id, title, line, children }) {
  return (
    <Seen as="section" className={`oi-section ois-section ${id}`} aria-labelledby={id}>
      <Seen className="oi-container ois-gate pdp-in">
        <div className="pdp-head">
          <Reveal as="h2" id={id} className="oi-h2">
            {title}
          </Reveal>
          {line && (
            <Reveal as="p" className="pdp-line" delay={90}>
              {line}
            </Reveal>
          )}
        </div>
        {children}
      </Seen>
    </Seen>
  );
}

/**
 * The Desktop App page: a full-bleed, centred showcase. The title, one very large app window
 * that flattens as it arrives, then close-ups of the same app (the journey, the schedule, the
 * approval), what is inside, and a few questions. Every picture is a cut of the one scene.
 */
export default function DesktopPage({ product }) {
  const { t } = useT('pp');
  const how = <Go to="/instant/how-it-works">{t('pages.how-it-works.label', 'How it works')}</Go>;
  return (
    <div className="pdp">
      <section className="pdp-hero" aria-labelledby="pdp-title">
        <div className="oi-container pdp-top">
          <h1 id="pdp-title" className="pdp-title oip-rise">
            {product.label}
          </h1>
          <p className="pdp-lede oip-rise" style={{ '--i': 1 }}>
            {t(
              'pp.desktop.lede',
              'Orqanix is an app for your Mac. You say what you need, and AI agents make a plan, do the steps and put real files in your folder.'
            )}
          </p>
          <div className="pdp-acts oip-rise" style={{ '--i': 2 }}>
            <a href="#download" className="pdp-cta">
              {t('nav.cta', 'Try For Free')}
            </a>
            {how}
          </div>
        </div>
        <Seen className="oi-container pdp-show" threshold={0.5}>
          <Card cut="hero" className="pdp-win" />
        </Seen>
      </section>

      <Section
        id="pdp-flow"
        title={t('pp.desktop.flow.title', 'Ask. Plan. Files.')}
        line={t(
          'pp.desktop.flow.line',
          'Write or say your request in plain words, the way you would ask a colleague. Orqanix breaks it into steps and shows each one in the Workspace while it runs. When it is done, the files are in your project folder, ready to open.'
        )}
      >
        <ol className="pdp-strip">
          {strip(t).map(([cut, title, text], index) => (
            <Reveal as="li" key={cut} delay={index * 120}>
              <Card cut={cut} />
              <h3 className="pdp-cap">{title}</h3>
              <p className="pdp-say">{text}</p>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section
        id="pdp-runs"
        title={t('pp.desktop.runs.title', 'Set it once. It runs.')}
        line={t(
          'pp.desktop.runs.line',
          'Save any job as a recipe: the instructions, the tools and the model it should use. Put it on a schedule, and it runs every day, week or month while Orqanix is open on your Mac.'
        )}
      >
        <Reveal>
          <Card cut="schedule" className="pdp-wide" />
        </Reveal>
      </Section>

      <Section
        id="pdp-charge"
        title={t('pp.desktop.charge.title', 'You stay in charge.')}
        line={t(
          'pp.desktop.charge.line',
          'By default Orqanix just gets on with the work. If you prefer, it asks before it writes a file or runs a command, and you choose Allow Once, Always Allow or Deny.'
        )}
      >
        <Reveal className="pdp-ok" delay={120}>
          <Card cut="approve" />
        </Reveal>
      </Section>

      <Section id="pdp-inside" title={t('pp.desktop.inside.title', 'What’s inside')}>
        <ul className="pdp-grid">
          {inside(t).map(([icon, title, text], index) => (
            <Reveal as="li" key={title} className="pdp-tile" delay={(index % 3) * 90}>
              <Icon name={icon} />
              <h3>{title}</h3>
              <p className="pdp-say">{text}</p>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section id="pdp-ask" title={t('faq.title', 'Questions')}>
        <div className="ois-faq">
          {questions(t).map(([question, answer], index) => (
            <Reveal key={question} className="ois-faq-row" delay={index * 80}>
              <span className="ois-faq-index" aria-hidden="true">
                0{index + 1}
              </span>
              <More row label={question} openLabel={question}>
                <p>{answer}</p>
              </More>
            </Reveal>
          ))}
        </div>
      </Section>

      <nav
        className="oi-container pdp-more"
        aria-label={t('pp.desktop.more', 'More about Orqanix')}
      >
        {how}
        <Go to="/instant/features">{t('pages.features.label', 'Features')}</Go>
      </nav>
    </div>
  );
}
