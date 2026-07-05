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
        <Card className="custom-class" data-testid="card-custom"> {/* Add testid */}
          <div>Card content</div>
        </Card>
      )
      expect(screen.getByTestId('card-custom')).toHaveClass('custom-class')
 // Use testid
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
        <CardHeader className="custom-header" data-testid="header-custom"> {/* Add testid */}
          <div>Header content</div>
        </CardHeader>
      )
      expect(screen.getByTestId('header-custom')).toHaveClass('custom-header')
 // Use testid
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
        <CardFooter className="custom-footer" data-testid="footer-custom"> {/* Add testid */}
          <div>Footer content</div>
        </CardFooter>
      )
      expect(screen.getByTestId('footer-custom')).toHaveClass('custom-footer')
 // Use testid
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
        <CardContent className="custom-content" data-testid="content-custom"> {/* Add testid */}
          <div>Content area</div>
        </CardContent>
      )
      expect(screen.getByTestId('content-custom')).toHaveClass('custom-content')
 // Use testid
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
          <CardHeader data-testid="int-header"> {/* Add testid */}
            <CardTitle>Title</CardTitle>
            <CardDescription>Description</CardDescription>
          </CardHeader>
          <CardContent data-testid="int-content">Content</CardContent>
 {/* Add testid */}
          <CardFooter data-testid="int-footer">Footer</CardFooter>
 {/* Add testid */}
        </Card>
      )

      const header = screen.getByTestId('int-header') // Use testid
      const content = screen.getByTestId('int-content') // Use testid
      const footer = screen.getByTestId('int-footer') // Use testid

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