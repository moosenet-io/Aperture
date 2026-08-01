#!/usr/bin/env node
// APTR-07 — the SDK static gate.
//
//   npm --prefix client run assert-sdk-clean
//
// Four properties of the TypeScript source, each asserted over a PARSED syntax tree rather than
// a grep, using the TypeScript compiler's own parser (already a devDependency). Comments are
// not syntax-tree nodes, so a URL in a comment is inert by construction and no comment-stripping
// heuristic is needed — the failure mode that made APTR-01's first two revisions unsound.
//
//   1. NO ABSOLUTE URL LITERAL anywhere under `src/api/`. Not in a string, not in a template
//      literal chunk, not protocol-relative. The one exception is documented and narrow: a
//      `*.test.ts` file may use a host under the `.invalid` TLD, which RFC 6761 guarantees is
//      never resolvable, because proving that a configured base URL produces an absolute
//      request requires naming one.
//   2. NO LITERAL HOST-LIKE VALUE — a bare IPv4 address, or a `:port` suffix on a literal.
//   3. NO COMPILED-IN DEFAULT ENDPOINT: no non-empty literal is ever assigned to something
//      named `baseUrl`, no `baseUrl` has a `??`/`||` fallback of any kind, and
//      `TransportOptions.baseUrl` is a REQUIRED property. The empty string is exempt from the
//      first of those three and only the first: it is not an endpoint, it is the web target's
//      same-origin-relative mode.
//   4. EXACTLY ONE REQUEST CONSTRUCTION SITE: `fetch`, `XMLHttpRequest`, `EventSource`,
//      `WebSocket`, and `sendBeacon` may be NAMED — not merely called — only in
//      `src/api/transport.ts`. A reference rule rather than a call rule, because an alias
//      (`const request = fetch`) and a bracket access (`globalThis['fetch']`) construct a
//      request just as directly as a call does, and a call-shaped check misses both. A computed
//      access on a global object is reported as unresolvable rather than passed over, so the one
//      genuinely unreachable case — a name assembled at runtime — is never silently allowed.
//
// ── WHAT THIS GATE IS NOT ───────────────────────────────────────────────────────────────────
//
// It is a source lint, not a security boundary, and it is stated that way deliberately.
//   * It reads SOURCE, not the emitted bundle. A dependency that phones home is invisible here;
//     `assert-no-external-hosts.mjs` (APTR-01) is the gate that looks at the bundle, and the
//     RUNTIME CSP served by the BFF is the control that actually stops egress.
//   * It cannot see a URL assembled at runtime — from configuration, from fragments, from
//     character codes. Nothing static can. An endpoint SUPPLIED at runtime is the intended
//     design (decision D1), so "no literal" is the only property that is even meaningful here.
//   * It does not prove the transport uses the base URL correctly. That is what the unit tests
//     do, by observing the URL the injected fetch receives.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(HERE, '..');
const SRC_DIR = path.join(CLIENT_ROOT, 'src');
const API_DIR = path.join(SRC_DIR, 'api');

/** Any `scheme://` prefix, plus the protocol-relative `//host` form. */
const ABSOLUTE_URL = /(^|[^a-zA-Z0-9+.-])([a-zA-Z][a-zA-Z0-9+.-]*:)?\/\/[a-zA-Z0-9[]/;
/** A host under the RFC 6761 `.invalid` TLD — never resolvable, permitted in tests only. */
const RESERVED_TEST_HOST = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?\/\/(?:[^/@\s]*@)?[a-zA-Z0-9.-]+\.invalid(?:[/:?#]|$)/;
const IPV4 = /(^|[^0-9.])(?:[0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)/;
const PORT_SUFFIX = /[a-zA-Z0-9\].]:[0-9]{2,5}(?:[/?#]|$)/;
/**
 * Inference is addressed by LOGICAL ROUTE, never by a model id, engine name, or size suffix.
 * This is a family-name check over literals: it catches the realistic slip — someone pasting a
 * concrete model id into a request — and it does NOT prove the absence of every possible model
 * name, because no finite list could. It is a tripwire, not a proof.
 */
const MODEL_FAMILY = /\b(gpt|llama|qwen|gemma|granite|mistral|mixtral|phi|deepseek|claude|opus|sonnet|haiku)[-_.: ]?[0-9]/i;
/** A literal being handed to something named like a credential. */
const SECRET_NAME = /^(?:.*_)?(token|secret|password|passwd|api_?key|apikey|credential)s?$/i;

/** Request constructors. Permitted only in the one file named here. */
const REQUEST_CONSTRUCTORS = new Set(['fetch', 'XMLHttpRequest', 'EventSource', 'WebSocket', 'sendBeacon']);
const TRANSPORT_FILE = path.join(API_DIR, 'transport.ts');

async function collect(dir, predicate, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

const isTs = (file) => file.endsWith('.ts') || file.endsWith('.tsx');

function parse(file, text) {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/** Every literal text fragment in the file, with its node. Comments are not nodes. */
function literalFragments(source) {
  const found = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node)
      || ts.isTemplateTail(node)
    ) {
      found.push({ node, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
}

function checkLiterals(file, source, isTest, failures) {
  for (const { node, text } of literalFragments(source)) {
    const line = lineOf(source, node);
    const record = (rule, detail) => failures.push({ file, line, rule, detail });

    if (ABSOLUTE_URL.test(text)) {
      const allowed = isTest && RESERVED_TEST_HOST.test(text.trim());
      if (!allowed) {
        record(
          'absolute-url',
          isTest
            ? `absolute URL literal ${JSON.stringify(text)} — a test may only name a host under `
              + 'the reserved .invalid TLD'
            : `absolute URL literal ${JSON.stringify(text)}`,
        );
      }
    }
    if (IPV4.test(text)) record('ip-literal', `IPv4-shaped literal ${JSON.stringify(text)}`);
    if (PORT_SUFFIX.test(text)) record('port-literal', `port-shaped literal ${JSON.stringify(text)}`);
    if (MODEL_FAMILY.test(text)) {
      record('model-name', `model-id-shaped literal ${JSON.stringify(text)} — inference is `
        + 'addressed by logical route, never by a model id');
    }

    // A literal handed to a credential-shaped name. Distinct from the checks above because the
    // offence is the NAME it is bound to, not the shape of the text.
    const parent = node.parent;
    if (parent !== undefined && text !== '') {
      let boundName = null;
      if (ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
        boundName = parent.name.text;
      } else if (
        (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent))
        && parent.initializer === node && ts.isIdentifier(parent.name)
      ) {
        boundName = parent.name.text;
      }
      if (boundName !== null && SECRET_NAME.test(boundName)) {
        record('secret-literal', `a literal is bound to \`${boundName}\``);
      }
    }
  }
}

/**
 * No ENDPOINT literal may become the value of something called `baseUrl`, and no `baseUrl` may
 * have a fallback at all.
 *
 * Two distinct offences, deliberately scoped differently:
 *   * a NON-EMPTY literal assigned to `baseUrl` — that is a compiled-in endpoint. The empty
 *     string is exempt because it is not an endpoint: it IS the web target's same-origin-
 *     relative mode, and a shell (or a test) stating it explicitly is the contract working.
 *   * ANY literal `??`/`||` fallback for `baseUrl`, empty string included — a fallback is a
 *     default by definition, and "no compiled-in DEFAULT endpoint" is the criterion.
 */
function checkNoDefaultBaseUrl(file, source, failures) {
  const isLiteralish = (node) => node !== undefined && (
    ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
    || ts.isTemplateExpression(node)
  );
  const isNonEmptyLiteral = (node) => isLiteralish(node)
    && !((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === '');
  const namesBaseUrl = (node) => {
    if (node === undefined) return false;
    if (ts.isIdentifier(node)) return node.text === 'baseUrl';
    if (ts.isPropertyAccessExpression(node)) return node.name.text === 'baseUrl';
    if (ts.isElementAccessExpression(node)) {
      return ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'baseUrl';
    }
    return false;
  };

  const visit = (node) => {
    const record = (detail) => failures.push({
      file, line: lineOf(source, node), rule: 'default-endpoint', detail,
    });

    // `baseUrl = '…'`, `baseUrl: '…'`, `baseUrl = x ?? '…'`, `{ baseUrl = '…' }` destructuring.
    if (ts.isPropertyAssignment(node) && namesBaseUrl(node.name) && isNonEmptyLiteral(node.initializer)) {
      record('a non-empty literal endpoint is assigned to a `baseUrl` property');
    }
    if (
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node)
        || ts.isBindingElement(node))
      && namesBaseUrl(node.name)
      && isNonEmptyLiteral(node.initializer)
    ) {
      record('a non-empty literal endpoint is supplied for `baseUrl`');
    }
    if (
      ts.isBinaryExpression(node)
      && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      && namesBaseUrl(node.left)
      && isLiteralish(node.right)
    ) {
      record('a literal fallback is supplied for `baseUrl`');
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
}

/** `TransportOptions.baseUrl` must be declared, and must not be optional. */
function checkBaseUrlRequired(file, source, failures) {
  let sawInterface = false;
  let sawMember = false;
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'TransportOptions') {
      sawInterface = true;
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name)
          && member.name.text === 'baseUrl') {
          sawMember = true;
          if (member.questionToken !== undefined) {
            failures.push({
              file,
              line: lineOf(source, member),
              rule: 'default-endpoint',
              detail: 'TransportOptions.baseUrl is optional; it must be a required argument',
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return { sawInterface, sawMember };
}

/**
 * Request constructors may not be REFERENCED at all outside the transport.
 *
 * An earlier revision matched only direct calls — `fetch(...)`, `globalThis.fetch(...)`. That
 * is not enough to support a claim of "exactly one request-construction site": an alias
 * (`const request = fetch; request(url)`), a bracketed access (`globalThis['fetch'](url)`), or
 * a computed access all construct a request outside this file while evading a call-shaped
 * check, and all of them are plainly visible in source the gate already reads.
 *
 * So the rule is a REFERENCE rule, not a call rule, and it is transitively closed by
 * construction: an alias cannot be created without naming the constructor once, and naming it
 * once is the failure. What is deliberately NOT flagged is the declaration of a member that
 * merely shares the name — `{ fetch: injectedImpl }` and `readonly fetch?: FetchLike` are
 * property keys, not references to a global, and the transport's own injection point is exactly
 * that shape.
 *
 * The one case that stays out of reach of any static rule is a name assembled at runtime
 * (`globalThis[['fe','tch'].join('')]`). A computed access on a global object is therefore
 * flagged as UNRESOLVABLE rather than passed over, so the gate never stays silent about an
 * access it cannot evaluate.
 */
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'navigator']);

/**
 * Look through the wrappers a cast or a parenthesis puts in the way — `(globalThis as never)[k]`
 * is the same access as `globalThis[k]`, and a check that only recognised the bare identifier
 * would be evaded by a type assertion, which is not a meaningful difference.
 */
function isGlobalObjectReference(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) || ts.isAsExpression(current)
    || ts.isNonNullExpression(current) || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return ts.isIdentifier(current) && GLOBAL_OBJECTS.has(current.text);
}

function checkSingleRequestSite(file, source, failures) {
  if (path.resolve(file) === TRANSPORT_FILE) return;

  const record = (node, detail) => failures.push({
    file, line: lineOf(source, node), rule: 'request-site', detail,
  });

  /** A property key being DECLARED, rather than a reference to something named that. */
  const isDeclaredKey = (id) => {
    const parent = id.parent;
    if (parent === undefined) return false;
    if (ts.isPropertyAssignment(parent) && parent.name === id) return true;
    if (
      (ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)
        || ts.isMethodSignature(parent) || ts.isMethodDeclaration(parent)
        || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)
        || ts.isEnumMember(parent) || ts.isParameter(parent))
      && parent.name === id
    ) return true;
    return false;
  };

  const visit = (node, inType) => {
    const nowInType = inType || ts.isTypeNode(node);

    if (!nowInType && ts.isIdentifier(node) && REQUEST_CONSTRUCTORS.has(node.text)
      && !isDeclaredKey(node)) {
      record(
        node,
        `\`${node.text}\` is referenced here; it may be named only in src/api/transport.ts, `
        + 'because an alias constructs a request just as directly as a call does',
      );
    }

    if (!nowInType && ts.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      if ((ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
        && REQUEST_CONSTRUCTORS.has(argument.text)) {
        record(node, `\`["${argument.text}"]\` reaches a request constructor by bracket access`);
      } else if (
        !ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument)
        && !ts.isNumericLiteral(argument)
        && isGlobalObjectReference(node.expression)
      ) {
        record(
          node,
          'a computed property access on a global object cannot be shown not to be a '
          + 'request constructor; index a global by a literal name or not at all',
        );
      }
    }

    ts.forEachChild(node, (child) => visit(child, nowInType));
  };
  ts.forEachChild(source, (child) => visit(child, false));
}

export async function runGate() {
  const failures = [];
  const apiFiles = await collect(API_DIR, isTs);
  const srcFiles = await collect(SRC_DIR, isTs);

  if (apiFiles.length === 0) {
    return [{ file: API_DIR, line: 0, rule: 'coverage', detail: 'no TypeScript files found to scan' }];
  }

  let transportInterfaceSeen = false;
  let baseUrlMemberSeen = false;

  for (const file of apiFiles) {
    const text = await readFile(file, 'utf8');
    const source = parse(file, text);
    const isTest = /\.test\.tsx?$/.test(file);
    checkLiterals(file, source, isTest, failures);
    checkNoDefaultBaseUrl(file, source, failures);
    const seen = checkBaseUrlRequired(file, source, failures);
    transportInterfaceSeen ||= seen.sawInterface;
    baseUrlMemberSeen ||= seen.sawMember;
  }

  // A gate that silently stops asserting anything is worse than no gate. If the interface it
  // checks has been renamed away, that is a failure, not a pass.
  if (!transportInterfaceSeen || !baseUrlMemberSeen) {
    failures.push({
      file: TRANSPORT_FILE,
      line: 0,
      rule: 'coverage',
      detail: 'TransportOptions.baseUrl was not found; this gate can no longer assert that the '
        + 'base URL is a required argument. Update the gate together with the rename.',
    });
  }

  for (const file of srcFiles) {
    const text = await readFile(file, 'utf8');
    checkSingleRequestSite(file, parse(file, text), failures);
  }

  return failures;
}

async function main() {
  const failures = await runGate();
  if (failures.length === 0) {
    process.stdout.write('SDK static gate: OK — no absolute URL, host, port, or default endpoint;\n');
    process.stdout.write('  requests are constructed only in src/api/transport.ts.\n');
    return;
  }
  process.stderr.write('\nSDK STATIC GATE FAILED\n\n');
  for (const failure of failures) {
    process.stderr.write(
      `  ${path.relative(CLIENT_ROOT, failure.file)}:${failure.line}  [${failure.rule}]  ${failure.detail}\n`,
    );
  }
  process.stderr.write('\n');
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    process.stderr.write(`\nassert-sdk-clean failed to run: ${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
