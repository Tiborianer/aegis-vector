import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DESKTOP_PUBLIC_ASSETS, isDesktopAsset } from './desktop-assets.mjs';

/** Stage a clean website without deleting or altering retained source media. */
export async function stageWeb({ projectRoot, buildRoot = path.join(projectRoot, 'dist'),
  stageRoot = path.join(projectRoot, 'web-dist'), revision = 'local-preview' }) {
  // Never mix a fresh release with files left in a previous staging folder.
  if (await lstat(stageRoot).catch(() => undefined)) throw new Error('Web staging destination already exists; choose a new empty path.');
  const bundles = (await readdir(path.join(buildRoot, 'assets')))
    .map((name) => `assets/${name}`).filter(isDesktopAsset);
  const files = ['index.html', ...DESKTOP_PUBLIC_ASSETS, ...bundles];
  const html = await readFile(path.join(buildRoot, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"?#]+)(?:[?#][^"]*)?"/g)]
    .map((match) => match[1]);
  if (!references.some((file) => file.endsWith('.js')) || !references.some((file) => file.endsWith('.css'))
    || references.some((file) => !bundles.includes(file))) throw new Error('Built HTML references missing or unsupported bundles.');
  // Validate everything before writing any output. Symlinked parent folders are
  // also rejected so an allowed name cannot expose a private file indirectly.
  for (const file of files) {
    const segments = file.split('/');
    for (let depth = 1; depth <= segments.length; depth++) {
      const candidate = path.join(buildRoot, ...segments.slice(0, depth));
      const info = await lstat(candidate);
      if (info.isSymbolicLink()) throw new Error(`Refusing web release symlink: ${file}`);
      if (depth === segments.length && (!info.isFile() || !info.size)) throw new Error(`Missing or empty web release asset: ${file}`);
    }
  }
  await mkdir(stageRoot, { recursive: true });
  let bytes = 0;
  for (const file of files) {
    const destination = path.join(stageRoot, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(buildRoot, file), destination);
    bytes += (await lstat(destination)).size;
  }
  await mkdir(path.join(stageRoot, 'licenses'));
  for (const [source, name] of [
    ['phaser/LICENSE.md', 'PHASER-LICENSE.txt'],
    ['eventemitter3/LICENSE', 'EVENTEMITTER3-LICENSE.txt'],
  ]) await copyFile(path.join(projectRoot, 'node_modules', source), path.join(stageRoot, 'licenses', name));
  const release = { revision, builtAt: new Date().toISOString(), activeAssets: DESKTOP_PUBLIC_ASSETS.length, bytes };
  await writeFile(path.join(stageRoot, 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
  return { files, ...release };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const projectRoot = process.cwd();
  const result = await stageWeb({ projectRoot,
    buildRoot: path.resolve(process.argv[2] ?? 'dist'),
    stageRoot: path.resolve(process.argv[3] ?? 'web-dist'),
    revision: process.env.GITHUB_SHA ?? 'local-preview',
  });
  console.log(`Web release staged: ${result.activeAssets} active assets; ${(result.bytes / 1024 / 1024).toFixed(1)} MiB. No legacy media, review pages, source maps or authoring files.`);
}
