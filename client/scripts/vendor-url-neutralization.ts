// Build-time neutralization of external URLs that a dependency bakes into a STRING (not a
// comment), where the string ships in the bundle but is never fetched.
//
// This is a narrow, temporary workaround, not a policy: the allowlist takes XML/HTML namespace
// URIs only, and a vendor documentation host is not one. Rather than widen the allowlist (which
// would let a reviewer miss a real CDN entry later), the exact string is replaced at build time
// and the reason is recorded here.
//
// Rules are SCOPED to the dependency that owns them: a rule only applies to a chunk that
// actually contains that module. A repo-wide replacement would rewrite application code that
// merely happened to contain the same characters.

export interface VendorUrlNeutralization {
  /** Exact substring to replace. Never a pattern — an exact string, or nothing happens. */
  readonly find: string;
  /** Replacement. Must preserve whatever the surrounding code does with the value. */
  readonly replace: string;
  /** Path fragment identifying the owning module; the rule applies only to chunks containing it. */
  readonly module: string;
  /** Why this is neutralized rather than allowlisted or left alone. */
  readonly reason: string;
}

export const VENDOR_URL_NEUTRALIZATIONS: readonly VendorUrlNeutralization[] = [
  {
    find: 'https://reactjs.org/docs/error-decoder.html?invariant=',
    replace: 'react-error-decoder?invariant=',
    module: 'node_modules/react-dom/',
    reason:
      'react-dom production builds concatenate this documentation URL into minified error text '
      + '(formatProdErrorMessage). It is never fetched, but it ships an external origin in the '
      + 'bundle. The invariant number and the &args[] suffix are preserved, so the error message '
      + 'stays actionable offline.',
  },
];

export interface NeutralizationResult {
  readonly code: string;
  /** `find` values that were applied to this chunk. */
  readonly applied: readonly string[];
}

function normalizeId(id: string): string {
  return id.replace(/\\/g, '/');
}

/**
 * Apply every rule whose owning module is present in this chunk.
 * @param code chunk source
 * @param moduleIds module ids that make up the chunk
 */
export function applyNeutralizations(
  code: string,
  moduleIds: readonly string[],
  rules: readonly VendorUrlNeutralization[] = VENDOR_URL_NEUTRALIZATIONS,
): NeutralizationResult {
  const ids = moduleIds.map(normalizeId);
  let out = code;
  const applied: string[] = [];
  for (const rule of rules) {
    if (!ids.some((id) => id.includes(rule.module))) continue;
    if (!out.includes(rule.find)) continue;
    out = out.split(rule.find).join(rule.replace);
    applied.push(rule.find);
  }
  return { code: out, applied };
}

/**
 * A rule that never fires is stale: the dependency changed its string, or the module is gone.
 * Failing the build is deliberate — a silently-inert rule would leave a future reader believing
 * a URL is being neutralized when it is not.
 */
export function staleRules(
  appliedAcrossBuild: ReadonlySet<string>,
  rules: readonly VendorUrlNeutralization[] = VENDOR_URL_NEUTRALIZATIONS,
): readonly VendorUrlNeutralization[] {
  return rules.filter((rule) => !appliedAcrossBuild.has(rule.find));
}
