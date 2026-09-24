import { Icon, SceneStage } from './kit';
import { useT } from '../../../i18n/useT';
import './mobile.css';

// The phone is a remote for the Mac: it checks, re-runs and starts work, and the Mac does it.
// One set of parts; mobile.css picks what each cut shows and plays (see the loop notes there).
const PLAN = ['Research', 'Audience', 'Budget', 'Timeline', 'Summary'];

// The scene's words, in the current language (t from useT).
const words = (t) => ({
  job: t('pp.mobile.scene.job', 'Weekly sales report'),
  work: t('pp.mobile.scene.working', 'Working…'),
  ask: t('pp.mobile.scene.ask', 'Find new suppliers'),
  steps: [
    t('pp.mobile.scene.step.numbers', 'Numbers'),
    t('pp.mobile.scene.step.summary', 'Summary'),
    t('pp.mobile.scene.step.report', 'Report'),
  ],
  plan: [
    t('pp.mobile.scene.plan.research', 'Research'),
    t('pp.mobile.scene.plan.audience', 'Audience'),
    t('pp.mobile.scene.plan.budget', 'Budget'),
    t('pp.mobile.scene.plan.timeline', 'Timeline'),
    t('pp.mobile.scene.plan.summary', 'Summary'),
  ],
});

const I = (name) => <i className={`pmo-${name}`} />;
const LIVE = <i className="ps-dot" data-on="true" />;
// Words that take turns in one place (mobile.css shows one at a time).
const say = (list) => list.map((words) => <span key={words}>{words}</span>);

const steps = (list) =>
  list.map((step) => (
    <p key={step}>
      {I('tk')}
      <span>{step}</span>
    </p>
  ));

const row = (icon, title, line, extra, name = '') => (
  <div className={`pmo-row ${name}`}>
    <Icon name={icon} />
    <b>{title}</b>
    {line}
    {extra}
  </div>
);

export default function MobileScene({ cut = 'menu', className = '' }) {
  const { t } = useT('pp');
  const { job, work, ask, steps: jobSteps, plan } = words(t);
  const online = t('pp.mobile.scene.online', 'Online');
  // "{n}" marks where the counting step number sits.
  const [stepBefore, stepAfter = ''] = t('pp.mobile.scene.stepof', 'Step {n} of 5').split('{n}');
  return (
    <SceneStage product="mobile" cut={cut} className={className}>
      {I('glow')}
      <div className="pmo-mac">
        <div className="pmo-lid">
          <div className="pmo-disp">
            <b>{job}</b>
            {steps(jobSteps)}
            {I('bar')}
          </div>
        </div>
        <p className="pmo-on">
          {LIVE}
          {say([online, t('pp.mobile.scene.offline', 'Offline')])}
        </p>
      </div>
      <svg className="pmo-link" viewBox="0 0 14 5">
        <path d="M1 4A8.5 8.5 0 0 1 13 4" />
      </svg>
      {I('go')}
      <div className="pmo-phone">
        <div className="pmo-scr">
          <b className="pmo-time">9:41</b>
          {I('isl')}
          <p className="pmo-note">
            <i className="ps-tick" />
            <span>{t('pp.mobile.scene.ready', '{job} is ready', { job })}</span>
          </p>
          <p className="pmo-hd">
            {LIVE}
            {t('pp.mobile.scene.mac', 'Your Mac · {status}', { status: online })}
          </p>
          <div className="pmo-list">
            {row(
              'sheet',
              job,
              <span className="pmo-st">
                {say([
                  t('pp.mobile.scene.done.yesterday', 'Done · yesterday'),
                  work,
                  t('pp.mobile.scene.done.now', 'Done · just now'),
                ])}
              </span>,
              <>
                <div className="pmo-mini">{steps(jobSteps)}</div>
                <em className="pmo-btn">{t('pp.mobile.scene.again', 'Run again')}</em>
              </>,
              'pmo-r1'
            )}
            {row(
              'clock',
              t('pp.mobile.scene.supplier', 'Supplier check'),
              <span>{t('pp.mobile.scene.monday', 'Every Monday')}</span>
            )}
            {row('doc', t('pp.mobile.scene.launch', 'Launch plan'), <span>{work}</span>, I('prog'))}
            {row('spark', ask, <span>{work}</span>, I('mg'), 'pmo-new')}
          </div>
          <div className="pmo-plan">
            <b>{t('pp.mobile.scene.launch', 'Launch plan')}</b>
            <span>
              {`${work} · ${stepBefore}`}
              <i className="pmo-n">
                {[1, 2, 3].map((n) => (
                  <i key={n}>{n}</i>
                ))}
              </i>
              {stepAfter}
            </span>
            {I('prog')}
            {steps(plan)}
            {/* File names stay as the files are named. */}
            {PLAN.slice(0, 2).map((step) => (
              <p key={step} className="pmo-file">
                <Icon name="doc" />
                <span>{step.toLowerCase()}.md</span>
              </p>
            ))}
          </div>
          <p className="pmo-off">
            {I('mg')}
            {t('pp.mobile.scene.open', 'Open Orqanix on your Mac')}
          </p>
          <p className="pmo-ask">
            <span>{t('pp.mobile.scene.input', 'Ask your Mac…')}</span>
            <span className="pmo-tp">{ask}</span>
            <Icon name="arrow" />
          </p>
        </div>
      </div>
    </SceneStage>
  );
}
