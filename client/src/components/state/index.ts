/**
 * APTR-100 — the state primitives.
 *
 * Loading, empty, error and progress, as typed components, so seven sprints render these four
 * situations one way instead of seven. Every text prop is a `UiString`, so a BARE LITERAL cannot
 * satisfy one by ordinary structural typing — `tsc` rejects `title="No threads"` before any lint
 * runs. That is the guarantee at its true strength: the brand is not unforgeable (a cast mints
 * one, and `fromUserContent` mints one by design), and `src/strings/index.ts` says exactly what
 * is and is not held.
 *
 * Which control for which situation:
 *
 *   | situation                                   | control                                 |
 *   |---------------------------------------------|-----------------------------------------|
 *   | content is coming, and its shape is known   | `Skeleton` / `SkeletonGroup`            |
 *   | a short indeterminate wait (< 1s)           | `Spinner`                               |
 *   | a measurable amount of work                 | `ProgressBar`                           |
 *   | there is legitimately nothing to show       | `EmptyState`                            |
 *   | a request failed                            | `ErrorState`                            |
 *   | a component threw while rendering           | `ErrorBoundary`                         |
 *   | a message about the thing you are looking at| `InlineNotice` (render-only, no queue)  |
 */
export { Skeleton, SkeletonGroup } from './Skeleton';
export type { SkeletonProps, SkeletonGroupProps, SkeletonShape, SkeletonTimeout } from './Skeleton';

export { Spinner, SPINNER_MAX_WAIT_MS } from './Spinner';
export type { SpinnerProps } from './Spinner';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps, HeadingLevel } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';

export { ProgressBar, progressFraction } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';

export { InlineNotice } from './InlineNotice';
export type { InlineNoticeProps, NoticeTone } from './InlineNotice';

export { ErrorBoundary } from './ErrorBoundary';
export type { ErrorBoundaryProps } from './ErrorBoundary';

export {
  describeError,
  RECOVERY_ACTION,
  RECOVERY_HINT,
  RENDER_FAILURE_PRESENTATION,
  UNKNOWN_PRESENTATION,
  URN_PRESENTATION,
} from './error-presentation';
export type { DescribedError, ErrorPresentation, RecoveryKind } from './error-presentation';

export { CLIENT_ID_PREFIX, newCorrelationId, resetCorrelationSequence } from './correlation-id';
export type { RandomSource } from './correlation-id';

export { prefersReducedMotion, useReducedMotion, REDUCED_MOTION_QUERY } from './motion';
export type { MatchMedia, MotionQuery } from './motion';
