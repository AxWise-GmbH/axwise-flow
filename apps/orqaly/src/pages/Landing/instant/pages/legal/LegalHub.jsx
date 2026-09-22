import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { COMPANY } from '../info/company';
import { useT } from '../../i18n/useT';
import { Sentence } from './LegalBlocks';
import RegionSwitch, { RegionSuggestion } from './RegionSwitch';
import { LEGAL_GROUPS, LEGAL_PRODUCTS, PUBLISHED_DOCS, legalNames, legalPath } from './legal.links';

const ALL = 'all';
const CHIPS = [ALL, ...LEGAL_PRODUCTS.map(({ id }) => id)];

export function Arrow({ className = 'olg-arrow' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path d="M4 12L12 4M6 4h6v6" />
    </svg>
  );
}

/**
 * The Legal Center, laid out like x.ai/legal: a group label on the left, then one row per
 * document (title, a hairline, ↗). On top, the US / EU switch and one chip per product; a
 * chip keeps only the documents that product uses.
 */
export default function LegalHub({ region, suggest, onChoose }) {
  const { t } = useT('lg');
  const names = legalNames(t);
  const [product, setProduct] = useState(ALL);
  const docs = PUBLISHED_DOCS.filter(
    (doc) => doc.regions.includes(region) && (product === ALL || doc.products.includes(product))
  );
  const onlyLabel = (doc) =>
    doc.regions.length === 1
      ? t('lg.only', '{region} only', { region: names.regionLabel(doc.regions[0]) })
      : null;

  return (
    <section className="oi-section olg olg-hub" aria-labelledby="legal-heading">
      <div className="oi-container">
        <header className="olg-hub-head">
          <div className="olg-hub-title">
            <h1 className="olg-h1" id="legal-heading">
              {t('lg.title', 'Legal')}
            </h1>
            <p className="olg-lede">{t('lg.lede', 'The rules for Orqanix, in plain words.')}</p>
          </div>
          <RegionSwitch region={region} onChoose={onChoose} />
        </header>

        <RegionSuggestion suggest={suggest} region={region} onChoose={onChoose} />

        <div className="olg-chips" role="group" aria-label={t('lg.chips', 'Show documents for')}>
          {CHIPS.map((id) => (
            <button
              type="button"
              key={id}
              className="olg-chip"
              aria-pressed={product === id}
              onClick={() => setProduct(id)}
            >
              {id === ALL ? t('lg.all', 'All') : names.product(id)}
            </button>
          ))}
        </div>

        {/* A new key per view replays the rows' arrival, so a filter visibly re-sorts. */}
        <div className="olg-groups" key={`${region}-${product}`}>
          {LEGAL_GROUPS.map(({ id }) => {
            const rows = docs.filter((doc) => doc.group === id);
            if (!rows.length) return null;
            return (
              <section className="olg-group" key={id} aria-labelledby={`legal-group-${id}`}>
                <h2 className="olg-group-label" id={`legal-group-${id}`}>
                  {names.group(id)}
                </h2>
                <ul className="olg-rows">
                  {rows.map((doc, index) => (
                    <li key={doc.slug} style={{ '--olg-i': index }}>
                      <RouterLink to={legalPath(doc.slug, region)} className="olg-row">
                        <span className="olg-row-title">{names.doc(doc.slug)}</span>
                        {onlyLabel(doc) && <span className="olg-row-only">{onlyLabel(doc)}</span>}
                        <span className="olg-row-rule" aria-hidden="true" />
                        <Arrow />
                      </RouterLink>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="olg-hub-foot">
          <Sentence
            text={t(
              'lg.hub.ask',
              'Questions about these documents? Write to {email}. About your data: {privacyEmail}.'
            )}
            parts={{
              email: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>,
              privacyEmail: <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>,
            }}
          />
        </p>
      </div>
    </section>
  );
}
