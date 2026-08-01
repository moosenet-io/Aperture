// @vitest-environment jsdom
/**
 * Primitive render tests.
 *
 * What is asserted here is what the primitives are actually responsible for: the right class
 * vocabulary, the right element, the right accessibility wiring, a forwarded ref, and — the
 * point of a token-based system — markup that is IDENTICAL in both themes, because a primitive
 * must not know which theme is active. Anything a primitive did differently per theme would be
 * a colour decision made in JavaScript, which is the thing this sprint exists to prevent.
 *
 * What is deliberately NOT asserted here is computed style. jsdom implements neither the
 * cascade nor `var()` resolution, so `getComputedStyle` would return the empty string for every
 * token and any assertion built on it would be decorative. The token layer's real properties —
 * theme parity and 4.5:1 contrast — are asserted on the parsed stylesheet in
 * `scripts/token-layer.test.mjs`, where the values are real.
 */
import { act, createElement, createRef, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  Table,
  TableCell,
  TableHeaderCell,
  TrackedLabel,
  cx,
} from './index';
import type { BadgeTone, ButtonProps, ButtonVariant, CardProps, ControlSize } from './index';

declare global {
  // React's `act` requires this flag; declaring it keeps the assignment type-checked.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.removeAttribute('data-theme');
});

function render(node: ReactNode): HTMLElement {
  act(() => root.render(<StrictMode>{node}</StrictMode>));
  const first = container.firstElementChild;
  if (!(first instanceof HTMLElement)) throw new Error('nothing rendered');
  return first;
}

const classes = (element: Element) => [...element.classList].sort();

/* ── Card ────────────────────────────────────────────────────────────────────────────────── */

describe('Card', () => {
  it('renders the base class and nothing else by default', () => {
    expect(classes(render(<Card />))).toEqual(['card']);
  });

  it('adds the accent tone and the interactive treatment only when asked', () => {
    expect(classes(render(<Card tone="accent" interactive />)))
      .toEqual(['card', 'card-accent', 'card-interactive']);
  });

  it('keeps a caller class alongside its own', () => {
    expect(classes(render(<Card className="chat-thread" />))).toEqual(['card', 'chat-thread']);
  });

  it('composes header, body and footer', () => {
    const card = render(
      <Card>
        <CardHeader>Title</CardHeader>
        <CardBody>Body</CardBody>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect([...card.children].map((c) => c.className)).toEqual(['card-header', 'card-body', 'card-footer']);
  });

  it('forwards a ref to the element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

/* ── Button ──────────────────────────────────────────────────────────────────────────────── */

describe('Button', () => {
  const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
  const sizes: ControlSize[] = ['sm', 'md', 'lg'];

  it.each(variants)('renders the %s variant class', (variant) => {
    expect(classes(render(<Button variant={variant}>Go</Button>))).toContain(`btn-${variant}`);
  });

  it.each(sizes)('renders the %s size class', (size) => {
    expect(classes(render(<Button size={size}>Go</Button>))).toContain(`btn-${size}`);
  });

  it('defaults to type="button" so it cannot accidentally submit a surrounding form', () => {
    expect(render(<Button>Go</Button>).getAttribute('type')).toBe('button');
  });

  it('lets an explicit submit through', () => {
    expect(render(<Button type="submit">Go</Button>).getAttribute('type')).toBe('submit');
  });

  it('renders a real <button>, so it is keyboard-operable without any help', () => {
    expect(render(<Button>Go</Button>).tagName).toBe('BUTTON');
  });

  it('renders ButtonLink as an anchor — a link is not a button to assistive technology', () => {
    const link = render(<ButtonLink href="/chat">Chat</ButtonLink>);
    expect(link.tagName).toBe('A');
    expect(classes(link)).toContain('btn');
  });

  it('carries disabled through to the element', () => {
    expect((render(<Button disabled>Go</Button>) as HTMLButtonElement).disabled).toBe(true);
  });
});

/* ── Badge ───────────────────────────────────────────────────────────────────────────────── */

describe('Badge', () => {
  const tones: BadgeTone[] = ['neutral', 'accent', 'success', 'warning', 'error', 'info'];

  it.each(tones)('renders the %s tone class', (tone) => {
    expect(classes(render(<Badge tone={tone}>x</Badge>))).toEqual(['badge', `badge-${tone}`].sort());
  });

  it('adds the mono treatment on request', () => {
    expect(classes(render(<Badge mono>v1</Badge>))).toContain('badge-mono');
  });

  it('names tones by MEANING, never by hue', () => {
    // A props API offering `tone="green"` would invite decorative colour, which is the one
    // thing the design system's colour rule forbids. This pins the vocabulary.
    for (const hue of ['green', 'amber', 'rose', 'blue', 'violet', 'teal', 'red']) {
      expect(tones as string[]).not.toContain(hue);
    }
  });
});

/* ── Table ───────────────────────────────────────────────────────────────────────────────── */

describe('Table', () => {
  it('renders a table with the design-system class', () => {
    const table = render(
      <Table>
        <thead>
          <tr><TableHeaderCell>Name</TableHeaderCell><TableHeaderCell numeric>Size</TableHeaderCell></tr>
        </thead>
        <tbody>
          <tr><TableCell>a</TableCell><TableCell numeric>1</TableCell></tr>
        </tbody>
      </Table>,
    );
    expect(table.tagName).toBe('TABLE');
    expect(classes(table)).toEqual(['table']);
    expect(table.querySelectorAll('th.table-num')).toHaveLength(1);
    expect(table.querySelectorAll('td.table-num')).toHaveLength(1);
  });

  it('gives a header cell scope="col" by default, so the association is announced', () => {
    const table = render(<Table><thead><tr><TableHeaderCell>N</TableHeaderCell></tr></thead></Table>);
    expect(table.querySelector('th')?.getAttribute('scope')).toBe('col');
  });

  it('lets a row header override the scope', () => {
    const table = render(<Table><tbody><tr><TableHeaderCell scope="row">N</TableHeaderCell></tr></tbody></Table>);
    expect(table.querySelector('th')?.getAttribute('scope')).toBe('row');
  });
});

/* ── Input ───────────────────────────────────────────────────────────────────────────────── */

describe('Input', () => {
  it('renders the input class', () => {
    expect(classes(render(<Input aria-label="Search" />))).toEqual(['input']);
  });

  it('sets aria-invalid only when invalid', () => {
    expect(render(<Input aria-label="a" />).getAttribute('aria-invalid')).toBeNull();
    expect(render(<Input aria-label="a" invalid />).getAttribute('aria-invalid')).toBe('true');
  });

  it('adds the mono treatment on request', () => {
    expect(classes(render(<Input aria-label="a" mono />))).toContain('input-mono');
  });

  it('is focusable, and receives the focus ring through :focus-visible rather than a prop', () => {
    const input = render(<Input aria-label="a" />) as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);
  });
});

describe('TrackedLabel', () => {
  it('renders the label class and keeps the author\'s casing in the accessible name', () => {
    // The uppercase is `text-transform`, not the text, so a screen reader reads "Endpoint",
    // not "E N D P O I N T".
    const label = render(<TrackedLabel>Endpoint</TrackedLabel>);
    expect(classes(label)).toEqual(['label']);
    expect(label.textContent).toBe('Endpoint');
  });
});

/* ── Theme independence ──────────────────────────────────────────────────────────────────── */

describe('both themes', () => {
  const sample = (
    <Card tone="accent" interactive>
      <CardHeader>Header</CardHeader>
      <CardBody>
        <Button variant="primary">Send</Button>
        <Badge tone="success">Ready</Badge>
        <Input aria-label="Search" />
        <Table><tbody><tr><TableCell numeric>1</TableCell></tr></tbody></Table>
        <TrackedLabel>Endpoint</TrackedLabel>
      </CardBody>
    </Card>
  );

  it('renders identical markup under data-theme="dark" and data-theme="light"', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const dark = render(sample).outerHTML;
    document.documentElement.setAttribute('data-theme', 'light');
    const light = render(sample).outerHTML;
    expect(light).toBe(dark);
  });

  it('renders with no theme attribute at all — the media query is then in charge', () => {
    document.documentElement.removeAttribute('data-theme');
    expect(render(sample).className).toContain('card');
  });

  it('emits no inline style attribute anywhere in the tree', () => {
    // The adherence lint rejects a `style` prop at the source. This is the runtime half of the
    // same claim: whatever the primitives compose, nothing reaches the DOM as an inline style.
    render(sample);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });
});

/* ── Type-level enforcement (decision D8) ────────────────────────────────────────────────── */

/**
 * These are COMPILE-TIME assertions, evaluated by `tsc --noEmit` in the build. They are the
 * primary enforcement of the no-inline-style rule at a call site: the adherence lint is the
 * backstop, but the type checker rejects it first, in the editor, before anyone runs anything.
 * Per decision D8, a property of the prop surface is enforced by the language that owns it.
 *
 * `Absent<K, T>` resolves to `true` only when the key is genuinely gone from the type; if
 * `style` were ever reinstated it resolves to `never`, and the assignment below stops
 * compiling.
 */
type Absent<K extends string, T> = K extends keyof T ? never : true;

const _styleIsNotAPropOfCard: Absent<'style', CardProps> = true;
const _styleIsNotAPropOfButton: Absent<'style', ButtonProps> = true;
const _innerHtmlIsNotAPropOfCard: Absent<'dangerouslySetInnerHTML', CardProps> = true;

/** And the variant union admits no colour the token layer does not define. */
type IsButtonVariant<V extends string> = V extends ButtonVariant ? true : never;
const _chartreuseIsNotAVariant: Absent<'chartreuse', Record<ButtonVariant, true>> = true;
const _primaryIsAVariant: IsButtonVariant<'primary'> = true;

describe('the prop surface', () => {
  it('omits style, dangerouslySetInnerHTML, and any variant outside the design system', () => {
    // The assertions are the `const` declarations above; this test exists so the file reads as
    // one suite and so the constants are referenced rather than stripped as unused.
    expect([
      _styleIsNotAPropOfCard,
      _styleIsNotAPropOfButton,
      _innerHtmlIsNotAPropOfCard,
      _chartreuseIsNotAVariant,
      _primaryIsAVariant,
    ]).toEqual([true, true, true, true, true]);
  });

  it('rejects an inline style passed through createElement, not merely through JSX', () => {
    // `@ts-expect-error` FAILS the build if the following expression is NOT a type error, so
    // this is a live assertion rather than a comment. It is written with `createElement` so the
    // test file itself contains no JSX `style` attribute — the adherence lint scans this file
    // like any other, and a gate that has to exempt its own tests is a gate with a hole.
    // @ts-expect-error `style` is omitted from every primitive's props by design.
    const rejected = createElement(Card, { style: {} });
    expect(rejected).toBeTruthy();
  });
});

describe('cx', () => {
  it('joins truthy class names and drops the rest', () => {
    expect(cx('btn', false, undefined, null, '', 'btn-primary')).toBe('btn btn-primary');
  });
});
