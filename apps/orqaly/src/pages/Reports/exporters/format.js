/**
 * Shared formatters for PDF exports.
 */

export function formatValue(value, format) {
  if (value == null || Number.isNaN(value)) return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  if (format === 'currency') {
    if (Math.abs(num) >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1_000) {
      return `$${(num / 1_000).toFixed(1)}k`;
    }
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (format === 'percent') return `${num.toFixed(1)}%`;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  if (num % 1 !== 0) return num.toFixed(1);
  return num.toLocaleString();
}

export function formatCell(value) {
  if (value == null) return '-';
  if (typeof value === 'number') return formatValue(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value && typeof value === 'object') {
    if ('value' in value && 'max' in value) return formatValue(value.value);
    return JSON.stringify(value).slice(0, 40);
  }
  return String(value);
}

export function humanizeKey(key) {
  if (typeof key !== 'string') return String(key);
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatDateShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function safeFileName(name) {
  return String(name || 'report')
    .replace(/[^\w\d-]+/g, '_')
    .slice(0, 80);
}

export function truncate(text, max) {
  if (!text) return '';
  const str = String(text);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
