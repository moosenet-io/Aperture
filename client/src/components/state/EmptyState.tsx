/**
 * APTR-100 — EmptyState.
 *
 * ── "NO DATA" IS NOT AN EMPTY STATE ─────────────────────────────────────────────────────────
 *
 * `explanation` is REQUIRED. An empty view without one leaves the user unable to tell "nothing
 * has been created yet" from "the filter excluded everything" from "it failed and we swallowed
 * the error", and those three call for three different actions. Making it required is the whole
 * reason this is a component rather than a CSS class: the type system asks the question that
 * a designer would otherwise have to remember to ask.
 *
 * Both text props are {@link UiString}, so they can only come from the catalogue (or, for the
 * user's own content, from `fromUserContent`). A bare literal does not compile.
 *
 * ── HEADING LEVEL ───────────────────────────────────────────────────────────────────────────
 *
 * An empty state sits inside a page whose heading structure it cannot know, so the level is a
 * prop rather than a hardcoded `<h2>`. A wrong level is a real accessibility defect — it breaks
 * heading navigation for the users most likely to be relying on it.
 */
import type { ReactNode } from 'react';

import { cx } from '../primitives/cx';
import type { UiString } from '../../strings';

/** Heading levels an in-page block may legitimately take. `h1` belongs to the page. */
export type HeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface EmptyStateProps {
  readonly title: UiString;
  /** Why it is empty, and what would fill it. Required — see this file's header. */
  readonly explanation: UiString;
  /** The one thing to do about it, if there is one. A `Button` or `ButtonLink`. */
  readonly action?: ReactNode;
  readonly headingLevel?: HeadingLevel | undefined;
  readonly className?: string | undefined;
}

export function EmptyState({
  title,
  explanation,
  action,
  headingLevel = 2,
  className,
}: EmptyStateProps): JSX.Element {
  const Heading = `h${headingLevel}` as const;

  return (
    <div className={cx('state-block', 'empty-state', className)}>
      <Heading className="state-title">{title}</Heading>
      <p className="state-detail">{explanation}</p>
      {action === undefined ? null : <div className="state-actions">{action}</div>}
    </div>
  );
}
