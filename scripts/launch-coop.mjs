import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat, mkdir, mkdtemp, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESKTOP_PUBLIC_ASSETS } from './desktop-assets.mjs';
import { stageWeb } from './web-stage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const mode = process.argv.includes('--local') ? 'local' : 'lan';
const prepare = process.argv.includes('--prepare');
const cache = path.join(root, 'outputs', 'coop-releases');
async function revision() {
  const hash = createHash('sha256');
  async function include(name) {
    const full = path.join(root, name),
      info = await stat(full);
    if (info.isDirectory()) {
      for (const child of (await readdir(full)).sort()) await include(path.join(name, child));
    } else {
      hash.update(name.split(path.sep).join('/'));
      hash.update(await readFile(full));
    }
  }
  for (const name of [
    'src',
    'index.html',
    'package-lock.json',
    'vite.config.ts',
    'scripts/desktop-assets.mjs',
    'scripts/web-stage.mjs',
  ])
    await include(name);
  // The approved runtime asset list also determines which media the launcher may share.
  for (const asset of DESKTOP_PUBLIC_ASSETS) await include(path.join('public', asset));
  return hash.digest('hex').slice(0, 18);
}
async function release() {
  if (process.env.AEGIS_WEB_DIR) return path.resolve(process.env.AEGIS_WEB_DIR);
  const id = await revision(),
    destination = path.join(cache, id);
  if (await stat(path.join(destination, 'release.json')).catch(() => false)) return destination;
  console.log('Preparing the current game for both pilots…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0)
    throw Error('The game build failed. Run npm install in the game workspace and start the launcher again.');
  await mkdir(cache, { recursive: true });
  const temporary = await mkdtemp(path.join(cache, '.stage-'));
  const staged = path.join(temporary, 'site');
  await stageWeb({ projectRoot: root, stageRoot: staged, revision: id });
  try {
    await rename(staged, destination);
  } catch (err) {
    if (
      !['EEXIST', 'ENOTEMPTY'].includes(err.code) ||
      !(await stat(path.join(destination, 'release.json')).catch(() => false))
    )
      throw err;
  }
  return destination;
}
process.env.AEGIS_WEB_DIR = await release();
if (prepare) {
  console.log('Prepared release: ' + process.env.AEGIS_WEB_DIR);
} else {
  if (mode === 'local') {
    process.env.AEGIS_BIND = '127.0.0.1';
    process.env.AEGIS_LAN_ADDRESS = '127.0.0.1';
    process.env.PORT ||= '4187';
  }
  if (!process.argv.includes('--no-open')) process.argv.push('--open');
  await import('../server/coop/start.mjs');
}
