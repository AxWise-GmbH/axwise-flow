import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { COMPANY } from '../info/company';
import { DEFAULT_LANG } from '../../i18n/languages';
import { useT } from '../../i18n/useT';
import RegionSwitch, { RegionSuggestion } from './RegionSwitch';
import { LegalBlock, Sentence } from './LegalBlocks';
import { editionOf, formatLegalDate, loadLegalDoc, plainText, visibleBlocks } from './legal.docs';
import { LEGAL_PRODUCTS, PUBLISHED_DOCS, REGIONS, legalNames, legalPath } from './legal.links';
import { Arrow } from './LegalHub';
import DirArrow from '../../ui/DirArrow';

function forLine(entry, t) {
  if (!entry.products.length) return t('lg.for.site', 'This website');
  if (entry.products.length === LEGAL_PRODUCTS.length) {
    return t('lg.for.all', 'All products and this website');
  }
  const names = legalNames(t);
  return LEGAL_PRODUCTS.filter(({ id }) => entry.products.includes(id))
    .map(({ id }) => names.product(id))
    .join(' · ');
}

/**
 * The text arrives from its own file: soft lines while it loads, a short note if it cannot.
 * `edition` is the language of the text to show (see editionOf in legal.docs.js).
 */
function useLegalText(slug, edition) {
  const [state, setState] = useState({ id: null, doc: null, failed: false });
  const [attempt, setAttempt] = useState(0);
  const id = `${edition}/${slug}`;
  useEffect(() => {
    let current = true;
    loadLegalDoc(slug, edition).then(
      (doc) => current && setState({ id, doc, failed: false }),
      () => current && setState({ id, doc: null, failed: true })
    );
    return () => {
      current = false;
    };
  }, [id, slug, edition, attempt]);
  const ready = state.id === id;
  return {
    doc: ready ? state.doc : null,
    failed: ready && state.failed,
    retry: () => {
      setState({ id: null, doc: null, failed: false });
      setAttempt((value) => value + 1);
    },
  };
}

function Skeleton() {
  return (
    <div className="olg-skeleton" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

// Which version this is and why, first thing on every document.
function RegionNote({ entry, region, onChoose }) {
  const { t } = useT('lg');
  const names = legalNames(t);
  const other = REGIONS.find(({ id }) => id !== region).id;
  if (!entry.regions.includes(region)) {
    const home = entry.regions[0];
    return (
      <div className="olg-note">
        <p>
          {t('lg.note.elsewhere', 'This document is only part of the {region} version ({name}).', {
            region: names.regionLabel(home),
            name: names.regionName(home),
          })}
        </p>
        <button type="button" className="olg-note-link" onClick={() => onChoose(home)}>
          {t('lg.note.showIt', 'Show it')} <DirArrow />
        </button>
      </div>
    );
  }
  if (entry.regions.length === 1) {
    return (
      <div className="olg-note">
        <p>
          {t('lg.note.elsewhere', 'This document is only part of the {region} version ({name}).', {
            region: names.regionLabel(region),
            name: names.regionName(region),
          })}
        </p>
      </div>
    );
  }
  return (
    <div className="olg-note">
      <p>
        {t(
          'lg.note.this',
          'This is the version for the {name}. The version that applies to you follows where you live when you sign up.',
          { name: names.regionName(region) }
        )}
      </p>
      <button type="button" className="olg-note-link" onClick={() => onChoose(other)}>
        {t('lg.showVersion', 'Show the {region} version', { region: names.regionLabel(other) })}{' '}
        <DirArrow />
      </button>
    </div>
  );
}

/**
 * Above a translated text: the English one is binding, one click away. `english` says the
 * English text is on show instead.
 */
function BindingNote({ english, onToggle }) {
  const { t } = useT('lg');
  return (
    <div className="olg-note olg-binding">
      <p>
        {t(
          'lg.binding',
          'This is a translation for your convenience. The English version is the binding one.'
        )}
      </p>
      <button type="button" className="olg-note-link" onClick={onToggle}>
        {english
          ? t('lg.showTranslation', 'Back to the translation')
          : t('lg.showEnglish', 'Read the English version')}{' '}
        <DirArrow />
      </button>
    </div>
  );
}

export default function LegalDoc({ entry, region, suggest, onChoose }) {
  const { t, lang } = useT('lg');
  const names = legalNames(t);
  const { hash } = useLocation();
  // The reader's own edition, if there is one; the English text on request. The request is
  // for this document in this language only: another page or language starts translated.
  const own = editionOf(entry.slug, lang);
  const [englishFor, setEnglishFor] = useState(null);
  const english = own !== DEFAULT_LANG && englishFor === `${lang}/${entry.slug}`;
  const edition = english ? DEFAULT_LANG : own;
  // The text's language, where it is not the page's (an English text on a German page).
  const textLang = edition !== lang ? { lang: edition, dir: 'ltr' } : {};
  const { doc, failed, retry } = useLegalText(entry.slug, edition);
  const [tocOpen, setTocOpen] = useState(false);
  const available = entry.regions.includes(region);
  const blocks = doc && available ? visibleBlocks(doc.blocks, region) : [];
  let count = 0;
  const numbered = blocks.map((block) => ({ block, number: block.type === 'h2' ? ++count : null }));
  const sections = numbered.filter(({ block }) => block.type === 'h2');

  // A link to a section lands on it once the text is in.
  useEffect(() => {
    if (!doc || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [doc, hash, region]);

  // Switching keeps the reader's place when the other version has the same section.
  const switchTo = (next) => {
    const id = hash.slice(1);
    const keep = doc && id && visibleBlocks(doc.blocks, next).some((block) => block.id === id);
    onChoose(next, keep ? hash : '');
  };

  const shown = PUBLISHED_DOCS.filter((item) => item.regions.includes(region));
  const at = shown.findIndex((item) => item.slug === entry.slug);
  const previous = at > 0 ? shown[at - 1] : null;
  const next = at >= 0 && at < shown.length - 1 ? shown[at + 1] : null;
  const contact = COMPANY[entry.contact] || COMPANY.email;
  const onThisPage = t('lg.toc', 'On this page');

  return (
    <article className="oi-section olg olg-doc" aria-labelledby="legal-doc-heading">
      <div className="oi-container">
        <div className="olg-doc-top">
          <RouterLink to={legalPath(null, region)} className="olg-back">
            <DirArrow back /> {t('lg.title', 'Legal')}
          </RouterLink>
          <button type="button" className="olg-print" onClick={() => window.print()}>
            {t('lg.print', 'Print or save as PDF')}
          </button>
        </div>

        <header className="olg-doc-head">
          <h1 className="olg-doc-title" id="legal-doc-heading">
            {names.doc(entry.slug)}
          </h1>
          {doc && (
            <p className="olg-doc-summary" {...textLang}>
              {plainText(doc.meta.summary)}
            </p>
          )}
          {doc && (
            <p className="olg-doc-meta">
              <Sentence
                text={t('lg.effective', 'Effective {date}')}
                parts={{
                  date: (
                    <time dateTime={doc.meta.effective}>
                      {formatLegalDate(doc.meta.effective, lang)}
                    </time>
                  ),
                }}
              />
              <span aria-hidden="true"> · </span>
              {t('lg.docVersion', 'Version {version}', { version: doc.meta.version })}
            </p>
          )}
          <div className="olg-doc-controls">
            <RegionSwitch region={region} onChoose={switchTo} />
            <p className="olg-for">
              <span className="olg-for-label">{t('lg.for', 'For')}</span> {forLine(entry, t)}
            </p>
          </div>
        </header>

        <RegionSuggestion suggest={suggest} region={region} onChoose={switchTo} />
        <RegionNote entry={entry} region={region} onChoose={switchTo} />
        {available && own !== DEFAULT_LANG && (
          <BindingNote
            english={english}
            onToggle={() => setEnglishFor(english ? null : `${lang}/${entry.slug}`)}
          />
        )}

        {available && (
          <div className="olg-doc-grid">
            <nav className="olg-toc" aria-label={onThisPage} data-open={tocOpen}>
              <button
                type="button"
                className="olg-toc-toggle"
                aria-expanded={tocOpen}
                onClick={() => setTocOpen((open) => !open)}
              >
                {onThisPage}
              </button>
              <p className="olg-toc-label" aria-hidden="true">
                {onThisPage}
              </p>
              <ol {...textLang}>
                {sections.map(({ block, number }) => (
                  <li key={block.id}>
                    <a href={`#${block.id}`} onClick={() => setTocOpen(false)}>
                      <span className="olg-toc-num">{number}</span>
                      {plainText(block.text)}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="olg-body">
              {failed ? (
                <div className="olg-failed">
                  <p>
                    {t('lg.failed', 'This document did not load. Please try again in a moment.')}
                  </p>
                  <button type="button" className="olg-note-link" onClick={retry}>
                    {t('lg.retry', 'Try again')}
                  </button>
                </div>
              ) : doc ? (
                <div className="olg-text" {...textLang}>
                  {numbered.map(({ block, number }, index) => (
                    <LegalBlock key={index} block={block} region={region} number={number} />
                  ))}
                </div>
              ) : (
                <Skeleton />
              )}

              <p className="olg-ask">
                <Sentence
                  text={t('lg.ask', 'Questions about this document? Write to {email}.')}
                  parts={{ email: <a href={`mailto:${contact}`}>{contact}</a> }}
                />
              </p>

              <nav className="olg-pager" aria-label={t('lg.pager', 'More documents')}>
                {previous ? (
                  <RouterLink to={legalPath(previous.slug, region)} className="olg-pager-link">
                    <span className="olg-pager-dir">{t('lg.previous', 'Previous')}</span>
                    {names.doc(previous.slug)}
                  </RouterLink>
                ) : (
                  <span />
                )}
                {next && (
                  <RouterLink
                    to={legalPath(next.slug, region)}
                    className="olg-pager-link olg-pager-next"
                  >
                    <span className="olg-pager-dir">{t('lg.next', 'Next')}</span>
                    {names.doc(next.slug)}
                    <Arrow className="olg-pager-arrow" />
                  </RouterLink>
                )}
              </nav>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
