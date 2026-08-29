import {
  existsSync,
  readFileSync
} from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  copyBuildArtifactsToRoot,
  removeRootBuildArtifacts,
  ROOT_BUILD_ARTIFACT_FILE_NAMES
} from '../scripts/build-artifacts.ts';

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8');
}

describe('property field feature release quality', () => {
  it('should expose every persisted setting through the searchable settings tab', () => {
    const settingsSource = readRepoFile('src/plugin-settings.ts');
    const settingTabSource = readRepoFile('src/plugin-setting-tab.ts');
    const settingKeys = [...settingsSource.matchAll(/public (?<key>is\w+) =/gu)].map((match) => match.groups?.['key']).filter((settingKey): settingKey is string => settingKey !== undefined);

    expect(settingKeys).toHaveLength(37);
    for (const settingKey of settingKeys) {
      expect(settingTabSource).toContain(`'${settingKey}'`);
    }
  });

  it('should define precise sliders and all eight themed thread depths', () => {
    const styleSource = readRepoFile('src/styles/main.scss');

    expect(styleSource).toContain('# @preserve');
    expect(styleSource.match(/type: variable-number-slider/gu)?.length).toBeGreaterThanOrEqual(30);
    expect(styleSource).not.toMatch(/type: variable-number\s*(?:\r?\n|$)/u);
    expect(styleSource).toContain('np-thread-fallback-color-light');
    expect(styleSource).toContain('np-thread-override-color-dark');
    for (let depth = 1; depth <= 8; depth++) {
      expect(styleSource).toContain(`np-thread-color-${String(depth)}-enabled`);
      expect(styleSource).toContain(`np-thread-color-${String(depth)}`);
    }
  });

  it('should attest every release asset with the required GitHub permissions', () => {
    const workflow = readRepoFile('.github/workflows/attest-release-assets.yml');

    expect(workflow).toContain('actions/attest@v4');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('attestations: write');
    expect(workflow).toContain('artifact-metadata: write');
    expect(workflow).toContain('subject-path: assets/*');
  });

  it('should mirror fresh production assets to the repository root for local deployment', async () => {
    const rootFolder = await mkdtemp(join(tmpdir(), 'nested-properties-build-'));
    const buildFolder = join(rootFolder, 'dist', 'build');

    try {
      await mkdir(buildFolder, { recursive: true });
      for (const fileName of ROOT_BUILD_ARTIFACT_FILE_NAMES) {
        await writeFile(join(buildFolder, fileName), `fresh ${fileName}`, 'utf-8');
        await writeFile(join(rootFolder, fileName), `stale ${fileName}`, 'utf-8');
      }

      await copyBuildArtifactsToRoot(rootFolder);

      for (const fileName of ROOT_BUILD_ARTIFACT_FILE_NAMES) {
        await expect(readFile(join(rootFolder, fileName), 'utf-8')).resolves.toBe(`fresh ${fileName}`);
      }

      await removeRootBuildArtifacts(rootFolder);

      for (const fileName of ROOT_BUILD_ARTIFACT_FILE_NAMES) {
        expect(existsSync(join(rootFolder, fileName))).toBe(false);
      }
    } finally {
      await rm(rootFolder, { force: true, recursive: true });
    }
  });
});
