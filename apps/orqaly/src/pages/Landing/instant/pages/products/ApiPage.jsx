import { Link } from 'react-router-dom';
import Reveal from '../../ui/Reveal';
import More from '../../ui/More';
import { Seen } from '../../SpeedStrip';
import { useT } from '../../i18n/useT';
import { ProductScene, SCENES } from './scenes';
// The scene's page-only cuts (hero, uses) ship here, so the header's scene CSS stays small.
import './scenes/api-page.css';
import './ApiPage.css';

/*
 * The API page: a developer page, code first. The hero types a real request and streams the
 * real response; "What comes back" is that response in full, with what each part is for.
 * Paths are shown without the host or the key header (both hold names the site never prints).
 */
const ACCESS = 'mailto:hello@orqanix.com?subject=API%20access';

// The real response of POST /orchestration/decisions (field names and texts from the code;
// the numbers and the agent are an example). Its spine is the hero's code (the scene's
// lines, shared so the two always agree); "|field" marks a line with a callout (callouts).
// The code stays as the API sends it, in every language.
const [OPEN, MODE, STATUS, WHO, AGENT, SCORE, SHUT] = SCENES.api.lines;
const RESPONSE = [
  OPEN,
  MODE,
  STATUS,
  '  "confidence": 0.84,',
  `${WHO}|recommended_agents`,
  '    "rank": 1,',
  AGENT,
  `${SCORE},`,
  '    "factors": [{|factors[].reason',
  '      "factor": "required_capability_coverage",',
  '      "reason": "covers 1/1 required capabilities"',
  '    }]',
  SHUT,
  '  "guardrails": [|context_packages, guardrails, fallbacks',
  '    "Revalidate ownership, availability, permissions, budget, and tool scope before execution"',
  '  ],',
  '  "fallbacks": [{',
  '    "trigger": "agent_unavailable",',
  '    "action": "request_new_catalogue"',
  '  }],',
  '  "execution_plan": {|execution_plan.nodes',
  '    "mode": "direct",',
  '    "executable": true,',
  '    "nodes": [{ "assigned_agent_id": "agent-support" }]',
  '  }',
  '}',
];

// The callouts beside the response, by the field they explain: [label, note].
const callouts = (t) => ({
  recommended_agents: [
    t('pp.api.back.who.label', 'Who'),
    t('pp.api.back.who.note', 'The best agent, team or person for the task, ranked.'),
  ],
  'factors[].reason': [
    t('pp.api.back.why.label', 'Why'),
    t(
      'pp.api.back.why.note',
      'A score for each factor: skills, tools, success rate, cost and speed.'
    ),
  ],
  'context_packages, guardrails, fallbacks': [
    t('pp.api.back.with.label', 'With what'),
    t(
      'pp.api.back.with.note',
      'The context to pass on, the guardrails to keep, and what to do if something fails.'
    ),
  ],
  'execution_plan.nodes': [
    t('pp.api.back.team.label', 'Team plan'),
    t('pp.api.back.team.note', 'Steps, owners and hand-offs when one agent is not enough.'),
  ],
});

// [title, sentence]: the three steps of a call.
const steps = (t) => [
  [
    t('pp.api.how.send.title', 'Send the task'),
    t('pp.api.how.send.text', 'Your task, the agents and tools you have, and a budget.'),
  ],
  [
    t('pp.api.how.route.title', 'It picks a route'),
    t(
      'pp.api.how.route.text',
      'Every candidate is scored. The route can be direct, with research, with a person, or as a team.'
    ),
  ],
  [
    t('pp.api.how.run.title', 'You run the work'),
    t(
      'pp.api.how.run.text',
      'The decision is advice. Your system keeps control of access, approvals and the work itself.'
    ),
  ],
];

// The seven worked examples in the API's OpenAPI docs.
const uses = (t) => [
  t('pp.api.use.incidents', 'Software incidents'),
  t('pp.api.use.escalations', 'Customer escalations'),
  t('pp.api.use.compliance', 'Compliance reviews'),
  t('pp.api.use.marketing', 'Marketing prep'),
  t('pp.api.use.finance', 'Finance analysis'),
  t('pp.api.use.research', 'Research'),
  t('pp.api.use.plans', 'Multi-agent plans'),
];
const stack = (t) => [
  'REST + JSON',
  t('pp.api.stack.key', 'API key'),
  t('pp.api.stack.retries', 'Safe retries'),
  t('pp.api.stack.docs', 'OpenAPI docs'),
  t('pp.api.stack.webhook', 'Webhook when long work ends'),
];

// [question, answer], opened one at a time like the home page's questions.
const faq = (t) => [
  [
    t('pp.api.faq.who.q', 'Who is it for?'),
    t(
      'pp.api.faq.who.a',
      'Companies that already have their own agents, tools or teams and want the part that decides who does what.'
    ),
  ],
  [
    t('pp.api.faq.run.q', 'Does the API run the work?'),
    t(
      'pp.api.faq.run.a',
      'No. It decides and explains. Your system keeps control of access, approvals and running the work.'
    ),
  ],
  [
    t('pp.api.faq.access.q', 'How do I get access?'),
    t(
      'pp.api.faq.access.a',
      'Write to hello@orqanix.com. We’ll give you a key and help you with the first calls.'
    ),
  ],
  [
    t('pp.api.faq.cost.q', 'What does it cost?'),
    t(
      'pp.api.faq.cost.a',
      'Access is by request during the early version. We’ll agree terms with you before any paid plan.'
    ),
  ],
];

function Section({ id, title, line, children }) {
  return (
    <Seen
      as="section"
      className={`oi-section ois-section ois-gate pap-sec pap-${id}`}
      aria-labelledby={`pap-${id}-title`}
    >
      <div className="oi-container">
        <Reveal as="h2" id={`pap-${id}-title`} className="oi-h2">
          {title}
        </Reveal>
        {line && (
          <Reveal as="p" delay={90} className="pap-line">
            {line}
          </Reveal>
        )}
        <Reveal delay={180} className="pap-body">
          {children}
        </Reveal>
      </div>
    </Seen>
  );
}

function Access() {
  const { t } = useT('pp');
  return (
    <a className="pap-cta" href={ACCESS}>
      {t('pp.api.cta', 'Get API access')}
    </a>
  );
}

export default function ApiPage({ product }) {
  const { t } = useT('pp');
  const calls = callouts(t);
  return (
    <>
      <section className="pap-hero" aria-labelledby="pap-title">
        <div className="oi-container pap-hero-in">
          <div className="pap-hero-text">
            <h1 id="pap-title" className="pap-title oip-rise">
              {product.label}
            </h1>
            <p className="pap-lede oip-rise">{product.line}.</p>
            <p className="pap-sub oip-rise">
              {t(
                'pp.api.sub',
                'The same reasoning layer that runs inside Orqanix, as an API for your product. Send a task with your agents and tools. Get back who should do it, an agent, a team or a person, with the reasons, checks and fallbacks.'
              )}
            </p>
            <p className="pap-acts oip-rise">
              <Access />
              <Link className="pap-quiet" to="/instant/news/business-api">
                {t('pp.api.story', 'Read the story')} <span aria-hidden="true">↗</span>
              </Link>
            </p>
          </div>
          <div className="pap-art oip-rise">
            <div className="pap-card">
              <ProductScene slug="api" cut="hero" />
            </div>
          </div>
        </div>
      </section>

      <Section
        id="back"
        title={t('pp.api.back.title', 'What comes back')}
        line={t(
          'pp.api.back.line',
          'Every answer is a decision you can act on and explain. It names the best agent, shows the score behind it factor by factor, and lists the context, guardrails and fallbacks that go with the task. For bigger jobs it returns a plan for a small team of agents.'
        )}
      >
        <pre className="pap-card pap-json">
          <code>
            {RESPONSE.map((row, index) => {
              const [line, field] = row.split('|');
              const [label, note] = field ? calls[field] : [];
              const text = line.trimStart();
              return (
                <span
                  key={index}
                  className="pap-ln"
                  style={{ '--i': line.length - text.length }}
                  data-call={label && ''}
                >
                  {label && (
                    <span className="pap-call">
                      <b>{label}</b> <i>{field}</i> <small>{note}</small>
                    </span>
                  )}
                  {text
                    .split(/("\w+":)/)
                    .map((part, at) => (at % 2 ? <b key={at}>{part}</b> : part))}
                </span>
              );
            })}
          </code>
        </pre>
      </Section>

      <Section id="how" title={t('pages.how-it-works.label', 'How it works')}>
        <ol className="pap-steps">
          {steps(t).map(([title, text]) => (
            <li key={title} className="pap-card pap-step">
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="use"
        title={t('pp.api.use.title', 'Use it for')}
        line={t('pp.api.use.line', 'Anywhere a task has to reach the right hands.')}
      >
        <div className="pap-card pap-uses">
          <ul className="pap-list">
            {uses(t).map((use) => (
              <li key={use}>{use}</li>
            ))}
          </ul>
          <div className="pap-uses-art">
            <ProductScene slug="api" cut="uses" />
          </div>
        </div>
      </Section>

      <Section
        id="stack"
        title={t('pp.api.stack.title', 'Built for your stack')}
        line={t(
          'pp.api.stack.line',
          'A plain REST API: JSON in, JSON out, with an API key. Long jobs answer at once and finish in the background; poll for the result or get a signed webhook.'
        )}
      >
        <ul className="pap-card pap-facts">
          {stack(t).map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </Section>

      <Section
        id="end"
        title={t('pp.api.end.title', 'Want it in your product?')}
        line={t(
          'pp.api.end.line',
          'Write to us and we’ll set you up with a key and help with the first calls.'
        )}
      >
        <Access />
      </Section>

      <Section id="faq" title={t('faq.title', 'Questions')}>
        <div className="ois-faq">
          {faq(t).map(([question, answer], index) => {
            return (
              <div key={question} className="ois-faq-row">
                {/* Outside the button, so the question stays the row's whole name and text. */}
                <span className="ois-faq-index" aria-hidden="true">
                  0{index + 1}
                </span>
                <More row label={question} openLabel={question}>
                  <p>{answer}</p>
                </More>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
