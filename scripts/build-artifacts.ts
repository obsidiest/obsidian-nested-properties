import {
  copyFile,
  rm
} from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { getRootFolder } from 'obsidian-dev-utils/script-utils/root';

export const ROOT_BUILD_ARTIFACT_FILE_NAMES = [
  'main.js',
  'styles.css'
] as const;

export async function copyBuildArtifactsToRoot(rootFolder?: string): Promise<void> {
  const repoRootFolder = getRepoRootFolder(rootFolder);
  const buildFolder = join(repoRootFolder, 'dist', 'build');

  await Promise.all(ROOT_BUILD_ARTIFACT_FILE_NAMES.map(async (fileName) => {
    await copyFile(join(buildFolder, fileName), join(repoRootFolder, fileName));
  }));
}

export async function removeRootBuildArtifacts(rootFolder?: string): Promise<void> {
  const repoRootFolder = getRepoRootFolder(rootFolder);

  await Promise.all(ROOT_BUILD_ARTIFACT_FILE_NAMES.map(async (fileName) => {
    await rm(join(repoRootFolder, fileName), { force: true });
  }));
}

function getRepoRootFolder(rootFolder?: string): string {
  return rootFolder ?? getRootFolder() ?? process.cwd();
}
