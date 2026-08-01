/**
 * The Aperture mark, as bundled inline SVG.
 *
 * Two things about this file are load-bearing beyond the pixels:
 *   1. It ships INLINE — no icon font, no sprite fetched from anywhere. Nothing is requested
 *      at runtime to render the brand.
 *   2. It carries `xmlns="http://www.w3.org/2000/svg"`, which is an XML namespace identifier,
 *      not an address. This is the exact string that made the naive egress grep fail on a
 *      correct build; the gate allowlists it by exact match and this component is the live
 *      proof that a clean bundle containing it still passes.
 *
 * Colour comes from `currentColor` so the design system (APTR-02) owns the palette.
 */

export interface ApertureMarkProps {
  /** Rendered edge length in px. */
  size?: number;
  /** Accessible name. Omit for a decorative mark. */
  title?: string;
}

export function ApertureMark({ size = 32, title }: ApertureMarkProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16 3 L23.5 16 L16 29 L8.5 16 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="3.5" fill="currentColor" />
    </svg>
  );
}
