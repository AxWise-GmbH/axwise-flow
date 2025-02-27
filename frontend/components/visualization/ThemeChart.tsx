'use client';

import React, { useMemo, useState } from 'react';
import type {
  BarChart as BarChartType,
  CartesianGrid as CartesianGridType,
  XAxis as XAxisType,
  YAxis as YAxisType,
  Tooltip as TooltipType,
  Bar as BarType,
  Cell as CellType,
  ReferenceLine as ReferenceLineType,
  Legend as LegendType,
} from 'recharts';
import { Theme } from '@/types/api';
import {
  ResponsiveContainer,
  ChartTooltip,
  createCustomTooltip,
  ChartLegend,
  createLegendItems,
} from './common';
import {
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Cell,
  ReferenceLine,
} from 'recharts';

interface ThemeChartProps {
  data: Theme[];
  height?: number;
  showLegend?: boolean;
  className?: string;
  onThemeClick?: (theme: Theme) => void;
}

const SENTIMENT_COLORS = {
  positive: '#22c55e', // green-500
  neutral: '#64748b', // slate-500
  negative: '#ef4444', // red-500
};

export const ThemeChart: React.FC<ThemeChartProps> = ({
  data,
  height = 400,
  showLegend = true,
  className,
  onThemeClick,
}) => {
  const [expandedThemes, setExpandedThemes] = useState<Record<string, boolean>>({});
  
  const chartData = useMemo(() => {
    const sortedData = [...data].sort((a, b) => {
      const freqA = a.frequency || 0;
      const freqB = b.frequency || 0;
      return freqB - freqA;
    });
    
    return sortedData.map((theme) => ({
      name: theme.name,
      shortName: theme.name.length > 20 ? `${theme.name.slice(0, 20)}...` : theme.name,
      frequency: Math.min(100, Math.round(((theme.frequency || 0) * 100))),
      sentiment: theme.sentiment || 0,
      keywords: theme.keywords,
      originalData: theme,
    }));
  }, [data]);

  const legendItems = useMemo(() => {
    return [
      { value: 'Positive Sentiment', color: SENTIMENT_COLORS.positive, type: 'circle' as const },
      { value: 'Neutral Sentiment', color: SENTIMENT_COLORS.neutral, type: 'circle' as const },
      { value: 'Negative Sentiment', color: SENTIMENT_COLORS.negative, type: 'circle' as const },
    ];
  }, []);

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

  const toggleExpanded = (themeId: number) => {
    setExpandedThemes(prev => ({
      ...prev,
      [themeId]: !prev[themeId]
    }));
  };

  const handleBarClick = (data: any) => {
    if (onThemeClick && data.originalData) {
      onThemeClick(data.originalData);
    }
  };

  const getBarColor = (sentiment: number) => {
    if (sentiment >= 0.2) return SENTIMENT_COLORS.positive;
    if (sentiment <= -0.2) return SENTIMENT_COLORS.negative;
    return SENTIMENT_COLORS.neutral;
  };

  const getSentimentLabel = (sentiment: number | undefined) => {
    if (typeof sentiment !== 'number') return 'Neutral';
    if (sentiment >= 0.2) return 'Positive';
    if (sentiment <= -0.2) return 'Negative';
    return 'Neutral';
  };

  const renderSupportingStatements = (theme: Theme) => {
    const isExpanded = expandedThemes[theme.id] || false;
    const statements = theme.statements || theme.examples || [];
    const statementLabel = theme.statements ? 'Supporting Statements' : 'Examples';
    
    if (statements.length === 0) {
      return null;
    }
    
    return (
      <div className="mt-2">
        <button
          type="button"
          className="text-xs text-primary flex items-center"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(theme.id);
          }}
        >
          {isExpanded ? 'Hide' : 'Show'} {statementLabel}
          <svg
            className={`ml-1 w-4 h-4 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isExpanded && (
          <ul className="text-xs list-disc list-inside mt-2 text-muted-foreground space-y-1">
            {statements.map((statement, i) => (
              <li key={i} className="pl-2">{statement}</li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  if (chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className || ''}`}>
        <p className="text-muted-foreground">No theme data available</p>
      </div>
    );
  }

  return (
    <div className={`${className || ''} space-y-6`}>
      <ResponsiveContainer height={height}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 40, bottom: 150 }}
          barSize={20}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="shortName"
            angle={-45}
            textAnchor="end"
            height={100}
            interval={0}
            tick={{ 
              fontSize: 11,
              fill: '#666',
              dy: 10,
            }}
          />
          <YAxis
            label={{ 
              value: 'Frequency (%)', 
              angle: -90, 
              position: 'insideLeft', 
              style: { textAnchor: 'middle' } 
            }}
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={customTooltip} />
          <ReferenceLine y={0} stroke="#666" />
          <Bar
            dataKey="frequency"
            name="Frequency"
            onClick={handleBarClick}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getBarColor(entry.sentiment)}
                opacity={entry.originalData.id === chartData[index]?.originalData.id ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-6 space-y-4">
        <h3 className="text-lg font-semibold">Theme Details</h3>
        <div className="space-y-4">
          {data.map((theme) => (
            <div 
              key={theme.id} 
              className="p-4 border border-border rounded-md"
              style={{ 
                borderLeftWidth: '4px',
                borderLeftColor: getBarColor(theme.sentiment || 0)
              }}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">{theme.name}</h4>
                <span 
                  className="px-2 py-1 text-xs rounded-full"
                  style={{ 
                    backgroundColor: `${getBarColor(theme.sentiment || 0)}20`,
                    color: getBarColor(theme.sentiment || 0)
                  }}
                >
                  {getSentimentLabel(theme.sentiment)}
                </span>
              </div>
              <div className="mt-2">
                <div className="flex items-center text-sm text-muted-foreground">
                  <span>Frequency:</span>
                  <div className="ml-2 w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full" 
                      style={{ 
                        width: `${Math.round((theme.frequency || 0) * 100)}%`,
                        backgroundColor: getBarColor(theme.sentiment || 0)
                      }}
                    />
                  </div>
                  <span className="ml-2">{Math.round((theme.frequency || 0) * 100)}%</span>
                </div>
              </div>
              {renderSupportingStatements(theme)}
            </div>
          ))}
        </div>
      </div>

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