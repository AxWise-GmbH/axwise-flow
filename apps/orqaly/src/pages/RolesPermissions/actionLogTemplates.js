export const ACTION_LOG_TEMPLATES = {
  role_created: { label: 'Role created', severity: 'info' },
  role_updated: { label: 'Role updated', severity: 'info' },
  role_deleted: { label: 'Role deleted', severity: 'high' },
  role_duplicated: { label: 'Role duplicated', severity: 'info' },
  user_role_changed: { label: 'Role assigned/changed', severity: 'medium' },
  user_status_changed: { label: 'User status changed', severity: 'medium' },
  user_deleted: { label: 'User deleted', severity: 'high' },
  user_2fa_disabled: { label: '2FA disabled', severity: 'medium' },
  password_reset_sent: { label: 'Password changed/reset', severity: 'medium' },
  user_invited: { label: 'User added/invited', severity: 'info' },
  user_created: { label: 'User created', severity: 'info' },
};

export function getActionTemplate(action) {
  return ACTION_LOG_TEMPLATES[action] || { label: action || 'Unknown action', severity: 'low' };
}

export function getActionCategory(action) {
  const value = String(action || '').toLowerCase();
  if (!value) return 'other';
  if (value.startsWith('role_') || value.includes('permission')) return 'roles_permissions';
  if (value.includes('password') || value.includes('2fa') || value.includes('security'))
    return 'security';
  if (value.startsWith('user_') || value.includes('invite')) return 'users';
  return 'other';
}

export function getCategoryLabel(category) {
  if (category === 'roles_permissions') return 'Roles & Permissions';
  if (category === 'users') return 'Users';
  if (category === 'security') return 'Security';
  return 'Other';
}

export function severityColor(severity) {
  if (severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  if (severity === 'info') return 'primary';
  return 'default';
}
