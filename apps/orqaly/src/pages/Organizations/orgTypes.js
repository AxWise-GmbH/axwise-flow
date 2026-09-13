export const ORG_TYPES = [
  { value: 'virtual', label: 'Virtual', color: '#6366F1' },
  { value: 'holding', label: 'Holding', color: '#7C3AED' },
  { value: 'subsidiary', label: 'Subsidiary', color: '#2563EB' },
  { value: 'division', label: 'Division', color: '#059669' },
  { value: 'department', label: 'Department', color: '#D97706' },
];

export function getTypeColor(type) {
  return ORG_TYPES.find((t) => t.value === type)?.color || '#888';
}

export function getTypeLabel(type) {
  return ORG_TYPES.find((t) => t.value === type)?.label || type;
}
