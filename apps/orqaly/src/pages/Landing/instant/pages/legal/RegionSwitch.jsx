import { useT } from '../../i18n/useT';
import { REGION_IDS, legalNames } from './legal.links';

/**
 * The US / EU switch: two radio buttons in one pill, a light thumb slides to the one on.
 * Arrow keys move between them and pick, as radio buttons do.
 */
export default function RegionSwitch({ region, onChoose }) {
  const { t } = useT('lg');
  const names = legalNames(t);
  const onKeyDown = (event) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const group = event.currentTarget;
    const at = REGION_IDS.indexOf(region);
    const next = REGION_IDS[(at + step + REGION_IDS.length) % REGION_IDS.length];
    onChoose(next);
    requestAnimationFrame(() => group.querySelector(`[data-region="${next}"]`)?.focus());
  };

  return (
    <div className="olg-region">
      <div
        role="radiogroup"
        aria-label={t('lg.version', 'Version')}
        className="olg-switch"
        data-region={region}
        onKeyDown={onKeyDown}
      >
        <span className="olg-switch-thumb" aria-hidden="true" />
        {REGION_IDS.map((id) => (
          <button
            type="button"
            role="radio"
            key={id}
            data-region={id}
            className="olg-switch-option"
            aria-checked={id === region}
            tabIndex={id === region ? 0 : -1}
            onClick={() => id !== region && onChoose(id)}
          >
            {names.regionLabel(id)}
            <span className="oi-sr-only"> — {names.regionName(id)}</span>
          </button>
        ))}
      </div>
      <p className="olg-region-name" aria-live="polite">
        {names.regionName(region)}
      </p>
    </div>
  );
}

/**
 * Shown only before the visitor has ever chosen, when the browser's clock points at the
 * other version. It never switches by itself: either button is the visitor's own choice.
 */
export function RegionSuggestion({ suggest, region, onChoose }) {
  const { t } = useT('lg');
  if (!suggest) return null;
  const names = legalNames(t);
  return (
    <div className="olg-suggest" role="status">
      <p className="olg-suggest-text">
        {suggest === 'eu'
          ? t('lg.suggest.eu', 'You seem to be in Europe.')
          : t('lg.suggest.us', 'You seem to be outside Europe.')}
      </p>
      <div className="olg-suggest-actions">
        <button type="button" className="olg-suggest-go" onClick={() => onChoose(suggest)}>
          {t('lg.showVersion', 'Show the {region} version', {
            region: names.regionLabel(suggest),
          })}
        </button>
        <button type="button" className="olg-suggest-keep" onClick={() => onChoose(region)}>
          {t('lg.keep', 'Keep {region}', { region: names.regionLabel(region) })}
        </button>
      </div>
    </div>
  );
}
