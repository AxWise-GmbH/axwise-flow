import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import ShowcaseAgentsTile from './components/ShowcaseAgentsTile';
import CategoryTile from './components/CategoryTile';
import { getIllustration } from './components/illustrations';
import AccountActionDialog from '../../components/Marketplace/AccountActionDialog';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import './MarketplaceLanding.css';

const CATEGORY_TILES = {
  teams: {
    id: 'teams',
    Icon: GroupsOutlinedIcon,
    iconName: 'GroupsOutlined',
    title: 'Consilium',
    subtitle: 'Choose board members for your business',
    delay: 0,
    illustrationKey: 'teams',
  },
  orgs: {
    id: 'orgs',
    Icon: CorporateFareOutlinedIcon,
    iconName: 'Briefcase',
    title: 'Organizations',
    subtitle: 'Organizations structures for teams and agents.',
    delay: 60,
    illustrationKey: 'orgs',
  },
  skills: {
    id: 'skills',
    Icon: PsychologyOutlinedIcon,
    iconName: 'PsychologyOutlined',
    title: 'Skills',
    subtitle: 'Add skills to agents and upgrade them',
    delay: 180,
    illustrationKey: 'skills',
  },
  tools: {
    id: 'tools',
    Icon: BuildOutlinedIcon,
    iconName: 'Binoculars',
    title: 'Tools',
    subtitle: 'Use or upload your integrations or libraries',
    delay: 240,
    illustrationKey: 'tools',
  },
  businesses: {
    id: 'businesses',
    Icon: BusinessCenterOutlinedIcon,
    iconName: 'BusinessCenterOutlined',
    title: 'AI models',
    simpleTitle: 'Models',
    subtitle: 'Rent a hosted model, run one locally, or download it.',
    // Keep the historical tile id used by its illustration, but open the AI
    // model catalog rather than the separate business-template tab.
    tab: 'models',
    delay: 300,
    illustrationKey: 'businesses',
  },
  account: {
    id: 'account',
    Icon: VpnKeyOutlinedIcon,
    iconName: 'VpnKeyOutlined',
    title: 'Account',
    subtitle: 'Purchase Tool & LLM accounts to unlock API keys.',
    delay: 360,
    illustrationKey: 'account',
  },
};

/** Simple-mode visual order: Consilium → Orgs → Agents → Skills → Tools → Business → Account */
const SIMPLE_TILE_ORDER = ['teams', 'orgs', 'agents', 'skills', 'tools', 'businesses', 'account'];

const SECTION_1 = [CATEGORY_TILES.skills, CATEGORY_TILES.tools, CATEGORY_TILES.teams];

const SECTION_2 = [CATEGORY_TILES.orgs, CATEGORY_TILES.businesses, CATEGORY_TILES.account];

function spawnConfettiAt(x, y) {
  for (let i = 0; i < 18; i++) {
    const c = document.createElement('div');
    c.className = 'mkt-confetti';
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 80;
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    c.style.background =
      Math.random() > 0.5 ? 'var(--app-accent, #10b981)' : 'var(--app-accent-light, #34d399)';
    c.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    c.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
    c.style.animationDuration = `${700 + Math.random() * 400}ms`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1300);
  }
}

function useParticles(ref) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let rafId;
    let particles = [];
    const COUNT = window.innerWidth < 768 ? 12 : 20;
    const COLORS = ['16,185,129', '52,211,153', '6,78,59'];
    let mounted = true;

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    function spawn() {
      return {
        x: Math.random() * canvas.width,
        y: canvas.height + 20,
        r: 1 + Math.random() * 2.5,
        vy: 0.2 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 0.2,
        life: 0,
        maxLife: 400 + Math.random() * 600,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    }
    resize();
    for (let i = 0; i < COUNT; i++) {
      const p = spawn();
      p.y = Math.random() * canvas.height;
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);

    function tick() {
      if (!mounted) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        p.y -= p.vy;
        p.x += p.vx;
        p.life += 1;
        const lifeRatio = p.life / p.maxLife;
        const alpha =
          lifeRatio < 0.15 ? lifeRatio / 0.15 : lifeRatio > 0.85 ? (1 - lifeRatio) / 0.15 : 1;
        const a = Math.max(0, Math.min(1, alpha)) * 0.6;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `rgba(${p.color},${a})`);
        g.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
        if (p.life > p.maxLife || p.y < -20) particles[i] = spawn();
      });
      rafId = requestAnimationFrame(tick);
    }
    tick();
    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      obs.disconnect();
    };
  }, [ref]);
}

function useCursorTrail() {
  useEffect(() => {
    let lastTrail = 0;
    const handler = (e) => {
      const now = performance.now();
      if (now - lastTrail < 50) return;
      lastTrail = now;
      const dot = document.createElement('div');
      dot.className = 'mkt-cursor-dot';
      dot.style.left = `${e.clientX - 3}px`;
      dot.style.top = `${e.clientY - 3}px`;
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 520);
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);
}

function renderCategoryTile(tile, { onClick, simpleMode }) {
  const title = simpleMode && tile.simpleTitle ? tile.simpleTitle : tile.title;
  return (
    <CategoryTile
      key={tile.id}
      tileId={tile.id}
      Icon={tile.Icon}
      iconName={tile.iconName}
      title={title}
      subtitle={tile.subtitle}
      delay={tile.delay}
      onClick={onClick}
      ariaLabel={
        tile.id === 'account'
          ? `${title} - ${tile.subtitle}. Opens an account dialog.`
          : `${title} - ${tile.subtitle}. Opens marketplace.`
      }
      illustration={simpleMode ? getIllustration(tile.illustrationKey) : null}
    />
  );
}

export default function MarketplaceLanding() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const { simpleMode } = useSimpleMode();
  useParticles(canvasRef);
  useCursorTrail();

  const [accountDialogOpen, setAccountDialogOpen] = useState(false);

  const goToTab =
    (tab, extra = '') =>
    (event) => {
      if (event) {
        const rect = event.currentTarget.getBoundingClientRect();
        spawnConfettiAt(rect.left + 32, rect.top + 32);
      }
      navigate(`/marketplace/browse?tab=${tab}${extra}`);
    };

  const openAccountDialog = (event) => {
    if (event) {
      const rect = event.currentTarget.getBoundingClientRect();
      spawnConfettiAt(rect.left + 32, rect.top + 32);
    }
    setAccountDialogOpen(true);
  };

  const handlePillClick = (role) => {
    spawnConfettiAt(window.innerWidth / 2, window.innerHeight / 2);
    navigate(`/marketplace/browse?tab=agents&role=${encodeURIComponent(role.slug)}`);
  };

  const tabFor = (tile) => tile.tab ?? tile.id;

  const resolveTileClick = (tile) => {
    if (tile.id === 'account') return openAccountDialog;
    return goToTab(tabFor(tile));
  };

  return (
    <div
      className="mkt-landing mkt-landing--marketplace"
      data-compact={simpleMode ? '1' : undefined}
    >
      <canvas ref={canvasRef} className="mkt-landing__particles" aria-hidden="true" />
      <div className="mkt-landing__inner">
        {simpleMode ? (
          <section className="mkt-section">
            <div className="mkt-grid mkt-grid--marketplace-simple">
              {SIMPLE_TILE_ORDER.map((key) => {
                if (key === 'agents') {
                  return (
                    <ShowcaseAgentsTile
                      key="agents"
                      onNavigate={goToTab('agents')}
                      onPillClick={handlePillClick}
                      delay={120}
                    />
                  );
                }
                const tile = CATEGORY_TILES[key];
                return renderCategoryTile(tile, {
                  onClick: resolveTileClick(tile),
                  simpleMode: true,
                });
              })}
            </div>
          </section>
        ) : (
          <>
            <section className="mkt-section">
              <div className="mkt-grid mkt-grid--s1">
                <ShowcaseAgentsTile
                  onNavigate={goToTab('agents')}
                  onPillClick={handlePillClick}
                  delay={0}
                />
                {SECTION_1.map((tile) =>
                  renderCategoryTile(tile, {
                    onClick: goToTab(tabFor(tile)),
                    simpleMode: false,
                  })
                )}
              </div>
            </section>

            <section className="mkt-section">
              <div className="mkt-grid mkt-grid--s2">
                {SECTION_2.map((tile) =>
                  renderCategoryTile(tile, {
                    onClick: resolveTileClick(tile),
                    simpleMode: false,
                  })
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <AccountActionDialog open={accountDialogOpen} onClose={() => setAccountDialogOpen(false)} />
    </div>
  );
}
