import { useEffect, useId, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import './DesktopProductDemo.css';

const SCENES = {
  local: {
    chat: 'Local webhook prototype',
    folder: 'webhook-project',
    context: 'Webhook delivery design',
    skill: 'webhook-development',
    tools: ['Read project skill', 'Edit webhook-handler.js', 'Run local checks'],
    command: 'node --test webhook-handler.test.js',
    result: '✓ receives an event\n✓ ignores duplicate deliveries\n✓ retries a temporary failure',
  },
  n8n: {
    chat: 'Order workflow update',
    folder: 'order-automation',
    context: 'Order fulfilment workflow',
    skill: 'workflow-design',
    tools: ['Read order workflow', 'Add availability branch', 'Prepare workflow draft'],
    command: 'Order received → Stock lookup → Availability',
    result:
      'Available → Confirm order\nShortfall → Hold for team review\nOriginal workflow remains unchanged',
  },
  operations: {
    chat: 'Today’s operations brief',
    folder: 'operations',
    context: 'Orders and inventory',
    skill: 'operations-review',
    tools: ['Read orders and inventory', 'Reconcile available stock', 'Prepare team brief'],
    command: 'Item A · 10 on hand − 8 allocated = 2 available',
    result:
      'Order 1042 · 8 units allocated\nOrder 1043 · 4 requested, 2 available\nShortfall · 2 units',
  },
  role: {
    chat: 'Customer handover',
    folder: 'account-handover',
    context: 'Account manager playbook',
    skill: 'account-handover',
    tools: ['Read role playbook', 'Review supplied account notes', 'Draft customer handover'],
    command: 'Role context + account notes → Handover',
    result:
      'Responsibilities · Account continuity\nPreferences · Concise, practical updates\nNext action · Confirm the next check-in',
  },
  chat: {
    chat: 'Launch team brief',
    folder: 'launch-notes',
    context: 'Team launch updates',
    skill: 'team-briefing',
    tools: ['Read supplied team updates', 'Collect decisions and owners', 'Prepare launch brief'],
    command: 'Team updates → Decisions → Follow-ups',
    result:
      'Decision · Keep the preview scope small\nFollow-up · Review onboarding copy\nOpen question · Confirm launch timing',
  },
};

const NAVIGATION = [
  [AddRoundedIcon, 'New Chat'],
  [MenuBookOutlinedIcon, 'Recipes'],
  [CodeRoundedIcon, 'Skills'],
  [GridViewRoundedIcon, 'Apps'],
  [ScheduleRoundedIcon, 'Scheduler'],
  [TuneRoundedIcon, 'Extensions'],
  [HistoryRoundedIcon, 'Session History'],
];

// variant="instant" only: the dark app's menu, with thin line icons drawn on a 16px grid.
const INSTANT_NAVIGATION = [
  ['spark', 'Intelligence'],
  ['plug', 'Plugins'],
  ['tools', 'Instruments'],
  ['history', 'History'],
];

const LINE_ICONS = {
  newChat:
    'M3.2 2.8h9.6a1.2 1.2 0 0 1 1.2 1.2v6a1.2 1.2 0 0 1-1.2 1.2H8.4l-3 2.4v-2.4H3.2A1.2 1.2 0 0 1 2 10V4a1.2 1.2 0 0 1 1.2-1.2zM8 5v4M6 7h4',
  spark: 'M8 2.5l1.3 3.6 3.7 1.4-3.7 1.4L8 12.5 6.7 8.9 3 7.5l3.7-1.4zM12.2 11.2v2.3M11 12.4h2.4',
  plug: 'M6 2.5v3M10 2.5v3M4.5 5.5h7v2.2a3.5 3.5 0 0 1-7 0zM8 11.2v2.3',
  tools:
    'M3 13l5.2-5.2M9.2 3.6a2.8 2.8 0 0 0 3.2 3.9l-1.7-1.7.6-1.6 1.6-.6L11.2 1.9a2.8 2.8 0 0 0-2 1.7zM3.4 3.4l2.2 2.2',
  history: 'M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.6 2.8v2.4H5M8 5.2v3l2 1.2',
  clip: 'M12.6 7.4l-4.9 4.9a2.7 2.7 0 0 1-3.8-3.8l5.3-5.3a1.8 1.8 0 0 1 2.5 2.5L6.5 10.9a.9.9 0 0 1-1.2-1.2l4.5-4.5',
  sliders:
    'M3 5h5.5M11.5 5H13M3 11h1.5M7.5 11H13M8.5 5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0zM4.5 11a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z',
  mic: 'M8 2.5a1.8 1.8 0 0 0-1.8 1.8v3.4a1.8 1.8 0 0 0 3.6 0V4.3A1.8 1.8 0 0 0 8 2.5zM4.2 7.5a3.8 3.8 0 0 0 7.6 0M8 11.3v2.2',
};

function LineIcon({ name }) {
  return (
    <svg viewBox="0 0 16 16" className="opd-line-icon" aria-hidden="true" focusable="false">
      <path
        d={LINE_ICONS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A compact vector version of the existing line-orb mark, not a screenshot.
function OrqanixMark() {
  return (
    <svg viewBox="-50 -50 100 100" aria-hidden="true" className="opd-mark">
      {Array.from({ length: 24 }, (_, i) => (
        <line
          key={i}
          x1="25"
          y1="0"
          x2={41 + 4 * Math.sin((i * Math.PI) / 4)}
          y2="9"
          transform={`rotate(${i * 15})`}
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function WorkflowDocument() {
  return (
    <div className="opd-workflow" aria-label="Order workflow draft">
      {[
        ['01', 'Order received', 'Webhook trigger'],
        ['02', 'Look up stock', 'Inventory lookup'],
        ['03', 'Check availability', 'Available ≥ requested'],
      ].map(([number, label, detail]) => (
        <div className="opd-node-wrap" key={number}>
          <div className="opd-node">
            <span>{number}</span>
            <div>
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
          </div>
          <span className="opd-node-line" aria-hidden="true" />
        </div>
      ))}
      <div className="opd-branches">
        <div>
          <small>Yes</small>
          <strong>Confirm order</strong>
        </div>
        <div>
          <small>No</small>
          <strong>Team review</strong>
        </div>
      </div>
    </div>
  );
}

function OperationsDocument() {
  return (
    <>
      <p className="opd-document-kicker">Item A · Stock allocation</p>
      <p>
        <strong>10 on hand − 8 allocated = 2 available.</strong>
      </p>
      <table aria-label="Orders for item A" className="opd-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Units</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1042</td>
            <td>8</td>
            <td>Ready to fulfil</td>
          </tr>
          <tr>
            <td>1043</td>
            <td>4</td>
            <td>Review 2-unit shortfall</td>
          </tr>
        </tbody>
      </table>
      <p>
        Confirm a replenishment date for the two missing units before committing the second order.
      </p>
    </>
  );
}

function ArtifactDocument({ example, index, scene }) {
  const filename = example.files[index];
  let content;
  if (example.id === 'local' && index === 1) {
    content = (
      <pre className="opd-code">
        {
          'async function receiveEvent(event) {\n  if (await wasHandled(event.id)) {\n    return { duplicate: true };\n  }\n\n  await handleOnce(event);\n  return { accepted: true };\n}'
        }
      </pre>
    );
  } else if (example.id === 'local' && index === 2) {
    content = (
      <>
        <p>Local test output</p>
        <pre className="opd-code">{`$ ${scene.command}\n\n${scene.result}`}</pre>
      </>
    );
  } else if (example.id === 'n8n' && index === 0) {
    content = (
      <>
        <WorkflowDocument />
        <p>Route low-stock orders to a person before sending a confirmation.</p>
      </>
    );
  } else if (example.id === 'n8n' && index === 2) {
    content = (
      <>
        <h4>Before connecting</h4>
        <p>
          Select your n8n workspace and inventory connection. Credentials belong in the connection
          settings, not the workflow file.
        </p>
        <h4>Apply the change</h4>
        <p>
          Review the added lookup and branch, then choose when to activate the revised workflow.
        </p>
      </>
    );
  } else if (example.id === 'operations' && index === 0) {
    content = <OperationsDocument />;
  } else if (example.id === 'operations') {
    content = (
      <pre className="opd-code">
        {index === 1
          ? 'order,item,requested,allocated\n1042,A,8,8\n1043,A,4,0'
          : 'item,on_hand,allocated,available\nA,10,8,2'}
      </pre>
    );
  } else if (example.id === 'role' && index === 1) {
    content = (
      <>
        <h4>Responsibilities</h4>
        <p>Keep account context current and make ownership of the next action clear.</p>
        <h4>Preferences</h4>
        <p>Use short, practical updates. Separate confirmed commitments from open questions.</p>
        <h4>Handover routine</h4>
        <p>Summarize the account, outstanding questions, and the next customer check-in.</p>
      </>
    );
  } else if (example.id === 'role' && index === 2) {
    content = (
      <>
        <h4>Account notes</h4>
        <p>The customer is preparing a small pilot. The team has shared an onboarding draft.</p>
        <h4>Next conversation</h4>
        <p>Ask who will own the pilot and agree a check-in date.</p>
      </>
    );
  } else if (example.id === 'chat' && index === 2) {
    content = (
      <>
        <h4>Product update</h4>
        <p>Keep this release focused on the preview experience.</p>
        <h4>Team follow-up</h4>
        <p>Review the onboarding copy before the next check-in.</p>
        <h4>Open question</h4>
        <p>What launch timing works for the team?</p>
      </>
    );
  } else {
    content = (
      <>
        <h4>{example.artifactTitle}</h4>
        <ul>
          {example.artifactLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h4>Next step</h4>
        <p>{example.footer}</p>
      </>
    );
  }
  return (
    <article className="opd-document" aria-label={filename}>
      <p className="opd-document-kicker">Saved in this conversation</p>
      <h3>{filename.replace(/\.(md|json|csv|js)$/, '')}</h3>
      {content}
    </article>
  );
}

// variant="instant" only: New Chat, the chat lists, then the four sections at the foot.
function InstantSidebar({ chat }) {
  return (
    <aside className="opd-sidebar" aria-label="Desktop navigation preview">
      <div className="opd-traffic" aria-hidden="true">
        <i />
        <i />
        <i />
        <ViewSidebarOutlinedIcon />
      </div>
      <div className="opd-sidebar-brand">
        <OrqanixMark />
        <span>Orqanix</span>
      </div>
      <div className="opd-nav">
        <div className="opd-nav-item">
          <LineIcon name="newChat" />
          <span>New Chat</span>
        </div>
      </div>
      <div className="opd-chat-list">
        <span className="opd-section-label">RECENT</span>
        <div className="opd-chat-selected">
          <span>{chat}</span>
          <i />
        </div>
        <div>
          <span>Getting started</span>
        </div>
        <span className="opd-section-label">PINNED</span>
        <div>
          <span>Brand guide</span>
        </div>
      </div>
      <div className="opd-nav opd-nav-foot">
        {INSTANT_NAVIGATION.map(([icon, label]) => (
          <div className="opd-nav-item" key={label}>
            <LineIcon name={icon} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="opd-sidebar-bottom">
        <SettingsOutlinedIcon /> Settings
      </div>
    </aside>
  );
}

export default function DesktopProductDemo({ example, variant = 'classic' }) {
  const instant = variant === 'instant';
  const scene = SCENES[example.id] ?? SCENES.local;
  const workspaceId = useId();
  const isMobile = useMediaQuery('(max-width: 600px)');
  const [desktopWorkspaceOpen, setDesktopWorkspaceOpen] = useState(true);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [artifact, setArtifact] = useState(null);
  const [playback, setPlayback] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const inWalkthrough = playback === 'playing' || playback === 'paused';
  const workspaceOpen =
    (isMobile ? mobileWorkspaceOpen : desktopWorkspaceOpen) || (inWalkthrough && elapsed >= 5400);
  const phase = !inWalkthrough
    ? 4
    : elapsed < 1800
      ? 0
      : elapsed < 2700
        ? 1
        : elapsed < 3600
          ? 2
          : elapsed < 4600
            ? 3
            : 4;
  const openArtifact = inWalkthrough && elapsed >= 5400 ? 0 : artifact;

  useEffect(() => {
    if (playback !== 'playing') return undefined;
    const startedAt = Date.now() - elapsed;
    const timer = window.setInterval(() => {
      const next = Math.min(Date.now() - startedAt, 6400);
      setElapsed(next);
      if (next === 6400) {
        window.clearInterval(timer);
        setArtifact(0);
        setMobileWorkspaceOpen(true);
        setPlayback('complete');
      }
    }, 80);
    return () => window.clearInterval(timer);
    // Start a clock only when playback starts/resumes, not on every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback]);

  function toggleWalkthrough() {
    if (playback === 'playing') {
      setPlayback('paused');
      return;
    }
    setDesktopWorkspaceOpen(true);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setArtifact(0);
      setMobileWorkspaceOpen(true);
      setPlayback('complete');
      return;
    }
    if (playback !== 'paused') {
      setElapsed(0);
      setArtifact(null);
      setMobileWorkspaceOpen(false);
    }
    setPlayback('playing');
  }

  function inspectArtifact(index) {
    setPlayback('idle');
    setArtifact(index);
    setDesktopWorkspaceOpen(true);
    setMobileWorkspaceOpen(true);
  }

  function closeWorkspace() {
    setPlayback('idle');
    setDesktopWorkspaceOpen(false);
    setMobileWorkspaceOpen(false);
  }

  function showWorkspace() {
    setDesktopWorkspaceOpen(true);
    setMobileWorkspaceOpen(true);
  }

  const playLabel =
    playback === 'playing'
      ? 'Pause walkthrough'
      : playback === 'paused'
        ? 'Resume walkthrough'
        : playback === 'complete'
          ? 'Replay walkthrough'
          : 'Play walkthrough';

  return (
    <div className={instant ? 'opd opd-dark' : 'opd'} data-playback={playback}>
      <div
        className={`opd-window ${workspaceOpen ? 'opd-has-workspace' : ''}`}
        aria-label="Interactive Orqanix desktop example"
      >
        {instant ? (
          <InstantSidebar chat={scene.chat} />
        ) : (
          <aside className="opd-sidebar" aria-label="Desktop navigation preview">
            <div className="opd-traffic" aria-hidden="true">
              <i />
              <i />
              <i />
              <ViewSidebarOutlinedIcon />
            </div>
            <div className="opd-sidebar-brand">
              <OrqanixMark />
              <span>
                Orqanix<small>Built on Goose</small>
              </span>
            </div>
            <div className="opd-nav">
              {NAVIGATION.map((item) => {
                const [Icon, label] = item;
                return (
                  <div className="opd-nav-item" key={label}>
                    <Icon />
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="opd-chat-list">
              <span className="opd-section-label">Chats</span>
              <div className="opd-chat-selected">
                {scene.chat}
                <i />
              </div>
              <div>Getting started</div>
            </div>
            <div className="opd-sidebar-bottom">
              <SettingsOutlinedIcon /> Settings
            </div>
          </aside>
        )}

        <header className="opd-titlebar">
          <span className="opd-title">
            {scene.chat}
            <KeyboardArrowDownRoundedIcon />
          </span>
          <div className="opd-title-actions">
            <span className="opd-brand">
              <OrqanixMark /> Orqanix
            </span>
            <button
              type="button"
              aria-label={workspaceOpen ? 'Hide workspace' : 'Open workspace'}
              aria-expanded={workspaceOpen}
              aria-controls={workspaceId}
              onClick={workspaceOpen ? closeWorkspace : showWorkspace}
            >
              <ViewSidebarOutlinedIcon />
            </button>
          </div>
        </header>

        <div className="opd-chat">
          <div className="opd-messages">
            {phase === 0 ? (
              <div className="opd-start">
                <OrqanixMark />
                <h3>What would you like to work on?</h3>
                <p>Your project, conversation, and useful context. Together.</p>
              </div>
            ) : (
              <>
                <div className="opd-user-message">{example.request}</div>
                <div className="opd-assistant-intro">
                  {inWalkthrough && phase < 4
                    ? 'Orqanix is working…'
                    : 'I’ll use the context in this workspace and keep the useful outputs here.'}
                </div>
                <div className="opd-tool-stack" aria-label="Example tool activity">
                  {scene.tools
                    .slice(0, phase === 1 ? 1 : phase === 2 ? 2 : 3)
                    .map((tool, index) => (
                      <details className="opd-tool" key={tool} open={index === 2}>
                        <summary>
                          <TerminalRoundedIcon />
                          <span>{tool}</span>
                          <CheckRoundedIcon className="opd-tool-check" />
                          <KeyboardArrowRightRoundedIcon className="opd-tool-chevron" />
                        </summary>
                        <pre>
                          {index === 0
                            ? `.goose/skills/${scene.skill}/SKILL.md`
                            : index === 1
                              ? scene.command
                              : scene.result}
                        </pre>
                      </details>
                    ))}
                </div>
                {phase >= 4 && (
                  <div className="opd-assistant-reply">
                    <p>{example.reply}</p>
                    <button
                      type="button"
                      className="opd-inline-artifact"
                      onClick={() => inspectArtifact(0)}
                    >
                      <DescriptionOutlinedIcon />
                      <span>{example.files[0]}</span>
                      <KeyboardArrowRightRoundedIcon />
                    </button>
                    <p className="opd-next-step">{example.footer}</p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="opd-composer" aria-label="Example message composer">
            <div className="opd-input-copy">
              {phase === 0 ? (
                <>
                  {example.request.slice(
                    0,
                    Math.floor(Math.min(elapsed / 1450, 1) * example.request.length)
                  )}
                  <span className="opd-type-caret" />
                </>
              ) : instant ? (
                "Ask whatever's on your mind."
              ) : (
                'What would you like to do next?'
              )}
            </div>
            <div className="opd-composer-controls">
              {instant ? (
                <>
                  <LineIcon name="clip" />
                  <LineIcon name="sliders" />
                </>
              ) : (
                <span>
                  <OrqanixMark /> Gemini
                </span>
              )}
              <span>
                <FolderOpenOutlinedIcon />
                {scene.folder}
              </span>
              <span className="opd-composer-spacer" />
              {instant ? (
                <LineIcon name="mic" />
              ) : (
                <>
                  <TuneRoundedIcon />
                  <AddRoundedIcon />
                </>
              )}
              <span className="opd-send" aria-hidden="true">
                <ArrowUpwardRoundedIcon />
              </span>
            </div>
          </div>
        </div>

        {workspaceOpen && (
          <aside
            className="opd-workspace"
            id={workspaceId}
            aria-label="Example workspace documents and results"
          >
            <div className="opd-workspace-header">
              {openArtifact !== null ? (
                <button
                  type="button"
                  className="opd-back"
                  aria-label="Back to workspace"
                  onClick={() => {
                    setPlayback('idle');
                    setArtifact(null);
                  }}
                >
                  <ArrowBackRoundedIcon />
                  <span>{example.files[openArtifact]}</span>
                </button>
              ) : (
                <h3>Workspace</h3>
              )}
              <button type="button" aria-label="Close workspace" onClick={closeWorkspace}>
                <CloseRoundedIcon />
              </button>
            </div>
            <div className="opd-workspace-body">
              {openArtifact !== null ? (
                <ArtifactDocument example={example} index={openArtifact} scene={scene} />
              ) : (
                <>
                  <section>
                    <h4>Now</h4>
                    <p>
                      <span className="opd-ready-dot" />
                      {inWalkthrough ? example.activity : 'Ready for your next request'}
                    </p>
                  </section>
                  <section>
                    <h4>Project context</h4>
                    <p className="opd-folder">
                      <FolderOpenOutlinedIcon />
                      <span>{scene.folder}</span>
                    </p>
                    <p>{scene.context}</p>
                    <small>Context for this conversation</small>
                  </section>
                  <section>
                    <h4>
                      Documents &amp; results <span>{example.files.length}</span>
                    </h4>
                    <div className="opd-artifact-list">
                      {example.files.map((file, index) => (
                        <button
                          type="button"
                          key={file}
                          aria-label={`Open ${file}`}
                          onClick={() => inspectArtifact(index)}
                        >
                          <DescriptionOutlinedIcon />
                          <span>
                            {file}
                            <small>{index === 0 ? 'Document' : 'Project file'}</small>
                          </span>
                          <KeyboardArrowRightRoundedIcon />
                        </button>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h4>Tools &amp; results</h4>
                    <p className="opd-result">
                      <CheckRoundedIcon />
                      {scene.tools[2]}
                    </p>
                  </section>
                  <section>
                    <h4>Skills loaded</h4>
                    <p className="opd-folder">
                      <CodeRoundedIcon />
                      <span>{scene.skill}</span>
                    </p>
                  </section>
                </>
              )}
            </div>
          </aside>
        )}

        {inWalkthrough && (
          <svg
            className="opd-cursor"
            style={{ animationPlayState: playback === 'paused' ? 'paused' : 'running' }}
            viewBox="0 0 28 32"
            aria-hidden="true"
          >
            <path d="M3 2v24l6-7 5 11 5-2-5-10h10Z" fill="#25282e" stroke="white" strokeWidth="2" />
          </svg>
        )}
      </div>
      <div className="opd-demo-controls">
        <p>
          Interactive product demo <span>·</span> example content
        </p>
        <span className="opd-attribution">Built on Goose</span>
        <button type="button" onClick={toggleWalkthrough}>
          {playback === 'playing' ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
          {playLabel}
        </button>
      </div>
      <span className="opd-sr-only" role="status">
        {playback === 'playing'
          ? 'Playing example walkthrough'
          : playback === 'paused'
            ? 'Walkthrough paused'
            : playback === 'complete'
              ? 'Walkthrough complete. The example document is open.'
              : ''}
      </span>
    </div>
  );
}
