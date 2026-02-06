import { motion } from 'motion/react';
import { ReactNode } from 'react';

interface Button3DProps {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  href?: string;
}

export function Button3D({ children, size = 'md', variant = 'primary', onClick, href }: Button3DProps) {
  const sizeClasses = {
    sm: 'px-5 py-2 text-sm',
    md: 'px-8 py-3',
    lg: 'px-10 py-4'
  };

  const variantClasses = {
    primary: 'bg-black text-white',
    secondary: 'bg-white text-black border border-gray-200'
  };

  const commonStyles = {
    boxShadow: variant === 'primary' 
      ? '0 4px 14px 0 rgba(0, 0, 0, 0.25), 0 10px 30px 0 rgba(0, 0, 0, 0.15)'
      : '0 4px 14px 0 rgba(0, 0, 0, 0.1), 0 10px 30px 0 rgba(0, 0, 0, 0.05)'
  };

  const hoverStyles = {
    y: -2,
    boxShadow: variant === 'primary'
      ? '0 6px 20px 0 rgba(0, 0, 0, 0.3), 0 15px 40px 0 rgba(0, 0, 0, 0.2)'
      : '0 6px 20px 0 rgba(0, 0, 0, 0.15), 0 15px 40px 0 rgba(0, 0, 0, 0.1)'
  };

  const tapStyles = {
    y: 0,
    boxShadow: variant === 'primary'
      ? '0 2px 8px 0 rgba(0, 0, 0, 0.2), 0 5px 15px 0 rgba(0, 0, 0, 0.1)'
      : '0 2px 8px 0 rgba(0, 0, 0, 0.08), 0 5px 15px 0 rgba(0, 0, 0, 0.05)'
  };

  const commonClassName = `${sizeClasses[size]} ${variantClasses[variant]} rounded-xl relative cursor-pointer overflow-hidden group`;

  const content = (
    <>
      <motion.div
        className="absolute inset-0 w-full h-full"
        initial={{ x: '100%', opacity: 0 }}
        whileHover={{ 
          x: ['-100%', '100%'],
          opacity: [0, 1, 0] 
        }}
        transition={{ 
          repeat: Infinity, 
          duration: 1.5, 
          ease: "linear",
          repeatDelay: 0.5 
        }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
          transform: 'skewX(-20deg)',
        }}
      />
      <div className="relative z-10">
        {children}
      </div>
    </>
  );

  if (href) {
    return (
      <motion.a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${commonClassName} inline-block`}
        style={commonStyles}
        whileHover={hoverStyles}
        whileTap={tapStyles}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 25
        }}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      className={commonClassName}
      style={commonStyles}
      whileHover={hoverStyles}
      whileTap={tapStyles}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25
      }}
    >
      {content}
    </motion.button>
  );
}