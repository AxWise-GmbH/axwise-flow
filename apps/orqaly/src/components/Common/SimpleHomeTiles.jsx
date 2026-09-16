import GlassIcon from '../icons/GlassIcon';

function tileMouseMove(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
  e.currentTarget.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
}

function tileKeyDown(onClick) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };
}

/** KPI strip tile — square icon, org-action spacing (Goal Monitoring).
 *  Optional `breakdown` = [{ label, value }] renders a compact label/value list
 *  under the value (used by the Spent tile for per-LLM $). */
export function HomeMetricTile({
  iconName,
  fallback,
  kicker,
  value,
  subtitle,
  breakdown,
  onClick,
  delay = 0,
  ariaLabel,
}) {
  const hasBreakdown = Array.isArray(breakdown) && breakdown.length > 0;
  return (
    <article
      className="mkt-tile mkt-tile--org-action mkt-tile--home-metric"
      role="link"
      tabIndex={0}
      aria-label={ariaLabel || `${kicker} — ${value}. ${subtitle || ''}`}
      style={{ '--delay': `${delay}ms` }}
      onClick={onClick}
      onKeyDown={tileKeyDown(onClick)}
      onMouseMove={tileMouseMove}
    >
      <div className="mkt-tile--org-action__body">
        <div className="mkt-tile__icon" aria-hidden="true">
          <GlassIcon name={iconName} fallback={fallback} size={28} />
        </div>
        <p className="mkt-tile--home-metric__kicker">{kicker}</p>
        <h3 className="mkt-tile--home-metric__value">{value}</h3>
        {subtitle && <p className="mkt-tile__subtitle">{subtitle}</p>}
        {hasBreakdown && (
          <div
            className="mkt-tile--home-metric__breakdown"
            style={{
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              width: '100%',
            }}
          >
            {breakdown.map((b) => (
              <div
                key={b.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: '0.72rem',
                  opacity: 0.85,
                  minWidth: 0,
                }}
              >
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {b.label}
                </span>
                <b style={{ flexShrink: 0 }}>{b.value}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** Compact scroll card — same pattern as Reports hub HubCard. */
function HomeScrollCard({ title, subtitle, metrics, onClick, ariaLabel }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <button
      type="button"
      className="org-card hub-card"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel || `${title}. ${subtitle}`}
    >
      <h4 className="org-card__title">{title}</h4>
      <p className="org-card__sub">{subtitle}</p>
      {Array.isArray(metrics) && metrics.length > 0 && (
        <div className="org-card__metrics">
          {metrics.map((m) => (
            <span key={m.label}>
              <b>{m.value}</b>
              {m.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

/** Categories showcase — horizontal scroll carousel (Reports hub pattern). */
export function HomeCategoriesShowcase({ cards, delay = 0 }) {
  return (
    <article
      className="mkt-tile mkt-tile--org-showcase mkt-tile--hub-showcase mkt-tile--home-showcase"
      style={{ '--delay': `${delay}ms` }}
      onMouseMove={tileMouseMove}
    >
      <div className="mkt-tile--org-showcase__header">
        <div>
          <h3 className="mkt-tile--org-showcase__title">You can explore:</h3>
          <p className="mkt-tile--org-showcase__sub">
            Tap any card to open requests, communicator or the reports hub.
          </p>
        </div>
      </div>

      <div className="mkt-tile--org-showcase__row">
        {cards.map((card) => (
          <HomeScrollCard
            key={card.key}
            title={card.title}
            subtitle={card.subtitle}
            metrics={card.metrics}
            onClick={card.onClick}
            ariaLabel={card.ariaLabel}
          />
        ))}
      </div>
    </article>
  );
}

/** Category / navigation tile — same shell as Organizations action tiles. */
export function HomeCategoryTile({
  iconName,
  fallback,
  title,
  subtitle,
  stats = null,
  onClick,
  delay = 0,
  ariaLabel,
}) {
  return (
    <article
      className="mkt-tile mkt-tile--org-action"
      role="link"
      tabIndex={0}
      aria-label={ariaLabel || `${title} — ${subtitle}`}
      style={{ '--delay': `${delay}ms` }}
      onClick={onClick}
      onKeyDown={tileKeyDown(onClick)}
      onMouseMove={tileMouseMove}
    >
      <div className="mkt-tile--org-action__body">
        <div className="mkt-tile__icon" aria-hidden="true">
          <GlassIcon name={iconName} fallback={fallback} size={28} />
        </div>
        <h3 className="mkt-tile__title">{title}</h3>
        <p className="mkt-tile__subtitle">{subtitle}</p>
        {Array.isArray(stats) && stats.length > 0 && (
          <div className="org-card__metrics" style={{ marginTop: 8 }}>
            {stats.map((s) => (
              <span key={s.label}>
                <b>{s.value}</b>
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
