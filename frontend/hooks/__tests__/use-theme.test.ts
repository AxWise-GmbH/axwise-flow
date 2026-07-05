import { renderHook, act } from '@testing-library/react'
import { useTheme, useEffectiveTheme, useDarkMode, getEffectiveTheme } from '../use-theme'
import type { ThemeValue } from '@/types/component'

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn().mockReturnValue({
    theme: 'system',
    setTheme: jest.fn(),
  }),
}))

describe('Theme Hooks', () => {
  const mockSetTheme = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    // Update mock implementation for each test
    require('next-themes').useTheme.mockReturnValue({
      theme: 'system',
      setTheme: mockSetTheme,
    })
  })

  describe('useTheme', () => {
    it('returns current theme and setTheme function', () => {
      const { result } = renderHook(() => useTheme())

      expect(result.current.theme).toBe('system')
      expect(typeof result.current.setTheme).toBe('function')
    })

    it('handles theme changes', () => {
      const { result, rerender } = renderHook(() => useTheme())

      // Mock theme change
      require('next-themes').useTheme.mockReturnValue({
        theme: 'dark',
        setTheme: mockSetTheme,
      })
      rerender()

      expect(result.current.theme).toBe('dark')
    })

    it('sets theme correctly', () => {
      const { result } = renderHook(() => useTheme())

      act(() => {
        result.current.setTheme('light')
      })

      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })

    it('defaults to system theme when theme is undefined', () => {
      require('next-themes').useTheme.mockReturnValue({
        theme: undefined,
        setTheme: mockSetTheme,
      })

      const { result } = renderHook(() => useTheme())
      expect(result.current.theme).toBe('system')
    })
  })

  describe('getEffectiveTheme', () => {
    const originalMatchMedia = window.matchMedia

    beforeEach(() => {
      // Mock matchMedia
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
      }))
    })

    afterEach(() => {
      window.matchMedia = originalMatchMedia
    })

    it('returns light for light theme', () => {
      expect(getEffectiveTheme('light')).toBe('light')
    })

    it('returns dark for dark theme', () => {
      expect(getEffectiveTheme('dark')).toBe('dark')
    })

    it('checks system preference for system theme', () => {
      // Mock system dark preference
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
      }))
      expect(getEffectiveTheme('system')).toBe('dark')

      // Mock system light preference
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
      }))
      expect(getEffectiveTheme('system')).toBe('light')
    })

    it('defaults to light when window is undefined', () => {
      const windowSpy = jest.spyOn(global, 'window', 'get')
      windowSpy.mockReturnValue(undefined as any)

      expect(getEffectiveTheme('system')).toBe('light')

      windowSpy.mockRestore()
    })
  })

  describe('useEffectiveTheme', () => {
    it('returns effective theme based on current theme', () => {
      // Mock dark theme
      require('next-themes').useTheme.mockReturnValue({
        theme: 'dark',
        setTheme: mockSetTheme,
      })
      
      const { result: darkResult } = renderHook(() => useEffectiveTheme())
      expect(darkResult.current).toBe('dark')

      // Mock light theme
      require('next-themes').useTheme.mockReturnValue({
        theme: 'light',
        setTheme: mockSetTheme,
      })
      
      const { result: lightResult } = renderHook(() => useEffectiveTheme())
      expect(lightResult.current).toBe('light')
    })

    it('handles system theme', () => {
      require('next-themes').useTheme.mockReturnValue({
        theme: 'system',
        setTheme: mockSetTheme,
      })

      // Mock system dark preference
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
      }))

      const { result } = renderHook(() => useEffectiveTheme())
      expect(result.current).toBe('dark')
    })
  })

  describe('useDarkMode', () => {
    it('returns true when theme is dark', () => {
      require('next-themes').useTheme.mockReturnValue({
        theme: 'dark',
        setTheme: mockSetTheme,
      })

      const { result } = renderHook(() => useDarkMode())
      expect(result.current).toBe(true)
    })

    it('returns false when theme is light', () => {
      require('next-themes').useTheme.mockReturnValue({
        theme: 'light',
        setTheme: mockSetTheme,
      })

      const { result } = renderHook(() => useDarkMode())
      expect(result.current).toBe(false)
    })

    it('checks system preference when theme is system', () => {
      require('next-themes').useTheme.mockReturnValue({
        theme: 'system',
        setTheme: mockSetTheme,
      })

      // Mock system dark preference
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
      }))

      const { result: darkResult } = renderHook(() => useDarkMode())
      expect(darkResult.current).toBe(true)

      // Mock system light preference
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
      }))

      const { result: lightResult } = renderHook(() => useDarkMode())
      expect(lightResult.current).toBe(false)
    })
  })
})