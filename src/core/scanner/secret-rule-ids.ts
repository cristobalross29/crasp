// `token-leakage` is retained through migration (Phase 2 removes the builtin rule
// but the id stays in the set so redaction keeps working in both phases).
export const SECRET_RULE_IDS: ReadonlySet<string> = new Set<string>([
  "token-leakage",
]);

export function isSecretRule(id: string): boolean {
  return SECRET_RULE_IDS.has(id) || id.startsWith("secret-");
}
