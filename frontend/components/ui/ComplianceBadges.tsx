import React from 'react';
import { Badge } from '@/components/ui/badge';

export interface ComplianceItem {
  name: string;
  status: 'compliant' | 'in-progress' | 'available';
  icon: string;
  description?: string;
}

interface ComplianceBadgesProps {
  items?: ComplianceItem[];
  layout?: 'horizontal' | 'grid';
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
  title?: string;
  className?: string;
}

// Default compliance items reflecting AxWise's current status
const DEFAULT_COMPLIANCE_ITEMS: ComplianceItem[] = [
  {
    name: 'GDPR',
    status: 'compliant',
    icon: '✅',
    description: 'EU General Data Protection Regulation - Fully compliant for EU operations'
  },
  {
    name: 'SOC 2 Type II',
    status: 'in-progress',
    icon: '🔄',
    description: 'Security and availability controls audit - Currently pursuing certification'
  },
  {
    name: 'CCPA',
    status: 'in-progress',
    icon: '🔄',
    description: 'California Consumer Privacy Act - Implementation in progress'
  },
  {
    name: 'HIPAA',
    status: 'in-progress',
    icon: '🔄',
    description: 'Healthcare data protection - Business Associate Agreement available upon request'
  }
];

const getStatusStyles = (status: ComplianceItem['status']) => {
  switch (status) {
    case 'compliant':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'in-progress':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'available':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
};

const getStatusText = (status: ComplianceItem['status']) => {
  switch (status) {
    case 'compliant':
      return 'Compliant';
    case 'in-progress':
      return 'In Progress';
    case 'available':
      return 'Available';
    default:
      return 'Unknown';
  }
};

const getSizeClasses = (size: 'sm' | 'md' | 'lg') => {
  switch (size) {
    case 'sm':
      return 'text-xs px-2 py-1';
    case 'md':
      return 'text-xs px-3 py-2';
    case 'lg':
      return 'text-sm px-4 py-2';
    default:
      return 'text-xs px-3 py-2';
  }
};

export const ComplianceBadges: React.FC<ComplianceBadgesProps> = ({
  items = DEFAULT_COMPLIANCE_ITEMS,
  layout = 'horizontal',
  size = 'md',
  showTitle = true,
  title = 'Enterprise-Grade Security & Compliance',
  className = ''
}) => {
  const layoutClasses = layout === 'grid' 
    ? 'grid grid-cols-2 md:grid-cols-4 gap-4' 
    : 'flex flex-wrap justify-center gap-4';

  return (
    <div className={`${className}`}>
      {showTitle && (
        <p className="text-sm text-muted-foreground mb-4 text-center">
          {title}
        </p>
      )}
      <div className={layoutClasses}>
        {items.map((item, index) => (
          <Badge
            key={index}
            variant="secondary"
            className={`${getSizeClasses(size)} ${getStatusStyles(item.status)} flex flex-col items-center text-center leading-tight`}
            title={item.description}
          >
            <span className="flex items-center gap-1">
              {item.icon} {item.name}
            </span>
            <span className="text-xs opacity-75 mt-1">
              {getStatusText(item.status)}
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
};
