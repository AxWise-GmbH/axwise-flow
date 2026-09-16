export function isCanonicalPublicHttpsUrl(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4000 ||
    !value.startsWith('https://') ||
    /\s/u.test(value)
  ) {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const authorityEnd = value.slice(8).search(/[/?#]/u);
  const authority = authorityEnd === -1
    ? value.slice(8)
    : value.slice(8, 8 + authorityEnd);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !authority ||
    authority.includes('@') ||
    authority.includes(':') ||
    authority !== authority.toLowerCase() ||
    authority !== parsed.hostname ||
    authority.endsWith('.') ||
    /^\d+(?:\.\d+){3}$/u.test(authority)
  ) {
    return false;
  }
  if (
    authority === 'localhost' ||
    authority.endsWith('.localhost') ||
    authority.endsWith('.local') ||
    authority.endsWith('.internal')
  ) {
    return false;
  }
  const labels = authority.split('.');
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
    )
  );
}
