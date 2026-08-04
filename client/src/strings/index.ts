/**
 * APTR-100 — the typed lookup over the string catalogue.
 *
 * ── THE BRAND, AND EXACTLY WHAT IT HOLDS ─────────────────────────────────────────────────────
 *
 * {@link UiString} is a `string` carrying a brand. Every text prop on the state primitives is
 * typed as one, so:
 *
 *     <EmptyState title="No threads" … />        // TYPE ERROR — a bare literal is not a UiString
 *     <EmptyState title={t('threads.empty')} … /> // fine
 *
 * ── WHAT IS TRUE, STATED AT THE STRENGTH IT IS TRUE ─────────────────────────────────────────
 *
 * The guarantee is: A BARE LITERAL CANNOT SATISFY `UiString` BY ORDINARY STRUCTURAL TYPING. That
 * is real and it is the case that actually occurs — someone types a sentence into a prop — and
 * `tsc` rejects it. It is decision D8 applied where it fits: the property is about a value
 * flowing into a prop, and TypeScript owns that.
 *
 * The guarantee is NOT that a `UiString` is unforgeable, and an earlier revision of this comment
 * said "a brand no other module can produce", which was false in two ways:
 *
 *   1. `value as unknown as UiString` mints one, as does anything laundered through `any`.
 *      TypeScript cannot make a string brand cast-proof — that is a property of the language,
 *      not a gap that more care would close.
 *   2. {@link fromUserContent} mints one from arbitrary text ON PURPOSE. See below.
 *
 * Both escapes are made VISIBLE rather than implied, which is the same treatment every other
 * frontier in this client gets. `assert-no-bare-strings.mjs` rejects a cast naming `UiString`
 * anywhere but this file (`ui-string-cast`), and prints every `fromUserContent` call site on a
 * green run. What stays open — a cast through `any` — is recorded in that script's NON-GOALS.
 *
 * The other half of the split: that gate exists for what the type system cannot reach at all,
 * an arbitrary DOM element (`<h1>Aperture</h1>`) whose children are typed `ReactNode` and will
 * accept any string. It is labelled a tripwire there, not a proof.
 *
 * ── THE ONE DELIBERATE ESCAPE ───────────────────────────────────────────────────────────────
 *
 * {@link fromUserContent} exists because not all text is UI text. A thread title, a message
 * body, a filename — that is the USER'S OWN CONTENT. It must never be localized, never live in
 * the catalogue, and never be edited by us; it just has to reach a text prop. So there is
 * exactly one named function that mints a `UiString` from arbitrary content, its name says what
 * it is for, and a grep for it lists every place content bypasses the catalogue.
 *
 * It is not a hole in the rule; it is the rule's other half stated out loud, and it is LISTED:
 * the gate prints every call site, so "where does text bypass the catalogue" has an answer a
 * reader can check rather than trust. What it is NOT is a way to write UI chrome —
 * `fromUserContent('Cancel')` puts a literal in a call, and a literal in a call reads as exactly
 * what it is in review.
 */
import { STRINGS } from './catalogue';
import type { Catalogue, ParameterizedKey, PlainKey, Placeholders, StringKey } from './catalogue';

declare const uiStringBrand: unique symbol;

/**
 * Text that is cleared for display: it came from the catalogue, or it is the user's own content.
 * Structurally a `string` at runtime — nothing wraps, nothing allocates.
 */
export type UiString = string & { readonly [uiStringBrand]: 'ui-string' };

/** A value a placeholder may be filled with. Deliberately narrow. */
export type ParamValue = string | number;

/** The exact parameters a parameterized key requires — no more, no fewer. */
export type ParamsFor<K extends ParameterizedKey> = Record<Placeholders<Catalogue[K]>, ParamValue>;

/**
 * A placeholder in a catalogue string: `{name}`.
 *
 * The name grammar is deliberately narrow (ASCII word characters), and the SAME grammar the
 * `Placeholders<>` type infers with — a brace pair the type reads but this regex does not, or
 * the reverse, would put the compile-time claim and the runtime behaviour out of step.
 */
const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

/**
 * The same grammar, without the `g` flag.
 *
 * A `g` regex carries `lastIndex` between `.test()` calls, so sharing one between a substitution
 * and a predicate makes the predicate's answer depend on what was called before it. Two regexes
 * that must agree are a drift risk; one regex with hidden state is a bug, which is worse.
 */
const HAS_PLACEHOLDER = new RegExp(PLACEHOLDER.source);

/**
 * Look up a catalogue string that takes no parameters.
 *
 * `t('nope')` does not compile, because `PlainKey` admits only declared keys; and
 * `t('state.progress.determinate')` does not compile either, because that string has a
 * placeholder and `t` would render the raw `{percent}` to a user.
 */
export function t<K extends PlainKey>(key: K): UiString {
  // Widened to `string` before branding. A cast straight from the LITERAL type is rejected as a
  // non-overlapping conversion, and reaching for `as unknown as` to silence that would disable
  // the check that catches a genuinely wrong cast here later.
  const value: string = STRINGS[key];

  // The runtime half of the plain/parameterized split. `PlainKey` already makes this unreachable
  // from typed code; this is what happens when the key arrives from an `any` or a cast, and it
  // fails loudly rather than rendering `{percent}% complete` to a user. Every key in the
  // catalogue is put through this by a test, so the two halves cannot disagree.
  if (HAS_PLACEHOLDER.test(value)) {
    throw new Error(
      `catalogue string "${key}" carries a placeholder and must be rendered with format(), not t(). `
      + 'Rendering it here would put template syntax in front of a user.',
    );
  }

  return value as UiString;
}

/**
 * Look up a parameterized catalogue string and fill it in.
 *
 * PARAMETERIZED, NEVER CONCATENATED. The values are substituted into the string's own slots; no
 * caller builds a sentence out of fragments, so word order stays inside the catalogue where a
 * translator can reach it.
 *
 * THE SUBSTITUTION IS SINGLE-PASS AND NON-RECURSIVE. A parameter value that itself contains
 * `{something}` is inert: the replacement is not rescanned, so user content cannot address a
 * second placeholder or expand into anything. That is a security property, not a nicety, and it
 * is pinned by a test.
 *
 * A placeholder with no parameter THROWS rather than rendering `{id}` to a user. The type
 * system already makes that unreachable from typed code; the throw is what happens when the
 * value arrives from an `any`, and a loud failure beats a mangled string on screen.
 */
export function format<K extends ParameterizedKey>(key: K, params: ParamsFor<K>): UiString {
  const template: string = STRINGS[key];
  const lookup = params as Record<string, ParamValue | undefined>;

  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = lookup[name];
    if (value === undefined) {
      throw new Error(
        `catalogue string "${key}" has a placeholder ${whole} with no parameter. `
        + 'Rendering the raw placeholder would put template syntax in front of a user.',
      );
    }
    return String(value);
  }) as UiString;
}

/**
 * Mark the user's OWN content as displayable.
 *
 * For a thread title, a message body, a filename — text that belongs to the user and must not
 * be translated, edited, or catalogued. Never for interface text; see this module's header.
 *
 * It marks a type, and nothing else. It does not sanitize, and it cannot: the text is rendered
 * as a React child, so it is escaped by React and reaches the DOM as text either way. Nothing
 * in this client renders content as markup — `dangerouslySetInnerHTML` is rejected by the
 * primitives at runtime and by the adherence lint at the source.
 */
export function fromUserContent(text: string): UiString {
  return text as UiString;
}

/**
 * Every catalogue key, at runtime.
 *
 * DERIVED from the table rather than written out, so it cannot fall behind it. Used by tests
 * that need to walk the whole catalogue — a test enumerating keys by hand would pass forever
 * while a new key went unexercised.
 */
export function catalogueKeys(): StringKey[] {
  return Object.keys(STRINGS) as StringKey[];
}

export { STRINGS } from './catalogue';
export type { Catalogue, ParameterizedKey, PlainKey, Placeholders, StringKey } from './catalogue';
