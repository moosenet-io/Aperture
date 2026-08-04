/**
 * APTR-100 — ProgressBar.
 *
 * ── IT IS A NATIVE `<progress>`, AND THAT IS A DESIGN-SYSTEM DECISION ───────────────────────
 *
 * The obvious implementation sets a filled div's width from the value, which needs an inline
 * style — and the adherence lint rejects a `style` attribute in TSX outright, with no pragma to
 * disable it. Rather than argue with the gate, the element that already knows how to draw a
 * proportion draws it. Two things fall out for free: the semantics (`role=progressbar`, the
 * value relationships) are the platform's rather than a hand-wired set of ARIA attributes, and
 * omitting `value` gives a real indeterminate state instead of an invented one.
 *
 * ── AN UNKNOWABLE VALUE RENDERS AS INDETERMINATE, NEVER AS NaN ──────────────────────────────
 *
 * `NaN`, `Infinity` and `undefined` all mean the same thing — the fraction is not known — and
 * they all produce the indeterminate rendering. What they must never produce is `value="NaN"`
 * on the element or "NaN% complete" in the label: valid code, green tests, nonsense on screen.
 * Out-of-range numbers are clamped rather than rejected, because a caller who computes 1.02 from
 * a byte count has a rounding bug, not a reason to lose the whole progress display.
 */
import { cx } from '../primitives/cx';
import { format } from '../../strings';
import type { UiString } from '../../strings';

export interface ProgressBarProps {
  /** What is progressing. Required: an unlabelled progress bar tells a screen reader nothing. */
  readonly label: UiString;
  /**
   * Completion as a fraction from 0 to 1. Omit — or pass a non-finite number — for a wait whose
   * remaining time is not yet known.
   */
  readonly value?: number | undefined;
  /** Show the percentage as text beside the bar. */
  readonly showValue?: boolean | undefined;
  readonly className?: string | undefined;
}

/** The fraction to render, or `null` when it is not knowable. Exported for its own test. */
export function progressFraction(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

export function ProgressBar({ label, value, showValue = false, className }: ProgressBarProps): JSX.Element {
  const fraction = progressFraction(value);
  const percent = fraction === null ? null : Math.round(fraction * 100);

  return (
    <span className={cx('progress', fraction === null && 'progress-indeterminate', className)}>
      {fraction === null ? (
        <progress className="progress-track" aria-label={label} />
      ) : (
        <progress className="progress-track" aria-label={label} value={fraction} max={1} />
      )}
      {showValue && percent !== null ? (
        <span className="progress-value">{format('state.progress.determinate', { percent })}</span>
      ) : null}
    </span>
  );
}
