import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

export function FlowDiagram() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Animation variants for lines flowing from edges to center
  const lineVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { duration: 2, ease: "easeInOut" },
        opacity: { duration: 0.5 }
      }
    }
  };

  return (
    <div className="relative w-full mx-auto aspect-square flex items-center justify-center scale-[3]">
      <svg
        viewBox="0 0 600 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Gradient Definitions */}
        <defs>
          <linearGradient id="gradient-blue" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="gradient-orange" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <linearGradient id="gradient-purple" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>

        {/* Central Chip/Processor Container */}
        <g>
          {/* Dotted background pattern */}
          <motion.rect
            x="200"
            y="200"
            width="200"
            height="200"
            rx="20"
            fill="white"
            stroke="#e5e7eb"
            strokeWidth="2"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          />
          
          {/* Dot pattern */}
          {Array.from({ length: 20 }).map((_, i) =>
            Array.from({ length: 20 }).map((_, j) => (
              <motion.circle
                key={`${i}-${j}`}
                cx={210 + i * 9}
                cy={210 + j * 9}
                r="0.8"
                fill="#d1d5db"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                transition={{ duration: 0.3, delay: 0.4 + (i + j) * 0.005 }}
              />
            ))
          )}

          {/* Central black chip */}
          <motion.rect
            x="230"
            y="230"
            width="140"
            height="140"
            rx="12"
            fill="black"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, delay: 0.5, type: "spring" }}
          />

          {/* Hexagon logo in center */}
          <motion.g
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 1 }}
          >
            <path
              d="M300 270 L330 285 L330 315 L300 330 L270 315 L270 285 Z"
              stroke="white"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="300" cy="300" r="3" fill="white" />
          </motion.g>

          {/* Connection points around the chip */}
          {[
            { x: 300, y: 180 }, { x: 300, y: 420 }, // top, bottom
            { x: 180, y: 300 }, { x: 420, y: 300 }, // left, right
          ].map((point, i) => (
            <motion.g key={i}>
              <motion.circle
                cx={point.x}
                cy={point.y}
                r="4"
                fill="black"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 0.8 + i * 0.1 }}
              />
            </motion.g>
          ))}

          {/* Secondary connection points */}
          {[
            { x: 280, y: 195 }, { x: 320, y: 195 }, // top
            { x: 280, y: 405 }, { x: 320, y: 405 }, // bottom
            { x: 195, y: 280 }, { x: 195, y: 320 }, // left
            { x: 405, y: 280 }, { x: 405, y: 320 }, // right
          ].map((point, i) => (
            <motion.circle
              key={`sec-${i}`}
              cx={point.x}
              cy={point.y}
              r="3"
              fill="black"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, delay: 0.9 + i * 0.05 }}
            />
          ))}
        </g>

        {/* Animated flowing lines - Top (Blue gradient) */}
        <motion.path
          d="M 300 50 Q 300 100 300 180"
          stroke="url(#gradient-blue)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.2 }}
        />
        <motion.path
          d="M 280 60 Q 280 120 280 195"
          stroke="url(#gradient-blue)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.3 }}
        />
        <motion.path
          d="M 320 60 Q 320 120 320 195"
          stroke="#e5e7eb"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.35 }}
        />

        {/* Animated flowing lines - Bottom (Orange gradient) */}
        <motion.path
          d="M 300 550 Q 300 500 300 420"
          stroke="url(#gradient-orange)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.2 }}
        />
        <motion.path
          d="M 280 540 Q 280 480 280 405"
          stroke="#e5e7eb"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.3 }}
        />
        <motion.path
          d="M 320 540 Q 320 480 320 405"
          stroke="url(#gradient-orange)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.35 }}
        />

        {/* Animated flowing lines - Left (Gray) */}
        <motion.path
          d="M 50 300 Q 100 300 180 300"
          stroke="#d1d5db"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.4 }}
        />
        <motion.path
          d="M 60 280 Q 120 280 195 280"
          stroke="#d1d5db"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.45 }}
        />
        <motion.path
          d="M 60 320 Q 120 320 195 320"
          stroke="#d1d5db"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.5 }}
        />

        {/* Animated flowing lines - Right (Purple gradient) */}
        <motion.path
          d="M 550 300 Q 500 300 420 300"
          stroke="url(#gradient-purple)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.4 }}
        />
        <motion.path
          d="M 540 280 Q 480 280 405 280"
          stroke="#d1d5db"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.45 }}
        />
        <motion.path
          d="M 540 320 Q 480 320 405 320"
          stroke="url(#gradient-purple)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.5 }}
        />

        {/* Curved corner flows - Top Left (gray) */}
        <motion.path
          d="M 100 150 Q 150 200 195 280"
          stroke="#d1d5db"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.6 }}
        />

        {/* Curved corner flows - Bottom Right (purple) */}
        <motion.path
          d="M 500 450 Q 450 400 405 320"
          stroke="url(#gradient-purple)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.6 }}
        />

        {/* Curved corner flows - Bottom Left (gray) */}
        <motion.path
          d="M 100 500 Q 150 420 195 320"
          stroke="#d1d5db"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
          variants={lineVariants}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          transition={{ delay: 1.65 }}
        />

        {/* Animated data particles flowing along paths */}
        {isVisible && (
          <>
            {/* Particle on top blue line */}
            <motion.circle
              cx="300"
              cy="50"
              r="3"
              fill="#6366f1"
              initial={{ opacity: 0 }}
              animate={{ 
                cy: [50, 180],
                opacity: [0, 1, 1, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1,
                ease: "easeInOut"
              }}
            />
            
            {/* Particle on bottom orange line */}
            <motion.circle
              cx="300"
              cy="550"
              r="3"
              fill="#f97316"
              initial={{ opacity: 0 }}
              animate={{ 
                cy: [550, 420],
                opacity: [0, 1, 1, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1,
                delay: 0.5,
                ease: "easeInOut"
              }}
            />

            {/* Particle on right purple line */}
            <motion.circle
              cx="550"
              cy="300"
              r="3"
              fill="#8b5cf6"
              initial={{ opacity: 0 }}
              animate={{ 
                cx: [550, 420],
                opacity: [0, 1, 1, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1,
                delay: 1,
                ease: "easeInOut"
              }}
            />

            {/* Particle on left gray line */}
            <motion.circle
              cx="50"
              cy="300"
              r="3"
              fill="#9ca3af"
              initial={{ opacity: 0 }}
              animate={{ 
                cx: [50, 180],
                opacity: [0, 1, 1, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1,
                delay: 1.5,
                ease: "easeInOut"
              }}
            />
          </>
        )}
      </svg>
    </div>
  );
}