import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { Progress } from '../progress'

describe('Progress Component', () => {
  it('renders progress bar with default value', () => {
    render(<Progress value={0} />)
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '0')
  })

  it('renders with custom value', () => {
    render(<Progress value={50} />)
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '50')
    expect(progressBar.querySelector('[data-progress]')).toHaveStyle({
      transform: 'translateX(-50%)',
    })
  })

  it('clamps value between 0 and 100', () => {
    const { rerender } = render(<Progress value={-10} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    rerender(<Progress value={150} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('handles undefined value', () => {
    render(<Progress value={undefined} />)
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '0')
  })

  it('applies custom className', () => {
    render(<Progress value={50} className="custom-progress" />)
    expect(screen.getByRole('progressbar')).toHaveClass('custom-progress')
  })

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>()
    render(<Progress value={50} ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('renders with correct ARIA attributes', () => {
    render(<Progress value={75} />)
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuemin', '0')
    expect(progressBar).toHaveAttribute('aria-valuemax', '100')
    expect(progressBar).toHaveAttribute('aria-valuenow', '75')
  })

  it('updates value dynamically', () => {
    const { rerender } = render(<Progress value={0} />)
    const progressBar = screen.getByRole('progressbar')
    
    for (let value = 0; value <= 100; value += 25) {
      rerender(<Progress value={value} />)
      expect(progressBar).toHaveAttribute('aria-valuenow', value.toString())
      expect(progressBar.querySelector('[data-progress]')).toHaveStyle({
        transform: `translateX(-${100 - value}%)`,
      })
    }
  })

  it('handles decimal values', () => {
    render(<Progress value={33.33} />)
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '33.33')
    expect(progressBar.querySelector('[data-progress]')).toHaveStyle({
      transform: 'translateX(-66.67%)',
    })
  })

  it('maintains proper styling during transitions', () => {
    jest.useFakeTimers()
    
    const { rerender } = render(<Progress value={0} />)
    const progressBar = screen.getByRole('progressbar')
    const indicator = progressBar.querySelector('[data-progress]')

    expect(indicator).toHaveClass(
      'h-full',
      'w-full',
      'flex-1',
      'bg-primary',
      'transition-all'
    )

    rerender(<Progress value={50} />)
    
    act(() => {
      jest.advanceTimersByTime(200) // Default transition duration
    })

    expect(indicator).toHaveStyle({
      transform: 'translateX(-50%)',
    })

    jest.useRealTimers()
  })

  it('renders with indeterminate state', () => {
    render(<Progress />)
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuemin', '0')
    expect(progressBar).toHaveAttribute('aria-valuemax', '100')
    expect(progressBar).not.toHaveAttribute('aria-valuenow')
    expect(progressBar.querySelector('[data-progress]')).toHaveClass('animate-indeterminate')
  })

  it('maintains accessibility during value changes', () => {
    const { rerender } = render(<Progress value={0} />)
    const progressBar = screen.getByRole('progressbar')

    // Test various value changes
    const values = [25, 50, 75, 100]
    values.forEach(value => {
      rerender(<Progress value={value} />)
      expect(progressBar).toHaveAttribute('aria-valuenow', value.toString())
      expect(progressBar).toHaveAttribute('aria-valuetext', `${value}%`)
    })
  })
})