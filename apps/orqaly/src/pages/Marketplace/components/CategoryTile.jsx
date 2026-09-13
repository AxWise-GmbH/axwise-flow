import EastRoundedIcon from '@mui/icons-material/EastRounded';
import GlassIcon from '../../../components/icons/GlassIcon';

export default function CategoryTile({
  Icon,
  iconName,
  title,
  subtitle,
  onClick,
  delay = 0,
  ariaLabel,
  illustration,
  tileId,
  variant, // 'dashed' for "Add ..." CTA tiles
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <article
      className={variant === 'dashed' ? 'mkt-tile mkt-tile--dashed' : 'mkt-tile'}
      role="link"
      tabIndex={0}
      aria-label={ariaLabel || `${title} - ${subtitle}`}
      data-tile-id={tileId}
      style={{ '--delay': `${delay}ms` }}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          '--mx',
          `${((e.clientX - rect.left) / rect.width) * 100}%`
        );
        e.currentTarget.style.setProperty(
          '--my',
          `${((e.clientY - rect.top) / rect.height) * 100}%`
        );
      }}
    >
      {/* Decorative right-side illustration (simple-mode only - gated by CSS). */}
      {illustration && (
        <div className="mkt-tile__illustration" aria-hidden="true">
          {illustration}
        </div>
      )}

      <div className="mkt-tile__body">
        <div className="mkt-tile__icon" aria-hidden="true">
          <GlassIcon name={iconName} fallback={Icon} size={28} />
        </div>
        <h3 className="mkt-tile__title">{title}</h3>
        <p className="mkt-tile__subtitle">{subtitle}</p>
      </div>
      <span className="mkt-tile__arrow">
        Explore <GlassIcon name="EastRounded" fallback={EastRoundedIcon} size={14} />
      </span>
    </article>
  );
}
