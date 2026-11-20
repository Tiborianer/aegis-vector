import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Copy the reviewed Coastal build into the separate GitHub Pages directory. */
export async function stageMobilePage(projectRoot, stageRoot) {
  const source = await realpath(path.join(projectRoot, 'mobile-release'));
  const files = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  if (!Object.hasOwn(files, 'index.html')) throw new Error('Missing Coastal entry page.');
  const verified = [];
  for (const [file, expected] of Object.entries(files)) {
    if (!/^[\w-]+(?:\/[\w-]+)*\.[a-z0-9]+$/.test(file)) throw new Error('Invalid Coastal release path: ' + file);
    const input = path.join(source, file);
    if (await realpath(input) !== input) throw new Error('Unexpected Coastal release symlink: ' + file);
    const bytes = await readFile(input);
    if (!bytes.length || createHash('sha256').update(bytes).digest('hex') !== expected) {
      throw new Error('Coastal release checksum mismatch: ' + file);
    }
    verified.push([file, bytes]);
  }
  for (const [file, bytes] of verified) {
    const destination = path.join(stageRoot, 'mobile', file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}
