import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '../dropdown-menu'

describe('DropdownMenu Component', () => {
  const TestDropdown = ({
    onSelect = () => {},
    onCheckedChange = () => {},
    onRadioChange = () => {},
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onSelect}>Item 1</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem onCheckedChange={onCheckedChange}>
          Toggle Item
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup onValueChange={onRadioChange}>
          <DropdownMenuRadioItem value="1">Radio 1</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="2">Radio 2</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>More Options</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Sub Item</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  it('renders trigger button', () => {
    render(<TestDropdown />)
    expect(screen.getByText('Open Menu')).toBeInTheDocument()
  })

  it('opens menu when trigger is clicked', async () => {
    render(<TestDropdown />)
    
    await userEvent.click(screen.getByText('Open Menu'))
    
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Item 1')).toBeInTheDocument()
  })

  it('handles menu item selection', async () => {
    const onSelect = jest.fn()
    render(<TestDropdown onSelect={onSelect} />)
    
    await userEvent.click(screen.getByText('Open Menu'))
    await userEvent.click(screen.getByText('Item 1'))
    
    expect(onSelect).toHaveBeenCalled()
  })

  it('handles checkbox item state', async () => {
    const onCheckedChange = jest.fn()
    render(<TestDropdown onCheckedChange={onCheckedChange} />)
    
    await userEvent.click(screen.getByText('Open Menu'))
    await userEvent.click(screen.getByText('Toggle Item'))
    
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    
    await userEvent.click(screen.getByText('Toggle Item'))
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('handles radio group selection', async () => {
    const onRadioChange = jest.fn()
    render(<TestDropdown onRadioChange={onRadioChange} />)
    
    await userEvent.click(screen.getByText('Open Menu'))
    await userEvent.click(screen.getByText('Radio 1'))
    
    expect(onRadioChange).toHaveBeenCalledWith('1')
    
    await userEvent.click(screen.getByText('Radio 2'))
    expect(onRadioChange).toHaveBeenCalledWith('2')
  })

  it('opens submenu on hover', async () => {
    render(<TestDropdown />)
    
    await userEvent.click(screen.getByText('Open Menu'))
    await userEvent.hover(screen.getByText('More Options'))
    
    await waitFor(() => {
      expect(screen.getByText('Sub Item')).toBeInTheDocument()
    })
  })

  it('closes menu when clicking outside', async () => {
    render(<TestDropdown />)
    
    await userEvent.click(screen.getByText('Open Menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    
    await userEvent.click(document.body)
    
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('closes menu when escape key is pressed', async () => {
    render(<TestDropdown />)
    
    await userEvent.click(screen.getByText('Open Menu'))
    await userEvent.keyboard('{Escape}')
    
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('maintains focus management', async () => {
    render(<TestDropdown />)
    
    await userEvent.click(screen.getByText('Open Menu'))
    await userEvent.tab()
    
    expect(screen.getByText('Item 1')).toHaveFocus()
    
    await userEvent.tab()
    expect(screen.getByText('Toggle Item')).toHaveFocus()
  })

  it('applies custom classes correctly', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger className="custom-trigger">
          Open
        </DropdownMenuTrigger>
        <DropdownMenuContent className="custom-content">
          <DropdownMenuItem className="custom-item">Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const trigger = screen.getByText('Open')
    expect(trigger).toHaveClass('custom-trigger')
    
    await userEvent.click(trigger)
    
    expect(screen.getByRole('menu')).toHaveClass('custom-content')
    expect(screen.getByText('Item')).toHaveClass('custom-item')
  })

  it('handles disabled state', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled>Disabled Item</DropdownMenuItem>
          <DropdownMenuCheckboxItem disabled>
            Disabled Checkbox
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup>
            <DropdownMenuRadioItem value="1" disabled>
              Disabled Radio
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await userEvent.click(screen.getByText('Open'))
    
    const disabledItem = screen.getByText('Disabled Item')
    const disabledCheckbox = screen.getByText('Disabled Checkbox')
    const disabledRadio = screen.getByText('Disabled Radio')
    
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true')
    expect(disabledCheckbox).toHaveAttribute('aria-disabled', 'true')
    expect(disabledRadio).toHaveAttribute('aria-disabled', 'true')
  })
})