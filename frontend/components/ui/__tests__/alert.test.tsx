import React from 'react'
import { render, screen } from '@testing-library/react'
import { Alert, AlertTitle, AlertDescription } from '../alert'

describe('Alert Component', () => {
  it('renders basic alert correctly', () => {
    render(
      <Alert>
        <p>Test alert content</p>
      </Alert>
    )

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Test alert content')
  })

  it('renders with different variants', () => {
    const { rerender } = render(
      <Alert variant="default">
        <p>Default alert</p>
      </Alert>
    )

    let alert = screen.getByRole('alert')
    expect(alert).toHaveClass('bg-background')

    rerender(
      <Alert variant="destructive">
        <p>Destructive alert</p>
      </Alert>
    )

    alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-destructive/50')

    rerender(
      <Alert variant="success">
        <p>Success alert</p>
      </Alert>
    )

    alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-green-500/50')
  })

  it('renders with title and description', () => {
    render(
      <Alert>
        <AlertTitle>Alert Title</AlertTitle>
        <AlertDescription>Alert description text</AlertDescription>
      </Alert>
    )

    expect(screen.getByText('Alert Title')).toBeInTheDocument()
    expect(screen.getByText('Alert description text')).toBeInTheDocument()
  })

  it('applies custom className to alert', () => {
    render(
      <Alert className="custom-class">
        <p>Alert with custom class</p>
      </Alert>
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('custom-class')
  })

  it('applies custom className to title', () => {
    render(
      <Alert>
        <AlertTitle className="custom-title-class">Alert Title</AlertTitle>
      </Alert>
    )

    const title = screen.getByText('Alert Title')
    expect(title).toHaveClass('custom-title-class')
  })

  it('applies custom className to description', () => {
    render(
      <Alert>
        <AlertDescription className="custom-desc-class">
          Alert description
        </AlertDescription>
      </Alert>
    )

    const description = screen.getByText('Alert description')
    expect(description).toHaveClass('custom-desc-class')
  })

  it('forwards ref to alert component', () => {
    const ref = React.createRef<HTMLDivElement>()
    render(
      <Alert ref={ref}>
        <p>Alert with ref</p>
      </Alert>
    )

    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('forwards ref to title component', () => {
    const ref = React.createRef<HTMLHeadingElement>()
    render(
      <Alert>
        <AlertTitle ref={ref}>Alert Title</AlertTitle>
      </Alert>
    )

    expect(ref.current).toBeInstanceOf(HTMLHeadingElement)
  })

  it('forwards ref to description component', () => {
    const ref = React.createRef<HTMLDivElement>()
    render(
      <Alert>
        <AlertDescription ref={ref}>Alert description</AlertDescription>
      </Alert>
    )

    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('renders with additional props', () => {
    render(
      <Alert data-testid="custom-alert" aria-label="Important alert">
        <p>Alert with props</p>
      </Alert>
    )

    const alert = screen.getByTestId('custom-alert')
    expect(alert).toHaveAttribute('aria-label', 'Important alert')
  })

  it('maintains proper nesting and styling', () => {
    render(
      <Alert>
        <AlertTitle>Nested Title</AlertTitle>
        <AlertDescription>
          <p>Paragraph 1</p>
          <p>Paragraph 2</p>
        </AlertDescription>
      </Alert>
    )

    const alert = screen.getByRole('alert')
    const title = screen.getByText('Nested Title')
    const description = screen.getByText('Paragraph 1').parentElement

    expect(alert).toContainElement(title)
    expect(alert).toContainElement(description)
    expect(description).toContainElement(screen.getByText('Paragraph 2'))
  })
})