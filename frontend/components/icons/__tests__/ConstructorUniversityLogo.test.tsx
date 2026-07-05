import { render, screen } from '@testing-library/react';
import { ConstructorUniversityLogo } from '../ConstructorUniversityLogo';
import { describe, it, expect } from 'vitest';

describe('ConstructorUniversityLogo', () => {
  it('renders the logo with default props', () => {
    render(<ConstructorUniversityLogo />);
    
    // Check if the SVG is rendered
    const svg = screen.getByRole('img', { hidden: true });
    expect(svg).toBeInTheDocument();
    
    // Check if the text content is present
    expect(screen.getByText('Constructor')).toBeInTheDocument();
    expect(screen.getByText('University')).toBeInTheDocument();
    expect(screen.getByText('Bremen, Germany')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<ConstructorUniversityLogo className="custom-class" />);
    
    const svg = screen.getByRole('img', { hidden: true });
    expect(svg).toHaveClass('custom-class');
  });

  it('uses custom width and height', () => {
    render(<ConstructorUniversityLogo width={100} height={30} />);
    
    const svg = screen.getByRole('img', { hidden: true });
    expect(svg).toHaveAttribute('width', '100');
    expect(svg).toHaveAttribute('height', '30');
  });

  it('has proper viewBox for scalability', () => {
    render(<ConstructorUniversityLogo />);
    
    const svg = screen.getByRole('img', { hidden: true });
    expect(svg).toHaveAttribute('viewBox', '0 0 200 60');
  });
});
