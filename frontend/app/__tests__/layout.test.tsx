import { render, screen } from '@testing-library/react';
import RootLayout from '../layout';

// Mock the providers
jest.mock('../providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="providers">{children}</div>
  ),
}));

// Mock the error boundary
jest.mock('@/components/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

describe('RootLayout', () => {
  it('renders with providers and error boundary', () => {
    render(
      <RootLayout>
        <div data-testid="test-content">Test Content</div>
      </RootLayout>
    );

    expect(screen.getByTestId('providers')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('applies Inter font class', () => {
    render(
      <RootLayout>
        <div>Content</div>
      </RootLayout>
    );

    // Find the body element with Inter font class
    const body = screen.getByText('Content').parentElement;
    expect(body).toHaveClass('inter');
  });

  it('sets correct html attributes', () => {
    render(
      <RootLayout>
        <div>Content</div>
      </RootLayout>
    );

    const html = document.documentElement;
    expect(html).toHaveAttribute('lang', 'en');
    expect(html).toHaveAttribute('suppressHydrationWarning');
  });

  it('maintains correct nesting order', () => {
    const { container } = render(
      <RootLayout>
        <div data-testid="test-content">Test Content</div>
      </RootLayout>
    );

    const html = container.parentElement;
    const body = html?.querySelector('body');
    const errorBoundary = screen.getByTestId('error-boundary');
    const providers = screen.getByTestId('providers');
    const content = screen.getByTestId('test-content');

    // Check nesting order
    expect(body).toContainElement(errorBoundary);
    expect(errorBoundary).toContainElement(providers);
    expect(providers).toContainElement(content);
  });

  it('exports correct metadata', () => {
    // Access the exported metadata
    const { metadata } = require('../layout');

    expect(metadata).toEqual({
      title: 'Interview Analysis',
      description: 'Analyze interview data with AI',
      viewport: 'width=device-width, initial-scale=1',
      themeColor: [
        { media: '(prefers-color-scheme: light)', color: 'white' },
        { media: '(prefers-color-scheme: dark)', color: '#000' },
      ],
    });
  });
});