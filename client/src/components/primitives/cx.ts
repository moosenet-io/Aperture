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
