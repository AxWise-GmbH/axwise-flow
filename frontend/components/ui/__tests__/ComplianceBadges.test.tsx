import { render, screen } from '@testing-library/react';
import { ComplianceBadges, ComplianceItem } from '../ComplianceBadges';
import { describe, it, expect } from 'vitest';

describe('ComplianceBadges', () => {
  it('renders default compliance items', () => {
    render(<ComplianceBadges />);
    
    // Check if default items are rendered
    expect(screen.getByText('GDPR')).toBeInTheDocument();
    expect(screen.getByText('SOC 2 Type II')).toBeInTheDocument();
    expect(screen.getByText('CCPA')).toBeInTheDocument();
    expect(screen.getByText('HIPAA')).toBeInTheDocument();
    
    // Check status texts
    expect(screen.getByText('Compliant')).toBeInTheDocument();
    expect(screen.getAllByText('In Progress')).toHaveLength(3);
  });

  it('renders custom compliance items', () => {
    const customItems: ComplianceItem[] = [
      {
        name: 'ISO 27001',
        status: 'compliant',
        icon: '✅',
        description: 'Information security management'
      },
      {
        name: 'PCI DSS',
        status: 'in-progress',
        icon: '🔄',
        description: 'Payment card industry standards'
      }
    ];

    render(<ComplianceBadges items={customItems} />);
    
    expect(screen.getByText('ISO 27001')).toBeInTheDocument();
    expect(screen.getByText('PCI DSS')).toBeInTheDocument();
    expect(screen.getByText('Compliant')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('applies correct status styling', () => {
    const items: ComplianceItem[] = [
      { name: 'Test Compliant', status: 'compliant', icon: '✅' },
      { name: 'Test Progress', status: 'in-progress', icon: '🔄' },
      { name: 'Test Available', status: 'available', icon: '📋' }
    ];

    render(<ComplianceBadges items={items} />);
    
    const compliantBadge = screen.getByText('Test Compliant').closest('.bg-green-100');
    const progressBadge = screen.getByText('Test Progress').closest('.bg-orange-100');
    const availableBadge = screen.getByText('Test Available').closest('.bg-blue-100');
    
    expect(compliantBadge).toBeInTheDocument();
    expect(progressBadge).toBeInTheDocument();
    expect(availableBadge).toBeInTheDocument();
  });

  it('shows/hides title based on showTitle prop', () => {
    const { rerender } = render(<ComplianceBadges showTitle={true} />);
    expect(screen.getByText('Enterprise-Grade Security & Compliance')).toBeInTheDocument();
    
    rerender(<ComplianceBadges showTitle={false} />);
    expect(screen.queryByText('Enterprise-Grade Security & Compliance')).not.toBeInTheDocument();
  });

  it('uses custom title when provided', () => {
    render(<ComplianceBadges title="Custom Compliance Title" />);
    expect(screen.getByText('Custom Compliance Title')).toBeInTheDocument();
  });

  it('applies different layouts correctly', () => {
    const { rerender } = render(<ComplianceBadges layout="horizontal" />);
    let container = screen.getByText('GDPR').closest('div')?.parentElement;
    expect(container).toHaveClass('flex');
    
    rerender(<ComplianceBadges layout="grid" />);
    container = screen.getByText('GDPR').closest('div')?.parentElement;
    expect(container).toHaveClass('grid');
  });

  it('applies different sizes correctly', () => {
    const { rerender } = render(<ComplianceBadges size="sm" />);
    let badge = screen.getByText('GDPR').closest('span');
    expect(badge).toHaveClass('text-xs', 'px-2', 'py-1');
    
    rerender(<ComplianceBadges size="lg" />);
    badge = screen.getByText('GDPR').closest('span');
    expect(badge).toHaveClass('text-sm', 'px-4', 'py-2');
  });

  it('includes accessibility attributes', () => {
    const items: ComplianceItem[] = [
      {
        name: 'GDPR',
        status: 'compliant',
        icon: '✅',
        description: 'EU data protection regulation'
      }
    ];

    render(<ComplianceBadges items={items} />);
    
    const badge = screen.getByText('GDPR').closest('span');
    expect(badge).toHaveAttribute('title', 'EU data protection regulation');
  });
});
