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
  /** Supporting statements for each sentiment category */
  supportingStatements?: {
    positive: string[];
    neutral: string[];
    negative: string[];
  };
  /** The height of the chart (default: 400) */
  height?: number;
  /** Whether to show the legend (default: true) */
  showLegend?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Whether to show statements (default: true) */
  showStatements?: boolean;
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
 * Shows a pie chart for overall sentiment distribution and supporting statements
 */
export const SentimentGraph: React.FC<SentimentGraphProps> = ({
  data,
  detailedData = [],
  supportingStatements = { positive: [], neutral: [], negative: [] },
  height = 400,
  showLegend = true,
  showStatements = true,
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

  // Validate and process supporting statements
  const processedStatements = useMemo(() => {
    console.log('Processing supporting statements:', supportingStatements);
    
    // Ensure all categories exist and contain arrays
    const processed = {
      positive: Array.isArray(supportingStatements.positive) ? supportingStatements.positive : [],
      neutral: Array.isArray(supportingStatements.neutral) ? supportingStatements.neutral : [],
      negative: Array.isArray(supportingStatements.negative) ? supportingStatements.negative : []
    };
    
    // Filter out empty statements and trim whitespace
    processed.positive = processed.positive
      .filter(statement => statement && typeof statement === 'string')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
      
    processed.neutral = processed.neutral
      .filter(statement => statement && typeof statement === 'string')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
      
    processed.negative = processed.negative
      .filter(statement => statement && typeof statement === 'string')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    console.log('Processed supporting statements:', {
      positive: processed.positive.length,
      neutral: processed.neutral.length,
      negative: processed.negative.length
    });
    
    return processed;
  }, [supportingStatements]);

  // Render statements section with proper colors
  const renderStatements = () => {
    if (!showStatements) return null;

    return (
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Positive Statements */}
        <div 
          className="p-4 rounded-md border"
          style={{ borderColor: SENTIMENT_COLORS.positive, backgroundColor: `${SENTIMENT_COLORS.positive}10` }}
        >
          <h3 className="text-base font-semibold mb-2" style={{ color: SENTIMENT_COLORS.positive }}>
            Positive Statements
          </h3>
          <ul className="space-y-2">
            {processedStatements.positive.map((statement, index) => (
              <li key={index} className="text-sm text-muted-foreground">
                {statement}
              </li>
            ))}
            {processedStatements.positive.length === 0 && (
              <li className="text-sm text-muted-foreground italic">No positive statements found</li>
            )}
          </ul>
        </div>

        {/* Neutral Statements */}
        <div 
          className="p-4 rounded-md border"
          style={{ borderColor: SENTIMENT_COLORS.neutral, backgroundColor: `${SENTIMENT_COLORS.neutral}10` }}
        >
          <h3 className="text-base font-semibold mb-2" style={{ color: SENTIMENT_COLORS.neutral }}>
            Neutral Statements
          </h3>
          <ul className="space-y-2">
            {processedStatements.neutral.map((statement, index) => (
              <li key={index} className="text-sm text-muted-foreground">
                {statement}
              </li>
            ))}
            {processedStatements.neutral.length === 0 && (
              <li className="text-sm text-muted-foreground italic">No neutral statements found</li>
            )}
          </ul>
        </div>

        {/* Negative Statements */}
        <div 
          className="p-4 rounded-md border"
          style={{ borderColor: SENTIMENT_COLORS.negative, backgroundColor: `${SENTIMENT_COLORS.negative}10` }}
        >
          <h3 className="text-base font-semibold mb-2" style={{ color: SENTIMENT_COLORS.negative }}>
            Negative Statements
          </h3>
          <ul className="space-y-2">
            {processedStatements.negative.map((statement, index) => (
              <li key={index} className="text-sm text-muted-foreground">
                {statement}
              </li>
            ))}
            {processedStatements.negative.length === 0 && (
              <li className="text-sm text-muted-foreground italic">No negative statements found</li>
            )}
          </ul>
        </div>
      </div>
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

      {/* Supporting Statements Section */}
      {renderStatements()}
    </div>
  );
};

export default SentimentGraph;