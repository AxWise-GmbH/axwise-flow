import { Link } from 'react-router-dom';
import More from '../../ui/More';
import Reveal from '../../ui/Reveal';
import { Seen } from '../../SpeedStrip';
import { useT } from '../../i18n/useT';
import { ProductScene } from './scenes';
import { Icon } from './scenes/kit';
import './scenes/enterprise-page.css';
import './EnterprisePage.css';

/*
 * Enterprise: a services page with its own layout. Split hero, three tall cards, a bento of
 * four scene cuts, five steps on a line of light, six small offers, three plain columns of
 * pricing, three rules, the questions and a closing panel (the page's own end, before the
 * site's download block). EnterprisePage.css reaches the hero's words by their place, and
 * numbers the questions itself, so the markup carries few class names.
 *
 * The copy is the owner's, word for word, as plain text: sections split on "~", each one a
 * head row "id|title|line|extra class", then its items as "title|line|mark" (a kit icon, or
 * the scene cut shown in the bento).
 *
 * In other languages each piece is looked up by its place (copyKey): the section's id, then
 * the row's number (or "head"), then the field.
 */
const COPY = `ways|Three ways to work with us|Pick the way that fits your team. You can start with advice and build later.
Hire our AI agents|Our agents build your solution inside Orqanix: the plan, the tools and the files. Fast, and ready to change.|bot
Hire our specialists|Our engineers and consultants build a custom solution with your team, fitted to your systems and your rules.|team
Advice first|We study how your work runs today and plan the build with you, before you spend on it.|chat
~build|What we build|From one pipeline to a whole business unit.
Automate a business unit|Support, finance, sales or operations, run by agents and checked by your people.|unit
Pipelines made for you|Your steps and your tools in one flow, from the first request to the finished result.|pipeline
New roles|AI roles you never had time to hire for: research, procurement, follow-ups, reporting.|roles
Hand existing roles to AI|Routine roles move to agents. Your people lead, review and approve.|replace
~runs|How it runs|One clear path from the first talk to a system that keeps improving.
Discover|We learn your goals, your team and your tools.
Blueprint|A written plan: what agents do, what people do, and what it will change.
Build|Agents and specialists build and test it with your data.
Launch|We switch it on, one team at a time, with your people in charge.
Run & improve|We watch, tune and extend it as your business grows.
~more|More ways we help|Small first steps and long-term support.
AI readiness audit|A fixed-price review that shows which jobs to hand to agents first.
Pilot in a few weeks|One real process automated at a fixed price, before a bigger plan.
Custom connectors|We connect Orqanix to your CRM, ERP, inbox or in-house tools.
Managed agent operations|Every month we watch, tune and update your agents.
Team training|Workshops that teach your people to work with agents, and an AI champion in each team.
White-label reasoning API|Our reasoning layer inside your own product, under your brand.
~pay|Ways to pay|Choose what fits your budget.
Project|A fixed price for a clear scope.
Monthly|A retainer for building, running and support.
Per result|Pay for completed tasks or for roles handed to AI.
~rules|Your rules|Agents work inside the limits you set.
Approvals|Let agents run, or approve each step: Allow Once, Always Allow or Deny.|tick
Roles and access|Each agent gets only the tools and data its role needs.|user
A clear record|See what each agent did, when, and why.|doc
~faq|Questions||ois-ruled
Where do we start?|With a short talk. Usually with an AI readiness audit or a small pilot.
Do you replace our team?|No. Agents take the routine work. Your people lead, review and decide.
Can you work with our systems?|Yes. We connect Orqanix to the tools you already use, and build connectors where none exist.
How much does it cost?|It depends on the scope. We agree a fixed price, a monthly plan or pay per result before any work starts.
Can we get early access to Personalised Models?|Yes. Enterprise clients can join early. Write to us and we’ll tell you more.
~end|Tell us what you want to automate.`;

const SECTIONS = COPY.split('\n~').map((part) => part.split('\n').map((row) => row.split('|')));

// Which piece of a row is a word to translate: a head row's title and line, an item's title
// and line (a question and its answer). Ids, classes and marks stay as they are.
const FIELDS = { head: ['', 'title', 'line'], item: ['title', 'line'] };

/** The word key of one piece: pp.enterprise.<section id>.<head or item number>.<field>. */
// eslint-disable-next-line react-refresh/only-export-components -- the words list uses the same keys.
export const copyKey = (id, row, field) => `pp.enterprise.${id}.${row}.${field}`;

// SECTIONS with every word in the current language (t from useT, or the English itself).
function translated(t) {
  return SECTIONS.map(([head, ...items]) => {
    const id = head[0];
    const pick = (row, kind, cells) =>
      cells.map((cell, at) =>
        FIELDS[kind][at] && cell ? t(copyKey(id, row, FIELDS[kind][at]), cell) : cell
      );
    return [pick('head', 'head', head), ...items.map((cells, i) => pick(i, 'item', cells))];
  });
}

/** Every word of the page's copy, { key: English }, for the translators' list. */
// eslint-disable-next-line react-refresh/only-export-components -- see copyKey.
export function enterpriseWords() {
  const words = {};
  translated((key, english) => {
    words[key] = english;
    return english;
  });
  return words;
}

// The white-label offer is the API under your brand: its title opens the API page.
const API_OFFER = ['more', 5];

function Cta() {
  const { t } = useT('pp');
  return (
    <a className="pen-cta" href="mailto:hello@orqanix.com?subject=Enterprise">
      {t('pp.enterprise.cta', 'Talk to our team')}
    </a>
  );
}
const cta = <Cta />;

const cut = (name, className = 'pen-cut') => (
  <div className={className}>
    <ProductScene slug="enterprise" cut={name} />
  </div>
);

// What a section holds under its heading: the questions, the closing button, or its items.
function Body({ id, items }) {
  // EnterprisePage.css numbers the rows, outside their buttons, so each question stays its
  // row's whole name.
  if (id === 'faq') {
    return (
      <div className="ois-faq">
        {items.map(([question, answer], i) => (
          <Reveal key={i} className="ois-faq-row" delay={i * 80}>
            <More row label={question} openLabel={question}>
              <p>{answer}</p>
            </More>
          </Reveal>
        ))}
      </div>
    );
  }
  if (id === 'end') return <Reveal delay={160}>{cta}</Reveal>;
  const Tag = id === 'runs' ? 'ol' : 'ul';
  return (
    <Tag className="pen-list">
      {items.map(([title, line, mark], i) => (
        <Reveal as="li" key={i} delay={i * 90}>
          {mark &&
            (id === 'build' ? (
              cut(mark)
            ) : (
              <span className="pen-glyph">
                <Icon name={mark} />
              </span>
            ))}
          <h3>
            {id === API_OFFER[0] && i === API_OFFER[1] ? (
              <Link to="/instant/products/api">
                {title} <span aria-hidden="true">↗</span>
              </Link>
            ) : (
              title
            )}
          </h3>
          <p>{line}</p>
        </Reveal>
      ))}
    </Tag>
  );
}

export default function EnterprisePage({ product }) {
  const { t } = useT('pp');
  return (
    <>
      <section className="pen-hero" aria-labelledby="pen-title">
        <div className="oi-container">
          <div>
            <h1 id="pen-title">{product.label}</h1>
            <p>
              {t(
                'pp.enterprise.lede',
                'Your business, run by AI agents and the people who build them. We plan it with you, build it, and keep it running.'
              )}
            </p>
            <p>{cta}</p>
          </div>
          {cut('hero', 'pen-art')}
        </div>
      </section>

      {/* Each section: its h2, the paragraph under it, then the rest. Nothing shows before
          the section is really scrolled to (the gate). */}
      {translated(t).map(([[id, title, line, extra = ''], ...items]) => (
        <Seen
          key={id}
          as="section"
          className={`oi-section ois-section ois-gate pen-${id} ${extra}`}
          aria-labelledby={`pen-${id}-t`}
        >
          <div className="oi-container">
            <Reveal as="h2" id={`pen-${id}-t`} className="oi-h2">
              {title}
            </Reveal>
            {line && (
              <Reveal as="p" delay={90}>
                {line}
              </Reveal>
            )}
            <Body id={id} items={items} />
          </div>
        </Seen>
      ))}
    </>
  );
}
