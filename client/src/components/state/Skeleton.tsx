/**
 * APTR-100 — Skeleton, and the group that announces it.
 *
 * ── A SKELETON MIRRORS A SHAPE. THE TYPE MAKES THAT UNAVOIDABLE. ────────────────────────────
 *
 * `shape` is REQUIRED and its union contains no generic option. There is no `<Skeleton />` that
 * renders an anonymous grey rectangle, because that is what a skeleton degrades into the moment
 * one is available: the point of the pattern is that the page does not reflow when the content
 * lands, and a box that matches nothing guarantees it will.
 *
 * ── WHAT A SCREEN READER GETS ───────────────────────────────────────────────────────────────
 *
 * The bars are `aria-hidden`: they are a picture of text that does not exist yet, and announcing
 * their absence is noise. The loading STATE is announced instead, once, from a polite live
 * region — and "once" is structural rather than hoped for:
 *
 *   * a lone `Skeleton` renders one region whose text NEVER CHANGES, so no re-render produces a
 *     second announcement (a live region announces on change, so an unchanging one is silent
 *     after the first);
 *   * a {@link SkeletonGroup} renders exactly ONE region for the whole group and switches its
 *     children off through context, so eight skeletons in a list announce once, not eight times.
 *
 * ── THE SHIMMER IS WITHHELD, NOT FROZEN, UNDER REDUCED MOTION ───────────────────────────────
 *
 * See `motion.ts`. The CSS also disables it; both exist because they do different things, and
 * the JS one fails toward stillness when the preference cannot be read.
 *
 * ── AN UNRESOLVED SKELETON IS A FAILURE STATE ───────────────────────────────────────────────
 *
 * A request that dies silently leaves a shimmer running forever, which tells the user the app is
 * working when it has stopped. {@link SkeletonGroup} takes an optional `timeout`, and its shape
 * is the enforcement: `{ afterMs, fallback }` is ONE object, so a timeout cannot be configured
 * without saying what replaces the skeleton when it fires.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { cx } from '../primitives/cx';
import { t } from '../../strings';
import type { UiString } from '../../strings';
import { useReducedMotion } from './motion';

/**
 * The shapes a skeleton may take. Each mirrors something real; none of them is "a box".
 */
export type SkeletonShape =
  /** Body copy. `lines` sets how many, and the last one is short, as real paragraphs are. */
  | 'text'
  /** A single heading line — taller and wider than body text. */
  | 'heading'
  /** A circular avatar. */
  | 'avatar'
  /** A rectangular media thumbnail. */
  | 'thumbnail'
  /** A control-sized pill, for a button or a chip that has not loaded. */
  | 'control';

export interface SkeletonProps {
  readonly shape: SkeletonShape;
  /** Number of bars, for `text` only. Ignored by every other shape; defaults to 3. */
  readonly lines?: number;
  readonly className?: string | undefined;
}

/** Whether an ancestor {@link SkeletonGroup} has already announced the loading state. */
const AnnouncedByGroup = createContext(false);

/**
 * The polite announcement. Visually hidden, never visually styled, and its content is fixed for
 * the lifetime of the element so it speaks once.
 */
function LoadingAnnouncement({ label }: { readonly label: UiString }): JSX.Element {
  return (
    <span className="visually-hidden" role="status" aria-live="polite">
      {label}
    </span>
  );
}

/**
 * A shape-matched loading placeholder.
 *
 * There is no props spread onto the DOM here, and that is deliberate: with no `...rest`, an
 * inline `style` has no route to the element even through a spread the type checker lets past.
 * The primitives in `components/primitives` need a runtime strip for that reason; this component
 * closes the hole by not having the surface.
 */
export function Skeleton({ shape, lines = 3, className }: SkeletonProps): JSX.Element {
  const still = useReducedMotion();
  const announcedByGroup = useContext(AnnouncedByGroup);

  // A non-positive or non-finite count still has to render something: a skeleton that renders
  // nothing at all is an invisible loading state, which is worse than a wrong one.
  const count = shape === 'text' && Number.isFinite(lines) ? Math.max(1, Math.trunc(lines)) : 1;
  const bars = Array.from({ length: count }, (_unused, index) => (
    <span
      key={index}
      className={cx(
        'skeleton-bar',
        `skeleton-${shape}`,
        shape === 'text' && index === count - 1 && count > 1 && 'skeleton-text-last',
        !still && 'skeleton-shimmer',
      )}
    />
  ));

  return (
    <span className={cx('skeleton', className)} data-shape={shape}>
      <span aria-hidden="true" className="skeleton-bars">{bars}</span>
      {announcedByGroup ? null : <LoadingAnnouncement label={t('state.loading.announcement')} />}
    </span>
  );
}

export interface SkeletonTimeout {
  /**
   * How long the skeleton may run before it is treated as a failure. There is no default: a
   * caller who wants a timeout has to say what "too long" means for their request.
   */
  readonly afterMs: number;
  /**
   * What replaces the skeleton when the timeout fires — an `ErrorState`, in practice. Required
   * by the same object, so a timeout can never be armed without one.
   */
  readonly fallback: ReactNode;
}

export interface SkeletonGroupProps {
  readonly children: ReactNode;
  /** Overrides the announcement. Catalogue-typed, so it cannot be a bare literal. */
  readonly label?: UiString | undefined;
  readonly timeout?: SkeletonTimeout | undefined;
  readonly className?: string | undefined;
}

/**
 * One announcement for a whole region of skeletons, plus the optional never-resolves timeout.
 */
export function SkeletonGroup({ children, label, timeout, className }: SkeletonGroupProps): JSX.Element {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!timeout) return undefined;
    setExpired(false);
    const handle = setTimeout(() => setExpired(true), timeout.afterMs);
    return () => clearTimeout(handle);
  }, [timeout]);

  if (timeout && expired) {
    // The group is over: no live region, no context, no shimmer. The fallback owns the region
    // now, and an ErrorState carries its own `role="alert"`.
    return <div className={cx('skeleton-group', className)}>{timeout.fallback}</div>;
  }

  return (
    <div className={cx('skeleton-group', className)}>
      <LoadingAnnouncement label={label ?? t('state.loading.announcement')} />
      <AnnouncedByGroup.Provider value>{children}</AnnouncedByGroup.Provider>
    </div>
  );
}
