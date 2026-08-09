import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public';
const storyFiles = [
  ...['01', '02', '03'].map((n) => `story/first-signal/first-signal-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/warden-key/warden-key-${n}.webp`),
  ...['01', '02'].map((n) => `story/forked-truth/forked-truth-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/stillwater-directive/stillwater-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/project-crown/project-crown-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/rook-confession/rook-confession-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/last-vector/last-vector-${n}.webp`),
];
const keyframes = Array.from({ length: 5 }, (_, index) => [
  `cinematics/keyframes/scene-0${index + 1}-start.webp`,
  `cinematics/keyframes/scene-0${index + 1}-end.webp`,
]).flat();
const introVideo = 'cinematics/video/aegis-vector-intro-v1.mp4';

let storyBytes = 0;
for (const relative of [...storyFiles, ...keyframes]) {
  const path = join(root, relative);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size < 8 * 1024) throw new Error(`Missing, empty, or truncated cinematic asset: ${path}`);
  const header = await readFile(path);
  if (header.subarray(0, 4).toString('ascii') !== 'RIFF' || header.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error(`Cinematic asset is not WebP: ${path}`);
  }
  if (relative.startsWith('story/')) {
    if (info.size > 320 * 1024) throw new Error(`Story panel exceeds 320KB: ${path} (${info.size} bytes)`);
    storyBytes += info.size;
  }
}

if (storyFiles.length !== 20) throw new Error(`Expected exactly 20 story panels, mapped ${storyFiles.length}`);
if (storyBytes > 6.5 * 1024 * 1024) throw new Error(`Story panel set exceeds 6.5MB (${storyBytes} bytes)`);

const videoPath = join(root, introVideo);
const videoInfo = await stat(videoPath).catch(() => undefined);
if (!videoInfo?.isFile() || videoInfo.size < 256 * 1024) throw new Error(`Missing or truncated intro video: ${videoPath}`);
if (videoInfo.size > 50 * 1024 * 1024) throw new Error(`Intro video exceeds the approved 50MB original-file limit: ${videoPath} (${videoInfo.size} bytes)`);
const video = await readFile(videoPath);
if (video.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error(`Intro video does not have an ISO/QuickTime media signature: ${videoPath}`);
if (!video.includes(Buffer.from('avc1'))) throw new Error(`Intro video is missing H.264/AVC video: ${videoPath}`);
if (!video.includes(Buffer.from('mp4a'))) throw new Error(`Intro video is missing AAC audio: ${videoPath}`);

console.log(`Verified ${storyFiles.length} story panels, ${keyframes.length} intro keyframes, and the ${(videoInfo.size / 1024 / 1024).toFixed(1)}MB intro video in ${root}.`);
