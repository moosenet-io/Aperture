// `vitest/config` re-exports Vite's `defineConfig` with the `test` block typed; the build
// itself is plain Vite.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

import { applyNeutralizations, staleRules } from './scripts/vendor-url-neutralization';

// Aperture client build.
//
// Sovereignty constraints encoded here (Module Contract clause 6):
//   * `base` is a same-origin-relative path, never an absolute URL. The client is served by
//     the backend-for-frontend; the desktop target's endpoint is supplied at runtime through
//     the injectable SDK transport (APTR-07 / decision D1), never compiled in.
//   * No CDN plugin, no `externals` pointing at a host, no runtime font or analytics fetch.
//   * `assetsInlineLimit: 0` keeps fonts as emitted files rather than data URIs, so the
//     egress lint can see exactly what ships.
//   * `esbuild.legalComments: 'inline'` KEEPS dependency licence banners in the output.
//     Upstream licences must ship, and the egress lint parses rather than greps, so the URLs
//     they contain are inert by construction.
//
// `scripts/assert-no-external-hosts.mjs` runs after `vite build` (see package.json `build`).
// It is a defence-in-depth LINT over the emitted bundle, not a security boundary — runtime
// egress is enforced by the CSP the BFF serves (APTR-99). Its own header says so at length.

/**
 * Replace vendor-owned external URLs that ship as STRINGS rather than comments.
 * Rules, their scoping, and their reasons live in ./scripts/vendor-url-neutralization.ts so
 * they can be unit-tested — including a regression test proving React error decoding still
 * behaves after the replacement.
 */
function neutralizeVendorUrls() {
  const applied = new Set<string>();
  return {
    name: 'aperture:neutralize-vendor-urls',
    apply: 'build' as const,
    renderChunk(code: string, chunk: { moduleIds?: readonly string[]; modules?: Record<string, unknown> }) {
      const moduleIds = chunk.moduleIds ?? Object.keys(chunk.modules ?? {});
      const result = applyNeutralizations(code, moduleIds);
      for (const find of result.applied) applied.add(find);
      return result.code === code ? null : { code: result.code, map: null };
    },
    closeBundle() {
      const stale = staleRules(applied);
      if (stale.length > 0) {
        throw new Error(
          'aperture:neutralize-vendor-urls — stale rule'
          + (stale.length === 1 ? '' : 's')
          + ` matched nothing in this build: ${stale.map((r) => r.find).join(', ')}. `
          + "Remove the rule or update it to the dependency's current string; a rule that "
          + 'never fires would leave a reader believing a URL is neutralized when it is not.',
        );
      }
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), neutralizeVendorUrls()],
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
        // A real licence banner carrying a real URL, in every emitted chunk. It is a comment —
        // inert text, never fetched — and it is deliberate ballast: every build therefore
        // carries the licence-banner-URL case, so a regression that made comments significant
        // again would go red immediately instead of waiting for a dependency upgrade.
        banner: '/*! Aperture — MIT licence: https://opensource.org/licenses/MIT */',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
  },
});