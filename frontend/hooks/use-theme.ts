import { useTheme as useNextTheme } from 'next-themes'
import type { ThemeValue, UseThemeReturn } from '@/types/component'

/**
 * Custom hook for handling theme functionality with proper TypeScript types.
 * This wraps next-themes' useTheme hook to provide better type safety.
 */
export function useTheme(): UseThemeReturn {
  const { theme, setTheme: setNextTheme } = useNextTheme()

  const setTheme = (newTheme: ThemeValue) => {
    setNextTheme(newTheme)
  }

  return {
    theme: (theme || 'system') as ThemeValue,
    setTheme,
  }
}

/**
 * Utility function to get the effective theme value
 */
export function getEffectiveTheme(theme: ThemeValue): 'light' | 'dark' {
  if (theme === 'system') {
    // Check system preference
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return theme === 'dark' ? 'dark' : 'light'
}

/**
 * Hook to get the current effective theme (light/dark)
 */
export function useEffectiveTheme(): 'light' | 'dark' {
  const { theme } = useTheme()
  return getEffectiveTheme(theme)
}

/**
 * Hook to check if the current theme is dark mode
 */
export function useDarkMode(): boolean {
  return useEffectiveTheme() === 'dark'
}