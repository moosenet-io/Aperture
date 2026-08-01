// APTR-07 — the shared code-generation core.
//
// `gen-api.mjs` writes what this module produces. `assert-api-current.mjs` produces the same
// thing into memory and compares it against what is checked in. Both import from here so that
// the generator and the drift gate can never disagree about HOW output is produced — a drift
// gate that regenerates differently from the generator is a gate that reports drift that does
// not exist, and misses drift that does.
//
// ── WHAT IS GENERATED, AND FROM WHAT ────────────────────────────────────────────────────────
//
//   contracts/aperture-api-v1.yaml   (the only input)
//        │
//        ├─ src/api/generated/schema.ts      openapi-typescript output: `paths`, `components`,
//        │                                   `operations`. Types only — this file emits no
//        │                                   runtime JavaScript.
//        ├─ src/api/generated/operations.ts  a runtime table: operationId -> { method, path }.
//        │                                   Derived from the same document so an operation's
//        │                                   HTTP method (and therefore whether the transport
//        │                                   may retry it) comes from the contract rather than
//        │                                   from a hand-maintained list.
//        └─ src/api/generated/meta.ts        the contract version (`info.x-contract-version`)
//                                            and the digest of the source document.
//
// ── WHY THE SOURCE DIGEST IS EMITTED ────────────────────────────────────────────────────────
//
// openapi-typescript emits TYPES. A contract edit that changes only prose — a description, a
// rule, an example, a `summary` — produces byte-identical types. Without the digest the drift
// gate would pass while the checked-in SDK was generated from a different document than the
// one in the tree, which is precisely the class of silent skew this gate exists to prevent.
// Emitting `CONTRACT_SOURCE_SHA256` makes the gate sensitive to ANY change to the contract
// file, including a whitespace-only one. That is deliberate: regenerating is one command, and
// a gate whose sensitivity you have to reason about is a gate nobody trusts.
//
// ── DETERMINISM ─────────────────────────────────────────────────────────────────────────────
//
// The generator version is PINNED EXACTLY in package.json (`openapi-typescript`, `yaml`) and
// asserted below against the version this module was written for. A minor bump that silently
// reformats output would otherwise fail the drift check for a reason that has nothing to do
// with the contract, and the reader would go looking for a contract change that never
// happened. The pinned version is written into the banner of every generated file so the
// provenance travels with the artifact.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';
import { parse as parseYaml } from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `client/` — the workspace root. */
export const CLIENT_ROOT = path.resolve(HERE, '..');
/** The repository root, one level above `client/`. */
export const REPO_ROOT = path.resolve(CLIENT_ROOT, '..');
/** The single generation input. */
export const CONTRACT_PATH = path.join(REPO_ROOT, 'contracts', 'aperture-api-v1.yaml');
/** Where generated output is checked in. */
export const GENERATED_DIR = path.join(CLIENT_ROOT, 'src', 'api', 'generated');

/**
 * The generator versions this module was written against, asserted at generation time.
 * Read from the installed packages rather than hardcoded twice.
 */
const PINNED = {
  'openapi-typescript': '7.13.0',
  yaml: '2.8.1',
};

async function installedVersion(pkg) {
  const manifest = path.join(CLIENT_ROOT, 'node_modules', pkg, 'package.json');
  const raw = await readFile(manifest, 'utf8');
  return JSON.parse(raw).version;
}

/**
 * Fail loudly if an installed generator does not match the pin. A silent reformat from a
 * version bump would surface as "contract drift", sending the reader after a contract change
 * that never happened.
 */
export async function assertPinnedGenerators() {
  const mismatches = [];
  for (const [pkg, expected] of Object.entries(PINNED)) {
    const actual = await installedVersion(pkg);
    if (actual !== expected) mismatches.push(`${pkg}: pinned ${expected}, installed ${actual}`);
  }
  if (mismatches.length > 0) {
    throw new Error(
      'Generator version mismatch. The pin exists so that a formatting change from a version '
      + 'bump cannot masquerade as contract drift.\n  '
      + mismatches.join('\n  ')
      + '\nUpdate PINNED in scripts/api-codegen.mjs and package.json together, then regenerate.',
    );
  }
  return { ...PINNED };
}

function banner(sourceSha256) {
  return [
    '// GENERATED FILE — DO NOT EDIT.',
    '//',
    '// Source:    contracts/aperture-api-v1.yaml',
    `// Digest:    sha256:${sourceSha256}`,
    `// Generator: openapi-typescript@${PINNED['openapi-typescript']}`,
    '// Regenerate with: npm --prefix client run gen:api',
    '//',
    '// `npm --prefix client run assert-api-current` regenerates into memory and compares. A',
    '// mismatch fails the build: contract drift is a build failure, not a runtime surprise.',
    '',
  ].join('\n');
}

/** Methods OpenAPI defines on a Path Item Object. */
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function tsStringLiteral(value) {
  // Only ever applied to values taken from the contract; JSON.stringify gives correct escaping.
  return JSON.stringify(value);
}

/**
 * Build the runtime operation table. Paths are recorded EXACTLY as the contract writes them —
 * relative, `/`-rooted, template placeholders intact. No origin, host, or port is involved:
 * the base URL is supplied to the transport at construction time and prefixed at request time.
 */
function renderOperations(document, sourceSha256) {
  const rows = [];
  for (const [pathTemplate, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') continue;
      const operationId = operation.operationId;
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error(
          `Operation ${method.toUpperCase()} ${pathTemplate} has no operationId. The SDK keys `
          + 'its operation table on operationId, so an unnamed operation is unreachable.',
        );
      }
      rows.push({ operationId, method: method.toUpperCase(), path: pathTemplate });
    }
  }
  rows.sort((a, b) => (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0));

  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.operationId)) {
      throw new Error(
        `Duplicate operationId ${row.operationId} on ${row.method} ${row.path} and `
        + `${seen.get(row.operationId)}. operationIds must be unique across the document.`,
      );
    }
    seen.set(row.operationId, `${row.method} ${row.path}`);
  }

  const entries = rows
    .map(
      (row) => `  ${JSON.stringify(row.operationId)}: `
        + `{ method: ${tsStringLiteral(row.method)}, path: ${tsStringLiteral(row.path)} },`,
    )
    .join('\n');

  return `${banner(sourceSha256)}
/** An HTTP method as it appears in the contract. */
export type HttpMethod =
${HTTP_METHODS.map((m) => `  | ${tsStringLiteral(m.toUpperCase())}`).join('\n')};

/** One operation's wire coordinates. \`path\` is relative and \`/\`-rooted, never absolute. */
export interface OperationDescriptor {
  readonly method: HttpMethod;
  /**
   * The contract path template, e.g. \`/threads/{threadId}\`. It carries no origin: the base
   * URL is injected into the transport at construction and prefixed at request time.
   */
  readonly path: string;
}

/**
 * Every operation in the contract, keyed by \`operationId\`.
 *
 * The transport reads an operation's method from here rather than from a hand-written list, so
 * a contract change that turns a GET into a POST changes the transport's retry decision in the
 * same regeneration — it cannot be forgotten.
 */
export const OPERATIONS = {
${entries}
} as const satisfies Record<string, OperationDescriptor>;

/** The \`operationId\` of every operation in the contract. */
export type OperationId = keyof typeof OPERATIONS;
`;
}

function renderMeta(document, sourceSha256) {
  const contractVersion = document.info?.['x-contract-version'];
  if (typeof contractVersion !== 'string' || !/^[0-9]+\.[0-9]+$/.test(contractVersion)) {
    throw new Error(
      'contracts/aperture-api-v1.yaml: info.x-contract-version must be a `major.minor` string. '
      + 'The client embeds it to classify version skew, so it cannot be absent or free-form.',
    );
  }
  const [major, minor] = contractVersion.split('.');

  return `${banner(sourceSha256)}
/**
 * The contract version this SDK was generated against, in \`major.minor\` form.
 *
 * The transport compares it against the \`X-Aperture-Contract-Version\` response header to
 * classify skew (see \`contracts/README.md\`, "Version skew").
 */
export const CONTRACT_VERSION = ${tsStringLiteral(contractVersion)} as const;

/** The major component of {@link CONTRACT_VERSION}, as a number. */
export const CONTRACT_VERSION_MAJOR = ${Number(major)};

/** The minor component of {@link CONTRACT_VERSION}, as a number. */
export const CONTRACT_VERSION_MINOR = ${Number(minor)};

/**
 * The response header that carries the server's contract version. It carries the version and
 * nothing else — never a build hash, commit id, host name, or upstream component version.
 */
export const CONTRACT_VERSION_HEADER = 'X-Aperture-Contract-Version' as const;

/** The path prefix the API is always mounted at. Relative by construction. */
export const API_PATH_PREFIX = '/v1/aperture' as const;

/**
 * SHA-256 of \`contracts/aperture-api-v1.yaml\` at generation time.
 *
 * The drift gate compares this against the digest of the contract in the tree. Types alone
 * cannot detect a prose-only contract edit; this digest can, and does.
 */
export const CONTRACT_SOURCE_SHA256 = ${tsStringLiteral(sourceSha256)} as const;
`;
}

/**
 * Generate every artifact from the contract, in memory.
 *
 * @returns {Promise<{ files: Record<string, string>, sourceSha256: string }>} file contents
 *   keyed by path relative to `src/api/generated/`.
 */
export async function generateAll() {
  await assertPinnedGenerators();

  const source = await readFile(CONTRACT_PATH, 'utf8');
  const sourceSha256 = createHash('sha256').update(source, 'utf8').digest('hex');
  const document = parseYaml(source);

  // openapi-typescript is given the already-read text rather than a path, so generation reads
  // the same bytes the digest was taken over and cannot race a concurrent edit.
  const ast = await openapiTS(source, {
    // Every response field is emitted as declared. Nothing is loosened: the point of
    // generating is that the compiler sees exactly what the contract says.
    additionalProperties: false,
    alphabetize: true,
    emptyObjectsUnknown: true,
    excludeDeprecated: false,
    exportType: false,
    immutable: false,
  });

  return {
    sourceSha256,
    files: {
      'schema.ts': `${banner(sourceSha256)}\n${astToString(ast)}`,
      'operations.ts': renderOperations(document, sourceSha256),
      'meta.ts': renderMeta(document, sourceSha256),
    },
  };
}

/** The generated file names, for callers that need to enumerate them. */
export const GENERATED_FILES = ['schema.ts', 'operations.ts', 'meta.ts'];
