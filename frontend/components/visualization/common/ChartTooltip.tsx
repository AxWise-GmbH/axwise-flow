'use client';

import React from 'react';
import { TooltipProps } from 'recharts';
import { NameType, ValueType, Payload } from 'recharts/types/component/DefaultTooltipContent';

/**
 * Props for the ChartTooltip component
 */
interface ChartTooltipProps {
  /** The active status from recharts tooltip */
  active?: boolean;
  payload?: Array<Payload<ValueType, NameType> & {
    [key: string]: any;
  }>;
  /** The label from recharts tooltip */
  label?: string;
  /** Custom formatter for the tooltip content */
  formatter?: (value: any, name: string, props: any) => React.ReactNode;
  /** Custom label formatter */
  labelFormatter?: (label: string) => React.ReactNode;
  /** Additional CSS class names */
  className?: string;
}

/**
 * A customizable tooltip component for charts
 * This component can be used with any recharts chart
 */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  className,
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className={`bg-background border border-border rounded-md shadow-md p-3 ${className || ''}`}>
      {label && (
        <div className="font-medium mb-1">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={`item-${index}`} className="flex items-center">
            {entry.color && (
              <div
                className="w-3 h-3 mr-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
            )}
            <span className="text-sm text-muted-foreground mr-2">
              {entry.name}:
            </span>
            <span className="text-sm font-medium">
              {formatter ? formatter(entry.value, entry.name as string, entry) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Factory function to create a custom tooltip for recharts
 * @param props Additional props to pass to the ChartTooltip component
 * @returns A function that can be used as the content prop for recharts Tooltip
 */
export const createCustomTooltip = (props?: Omit<ChartTooltipProps, 'active' | 'payload' | 'label'>) => {
  return (tooltipProps: TooltipProps<ValueType, NameType>) => {
    return (
      <ChartTooltip
        active={tooltipProps.active}
        payload={tooltipProps.payload}
        label={tooltipProps.label}
        {...props}
      />
    );
  };
};

export default ChartTooltip;