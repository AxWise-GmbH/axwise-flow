/**
 * Format a number as USD currency
 */
export const formatCurrency = (value) => {
  if (value == null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

/**
 * Format a number as percentage
 */
export const formatPercent = (value) => {
  if (value == null) return '0%';
  return `${value.toFixed(1)}%`;
};

/**
 * Format a date string to locale date
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format a date/time as "dd/mm/yy - hh:mm:ss" (24h, zero-padded).
 * Returns '-' for missing/invalid input.
 */
export const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  const dd = p(d.getDate());
  const mm = p(d.getMonth() + 1);
  const yy = p(d.getFullYear() % 100);
  return `${dd}/${mm}/${yy} - ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/**
 * Generate a random ID with prefix
 */
export const generateId = (prefix = 'ID') => {
  return `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
};

/**
 * Debounce helper
 */
export const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};
