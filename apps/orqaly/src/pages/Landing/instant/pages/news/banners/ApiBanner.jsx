import BannerStage, { Words } from './BannerStage';
import './api.css';

// The decision that streams back: [indent, key, value, tail]. Ranks only, no scores; the
// fields are the ones the orchestration API returns (AXWISE_ORCHESTRATION_PHASE_1.md).
const RESPONSE = [
  [0, '', '', '{'],
  [1, 'candidates', '', '['],
  [2, '', '#1 research-agent', ','],
  [2, '', '#2 analyst-team', ''],
  [1, '', '', '],'],
  [1, 'guardrails', '', '['],
  [2, '', 'approval before sending', ''],
  [1, '', '', '],'],
  [1, 'fallback', 'person', ''],
  [0, '', '', '}'],
];

const PICK = 2;

function Dots() {
  return (
    <>
      <i />
      <i />
      <i />
    </>
  );
}

/*
 * A business API, in one loop: a request is typed and sent, the decision streams back line
 * by line (ranked candidates, a guardrail, a fallback), and a pulse carries the pick into
 * the customer's own product, whose task card turns to "Assigned: research agent".
 */
export default function ApiBanner({ className = '' }) {
  return (
    <BannerStage scene="api" className={`nb-api ${className}`}>
      <span className="nb-api-glow" />
      <div className="nb-api-flow">
        <div className="nb-window nb-api-win nb-api-req">
          <div className="nb-window-bar">
            <Dots />
            <span className="nb-api-label nb-mono">
              <Words of="request" />
            </span>
            <span className="nb-api-send">
              <svg viewBox="0 0 16 16" className="nb-icon">
                <path d="M3.5 8h9M8.5 4l4 4-4 4" />
              </svg>
            </span>
          </div>
          <ol className="nb-api-code nb-mono">
            <li>
              <span className="nb-type nb-api-type-a" style={{ '--n': 32 }}>
                <Words of="POST" className="nb-api-verb" />
                <Words of="/v1/orchestration/decisions" />
              </span>
              <span className="nb-api-caret nb-api-caret-a">
                <i className="nb-caret" />
              </span>
            </li>
            <li>
              <span className="nb-type nb-api-type-b" style={{ '--n': 38 }}>
                <Words of="{" />
                <Words of='"task":' className="nb-api-key" />
                <Words of='"Check supplier contracts"' className="nb-api-str" />
                <Words of="}" />
              </span>
              <span className="nb-api-caret nb-api-caret-b">
                <i className="nb-caret" />
              </span>
            </li>
          </ol>
        </div>

        <span className="nb-api-wire nb-api-wire-send">
          <i className="nb-api-streak" />
        </span>

        <div className="nb-window nb-api-win nb-api-res">
          <div className="nb-window-bar">
            <Dots />
            <span className="nb-api-label nb-mono">
              <Words of="response" />
            </span>
          </div>
          <span className="nb-api-progress" />
          <ol className="nb-api-code nb-api-stream nb-mono">
            {RESPONSE.map(([indent, key, value, tail], index) => (
              <li
                key={index}
                className={index === PICK ? 'nb-api-pick' : undefined}
                style={{ '--i': index, '--in': indent }}
              >
                {key && <Words of={`"${key}":`} className="nb-api-key" />}
                {value && <Words of={`"${value}"`} className="nb-api-str" />}
                {tail && <Words of={tail} />}
              </li>
            ))}
          </ol>
        </div>

        <span className="nb-api-wire nb-api-wire-pass">
          <i className="nb-api-streak" />
        </span>

        <div className="nb-window nb-api-win nb-api-app">
          <div className="nb-window-bar">
            <Dots />
            <span className="nb-api-label">
              <Words of="Your product" />
            </span>
          </div>
          <div className="nb-api-app-body">
            <span className="nb-api-nav">
              <b />
              <b />
              <b />
            </span>
            <div className="nb-api-cards">
              <div className="nb-api-card">
                <span className="nb-api-task">
                  <Words of="Check supplier contracts" />
                </span>
                <span className="nb-api-status">
                  <span className="nb-api-skel" />
                  <span className="nb-api-assigned">
                    <span className="nb-tick">
                      <svg viewBox="0 0 16 16">
                        <path d="M3.5 8.5 6.5 11.5 12.5 5" />
                      </svg>
                    </span>
                    <Words of="Assigned: research agent" />
                  </span>
                </span>
              </div>
              <span className="nb-api-ghost" />
              <span className="nb-api-ghost" />
            </div>
          </div>
        </div>
      </div>
    </BannerStage>
  );
}
