import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import EastRoundedIcon from '@mui/icons-material/EastRounded';
import GlassIcon from '../../components/icons/GlassIcon';
import { formatCurrency } from '../../utils/formatters';
import { getTypeLabel } from './orgTypes';

/**
 * Org tile - uses the same `.mkt-tile` CSS as marketplace tiles so the
 * cursor-tracked glow, breathing animation, and hover lift come for free.
 * Adds an org-specific kicker + metric rows for invested / ROI / teams.
 */
export default function OrgTile({ org, finance, teamCount = 0, onOpen, delay = 0 }) {
  const invested = Number(finance?.invested || 0);
  const roi = Number(finance?.roi || 0);
  const hasInvested = invested > 0;
  const hasRoi = !!finance && (finance.invested || finance.returned);
  const isActive = org.is_active !== false;

  const investedText = hasInvested ? formatCurrency(invested) : '-';
  const roiText = hasRoi ? `${roi.toFixed(1)}%` : '-';
  const roiLabel = hasRoi && roi < 0 ? 'loss' : 'ROI';
  const typeLabel = getTypeLabel(org.org_type);
  const teamLabel = teamCount === 1 ? 'team' : 'teams';
  const subtitle = [org.industry, isActive ? 'Active' : 'Inactive'].filter(Boolean).join(' · ');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.();
    }
  };

  return (
    <article
      className="mkt-tile"
      role="link"
      tabIndex={0}
      aria-label={`${typeLabel} - ${org.name}. ${subtitle}.`}
      style={{ '--delay': `${delay}ms` }}
      onClick={onOpen}
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
      <div className="mkt-tile__body">
        <div className="mkt-tile__icon" aria-hidden="true">
          <GlassIcon name="CorporateFareRounded" fallback={CorporateFareRoundedIcon} size={28} />
        </div>
        <span className="mkt-tile__kicker">{typeLabel}</span>
        <h3 className="mkt-tile__title">{org.name}</h3>
        {subtitle && <p className="mkt-tile__subtitle">{subtitle}</p>}
        <div className="mkt-tile__metrics" aria-hidden={false}>
          <div className="mkt-tile__metrics-row">
            <b>{investedText}</b>invested
          </div>
          <div className="mkt-tile__metrics-row">
            <b>{roiText}</b>
            {roiLabel}
          </div>
          <div className="mkt-tile__metrics-row">
            <b>{teamCount}</b>
            {teamLabel}
          </div>
        </div>
      </div>
      <span className="mkt-tile__arrow">
        View details <GlassIcon name="EastRounded" fallback={EastRoundedIcon} size={14} />
      </span>
    </article>
  );
}
