/**
 * APTR-100 — Spinner.
 *
 * ── WHEN TO USE IT, WRITTEN DOWN ONCE ───────────────────────────────────────────────────────
 *
 * A spinner is for an indeterminate wait SHORT enough that a skeleton would flash. Past
 * {@link SPINNER_MAX_WAIT_MS} the correct control is a `Skeleton`, because at that length the
 * user is no longer waiting for a moment, they are waiting for a page, and a page-shaped
 * placeholder tells them what is coming.
 *
 * The threshold is exported so seven sprints share one number instead of inventing seven. Be
 * precise about its status, because overclaiming a control is worse than not having one: it is
 * DOCUMENTATION, not enforcement. Nothing measures how long a spinner has been on screen, and
 * nothing switches it. `Skeleton` cannot be reached from here, so a lint could not tell the two
 * apart either. What is pinned by a test is that the constant exists and what its value is — so
 * a change to the guidance is a change someone reads.
 *
 * ── ACCESSIBILITY ───────────────────────────────────────────────────────────────────────────
 *
 * The moving part is `aria-hidden`; the label is the accessible content of a polite live region,
 * so the wait is announced once and the animation is never described. The label is catalogue-
 * typed, so a spinner cannot acquire a bare string.
 */
import { cx } from '../primitives/cx';
import { t } from '../../strings';
import type { UiString } from '../../strings';
import { useReducedMotion } from './motion';

/**
 * The documented boundary between a spinner and a skeleton, in milliseconds.
 *
 * One second: below it a skeleton flashes in and out and reads as a glitch; above it a bare
 * spinner stops telling the user anything about what is arriving.
 */
export const SPINNER_MAX_WAIT_MS = 1000;

export interface SpinnerProps {
  /** What is being waited for. Defaults to the generic "Working…". */
  readonly label?: UiString | undefined;
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  readonly className?: string | undefined;
}

export function Spinner({ label, size = 'md', className }: SpinnerProps): JSX.Element {
  const still = useReducedMotion();

  return (
    <span className={cx('spinner', `spinner-${size}`, still && 'spinner-still', className)} role="status">
      <span aria-hidden="true" className="spinner-ring" />
      <span className="visually-hidden">{label ?? t('state.busy')}</span>
    </span>
  );
}
