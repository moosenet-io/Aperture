/**
 * APTR-100 — ErrorState.
 *
 * ── IT NEVER RENDERS THE ERROR'S OWN TEXT ───────────────────────────────────────────────────
 *
 * Every word on screen comes from the catalogue, keyed by the error's CLASS. `error.message`,
 * `problem.title` and `problem.detail` are not displayed — see `error-presentation.ts` for the
 * three reasons, of which the load-bearing one is provenance: a failure message can carry text
 * shaped by whatever upstream produced it, and rendering it as the interface's own voice is how
 * injected text acquires the interface's authority.
 *
 * That is a property with a test: an error whose message is a distinctive string renders without
 * that string appearing anywhere in the output.
 *
 * ── IT ALWAYS ANSWERS "WHAT NOW" ────────────────────────────────────────────────────────────
 *
 * Every classification carries a {@link RecoveryKind}, every kind has a hint, and the kinds that
 * a button can genuinely resolve have one. `wait` and `operator` deliberately have NO button:
 * offering "Try again" against a rate limit is an invitation to make it worse, and a button that
 * cannot help is a worse answer than an honest sentence.
 *
 * A button appears only when the caller supplied `onRecover`. Rendering a control that does
 * nothing would be the same overclaim one layer down.
 */
import { cx } from '../primitives/cx';
import { Badge, Button } from '../primitives';
import { format, t } from '../../strings';
import {
  RECOVERY_ACTION,
  RECOVERY_HINT,
  describeError,
} from './error-presentation';
import type { ErrorPresentation, RecoveryKind } from './error-presentation';
import type { HeadingLevel } from './EmptyState';

export interface ErrorStateProps {
  /** The thrown value. Classified structurally; never rendered. */
  readonly error: unknown;
  /**
   * Overrides the classification. Used by `ErrorBoundary`, where the thrown value is a render
   * bug rather than a transport failure and the SDK's classes say nothing useful about it.
   */
  readonly presentation?: ErrorPresentation | undefined;
  /**
   * The reference to quote. Takes precedence over one carried by the error, which is what lets
   * `ErrorBoundary` supply a client-minted id for a failure that never involved the server.
   */
  readonly correlationId?: string | undefined;
  readonly onRecover?: ((kind: RecoveryKind) => void) | undefined;
  readonly headingLevel?: HeadingLevel | undefined;
  readonly className?: string | undefined;
}

export function ErrorState({
  error,
  presentation,
  correlationId,
  onRecover,
  headingLevel = 2,
  className,
}: ErrorStateProps): JSX.Element {
  const described = describeError(error);
  const shown: ErrorPresentation = presentation ?? described;
  const reference = correlationId ?? described.correlationId;
  const actionKey = RECOVERY_ACTION[shown.recovery];
  const Heading = `h${headingLevel}` as const;

  return (
    <div className={cx('state-block', 'error-state', className)} role="alert">
      <Heading className="state-title">{t(shown.title)}</Heading>
      <p className="state-detail">{t(shown.detail)}</p>
      <p className="state-hint">{t(RECOVERY_HINT[shown.recovery])}</p>
      {actionKey !== null && onRecover !== undefined ? (
        <div className="state-actions">
          <Button variant="primary" onClick={() => onRecover(shown.recovery)}>
            {t(actionKey)}
          </Button>
        </div>
      ) : null}
      {reference === undefined ? null : (
        <p className="state-reference">
          <span className="state-reference-label">{t('error.correlationId.label')}</span>
          <Badge tone="neutral" mono>{format('error.correlationId.value', { id: reference })}</Badge>
        </p>
      )}
    </div>
  );
}
