'use client';

import React, { useMemo } from 'react';
import { SentimentOverview, SentimentData } from '@/types/api';
import { ResponsiveContainer, ChartLegend, createCustomTooltip } from './common';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Sector,
  ResponsiveContainer as RechartsResponsiveContainer
} from 'recharts';

/**
 * Props for the SentimentGraph component
 */
interface SentimentGraphProps {
  /** The sentiment overview data to visualize */
  data: SentimentOverview;
  /** Detailed sentiment data (optional) - used for showing sentiment trends */
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
 * Default sentiment values
 */
const DEFAULT_SENTIMENT = {
  positive: 0.33,
  neutral: 0.34,
  negative: 0.33,
};

/**
 * Component for visualizing sentiment data
 * Shows a pie chart for overall sentiment distribution and a trend line for detailed data
 */
export const SentimentGraph: React.FC<SentimentGraphProps> = ({
  data,
  detailedData = [],
  height = 400,
  showLegend = true,
  className,
}) => {
  // Validate and normalize sentiment data
  const sentimentData = useMemo(() => {
    console.log('Received sentiment data:', data);

    // Check if data is undefined or has invalid values
    if (!data || 
        typeof data.positive !== 'number' || 
        typeof data.neutral !== 'number' || 
        typeof data.negative !== 'number') {
      console.warn('Invalid sentiment data, using defaults:', DEFAULT_SENTIMENT);
      return DEFAULT_SENTIMENT;
    }

    // Normalize values to ensure they sum to 1
    const total = data.positive + data.neutral + data.negative;
    if (total === 0) {
      console.warn('All sentiment values are 0, using defaults');
      return DEFAULT_SENTIMENT;
    }

    if (Math.abs(total - 1) > 0.01) { // Allow for small floating-point differences
      console.warn('Sentiment values do not sum to 1, normalizing:', { total, data });
      return {
        positive: data.positive / total,
        neutral: data.neutral / total,
        negative: data.negative / total,
      };
    }

    return data;
  }, [data]);

  // Process detailed sentiment data for trends
  const detailedStats = useMemo(() => {
    if (!detailedData || detailedData.length === 0) return null;

    const total = detailedData.length;
    const positiveCount = detailedData.filter(d => d.score > 0.2).length;
    const negativeCount = detailedData.filter(d => d.score < -0.2).length;
    const neutralCount = total - positiveCount - negativeCount;

    return {
      totalResponses: total,
      averageScore: detailedData.reduce((sum, d) => sum + d.score, 0) / total,
      positiveCount,
      neutralCount,
      negativeCount,
    };
  }, [detailedData]);
  
  // Calculate percentages for display
  const positivePercent = Math.round(sentimentData.positive * 100);
  const neutralPercent = Math.round(sentimentData.neutral * 100);
  const negativePercent = Math.round(sentimentData.negative * 100);

  // Transform data for the pie chart
  const pieData = useMemo(() => [
    { name: 'Positive', value: positivePercent, color: SENTIMENT_COLORS.positive },
    { name: 'Neutral', value: neutralPercent, color: SENTIMENT_COLORS.neutral },
    { name: 'Negative', value: negativePercent, color: SENTIMENT_COLORS.negative },
  ], [positivePercent, neutralPercent, negativePercent]);

  console.log('Pie chart data:', pieData);

  // Active sector state for hover effect
  const [activeIndex, setActiveIndex] = React.useState<number | undefined>(undefined);
  const onPieEnter = (_: any, index: number) => setActiveIndex(index);
  const onPieLeave = () => setActiveIndex(undefined);
  
  // Create legend items
  const legendItems = useMemo(() => {
    return [
      { value: `Positive (${positivePercent}%)`, color: SENTIMENT_COLORS.positive, type: 'circle' as const },
      { value: `Neutral (${neutralPercent}%)`, color: SENTIMENT_COLORS.neutral, type: 'circle' as const },
      { value: `Negative (${negativePercent}%)`, color: SENTIMENT_COLORS.negative, type: 'circle' as const },
    ];
  }, [positivePercent, neutralPercent, negativePercent]);

  // Custom tooltip
  const customTooltip = useMemo(
    () =>
      createCustomTooltip({
        formatter: (value) => `${value}%`,
        labelFormatter: (label) => <span className="font-medium">{label}</span>,
      }),
    []
  );

  // Render active shape with hover effect
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;
    
    return (
      <g>
        <text x={cx} y={cy} dy={-20} textAnchor="middle" fill={fill} className="text-sm font-medium">
          {payload.name}
        </text>
        <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill} className="text-lg font-bold">
          {value}%
        </text>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 6}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          opacity={0.8}
        />
      </g>
    );
  };

  return (
    <div className={className}>
      <div className="flex flex-col md:flex-row items-center justify-between">
        <div className="w-full md:w-1/2">
          <ResponsiveContainer height={height}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <text 
                x="50%" 
                y="50%" 
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-lg font-semibold fill-foreground"
              >
                Sentiment
              </text>
              <Tooltip content={customTooltip} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="w-full md:w-1/2 mt-6 md:mt-0">
          <div className="grid grid-cols-1 gap-4">
            {/* Positive Sentiment Card */}
            <div 
              className="p-4 rounded-md"
              style={{ backgroundColor: `${SENTIMENT_COLORS.positive}20` }}
            >
              <h3 className="font-medium" style={{ color: SENTIMENT_COLORS.positive }}>
                Positive
              </h3>
              <div className="flex justify-between items-baseline">
                <p className="text-2xl font-bold" style={{ color: SENTIMENT_COLORS.positive }}>
                  {positivePercent}%
                </p>
                {detailedStats && (
                  <p className="text-sm text-muted-foreground">
                    {detailedStats.positiveCount} responses
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {positivePercent > 50 
                  ? 'Majority of the sentiment is positive.' 
                  : positivePercent > 30 
                    ? 'A significant portion of sentiment is positive.' 
                    : 'A small portion of sentiment is positive.'}
              </p>
            </div>

            {/* Neutral Sentiment Card */}
            <div 
              className="p-4 rounded-md"
              style={{ backgroundColor: `${SENTIMENT_COLORS.neutral}20` }}
            >
              <h3 className="font-medium" style={{ color: SENTIMENT_COLORS.neutral }}>
                Neutral
              </h3>
              <div className="flex justify-between items-baseline">
                <p className="text-2xl font-bold" style={{ color: SENTIMENT_COLORS.neutral }}>
                  {neutralPercent}%
                </p>
                {detailedStats && (
                  <p className="text-sm text-muted-foreground">
                    {detailedStats.neutralCount} responses
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {neutralPercent > 50 
                  ? 'Majority of the sentiment is neutral.' 
                  : neutralPercent > 30 
                    ? 'A significant portion of sentiment is neutral.' 
                    : 'A small portion of sentiment is neutral.'}
              </p>
            </div>

            {/* Negative Sentiment Card */}
            <div 
              className="p-4 rounded-md"
              style={{ backgroundColor: `${SENTIMENT_COLORS.negative}20` }}
            >
              <h3 className="font-medium" style={{ color: SENTIMENT_COLORS.negative }}>
                Negative
              </h3>
              <div className="flex justify-between items-baseline">
                <p className="text-2xl font-bold" style={{ color: SENTIMENT_COLORS.negative }}>
                  {negativePercent}%
                </p>
                {detailedStats && (
                  <p className="text-sm text-muted-foreground">
                    {detailedStats.negativeCount} responses
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {negativePercent > 50 
                  ? 'Majority of the sentiment is negative.' 
                  : negativePercent > 30 
                    ? 'A significant portion of sentiment is negative.' 
                    : 'A small portion of sentiment is negative.'}
              </p>
            </div>

            {/* Overall Stats */}
            {detailedStats && (
              <div className="p-4 rounded-md bg-card border border-border">
                <h3 className="font-medium mb-2">Overall Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Responses</p>
                    <p className="text-lg font-semibold">{detailedStats.totalResponses}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Average Score</p>
                    <p className="text-lg font-semibold">
                      {detailedStats.averageScore.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}
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