import type { ComponentProps, ElementRef, ComponentPropsWithoutRef } from 'react'
import type { ThemeProviderProps as NextThemeProviderProps } from 'next-themes/dist/types'

// Utility type for component props with children
export type WithChildren<T = {}> = T & {
  children?: React.ReactNode
}

// Theme types
export interface ThemeProviderProps extends Omit<NextThemeProviderProps, 'attribute'> {
  children: React.ReactNode
  defaultTheme?: 'light' | 'dark' | 'system'
  attribute?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}

// Utility type for polymorphic components
export type PolymorphicProps<Element extends React.ElementType, Props = {}> = {
  as?: Element
} & Props &
  Omit<React.ComponentPropsWithoutRef<Element>, keyof Props | 'as'>

// Utility type for forwarded ref components
export type ForwardRefComponent<
  Props extends object,
  Element extends React.ElementType
> = React.ForwardRefExoticComponent<
  Props & React.RefAttributes<React.ElementRef<Element>>
>

// Component specific types
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  asChild?: boolean
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean
}

export interface ProgressProps {
  value?: number
  max?: number
  className?: string
  indicatorClassName?: string
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  icon?: React.ReactNode
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>
  error?: boolean
  icon?: React.ReactNode
}

// Form specific types
export interface FormFieldProps {
  name: string
  label?: string
  error?: string
  required?: boolean
  className?: string
}

export interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  onSubmit: (data: any) => Promise<void> | void
  loading?: boolean
}

// Toast types
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive'
  title?: string
  description?: string
  action?: React.ReactNode
}

// Custom utility types
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }

// Theme value types for useTheme hook
export type ThemeValue = 'light' | 'dark' | 'system'
export interface UseThemeReturn {
  theme: ThemeValue
  setTheme: (theme: ThemeValue) => void
}