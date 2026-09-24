import { OrqanixMark } from '../../../ui/Glyphs';
import BannerStage, { Words } from './BannerStage';
import './chat.css';

// A teammate asks Orqanix in the team chat, then in an email thread; it answers in both.
// All motion lives in chat.css on the shared 12s clock.
const ASK = 'list oat-milk suppliers in Estonia';
const DRAFT = 'Here is the draft.';

const PATHS = {
  chat: 'M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z',
  mail: 'M2.5 4h11v8.5h-11zM2.5 4.8 8 9l5.5-4.2',
  file: 'M4.5 2.5H9l3 3v8H4.5zM9 2.5v3h3',
  send: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7',
  tick: 'M3.5 8.5l3 3 6-6.5',
};

const TABS = [
  ['chat', 'Messenger'],
  ['mail', 'Email'],
];

function Icon({ name, className = 'nb-icon' }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}

function Bot({ id }) {
  return (
    <span className="nb-chat-avatar nb-chat-bot">
      <OrqanixMark className={`nb-chat-mark nb-chat-mark-${id}`} />
    </span>
  );
}

// A file the bot attaches: a bar runs while it is written, then a tick.
function File({ id, name }) {
  return (
    <span className={`nb-file nb-chat-file nb-chat-file-${id}`}>
      <span className="nb-file-icon">
        <Icon name="file" />
      </span>
      <span className="nb-mono nb-chat-file-name">
        <Words of={name} />
      </span>
      <span className="nb-tick">
        <Icon name="tick" className="" />
      </span>
      <i className="nb-chat-bar" />
    </span>
  );
}

const Lines = ({ count }) => (
  <span className="nb-chat-lines">
    {Array.from({ length: count }, (_, i) => (
      <i key={i} />
    ))}
  </span>
);

export default function ChatBanner({ className = '' }) {
  return (
    <BannerStage scene="chat" className={`nb-chat ${className}`}>
      <i className="nb-chat-glow" />

      <div className="nb-chat-tabs">
        <i className="nb-chat-thumb" />
        {TABS.map(([icon, label]) => (
          <span key={icon} className={`nb-chat-tab nb-chat-tab-${icon}`}>
            <Icon name={icon} />
            <Words of={label} />
            {icon === 'mail' && <i className="nb-chat-badge" />}
          </span>
        ))}
      </div>

      <div className="nb-window nb-chat-window">
        <div className="nb-window-bar">
          <i />
          <i />
          <i />
        </div>
        <div className="nb-chat-view">
          <div className="nb-chat-track">
            <div className="nb-chat-pane">
              <div className="nb-chat-head">
                <span className="nb-chat-hash">
                  <Words n={1} />
                </span>
                <Words of="team" />
              </div>
              <div className="nb-chat-thread">
                <div className="nb-chat-row nb-chat-old">
                  <span className="nb-chat-avatar" />
                  <Lines count={2} />
                </div>
                <div className="nb-chat-row nb-chat-ask">
                  <span className="nb-chat-avatar" />
                  <span className="nb-bubble nb-bubble-me">
                    <Words of="@Orqanix" className="nb-chat-at" />
                    <Words of={ASK} />
                  </span>
                </div>
                <div className="nb-chat-row nb-chat-answer">
                  <Bot id="a" />
                  <div className="nb-chat-stack">
                    <span className="nb-chat-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    <div className="nb-chat-reply">
                      <span className="nb-bubble">
                        <Words of="Here is the list." />
                      </span>
                      <File id="a" name="suppliers.csv" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="nb-chat-compose">
                <span className="nb-chat-field">
                  <span className="nb-chat-hint">
                    <Words of="Message #team" />
                  </span>
                  <span className="nb-chat-typed">
                    <span className="nb-type" style={{ '--n': 43 }}>
                      <Words of="@Orqanix" className="nb-chat-at" />
                      <Words of={ASK} />
                    </span>
                    <i className="nb-caret" />
                  </span>
                </span>
                <span className="nb-chat-send">
                  <Icon name="send" />
                </span>
              </div>
            </div>

            <div className="nb-chat-pane">
              <div className="nb-chat-head nb-chat-subject">
                <Words of="Re: Q3 plan" />
              </div>
              <div className="nb-chat-mails">
                <div className="nb-chat-mail">
                  <span className="nb-chat-from">
                    <span className="nb-chat-avatar" />
                    <Lines count={1} />
                  </span>
                  <span className="nb-chat-body">
                    <Words of="@Orqanix" className="nb-chat-at" />
                    <Lines count={2} />
                  </span>
                </div>
                <div className="nb-chat-mail nb-chat-mail-bot">
                  <span className="nb-chat-from">
                    <Bot id="b" />
                    <Words of="Orqanix" />
                  </span>
                  <span className="nb-chat-body">
                    <span className="nb-type nb-chat-draft" style={{ '--n': DRAFT.length }}>
                      <Words of={DRAFT} />
                    </span>
                    <span className="nb-chat-caret">
                      <i className="nb-caret" />
                    </span>
                  </span>
                  <File id="b" name="q3-plan.md" />
                </div>
              </div>
              <span className="nb-chat-replybox">
                <Words of="Reply" />
                <Icon name="send" />
              </span>
            </div>
          </div>
        </div>
        <i className="nb-chat-sheen" />
      </div>
    </BannerStage>
  );
}
