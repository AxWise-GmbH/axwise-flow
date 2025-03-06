'use client';

import React, { useMemo, useState } from 'react';
import { Pattern } from '@/types/api';
import { ChartLegend, createCustomTooltip } from './common';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  Legend,
  Treemap,
  ResponsiveContainer
} from 'recharts';

interface PatternListProps {
  data: Pattern[];
  showEvidence?: boolean;
  className?: string;
  onPatternClick?: (pattern: Pattern) => void;
}

const SENTIMENT_COLORS = {
  positive: '#22c55e', // green-500
  neutral: '#64748b', // slate-500
  negative: '#ef4444', // red-500
};

export const PatternList: React.FC<PatternListProps> = ({
  data,
  showEvidence = true,
  className,
  onPatternClick,
}) => {
  const [expandedPatterns, setExpandedPatterns] = useState<Record<string, boolean>>({});
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [displayMode, setDisplayMode] = useState<'treemap' | 'bar'>('treemap');
  const [sortBy, setSortBy] = useState<'frequency' | 'sentiment' | 'category'>('frequency');

  // Process the data to handle missing fields
  const processedData = useMemo(() => {
    return data.map((pattern, index) => ({
      ...pattern,
      id: pattern.id || index,
      name: pattern.name || `Pattern ${index + 1}`,
      category: pattern.category || 'Uncategorized',
      description: pattern.description || '',
      frequency: typeof pattern.frequency === 'number' ? pattern.frequency : 0,
      sentiment: typeof pattern.sentiment === 'number' ? pattern.sentiment : 0,
      evidence: pattern.evidence || pattern.examples || [],
      examples: pattern.examples || pattern.evidence || []
    }));
  }, [data]);

  const { chartData, treemapData, patternsByCategory } = useMemo(() => {
    const grouped: Record<string, Pattern[]> = {};
    const transformed: any[] = [];
    const treeData: any[] = [];
    
    const sortedData = [...processedData].sort((a, b) => {
      const freqA = typeof a.frequency === 'number' ? a.frequency : 0;
      const freqB = typeof b.frequency === 'number' ? b.frequency : 0;
      return freqB - freqA;
    });
    
    sortedData.forEach((pattern, index) => {
      const category = pattern.category || 'Uncategorized';
      const frequencyValue = typeof pattern.frequency === 'number' 
        ? pattern.frequency 
        : (typeof pattern.frequency === 'string' 
          ? parseFloat(pattern.frequency) || 0 
          : 0);
      
      // For the bar chart
      transformed.push({
        id: pattern.id || index,
        name: pattern.name,
        frequency: frequencyValue,
        sentiment: pattern.sentiment || 0,
        originalData: pattern,
      });
      
      // For the treemap
      treeData.push({
        name: pattern.name,
        size: frequencyValue * 100,
        sentiment: pattern.sentiment || 0,
        category,
        originalData: pattern,
      });
      
      // For the categorized list
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(pattern);
    });
    
    return { 
      chartData: transformed, 
      treemapData: [{ name: 'Patterns', children: treeData }],
      patternsByCategory: grouped 
    };
  }, [processedData]);

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

  const toggleExpanded = (patternId: number) => {
    setExpandedPatterns(prev => ({
      ...prev,
      [patternId]: !prev[patternId]
    }));
  };

  const handleItemClick = (data: any) => {
    if (data && data.originalData && onPatternClick) {
      setSelectedPattern(data.originalData);
      onPatternClick(data.originalData);
    }
  };

  // Custom tooltip component that shows pattern details on hover
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white shadow-lg rounded-md p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-900">{data.name}</h3>
          <p className="text-sm text-gray-600">
            Frequency: {typeof data.frequency === 'number' ? `${(data.frequency * 100).toFixed(0)}%` : data.frequency}
          </p>
          <p className="text-sm" style={{ color: getBarColor(data.sentiment) }}>
            Sentiment: {getSentimentLabel(data.sentiment)}
          </p>
          {data.originalData.description && (
            <p className="text-sm text-gray-700 mt-2">{data.originalData.description}</p>
          )}
        </div>
      );
    }
    return null;
  };

  const legendItems = [
    { value: 'Positive Pattern', color: SENTIMENT_COLORS.positive, type: 'circle' as const },
    { value: 'Neutral Pattern', color: SENTIMENT_COLORS.neutral, type: 'circle' as const },
    { value: 'Negative Pattern', color: SENTIMENT_COLORS.negative, type: 'circle' as const },
  ];

  // Render function for treemap items
  const renderTreemapContent = (props: any) => {
    const { root, depth, x, y, width, height, index, name, sentiment } = props;
    const color = getBarColor(sentiment);
    
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: color,
            stroke: '#fff',
            strokeWidth: 2,
            fillOpacity: depth === 1 ? (activeIndex === index ? 0.8 : 0.6) : 0,
          }}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
          onClick={() => handleItemClick(props)}
          cursor="pointer"
        />
        {width > 50 && height > 25 ? (
          <text
            x={x + width / 2}
            y={y + height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            fontSize={width > 100 ? 14 : 10}
            fontWeight="500"
          >
            {name}
          </text>
        ) : null}
      </g>
    );
  };

  // Check if we have valid data to display
  if (!data || data.length === 0) {
    return (
      <div className={`w-full ${className} p-4 border border-gray-200 rounded-md`}>
        <p className="text-gray-500 text-center">No patterns found in the analysis.</p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Patterns</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setDisplayMode('treemap')}
            className={`px-3 py-1 text-sm rounded ${
              displayMode === 'treemap' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Treemap
          </button>
          <button
            onClick={() => setDisplayMode('bar')}
            className={`px-3 py-1 text-sm rounded ${
              displayMode === 'bar' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Bar Chart
          </button>
        </div>
      </div>

      {displayMode === 'treemap' ? (
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treemapData}
              dataKey="size"
              aspectRatio={4/3}
              stroke="#fff"
              fill="#8884d8"
              content={renderTreemapContent as any}
              isAnimationActive={true}
            />
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="#000" />
              <Bar dataKey="frequency" name="Frequency" onClick={handleItemClick}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.sentiment || 0)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4">
        <ChartLegend items={legendItems} />
      </div>

      {selectedPattern && (
        <div className="mt-6 p-4 border border-gray-200 rounded-md bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800">{selectedPattern.name}</h3>
          {selectedPattern.description && (
            <p className="mt-2 text-gray-700">{selectedPattern.description}</p>
          )}
          {showEvidence && (selectedPattern.evidence || selectedPattern.examples) && (
            (selectedPattern.evidence?.length || selectedPattern.examples?.length) ? (
              <div className="mt-3">
                <h4 className="font-semibold text-gray-700">Supporting Evidence:</h4>
                <ul className="mt-2 list-disc pl-5 space-y-2">
                  {(selectedPattern.evidence || selectedPattern.examples || []).map((example, idx) => (
                    <li key={idx} className="text-gray-600">{example}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
};

export default PatternList;