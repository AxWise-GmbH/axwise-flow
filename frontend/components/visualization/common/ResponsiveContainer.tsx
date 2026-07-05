'use client';

import React from 'react';
import { ResponsiveContainer as RechartsResponsiveContainer } from 'recharts';

/**
 * Props for the ResponsiveContainer component
 */
interface ResponsiveContainerProps {
  /** The content to render inside the container */
  children: React.ReactNode;
  /** The width of the container (default: 100%) */
  width?: number | string;
  /** The height of the container (default: 400) */
  height?: number;
  /** Additional CSS class names */
  className?: string;
}

/**
 * A responsive container for charts that adapts to the parent container size
 * This is a wrapper around the recharts ResponsiveContainer with sensible defaults
 */
export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  width = '100%',
  height = 400,
  className,
}) => {
  return (
    <div className={className}>
      <RechartsResponsiveContainer width={width} height={height}>
        {children}
      </RechartsResponsiveContainer>
    </div>
  );
};

export default ResponsiveContainer;