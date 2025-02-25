'use client';

import React, { useMemo } from 'react';
import { SentimentOverview, SentimentData } from '@/types/api';
import { ResponsiveContainer, ChartLegend } from './common';

/**
 * Props for the SentimentGraph component
 */
interface SentimentGraphProps {
  /** The sentiment overview data to visualize */
  data: SentimentOverview;
  /** Detailed sentiment data (optional) */
  detailedData?: SentimentData[];
  /** The height of the chart (default: 400) */
  height?: number;
  /** Whether to show the legend (default: true) */
  showLegend?: boolean;
  /** Additional CSS class names */
  className?: string;
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
 * Component for visualizing sentiment data
 * Shows a pie chart for overall sentiment distribution
 */
export const SentimentGraph: React.FC<SentimentGraphProps> = ({
  data,
  detailedData,
  height = 400,
  showLegend = true,
  className,
}) => {
  // Calculate percentages for display
  const positivePercent = Math.round(data.positive * 100);
  const neutralPercent = Math.round(data.neutral * 100);
  const negativePercent = Math.round(data.negative * 100);

  // Create legend items
  const legendItems = useMemo(() => {
    return [
      { value: `Positive (${positivePercent}%)`, color: SENTIMENT_COLORS.positive, type: 'circle' as const },
      { value: `Neutral (${neutralPercent}%)`, color: SENTIMENT_COLORS.neutral, type: 'circle' as const },
      { value: `Negative (${negativePercent}%)`, color: SENTIMENT_COLORS.negative, type: 'circle' as const },
    ];
  }, [positivePercent, neutralPercent, negativePercent]);

  // Calculate the pie chart segments
  const calculateStrokeDasharray = (percent: number) => {
    const circumference = 2 * Math.PI * 50; // 50 is the radius
    return `${(percent / 100) * circumference} ${circumference}`;
  };

  // Calculate the starting position for each segment
  const calculateStrokeDashoffset = (
    percent: number,
    previousPercents: number
  ) => {
    const circumference = 2 * Math.PI * 50;
    return circumference - (previousPercents / 100) * circumference;
  };

  return (
    <div className={className}>
      <div className="flex flex-col md:flex-row items-center justify-between">
        <div className="w-full md:w-1/2">
          <ResponsiveContainer height={height}>
            <div className="relative w-full h-full flex items-center justify-center">
              {/* SVG Pie Chart */}
              <svg viewBox="0 0 120 120" className="w-full max-w-xs">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={SENTIMENT_COLORS.positive}
                  strokeWidth="20"
                  strokeDasharray={calculateStrokeDasharray(positivePercent)}
                  className="origin-center -rotate-90"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={SENTIMENT_COLORS.neutral}
                  strokeWidth="20"
                  strokeDasharray={calculateStrokeDasharray(neutralPercent)}
                  strokeDashoffset={calculateStrokeDashoffset(
                    neutralPercent,
                    positivePercent
                  )}
                  className="origin-center -rotate-90"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={SENTIMENT_COLORS.negative}
                  strokeWidth="20"
                  strokeDasharray={calculateStrokeDasharray(negativePercent)}
                  strokeDashoffset={calculateStrokeDashoffset(
                    negativePercent,
                    positivePercent + neutralPercent
                  )}
                  className="origin-center -rotate-90"
                />
                <text
                  x="60"
                  y="60"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-lg font-semibold fill-foreground"
                >
                  Sentiment
                </text>
              </svg>
            </div>
          </ResponsiveContainer>
        </div>

        <div className="w-full md:w-1/2 mt-6 md:mt-0">
          <div className="grid grid-cols-1 gap-4">
            <div 
              className="p-4 rounded-md"
              style={{ backgroundColor: `${SENTIMENT_COLORS.positive}20` }}
            >
              <h3 className="font-medium" style={{ color: SENTIMENT_COLORS.positive }}>
                Positive
              </h3>
              <p className="text-2xl font-bold" style={{ color: SENTIMENT_COLORS.positive }}>
                {positivePercent}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {positivePercent > 50 
                  ? 'Majority of the sentiment is positive.' 
                  : positivePercent > 30 
                    ? 'A significant portion of sentiment is positive.' 
                    : 'A small portion of sentiment is positive.'}
              </p>
            </div>

            <div 
              className="p-4 rounded-md"
              style={{ backgroundColor: `${SENTIMENT_COLORS.neutral}20` }}
            >
              <h3 className="font-medium" style={{ color: SENTIMENT_COLORS.neutral }}>
                Neutral
              </h3>
              <p className="text-2xl font-bold" style={{ color: SENTIMENT_COLORS.neutral }}>
                {neutralPercent}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {neutralPercent > 50 
                  ? 'Majority of the sentiment is neutral.' 
                  : neutralPercent > 30 
                    ? 'A significant portion of sentiment is neutral.' 
                    : 'A small portion of sentiment is neutral.'}
              </p>
            </div>

            <div 
              className="p-4 rounded-md"
              style={{ backgroundColor: `${SENTIMENT_COLORS.negative}20` }}
            >
              <h3 className="font-medium" style={{ color: SENTIMENT_COLORS.negative }}>
                Negative
              </h3>
              <p className="text-2xl font-bold" style={{ color: SENTIMENT_COLORS.negative }}>
                {negativePercent}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {negativePercent > 50 
                  ? 'Majority of the sentiment is negative.' 
                  : negativePercent > 30 
                    ? 'A significant portion of sentiment is negative.' 
                    : 'A small portion of sentiment is negative.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showLegend && (
        <div className="mt-6">
          <ChartLegend
            items={legendItems}
            position="bottom"
            align="center"
            layout="horizontal"
          />
        </div>
      )}
    </div>
  );
};

export default SentimentGraph;