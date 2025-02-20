import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from '../card'

describe('Card Components', () => {
  describe('Card', () => {
    it('renders card with children', () => {
      render(
        <Card>
          <div>Card content</div>
        </Card>
      )
      expect(screen.getByText('Card content')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(
        <Card className="custom-class">
          <div>Card content</div>
        </Card>
      )
      expect(screen.getByText('Card content').parentElement).toHaveClass('custom-class')
    })

    it('forwards ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>()
      render(
        <Card ref={ref}>
          <div>Card content</div>
        </Card>
      )
      expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
  })

  describe('CardHeader', () => {
    it('renders header with children', () => {
      render(
        <CardHeader>
          <div>Header content</div>
        </CardHeader>
      )
      expect(screen.getByText('Header content')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(
        <CardHeader className="custom-header">
          <div>Header content</div>
        </CardHeader>
      )
      expect(screen.getByText('Header content').parentElement).toHaveClass('custom-header')
    })
  })

  describe('CardFooter', () => {
    it('renders footer with children', () => {
      render(
        <CardFooter>
          <div>Footer content</div>
        </CardFooter>
      )
      expect(screen.getByText('Footer content')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(
        <CardFooter className="custom-footer">
          <div>Footer content</div>
        </CardFooter>
      )
      expect(screen.getByText('Footer content').parentElement).toHaveClass('custom-footer')
    })
  })

  describe('CardTitle', () => {
    it('renders title with text content', () => {
      render(<CardTitle>Card Title</CardTitle>)
      expect(screen.getByText('Card Title')).toHaveClass('text-2xl', 'font-semibold')
    })

    it('applies custom className', () => {
      render(<CardTitle className="custom-title">Card Title</CardTitle>)
      expect(screen.getByText('Card Title')).toHaveClass('custom-title')
    })

    it('renders with correct heading level', () => {
      render(<CardTitle>Title</CardTitle>)
      expect(screen.getByRole('heading')).toBeInTheDocument()
    })
  })

  describe('CardDescription', () => {
    it('renders description with text content', () => {
      render(<CardDescription>Card Description</CardDescription>)
      expect(screen.getByText('Card Description')).toHaveClass('text-sm', 'text-muted-foreground')
    })

    it('applies custom className', () => {
      render(
        <CardDescription className="custom-desc">Card Description</CardDescription>
      )
      expect(screen.getByText('Card Description')).toHaveClass('custom-desc')
    })
  })

  describe('CardContent', () => {
    it('renders content with children', () => {
      render(
        <CardContent>
          <div>Content area</div>
        </CardContent>
      )
      expect(screen.getByText('Content area')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(
        <CardContent className="custom-content">
          <div>Content area</div>
        </CardContent>
      )
      expect(screen.getByText('Content area').parentElement).toHaveClass('custom-content')
    })
  })

  describe('Card Component Integration', () => {
    it('renders full card structure correctly', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card Description</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Main content</p>
          </CardContent>
          <CardFooter>
            <p>Footer content</p>
          </CardFooter>
        </Card>
      )

      expect(screen.getByText('Card Title')).toBeInTheDocument()
      expect(screen.getByText('Card Description')).toBeInTheDocument()
      expect(screen.getByText('Main content')).toBeInTheDocument()
      expect(screen.getByText('Footer content')).toBeInTheDocument()
    })

    it('maintains proper spacing and layout', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
            <CardDescription>Description</CardDescription>
          </CardHeader>
          <CardContent>Content</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
      )

      const header = screen.getByText('Title').closest('div')
      const content = screen.getByText('Content').parentElement
      const footer = screen.getByText('Footer').parentElement

      expect(header).toHaveClass('space-y-1.5', 'p-6')
      expect(content).toHaveClass('p-6', 'pt-0')
      expect(footer).toHaveClass('flex', 'p-6', 'pt-0')
    })

    it('handles nested content correctly', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>
              <span>Nested</span>
              <small>Title</small>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p>Nested</p>
              <p>Content</p>
            </div>
          </CardContent>
        </Card>
      )

      expect(screen.getByText('Nested')).toBeInTheDocument()
      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Content')).toBeInTheDocument()
    })
  })
})