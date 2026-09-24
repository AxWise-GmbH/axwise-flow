import More from '../../ui/More';
import Reveal from '../../ui/Reveal';
import { Seen } from '../../SpeedStrip';
import { useT } from '../../i18n/useT';
import { ProductScene } from './scenes';
import { Icon } from './scenes/kit';
import './scenes/mobile-page.css';
import './MobilePage.css';

// Phone first: the words and the phone side by side, three phone screens, the one rule, where
// the files live, then a few questions.
const screens = (t) => [
  [
    'check',
    t('pp.mobile.screen.check.title', 'Check'),
    t(
      'pp.mobile.screen.check.text',
      'Follow each step of a running job and read the result when it’s done.'
    ),
  ],
  [
    'rerun',
    t('pp.mobile.screen.rerun.title', 'Re-run'),
    t(
      'pp.mobile.screen.rerun.text',
      'Weekly reports, supplier checks and saved recipes are one tap away.'
    ),
  ],
  [
    'start',
    t('pp.mobile.screen.start.title', 'Start'),
    t(
      'pp.mobile.screen.start.text',
      'Type or say what you need. Your Mac starts the work straight away.'
    ),
  ],
];

const files = (t) => [
  [
    'phone',
    t('pp.mobile.files.note.title', 'A note when it’s done'),
    t('pp.mobile.files.note.text', 'Your phone tells you the moment a job is finished.'),
  ],
  [
    'folder',
    t('pp.mobile.files.desk.title', 'Pick up at your desk'),
    t('pp.mobile.files.desk.text', 'Everything is waiting in the Workspace when you get back.'),
  ],
];

const questions = (t) => [
  [
    t('pp.mobile.faq.mac.q', 'Do I need the Mac app?'),
    t(
      'pp.mobile.faq.mac.a',
      'Yes. The phone app works with Orqanix on your Mac. Start with the Mac app, then add your phone.'
    ),
  ],
  [
    t('pp.mobile.faq.off.q', 'What if my Mac is off?'),
    t(
      'pp.mobile.faq.off.a',
      'The phone shows that your Mac is offline. Open Orqanix on your Mac and you’re live again.'
    ),
  ],
  [
    t('pp.mobile.faq.start.q', 'Can I start new work from my phone?'),
    t(
      'pp.mobile.faq.start.a',
      'Yes. Type or say what you need. Your Mac does the work, and the files land in its Workspace.'
    ),
  ],
];

const scene = (cut, className) => (
  <div className={`pmo-card ${className}`}>
    <ProductScene slug="mobile" cut={cut} />
  </div>
);

// A section that rests off screen, named by its heading (pmo-<name>-title); `extra` adds its
// own classes.
const section = (name, extra, children) => (
  <Seen
    as="section"
    className={`oi-section ois-section ${extra}`}
    aria-labelledby={`pmo-${name}-title`}
  >
    {children}
  </Seen>
);

// A section's heading and the short paragraph that follows it in.
const head = (name, title, text) => (
  <>
    <Reveal as="h2" id={`pmo-${name}-title`} className="oi-h2">
      {title}
    </Reveal>
    <Reveal as="p" className="pmo-intro" delay={100}>
      {text}
    </Reveal>
  </>
);

export default function MobilePage({ product }) {
  const { t } = useT('pp');
  return (
    <>
      <section className="pmo-hero" aria-labelledby="pmo-title">
        <div className="oi-container pmo-split">
          <div className="pmo-words">
            <h1 id="pmo-title" className="pmo-title pmo-rise">
              {product.label}
            </h1>
            <p className="pmo-lede pmo-rise">
              {t(
                'pp.mobile.lede',
                'The Orqanix app for your phone. Check your work, run it again or start something new. Your Mac does the work.'
              )}
            </p>
            <a href="#download" className="pmo-cta pmo-rise">
              {t('pp.mobile.cta', 'Start with the Mac app')}
            </a>
          </div>
          {scene('hero', 'pmo-rise pmo-stage')}
        </div>
      </section>

      {section(
        'phone',
        '',
        <div className="oi-container">
          <Seen className="ois-gate">
            {head(
              'phone',
              t('pp.mobile.phone.title', 'From your phone'),
              t(
                'pp.mobile.phone.line',
                'Your phone is a remote for Orqanix on your Mac. Everything runs on the Mac, with its files, tools and settings. The phone shows you what is happening and lets you give the next job.'
              )
            )}
          </Seen>
          <Seen as="ul" className="ois-gate pmo-trio" threshold={0.2}>
            {screens(t).map(([cut, title, line], index) => (
              <Reveal as="li" key={cut} delay={index * 120}>
                {scene(cut, 'pmo-tall')}
                <h3>{title}</h3>
                <p>{line}</p>
              </Reveal>
            ))}
          </Seen>
        </div>
      )}

      {section(
        'online',
        'pmo-rule',
        <Seen className="oi-container ois-gate">
          {head(
            'online',
            t('pp.mobile.online.title', 'Works while your Mac is online.'),
            t(
              'pp.mobile.online.line',
              'The phone is the remote, your Mac is the engine. When Orqanix is open on your Mac, the phone is live. When the Mac sleeps or goes offline, the phone tells you and waits until it’s back.'
            )
          )}
          <Reveal delay={200}>{scene('online', 'pmo-wide')}</Reveal>
        </Seen>
      )}

      {section(
        'files',
        '',
        <Seen className="oi-container ois-gate pmo-files">
          <div>
            {head(
              'files',
              t('pp.mobile.files.title', 'Your files stay on your Mac.'),
              t(
                'pp.mobile.files.line',
                'The files are made on your Mac and stay in your project folder. Your phone shows what was made, and your Mac keeps the originals.'
              )
            )}
          </div>
          <ul className="pmo-pair">
            {files(t).map(([icon, title, line], index) => (
              <Reveal as="li" key={icon} className="pmo-tile" delay={200 + index * 120}>
                <span className="pmo-glyph">
                  <Icon name={icon} />
                </span>
                <h3>{title}</h3>
                <p>{line}</p>
              </Reveal>
            ))}
          </ul>
        </Seen>
      )}

      {section(
        'faq',
        'ois-ruled pmo-faq',
        <div className="oi-container ois-faq-layout">
          <Seen className="ois-gate ois-faq-head">
            <Reveal as="h2" id="pmo-faq-title" className="oi-h2">
              {t('faq.title', 'Questions')}
            </Reveal>
          </Seen>
          <Seen className="ois-gate ois-faq">
            {questions(t).map(([question, answer], index) => (
              <Reveal key={question} className="ois-faq-row" delay={index * 80}>
                {/* Outside the button, so the question stays the row's whole name. */}
                <span className="ois-faq-index" aria-hidden="true">
                  0{index + 1}
                </span>
                <More row label={question} openLabel={question}>
                  <p>{answer}</p>
                </More>
              </Reveal>
            ))}
          </Seen>
        </div>
      )}
    </>
  );
}
