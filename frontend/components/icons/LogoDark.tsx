import React from 'react';

interface LogoProps {
  className?: string;
  width?: number;
  height?: number;
}

export const LogoDark: React.FC<LogoProps> = ({ 
  className = '', 
  width = 240, 
  height = 60 
}) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={width} 
      height={height} 
      viewBox="0 0 240 60"
      className={className}
    >
      {/* Background rectangle for the "Ax" part */}
      <rect x="5" y="10" width="40" height="40" rx="8" fill="#7b68ee"/>

      {/* "Ax" text in the rectangle */}
      <text x="25" y="38" fontFamily="Arial, sans-serif" fontSize="24" fontWeight="bold" textAnchor="middle" fill="white">Ax</text>

      {/* "Wise" text next to the rectangle - moved closer to remove space */}
      <text x="48" y="38" fontFamily="Arial, sans-serif" fontSize="24" fontWeight="bold" textAnchor="start" fill="#ffffff">Wise</text>

      {/* Tagline */}
      <text x="55" y="50" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="normal" textAnchor="start" fill="#a0a3bd" textLength="170" lengthAdjust="spacingAndGlyphs">Your AI Co-Pilot for Product Development</text>
    </svg>
  );
};

export default LogoDark;
