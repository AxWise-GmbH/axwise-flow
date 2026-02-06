import { useEffect, useRef } from 'react';

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const gridSize = 40; // Size of the grid squares
    const dotSize = 1.5; // Size of grid intersections
    const beamSpeed = 1; // Speed of the moving beams
    const beamLength = 100; // Length of the beam trail
    const beamChance = 0.02; // Chance to spawn a new beam per frame

    interface Beam {
      x: number;
      y: number;
      dx: number; // Direction X (1, -1, 0)
      dy: number; // Direction Y (1, -1, 0)
      life: number;
      maxLife: number;
      path: {x: number, y: number}[];
    }

    let beams: Beam[] = [];

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      
      // Draw Grid Dots
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      for (let x = 0; x <= width; x += gridSize) {
        for (let y = 0; y <= height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Grid Lines (Subtle)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Manage Beams
      // Spawn new beams
      if (Math.random() < beamChance) {
        // Start from a random grid intersection
        const startX = Math.floor(Math.random() * (width / gridSize)) * gridSize;
        const startY = Math.floor(Math.random() * (height / gridSize)) * gridSize;
        
        // Pick a random direction
        const dirs = [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];

        beams.push({
          x: startX,
          y: startY,
          dx: dir.dx,
          dy: dir.dy,
          life: 0,
          maxLife: Math.random() * 100 + 100, // Random lifespan
          path: []
        });
      }

      // Update and Draw Beams
      beams.forEach((beam, index) => {
        beam.life++;
        beam.x += beam.dx * beamSpeed;
        beam.y += beam.dy * beamSpeed;

        // Snap to grid movement (only change direction at intersections, but we're moving continuously here for smoothness? 
        // Actually for a "grid beam" effect, it should probably move along the lines.
        // If speed is 1 and grid is 40, it takes 40 frames to cross.
        
        // Let's keep track of path for the trail
        beam.path.push({x: beam.x, y: beam.y});
        if (beam.path.length > beamLength) {
          beam.path.shift();
        }

        // Check bounds or life
        if (beam.life > beam.maxLife || beam.x < 0 || beam.x > width || beam.y < 0 || beam.y > height) {
          beams.splice(index, 1);
          return;
        }

        // Draw beam head
        const headOpacity = Math.max(0, 1 - beam.life / beam.maxLife);
        ctx.fillStyle = `rgba(0, 0, 0, ${headOpacity * 0.4})`; // Black beam
        
        // Draw the trail
        if (beam.path.length > 1) {
            const gradient = ctx.createLinearGradient(
                beam.path[0].x, beam.path[0].y, 
                beam.x, beam.y
            );
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, `rgba(0, 0, 0, ${headOpacity * 0.2})`);
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(beam.path[0].x, beam.path[0].y);
            for (let i = 1; i < beam.path.length; i++) {
                ctx.lineTo(beam.path[i].x, beam.path[i].y);
            }
            ctx.stroke();
        }

        // Glow effect at the head
        ctx.beginPath();
        ctx.arc(beam.x, beam.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none bg-white"
    />
  );
}
