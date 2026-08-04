/**
 * APTR-100 — the typed top-level error boundary.
 *
 * ── WHAT IT GUARANTEES ──────────────────────────────────────────────────────────────────────
 *
 * A throw during render, in a lifecycle method, or in a constructor anywhere beneath this
 * boundary produces a design-system {@link ErrorState} carrying a reference — never React's
 * default, which is to unmount the whole tree and leave a white page.
 *
 * ── THE FALLBACK USES NO DYNAMIC DATA BEYOND THE REFERENCE ──────────────────────────────────
 *
 * Two reasons, and the second is the one that bites:
 *
 *   1. A boundary that renders the thrown error's message is rendering whatever the failure
 *      happened to contain — a stack fragment, a URL, a token that was in scope. `ErrorState`
 *      already refuses to display an error's own text, so this inherits that; the boundary
 *      passes {@link RENDER_FAILURE_PRESENTATION} explicitly, so the fallback's words come from
 *      the catalogue even for an error class the SDK has never heard of.
 *   2. THE FALLBACK CAN ITSELF THROW. It is rendered by a component that has already failed
 *      once; if it interpolated the error, a malformed error would take out the boundary too and
 *      the user would be back at the blank screen. The fallback touches exactly one runtime
 *      value — a string it minted itself.
 *
 * ── REPORTING ───────────────────────────────────────────────────────────────────────────────
 *
 * `onError` is the reporting hook. There is no default sink and there will never be a remote
 * one: no telemetry, no analytics, no external fetch — Module Contract clause 6. React already
 * writes the error and the component stack to the console; this adds the reference so a console
 * copy and a user's screenshot can be joined by hand.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { ErrorState } from './ErrorState';
import { RENDER_FAILURE_PRESENTATION } from './error-presentation';
import type { RecoveryKind } from './error-presentation';
import { newCorrelationId } from './correlation-id';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Called once per caught error, with the reference shown to the user, so a local log line and
   * the screen agree. Must not throw and must not reach the network.
   */
  readonly onError?: ((error: unknown, correlationId: string, info: ErrorInfo) => void) | undefined;
  /** Injected in tests so the fallback's reference is deterministic. */
  readonly mintCorrelationId?: (() => string) | undefined;
  /** Wired to the fallback's recovery button. Without it, the fallback shows the hint only. */
  readonly onRecover?: ((kind: RecoveryKind) => void) | undefined;
}

interface ErrorBoundaryState {
  /** `undefined` means "nothing has been caught"; `null` is a legitimate thrown value. */
  readonly caught: { readonly error: unknown } | undefined;
  readonly correlationId: string | undefined;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { caught: undefined, correlationId: undefined };

  /**
   * The caught value is BOXED. A component that throws `undefined` or `null` — which `throw`
   * permits — would otherwise be indistinguishable from "nothing was caught", and the boundary
   * would render its children again, throw again, and loop.
   */
  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { caught: { error } };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const mint = this.props.mintCorrelationId ?? newCorrelationId;
    const correlationId = mint();
    this.setState({ correlationId });
    this.props.onError?.(error, correlationId, info);
  }

  override render(): ReactNode {
    const { caught, correlationId } = this.state;
    if (caught === undefined) return this.props.children;

    return (
      <ErrorState
        error={caught.error}
        presentation={RENDER_FAILURE_PRESENTATION}
        correlationId={correlationId}
        onRecover={this.props.onRecover}
        className="error-boundary-fallback"
      />
    );
  }
}
