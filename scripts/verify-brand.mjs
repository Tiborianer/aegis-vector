import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? 'public';
const assets = [
  'site.webmanifest',
  'brand/aegis-vector-mark.svg',
  'brand/icon-16.png',
  'brand/icon-32.png',
  'brand/icon-48.png',
  'brand/apple-touch-icon.png',
  'brand/icon-192.png',
  'brand/icon-512.png',
  'brand/icon-maskable-512.png',
  'brand/share-card-v1.jpg',
];

for (const asset of assets) {
  const file = path.join(root, asset);
  await access(file);
  if ((await stat(file)).size === 0) throw new Error(`Brand asset is empty: ${file}`);
}

const html = await readFile(root === 'dist' ? path.join(root, 'index.html') : 'index.html', 'utf8');
for (const required of ['site.webmanifest', 'share-card-v1.jpg', 'og:image', 'twitter:card']) {
  if (!html.includes(required)) throw new Error(`Brand metadata is missing ${required} in ${root}/index.html`);
}
console.log(`Verified ${assets.length} brand assets in ${root}`);
