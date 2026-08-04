// @vitest-environment jsdom
/**
 * APTR-100 — the state primitives.
 *
 * ── THE ASSERTIONS ARE DERIVED, NOT LISTED ──────────────────────────────────────────────────
 *
 * The error tests walk `ERROR_URN` and `RECOVERY_ACTION` rather than naming the cases someone
 * thought of. A test that named three URNs would pass forever while an unmapped fourth fell
 * through to "Something went wrong" — which is precisely the failure the mapping exists to
 * prevent, and precisely the failure a hand-written test cannot see.
 *
 * ── WHAT EACH ASSERTION WOULD ACCEPT BESIDES ITS OWN PROPERTY ───────────────────────────────
 *
 * Asked of every assertion here, and it changed several:
 *   * "the fallback renders" is satisfied by an empty div, so the boundary tests assert the
 *     rendered TEXT and the reference, not the presence of a node;
 *   * "each URN has a presentation" is satisfied by every URN mapping to the same fallback, so
 *     the mapping test asserts each known URN differs from the unknown one;
 *   * "the shimmer is dropped" is satisfied by a component that renders nothing at all, so the
 *     motion tests assert the bars are still there without the shimmer class;
 *   * "no queue exists" is satisfied by a broken import, so the InlineNotice tests assert the
 *     component still renders while the module holds nothing.
 *
 * Computed style is deliberately not asserted: jsdom implements neither the cascade nor `var()`,
 * so any assertion built on `getComputedStyle` would be decorative. The stylesheet's own
 * properties are asserted in `scripts/token-layer.test.mjs`.
 */
import { act, createRef, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApertureAbortError,
  ApertureConfigError,
  ApertureDecodeError,
  ApertureMalformedResponseError,
  ApertureNetworkError,
  ApertureProblemError,
  ApertureTokenUnavailableError,
  ERROR_URN,
} from '../../api/errors';
import type { Problem } from '../../api/errors';
import { STRINGS, catalogueKeys, format, fromUserContent, t } from '../../strings';
import { Button } from '../primitives';
import {
  CLIENT_ID_PREFIX,
  EmptyState,
  ErrorBoundary,
  ErrorState,
  InlineNotice,
  ProgressBar,
  RECOVERY_ACTION,
  RECOVERY_HINT,
  Skeleton,
  SkeletonGroup,
  SPINNER_MAX_WAIT_MS,
  Spinner,
  UNKNOWN_PRESENTATION,
  URN_PRESENTATION,
  describeError,
  newCorrelationId,
  prefersReducedMotion,
  progressFraction,
  resetCorrelationSequence,
} from './index';
import type { DescribedError, MatchMedia, NoticeTone, RecoveryKind } from './index';
import * as inlineNoticeModule from './InlineNotice';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

function render(node: ReactNode): HTMLElement {
  act(() => root.render(<StrictMode>{node}</StrictMode>));
  const first = container.firstElementChild;
  if (!(first instanceof HTMLElement)) throw new Error('nothing rendered');
  return first;
}

/** A `matchMedia` that answers a fixed value — the only way to exercise both preferences. */
function fixedMatchMedia(matches: boolean): MatchMedia {
  return () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} });
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', fixedMatchMedia(matches));
}

function problem(type: string, overrides: Partial<Problem> = {}): Problem {
  return { type, title: 'server prose that must never be rendered', status: 500, ...overrides } as Problem;
}

/**
 * Markers for the "this must never reach the screen" assertions.
 *
 * PLAIN ENGLISH ON PURPOSE. An earlier revision used an opaque uppercase-and-digits token bound
 * to a variable named after a credential. It proved exactly the same property and ALSO matched
 * the public mirror's PII sweep, which withheld the publish — the gate working rather than a bug.
 * An assertion marker only ever needed to be DISTINCTIVE; it never needed to look like a
 * credential, and the two properties are unrelated.
 *
 * The offending literal is deliberately NOT quoted anywhere in this file, including in this
 * comment. A remediation that reproduces the string it removes is not a remediation — the sweep
 * reads content, and it does not care that the occurrence is now an explanation of itself.
 *
 * Both are pinned against the catalogue below. If a marker were ever a substring of real UI text
 * these assertions would go falsely RED — a confusing failure in a test whose subject is
 * something else entirely — so the distinctiveness is checked rather than assumed.
 */
const MUST_NOT_RENDER = 'upstream prose that must not be rendered';

/** The same idea inside a URN, so it has to satisfy the URN grammar: lowercase kebab. */
const MUST_NOT_RENDER_URN_SEGMENT = 'embedded-prose-that-must-not-render';

/* ── Skeleton ────────────────────────────────────────────────────────────────────────────── */

describe('Skeleton', () => {
  beforeEach(() => stubMatchMedia(false));

  it('renders one bar per line for text, and mirrors the shape in the class', () => {
    const skeleton = render(<Skeleton shape="text" lines={4} />);
    expect(skeleton.querySelectorAll('.skeleton-text')).toHaveLength(4);
    expect(skeleton.getAttribute('data-shape')).toBe('text');
  });

  it('shortens the last text bar, because real paragraphs do not end at the margin', () => {
    const skeleton = render(<Skeleton shape="text" lines={3} />);
    expect(skeleton.querySelectorAll('.skeleton-text-last')).toHaveLength(1);
  });

  it('renders a single bar for a shape that is not text, whatever `lines` says', () => {
    const skeleton = render(<Skeleton shape="avatar" lines={9} />);
    expect(skeleton.querySelectorAll('.skeleton-bar')).toHaveLength(1);
    expect(skeleton.querySelectorAll('.skeleton-avatar')).toHaveLength(1);
  });

  it('still renders a bar when `lines` is zero, negative, or not a number', () => {
    // An invisible loading state is worse than a wrong one: the user would see nothing at all.
    for (const lines of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(render(<Skeleton shape="text" lines={lines} />).querySelectorAll('.skeleton-bar').length)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it('hides the bars from assistive technology and announces the state instead', () => {
    const skeleton = render(<Skeleton shape="text" />);
    expect(skeleton.querySelector('.skeleton-bars')?.getAttribute('aria-hidden')).toBe('true');
    const status = skeleton.querySelectorAll('[role="status"]');
    expect(status).toHaveLength(1);
    expect(status[0]?.textContent).toBe(STRINGS['state.loading.announcement']);
    expect(status[0]?.getAttribute('aria-live')).toBe('polite');
  });

  it('does not add a second announcement when it re-renders', () => {
    render(<Skeleton shape="text" lines={2} />);
    const skeleton = render(<Skeleton shape="text" lines={5} />);
    // One region whose text never changes: a live region announces on CHANGE, so this is what
    // "announced once, not continuously" actually means in the DOM.
    expect(skeleton.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(skeleton.querySelectorAll('.skeleton-text')).toHaveLength(5);
  });

  it('shimmers when motion is allowed', () => {
    const skeleton = render(<Skeleton shape="text" />);
    expect(skeleton.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0);
  });

  it('WITHHOLDS the shimmer under prefers-reduced-motion, keeping the bars', () => {
    stubMatchMedia(true);
    const skeleton = render(<Skeleton shape="text" lines={3} />);
    expect(skeleton.querySelectorAll('.skeleton-shimmer')).toHaveLength(0);
    // The bars must survive: a component that rendered nothing would also satisfy the line above.
    expect(skeleton.querySelectorAll('.skeleton-bar')).toHaveLength(3);
  });

  it('withholds the shimmer when the preference cannot be read at all', () => {
    // Fail toward stillness. An unnecessary still skeleton costs polish; an unwanted animation
    // costs a user with a vestibular disorder real discomfort.
    vi.stubGlobal('matchMedia', undefined);
    expect(render(<Skeleton shape="text" />).querySelectorAll('.skeleton-shimmer')).toHaveLength(0);
  });
});

describe('SkeletonGroup', () => {
  beforeEach(() => stubMatchMedia(false));

  it('announces ONCE for the whole group, however many skeletons it contains', () => {
    const group = render(
      <SkeletonGroup>
        <Skeleton shape="heading" />
        <Skeleton shape="text" />
        <Skeleton shape="text" />
        <Skeleton shape="avatar" />
      </SkeletonGroup>,
    );
    expect(group.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(group.querySelectorAll('.skeleton-bar').length).toBeGreaterThan(3);
  });

  it('uses a caller-supplied announcement when given one', () => {
    const group = render(<SkeletonGroup label={t('state.loading')}><Skeleton shape="text" /></SkeletonGroup>);
    expect(group.querySelector('[role="status"]')?.textContent).toBe(STRINGS['state.loading']);
  });

  it('replaces an unresolved skeleton with the fallback once the timeout fires', () => {
    vi.useFakeTimers();
    try {
      const fallback = <ErrorState error={new ApertureNetworkError('gone', 'response')} />;
      render(
        <SkeletonGroup timeout={{ afterMs: 30_000, fallback }}>
          <Skeleton shape="text" />
        </SkeletonGroup>,
      );
      expect(container.querySelectorAll('.skeleton-bar').length).toBeGreaterThan(0);

      act(() => { vi.advanceTimersByTime(30_000); });

      // No indefinite shimmer, and no live region still claiming the content is loading.
      expect(container.querySelectorAll('.skeleton-bar')).toHaveLength(0);
      expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);
      expect(container.textContent).toContain(STRINGS['error.network.title']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the skeleton in place before the timeout elapses', () => {
    vi.useFakeTimers();
    try {
      render(
        <SkeletonGroup timeout={{ afterMs: 30_000, fallback: <EmptyState title={t('app.name')} explanation={t('app.name')} /> }}>
          <Skeleton shape="text" />
        </SkeletonGroup>,
      );
      act(() => { vi.advanceTimersByTime(29_999); });
      expect(container.querySelectorAll('.skeleton-bar').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ── Spinner ─────────────────────────────────────────────────────────────────────────────── */

describe('Spinner', () => {
  beforeEach(() => stubMatchMedia(false));

  it('is a polite status with a catalogue label and a hidden moving part', () => {
    const spinner = render(<Spinner />);
    expect(spinner.getAttribute('role')).toBe('status');
    expect(spinner.textContent).toBe(STRINGS['state.busy']);
    expect(spinner.querySelector('.spinner-ring')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('takes a caller label from the catalogue', () => {
    expect(render(<Spinner label={t('state.loading')} />).textContent).toBe(STRINGS['state.loading']);
  });

  it('keeps the ring but stops it under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const spinner = render(<Spinner />);
    expect([...spinner.classList]).toContain('spinner-still');
    expect(spinner.querySelector('.spinner-ring')).not.toBeNull();
  });

  it('documents its threshold as an exported constant', () => {
    // Guidance, not enforcement — see the component's header. This pins the number so a change
    // to the guidance is a change somebody reads.
    expect(SPINNER_MAX_WAIT_MS).toBe(1000);
  });
});

/* ── EmptyState ──────────────────────────────────────────────────────────────────────────── */

describe('EmptyState', () => {
  it('renders the title, the explanation, and no action by default', () => {
    const empty = render(
      <EmptyState title={t('state.empty.generic.title')} explanation={t('state.empty.generic.explanation')} />,
    );
    expect(empty.textContent).toContain(STRINGS['state.empty.generic.title']);
    expect(empty.textContent).toContain(STRINGS['state.empty.generic.explanation']);
    expect(empty.querySelector('.state-actions')).toBeNull();
  });

  it('renders an action when there is one to offer', () => {
    const empty = render(
      <EmptyState
        title={t('state.empty.generic.title')}
        explanation={t('state.empty.generic.explanation')}
        action={<Button variant="primary">{t('recovery.retry.action')}</Button>}
      />,
    );
    expect(empty.querySelector('.state-actions button')?.textContent).toBe(STRINGS['recovery.retry.action']);
  });

  it('renders the heading at the level the page asks for', () => {
    for (const level of [2, 3, 4, 5, 6] as const) {
      const empty = render(
        <EmptyState title={t('app.name')} explanation={t('app.shell.underConstruction')} headingLevel={level} />,
      );
      expect(empty.querySelector('.state-title')?.tagName).toBe(`H${level}`);
    }
  });

  it('renders the user s own content when it is passed through fromUserContent', () => {
    const empty = render(
      <EmptyState title={fromUserContent('A thread the user named')} explanation={t('state.empty.generic.explanation')} />,
    );
    expect(empty.textContent).toContain('A thread the user named');
  });
});

/* ── ErrorState ──────────────────────────────────────────────────────────────────────────── */

const urnNames = Object.keys(URN_PRESENTATION) as (keyof typeof ERROR_URN)[];

describe('ErrorState', () => {
  it('covers every URN the SDK declares — derived from the registry, not from a list', () => {
    expect(urnNames.length).toBe(Object.keys(ERROR_URN).length);
    expect(urnNames.length).toBeGreaterThan(0);
  });

  it.each(urnNames)('%s renders its OWN title, detail and hint', (name) => {
    const state = render(<ErrorState error={new ApertureProblemError(problem(ERROR_URN[name]), 1)} />);
    const presentation = URN_PRESENTATION[name];

    expect(state.textContent).toContain(STRINGS[presentation.title]);
    expect(state.textContent).toContain(STRINGS[presentation.detail]);
    expect(state.textContent).toContain(STRINGS[RECOVERY_HINT[presentation.recovery]]);

    // The load-bearing half: "every URN has a presentation" would also be satisfied by every URN
    // falling through to the generic one. A known URN must NOT read as unknown.
    expect(state.textContent).not.toContain(STRINGS[UNKNOWN_PRESENTATION.title]);
  });

  it('NEVER renders the error s own message or the server s prose', () => {
    const hostile = problem(ERROR_URN.internal, { title: MUST_NOT_RENDER, detail: MUST_NOT_RENDER });
    // The input really does carry the marker. Without this, the assertion below would also pass
    // if the fixture quietly stopped supplying it — the vacuous shape, where a test proves the
    // component does not render something it was never given.
    expect(hostile.title).toBe(MUST_NOT_RENDER);
    expect(hostile.detail).toBe(MUST_NOT_RENDER);

    const state = render(<ErrorState error={new ApertureProblemError(hostile, 1)} />);
    expect(state.textContent).not.toContain(MUST_NOT_RENDER);
    expect(state.textContent).toContain(STRINGS['error.internal.title']);
  });

  it('renders the server s correlation id as a reference', () => {
    const state = render(
      <ErrorState
        error={new ApertureProblemError(problem(ERROR_URN.internal, { correlation_id: '01JABCDEF' }), 1)}
      />,
    );
    expect(state.textContent).toContain(STRINGS['error.correlationId.label']);
    expect(state.textContent).toContain('01JABCDEF');
  });

  it('renders no reference at all when the failure carried none', () => {
    const state = render(<ErrorState error={new ApertureNetworkError('down', 'request')} />);
    expect(state.querySelector('.state-reference')).toBeNull();
  });

  it.each(urnNames)('%s offers a recovery button only when the kind has one AND a handler exists', (name) => {
    const { recovery } = URN_PRESENTATION[name];
    const actionKey = RECOVERY_ACTION[recovery];
    const error = new ApertureProblemError(problem(ERROR_URN[name]), 1);

    expect(render(<ErrorState error={error} />).querySelector('button')).toBeNull();

    const withHandler = render(<ErrorState error={error} onRecover={() => {}} />);
    if (actionKey === null) {
      expect(withHandler.querySelector('button')).toBeNull();
    } else {
      expect(withHandler.querySelector('button')?.textContent).toBe(STRINGS[actionKey]);
    }
  });

  it('reports the recovery kind to the handler when the button is pressed', () => {
    const seen: RecoveryKind[] = [];
    const state = render(
      <ErrorState error={new ApertureNetworkError('down', 'request')} onRecover={(kind) => seen.push(kind)} />,
    );
    act(() => { state.querySelector('button')?.click(); });
    expect(seen).toEqual(['retry']);
  });

  it('is announced assertively — an error the user did not ask for must interrupt', () => {
    expect(render(<ErrorState error={new ApertureNetworkError('x', 'request')} />).getAttribute('role')).toBe('alert');
  });
});

describe('the assertion markers', () => {
  it('appear in no catalogue string, so the "must not render" assertions cannot go falsely red', () => {
    // Derived from the catalogue rather than eyeballed: a marker that later became a substring of
    // real UI text would fail three unrelated tests with a confusing message.
    for (const key of catalogueKeys()) {
      expect(STRINGS[key], `catalogue key ${key} contains an assertion marker`)
        .not.toContain(MUST_NOT_RENDER);
      expect(STRINGS[key], `catalogue key ${key} contains an assertion marker`)
        .not.toContain(MUST_NOT_RENDER_URN_SEGMENT);
    }
  });

  it('are shaped like prose, not like credentials', () => {
    // The regression being remediated: the mirror's PII sweep withheld a publish over a marker
    // that was shaped like a credential. A marker needs to be distinctive and nothing else, so
    // this pins the shape rather than trusting the next author to remember why.
    for (const marker of [MUST_NOT_RENDER, MUST_NOT_RENDER_URN_SEGMENT]) {
      expect(marker).toMatch(/^[a-z][a-z -]+[a-z]$/);
      expect(marker.length).toBeGreaterThan(20);
    }
  });
});

describe('describeError', () => {
  it('classifies each SDK error class positively', () => {
    expect(describeError(new ApertureNetworkError('x', 'request')).title).toBe('error.network.title');
    expect(describeError(new ApertureAbortError('x')).title).toBe('error.aborted.title');
    expect(describeError(new ApertureConfigError('x')).title).toBe('error.config.title');
    expect(describeError(new ApertureTokenUnavailableError()).title).toBe('error.tokenUnavailable.title');
    expect(describeError(new ApertureDecodeError(200)).title).toBe('error.decode.title');
  });

  it('treats a malformed 401 as an auth failure, and any other malformed response as retryable', () => {
    expect(describeError(new ApertureMalformedResponseError(401, null, 'schema', 1)).recovery)
      .toBe('reauthenticate');
    expect(describeError(new ApertureMalformedResponseError(503, null, 'schema', 1)).recovery).toBe('retry');
  });

  it('accepts a well-formed URN it has never seen, rather than treating it as a violation', () => {
    // The contract adds URNs additively on /v1, so a newer server can legitimately send one.
    const described = describeError(new ApertureProblemError(problem('urn:aperture:error:from-the-future'), 1));
    expect(described.title).toBe(UNKNOWN_PRESENTATION.title);
    expect(described.recovery).toBe('retry');
  });

  it('falls back for a value that is not an Error at all', () => {
    expect(describeError('a thrown string').title).toBe(UNKNOWN_PRESENTATION.title);
    expect(describeError(undefined).title).toBe(UNKNOWN_PRESENTATION.title);
  });

  it('carries the correlation id through, and omits it when there is none', () => {
    expect(describeError(new ApertureProblemError(problem(ERROR_URN.internal, { correlation_id: 'abc' }), 1))
      .correlationId).toBe('abc');
    expect(describeError(new ApertureProblemError(problem(ERROR_URN.internal), 1)).correlationId).toBeUndefined();
  });

  /* ── TOTALITY OVER HOSTILE VALUES ───────────────────────────────────────────────────────
   *
   * A review found this module reading `error.problem.type` and `error.problem.correlation_id`
   * directly, so a malformed problem made `describeError` ITSELF throw — from the function whose
   * whole job is to make a failure renderable. `ErrorState` would then escalate instead of
   * rendering its safe generic state.
   *
   * These cases are DERIVED from the ways a value can be hostile rather than from the two
   * examples the finding named: an absent body, an accessor that throws, an accessor that
   * returns a different value each call, an inherited property, a revoked proxy, and a
   * prototype-only impostor. Each asserts BOTH halves — that nothing throws, AND that the
   * outcome is the safe generic presentation rather than whatever the value wanted.
   */
  const hostile = (): Array<[string, unknown]> => {
    const proxy = Proxy.revocable({}, {});
    proxy.revoke();

    const throwingType = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(throwingType, 'problem', {
      get() { throw new Error('getter hostile to the reader'); },
      configurable: true,
    });

    const throwingField = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(throwingField, 'problem', {
      value: Object.defineProperty({}, 'type', {
        get() { throw new Error('field getter hostile to the reader'); },
        configurable: true,
      }),
      configurable: true,
    });

    const nullProblem = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(nullProblem, 'problem', { value: null, configurable: true });

    const undefinedProblem = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(undefinedProblem, 'problem', { value: undefined, configurable: true });

    // A prototype is not a provenance: this passes `instanceof` and was never constructed.
    const impostor = Object.create(ApertureProblemError.prototype) as object;

    // An INHERITED `type`. A plain read would find it; an own-property read must not.
    const inherited = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(inherited, 'problem', {
      value: Object.create({ type: ERROR_URN.notFound }),
      configurable: true,
    });

    // A proxy that PASSES `instanceof` and throws from its descriptor trap.
    //
    // This fixture exists because a mutation run said it had to. Removing `ownValue`'s internal
    // catch left the suite green, which looked like a decorative guard — the truth was that no
    // fixture could reach it: every hostile proxy was rejected by `isA` first, so `ownValue` only
    // ever saw values that had already passed a prototype check. A guard whose failure path no
    // test can reach is untested, however carefully it was written. This is the value that
    // reaches it: the target carries the right prototype, so the dispatch enters the problem
    // branch, and then the trap throws on the very first read.
    const trapThrows = new Proxy(Object.create(ApertureProblemError.prototype) as object, {
      getOwnPropertyDescriptor() { throw new Error('descriptor trap hostile to the reader'); },
    });

    // The same hazard one level down: a legitimate error whose `problem` is such a proxy.
    const trapThrowsInside = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(trapThrowsInside, 'problem', {
      value: new Proxy({}, {
        getOwnPropertyDescriptor() { throw new Error('nested descriptor trap'); },
      }),
      configurable: true,
    });

    return [
      ['a proxy that passes instanceof and throws from its descriptor trap', trapThrows],
      ['a problem whose descriptor trap throws', trapThrowsInside],
      ['a problem that is null', nullProblem],
      ['a problem that is undefined', undefinedProblem],
      ['a `problem` accessor that throws', throwingType],
      ['a `type` accessor that throws', throwingField],
      ['a prototype-only impostor', impostor],
      ['an inherited `type`', inherited],
      ['a revoked proxy', proxy.proxy],
      ['a thrown string', 'just a string'],
      ['a thrown null', null],
      ['a thrown undefined', undefined],
      ['a thrown number', 42],
      ['a thrown array', [1, 2, 3]],
      ['an object with no prototype', Object.create(null)],
      ['a function', () => {}],
      ['a symbol', Symbol('nope')],
    ];
  };

  it.each(hostile())('is TOTAL over %s — it returns a presentation and never throws', (_name, value) => {
    let described: DescribedError | undefined;
    expect(() => { described = describeError(value); }).not.toThrow();
    // Not throwing is only half. A `describeError` that returned undefined would satisfy the
    // line above and break every caller.
    expect(described).toBeDefined();
    expect(typeof described?.title).toBe('string');
    expect(typeof described?.detail).toBe('string');
    expect(typeof described?.recovery).toBe('string');
  });

  it('reads OWN properties only — an inherited `type` does not classify', () => {
    // Sharper than totality, and deliberately so: with a plain property read this case does not
    // THROW, it silently resolves the inherited URN and renders the wrong error. "It did not
    // throw" would be satisfied by exactly the defect this guard exists to prevent, so the
    // assertion is on the OUTCOME. `Object.create({ type })` is how a value claims a provenance
    // it does not have.
    const inherited = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(inherited, 'problem', {
      value: Object.create({ type: ERROR_URN.notFound }),
      configurable: true,
    });
    expect(describeError(inherited).title).toBe(UNKNOWN_PRESENTATION.title);
    expect(describeError(inherited).title).not.toBe(URN_PRESENTATION.notFound.title);
  });

  /* ── WHICH GUARD IS THE ENFORCING CONTROL — MEASURED, NOT ASSUMED ────────────────────────
   *
   * Three guards protect totality: `ownValue`'s internal catch, `isA`'s wrapper, and the outer
   * boundary in `describeError`. A mutation run over each ONE AT A TIME left this suite green,
   * which does not mean they are decorative — it means they OVERLAP, and a mutation that removes
   * one while another still covers the case proves nothing about either.
   *
   * Measured by removing them in combination:
   *   * `isA` unwrapped AND the boundary removed  -> a revoked proxy throws from `instanceof`,
   *     aborting the dispatch before any branch including the catch-all. So the revoked proxy is
   *     a real hazard and the pair is load-bearing.
   *   * `ownValue`'s catch removed AND the boundary removed -> a proxy whose descriptor trap
   *     throws escapes. THIS ONE NEEDED A NEW FIXTURE: the first run of that mutation stayed
   *     green, not because the catch was decorative but because nothing in this list could reach
   *     it — every hostile proxy was rejected by `isA` before `ownValue` saw it. A guard whose
   *     failure path no fixture reaches is untested however carefully it was written, so the
   *     proxy-that-passes-instanceof fixtures above were added and the mutation then went red.
   *   * Either guard alone, with the boundary in place, keeps the suite green — so the boundary
   *     is the backstop, and the inner guards are what make the OUTCOME correct rather than
   *     merely non-throwing. That distinction is why the two tests above assert outcomes.
   *
   * Recorded here rather than in a commit message because the next person to refactor this needs
   * to know which line is holding the property up.
   */

  it('renders the SAFE GENERIC state for a malformed problem rather than escalating', () => {
    const nullProblem = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(nullProblem, 'problem', { value: null, configurable: true });
    // The end-to-end property the finding was about: the component still renders.
    const state = render(<ErrorState error={nullProblem} />);
    expect(state.textContent).toContain(STRINGS['error.unknown.title']);
  });

  it('does not invoke an accessor on the untrusted body at all', () => {
    // Stronger than "does not throw": a getter that merely COUNTS proves the read never reached
    // it. A getter is also a side-effect channel, not only a throw site.
    let reads = 0;
    const counted = new ApertureProblemError(problem(ERROR_URN.internal), 1);
    Object.defineProperty(counted, 'problem', {
      value: Object.defineProperty({}, 'correlation_id', {
        get() { reads += 1; return 'abc'; },
        configurable: true,
      }),
      configurable: true,
    });
    describeError(counted);
    expect(reads).toBe(0);
  });

  it('refuses a correlation id that is not the contract s Id shape', () => {
    // The one response value this client renders, so it is the one that has to be bounded.
    for (const bad of ['has spaces', 'x'.repeat(129), '<script>', '']) {
      const described = describeError(
        new ApertureProblemError(problem(ERROR_URN.internal, { correlation_id: bad }), 1),
      );
      expect(described.correlationId, `"${bad.slice(0, 20)}" must not be surfaced`).toBeUndefined();
    }
    expect(describeError(new ApertureProblemError(problem(ERROR_URN.internal, { correlation_id: 'a-Z_09' }), 1))
      .correlationId).toBe('a-Z_09');
  });

  it('never renders text carried INSIDE the URN', () => {
    // APTR-10's finding: `urn:aperture:error:token-abcdef` surfaces `abcdef` to anyone who
    // renders the URN. Nothing here renders one — it is a Map key and is discarded.
    const state = render(
      <ErrorState error={new ApertureProblemError(problem(`urn:aperture:error:${MUST_NOT_RENDER_URN_SEGMENT}`), 1)} />,
    );
    expect(state.textContent).not.toContain(MUST_NOT_RENDER_URN_SEGMENT);
    expect(state.textContent).not.toContain('urn:aperture:error');
    expect(state.textContent).toContain(STRINGS['error.unknown.title']);
  });

  it('gives every recovery kind a hint, and only the actionable ones a button', () => {
    const kinds = Object.keys(RECOVERY_HINT) as RecoveryKind[];
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(STRINGS[RECOVERY_HINT[kind]].trim()).not.toBe('');
      expect(Object.keys(RECOVERY_ACTION)).toContain(kind);
    }
    // These have no button on purpose. Offering "Try again" against a rate limit is an invitation
    // to make it worse; against `forbidden` or an oversized payload it is a control that cannot
    // work, which is a worse answer than an honest sentence.
    expect(RECOVERY_ACTION['wait-and-retry']).toBeNull();
    expect(RECOVERY_ACTION['contact-operator']).toBeNull();
    expect(RECOVERY_ACTION.none).toBeNull();
    expect(RECOVERY_ACTION['fix-input']).toBeNull();
    expect(RECOVERY_ACTION['reduce-payload']).toBeNull();
  });
});

/* ── ErrorBoundary ───────────────────────────────────────────────────────────────────────── */

function Exploding({ message }: { readonly message: string }): JSX.Element {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React writes the caught error to the console by design. Silenced so a passing run is
    // readable; the assertions below are what prove the boundary worked.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders a design-system fallback instead of a blank screen', () => {
    render(<ErrorBoundary mintCorrelationId={() => 'client-fixed'}><Exploding message="boom" /></ErrorBoundary>);
    expect(container.textContent).toContain(STRINGS['error.render.title']);
    expect(container.textContent).toContain(STRINGS['error.render.detail']);
    expect(container.querySelector('.error-boundary-fallback')).not.toBeNull();
  });

  it('shows the correlation id it minted', () => {
    render(<ErrorBoundary mintCorrelationId={() => 'client-fixed'}><Exploding message="boom" /></ErrorBoundary>);
    expect(container.textContent).toContain('client-fixed');
    expect(container.textContent).toContain(STRINGS['error.correlationId.label']);
  });

  it('does NOT render the thrown error s message', () => {
    // The fallback uses no dynamic data beyond the reference: a thrown message can carry a path,
    // a URL, or whatever was in scope where it was constructed.
    render(
      <ErrorBoundary mintCorrelationId={() => 'client-fixed'}>
        <Exploding message={MUST_NOT_RENDER} />
      </ErrorBoundary>,
    );
    expect(container.textContent).not.toContain(MUST_NOT_RENDER);
  });

  it('reports the SAME id it displayed, so a log line and a screenshot join up', () => {
    const reported: string[] = [];
    render(
      <ErrorBoundary mintCorrelationId={() => 'client-fixed'} onError={(_e, id) => reported.push(id)}>
        <Exploding message="boom" />
      </ErrorBoundary>,
    );
    expect(reported).toContain('client-fixed');
    expect(container.textContent).toContain(reported[0] ?? 'nothing was reported');
  });

  it('catches a thrown value that is not an Error, including undefined', () => {
    function ThrowsUndefined(): JSX.Element {
      // `throw undefined` is legal, and a boundary that stored the raw value would read it as
      // "nothing caught", re-render the children, and loop.
      throw undefined;
    }
    render(<ErrorBoundary mintCorrelationId={() => 'client-fixed'}><ThrowsUndefined /></ErrorBoundary>);
    expect(container.textContent).toContain(STRINGS['error.render.title']);
  });

  it('renders its children untouched when nothing throws', () => {
    const boundary = render(
      <ErrorBoundary><EmptyState title={t('app.name')} explanation={t('app.shell.underConstruction')} /></ErrorBoundary>,
    );
    expect(boundary.textContent).toContain(STRINGS['app.shell.underConstruction']);
    expect(boundary.querySelector('[role="alert"]')).toBeNull();
  });

  it('wires the fallback s recovery button to the handler', () => {
    const seen: RecoveryKind[] = [];
    render(
      <ErrorBoundary mintCorrelationId={() => 'client-fixed'} onRecover={(kind) => seen.push(kind)}>
        <Exploding message="boom" />
      </ErrorBoundary>,
    );
    act(() => { container.querySelector('button')?.click(); });
    expect(seen).toEqual(['reload-client']);
  });
});

describe('newCorrelationId', () => {
  beforeEach(() => resetCorrelationSequence());

  it('prefixes a client-minted id so nobody hunts for it in a server log', () => {
    expect(newCorrelationId({ randomUUID: () => 'abc' })).toBe(`${CLIENT_ID_PREFIX}abc`);
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const id = newCorrelationId({ getRandomValues: (array) => array.fill(0xab) });
    expect(id).toBe(`${CLIENT_ID_PREFIX}${'ab'.repeat(16)}`);
  });

  it('falls back past a randomUUID that throws', () => {
    const id = newCorrelationId({
      randomUUID: () => { throw new Error('blocked'); },
      getRandomValues: (array) => array.fill(0x01),
    });
    expect(id).toBe(`${CLIENT_ID_PREFIX}${'01'.repeat(16)}`);
  });

  it('falls back to a visible sequence number when there is no crypto at all', () => {
    // `null`, not `undefined`: a default parameter is applied to an explicit `undefined` as well,
    // so `undefined` reaches for the real `globalThis.crypto` and this rung would never run.
    // Weak, and it says so: a sequence number is legibly not an id. A fallback screen with no
    // reference at all would be worse.
    expect(newCorrelationId(null)).toBe(`${CLIENT_ID_PREFIX}seq-1`);
    expect(newCorrelationId(null)).toBe(`${CLIENT_ID_PREFIX}seq-2`);
  });
});

describe('prefersReducedMotion', () => {
  it('answers the query when one can be evaluated', () => {
    expect(prefersReducedMotion(fixedMatchMedia(true))).toBe(true);
    expect(prefersReducedMotion(fixedMatchMedia(false))).toBe(false);
  });

  it('answers TRUE when there is no matchMedia', () => {
    expect(prefersReducedMotion(null)).toBe(true);
  });

  it('answers TRUE when matchMedia throws', () => {
    expect(prefersReducedMotion(() => { throw new Error('no'); })).toBe(true);
  });
});

/* ── ProgressBar ─────────────────────────────────────────────────────────────────────────── */

describe('ProgressBar', () => {
  it('renders a determinate native progress element with an accessible name', () => {
    const bar = render(<ProgressBar label={t('state.busy')} value={0.5} />);
    const element = bar.querySelector('progress');
    expect(element?.getAttribute('aria-label')).toBe(STRINGS['state.busy']);
    expect(element?.value).toBe(0.5);
    expect(element?.max).toBe(1);
  });

  it('renders an INDETERMINATE progress element when the fraction is unknown', () => {
    const element = render(<ProgressBar label={t('state.busy')} />).querySelector('progress');
    expect(element?.hasAttribute('value')).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'renders %s as indeterminate rather than putting it on the element',
    (value) => {
      const bar = render(<ProgressBar label={t('state.busy')} value={value} showValue />);
      expect(bar.querySelector('progress')?.hasAttribute('value')).toBe(false);
      // The specific failure this guards: valid code, green tests, "NaN% complete" on screen.
      expect(bar.textContent).not.toContain('NaN');
      expect(bar.textContent).not.toContain('Infinity');
    },
  );

  it('clamps an out-of-range fraction instead of dropping the whole display', () => {
    expect(progressFraction(1.02)).toBe(1);
    expect(progressFraction(-0.4)).toBe(0);
    expect(progressFraction(undefined)).toBeNull();
    expect(progressFraction(Number.NaN)).toBeNull();
  });

  it('renders the percentage through the catalogue when asked', () => {
    const bar = render(<ProgressBar label={t('state.busy')} value={0.42} showValue />);
    expect(bar.textContent).toContain(format('state.progress.determinate', { percent: 42 }));
  });

  it('renders no percentage text unless asked', () => {
    expect(render(<ProgressBar label={t('state.busy')} value={0.42} />).querySelector('.progress-value')).toBeNull();
  });
});

/* ── InlineNotice ────────────────────────────────────────────────────────────────────────── */

const tones: NoticeTone[] = ['info', 'success', 'warning', 'error'];

describe('InlineNotice', () => {
  it.each(tones)('renders the %s tone with its own class', (tone) => {
    const notice = render(<InlineNotice tone={tone} message={t('app.name')} />);
    expect([...notice.classList]).toContain(`inline-notice-${tone}`);
    expect(notice.textContent).toContain(STRINGS['app.name']);
  });

  it('interrupts for a warning or an error, and stays polite otherwise', () => {
    expect(render(<InlineNotice tone="info" message={t('app.name')} />).getAttribute('role')).toBe('status');
    expect(render(<InlineNotice tone="success" message={t('app.name')} />).getAttribute('role')).toBe('status');
    expect(render(<InlineNotice tone="warning" message={t('app.name')} />).getAttribute('role')).toBe('alert');
    expect(render(<InlineNotice tone="error" message={t('app.name')} />).getAttribute('role')).toBe('alert');
  });

  it('names tones by MEANING, never by hue', () => {
    for (const hue of ['green', 'amber', 'rose', 'blue', 'violet', 'red']) {
      expect(tones as string[]).not.toContain(hue);
    }
  });

  it('renders a dismiss control only when the caller owns the dismissal', () => {
    expect(render(<InlineNotice tone="info" message={t('app.name')} />).querySelector('button')).toBeNull();
    const dismissed: number[] = [];
    const notice = render(<InlineNotice tone="info" message={t('app.name')} onDismiss={() => dismissed.push(1)} />);
    act(() => { notice.querySelector('button')?.click(); });
    expect(dismissed).toEqual([1]);
  });

  it('exports the component and nothing else — there is no queue to import', () => {
    // Structural, not aspirational: a tray, a store or an emitter would have to be exported to be
    // used, and this asserts the module's whole surface.
    expect(Object.keys(inlineNoticeModule)).toEqual(['InlineNotice']);
  });

  it('mounts nowhere but where it was rendered — no portal, no global mount point', () => {
    const before = document.body.children.length;
    render(<InlineNotice tone="warning" message={t('app.name')} />);
    // A portal-based tray would attach a node to <body>. The count is unchanged, and the notice
    // is inside the caller's own container.
    expect(document.body.children.length).toBe(before);
    expect(container.querySelectorAll('.inline-notice')).toHaveLength(1);
  });

  it('leaves nothing behind when it unmounts', () => {
    render(<InlineNotice tone="error" message={t('app.name')} />);
    act(() => { root.render(<StrictMode>{null}</StrictMode>); });
    expect(document.querySelectorAll('.inline-notice')).toHaveLength(0);
  });
});

/* ── Both themes ─────────────────────────────────────────────────────────────────────────── */

describe('both themes', () => {
  const sample = (
    <div>
      <SkeletonGroup>
        <Skeleton shape="heading" />
        <Skeleton shape="text" lines={2} />
      </SkeletonGroup>
      <Spinner />
      <ProgressBar label={t('state.busy')} value={0.3} showValue />
      <EmptyState title={t('state.empty.generic.title')} explanation={t('state.empty.generic.explanation')} />
      <ErrorState error={new ApertureNetworkError('down', 'request')} onRecover={() => {}} />
      <InlineNotice tone="warning" message={t('app.shell.underConstruction')} />
    </div>
  );

  beforeEach(() => stubMatchMedia(false));

  it('renders identical markup under data-theme="dark" and data-theme="light"', () => {
    // A primitive that rendered differently per theme would be making a colour decision in
    // JavaScript, which is the thing the token system exists to prevent.
    document.documentElement.setAttribute('data-theme', 'dark');
    const dark = render(sample).outerHTML;
    document.documentElement.setAttribute('data-theme', 'light');
    const light = render(sample).outerHTML;
    expect(light).toBe(dark);
  });

  it('renders with no theme attribute at all — the media query is then in charge', () => {
    document.documentElement.removeAttribute('data-theme');
    expect(render(sample).querySelectorAll('.state-block').length).toBeGreaterThan(0);
  });

  it('emits no inline style attribute anywhere in the tree', () => {
    render(sample);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('forwards a ref through the primitives it composes', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>{t('recovery.retry.action')}</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
