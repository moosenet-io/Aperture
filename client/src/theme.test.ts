// @vitest-environment jsdom
/**
 * Theme-resolution tests.
 *
 * The property that matters most here is the one the token layer depends on: `system` REMOVES
 * the attribute rather than writing the currently-resolved theme. Writing it would freeze the
 * user into whatever their OS happened to be at that moment, and a later OS change would never
 * reach them — a bug that only shows up at dusk.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyStoredTheme,
  applyThemePreference,
  readStoredPreference,
  resolveTheme,
  setThemePreference,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from './theme';

/** An in-memory Storage, so a test never depends on the environment's real one. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('html');
});

afterEach(() => {
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe('readStoredPreference', () => {
  it('returns system when nothing is stored', () => {
    expect(readStoredPreference(memoryStorage())).toBe('system');
  });

  it.each(['dark', 'light', 'system'] as const)('returns the stored %s preference', (value) => {
    expect(readStoredPreference(memoryStorage({ [THEME_STORAGE_KEY]: value }))).toBe(value);
  });

  it('falls back to system for a value it does not recognise', () => {
    // A corrupted key must not wedge the app into an undefined theme, and must not be written
    // through to the attribute where it would match no block at all.
    expect(readStoredPreference(memoryStorage({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    const hostile = { ...memoryStorage(), getItem: () => { throw new Error('blocked'); } } as Storage;
    expect(readStoredPreference(hostile)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the OS only for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
});

describe('applyThemePreference', () => {
  it('writes an explicit choice onto the root element', () => {
    applyThemePreference('light', root);
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe('light');
    applyThemePreference('dark', root);
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
  });

  it('REMOVES the attribute for system, handing control back to the media query', () => {
    root.setAttribute(THEME_ATTRIBUTE, 'light');
    applyThemePreference('system', root);
    expect(root.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it('defaults to the document element', () => {
    applyThemePreference('light');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });

  it('does not throw when there is no root element to write to', () => {
    expect(() => applyThemePreference('dark', null)).not.toThrow();
  });
});

describe('setThemePreference', () => {
  it('persists the choice and applies it', () => {
    const storage = memoryStorage();
    expect(setThemePreference('light', root, storage)).toBe('light');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });

  it('still applies the theme when storage refuses to persist it', () => {
    // A full or blocked quota is a reason to lose the preference at the next load, not a reason
    // to leave this session in the wrong theme.
    const hostile = { ...memoryStorage(), setItem: () => { throw new Error('quota'); } } as Storage;
    expect(() => setThemePreference('light', root, hostile)).not.toThrow();
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });
});

describe('applyStoredTheme', () => {
  it('applies what was stored', () => {
    applyStoredTheme(root, memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }));
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
  });

  it('leaves the attribute off when nothing was stored', () => {
    root.setAttribute(THEME_ATTRIBUTE, 'light');
    applyStoredTheme(root, memoryStorage());
    expect(root.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

});
