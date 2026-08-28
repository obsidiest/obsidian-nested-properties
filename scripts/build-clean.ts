import { buildClean } from 'obsidian-dev-utils/script-utils/build';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';

import { removeRootBuildArtifacts } from './build-artifacts.ts';

await wrapCliTask(async () => {
  await buildClean();
  await removeRootBuildArtifacts();
});
