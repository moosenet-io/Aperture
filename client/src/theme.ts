/**
 * Theme resolution for Aperture.
 *
 * The token layer (`styles/constellation.css`) defines dark as the base, light under
 * `prefers-color-scheme: light`, and an explicit `data-theme` attribute on the root element
 * that beats the media query IN BOTH DIRECTIONS. This module owns that attribute.
 *
 * FLASH: `applyStoredTheme()` is called from `main.tsx` BEFORE `createRoot().render()`, so no
 * React content ever paints under the wrong theme. It is imported for its side effect as the
 * first application import, so it runs before any component module is evaluated.
 *
 * The residual, stated honestly rather than papered over: between the browser painting the
 * empty document and this module executing, the page background follows `prefers-color-scheme`
 * alone. A user whose explicit choice OPPOSES their OS preference can therefore see one frame
 * of the other theme's background before any content exists. Closing that gap needs the
 * attribute in the served HTML — an inline bootstrap script (which the BFF's CSP would have to
 * nonce) or server-side rendering of the attribute. That belongs with the BFF that serves the
 * shell (APTR-99), not here.
 */

/** The two themes the token layer actually defines. */
export type Theme = 'dark' | 'light';

/** What the user can CHOOSE. `system` means "follow the OS", i.e. remove the override. */
export type ThemePreference = Theme | 'system';

/** localStorage key. Namespaced so it cannot collide with anything else on the origin. */
export const THEME_STORAGE_KEY = 'aperture.theme-preference';

/** The attribute the token layer keys its overrides off. */
export const THEME_ATTRIBUTE = 'data-theme';

const PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system'];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value);
}

/**
 * Read the stored preference. Returns `system` for anything absent, unparseable, or not a
 * value we recognise — a corrupted key must not wedge the app into an undefined theme.
 * Storage access is wrapped because it throws outright in some privacy modes.
 */
export function readStoredPreference(storage?: Storage | undefined): ThemePreference {
  const store = storage ?? safeLocalStorage();
  if (!store) return 'system';
  try {
    const raw = store.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Resolve a preference to the theme that will actually render, given the OS preference.
 * Exported because a component that needs to know the ACTIVE theme (a canvas that has to
 * paint its own pixels, say) must not re-derive this rule.
 */
export function resolveTheme(preference: ThemePreference, prefersLight: boolean): Theme {
  if (preference === 'system') return prefersLight ? 'light' : 'dark';
  return preference;
}

function prefersLight(): boolean {
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

/**
 * Write the preference onto the root element. `system` REMOVES the attribute rather than
 * writing the currently-resolved theme, so the media query resumes control and the theme
 * tracks a later OS change with no listener.
 */
export function applyThemePreference(
  preference: ThemePreference,
  root: Element | null = typeof document === 'undefined' ? null : document.documentElement,
): Theme {
  const resolved = resolveTheme(preference, prefersLight());
  if (root) {
    if (preference === 'system') root.removeAttribute(THEME_ATTRIBUTE);
    else root.setAttribute(THEME_ATTRIBUTE, preference);
  }
  return resolved;
}

/** Persist a choice and apply it. Returns the theme that is now rendering. */
export function setThemePreference(
  preference: ThemePreference,
  root?: Element | null,
  storage?: Storage | undefined,
): Theme {
  const store = storage ?? safeLocalStorage();
  try {
    store?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* A full or blocked quota must not stop the theme from applying for this session. */
  }
  return applyThemePreference(preference, root === undefined ? undefined : root);
}

/**
 * Apply the stored preference. Called for its side effect from `main.tsx` before first render.
 */
export function applyStoredTheme(root?: Element | null, storage?: Storage | undefined): Theme {
  return applyThemePreference(
    readStoredPreference(storage),
    root === undefined ? undefined : root,
  );
}
