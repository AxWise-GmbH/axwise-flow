import { Bars, Chip, Icon, SceneStage } from './kit';
import { useT } from '../../../i18n/useT';
import './enterprise.css';

/*
 * Enterprise: Blueprint → Build → Run. Four business units run with agents, a pipeline, one new
 * role made and one role handed to AI; the story winds back to the blueprint, a specialist's pen
 * goes round each unit and builds the pipeline, and they run again. Markup only; enterprise.css
 * places and moves the parts on the shared clock. The menu and the page top play the whole
 * story (marked pen-m); the page's own cuts (unit, pipeline, roles, replace) tell one beat each,
 * styled by enterprise-page.css.
 */

// The scene's words, in the current language (t from useT).
const units = (t) => [
  t('pp.enterprise.scene.sales', 'Sales'),
  t('pp.enterprise.scene.finance', 'Finance'),
  t('pp.enterprise.scene.support', 'Support'),
  t('pp.enterprise.scene.operations', 'Operations'),
];
const ICONS = ['mail', 'sheet', 'chat', 'clock'];

// Three plain dots: a unit's agents, and the work running the pipeline and the rail.
const three = [<i key="a" />, <i key="b" />, <i key="c" />];

const orbs = <span className="pen-orbs">{three}</span>;

// One business unit; Support carries the "Automated" tag and the pulse that says it is on.
const unit = (t) => (name, k) => (
  <div key={k} className="pen-unit" style={{ '--k': k }}>
    <p>
      <Icon name={ICONS[k]} />
      <b>{name}</b>
    </p>
    <Bars w={[74, 48]} />
    {orbs}
    {k === 2 && (
      <i className="pen-live">
        <Chip data-on>{t('pp.enterprise.scene.automated', 'Automated')}</Chip>
      </i>
    )}
  </div>
);

const face = (a, b) => (
  <span className="pen-face">
    <Icon name={a} />
    {b && <Icon name={b} />}
  </span>
);

// A person who checks the work: the tick lands when they approve.
const boss = (
  <i className="pen-boss" key="b">
    <Icon name="user" />
    <i className="ps-tick" />
  </i>
);

const made = (t) => (
  <div className="pen-role pen-made" key="m">
    {face('bot')}
    <small>{t('pp.enterprise.scene.newrole', 'New role')}</small>
    <b>{t('pp.enterprise.scene.procurement', 'Procurement agent')}</b>
    <ul>
      {['mail', 'sheet', 'doc'].map((name) => (
        <li key={name}>
          <Icon name={name} />
          <Bars w={[70]} />
        </li>
      ))}
    </ul>
  </div>
);

const hand = (t) => (
  <div className="pen-role pen-hand" key="h">
    {face('user', 'bot')}
    <b>{t('pp.enterprise.scene.invoices', 'Invoice checks')}</b>
    <Bars w={[64]} />
    <Chip data-on>{t('pp.enterprise.scene.handed', 'Handed to AI')}</Chip>
  </div>
);

const grid = <i className="pen-grid" key="g" />;

// The whole story, for the menu, the page top and any cut this scene does not know.
const story = (t) => [
  grid,
  <i className="pen-trace" key="t" />,
  ...units(t).map(unit(t)),
  <div className="pen-flow" key="f">
    {three}
    {[
      t('pp.enterprise.scene.leads', 'Leads'),
      t('pp.enterprise.scene.quotes', 'Quotes'),
      t('pp.enterprise.scene.invoicing', 'Invoices'),
    ].map((step, k) => (
      <Chip key={k}>{step}</Chip>
    ))}
  </div>,
  made(t),
  hand(t),
  <i className="pen-pen" key="p">
    <Icon name="user" />
  </i>,
];

const cuts = (t) => ({
  unit: [grid, unit(t)(units(t)[2], 2), boss],
  pipeline: [
    grid,
    <i className="pen-rail" key="r">
      {three}
    </i>,
    ...['mail', 'bot', 'sheet', 'doc'].map((name) => (
      <span key={name} className="pen-st">
        <Icon name={name} />
      </span>
    )),
    <i className="ps-tick pen-done" key="t" />,
  ],
  roles: [grid, made(t)],
  replace: [grid, boss, hand(t)],
});

export default function EnterpriseScene({ cut = 'menu', className = '' }) {
  const { t } = useT('pp');
  const parts = cuts(t)[cut];
  return (
    <SceneStage
      product="enterprise"
      cut={cut}
      className={`pen-s ${parts ? '' : 'pen-m '}${className}`}
    >
      <div className="pen-board">{parts ?? story(t)}</div>
    </SceneStage>
  );
}
