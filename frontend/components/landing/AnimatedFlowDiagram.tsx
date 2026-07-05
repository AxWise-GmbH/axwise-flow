import { motion } from 'motion/react';

export function AnimatedFlowDiagram() {
  // Animation config for flowing lines
  const pathAnimation = {
    initial: { pathLength: 0, opacity: 0 },
    animate: { 
      pathLength: 1, 
      opacity: [0, 1, 1, 0],
    },
    transition: {
      pathLength: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.5 },
      opacity: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.5, times: [0, 0.1, 0.8, 1] }
    }
  };

  return (
    <div className="relative w-full aspect-square flex items-center justify-center">
      <svg
        viewBox="0 0 800 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          {/* Gradient definitions for colored lines */}
          <linearGradient id="gradient-top" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="gradient-bottom" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="gradient-left" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="gradient-right" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="gradient-tl" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="gradient-tr" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="gradient-bl" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="gradient-br" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>

        {/* Grey base lines - static */}
        <g stroke="#e5e7eb" strokeWidth="2" opacity="0.6">
          {/* Top straight lines */}
          <line x1="400" y1="50" x2="400" y2="240" />
          <line x1="385" y1="50" x2="385" y2="240" />
          <line x1="415" y1="50" x2="415" y2="240" />
          <line x1="370" y1="50" x2="370" y2="240" />
          
          {/* Bottom straight lines */}
          <line x1="400" y1="750" x2="400" y2="560" />
          <line x1="385" y1="750" x2="385" y2="560" />
          <line x1="415" y1="750" x2="415" y2="560" />
          <line x1="370" y1="750" x2="370" y2="560" />
          
          {/* Left straight lines */}
          <line x1="50" y1="400" x2="240" y2="400" />
          <line x1="50" y1="385" x2="240" y2="385" />
          <line x1="50" y1="415" x2="240" y2="415" />
          <line x1="50" y1="370" x2="240" y2="370" />
          
          {/* Right straight lines */}
          <line x1="750" y1="400" x2="560" y2="400" />
          <line x1="750" y1="385" x2="560" y2="385" />
          <line x1="750" y1="415" x2="560" y2="415" />
          <line x1="750" y1="370" x2="560" y2="370" />
          
          {/* Curved paths - Top Left */}
          <path d="M 100 100 Q 200 150, 280 300" />
          
          {/* Curved paths - Top Right */}
          <path d="M 700 100 Q 600 150, 520 300" />
          
          {/* Curved paths - Bottom Left */}
          <path d="M 100 700 Q 200 650, 280 500" />
          
          {/* Curved paths - Bottom Right */}
          <path d="M 700 700 Q 600 650, 520 500" />
        </g>

        {/* Connection dots */}
        <g fill="#1f2937">
          {/* Top dots */}
          <circle cx="400" cy="240" r="4" />
          <circle cx="385" cy="240" r="4" />
          <circle cx="415" cy="240" r="4" />
          <circle cx="370" cy="240" r="4" />
          
          {/* Bottom dots */}
          <circle cx="400" cy="560" r="4" />
          <circle cx="385" cy="560" r="4" />
          <circle cx="415" cy="560" r="4" />
          <circle cx="370" cy="560" r="4" />
          
          {/* Left dots */}
          <circle cx="240" cy="400" r="4" />
          <circle cx="240" cy="385" r="4" />
          <circle cx="240" cy="415" r="4" />
          <circle cx="240" cy="370" r="4" />
          
          {/* Right dots */}
          <circle cx="560" cy="400" r="4" />
          <circle cx="560" cy="385" r="4" />
          <circle cx="560" cy="415" r="4" />
          <circle cx="560" cy="370" r="4" />
        </g>

        {/* Animated colored lines */}
        <g strokeWidth="3" strokeLinecap="round">
          {/* Top line */}
          <motion.line
            x1="400" y1="50" x2="400" y2="240"
            stroke="url(#gradient-top)"
            {...pathAnimation}
            transition={{
              ...pathAnimation.transition,
              delay: 0
            }}
          />
          
          {/* Bottom line */}
          <motion.line
            x1="400" y1="750" x2="400" y2="560"
            stroke="url(#gradient-bottom)"
            {...pathAnimation}
            transition={{
              ...pathAnimation.transition,
              delay: 0.3
            }}
          />
          
          {/* Left line */}
          <motion.line
            x1="50" y1="400" x2="240" y2="400"
            stroke="url(#gradient-left)"
            {...pathAnimation}
            transition={{
              ...pathAnimation.transition,
              delay: 0.6
            }}
          />
          
          {/* Right line */}
          <motion.line
            x1="750" y1="400" x2="560" y2="400"
            stroke="url(#gradient-right)"
            {...pathAnimation}
            transition={{
              ...pathAnimation.transition,
              delay: 0.9
            }}
          />
          
          {/* Top Left curve */}
          <motion.path
            d="M 100 100 Q 200 150, 280 300"
            stroke="url(#gradient-tl)"
            {...pathAnimation}
            transition={{
              ...pathAnimation.transition,
              delay: 1.2
            }}
          />
          
          {/* Top Right curve */}
          <motion.path
            d="M 700 100 Q 600 150, 520 300"
            stroke="url(#gradient-tr)"
            {...pathAnimation}
            transition={{
              ...pathAnimation.transition,
              delay: 1.5
            }}
          />
          
          {/* Bottom Left curve */}
          <motion.path
            d="M 100 700 Q 200 650, 280 500"
            stroke="url(#gradient-bl)"
            {...pathAnimation}
            transition={{
              ...pathAnimation.transition,
              delay: 1.8
            }}
          />
          
          {/* Bottom Right curve */}
          <motion.path
            d="M 700 700 Q 600 650, 520 500"
            stroke="url(#gradient-br)"
            {...pathAnimation}
            transition={{
              ...pathAnimation.transition,
              delay: 2.1
            }}
          />
        </g>

        {/* Central container with dotted border */}
        <rect
          x="280"
          y="240"
          width="240"
          height="320"
          fill="white"
          stroke="#e5e7eb"
          strokeWidth="1"
          strokeDasharray="3,3"
          rx="8"
        />

        {/* Central black card */}
        <rect
          x="310"
          y="280"
          width="180"
          height="180"
          fill="url(#card-gradient)"
          rx="12"
        />
        
        <defs>
          <linearGradient id="card-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#111827" />
          </linearGradient>
        </defs>

        {/* Hexagon logo */}
        <path
          d="M 400 320 L 440 340 L 440 380 L 400 400 L 360 380 L 360 340 Z"
          stroke="white"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Center dot */}
        <circle cx="400" cy="360" r="3" fill="white" />
      </svg>
    </div>
  );
}
