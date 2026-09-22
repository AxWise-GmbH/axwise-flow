import { Chip, Icon, SceneStage, Win } from './kit';
import { useT } from '../../../i18n/useT';
import './api.css';

/*
 * API: a task goes into the reasoning ring, which picks who should do it and says why.
 * One set of parts, three cuts (api.css and, for the page's cuts, api-page.css pick what
 * shows and when it moves):
 * - menu: the task card, the ring, three lanes (Agent wins), reason chips, the endpoint.
 * - hero: a code window types the request and streams the real response; the lanes light.
 * - uses: seven lines (the page lays its use cases over their starts) feed the ring, and
 *   each task lights the lane it goes to.
 * The status code is drawn by CSS (content), so the text never holds the pair "01".
 * RESPONSE is also the backbone of the page's "What comes back" (ApiScene.lines), so the
 * hero and the page always name the same agent.
 * The ring is four stacked svg boxes, so its turns and flashes move boxes, not svg children.
 */
const ENDPOINT = 'POST /orchestration/decisions';
// The request the code window types; the task is the visitor's words, the rest is code.
const request = (task) => [
  '{',
  `  "objective": ${JSON.stringify(task)},`,
  '  "required_capabilities": ["customer comms"],',
  '  "risk_level": "medium"',
  '}',
];
const RESPONSE = [
  '{',
  '  "routing_mode": "direct",',
  '  "status": "recommended",',
  '  "recommended_agents": [{',
  '    "agent_name": "Support Specialist",',
  '    "score": 0.84',
  '  }],',
  '  "guardrails": [ … ],',
  '  "fallbacks": [ … ]',
  '}',
];
// The scene's words, in the current language (t from useT).
const lanes = (t) => [
  ['bot', t('pp.api.scene.agent', 'Agent')],
  ['team', t('pp.api.scene.team', 'Team')],
  ['user', t('pp.api.scene.person', 'Person')],
];
const reasons = (t) => [
  t('pp.api.scene.skills', 'All skills covered'),
  t('pp.api.scene.tools', 'Tools ready'),
  t('pp.api.scene.cost', 'Low cost'),
];

// The seven feeds of the uses cut, in its 100 x 45 box: from the page's list to the ring.
const FEEDS = Array.from({ length: 7 }, (_, index) => {
  const y = (index * 45 + 22.5) / 7;
  return `M31 ${y}C38 ${y} 38 22.5 45 22.5`;
});

export default function ApiScene({ cut = 'menu', className = '' }) {
  const { t } = useT('pp');
  const task = t('pp.api.scene.task', 'Handle a customer escalation');
  return (
    <SceneStage product="api" cut={cut} className={className}>
      <svg className="pap-in" viewBox="0 0 100 45">
        {FEEDS.map((d) => (
          <g key={d}>
            <path d={d} />
            <path d={d} pathLength="100" />
          </g>
        ))}
      </svg>

      <p className="pap-task">
        <span className="ps-mono">{t('pp.api.scene.label', 'Task')}</span>
        {task}
      </p>

      <Win className="pap-win" bar={<span className="ps-mono">{ENDPOINT}</span>}>
        <div className="pap-code ps-mono">
          {request(task).map((line) => (
            <p key={line} className="pap-req" style={{ '--n': line.length }}>
              {line}
              <i />
            </p>
          ))}
          <p className="pap-ok" />
          <div className="pap-res">
            {RESPONSE.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            <i />
          </div>
        </div>
      </Win>

      <div className="pap-dia">
        <i className="pap-ring">
          {[12, 8, 6, 4].map((r) => (
            <svg key={r} viewBox="-12.5 -12.5 25 25">
              <circle r={r} />
            </svg>
          ))}
        </i>
        <svg viewBox="0 0 64 40">
          {[7, 20, 33, 7.01].map((y) => (
            <path key={y} d={`M17 20C22 20 21 ${y} 26 ${y}`} pathLength="1" />
          ))}
        </svg>
        {lanes(t).map(([icon, name]) => (
          <p key={name} className="pap-lane">
            <Icon name={icon} />
            {name}
            <i className="ps-tick" />
            <i className="pap-fill" />
          </p>
        ))}
      </div>

      <p className="pap-why">
        {reasons(t).map((reason) => (
          <Chip key={reason}>{reason}</Chip>
        ))}
      </p>
      <p className="pap-post ps-mono">{ENDPOINT}</p>
    </SceneStage>
  );
}

// The API page builds its full response around these lines (in this order).
ApiScene.lines = RESPONSE;
