// All provider-level secret rule ids use the "secret-" prefix.
// The legacy "token-leakage" id was retired in Phase 2; it is no longer
// in this set because the builtin rule has been removed.
export const SECRET_RULE_IDS: ReadonlySet<string> = new Set<string>();

export function isSecretRule(id: string): boolean {
  return id.startsWith("secret-");
}
