import { useMemo } from 'react';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import EastRoundedIcon from '@mui/icons-material/EastRounded';
import GlassIcon from '../../../components/icons/GlassIcon';
import { PREDEFINED_AGENTS } from '../../../config/predefinedAgents';

const ROW_COUNT = 3;
const PILL_ICON_BY_CATEGORY = {
  Founder: '◆',
  Development: '◇',
  'Marketing & Sales': '✦',
  Operations: '✧',
  System: '⬢',
};

function pillSlug(role) {
  return role
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function distributeRoles(roles, rowCount) {
  const rows = Array.from({ length: rowCount }, () => []);
  roles.forEach((role, i) => rows[i % rowCount].push(role));
  return rows;
}

function shuffleStable(arr, seed = 7) {
  const out = arr.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function ShowcaseAgentsTile({ onNavigate, onPillClick, delay = 0 }) {
  const rows = useMemo(() => {
    const allRoles = PREDEFINED_AGENTS.filter((a) => a && a.role).map((a) => ({
      role: a.role,
      category: a.category || 'System',
      slug: pillSlug(a.role),
    }));
    const unique = [];
    const seen = new Set();
    for (const r of allRoles) {
      if (!seen.has(r.slug)) {
        seen.add(r.slug);
        unique.push(r);
      }
    }
    const shuffled = shuffleStable(unique);
    return distributeRoles(shuffled, ROW_COUNT);
  }, []);

  const totalRoles = rows.reduce((sum, r) => sum + r.length, 0);
  const rowSpeeds = ['50s', '70s', '40s'];

  const handleTileClick = (e) => {
    if (e.target.closest('.mkt-pill')) return;
    onNavigate();
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate();
    }
  };

  return (
    <article
      className="mkt-tile mkt-tile--showcase"
      role="link"
      tabIndex={0}
      aria-label="AI Agents - explore the agent marketplace"
      data-tile-id="agents"
      style={{ '--delay': `${delay}ms` }}
      onClick={handleTileClick}
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
      <div className="mkt-orb" aria-hidden="true">
        <div className="mkt-orb__ring" />
        <div className="mkt-orb__ring mkt-orb__ring--2" />
        <div className="mkt-orb__ring mkt-orb__ring--3" />
        <div className="mkt-orb__blob" />
        <div className="mkt-orb__blob mkt-orb__blob--inner" />
      </div>

      <div className="mkt-showcase__content">
        <div className="mkt-showcase__head">
          <span className="mkt-live-badge">
            <span className="mkt-live-dot" />
            {totalRoles} agents live
          </span>
          <h3 className="mkt-tile__title">AI Agents</h3>
          <p className="mkt-tile__subtitle">
            Pre-built AI workers, ready to deploy across your workflows.
          </p>
        </div>

        <div className="mkt-pills" role="group" aria-label="Agent role highlights">
          {rows.map((row, idx) => {
            const doubled = [...row, ...row];
            return (
              <div
                key={idx}
                className={`mkt-pills__row${idx === 1 ? ' mkt-pills__row--reverse' : ''}`}
                style={{ '--row-speed': rowSpeeds[idx] || '55s' }}
              >
                {doubled.map((r, i) => (
                  <button
                    key={`${idx}-${i}-${r.slug}`}
                    type="button"
                    className="mkt-pill"
                    aria-label={`Browse ${r.role} agents`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPillClick?.(r);
                    }}
                  >
                    <span className="mkt-pill__icon" aria-hidden="true">
                      <GlassIcon
                        name="SmartToyOutlined"
                        fallback={SmartToyOutlinedIcon}
                        size={14}
                      />
                    </span>
                    <span>{r.role}</span>
                    <span className="mkt-pill__tooltip">
                      {PILL_ICON_BY_CATEGORY[r.category] || '◆'} {r.category}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className="mkt-showcase__foot">
          <span className="mkt-tile__arrow">
            Explore agents <GlassIcon name="EastRounded" fallback={EastRoundedIcon} size={16} />
          </span>
        </div>
      </div>
    </article>
  );
}
