// `vitest/config` re-exports Vite's `defineConfig` with the `test` block typed; the build
// itself is plain Vite.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Aperture client build.
//
// Sovereignty constraints encoded here (Module Contract clause 6):
//   * `base` is a same-origin-relative path, never an absolute URL. The client is served by
//     the backend-for-frontend; the desktop target's endpoint is supplied at runtime through
//     the injectable SDK transport (APTR-07 / decision D1), never compiled in.
//   * No CDN plugin, no `externals` pointing at a host, no runtime font or analytics fetch.
//   * `assetsInlineLimit: 0` keeps fonts as emitted files rather than data URIs, so the
//     egress gate can see exactly what ships.
//   * `esbuild.legalComments: 'inline'` KEEPS dependency licence banners in the output.
//     That is deliberate: upstream licences must ship, and the egress gate is required to
//     tolerate the URLs they contain (it strips comments before scanning).
//
// `scripts/assert-no-external-hosts.mjs` runs after `vite build` and enforces the above over
// the built output — see package.json `build`.

/**
 * Vendor strings that embed an external origin in the emitted bundle.
 *
 * These are not fetches — they are literals a dependency concatenates into a human-readable
 * message — but Aperture ships no external origin at all, and the allowlist takes XML/HTML
 * namespace URIs only (a vendor documentation host is not one, and adding it there would be a
 * review rejection). So they are neutralized at build time, by exact string replacement, with
 * the reason recorded here.
 *
 * A stale entry fails the build rather than rotting silently: if an entry matches nothing, the
 * dependency changed and this table must be revisited.
 */
const VENDOR_URL_NEUTRALIZATIONS = [
  {
    find: 'https://reactjs.org/docs/error-decoder.html?invariant=',
    replace: 'react-error-decoder?invariant=',
    reason:
      'react-dom production builds concatenate this documentation URL into minified error text. '
      + 'The invariant number is preserved, so the message stays actionable offline.',
  },
] as const;

function sovereigntyTransform() {
  const seen = new Set<string>();
  return {
    name: 'aperture:neutralize-vendor-urls',
    apply: 'build' as const,
    renderChunk(code: string) {
      let out = code;
      for (const rule of VENDOR_URL_NEUTRALIZATIONS) {
        if (out.includes(rule.find)) {
          seen.add(rule.find);
          out = out.split(rule.find).join(rule.replace);
        }
      }
      return out === code ? null : { code: out, map: null };
    },
    closeBundle() {
      const stale = VENDOR_URL_NEUTRALIZATIONS.filter((r) => !seen.has(r.find));
      if (stale.length > 0) {
        throw new Error(
          'aperture:neutralize-vendor-urls — stale entr'
          + (stale.length === 1 ? 'y' : 'ies')
          + ` no longer present in any chunk: ${stale.map((r) => r.find).join(', ')}. `
          + 'Remove the entry or update it to the dependency\'s current string.',
        );
      }
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), sovereigntyTransform()],
  esbuild: {
    legalComments: 'inline',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      // No `external` entries: nothing is resolved from outside the bundle at runtime.
      external: [],
      output: {
        // A real licence banner carrying a real URL, in every emitted chunk. It is a comment:
        // inert text, never fetched. It is also deliberate ballast for the egress gate — the
        // false-positive pair (banner URL + inline-SVG xmlns) is therefore present in EVERY
        // build, so the gate cannot silently regress to the naive grep without going red.
        banner: '/*! Aperture — MIT licence: https://opensource.org/licenses/MIT */',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
  },
});
