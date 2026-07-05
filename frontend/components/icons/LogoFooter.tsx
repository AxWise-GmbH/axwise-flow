import React from 'react';

interface LogoProps {
  className?: string;
  width?: number;
  height?: number;
}

export const LogoFooter: React.FC<LogoProps> = ({ 
  className = '', 
  width = 120, 
  height = 30 
}) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={width} 
      height={height} 
      viewBox="0 0 120 30"
      className={className}
    >
      {/* Background rectangle for the "Ax" part */}
      <rect x="2" y="5" width="20" height="20" rx="4" fill="#7b68ee"/>

      {/* "Ax" text in the rectangle */}
      <text x="12" y="19" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="bold" textAnchor="middle" fill="white">Ax</text>

      {/* "Wise" text next to the rectangle */}
      <text x="24" y="19" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="bold" textAnchor="start" fill="white">Wise</text>
    </svg>
  );
};

export default LogoFooter;
