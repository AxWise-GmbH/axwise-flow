import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../alert-dialog'

describe('AlertDialog Component', () => {
  const TestDialog = ({
    onAction = () => {},
    onCancel = () => {},
    title = 'Test Title',
    description = 'Test Description',
  }) => (
    <AlertDialog>
      <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onAction}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  it('renders trigger button', () => {
    render(<TestDialog />)
    expect(screen.getByText('Open Dialog')).toBeInTheDocument()
  })

  it('opens dialog when trigger is clicked', async () => {
    render(<TestDialog />)
    
    await userEvent.click(screen.getByText('Open Dialog'))
    
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('closes dialog when cancel button is clicked', async () => {
    const onCancel = jest.fn()
    render(<TestDialog onCancel={onCancel} />)
    
    await userEvent.click(screen.getByText('Open Dialog'))
    await userEvent.click(screen.getByText('Cancel'))
    
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls action callback when continue is clicked', async () => {
    const onAction = jest.fn()
    render(<TestDialog onAction={onAction} />)
    
    await userEvent.click(screen.getByText('Open Dialog'))
    await userEvent.click(screen.getByText('Continue'))
    
    expect(onAction).toHaveBeenCalled()
  })

  it('closes dialog when clicking outside', async () => {
    render(<TestDialog />)
    
    await userEvent.click(screen.getByText('Open Dialog'))
    
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(document.body)
    
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument()
    })
  })

  it('closes dialog when escape key is pressed', async () => {
    render(<TestDialog />)
    
    await userEvent.click(screen.getByText('Open Dialog'))
    await userEvent.keyboard('{Escape}')
    
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('maintains focus trap within dialog', async () => {
    render(<TestDialog />)
    
    await userEvent.click(screen.getByText('Open Dialog'))
    
    const cancelButton = screen.getByText('Cancel')
    const continueButton = screen.getByText('Continue')
    
    await userEvent.tab()
    expect(cancelButton).toHaveFocus()
    
    await userEvent.tab()
    expect(continueButton).toHaveFocus()
    
    await userEvent.tab()
    expect(cancelButton).toHaveFocus()
  })

  it('applies custom classes to dialog parts', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger className="custom-trigger">Open</AlertDialogTrigger>
        <AlertDialogContent className="custom-content">
          <AlertDialogHeader className="custom-header">
            <AlertDialogTitle className="custom-title">Title</AlertDialogTitle>
            <AlertDialogDescription className="custom-desc">
              Description
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="custom-footer">
            <AlertDialogCancel className="custom-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction className="custom-action">Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    await userEvent.click(screen.getByText('Open'))

    expect(screen.getByText('Open')).toHaveClass('custom-trigger')
    expect(screen.getByRole('alertdialog')).toHaveClass('custom-content')
    expect(screen.getByText('Title').parentElement).toHaveClass('custom-header')
    expect(screen.getByText('Title')).toHaveClass('custom-title')
    expect(screen.getByText('Description')).toHaveClass('custom-desc')
    expect(screen.getByText('Cancel').parentElement).toHaveClass('custom-footer')
    expect(screen.getByText('Cancel')).toHaveClass('custom-cancel')
    expect(screen.getByText('Continue')).toHaveClass('custom-action')
  })

  it('handles nested content correctly', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <span>Complex</span>
              <em>Title</em>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <p>Paragraph 1</p>
              <p>Paragraph 2</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>
              <span>Proceed</span>
              <span aria-hidden="true">→</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    await userEvent.click(screen.getByText('Open'))

    expect(screen.getByText('Complex')).toBeInTheDocument()
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Paragraph 1')).toBeInTheDocument()
    expect(screen.getByText('Paragraph 2')).toBeInTheDocument()
    expect(screen.getByText('Proceed')).toBeInTheDocument()
    expect(screen.getByText('→')).toBeInTheDocument()
  })

  it('maintains proper ARIA attributes', async () => {
    render(<TestDialog />)
    
    await userEvent.click(screen.getByText('Open Dialog'))
    
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby')
    expect(dialog).toHaveAttribute('aria-describedby')
  })
})