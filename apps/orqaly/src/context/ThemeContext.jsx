import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { getEnterpriseTheme, getAccentCssVars } from '../theme/enterpriseTheme';

const STORAGE_KEY = 'orchestratori-theme-mode';
const STORAGE_KEY_PRIMARY = 'orchestratori-primary-color';
const STORAGE_KEY_MOTIVATION = 'orchestratori-motivation-enabled';
const STORAGE_KEY_MOTIVATION_LANG = 'orchestratori-motivation-language';
const STORAGE_KEY_DEFAULT_PAGE = 'orchestratori-logo-default-page-v2';
const STORAGE_KEY_DEV_MODE = 'orchestratori-dev-mode';
const STORAGE_KEY_ICON_SET = 'orchestratori-icon-set';
const STORAGE_KEY_BRAND_NAME = 'orchestratori-brand-name';
const STORAGE_KEY_BRAND_SUBTITLE = 'orchestratori-brand-subtitle';
const STORAGE_KEY_BRAND_LOGO = 'orchestratori-brand-logo';

const ICON_SETS = ['mui', 'outline', 'filled'];

const ThemeContext = createContext({
  mode: 'light',
  primaryColor: null,
  designVersion: 'v2',
  motivationEnabled: true,
  motivationLanguage: 'en',
  logoDefaultPage: '/home',
  devMode: false,
  iconSet: 'mui',
  brandName: '',
  brandSubtitle: '',
  brandLogo: '',
  toggleColorMode: () => {},
  setPrimaryColor: () => {},
  setMotivationEnabled: () => {},
  setMotivationLanguage: () => {},
  setLogoDefaultPage: () => {},
  setDevMode: () => {},
  setIconSet: () => {},
  setBrandName: () => {},
  setBrandSubtitle: () => {},
  setBrandLogo: () => {},
});

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [primaryColor, setPrimaryColorState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PRIMARY);
      return stored || null;
    } catch {
      return null;
    }
  });

  const [motivationEnabled, setMotivationEnabledState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_MOTIVATION);
      return stored === 'false' ? false : true; // default ON
    } catch {
      return true;
    }
  });

  const [motivationLanguage, setMotivationLanguageState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_MOTIVATION_LANG);
      return stored === 'ru' ? 'ru' : 'en'; // default English
    } catch {
      return 'en';
    }
  });

  const [logoDefaultPage, setLogoDefaultPageState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DEFAULT_PAGE);
      return stored || '/home';
    } catch {
      return '/home';
    }
  });

  const [devMode, setDevModeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_DEV_MODE) === 'true';
    } catch {
      return false;
    }
  });

  const [iconSet, setIconSetState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ICON_SET);
      return ICON_SETS.includes(stored) ? stored : 'mui'; // default Material
    } catch {
      return 'mui';
    }
  });

  const [brandName, setBrandNameState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_BRAND_NAME) || '';
    } catch {
      return '';
    }
  });

  const [brandSubtitle, setBrandSubtitleState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_BRAND_SUBTITLE) || '';
    } catch {
      return '';
    }
  });

  const [brandLogo, setBrandLogoState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_BRAND_LOGO) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    return () => document.documentElement.removeAttribute('data-theme');
  }, [mode]);

  useEffect(() => {
    try {
      if (primaryColor) localStorage.setItem(STORAGE_KEY_PRIMARY, primaryColor);
      else localStorage.removeItem(STORAGE_KEY_PRIMARY);
    } catch (_) {}
  }, [primaryColor]);

  // Sync the accent onto root CSS variables so simple-mode pages (.mkt-landing),
  // which read CSS vars instead of the MUI palette, follow the chosen colour.
  useEffect(() => {
    const root = document.documentElement;
    const vars = getAccentCssVars(primaryColor || null);
    Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val));
  }, [primaryColor]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MOTIVATION, String(motivationEnabled));
    } catch (_) {}
  }, [motivationEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MOTIVATION_LANG, motivationLanguage);
    } catch (_) {}
  }, [motivationLanguage]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DEFAULT_PAGE, logoDefaultPage);
    } catch (_) {}
  }, [logoDefaultPage]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DEV_MODE, String(devMode));
    } catch (_) {}
  }, [devMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ICON_SET, iconSet);
    } catch (_) {}
  }, [iconSet]);

  useEffect(() => {
    try {
      if (brandName) localStorage.setItem(STORAGE_KEY_BRAND_NAME, brandName);
      else localStorage.removeItem(STORAGE_KEY_BRAND_NAME);
    } catch (_) {}
  }, [brandName]);

  useEffect(() => {
    try {
      if (brandSubtitle) localStorage.setItem(STORAGE_KEY_BRAND_SUBTITLE, brandSubtitle);
      else localStorage.removeItem(STORAGE_KEY_BRAND_SUBTITLE);
    } catch (_) {}
  }, [brandSubtitle]);

  useEffect(() => {
    try {
      if (brandLogo) localStorage.setItem(STORAGE_KEY_BRAND_LOGO, brandLogo);
      else localStorage.removeItem(STORAGE_KEY_BRAND_LOGO);
    } catch (_) {}
  }, [brandLogo]);

  const toggleColorMode = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setPrimaryColor = (color) => {
    setPrimaryColorState(color || null);
  };

  const setMotivationEnabled = (val) => {
    setMotivationEnabledState(Boolean(val));
  };

  const setMotivationLanguage = (lang) => {
    setMotivationLanguageState(lang === 'ru' ? 'ru' : 'en');
  };

  const setLogoDefaultPage = (page) => {
    setLogoDefaultPageState(page || '/home');
  };

  const setDevMode = (val) => {
    setDevModeState(Boolean(val));
  };

  const setIconSet = (val) => {
    setIconSetState(ICON_SETS.includes(val) ? val : 'mui');
  };

  const setBrandName = (val) => {
    setBrandNameState(typeof val === 'string' ? val : '');
  };

  const setBrandSubtitle = (val) => {
    setBrandSubtitleState(typeof val === 'string' ? val : '');
  };

  const setBrandLogo = (val) => {
    setBrandLogoState(typeof val === 'string' ? val : '');
  };

  const theme = useMemo(() => {
    return getEnterpriseTheme(mode, primaryColor || null);
  }, [mode, primaryColor]);

  const value = useMemo(
    () => ({
      mode,
      primaryColor,
      designVersion: 'v2',
      motivationEnabled,
      motivationLanguage,
      logoDefaultPage,
      devMode,
      iconSet,
      brandName,
      brandSubtitle,
      brandLogo,
      toggleColorMode,
      setPrimaryColor,
      setMotivationEnabled,
      setMotivationLanguage,
      setLogoDefaultPage,
      setDevMode,
      setIconSet,
      setBrandName,
      setBrandSubtitle,
      setBrandLogo,
    }),
    [
      mode,
      primaryColor,
      motivationEnabled,
      motivationLanguage,
      logoDefaultPage,
      devMode,
      iconSet,
      brandName,
      brandSubtitle,
      brandLogo,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeProvider');
  return ctx;
}
