// The no-flash guarantee is an ORDERING property of the entry module, not a property of any
// function, so it is asserted where the ordering lives. A unit test cannot observe a paint; it
// can observe that the entry module still writes the theme attribute BEFORE it renders.
//
// This lives in scripts/ because it reads a source file from disk, which application TypeScript
// deliberately has no types for.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLIENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(join(CLIENT_DIR, 'src', 'main.tsx'), 'utf8');

describe('the entry module', () => {
  it('applies the stored theme before the first render', () => {
    const applied = main.indexOf('applyStoredTheme()');
    const rendered = main.indexOf('.render(');
    expect(applied, 'main.tsx no longer calls applyStoredTheme()').toBeGreaterThan(-1);
    expect(rendered, 'main.tsx no longer renders').toBeGreaterThan(-1);
    expect(applied).toBeLessThan(rendered);
  });

  it('imports the token layer and the primitives, and no longer the scaffold base layer', () => {
    expect(main).toContain("import './styles/constellation.css'");
    expect(main).toContain("import './styles/primitives.css'");
    expect(main).not.toContain('base.css');
  });
});
