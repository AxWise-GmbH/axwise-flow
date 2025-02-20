"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ThemeProviderProps } from "@/types/component"

/**
 * Theme provider component that wraps next-themes provider
 * with proper TypeScript types and default values.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  attribute = "class",
  enableSystem = true,
  disableTransitionOnChange = false,
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      disableTransitionOnChange={disableTransitionOnChange}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

/**
 * Re-export everything from our custom theme hook
 */
export {
  useTheme,
  useEffectiveTheme,
  useDarkMode,
  getEffectiveTheme,
} from '../hooks/use-theme'

/**
 * Type exports for convenience
 */
export type { ThemeValue, UseThemeReturn } from '@/types/component'