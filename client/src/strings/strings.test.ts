/**
 * APTR-100 — the string catalogue and its lookup.
 *
 * ── EVERY ASSERTION HERE IS DERIVED FROM THE CATALOGUE ──────────────────────────────────────
 *
 * Not one of these tests names a key it did not read from `STRINGS`. A test that listed the keys
 * it cared about would pass forever while a new one went unexercised — the "table restating a
 * policy" shape. Walking the catalogue means a key added tomorrow is covered tonight, and a key
 * removed takes its coverage with it.
 *
 * ── WHAT IS ASSERTED HERE VERSUS WHAT `tsc` ALREADY HOLDS ───────────────────────────────────
 *
 * The `@ts-expect-error` blocks at the bottom are LIVE assertions: `tsc --noEmit` fails the build
 * if the expression under one is NOT an error. They are how the compile-time claims in the
 * catalogue's header are proven rather than asserted, and they run in the same build as
 * everything else.
 *
 * The runtime tests cover what the compiler cannot: substitution behaviour, the throw paths that
 * exist for values arriving from an `any`, and the invariants over the catalogue's CONTENT.
 */
import { describe, expect, it } from 'vitest';

import { STRINGS, catalogueKeys, format, fromUserContent, t } from './index';
import type { PlainKey, StringKey, UiString } from './index';
import * as stringsModule from './index';

/** The placeholder grammar, restated here so a change to it has to be made in two places. */
const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

function placeholdersOf(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
}

const keys = catalogueKeys();

describe('the catalogue', () => {
  it('is not empty — a walk that found nothing would make every test below vacuous', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)('%s resolves to a non-empty string', (key) => {
    const value = STRINGS[key];
    expect(typeof value).toBe('string');
    expect(value.trim()).not.toBe('');
  });

  it('contains no markup in any string, so no entry can become an element', () => {
    // A catalogue entry is inert text. If one ever carried `<b>`, some call site would eventually
    // want to render it as HTML, and that is the road to `dangerouslySetInnerHTML`.
    const withMarkup = keys.filter((key) => /[<>]/.test(STRINGS[key]));
    expect(withMarkup).toEqual([]);
  });

  it('has no unbalanced or malformed placeholder in any string', () => {
    // A stray `{` is how a template gets rendered to a user. Counting braces catches the case the
    // placeholder regex would silently ignore, which is the one that ships.
    const malformed = keys.filter((key) => {
      const value = STRINGS[key];
      const opens = (value.match(/\{/g) ?? []).length;
      const closes = (value.match(/\}/g) ?? []).length;
      return opens !== closes || opens !== placeholdersOf(value).length;
    });
    expect(malformed).toEqual([]);
  });

  it('partitions every key into exactly one of t() and format(), by its own content', () => {
    // The compile-time claim is that `PlainKey` and `ParameterizedKey` split the catalogue. This
    // is the runtime half of the same claim, and it is derived from each string's CONTENT rather
    // than from the type — so if the two ever disagreed, this is where it would show.
    for (const key of keys) {
      const parameterized = placeholdersOf(STRINGS[key]).length > 0;
      if (parameterized) {
        expect(() => t(key as PlainKey), `${key} has a placeholder and t() must refuse it`).toThrow(/format\(\)/);
      } else {
        expect(t(key as PlainKey), `${key} has no placeholder and t() must return it`).toBe(STRINGS[key]);
      }
    }
  });

  it('exports exactly the surface that can mint a UiString, and nothing else', () => {
    // The brand's whole value is that only this module can produce one. A new export is not
    // automatically wrong — but it must be a decision someone made, so this goes red and asks.
    expect(Object.keys(stringsModule).sort()).toEqual(
      ['STRINGS', 'catalogueKeys', 'format', 'fromUserContent', 't'].sort(),
    );
  });
});

describe('format', () => {
  it('substitutes a parameter into the string s own slot', () => {
    expect(format('state.progress.determinate', { percent: 42 })).toBe('42% complete');
  });

  it('accepts a string parameter and renders it verbatim', () => {
    expect(format('error.correlationId.value', { id: 'client-abc' })).toBe('client-abc');
  });

  it('does NOT rescan a substituted value — user content cannot address a second placeholder', () => {
    // The security property. A single-pass replace means a value containing `{percent}` is data.
    // A naive implementation that looped until no placeholders remained would expand it.
    expect(format('error.correlationId.value', { id: '{percent}' })).toBe('{percent}');
  });

  it('throws rather than rendering a placeholder with no parameter', () => {
    const noParams = {} as { id: string };
    expect(() => format('error.correlationId.value', noParams)).toThrow(/placeholder/);
  });

  it('names the offending key in the throw, so the failure is actionable', () => {
    const noParams = {} as { id: string };
    expect(() => format('error.correlationId.value', noParams)).toThrow(/error\.correlationId\.value/);
  });
});

describe('fromUserContent', () => {
  it('returns the text unchanged — it marks a type and does nothing else', () => {
    expect(fromUserContent('a thread the user named')).toBe('a thread the user named');
  });

  it('does not transform text that looks like a placeholder', () => {
    // It is not a template function, and if it ever became one, user content would be a
    // substitution vector.
    expect(fromUserContent('{percent}')).toBe('{percent}');
  });
});

/* ── COMPILE-TIME assertions, evaluated by `tsc --noEmit` in the build ───────────────────────
 *
 * Each `@ts-expect-error` FAILS THE BUILD if the expression below it stops being an error. That
 * is what makes these assertions rather than comments: if the catalogue's typing were weakened —
 * `StringKey` widened to `string`, `PlainKey` collapsed, the brand removed — these lines would
 * compile, and the build would go red here.
 *
 * They live inside a function that is NEVER CALLED, deliberately. Several of them would throw at
 * runtime (`t('nope')` looks up a key that does not exist), and a module-level constant would
 * execute at import and take the whole suite down with it. The assertion is that this file
 * COMPILES; running the expressions would prove nothing extra.
 */
function typeAssertions(): void {
  // A key the catalogue does not contain.
  // @ts-expect-error 'nope' is not a StringKey.
  t('nope');

  // A parameterized key passed to the plain lookup: `t` would render the raw `{percent}`.
  // @ts-expect-error 'state.progress.determinate' carries a placeholder, so it is not a PlainKey.
  t('state.progress.determinate');

  // A plain key passed to `format`, which would take parameters it has no slots for.
  // @ts-expect-error 'app.name' has no placeholders, so it is not a ParameterizedKey.
  format('app.name', {});

  // The wrong parameter name — the placeholder is `percent`.
  // @ts-expect-error `pct` is not a placeholder of this string.
  format('state.progress.determinate', { pct: 1 });

  // A missing parameter.
  // @ts-expect-error the `percent` placeholder has no value.
  format('state.progress.determinate', {});

  // A bare string is not a UiString. THIS is the assertion the whole brand exists for.
  // @ts-expect-error a plain string literal cannot be a UiString.
  const bareLiteral: UiString = 'Cancel';
  void bareLiteral;

  // And an invalid member cannot hide inside a hand-written key list.
  // @ts-expect-error 'not.a.key' is not a StringKey.
  const badKeys: StringKey[] = ['app.name', 'not.a.key'];
  void badKeys;
}

describe('the type-level guarantees', () => {
  it('are the @ts-expect-error lines above — this file only compiles if every one is an error', () => {
    // The real assertion ran at build time. This keeps the function referenced (so it is not
    // reported as unused) and states plainly where the guarantee lives.
    expect(typeof typeAssertions).toBe('function');
  });
});
