/**
 * APTR-100 — the string catalogue. Every piece of user-facing text in Aperture is here.
 *
 * ── WHY A CATALOGUE AT ALL, WHILE THE APP IS ENGLISH-ONLY ────────────────────────────────────
 *
 * Because retrofitting one across seven sprints is a rewrite, and because a single table is the
 * only place a reviewer can read the app's whole voice at once. Localization is the eventual
 * payoff, not the reason.
 *
 * ── WHAT THE COMPILER HOLDS, AND WHAT IT DOES NOT ───────────────────────────────────────────
 *
 * This is the important part, and it is stated here rather than in a test comment because the
 * split is the design:
 *
 *   HELD BY `tsc --noEmit`, i.e. a violation cannot be committed and cannot be forgotten:
 *     1. COMPLETENESS. {@link StringKey} is declared INDEPENDENTLY of {@link STRINGS}, and the
 *        table is checked against `Record<StringKey, string>` by `satisfies`. A key in the union
 *        with no entry is a type error; an entry whose key is not in the union is a type error
 *        too, because `satisfies` excess-property-checks an object literal. Neither direction
 *        can drift, and no test is what makes that true.
 *     2. LOOKUP VALIDITY. `t('nope')` does not compile — see `index.ts`.
 *     3. PLACEHOLDER COMPLETENESS. `satisfies` preserves the literal types, so the placeholders
 *        of a parameterized string are recoverable AS TYPES and `format()` demands exactly
 *        them. A missing or misspelled parameter is a type error, not a `{name}` rendered to a
 *        user.
 *     4. PARAMETERIZED-vs-PLAIN. `t()` accepts only a key with no placeholders and `format()`
 *        only a key with some, so neither a raw `{id}` nor a pointless params object can reach
 *        the screen.
 *
 *   NOT held by the compiler, and therefore stated as limits rather than implied away:
 *     * That a string is GOOD — voice, length, whether "Try again" is the right verb. Prose is
 *       a review question.
 *     * That every rendered string CAME from here. That is a property of the component tree, and
 *       it is enforced two other ways, NEITHER of which is absolute:
 *         - the state primitives type their text props as `UiString`, so a bare literal cannot
 *           satisfy one by ordinary structural typing and `title="No threads"` is a type error.
 *           The brand is NOT unforgeable, though — a cast mints one, and `fromUserContent()`
 *           mints one deliberately for text the user owns. See `index.ts`.
 *         - `scripts/assert-no-bare-strings.mjs` scans the TSX for literal text an arbitrary DOM
 *           element would happily render, and rejects a cast to the brand outside `index.ts`
 *           (a lexical tripwire — its own header says so at length).
 *
 * ── KEY NAMING ──────────────────────────────────────────────────────────────────────────────
 *
 * `area.thing.role`, lower camel within a segment. The area prefix is what keeps a seven-sprint
 * catalogue navigable; `error.*` mirrors the SDK's error classes so the mapping in
 * `components/state/error-presentation.ts` reads as a translation of one registry into another.
 *
 * ── NO INTERPOLATION BY CONCATENATION ───────────────────────────────────────────────────────
 *
 * A string that carries a value spells it `{name}` and goes through `format()`. There is no
 * `'Sent ' + n + ' messages'` anywhere, and no string here contains markup: a catalogue entry is
 * always inert text, so nothing in it can become an element.
 */

/**
 * Every catalogue key, declared as a union INDEPENDENTLY of the table below.
 *
 * The independence is the mechanism. Were this `keyof typeof STRINGS`, the union would be
 * whatever the table happened to contain and completeness would be vacuous — the type would
 * agree with the data by construction, which is exactly the "test that agrees with the code"
 * shape. Written out, the two must be reconciled by the compiler.
 */
export type StringKey =
  /* ── App shell ─────────────────────────────────────────────────────────────────────────── */
  | 'app.name'
  | 'app.mark.title'
  | 'app.shell.underConstruction'
  /* ── Loading / progress ────────────────────────────────────────────────────────────────── */
  | 'state.loading'
  | 'state.loading.announcement'
  | 'state.busy'
  | 'state.progress.determinate'
  | 'state.progress.indeterminate'
  /* ── Empty ─────────────────────────────────────────────────────────────────────────────── */
  | 'state.empty.generic.title'
  | 'state.empty.generic.explanation'
  /* ── Error framing ─────────────────────────────────────────────────────────────────────── */
  | 'error.correlationId.label'
  | 'error.correlationId.value'
  | 'error.render.title'
  | 'error.render.detail'
  /* ── Recovery actions ────────────────────────────────────────────────────────────────────
     One hint per member of `RecoveryKind`, which is APTR-10's `RecoveryAction` union verbatim,
     plus an action label for the members a button can genuinely resolve. Adopting that
     vocabulary is what makes APTR-10's landing a deletion rather than a reconciliation. */
  | 'recovery.fixInput.hint'
  | 'recovery.reauthenticate.hint'
  | 'recovery.reauthenticate.action'
  | 'recovery.refreshSession.hint'
  | 'recovery.none.hint'
  | 'recovery.goBack.hint'
  | 'recovery.goBack.action'
  | 'recovery.refetch.hint'
  | 'recovery.refetch.action'
  | 'recovery.reducePayload.hint'
  | 'recovery.waitAndRetry.hint'
  | 'recovery.openSettings.hint'
  | 'recovery.openSettings.action'
  | 'recovery.retry.hint'
  | 'recovery.retry.action'
  | 'recovery.reloadClient.hint'
  | 'recovery.reloadClient.action'
  | 'recovery.contactOperator.hint'
  /* ── SDK failures that never reached a response ────────────────────────────────────────── */
  | 'error.network.title'
  | 'error.network.detail'
  | 'error.aborted.title'
  | 'error.aborted.detail'
  | 'error.config.title'
  | 'error.config.detail'
  | 'error.tokenUnavailable.title'
  | 'error.tokenUnavailable.detail'
  | 'error.malformed.title'
  | 'error.malformed.detail'
  | 'error.decode.title'
  | 'error.decode.detail'
  | 'error.unknown.title'
  | 'error.unknown.detail'
  /* ── One pair per contract error URN. Kept in the URN registry's order. ────────────────── */
  | 'error.validationFailed.title'
  | 'error.validationFailed.detail'
  | 'error.authRequired.title'
  | 'error.authRequired.detail'
  | 'error.authExpired.title'
  | 'error.authExpired.detail'
  | 'error.forbidden.title'
  | 'error.forbidden.detail'
  | 'error.notFound.title'
  | 'error.notFound.detail'
  | 'error.conflict.title'
  | 'error.conflict.detail'
  | 'error.preconditionFailed.title'
  | 'error.preconditionFailed.detail'
  | 'error.payloadTooLarge.title'
  | 'error.payloadTooLarge.detail'
  | 'error.rateLimited.title'
  | 'error.rateLimited.detail'
  | 'error.capabilityUnavailable.title'
  | 'error.capabilityUnavailable.detail'
  | 'error.upstreamTimeout.title'
  | 'error.upstreamTimeout.detail'
  | 'error.upstreamError.title'
  | 'error.upstreamError.detail'
  | 'error.contractVersionUnsupported.title'
  | 'error.contractVersionUnsupported.detail'
  | 'error.internal.title'
  | 'error.internal.detail'
  /* ── Notices ───────────────────────────────────────────────────────────────────────────── */
  | 'notice.dismiss';

/**
 * The English catalogue.
 *
 * `as const satisfies Record<StringKey, string>` does two jobs at once and both are needed:
 * `satisfies` checks the table against the union in BOTH directions, and `as const` keeps the
 * literal types so `format()` can read a string's placeholders from its type.
 */
export const STRINGS = {
  'app.name': 'Aperture',
  'app.mark.title': 'Aperture',
  'app.shell.underConstruction': 'The client shell is under construction.',

  'state.loading': 'Loading…',
  'state.loading.announcement': 'Loading content.',
  'state.busy': 'Working…',
  'state.progress.determinate': '{percent}% complete',
  'state.progress.indeterminate': 'In progress; the remaining time is not known yet.',

  'state.empty.generic.title': 'Nothing here yet',
  'state.empty.generic.explanation':
    'This view is empty because nothing has been created for it yet, not because something '
    + 'failed.',

  'error.correlationId.label': 'Reference',
  'error.correlationId.value': '{id}',
  'error.render.title': 'This part of the page could not be displayed',
  'error.render.detail':
    'Something in the interface failed while drawing. The rest of Aperture is unaffected, and '
    + 'reloading usually clears it. Quote the reference below if it keeps happening.',

  'recovery.fixInput.hint': 'Adjusting what was sent and trying again is the way through.',
  'recovery.reauthenticate.hint': 'Your session is no longer usable, so signing in again is the way through.',
  'recovery.reauthenticate.action': 'Sign in again',
  'recovery.refreshSession.hint': 'Aperture is renewing the session; this usually resolves itself in a moment.',
  'recovery.none.hint': 'There is nothing to retry here.',
  'recovery.goBack.hint': 'What was requested is not there, so going back is the way on.',
  'recovery.goBack.action': 'Go back',
  'recovery.refetch.hint': 'This view is out of date with the server. Loading it again resolves the difference.',
  'recovery.refetch.action': 'Load the current version',
  'recovery.reducePayload.hint': 'Sending less — a smaller attachment, or fewer at once — is what will get through.',
  'recovery.waitAndRetry.hint': 'Waiting a moment before trying again is the fastest route.',
  'recovery.openSettings.hint': 'This capability is configured in settings, which is where it can be checked.',
  'recovery.openSettings.action': 'Open settings',
  'recovery.retry.hint': 'This is usually temporary. Trying again often works.',
  'recovery.retry.action': 'Try again',
  'recovery.reloadClient.hint': 'Reloading picks up the current version of the interface.',
  'recovery.reloadClient.action': 'Reload Aperture',
  'recovery.contactOperator.hint':
    'This one is on the server rather than on this device. The reference below identifies the '
    + 'request in the server log.',

  'error.network.title': 'Could not reach the server',
  'error.network.detail': 'The request never got a reply, so nothing was changed.',
  'error.aborted.title': 'Cancelled',
  'error.aborted.detail': 'The request was cancelled before it finished. Nothing went wrong.',
  'error.config.title': 'Aperture is configured in a way the contract forbids',
  'error.config.detail':
    'The client was set up with a combination of endpoint and authentication that is not '
    + 'allowed. This is a configuration fault, not a transient one.',
  'error.tokenUnavailable.title': 'No credential is available',
  'error.tokenUnavailable.detail':
    'No token was found for this device, so no request was sent. The session has to be '
    + 're-established.',
  'error.malformed.title': 'The server replied in a shape Aperture does not accept',
  'error.malformed.detail':
    'The reply did not carry the error details the contract requires, so Aperture will not '
    + 'guess at what it meant.',
  'error.decode.title': 'The reply could not be read',
  'error.decode.detail': 'The server answered successfully but the body was not readable.',
  'error.unknown.title': 'Something went wrong',
  'error.unknown.detail': 'Aperture does not have a more specific description of this failure.',

  'error.validationFailed.title': 'That request was not valid',
  'error.validationFailed.detail': 'The server rejected the request as malformed, so nothing was changed.',
  'error.authRequired.title': 'Sign-in required',
  'error.authRequired.detail': 'This action needs an authenticated session.',
  'error.authExpired.title': 'Your session expired',
  'error.authExpired.detail': 'The session existed but is no longer valid.',
  'error.forbidden.title': 'Not permitted',
  'error.forbidden.detail': 'This session is authenticated but is not allowed to do that.',
  'error.notFound.title': 'Not found',
  'error.notFound.detail': 'What was requested does not exist, or is no longer there.',
  'error.conflict.title': 'That conflicts with the current state',
  'error.conflict.detail': 'Something else changed this first, so the request was not applied.',
  'error.preconditionFailed.title': 'The precondition no longer holds',
  'error.preconditionFailed.detail':
    'The request depended on a state that has since changed, so it was not applied.',
  'error.payloadTooLarge.title': 'Too large to send',
  'error.payloadTooLarge.detail': 'The request exceeded the size the server accepts.',
  'error.rateLimited.title': 'Too many requests',
  'error.rateLimited.detail': 'Requests are arriving faster than the server will accept them.',
  'error.capabilityUnavailable.title': 'That capability is unavailable',
  'error.capabilityUnavailable.detail':
    'The server is running but this particular capability is not available right now.',
  'error.upstreamTimeout.title': 'The server timed out waiting',
  'error.upstreamTimeout.detail': 'Something the server depends on did not answer in time.',
  'error.upstreamError.title': 'Something the server depends on failed',
  'error.upstreamError.detail': 'The failure is behind the server rather than in Aperture.',
  'error.contractVersionUnsupported.title': 'This version of Aperture is out of step with the server',
  'error.contractVersionUnsupported.detail':
    'The client and the server disagree about the API version, so requests will keep failing '
    + 'until the interface is reloaded.',
  'error.internal.title': 'The server hit an internal error',
  'error.internal.detail': 'The failure is on the server side and has been recorded there.',

  'notice.dismiss': 'Dismiss',
} as const satisfies Record<StringKey, string>;

/** The catalogue's own type, with literal values preserved. */
export type Catalogue = typeof STRINGS;

/**
 * The placeholder names inside a catalogue string, read from its literal TYPE.
 *
 * `'{percent}% complete'` yields `'percent'`; a string with no braces yields `never`. Recursive
 * so a string with several placeholders yields all of them.
 */
export type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

/** Keys whose string takes no parameters — the ones `t()` accepts. */
export type PlainKey = {
  [K in StringKey]: [Placeholders<Catalogue[K]>] extends [never] ? K : never;
}[StringKey];

/** Keys whose string takes parameters — the ones `format()` accepts. */
export type ParameterizedKey = Exclude<StringKey, PlainKey>;
