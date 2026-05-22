/**
 * Heuristic for MCP env var / HTTP header names that hold secrets.
 * Used for display redaction and password-style edit fields (not for persistence).
 */
export function isSecretFieldName(name: string): boolean {
  const n = name.trim();
  if (!n) {
    return false;
  }
  return (
    /authorization/i.test(n) ||
    /authentication/i.test(n) ||
    /secret/i.test(n) ||
    /key/i.test(n) ||
    /token/i.test(n) ||
    /password/i.test(n) ||
    /credential/i.test(n) ||
    /bearer/i.test(n) ||
    /api[_-]?key/i.test(n) ||
    /private/i.test(n) ||
    /passwd/i.test(n) ||
    /\bpwd\b/i.test(n) ||
    /^auth$/i.test(n) ||
    /[-_]auth$/i.test(n) ||
    /^auth[-_]/i.test(n)
  );
}

/** Obfuscate a secret value for read-only display (one bullet per character). */
export function obfuscateSecretValue(value: string): string {
  if (!value) {
    return '';
  }
  return '•'.repeat(value.length);
}
