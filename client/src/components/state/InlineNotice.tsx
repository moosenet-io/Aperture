/**
 * APTR-100 — InlineNotice. **Render-only. Read this before building anything around it.**
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────────────────────
 *
 * A message rendered by a component, in the place it applies to, for as long as that component
 * decides to render it. That is the whole of it.
 *
 * ── WHAT IT IS NOT, AND WHY THAT IS ENFORCED RATHER THAN ASKED FOR ──────────────────────────
 *
 * It is NOT a toast tray, NOT a queue, NOT a store, and NOT a second notification channel. This
 * module holds no state: no module-level array, no event emitter, no context, no portal, no
 * global mount point. Nothing here can be pushed to from elsewhere, because there is nothing
 * here to push to — a caller's own render is the only way a notice appears.
 *
 * That is deliberate and it is the Soul Contract's clause 2. A notification that reaches the
 * user OUT OF BAND — when they are not looking at the thing it concerns — spends the assistant's
 * prioritized presence budget, and that budget is arbitrated in one place. A component library
 * that grew its own tray would be a second, unarbitrated channel competing with it, and it would
 * be built by accident, one convenience helper at a time.
 *
 * Three tests hold the line, and they assert the ABSENCE structurally rather than by reading
 * this comment: the module's exports are exactly the component and its types; rendering a notice
 * adds no node outside the caller's own container (a portal would); and unmounting leaves
 * nothing behind.
 */
import type { ReactNode } from 'react';

import { cx } from '../primitives/cx';
import { Button } from '../primitives';
import { t } from '../../strings';
import type { UiString } from '../../strings';

/**
 * Tones name MEANINGS, exactly as the badge tones do. There is no `tone="amber"`, because a
 * notice's colour is what its message means, not a decision the call site gets to make.
 */
export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface InlineNoticeProps {
  readonly tone: NoticeTone;
  readonly message: UiString;
  /** An optional control that acts on the message. Not a dismissal — see `onDismiss`. */
  readonly action?: ReactNode;
  /**
   * Supplied by the caller, which OWNS the visibility. There is no internal `dismissed` state:
   * a notice that could hide itself would be holding UI state the caller cannot see, and the
   * next step from there is a store.
   */
  readonly onDismiss?: (() => void) | undefined;
  readonly className?: string | undefined;
}

/**
 * A warning or an error is a change the user needs now; information and success are not worth
 * interrupting for. `alert` is assertive by role, `status` is polite — the distinction is what
 * keeps a screen reader from being interrupted by a success message.
 */
const ROLE: Record<NoticeTone, 'alert' | 'status'> = {
  info: 'status',
  success: 'status',
  warning: 'alert',
  error: 'alert',
};

export function InlineNotice({ tone, message, action, onDismiss, className }: InlineNoticeProps): JSX.Element {
  return (
    <div className={cx('inline-notice', `inline-notice-${tone}`, className)} role={ROLE[tone]}>
      <span className="inline-notice-message">{message}</span>
      {action === undefined ? null : <span className="inline-notice-action">{action}</span>}
      {onDismiss === undefined ? null : (
        <Button variant="ghost" size="sm" onClick={onDismiss} aria-label={t('notice.dismiss')}>
          {t('notice.dismiss')}
        </Button>
      )}
    </div>
  );
}
