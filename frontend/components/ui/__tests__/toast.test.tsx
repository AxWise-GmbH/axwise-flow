import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast, ToastProvider, ToastViewport } from '../toast'
import { ToastAction } from '../toast'
import { useToast } from '../use-toast'
import type { ToastProps } from '../toast'

// Mock setTimeout and clearTimeout
jest.useFakeTimers()

describe('Toast Component', () => {
  const TestComponent = ({ 
    message = 'Test toast', 
    variant = 'default' as ToastProps['variant']
  }) => {
    const { toast } = useToast()
    return (
      <button onClick={() => toast({ description: message, variant })}>
        Show Toast
      </button>
    )
  }

  const setup = () => {
    return render(
      <ToastProvider>
        <TestComponent />
        <ToastViewport />
      </ToastProvider>
    )
  }

  afterEach(() => {
    jest.clearAllMocks()
    act(() => {
      jest.runAllTimers()
    })
  })

  it('renders toast when triggered', async () => {
    setup()
    const button = screen.getByText('Show Toast')
    
    await userEvent.click(button)
    
    expect(screen.getByText('Test toast')).toBeInTheDocument()
  })

  it('renders different variants correctly', async () => {
    const { rerender } = render(
      <ToastProvider>
        <TestComponent variant="default" />
        <ToastViewport />
      </ToastProvider>
    )

    const button = screen.getByText('Show Toast')
    await userEvent.click(button)
    expect(screen.getByRole('status')).toHaveClass('bg-background')

    rerender(
      <ToastProvider>
        <TestComponent variant="destructive" />
        <ToastViewport />
      </ToastProvider>
    )

    await userEvent.click(button)
    expect(screen.getByRole('alert')).toHaveClass('destructive')
  })

  it('auto-dismisses after duration', async () => {
    setup()
    const button = screen.getByText('Show Toast')
    
    await userEvent.click(button)
    expect(screen.getByText('Test toast')).toBeInTheDocument()
    
    act(() => {
      jest.advanceTimersByTime(5000) // Default duration
    })
    
    expect(screen.queryByText('Test toast')).not.toBeInTheDocument()
  })

  it('can be dismissed manually', async () => {
    setup()
    const button = screen.getByText('Show Toast')
    
    await userEvent.click(button)
    const toast = screen.getByText('Test toast')
    const closeButton = screen.getByLabelText('Close')
    
    await userEvent.click(closeButton)
    expect(toast).not.toBeInTheDocument()
  })

  it('renders with custom action', async () => {
    const onAction = jest.fn()
    render(
      <ToastProvider>
        <button
          onClick={() =>
            useToast().toast({
              description: 'Action toast',
              action: <ToastAction altText="Try again" onClick={onAction}>Retry</ToastAction>,
            })
          }
        >
          Show Toast
        </button>
        <ToastViewport />
      </ToastProvider>
    )

    const button = screen.getByText('Show Toast')
    await userEvent.click(button)
    
    const actionButton = screen.getByText('Retry')
    await userEvent.click(actionButton)
    
    expect(onAction).toHaveBeenCalled()
  })

  it('handles multiple toasts correctly', async () => {
    render(
      <ToastProvider>
        <button
          onClick={() => {
            useToast().toast({ description: 'Toast 1' })
            useToast().toast({ description: 'Toast 2' })
          }}
        >
          Show Toasts
        </button>
        <ToastViewport />
      </ToastProvider>
    )

    const button = screen.getByText('Show Toasts')
    await userEvent.click(button)
    
    expect(screen.getByText('Toast 1')).toBeInTheDocument()
    expect(screen.getByText('Toast 2')).toBeInTheDocument()
  })

  it('applies custom styles correctly', async () => {
    render(
      <ToastProvider>
        <button
          onClick={() =>
            useToast().toast({
              description: 'Styled toast',
              className: 'custom-toast-class',
            })
          }
        >
          Show Toast
        </button>
        <ToastViewport className="custom-viewport-class" />
      </ToastProvider>
    )

    const button = screen.getByText('Show Toast')
    await userEvent.click(button)
    
    const toast = screen.getByText('Styled toast')
    expect(toast.parentElement).toHaveClass('custom-toast-class')
    expect(screen.getByTestId('toast-viewport')).toHaveClass('custom-viewport-class')
  })

  it('updates toast content', async () => {
    render(
      <ToastProvider>
        <button
          onClick={() => {
            const { id, update } = useToast().toast({ 
              description: 'Initial message' 
            })
            setTimeout(() => {
              update({ description: 'Updated message' })
            }, 1000)
          }}
        >
          Show Toast
        </button>
        <ToastViewport />
      </ToastProvider>
    )

    const button = screen.getByText('Show Toast')
    await userEvent.click(button)
    
    expect(screen.getByText('Initial message')).toBeInTheDocument()
    
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    
    expect(screen.getByText('Updated message')).toBeInTheDocument()
  })

  it('maintains proper swipe-to-dismiss functionality', async () => {
    setup()
    const button = screen.getByText('Show Toast')
    await userEvent.click(button)
    
    const toast = screen.getByText('Test toast')
    
    // Simulate swipe
    await userEvent.pointer([
      { target: toast, keys: '[MouseLeft]', coords: { clientX: 0, clientY: 0 } },
      { coords: { clientX: -200, clientY: 0 } },
      { keys: '[/MouseLeft]' },
    ])
    
    expect(toast).not.toBeInTheDocument()
  })
})