import { useEffect, useId, useRef, useState } from 'react';
import { CheckGlyph, ChevronGlyph, GlobeGlyph } from './ui/Glyphs';
import { LANGUAGES, findLanguage } from './i18n/languages';
import { setLang, useT } from './i18n/useT';
import { rove } from './useNavMenus';
import './LanguagePicker.css';

/**
 * The footer's language button, beside the logo. It opens upward into a card that lists
 * every language in its own words; a pick is remembered (only a pick writes it).
 */
export default function LanguagePicker() {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();
  const current = findLanguage(lang) ?? LANGUAGES[0];

  // Opening puts focus on the language in use; Escape or a click elsewhere closes.
  useEffect(() => {
    if (!open) return undefined;
    rootRef.current?.querySelector('[aria-current="true"]')?.focus();
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const choose = (code) => {
    setOpen(false);
    buttonRef.current?.focus();
    setLang(code, { remember: true });
  };

  return (
    <div ref={rootRef} className="oi-lang" data-open={open}>
      <button
        ref={buttonRef}
        type="button"
        className="oi-lang-button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t('lang.button', 'Language: {name}', { name: current.native })}
        onClick={() => setOpen((value) => !value)}
      >
        <GlobeGlyph className="oi-lang-globe" />
        <span lang={current.code}>{current.native}</span>
        <ChevronGlyph className="oi-lang-chevron" />
      </button>
      <ul
        id={listId}
        className="oi-lang-card"
        aria-label={t('lang.list', 'Languages')}
        hidden={!open}
        onKeyDown={(event) => rove(event, 'ArrowUp', 'ArrowDown')}
      >
        {LANGUAGES.map(({ code, native, dir }) => (
          <li key={code}>
            <button
              type="button"
              className="oi-lang-option"
              lang={code}
              dir={dir ?? 'ltr'}
              aria-current={code === current.code ? 'true' : undefined}
              onClick={() => choose(code)}
            >
              <span>{native}</span>
              {code === current.code && <CheckGlyph className="oi-lang-check" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
