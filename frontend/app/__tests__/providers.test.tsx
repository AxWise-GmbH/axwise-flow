import { render, screen } from '@testing-library/react';
import { Providers } from '../providers';
import { useTheme } from '@/components/providers/theme-provider';
import { useToast } from '@/components/providers/toast-provider';

// Test components that use our providers
const ThemeTestComponent = () => {
  const { theme } = useTheme();
  return <div data-testid="theme-test">Current theme: {theme}</div>;
};

const ToastTestComponent = () => {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast('Test toast')}>
      Show Toast
    </button>
  );
};

describe('Providers', () => {
  it('provides theme context to children', () => {
    render(
      <Providers>
        <ThemeTestComponent />
      </Providers>
    );

    expect(screen.getByTestId('theme-test')).toHaveTextContent('Current theme:');
  });

  it('provides toast context to children', async () => {
    render(
      <Providers>
        <ToastTestComponent />
      </Providers>
    );

    const button = screen.getByText('Show Toast');
    await button.click();

    expect(screen.getByText('Test toast')).toBeInTheDocument();
  });

  it('handles nested components correctly', () => {
    const NestedComponent = () => (
      <div>
        <ThemeTestComponent />
        <ToastTestComponent />
      </div>
    );

    render(
      <Providers>
        <NestedComponent />
      </Providers>
    );

    expect(screen.getByTestId('theme-test')).toBeInTheDocument();
    expect(screen.getByText('Show Toast')).toBeInTheDocument();
  });

  it('preserves children prop types', () => {
    const TestChild = () => <div data-testid="test-child">Test Child</div>;

    render(
      <Providers>
        <TestChild />
      </Providers>
    );

    expect(screen.getByTestId('test-child')).toBeInTheDocument();
  });

  it('handles multiple children', () => {
    render(
      <Providers>
        <div data-testid="child-1">First Child</div>
        <div data-testid="child-2">Second Child</div>
      </Providers>
    );

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });

  it('maintains provider order', () => {
    const orderSpy = jest.fn();
    
    const OrderTestComponent = () => {
      const { theme } = useTheme();
      const { showToast } = useToast();
      
      // Both hooks should be available
      orderSpy(theme !== undefined, showToast !== undefined);
      
      return null;
    };

    render(
      <Providers>
        <OrderTestComponent />
      </Providers>
    );

    expect(orderSpy).toHaveBeenCalledWith(true, true);
  });
});