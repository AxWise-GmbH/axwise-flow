import React from 'react';

interface ConstructorUniversityLogoProps {
  className?: string;
  width?: number;
  height?: number;
}

export const ConstructorUniversityLogo: React.FC<ConstructorUniversityLogoProps> = ({ 
  className = '', 
  width = 200, 
  height = 60 
}) => {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 200 60" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Constructor University Logo */}
      <rect x="0" y="0" width="40" height="40" rx="8" fill="#0066CC"/>
      <rect x="8" y="8" width="24" height="24" rx="4" fill="white"/>
      <rect x="12" y="12" width="16" height="16" rx="2" fill="#0066CC"/>
      
      {/* Text with theme-aware colors */}
      <text 
        x="50" 
        y="20" 
        fontFamily="Arial, sans-serif" 
        fontSize="14" 
        fontWeight="bold" 
        className="fill-gray-900 dark:fill-white"
      >
        Constructor
      </text>
      <text 
        x="50" 
        y="35" 
        fontFamily="Arial, sans-serif" 
        fontSize="12" 
        className="fill-gray-900 dark:fill-white"
      >
        University
      </text>
      
      {/* Subtitle */}
      <text 
        x="50" 
        y="50" 
        fontFamily="Arial, sans-serif" 
        fontSize="8" 
        className="fill-gray-600 dark:fill-gray-400"
      >
        Bremen, Germany
      </text>
    </svg>
  );
};
