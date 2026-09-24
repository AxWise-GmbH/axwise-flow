import More from './ui/More';
import Reveal from './ui/Reveal';
import { Seen } from './SpeedStrip';
import { DEVELOPER_EARLY_LINES, DEVELOPER_LINES } from './capabilities.data';
import { localeWords, localize } from './i18n/localize';
import { useT } from './i18n/useT';
import './sections.css';

const COLUMNS = [
  { id: 'instant-developers-today', words: 'today', tag: 'Today', lines: DEVELOPER_LINES },
  {
    id: 'instant-developers-early',
    words: 'early',
    tag: 'Early, needs setup',
    lines: DEVELOPER_EARLY_LINES,
  },
];

// Words in other languages: pg.dev.<words>.tag and pg.dev.<words>.lines.<n>.
const columnWords = ({ tag, lines }) => ({ tag, lines });

export function developerWords() {
  return Object.assign(
    {},
    ...COLUMNS.map((column) => localeWords(columnWords(column), `pg.dev.${column.words}`))
  );
}

export default function DevelopersMore() {
  const { t } = useT('pg');
  const columns = COLUMNS.map((column) => ({
    ...column,
    ...localize(columnWords(column), `pg.dev.${column.words}`, t),
  }));
  return (
    <section
      aria-label={t('pg.dev.label', 'For developers')}
      className="oi-section-tight ois-section ois-developers"
    >
      <Seen className="ois-gate oi-container ois-centered">
        <Reveal>
          <More label={t('pg.dev.more', 'More for developers')} openLabel={t('more.less', 'Less')}>
            <div className="ois-dev-columns">
              {columns.map((column) => (
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
