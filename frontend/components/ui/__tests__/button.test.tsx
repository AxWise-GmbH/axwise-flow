import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../button'
import { Loader2 } from 'lucide-react'

describe('Button Component', () => {
  it('renders button with children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('Click me')
  })

  it('handles click events', async () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    
    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders different variants correctly', () => {
    const { rerender } = render(<Button variant="default">Default</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-primary')

    rerender(<Button variant="destructive">Destructive</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-destructive')

    rerender(<Button variant="outline">Outline</Button>)
    expect(screen.getByRole('button')).toHaveClass('border')

    rerender(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-secondary')

    rerender(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button')).toHaveClass('hover:bg-accent')

    rerender(<Button variant="link">Link</Button>)
    expect(screen.getByRole('button')).toHaveClass('text-primary')
  })

  it('renders different sizes correctly', () => {
    const { rerender } = render(<Button size="default">Default</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-10 px-4 py-2')

    rerender(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-9 px-3')

    rerender(<Button size="lg">Large</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-11 px-8')

    rerender(<Button size="icon">Icon</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-10 w-10')
  })

  it('disables button when disabled prop is true', async () => {
    const handleClick = jest.fn()
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>
    )
    
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    
    await userEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('shows loading state with aria-busy', () => {
    render(
      <Button aria-busy="true">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Loading
      </Button>
    )
    
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading')).toBeInTheDocument()
    const spinner = screen.getByTestId('loader-icon')
    expect(spinner).toHaveClass('animate-spin')
  })

  it('renders with custom className', () => {
    render(<Button className="custom-class">Custom</Button>)
    expect(screen.getByRole('button')).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Ref</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('renders with icon correctly', () => {
    render(
      <Button>
        <Loader2 className="mr-2 h-4 w-4" data-testid="button-icon" />
        With Icon
      </Button>
    )
    
    const button = screen.getByRole('button')
    const icon = screen.getByTestId('button-icon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('mr-2', 'h-4', 'w-4')
  })

  it('renders as different HTML elements', () => {
    const { rerender } = render(
      <Button asChild>
        <a href="#">Link Button</a>
      </Button>
    )
    
    expect(screen.getByRole('link')).toHaveAttribute('href', '#')
    
    rerender(
      <Button asChild>
        <div role="button">Div Button</div>
      </Button>
    )
    
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('combines variant and size classes correctly', () => {
    render(
      <Button variant="outline" size="sm">
        Combined
      </Button>
    )
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('border', 'h-9', 'px-3')
  })

  it('maintains proper focus states', async () => {
    render(<Button>Focus Test</Button>)
    
    const button = screen.getByRole('button')
    expect(button).not.toHaveFocus()
    
    await userEvent.tab()
    expect(button).toHaveFocus()
    expect(button).toHaveClass('focus-visible:ring-2')
  })
})