/// <reference types="next" />
/// <reference types="next/types/global" />
/// <reference types="next/image-types/global" />

// Extend Window interface
declare interface Window {
  // Add any custom window properties here
  isUnmounting?: boolean;
  consolePatchApplied?: boolean;
  reactWarningsShown?: Set<string>;
  __inReactLifecycle?: boolean;
}

// Add support for importing CSS modules
declare module '*.css' {
  const content: { [className: string]: string }
  export default content
}

// Add support for importing images
declare module '*.png' {
  const content: string
  export default content
}

declare module '*.jpg' {
  const content: string
  export default content
}

declare module '*.svg' {
  import { ReactElement, SVGProps } from 'react'
  const content: (props: SVGProps<SVGElement>) => ReactElement
  export default content
}

// Add support for importing environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_...=***REMOVED***
    NODE_ENV: 'development' | 'production' | 'test'
    // Add other environment variables here
  }
}

// Theme types
declare type Theme = 'dark' | 'light' | 'system'
declare type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  attribute?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}

// Component props with generic support
declare type WithChildren<T = {}> = T & {
  children?: React.ReactNode
}

// API response types
declare interface ApiResponse<T = any> {
  data?: T
  error?: string
  status: number
}

// Utility types
declare type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

declare type ValueOf<T> = T[keyof T]

// Form types
declare interface FormField {
  name: string
  label: string
  type: string
  placeholder?: string
  required?: boolean
  validation?: object
}

// React Query types
declare type QueryConfig = {
  staleTime?: number
  cacheTime?: number
  refetchInterval?: number | false
  refetchOnWindowFocus?: boolean
}