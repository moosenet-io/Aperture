// GENERATED FILE — DO NOT EDIT.
//
// Source:    contracts/aperture-api-v1.yaml
// Digest:    sha256:bea4be20c3e4fb5c20a81fcdb941d7c3c5fc085cd4e6c843bc847ee3d5e7f8bd
// Generator: openapi-typescript@7.13.0
// Regenerate with: npm --prefix client run gen:api
//
// `npm --prefix client run assert-api-current` regenerates into memory and compares. A
// mismatch fails the build: contract drift is a build failure, not a runtime surprise.

/**
 * The contract version this SDK was generated against, in `major.minor` form.
 *
 * The transport compares it against the `X-Aperture-Contract-Version` response header to
 * classify skew (see `contracts/README.md`, "Version skew").
 */
export const CONTRACT_VERSION = "1.0" as const;

/** The major component of {@link CONTRACT_VERSION}, as a number. */
export const CONTRACT_VERSION_MAJOR = 1;

/** The minor component of {@link CONTRACT_VERSION}, as a number. */
export const CONTRACT_VERSION_MINOR = 0;

/**
 * The response header that carries the server's contract version. It carries the version and
 * nothing else — never a build hash, commit id, host name, or upstream component version.
 */
export const CONTRACT_VERSION_HEADER = 'X-Aperture-Contract-Version' as const;

/** The path prefix the API is always mounted at. Relative by construction. */
export const API_PATH_PREFIX = '/v1/aperture' as const;

/**
 * SHA-256 of `contracts/aperture-api-v1.yaml` at generation time.
 *
 * The drift gate compares this against the digest of the contract in the tree. Types alone
 * cannot detect a prose-only contract edit; this digest can, and does.
 */
export const CONTRACT_SOURCE_SHA256 = "bea4be20c3e4fb5c20a81fcdb941d7c3c5fc085cd4e6c843bc847ee3d5e7f8bd" as const;
