import { describe, expect, it } from 'vitest';
import { importProblems, manifestFiles, passManifestProblems } from './check-pass-manifests';

describe('Arcade Pass manifests in this repo', () => {
  it('are all valid, and the Pass Lab has one', async () => {
    expect(manifestFiles().some((file) => file.endsWith('lab.manifest.ts'))).toBe(true);
    expect(await passManifestProblems()).toEqual([]);
  });
});

describe('importProblems', () => {
  it('allows only the manifest entry point', () => {
    expect(
      importProblems(`import { definePassManifest, glyphs } from '@shared/pass/manifest';`),
    ).toEqual([]);
    expect(
      importProblems(
        `import { definePassManifest } from '@shared/pass';\nimport { WORLDS } from './src/engine/worlds';`,
      ),
    ).toEqual([
      'imports "@shared/pass"; a manifest may only import from "@shared/pass/manifest".',
      'imports "./src/engine/worlds"; a manifest may only import from "@shared/pass/manifest".',
    ]);
  });

  it('sees multi-line imports', () => {
    expect(
      importProblems(`import {\n  definePassManifest,\n} from '../../shared/pass';`),
    ).toHaveLength(1);
  });
});
