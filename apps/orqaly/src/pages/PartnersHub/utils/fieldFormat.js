/**
 * Config-driven value formatting for the Partners hub. A field's `type` decides
 * how its value renders in tables/metrics, and a metric's `format` decides how
 * its aggregate renders in the strip.
 */
import { COUNTRY_FLAGS } from '../../../utils/constants';

export const COUNTRY_OPTIONS = Object.keys(COUNTRY_FLAGS);

function nfmt(n) {
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatCountry(code) {
  if (!code) return '';
  const flag = COUNTRY_FLAGS[code];
  return flag ? `${flag} ${code}` : String(code);
}

/** Format a raw field value for display in a table cell. */
export function formatFieldValue(field, value) {
  if (value === undefined || value === null || value === '') return '—';
  switch (field?.type) {
    case 'currency':
      return `$${nfmt(value)}`;
    case 'percent':
      return `${nfmt(value)}%`;
    case 'number':
      return nfmt(value);
    case 'country':
      return formatCountry(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'multiselect':
    case 'tags':
      return Array.isArray(value) ? value.join(', ') : String(value);
    default:
      return String(value);
  }
}

/** Format an aggregated metric value for the metrics strip. */
export function formatMetricValue(format, value) {
  switch (format) {
    case 'currency':
      return `$${nfmt(value)}`;
    case 'percent':
      return `${nfmt(value)}%`;
    default:
      return nfmt(value);
  }
}
