import { copyFile, lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MIME_TYPES } from '../desktop/policy.mjs';
import { DESKTOP_PUBLIC_ASSETS, isDesktopAsset } from './desktop-assets.mjs';

export const SHELL_FILES = Object.freeze(['main.mjs', 'policy.mjs', 'protocol.mjs']);

export async function stageDesktop({ projectRoot, stageRoot, version }) {
  const copied = [];
  async function copyAssets(source, target, relative = '') {
    await mkdir(target, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.endsWith('.map') || entry.name.endsWith('.md')) continue;
      const from = path.join(source, entry.name), to = path.join(target, entry.name);
      const rel = path.posix.join(relative, entry.name);
      if ((await lstat(from)).isSymbolicLink()) throw new Error(`Refusing packaged symlink: ${rel}`);
      if (entry.isDirectory()) await copyAssets(from, to, rel);
      else {
        if (!isDesktopAsset(rel)) continue;
        if (!entry.isFile() || !MIME_TYPES[path.extname(entry.name).toLowerCase()]) throw new Error(`Unexpected dist asset: ${rel}`);
        await copyFile(from, to); copied.push(`dist/${rel}`);
      }
    }
  }
  await copyAssets(path.join(projectRoot, 'dist'), path.join(stageRoot, 'dist'));
  if (!copied.includes('dist/index.html')) throw new Error('Production build is missing dist/index.html');
  const missing = DESKTOP_PUBLIC_ASSETS.filter((asset) => !copied.includes(`dist/${asset}`));
  if (missing.length) throw new Error(`Desktop active assets missing from production build: ${missing.join(', ')}`);
  await mkdir(path.join(stageRoot, 'desktop'), { recursive: true });
  for (const file of SHELL_FILES) {
    const source = path.join(projectRoot, 'desktop', file);
    if (!(await lstat(source)).isFile()) throw new Error(`Expected shell file: ${file}`);
    await copyFile(source, path.join(stageRoot, 'desktop', file)); copied.push(`desktop/${file}`);
  }
  // Runtime libraries are compiled into dist; retain their notices, not their dependency folders.
  await mkdir(path.join(stageRoot, 'licenses'), { recursive: true });
  for (const [source, name] of [
    ['phaser/LICENSE.md', 'PHASER-LICENSE.txt'],
    ['eventemitter3/LICENSE', 'EVENTEMITTER3-LICENSE.txt'],
  ]) {
    await copyFile(path.join(projectRoot, 'node_modules', source), path.join(stageRoot, 'licenses', name));
    copied.push(`licenses/${name}`);
  }
  await writeFile(path.join(stageRoot, 'package.json'), `${JSON.stringify({
    name: 'aegis-vector-desktop', version, private: true, type: 'module', main: 'desktop/main.mjs',
    description: 'Aegis Vector local development candidate. Not Steam-validated.',
  }, null, 2)}\n`);
  copied.push('package.json');
  return copied.sort();
}
