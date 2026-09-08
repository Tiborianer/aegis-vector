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
const introVideo = 'cinematics/video/aegis-vector-intro-v2.mp4';

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
if (videoInfo.size > 95 * 1024 * 1024) throw new Error(`Intro video exceeds the 95MiB GitHub-safe limit: ${videoPath} (${videoInfo.size} bytes)`);
const video = await readFile(videoPath);
if (video.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error(`Intro video does not have an ISO/QuickTime media signature: ${videoPath}`);
if (!video.includes(Buffer.from('avc1'))) throw new Error(`Intro video is missing H.264/AVC video: ${videoPath}`);
if (!video.includes(Buffer.from('mp4a'))) throw new Error(`Intro video is missing AAC audio: ${videoPath}`);

const moovOffset = video.indexOf(Buffer.from('moov'));
const mdatOffset = video.indexOf(Buffer.from('mdat'));
if (moovOffset < 0 || mdatOffset < 0 || moovOffset > mdatOffset) {
  throw new Error(`Intro video is not optimized for progressive web playback: ${videoPath}`);
}

const mvhdOffset = video.indexOf(Buffer.from('mvhd'));
if (mvhdOffset < 0) throw new Error(`Intro video is missing movie timing metadata: ${videoPath}`);
const mvhdData = mvhdOffset + 4;
const mvhdVersion = video[mvhdData];
const timescale = mvhdVersion === 0 ? video.readUInt32BE(mvhdData + 12) : video.readUInt32BE(mvhdData + 20);
const durationUnits = mvhdVersion === 0 ? video.readUInt32BE(mvhdData + 16) : Number(video.readBigUInt64BE(mvhdData + 24));
const durationSeconds = durationUnits / timescale;
if (!Number.isFinite(durationSeconds) || durationSeconds < 96.6 || durationSeconds > 97.2) {
  throw new Error(`Intro video duration is outside the approved 96.6–97.2 second range: ${durationSeconds}`);
}

let avcOffset = -1;
let avcSearchOffset = -1;
while ((avcSearchOffset = video.indexOf(Buffer.from('avc1'), avcSearchOffset + 1)) >= 0) {
  if (avcSearchOffset + 31 >= video.length) continue;
  const candidateWidth = video.readUInt16BE(avcSearchOffset + 28);
  const candidateHeight = video.readUInt16BE(avcSearchOffset + 30);
  if (candidateWidth > 0 && candidateHeight > 0) {
    avcOffset = avcSearchOffset;
    break;
  }
}
if (avcOffset < 0) throw new Error(`Intro video is missing an H.264 sample entry: ${videoPath}`);
const width = video.readUInt16BE(avcOffset + 28);
const height = video.readUInt16BE(avcOffset + 30);
if (width < 1280 || height < 720) throw new Error(`Intro video resolution is below 1280×720: ${width}×${height}`);

console.log(`Verified ${storyFiles.length} story panels, ${keyframes.length} intro keyframes, and the ${durationSeconds.toFixed(2)}s ${width}×${height} ${(videoInfo.size / 1024 / 1024).toFixed(1)}MiB intro video in ${root}.`);
