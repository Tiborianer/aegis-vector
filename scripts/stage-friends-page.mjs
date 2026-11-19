import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { DESKTOP_PUBLIC_ASSETS } from './desktop-assets.mjs';

// The two games have their own entry points. Copy only release-approved media
// into the friends folder, plus the built hangar, its flight bundle and paints.
export async function stageFriendsPage(projectRoot, stageRoot) {
  const delta = path.join(projectRoot, 'friends-release');
  const destination = path.join(stageRoot, 'friends');
  const bundles = await readdir(path.join(delta, 'assets'));
  if (bundles.length !== 4 || ['index', 'main'].some(entry =>
    ['css', 'js'].some(ext => !bundles.some(file => new RegExp('^' + entry + '-[A-Za-z0-9_-]+\\.' + ext + '$').test(file))))) {
    throw new Error('Expected a friends hangar and a flight bundle, each with JavaScript and CSS.');
  }
  const shared = [...DESKTOP_PUBLIC_ASSETS, 'licenses/PHASER-LICENSE.txt', 'licenses/EVENTEMITTER3-LICENSE.txt'];
  const privateBuild = ['index.html', ...bundles.map(file => 'assets/' + file),
    ...['solar-flare', 'polar-shift', 'violet-afterimage'].map(id => 'graphics-v2/liveries/v1/' + id + '.png')];
  await mkdir(destination);
  for (const [source, files] of [[stageRoot, shared], [delta, privateBuild]]) {
    for (const file of files) {
      const input = path.join(source, file), output = path.join(destination, file);
      const metadata = await lstat(input);
      if (!metadata.isFile() || !metadata.size) throw new Error('Missing friends release file: ' + file);
      await mkdir(path.dirname(output), { recursive: true });
      await copyFile(input, output);
    }
  }
}
