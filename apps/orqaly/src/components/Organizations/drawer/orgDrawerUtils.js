export function formatCompact(value) {
  if (value == null || value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs >= 1000) return `${value < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${value < 0 ? '-' : ''}$${abs.toFixed(0)}`;
}

export function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const KYB_STATUS_MAP = {
  draft: { label: 'Draft', color: '#888' },
  pending: { label: 'Pending', color: '#D97706' },
  verified: { label: 'Verified', color: '#059669' },
  rejected: { label: 'Rejected', color: '#DC2626' },
};
