const STORAGE_KEY = 'orqaly_landing_variant';

export function readLandingVariant() {
  if (typeof window === 'undefined') return 'full';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'simple' ? 'simple' : 'full';
  } catch {
    return 'full';
  }
}

export function writeLandingVariant(variant) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, variant === 'simple' ? 'simple' : 'full');
  } catch {
    /* private browsing / storage disabled */
  }
}
