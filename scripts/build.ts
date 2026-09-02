import { build } from 'obsidian-dev-utils/script-utils/bundlers/esbuild';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';

import { copyBuildArtifactsToRoot } from './build-artifacts.ts';

await wrapCliTask(async () => {
  await build();
  await copyBuildArtifactsToRoot();
});
