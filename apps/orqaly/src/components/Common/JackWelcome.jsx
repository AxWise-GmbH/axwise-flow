/**
 * JackWelcome — Standalone fireworks animation + welcome popup for Jack.
 *
 * Usage:
 *   import { useJackWelcome, JackWelcomeOverlay } from '…/Common/JackWelcome';
 *
 *   function MyPage() {
 *     const { trigger, overlayProps } = useJackWelcome();
 *     return (
 *       <>
 *         <JackWelcomeOverlay {...overlayProps} />
 *         <button onClick={trigger}>Activate</button>
 *       </>
 *     );
 *   }
 *
 * This component is intentionally decoupled from any specific trigger
 * mechanism (triple-click, keyboard shortcut, etc.) so it survives
 * changes to the login page UI.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogContent, Typography, useTheme } from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

import AppIcon from '../icons/AppIcon';

/* ── Fireworks canvas (2.5 s burst) ──────────────────────────── */
function FireworksCanvas({ active }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const particles = [];
    const rockets = [];
    const colors = [
      '#FF4081',
      '#FF6D00',
      '#FFD600',
      '#00E676',
      '#2979FF',
      '#D500F9',
      '#00E5FF',
      '#FFAB40',
      '#FF1744',
      '#76FF03',
      '#F50057',
      '#651FFF',
    ];

    class Particle {
      constructor(x, y, color, vx, vy, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.alpha = 1;
        this.size = size || 2.5;
        this.decay = 0.025 + Math.random() * 0.025;
        this.gravity = 0.06;
        this.trail = [];
      }
      update() {
        this.trail.push({ x: this.x, y: this.y, alpha: this.alpha });
        if (this.trail.length > 5) this.trail.shift();
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
      }
      draw(ctx) {
        for (let i = 0; i < this.trail.length; i++) {
          const t = this.trail[i];
          ctx.beginPath();
          ctx.arc(t.x, t.y, this.size * (i / this.trail.length) * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = this.color;
          ctx.globalAlpha = t.alpha * 0.3 * (i / this.trail.length);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.alpha;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 3);
        grad.addColorStop(0, this.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = this.alpha * 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    class Rocket {
      constructor() {
        this.x = w * (0.15 + Math.random() * 0.7);
        this.y = h;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = -(8 + Math.random() * 6);
        this.targetY = h * (0.15 + Math.random() * 0.35);
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.trail = [];
      }
      update() {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 8) this.trail.shift();
        this.x += this.vx;
        this.y += this.vy;
        this.vy *= 0.98;
      }
      draw(ctx) {
        for (let i = 0; i < this.trail.length; i++) {
          const t = this.trail[i];
          ctx.beginPath();
          ctx.arc(t.x, t.y, 1.5 * (i / this.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = this.color;
          ctx.globalAlpha = 0.4 * (i / this.trail.length);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      shouldExplode() {
        return this.y <= this.targetY;
      }
      explode() {
        const count = 55 + Math.floor(Math.random() * 40);
        const burstColors = [this.color, colors[Math.floor(Math.random() * colors.length)]];
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
          const speed = 2 + Math.random() * 4.5;
          const c = burstColors[Math.floor(Math.random() * burstColors.length)];
          particles.push(
            new Particle(
              this.x,
              this.y,
              c,
              Math.cos(angle) * speed,
              Math.sin(angle) * speed,
              1.5 + Math.random() * 2
            )
          );
        }
      }
    }

    // ~2.5 s animation: launch rockets only in the first ~80 frames (~1.3 s),
    // then let remaining particles fade out over the next ~1.2 s.
    let frame = 0;
    let launchInterval = 6;

    const loop = () => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      frame++;
      if (frame % launchInterval === 0 && frame < 80) {
        rockets.push(new Rocket());
        if (Math.random() > 0.35) rockets.push(new Rocket());
        launchInterval = 5 + Math.floor(Math.random() * 8);
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        rockets[i].update();
        rockets[i].draw(ctx);
        if (rockets[i].shouldExplode()) {
          rockets[i].explode();
          rockets.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(ctx);
        if (particles[i].alpha <= 0) particles.splice(i, 1);
      }

      if (frame < 200 || particles.length > 0 || rockets.length > 0) {
        animRef.current = requestAnimationFrame(loop);
      }
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', onResize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  );
}

/* ── Welcome popup ───────────────────────────────────────────── */
function WelcomePopup({ open, onClose }) {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: 'visible',
          background:
            theme.palette.mode === 'dark'
              ? 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
              : 'linear-gradient(145deg, #ffffff 0%, #f0f4ff 50%, #e8f0fe 100%)',
          border: '2px solid',
          borderColor: 'primary.main',
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 0 60px rgba(59,130,246,0.3), 0 0 120px rgba(59,130,246,0.1)'
              : '0 0 60px rgba(59,130,246,0.2), 0 0 120px rgba(59,130,246,0.08)',
          maxWidth: 400,
          mx: 'auto',
          animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          '@keyframes popIn': {
            '0%': { transform: 'scale(0.3) translateY(40px)', opacity: 0 },
            '100%': { transform: 'scale(1) translateY(0)', opacity: 1 },
          },
        },
      }}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' },
        },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 5, px: 4 }}>
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3,
            boxShadow: '0 4px 24px rgba(59,130,246,0.35)',
            animation: 'pulse 2s ease-in-out infinite',
            '@keyframes pulse': {
              '0%, 100%': { boxShadow: '0 4px 24px rgba(59,130,246,0.35)' },
              '50%': { boxShadow: '0 4px 40px rgba(59,130,246,0.55)' },
            },
          }}
        >
          <AppIcon
            name="RocketLaunch"
            fallback={RocketLaunchIcon}
            sx={{ fontSize: 36, color: 'primary.contrastText' }}
          />
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1.5, color: 'text.primary' }}>
          Hey Jack!
        </Typography>

        <Typography
          variant="body1"
          sx={{
            color: 'text.secondary',
            lineHeight: 1.7,
            fontSize: '0.95rem',
            maxWidth: 320,
            mx: 'auto',
          }}
        >
          Welcome back, boss. Your Orchestrator is warmed up and ready to roll. Credentials are
          locked and loaded — just hit Sign In when you are ready to take the wheel.
        </Typography>

        <Button
          variant="contained"
          disableElevation
          onClick={onClose}
          sx={{
            mt: 3.5,
            px: 4,
            py: 1.2,
            borderRadius: 3,
            fontWeight: 700,
            fontSize: '0.9rem',
            textTransform: 'none',
          }}
        >
          Let's Go
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ── Combined overlay (renders both canvas + popup) ──────────── */
export function JackWelcomeOverlay({ showFireworks, showPopup, onClosePopup }) {
  return (
    <>
      <FireworksCanvas active={showFireworks} />
      <WelcomePopup open={showPopup} onClose={onClosePopup} />
    </>
  );
}

/* ── Hook: call trigger() to launch the full sequence ────────── */
export function useJackWelcome() {
  const [showFireworks, setShowFireworks] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const trigger = useCallback(() => {
    // Fireworks for 2.5 s
    setShowFireworks(true);
    setTimeout(() => setShowFireworks(false), 2500);

    // Popup appears after a brief beat so the first rockets are visible
    setTimeout(() => setShowPopup(true), 400);
  }, []);

  const closePopup = useCallback(() => setShowPopup(false), []);

  return {
    trigger,
    closePopup,
    overlayProps: {
      showFireworks,
      showPopup,
      onClosePopup: closePopup,
    },
  };
}
