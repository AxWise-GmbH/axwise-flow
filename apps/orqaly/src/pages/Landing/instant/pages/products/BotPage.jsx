import More from '../../ui/More';
import Reveal from '../../ui/Reveal';
import { Seen } from '../../SpeedStrip';
import { useT } from '../../i18n/useT';
import { ProductScene } from './scenes';
// The scene's page-only cuts ship with this page, not with the header's scenes chunk.
import './scenes/bot-page.css';
import './BotPage.css';

/*
 * Assistant Bot: a centred title over a wall of bots, then bands that swap sides, a pair of
 * half cards, one wide picture, four cards of what a bot does, and the questions. Every
 * picture is a cut of the product's scene; the card icons are the scene kit's (kit.css).
 */

// The page's words, in the current language (t from useT).
// [cut, title, words]: the bands, in page order; the pair of half cards sits before the last.
const bands = (t) => [
  [
    'role',
    t('pp.bot.role.title', 'Give it a role.'),
    t(
      'pp.bot.role.line',
      'A role tells the bot what it is for: sales, finance, support, the office, or anything you write yourself. It follows that role in every task, and you can change it any time.'
    ),
  ],
  [
    'map',
    t('pp.bot.map.title', 'It learns your business.'),
    t(
      'pp.bot.map.line',
      'The bot builds a map of your business: your team, your clients, your suppliers and your files, and how they connect. The more it works, the better it knows who is who and where things are.'
    ),
  ],
  [
    'control',
    t('pp.bot.control.title', 'Many bots. Full control.'),
    t(
      'pp.bot.control.line',
      'Make as many bots as you have roles. Each one can use everything the Orqanix app can do: chats, recipes, schedules, tools and files. They work side by side, and you can see what each one did.'
    ),
  ],
];
const pair = (t) => [
  [
    'contacts',
    t('pp.bot.contacts.title', 'Contacts from mail and phone, in sync.'),
    t(
      'pp.bot.contacts.line',
      'It gathers people from your email and your phone into one list and merges the duplicates.'
    ),
  ],
  [
    'files',
    t('pp.bot.files.title', 'Files, documents and images, sorted.'),
    t(
      'pp.bot.files.line',
      'Invoices, contracts, photos and notes land in the right folder, easy to find later.'
    ),
  ],
];
// [icon, title, sentence]
const can = (t) => [
  [
    'chat',
    t('pp.bot.can.answer.title', 'Answer and draft'),
    t('pp.bot.can.answer.text', 'Replies, briefs and reports, written in your tone.'),
  ],
  [
    'sheet',
    t('pp.bot.can.data.title', 'Collect data'),
    t('pp.bot.can.data.text', 'Numbers and details from your mail, files and tools.'),
  ],
  [
    'folder',
    t('pp.bot.can.order.title', 'Keep things in order'),
    t('pp.bot.can.order.text', 'Contacts, documents and images, sorted and up to date.'),
  ],
  [
    'clock',
    t('pp.bot.can.time.title', 'Run jobs on time'),
    t('pp.bot.can.time.text', 'Schedules for the work that repeats every day or week.'),
  ],
];
const questions = (t) => [
  [
    t('pp.bot.faq.many.q', 'How many bots can I make?'),
    t('pp.bot.faq.many.a', 'As many as you need, one for each role.'),
  ],
  [
    t('pp.bot.faq.do.q', 'What can a bot do?'),
    t(
      'pp.bot.faq.do.a',
      'Everything the Orqanix app can do: chat, research, run recipes and schedules, use connected tools and make files.'
    ),
  ],
  [
    t('pp.bot.faq.role.q', 'Can I change a bot’s role?'),
    t(
      'pp.bot.faq.role.a',
      'Yes, any time. Edit the role, and the bot follows it from the next task.'
    ),
  ],
  [
    t('pp.bot.faq.files.q', 'Where do the bot’s files go?'),
    t('pp.bot.faq.files.a', 'Into your Orqanix Workspace, like the files from any other job.'),
  ],
];
const GATE = 'oi-section ois-section ois-gate pbo-';

const Stage = ({ cut }) => (
  <div className="pbo-stage" data-cut={cut}>
    <ProductScene slug="assistant-bot" cut={cut} />
  </div>
);

const band = ([cut, title, words]) => (
  <Seen
    as="section"
    key={cut}
    className={GATE + 'band'}
    data-cut={cut}
    aria-labelledby={`pbo-${cut}`}
  >
    <div className="oi-container pbo-grid">
      <div className="pbo-copy">
        <Reveal as="h2" id={`pbo-${cut}`} className="oi-h2">
          {title}
        </Reveal>
        <Reveal as="p" className="pbo-line" delay={120}>
          {words}
        </Reveal>
      </div>
      <Reveal delay={200}>
        <Stage cut={cut} />
      </Reveal>
    </div>
  </Seen>
);

export default function BotPage({ product }) {
  const { t } = useT('pp');
  const rows = bands(t);
  return (
    <>
      <section className="pbo-hero" aria-labelledby="pbo-title">
        <div className="oi-container">
          <h1 id="pbo-title" className="pbo-title">
            {product.label}
          </h1>
          <p className="pbo-lede">
            {t(
              'pp.bot.lede',
              'An assistant bot is a colleague with one job. Give it a role, and it collects what it needs, keeps your contacts and files in order, and does the work in Orqanix. Make one for every role you need.'
            )}
          </p>
          <a href="#download" className="pbo-cta">
            {t('nav.cta', 'Try For Free')}
          </a>
          <Stage cut="hero" />
        </div>
      </section>

      {rows.slice(0, 2).map(band)}

      <Seen as="section" className={GATE + 'pair'}>
        <div className="oi-container pbo-duo">
          {pair(t).map(([cut, title, words], index) => (
            <Reveal key={cut} as="article" className="pbo-half" delay={index * 140}>
              <Stage cut={cut} />
              <h2 className="pbo-h">{title}</h2>
              <p>{words}</p>
            </Reveal>
          ))}
        </div>
      </Seen>

      {band(rows[2])}

      <Seen as="section" className={GATE + 'can'} aria-labelledby="pbo-can">
        <div className="oi-container">
          <Reveal as="h2" id="pbo-can" className="oi-h2">
            {t('pp.bot.can.title', 'What a bot can do')}
          </Reveal>
          <ul className="pbo-cards">
            {can(t).map(([icon, title, words], index) => (
              <Reveal key={icon} as="li" className="pbo-card" delay={120 + index * 90}>
                <i className="ps-icon" data-i={icon} aria-hidden />
                <h3>{title}</h3>
                <p>{words}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </Seen>

      {/* The home page's questions, in its own classes (sections.css). */}
      <Seen
        as="section"
        className="oi-section ois-section ois-ruled pbo-ask"
        aria-labelledby="pbo-ask"
      >
        <div className="oi-container ois-faq-layout">
          <Seen className="ois-gate ois-faq-head">
            <Reveal as="h2" id="pbo-ask" className="oi-h2">
              {t('faq.title', 'Questions')}
            </Reveal>
          </Seen>
          <Seen className="ois-gate ois-faq">
            {questions(t).map(([question, answer], index) => (
              <Reveal key={question} className="ois-faq-row" delay={index * 80}>
                <span className="ois-faq-index" aria-hidden>
                  0{index + 1}
                </span>
                <More row label={question} openLabel={question}>
                  <p>{answer}</p>
                </More>
              </Reveal>
            ))}
          </Seen>
        </div>
      </Seen>
    </>
  );
}
