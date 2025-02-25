'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes/dist/types';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/**
 * Theme context to expose the current theme state and setter
 */
export const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  setTheme: () => null,
});

/**
 * Hook to use theme context
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

/**
 * Theme provider component that wraps the application and provides theme context
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps): JSX.Element {
  const [currentTheme, setCurrentTheme] = useState<Theme>(
    (props.defaultTheme as Theme) || 'system'
  );

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, setTheme: setCurrentTheme }}>
      <NextThemesProvider {...props}>{children}</NextThemesProvider>
    </ThemeContext.Provider>
  );
}