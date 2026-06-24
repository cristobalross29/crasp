// All provider-level secret rule ids use the "secret-" prefix.
// The legacy "token-leakage" id was retired in Phase 2.
export function isSecretRule(id: string): boolean {
  return id.startsWith("secret-");
}
