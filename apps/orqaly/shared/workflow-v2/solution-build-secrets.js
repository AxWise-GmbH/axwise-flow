// Shared browser/server preflight only, not a general-purpose DLP guarantee.
// Keep this dependency-free so the UI does not import server contract schemas.
export function containsSolutionBuildSecret(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return (
    /\b(?:sk[-_](?:live[-_]|test[-_]|proj[-_])?[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{12,}|ya29\.[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9_.-]{12,})/i.test(
      text
    ) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) ||
    /(?:password|api[_ -]?key|access[_ -]?token|client[_ -]?secret|authorization)["']?\s*(?:[=:]|\bis\b)\s*["']?[^\s"',;]{8,}/i.test(
      text
    )
  );
}

// No generic information question may become an unsupervised credential or
// payment-data collection form. Those need a separately supported secure flow.
export function requestsSolutionBuildSecret(value) {
  return /(?:api[\s_-]?key|pass(?:word|phrase)|access[\s_-]?token|client[\s_-]?secret|private[\s_-]?key|credential|bearer|oauth|card[\s_-]?number|\bCVV\b|\bCVC\b|bank[\s_-]?account)/i.test(
    value
  );
}
