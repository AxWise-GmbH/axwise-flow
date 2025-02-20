import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '../form'
import { Input } from '../input'

const formSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
})

type FormValues = z.infer<typeof formSchema>

describe('Form Component', () => {
  const TestForm = ({ onSubmit = () => {} }) => {
    const form = useForm<FormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        username: '',
        email: '',
      },
    })

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input placeholder="Enter username" {...field} />
                </FormControl>
                <FormDescription>
                  This is your public display name.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="Enter email" type="email" {...field} />
                </FormControl>
                <FormDescription>
                  We'll never share your email.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <button type="submit">Submit</button>
        </form>
      </Form>
    )
  }

  it('renders form fields correctly', () => {
    render(<TestForm />)
    
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByText("This is your public display name.")).toBeInTheDocument()
    expect(screen.getByText("We'll never share your email.")).toBeInTheDocument()
  })

  it('handles form submission with valid data', async () => {
    const onSubmit = jest.fn()
    render(<TestForm onSubmit={onSubmit} />)
    
    await userEvent.type(screen.getByLabelText('Username'), 'testuser')
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com')
    await userEvent.click(screen.getByText('Submit'))
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        {
          username: 'testuser',
          email: 'test@example.com',
        },
        expect.anything()
      )
    })
  })

  it('displays validation errors for invalid data', async () => {
    render(<TestForm />)
    
    await userEvent.type(screen.getByLabelText('Username'), 'a')
    await userEvent.type(screen.getByLabelText('Email'), 'invalid-email')
    await userEvent.click(screen.getByText('Submit'))
    
    await waitFor(() => {
      expect(screen.getByText('Username must be at least 2 characters')).toBeInTheDocument()
      expect(screen.getByText('Invalid email address')).toBeInTheDocument()
    })
  })

  it('clears validation errors when input becomes valid', async () => {
    render(<TestForm />)
    
    // First trigger validation errors
    await userEvent.type(screen.getByLabelText('Username'), 'a')
    await userEvent.click(screen.getByText('Submit'))
    
    await waitFor(() => {
      expect(screen.getByText('Username must be at least 2 characters')).toBeInTheDocument()
    })
    
    // Fix the input
    await userEvent.clear(screen.getByLabelText('Username'))
    await userEvent.type(screen.getByLabelText('Username'), 'validuser')
    
    await waitFor(() => {
      expect(screen.queryByText('Username must be at least 2 characters')).not.toBeInTheDocument()
    })
  })

  it('applies custom classes correctly', () => {
    render(
      <Form {...useForm()}>
        <FormField
          name="test"
          render={() => (
            <FormItem className="custom-item">
              <FormLabel className="custom-label">Label</FormLabel>
              <FormControl className="custom-control">
                <input />
              </FormControl>
              <FormDescription className="custom-desc">Description</FormDescription>
              <FormMessage className="custom-message" />
            </FormItem>
          )}
        />
      </Form>
    )
    
    expect(screen.getByText('Label').parentElement).toHaveClass('custom-item')
    expect(screen.getByText('Label')).toHaveClass('custom-label')
    expect(screen.getByRole('textbox').parentElement).toHaveClass('custom-control')
    expect(screen.getByText('Description')).toHaveClass('custom-desc')
  })

  it('handles nested form fields', async () => {
    const nestedSchema = z.object({
      account: z.object({
        username: z.string().min(2),
        settings: z.object({
          newsletter: z.boolean(),
        }),
      }),
    })

    const NestedForm = () => {
      const form = useForm({
        resolver: zodResolver(nestedSchema),
      })

      return (
        <Form {...form}>
          <form>
            <FormField
              control={form.control}
              name="account.username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="account.settings.newsletter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Newsletter</FormLabel>
                  <FormControl>
                    <input type="checkbox" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
      )
    }

    render(<NestedForm />)
    
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Newsletter')).toBeInTheDocument()
  })
})