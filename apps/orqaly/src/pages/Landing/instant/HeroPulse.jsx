import { useEffect, useState } from 'react';
import { CheckGlyph } from './ui/Glyphs';
import { useT } from './i18n/useT';
import './HeroPulse.css';

export const PULSE_LINK_LABEL =
  'Orqanix at work: you ask in plain words, AI agents research, plan and build, and the finished files appear on your Mac. Jump to the interactive demo.';

const ICON_PATHS = {
  mic: 'M8 2.5a1.8 1.8 0 0 0-1.8 1.8v3.4a1.8 1.8 0 0 0 3.6 0V4.3A1.8 1.8 0 0 0 8 2.5zM4.2 7.5a3.8 3.8 0 0 0 7.6 0M8 11.3v2.2',
  spark: 'M8 2.5l1.3 3.6 3.7 1.4-3.7 1.4L8 12.5 6.7 8.9 3 7.5l3.7-1.4zM12.2 11.2v2.3M11 12.4h2.4',
  plug: 'M6 2.5v3M10 2.5v3M4.5 5.5h7v2.2a3.5 3.5 0 0 1-7 0zM8 11.2v2.3',
  chevron: 'M5.5 6.5L8 9l2.5-2.5',
  doc: 'M4.5 2.5H9l3 3v8H4.5zM9 2.5v3h3M6.5 8.5h3M6.5 10.8h3',
  sheet: 'M3 3.5h10v9H3zM3 6.5h10M3 9.5h10M6.5 3.5v9',
  web: 'M2.5 3.5h11v9h-11zM2.5 6h11M6.3 8.3 4.8 9.6l1.5 1.3M9.7 8.3l1.5 1.3-1.5 1.3',
};

// Each ask is something a founder would say, and its files are kinds the app really makes:
// documents, tables and web pages.
export const SCENES = [
  {
    id: 'roastery',
    ask: 'Plan my coffee roastery.',
    model: 'Gemini',
    files: [
      ['doc', 'business-plan.md'],
      ['doc', 'market-research.md'],
      ['sheet', 'costs.csv'],
      ['web', 'landing-page.html'],
    ],
  },
  {
    id: 'proposal',
    ask: 'Prepare a proposal for my new client.',
    model: 'OpenAI',
    files: [
      ['doc', 'proposal.md'],
      ['sheet', 'quote.csv'],
      ['doc', 'follow-up-email.md'],
      ['web', 'one-page.html'],
    ],
  },
  {
    id: 'marketing',
    ask: "Write this week's marketing content.",
    model: 'Anthropic',
    files: [
      ['doc', 'content-plan.md'],
      ['doc', 'five-posts.md'],
      ['web', 'newsletter.html'],
      ['sheet', 'results.csv'],
    ],
  },
];

export const AGENTS = ['Research', 'Plan', 'Build'];

/** The translation key of a scene's ask. */
export function askKey(id) {
  return `pulse.ask.${id}`;
}

/** The translation key of an agent's name. */
export function agentKey(name) {
  return `pulse.agent.${name.toLowerCase()}`;
}

// ask: the words are typed. 1-3: that agent is working. made: the files land. leave: fade.
const PHASES = ['ask', 1, 2, 3, 'made', 'leave'];
const DWELL = { 1: 950, 2: 950, 3: 1100, made: 3800, leave: 650 };
const TYPE_START_MS = 900;
const TYPE_MS = 46;
const TYPE_REST_MS = 520;

function reducedMotion() {
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 16 16" className="hp-icon" aria-hidden="true" focusable="false">
      <path
        d={ICON_PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function agentState(phase, index) {
  if (phase === 'made') return 'done';
  if (typeof phase !== 'number') return 'idle';
  if (index + 1 < phase) return 'done';
  return index + 1 === phase ? 'now' : 'idle';
}

/**
 * The hero's moving picture: one ask, three agents, the finished files. The real app
 * window is the next block down, so this shows what the app is for rather than how it
 * looks. It is one link to the demo with a written label; its insides are hidden from
 * assistive tech and hold nothing focusable. With reduced motion it rests on the first
 * finished scene.
 */
export default function HeroPulse({ paused = false }) {
  const { t } = useT();
  const [still, setStill] = useState(reducedMotion);
  const [scene, setScene] = useState(0);
  const [phase, setPhase] = useState('ask');
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    const list = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!list?.addEventListener) return undefined;
    const update = () => setStill(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);

  const { id, ask: english, model, files } = SCENES[still ? 0 : scene];
  // The typing runs on the translated words, so its length is theirs.
  const ask = t(askKey(id), english);
  const shownPhase = still ? 'made' : phase;
  const shownText = still ? ask : ask.slice(0, typed);

  useEffect(() => {
    if (still || paused) return undefined;
    let delay;
    let next;
    if (phase === 'ask' && typed < ask.length) {
      delay = typed === 0 ? TYPE_START_MS : TYPE_MS;
      next = () => setTyped((count) => count + 1);
    } else if (phase === 'leave') {
      delay = DWELL.leave;
      next = () => {
        setTyped(0);
        setPhase('ask');
        setScene((current) => (current + 1) % SCENES.length);
      };
    } else {
      delay = phase === 'ask' ? TYPE_REST_MS : DWELL[phase];
      next = () => setPhase(PHASES[PHASES.indexOf(phase) + 1]);
    }
    const timer = setTimeout(next, delay);
    return () => clearTimeout(timer);
  }, [still, paused, phase, typed, ask]);

  return (
    <a
      className="hp-link"
      href="#watch"
      dir="ltr"
      aria-label={t(
        'pulse.link',
        'Orqanix at work: you ask in plain words, AI agents research, plan and build, and the finished files appear on your Mac. Jump to the interactive demo.'
      )}
    >
      <div className="hp-scene" data-phase={shownPhase} aria-hidden="true">
        <div className="hp-ask">
          <div className="hp-ask-row" data-region="ready">
            <p className="hp-ask-text">
              {shownText ? (
                <>
                  {shownText}
                  <i className="hp-caret" />
                </>
              ) : (
                <>
                  <i className="hp-caret" />
                  <span className="hp-placeholder">
                    {t('pulse.placeholder', "Ask whatever's on your mind.")}
                  </span>
                </>
              )}
            </p>
            <span className="hp-mic" data-region="voice">
              <Icon name="mic" />
            </span>
          </div>
          <div className="hp-tools">
            <span className="hp-tool" data-region="llms">
              <Icon name="spark" />
              <span key={model} className="hp-model">
                {model}
              </span>
              <Icon name="chevron" />
            </span>
            <span className="hp-tool" data-region="plugins">
              <Icon name="plug" />
              {t('pulse.plugins', '50+ plug-ins')}
            </span>
          </div>
        </div>

        <div className="hp-flow">
          <ol className="hp-agents" data-region="orchestration">
            {AGENTS.map((name, index) => (
              <li key={name} className="hp-agent" data-state={agentState(shownPhase, index)}>
                <span className="hp-node">
                  <CheckGlyph className="hp-node-check" />
                </span>
                <span className="hp-agent-name">{t(agentKey(name), name)}</span>
              </li>
            ))}
          </ol>
          <p className="hp-layers" data-region="layering">
            <span>{t('pulse.cloud', 'Thinks in the cloud')}</span>
            <i />
            <span>{t('pulse.mac', 'Works on your Mac')}</span>
          </p>
        </div>

        <div className="hp-made" data-region="build">
          <span className="hp-burst" />
          <ul key={scene} className="hp-files">
            {files.map(([kind, name], index) => (
              <li key={name} className="hp-file" style={{ '--hp-i': index }}>
                <span className="hp-file-icon">
                  <Icon name={kind} />
                </span>
                <span className="hp-file-name">{name}</span>
                <span className="hp-file-tag">{t('pulse.new', 'New')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </a>
  );
}
