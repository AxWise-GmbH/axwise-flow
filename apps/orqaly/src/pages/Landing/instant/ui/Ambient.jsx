import { useEffect, useRef } from 'react';

/** Slow drifting light, film grain and a scroll-progress hairline. All decoration. */
export default function Ambient() {
  const progressRef = useRef(null);

  useEffect(() => {
    const bar = progressRef.current;
    if (!bar) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--oi-progress', max > 0 ? String(window.scrollY / max) : '0');
    };
    // Scroll fires far more often than the screen repaints; one write per frame is enough.
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="oi-ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <svg className="oi-grain" aria-hidden="true" focusable="false">
        <filter id="oi-grain-filter">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#oi-grain-filter)" />
      </svg>
      <div ref={progressRef} className="oi-progress" aria-hidden="true" />
    </>
  );
}
