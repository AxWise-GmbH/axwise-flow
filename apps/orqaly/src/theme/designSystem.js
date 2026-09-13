/**
 * Design system colors used across the platform.
 * Primary can be overridden in Settings > Preferences.
 */
export const DESIGN_SYSTEM_COLORS = {
  light: {
    primary: { main: '#1B2A4A', light: '#2E4068', dark: '#0F1B33', label: 'Primary (navy)' },
    secondary: { main: '#3B82F6', light: '#60A5FA', dark: '#2563EB', label: 'Secondary (blue)' },
    success: { main: '#10B981', light: '#34D399', dark: '#059669', label: 'Success (green)' },
    warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706', label: 'Warning (amber)' },
    error: { main: '#EF4444', light: '#F87171', dark: '#DC2626', label: 'Error (red)' },
    info: { main: '#3B82F6', light: '#60A5FA', dark: '#2563EB', label: 'Info (blue)' },
  },
  dark: {
    primary: { main: '#5B8DEF', light: '#7BA8F5', dark: '#4A7BD9', label: 'Primary (blue)' },
    secondary: { main: '#6B7280', light: '#9CA3AF', dark: '#4B5563', label: 'Secondary (grey)' },
    success: { main: '#22C55E', light: '#4ADE80', dark: '#16A34A', label: 'Success (green)' },
    warning: { main: '#EAB308', light: '#FACC15', dark: '#CA8A04', label: 'Warning (amber)' },
    error: { main: '#EF4444', light: '#F87171', dark: '#DC2626', label: 'Error (red)' },
    info: { main: '#3B82F6', light: '#60A5FA', dark: '#2563EB', label: 'Info (blue)' },
  },
};

/** Pages where each color appears */
export const COLOR_USAGE = {
  primary: ['Dashboard', 'Partners', 'Workflow', 'Task Manager', 'Meetings'],
  secondary: ['Partners', 'Sidebar'],
  success: ['Dashboard', 'Partners'],
  warning: ['Settings'],
  error: ['Forms'],
  info: ['Notifications', 'Activity Log'],
};

/** Preset primary colors for quick selection */
export const PRIMARY_PRESETS = [
  { value: '', label: 'Default', light: '#1B2A4A', dark: '#5B8DEF' },
  { value: '#1B2A4A', label: 'Navy', light: '#1B2A4A', dark: '#5B8DEF' },
  { value: '#2563EB', label: 'Blue', light: '#2563EB', dark: '#3B82F6' },
  { value: '#059669', label: 'Emerald', light: '#059669', dark: '#10B981' },
  { value: '#7C3AED', label: 'Violet', light: '#7C3AED', dark: '#8B5CF6' },
  { value: '#DC2626', label: 'Red', light: '#DC2626', dark: '#EF4444' },
  { value: '#EA580C', label: 'Orange', light: '#EA580C', dark: '#F97316' },
];
