import More from './ui/More';
import Reveal from './ui/Reveal';
import { Seen } from './SpeedStrip';
import { DEVELOPER_EARLY_LINES, DEVELOPER_LINES } from './capabilities.data';
import './sections.css';

const COLUMNS = [
  { id: 'instant-developers-today', tag: 'Today', lines: DEVELOPER_LINES },
  { id: 'instant-developers-early', tag: 'Early, needs setup', lines: DEVELOPER_EARLY_LINES },
];

export default function DevelopersMore() {
  return (
    <section aria-label="For developers" className="oi-section-tight ois-section ois-developers">
      <Seen className="ois-gate oi-container ois-centered">
        <Reveal>
          <More label="More for developers" openLabel="Less">
            <div className="ois-dev-columns">
              {COLUMNS.map((column) => (
                <div key={column.id} className="ois-dev-column">
                  <p id={column.id} className="oi-tag">
                    {column.tag}
                  </p>
                  <ul className="ois-spec" aria-labelledby={column.id}>
                    {column.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </More>
        </Reveal>
      </Seen>
    </section>
  );
}
