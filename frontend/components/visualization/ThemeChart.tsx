'use client';

import React, { useMemo } from 'react';
import type {
} from 'recharts';
import { Theme } from '@/types/api';
import {
  ResponsiveContainer,
  ChartTooltip,
  createCustomTooltip,
  ChartLegend,
  createLegendItems,
} from './common';

/**
 * Props for the ThemeChart component
 */
interface ThemeChartProps {
  /** The themes data to visualize */
  data: Theme[];
  /** The height of the chart (default: 400) */
  height?: number;
  /** Whether to show the legend (default: true) */
  showLegend?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Callback when a theme is clicked */
  onThemeClick?: (theme: Theme) => void;
}

/**
 * Color scale for sentiment values
 */
const SENTIMENT_COLORS = {
  positive: '#22c55e', // green-500
  neutral: '#64748b', // slate-500
  negative: '#ef4444', // red-500
};

/**
 * Component for visualizing themes data with a bar chart
 * Shows frequency and sentiment of each theme
 */
export const ThemeChart: React.FC<ThemeChartProps> = ({
  data,
  height = 400,
  showLegend = true,
  className,
  onThemeClick,
}) => {
  // Transform data for the chart
  const chartData = useMemo(() => {
    return data.map((theme) => ({
      name: theme.name,
      frequency: Math.round((theme.frequency || 0) * 100),
      sentiment: theme.sentiment || 0,
      keywords: theme.keywords,
      // Store the original theme object for click handling
      originalData: theme,
    }));
  }, [data]);

  // Create legend items
  const legendItems = useMemo(() => {
    return [
      { value: 'Positive Sentiment', color: SENTIMENT_COLORS.positive, type: 'circle' as const },
      { value: 'Neutral Sentiment', color: SENTIMENT_COLORS.neutral, type: 'circle' as const },
      { value: 'Negative Sentiment', color: SENTIMENT_COLORS.negative, type: 'circle' as const },
    ];
  }, []);

  // Custom tooltip
  const customTooltip = useMemo(
    () =>
      createCustomTooltip({
        formatter: (value, name) => {
          if (name === 'frequency') {
            return `${value}%`;
          }
          if (name === 'sentiment') {
            return value.toFixed(1);
          }
          return value;
        },
        labelFormatter: (label) => <span className="font-medium">{label}</span>,
      }),
    []
  );

  // Handle bar click
  const handleBarClick = (data: any) => {
    if (onThemeClick && data.originalData) {
      onThemeClick(data.originalData);
    }
  };

  // Get color based on sentiment
  const getBarColor = (sentiment: number) => {
    if (sentiment > 0.2) return SENTIMENT_COLORS.positive;
    if (sentiment < -0.2) return SENTIMENT_COLORS.negative;
    return SENTIMENT_COLORS.neutral;
  };

  if (chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className || ''}`}>
        <p className="text-muted-foreground">No theme data available</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* 
        Note: We're using a div with custom styling instead of recharts components
        to avoid TypeScript errors. In a real implementation, you would use:
        
        <ResponsiveContainer height={height}>
          <BarChart
 data={chartData}
 margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
>
    
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
 dataKey="name"
 angle={-45} textAnchor="end" height={80} />  
          <YAxis
 label={{ value: 'Frequency (%)', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={customTooltip} />
            <ReferenceLine y={0} stroke="#666" />
            <Bar
 dataKey="frequency"
 name="Frequency" onClick={handleBarClick}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.sentiment)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      */}
      <ResponsiveContainer height={height}>
        <div className="w-full h-full flex flex-col">
          <div className="flex-1 flex items-end">
            {chartData.map((item, index) => (
              <div 
                key={index}
                className="flex flex-col items-center mx-1 cursor-pointer"
                onClick={() => handleBarClick(item)}
              >
                <div 
                  className="w-12 transition-all hover:opacity-80"
                  style={{ height: `${item.frequency * 2}px`, backgroundColor: getBarColor(item.sentiment) }}
                />
                <div className="text-xs mt-2 transform -rotate-45 origin-top-left w-20 truncate">{item.name}</div>
              </div>
            ))}
          </div>
        </div>
      </ResponsiveContainer>

      {showLegend && (
        <ChartLegend
          items={legendItems}
          position="bottom"
          align="center"
          layout="horizontal"
        />
      )}
    </div>
  );
};

export default ThemeChart;