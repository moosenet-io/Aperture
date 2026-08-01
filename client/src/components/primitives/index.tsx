/**
 * Aperture primitives — typed React wrappers over the constellation CSS vocabulary.
 *
 * Downstream sprints compose THESE, never raw class strings and never a colour. Three
 * properties are worth stating because they are enforced, not merely intended:
 *
 *   1. **No `style` prop, and no `dangerouslySetInnerHTML` — enforced TWICE, because the type
 *      system alone does not hold.** Both are omitted from every wrapper's props type, so the
 *      direct case (`<Card style={…} />`) is a TYPE ERROR caught by `tsc --noEmit` before the
 *      adherence lint runs. But a JSX SPREAD is only checked for assignability — TypeScript
 *      performs no excess-property check on one — so `<Card {...propsBagFromParent} />` slips a
 *      `style` past the type checker whenever the bag shares any other prop with the target.
 *      That was verified against this project's own config, not assumed. So every wrapper also
 *      strips both keys at runtime via `withoutStyleEscapes` immediately before spreading onto
 *      the DOM element. Per decision D8 a property is enforced by the language that owns it;
 *      the honest reading here is that TypeScript owns only PART of it, and the runtime strip
 *      owns the rest.
 *   2. **Variants are unions, not strings.** `variant="chartreuse"` does not compile. A caller
 *      cannot reach a colour that is not in the design system because there is no spelling for
 *      one.
 *   3. **Variants name MEANINGS.** `success` / `warning` / `error` / `info` / `accent`, never
 *      `green` / `amber` / `rose` / `blue`. The design system's rule is that colour is
 *      semantic; a props API offering `color="green"` would invite the opposite.
 *
 * Focus-visible: the token layer carries the global `:focus-visible` ring, and `.input` and
 * `.card-interactive` add their own inset treatment. Nothing here removes an outline.
 */
import { forwardRef } from 'react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from 'react';

import { cx, withoutStyleEscapes } from './cx';

/**
 * Strip the escape hatches from an element's prop surface.
 *
 * `style` is the inline-style hole. `dangerouslySetInnerHTML` is the stray-`<style>`-block
 * hole: it takes a string the adherence lint's AST walk sees as inert data, and hands it to
 * the HTML parser. Neither has a legitimate use in a primitive.
 */
type Styleless<T> = Omit<T, 'style' | 'dangerouslySetInnerHTML'>;

/* ── Card ───────────────────────────────────────────────────────────────────────────────── */

export interface CardProps extends Styleless<HTMLAttributes<HTMLDivElement>> {
  /** `accent` keeps the violet edge at rest — for a LIVE or ACTIVE card, not for emphasis. */
  readonly tone?: 'default' | 'accent';
  /** Adds the hover lift and glow. Set it only when the whole card is genuinely activatable. */
  readonly interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = 'default', interactive = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('card', tone === 'accent' && 'card-accent', interactive && 'card-interactive', className)}
      {...withoutStyleEscapes(rest)}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, Styleless<HTMLAttributes<HTMLDivElement>>>(
  function CardHeader({ className, ...rest }, ref) {
    return <div ref={ref} className={cx('card-header', className)} {...withoutStyleEscapes(rest)} />;
  },
);

export const CardBody = forwardRef<HTMLDivElement, Styleless<HTMLAttributes<HTMLDivElement>>>(
  function CardBody({ className, ...rest }, ref) {
    return <div ref={ref} className={cx('card-body', className)} {...withoutStyleEscapes(rest)} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, Styleless<HTMLAttributes<HTMLDivElement>>>(
  function CardFooter({ className, ...rest }, ref) {
    return <div ref={ref} className={cx('card-footer', className)} {...withoutStyleEscapes(rest)} />;
  },
);

/* ── Button ─────────────────────────────────────────────────────────────────────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ControlSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Styleless<ButtonHTMLAttributes<HTMLButtonElement>> {
  readonly variant?: ButtonVariant;
  readonly size?: ControlSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Explicit: an unset `type` inside a form defaults to `submit`, which is how a button
      // meant to open a dialog ends up submitting the form it happens to sit in.
      type={type}
      className={cx('btn', `btn-${variant}`, `btn-${size}`, className)}
      {...withoutStyleEscapes(rest)}
    />
  );
});

/** A link that should read as a button. Kept separate: an anchor is not a button to a screen
 *  reader, and swapping the element behind one component is how that distinction gets lost. */
export interface ButtonLinkProps extends Styleless<AnchorHTMLAttributes<HTMLAnchorElement>> {
  readonly variant?: ButtonVariant;
  readonly size?: ControlSize;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = 'secondary', size = 'md', className, ...rest },
  ref,
) {
  return <a ref={ref} className={cx('btn', `btn-${variant}`, `btn-${size}`, className)} {...withoutStyleEscapes(rest)} />;
});

/* ── Badge ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Badge tones are MEANINGS. The mapping to the flux hues lives in the token layer:
 * success → green (endpoint / free), warning → amber (gated / cost), error → rose (alert),
 * info → blue (inbound / source), accent → violet (the core).
 */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps extends Styleless<HTMLAttributes<HTMLSpanElement>> {
  readonly tone?: BadgeTone;
  /** Mono, tracked — for an identifier, a version, or a telemetry value, not for prose. */
  readonly mono?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', mono = false, className, ...rest },
  ref,
) {
  return <span ref={ref} className={cx('badge', `badge-${tone}`, mono && 'badge-mono', className)} {...withoutStyleEscapes(rest)} />;
});

/* ── Table ──────────────────────────────────────────────────────────────────────────────── */

export const Table = forwardRef<HTMLTableElement, Styleless<TableHTMLAttributes<HTMLTableElement>>>(
  function Table({ className, ...rest }, ref) {
    return <table ref={ref} className={cx('table', className)} {...withoutStyleEscapes(rest)} />;
  },
);

export interface TableCellProps extends Styleless<TdHTMLAttributes<HTMLTableCellElement>> {
  /** Right-aligned tabular figures. A column of numbers that does not align is unreadable. */
  readonly numeric?: boolean;
}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { numeric = false, className, ...rest },
  ref,
) {
  return <td ref={ref} className={cx(numeric && 'table-num', className)} {...withoutStyleEscapes(rest)} />;
});

export interface TableHeaderCellProps extends Styleless<ThHTMLAttributes<HTMLTableCellElement>> {
  readonly numeric?: boolean;
}

export const TableHeaderCell = forwardRef<HTMLTableCellElement, TableHeaderCellProps>(
  function TableHeaderCell({ numeric = false, className, scope = 'col', ...rest }, ref) {
    return <th ref={ref} scope={scope} className={cx(numeric && 'table-num', className)} {...withoutStyleEscapes(rest)} />;
  },
);

/* ── Input ──────────────────────────────────────────────────────────────────────────────── */

export interface InputProps extends Styleless<InputHTMLAttributes<HTMLInputElement>> {
  /** Mono figures — for a token, a path, an id. */
  readonly mono?: boolean;
  /** Marks the field invalid for assistive technology AND for the error border, together.
   *  Two separate props would eventually disagree. */
  readonly invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono = false, invalid = false, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx('input', mono && 'input-mono', className)}
      aria-invalid={invalid || undefined}
      {...withoutStyleEscapes(rest)}
    />
  );
});

/* ── Tracked label ──────────────────────────────────────────────────────────────────────── */

export interface TrackedLabelProps extends Styleless<HTMLAttributes<HTMLSpanElement>> {
  readonly children?: ReactNode;
}

/** The mono uppercase eyebrow. `text-transform` does the uppercasing, so the accessible name
 *  stays the sentence-case text the author wrote. */
export const TrackedLabel = forwardRef<HTMLSpanElement, TrackedLabelProps>(function TrackedLabel(
  { className, ...rest },
  ref,
) {
  return <span ref={ref} className={cx('label', className)} {...withoutStyleEscapes(rest)} />;
});

export { cx } from './cx';
export type { ClassValue } from './cx';
