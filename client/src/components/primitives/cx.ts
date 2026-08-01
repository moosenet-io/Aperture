/**
 * Class-name composition. Deliberately tiny and dependency-free: joining strings is not worth
 * a package, and every dependency is a supply-chain surface in a client that promises no
 * external anything.
 *
 * Falsy entries are dropped so a call site can write `cx('btn', active && 'btn-primary')`.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ');
}

/**
 * Strip the two escape-hatch props at RUNTIME, immediately before they would be spread onto a
 * DOM element.
 *
 * This exists because the type-level omission is NOT sufficient on its own, which was
 * established by probing rather than assumed. Omitting `style` from a props type rejects
 * `<Card style={…} />` and rejects a spread whose type has no property in common with the
 * target — but a spread of a type that DOES share a property is checked for assignability
 * only, and TypeScript performs no excess-property check on a JSX spread. All three of these
 * compile clean against `tsc --noEmit` with this project's own strict config:
 *
 *   const mixed = { className: 'ok', style: { color: 'red' } };
 *   <Card {...mixed} />                                    // no error
 *   const widened: Record<string, unknown> = { style: {} };
 *   <Card {...widened} />                                  // no error
 *   <Card {...{ className: 'ok', dangerouslySetInnerHTML: { __html: 'x' } }} />  // no error
 *
 * And `{...rest}` in the wrappers would have forwarded them straight to the DOM, so React
 * would have applied the inline style. Forwarding a parent's props bag is the ordinary way
 * that shape arises, so this was a live hole rather than a contrived one.
 *
 * The type-level omission is still worth having — it catches the direct case in the editor,
 * before anything runs. This is the backstop that makes the guarantee hold regardless.
 */
export function withoutStyleEscapes<T extends object>(props: T): T {
  if (!('style' in props) && !('dangerouslySetInnerHTML' in props)) return props;
  const {
    style: _style,
    dangerouslySetInnerHTML: _html,
    ...safe
  } = props as T & { style?: unknown; dangerouslySetInnerHTML?: unknown };
  return safe as unknown as T;
}
