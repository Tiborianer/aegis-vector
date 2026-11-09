import { packager } from '@electron/packager';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageDesktop } from './desktop-stage.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const [platform, arch] = process.argv.slice(2);
if (!((platform === 'win32' && arch === 'x64') || (platform === 'darwin' && arch === 'arm64'))) {
  throw new Error('Supported development targets: win32 x64 or darwin arm64');
}
const pkg = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const work = path.join(projectRoot, 'work', 'desktop-staging'); await mkdir(work, { recursive: true });
const stageRoot = await mkdtemp(path.join(work, 'candidate-'));
const files = await stageDesktop({ projectRoot, stageRoot, version: pkg.version });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const candidatesRoot = path.join(projectRoot, 'outputs', 'desktop-candidates');
await mkdir(candidatesRoot, { recursive: true });
// Separate simultaneous targets and use an atomic unique suffix even within one millisecond.
const output = await mkdtemp(path.join(candidatesRoot, `${stamp}-${platform}-${arch}-`));
const artifacts = await packager({
  dir: stageRoot, out: output, name: 'Aegis Vector', executableName: 'AegisVector',
  platform, arch, electronVersion: pkg.devDependencies.electron,
  appVersion: pkg.version, appBundleId: 'games.aegisvector.desktop', appCategoryType: 'public.app-category.games',
  win32metadata: { CompanyName: 'Publisher not configured - internal QA', FileDescription: 'Aegis Vector Development Candidate' },
  asar: true, prune: false, overwrite: false, junk: true,
  download: { cacheRoot: path.join(projectRoot, 'work', 'electron-cache') },
  // No publisher certificate, notarization credentials, Steam SDK or App ID is assumed.
  osxSign: false, windowsSign: false,
});
const report = {
  product: 'Aegis Vector', version: pkg.version, createdAt: new Date().toISOString(),
  target: `${platform}-${arch}`, electron: pkg.devDependencies.electron,
  packager: pkg.devDependencies['@electron/packager'],
  status: 'UNSIGNED DEVELOPMENT CANDIDATE — NOT STEAM VALIDATED',
  distributionHold: 'Internal QA only. Replacement radio is integrated with paid-plan creation evidence; owner sign-off for all asset and distribution rights is still required.',
  artifacts: artifacts.map((artifact) => path.basename(artifact)), packagedFiles: files, steamAppId: null,
};
await writeFile(path.join(output, 'candidate-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(output, 'READ-ME-FIRST.txt'), [
  'AEGIS VECTOR — DEVELOPMENT CANDIDATE',
  '', 'Not publisher-signed, notarized, Steam-uploaded or Steam-validated.',
  'INTERNAL QA ONLY: final asset-rights and owner distribution approval are pending. Do not publicly distribute or sell.',
  'Windows: keep the whole Aegis Vector-win32-x64 folder together; launch AegisVector.exe.',
  'macOS: local Apple Silicon candidate only. No claim of distribution readiness.',
  'F11 toggles fullscreen. Use Game > Quit or Ctrl+Q / Command+Q to quit.',
  'Saves belong to the AegisVector application-data directory and persist across candidate updates.',
  'Browser saves do not automatically transfer to this separate desktop profile.',
  'Do not disable antivirus or OS security settings to run an untrusted copy.',
  'Windows tester must verify launch, intro video/audio/seeking, controls, saves/relaunch, fullscreen and ending.',
  '',
].join('\n'));
console.log(JSON.stringify({ output, artifacts, files: files.length, status: report.status }, null, 2));
