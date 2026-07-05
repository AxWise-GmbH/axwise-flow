'use client';

import React from 'react';

/**
 * Props for the ChartLegend component
 */
interface ChartLegendProps {
  /** Whether to show the legend (default: true) */
  show?: boolean;
  /** The position of the legend (default: 'bottom') */
  position?: 'top' | 'right' | 'bottom' | 'left';
  /** The alignment of the legend (default: 'center') */
  align?: 'left' | 'center' | 'right';
  /** The layout of the legend (default: 'horizontal') */
  layout?: 'horizontal' | 'vertical';
  /** The margin around the legend */
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Additional CSS class names */
  className?: string;
  /** Legend items */
  items?: Array<{
    value: string;
    color: string;
    type?: 'circle' | 'rect' | 'line';
  }>;
}

/**
 * A customizable legend component for charts
 * This is a custom implementation that doesn't rely on recharts Legend component
 * to avoid TypeScript issues
 */
export const ChartLegend: React.FC<ChartLegendProps> = ({
  show = true,
  position = 'bottom',
  align = 'center',
  layout = 'horizontal',
  margin = { top: 0, right: 0, bottom: 0, left: 0 },
  className,
  items = [],
}) => {
  if (!show || items.length === 0) {
    return null;
  }

  // Determine flex direction based on layout
  const flexDirection = layout === 'horizontal' ? 'flex-row' : 'flex-col';
  
  // Determine alignment
  const alignmentClass = 
    align === 'left' ? 'justify-start' : 
    align === 'right' ? 'justify-end' : 
    'justify-center';

  // Determine position-based margin
  const positionMargin = {
    top: position === 'bottom' ? 16 : margin.top || 0,
    bottom: position === 'top' ? 16 : margin.bottom || 0,
    left: position === 'right' ? 16 : margin.left || 0,
    right: position === 'left' ? 16 : margin.right || 0,
  };

  return (
    <div 
      className={`flex ${flexDirection} ${alignmentClass} flex-wrap gap-4 ${className || ''}`}
      style={{
        marginTop: positionMargin.top,
        marginBottom: positionMargin.bottom,
        marginLeft: positionMargin.left,
        marginRight: positionMargin.right,
      }}
    >
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          <div 
            className="w-3 h-3 mr-2 rounded-sm flex-shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-sm text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Helper function to create legend items from chart data
 * @param data Chart data
 * @param nameKey The key to use for the name
 * @param colorMap Map of names to colors
 * @returns Array of legend items
 */
export const createLegendItems = (
  data: Array<any>,
  nameKey: string,
  colorMap: Record<string, string>
) => {
  const uniqueNames = Array.from(new Set(data.map(item => item[nameKey])));
  
  return uniqueNames.map(name => ({
    value: name as string,
    color: colorMap[name as string] || '#888888',
    type: 'circle' as const,
  }));
};

export default ChartLegend;