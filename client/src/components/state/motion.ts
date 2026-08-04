/**
 * APTR-100 — reading the user's motion preference from JavaScript.
 *
 * The token layer already collapses animation under `prefers-reduced-motion: reduce`, and that
 * remains the primary control: it applies to every element, including ones no component here
 * knows about. This hook exists for what CSS cannot do — WITHHOLD a shimmer rather than freeze
 * it. A shimmer with `animation-duration: 1ms` is a static gradient band that still reads as a
 * decorative artefact; a skeleton that never had one reads as a placeholder.
 *
 * ── IT FAILS TOWARD STILLNESS ───────────────────────────────────────────────────────────────
 *
 * If `matchMedia` is missing, or throws, or the query cannot be evaluated, the answer is
 * `true` — reduced motion. The asymmetry is deliberate: an unnecessary still skeleton costs a
 * little polish, while an unwanted animation costs a user with a vestibular disorder actual
 * discomfort. When the preference is UNKNOWN, the safe answer is not the pretty one.
 */
import { useCallback, useSyncExternalStore } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The subset of `MediaQueryList` used here. Narrow so a test can supply one. */
export interface MotionQuery {
  readonly matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  /** Safari < 14 and jsdom's older shim. */
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

export type MatchMedia = (query: string) => MotionQuery;

function matchMediaOrNull(): MatchMedia | null {
  const candidate = (globalThis as { matchMedia?: unknown }).matchMedia;
  return typeof candidate === 'function' ? (candidate.bind(globalThis) as MatchMedia) : null;
}

/**
 * Does the user prefer reduced motion? `true` when the preference is set OR unknowable.
 *
 * @param matchMedia injectable so the unknowable and the throwing cases are testable rather
 *   than asserted. A guard nobody has watched fail is a guard that only claims to exist.
 */
export function prefersReducedMotion(matchMedia: MatchMedia | null = matchMediaOrNull()): boolean {
  if (!matchMedia) return true;
  try {
    return matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return true;
  }
}

/**
 * Subscribe to the preference.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the value is read during render
 * from the source of truth, so there is no first paint at the wrong setting, and a change while
 * mounted is picked up. Both listener spellings are supported because dropping the legacy one
 * would silently stop tracking changes on an older engine — it would still render correctly on
 * mount, which is exactly the kind of half-failure nobody notices.
 */
export function useReducedMotion(matchMedia: MatchMedia | null = matchMediaOrNull()): boolean {
  // Memoised on the source: an unstable `subscribe` makes React tear the listener down and set
  // it up again on every render, which turns a preference change into a race with re-rendering.
  const subscribe = useCallback((onChange: () => void): (() => void) => {
    if (!matchMedia) return () => {};
    let query: MotionQuery;
    try {
      query = matchMedia(REDUCED_MOTION_QUERY);
    } catch {
      return () => {};
    }
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener?.('change', onChange);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(onChange);
      return () => query.removeListener?.(onChange);
    }
    return () => {};
  }, [matchMedia]);

  const read = useCallback((): boolean => prefersReducedMotion(matchMedia), [matchMedia]);
  // The server snapshot is the same read: there is no server render in this client, and
  // returning a different value there would be a hydration mismatch waiting to happen.
  return useSyncExternalStore(subscribe, read, read);
}
