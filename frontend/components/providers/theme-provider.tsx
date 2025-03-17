'use client';

import { createContext, useContext, useState } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps as NextThemeProviderProps } from 'next-themes/dist/types';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/**
 * Extended theme provider props with forcedTheme option
 */
export interface ThemeProviderProps extends NextThemeProviderProps {
  children: React.ReactNode;
  forcedTheme?: Theme;
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
 * Combines features from both implementations for a consolidated solution
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
  attribute = 'class',
  enableSystem = true,
  disableTransitionOnChange = false,
  forcedTheme,
  ...props
}: ThemeProviderProps): JSX.Element {
  const [currentTheme, setCurrentTheme] = useState<Theme>(
    (forcedTheme || defaultTheme) as Theme
  );

  return (
    <ThemeContext.Provider value={{ 
      theme: forcedTheme || currentTheme, 
      setTheme: setCurrentTheme 
    }}>
      <NextThemesProvider
        attribute={attribute}
        defaultTheme={defaultTheme}
        enableSystem={enableSystem}
        disableTransitionOnChange={disableTransitionOnChange}
        forcedTheme={forcedTheme}
        {...props}
      >
        {children}
      </NextThemesProvider>
    </ThemeContext.Provider>
  );
}