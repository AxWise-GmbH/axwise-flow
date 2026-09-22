import { Chip, Icon, SceneStage, Win } from './kit';
import { useT } from '../../../i18n/useT';
import './desktop.css';

const FILES = [
  ['doc', 'plan.md'],
  ['sheet', 'budget.xlsx'],
  ['code', 'site.html'],
];

// The scene's words, in the current language (t from useT).
const words = (t) => ({
  ask: t('pp.desktop.scene.ask', 'Plan a launch for my coffee brand'),
  side: [
    t('pp.desktop.scene.side.new', 'New Chat'),
    t('pp.desktop.scene.side.recent', 'Recent'),
    t('pp.desktop.scene.side.pinned', 'Pinned'),
    t('pp.desktop.scene.side.intelligence', 'Intelligence'),
    t('pp.desktop.scene.side.plugins', 'Plugins'),
    t('pp.desktop.scene.side.instruments', 'Instruments'),
    t('pp.desktop.scene.side.history', 'History'),
  ],
  steps: [
    t('pp.desktop.scene.step.research', 'Research'),
    t('pp.desktop.scene.step.plan', 'Plan'),
    t('pp.desktop.scene.step.build', 'Build'),
    t('pp.desktop.scene.step.check', 'Check'),
  ],
  days: [
    t('pp.desktop.scene.day.mon', 'Mon'),
    t('pp.desktop.scene.day.tue', 'Tue'),
    t('pp.desktop.scene.day.wed', 'Wed'),
    t('pp.desktop.scene.day.thu', 'Thu'),
    t('pp.desktop.scene.day.fri', 'Fri'),
    t('pp.desktop.scene.day.sat', 'Sat'),
    t('pp.desktop.scene.day.sun', 'Sun'),
  ],
  choices: [
    t('pp.desktop.scene.allow.once', 'Allow Once'),
    t('pp.desktop.scene.allow.always', 'Always Allow'),
    t('pp.desktop.scene.allow.deny', 'Deny'),
  ],
});

// A file row. CSS lands it, turns a ring in its tag while it is written, then lights New.
function fileRow([kind, name]) {
  return (
    <div className="ps-file" key={name}>
      <span className="ps-file-icon">
        <Icon name={kind} />
      </span>
      <span className="ps-file-name">{name}</span>
      <em className="ps-file-state" />
    </div>
  );
}

/**
 * The Desktop App: the Mac app at work. One markup, many cuts; desktop.css shows the parts a
 * cut needs and plays its story (desktop-page.css, loaded by the page, has the page's own
 * cuts). menu and hero: an ask is typed and sent, the Workspace plans four steps and writes
 * three files. ask, plan, files: close-ups of that story. schedule: a recipe runs every
 * Monday. approve: a tool call waits for a yes.
 */
export default function DesktopScene({ cut = 'menu', className = '' }) {
  const { t } = useT('pp');
  const { ask, side, steps, days, choices } = words(t);
  // "{tool}" marks where the tool's name sits, in its own type.
  const [callBefore, callAfter = ''] = t(
    'pp.desktop.scene.call',
    'Orqanix would like to call {tool}. Allow?'
  ).split('{tool}');
  return (
    <SceneStage
      product="desktop"
      cut={cut}
      className={`pd ${className}`}
      words={{
        '--pd-say-empty': t('pp.desktop.scene.input', 'Ask anything…'),
        '--pd-say-wait': t('pp.desktop.scene.waiting', 'Steps appear here'),
        '--pd-say-plan': t('pp.desktop.scene.plan', 'AI plan'),
        '--pd-say-new': t('pp.desktop.scene.new', 'New'),
        '--pd-say-allow': choices[0],
      }}
    >
      <i className="pd-glow" />
      <div className="pd-cam">
        <Win className="pd-app">
          <div className="pd-body">
            <div className="pd-side">
              {side.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="pd-chat">
              <p className="pd-ask">{ask}</p>
              <div className="pd-out">
                <p className="pd-status">
                  <Icon name="spark" />
                  {t('pp.desktop.scene.working', 'Orqanix is working on it…')}
                </p>
                <p className="pd-reply">
                  <i />
                  <i />
                  <i />
                </p>
                <p className="pd-chips">
                  {FILES.map(([kind, name]) => (
                    <Chip key={name}>
                      <Icon name={kind} />
                      {name}
                    </Chip>
                  ))}
                </p>
              </div>
              <p className="pd-input" style={{ '--n': ask.length }}>
                <span className="pd-typed">{ask}</span>
                <i className="ps-caret" />
                <i className="pd-send">
                  <Icon name="arrow" />
                </i>
              </p>
            </div>
          </div>
        </Win>
        <div className="pd-ws">
          <p className="pd-ws-head">
            <Icon name="folder" />
            {t('pp.desktop.scene.workspace', 'Workspace')}
          </p>
          <ol className="pd-steps">
            {steps.map((step) => (
              <li key={step}>
                <i className="ps-tick" />
                {step}
              </li>
            ))}
          </ol>
          <div className="pd-files">{FILES.map(fileRow)}</div>
        </div>
      </div>

      <div className="pd-sched">
        <div className="pd-week">
          {days.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="pd-job">
          <i className="pd-job-icon">
            <Icon name="clock" />
          </i>
          <p>
            <b>{t('pp.desktop.scene.job', 'Weekly sales report')}</b>
            {t('pp.desktop.scene.when', 'Every Monday · 9:00')}
          </p>
          <Chip>{t('pp.desktop.scene.recipe', 'Recipe')}</Chip>
          <i className="ps-tick" />
          <i className="pd-run" />
        </div>
        {fileRow(['doc', 'sales-week.pdf'])}
      </div>

      <div className="pd-ok">
        <div className="pd-card">
          <p>
            <Icon name="code" />
            <span>
              {callBefore}
              <span className="ps-mono">write_file</span>
              {callAfter}
            </span>
          </p>
          <div className="pd-choices">
            {choices.map((label) => (
              <span key={label}>{label}</span>
            ))}
            <i className="ps-tick" />
            <i className="pd-ptr" />
          </div>
        </div>
        {fileRow(['doc', 'plan.md'])}
      </div>
    </SceneStage>
  );
}
