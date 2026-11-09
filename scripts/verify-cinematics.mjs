import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public';
// Active story plates only. Superseded story-v2 and story/ chapter assets remain
// on disk for provenance but cannot satisfy a missing version-5 replacement.
const storyV5Files = [
  ['first-signal', 6], ['warden-key', 7], ['rook-confession', 3], ['last-vector', 3],
].flatMap(([chapter, count]) => Array.from({ length: count }, (_, index) =>
  `story-v5/${chapter}/${String(index + 1).padStart(2, '0')}.webp`));
const storyFiles = [
  ...storyV5Files,
  ...['aurora-arrival', 'aurora-hana', 'aurora-vale', 'fortress-breach', 'fortress-shield'].map((name) => `story-v6/${name}.webp`),
  ...['forked-truth', 'stillwater-directive', 'project-crown'].flatMap((chapter) =>
    ['01', '02', '03', '04', '05', '06'].map((n) => chapter === 'forked-truth' && n === '03'
      ? 'story-v3/forked-truth/03-v5.webp'
      : `story-v3/${chapter}/${n}.jpg`)),
  ...['01', '02', '03', '04'].map((n) => `story-v4/homeward/homeward-${n}.webp`),
];
const keyframes = Array.from({ length: 5 }, (_, index) => [
  `cinematics/keyframes/scene-0${index + 1}-start.webp`,
  `cinematics/keyframes/scene-0${index + 1}-end.webp`,
]).flat();
const introVideo = 'cinematics/video/aegis-vector-intro-v2.mp4';

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw new Error('JPEG is missing a supported frame header');
}

function webpDimensions(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF'
    || bytes.toString('ascii', 8, 12) !== 'WEBP'
    || bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw new Error('Truncated or malformed WebP container');
  }
  let dimensions;
  let canvasDimensions;
  let imagePayloads = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end + (size & 1) > bytes.length) throw new Error('Truncated WebP chunk');
    if (kind === 'ANIM' || kind === 'ANMF') throw new Error('Story plates must be still WebP images');
    if (kind === 'VP8X') {
      if (size !== 10 || canvasDimensions) throw new Error('Malformed extended WebP header');
      if (bytes[start] & 2) throw new Error('Story plates must not declare animation');
      canvasDimensions = { width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1 };
    } else if (kind === 'VP8 ') {
      if (size < 10 || (bytes[start] & 1) !== 0 || bytes.toString('hex', start + 3, start + 6) !== '9d012a') {
        throw new Error('Malformed WebP keyframe');
      }
      dimensions = { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
      imagePayloads += 1;
    } else if (kind === 'VP8L') {
      if (size < 5 || bytes[start] !== 0x2f) throw new Error('Malformed lossless WebP keyframe');
      const bits = bytes.readUInt32LE(start + 1);
      if ((bits >>> 29) !== 0) throw new Error('Unsupported lossless WebP version');
      dimensions = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      imagePayloads += 1;
    }
    offset = end + (size & 1);
  }
  if (offset !== bytes.length || imagePayloads !== 1 || !dimensions?.width || !dimensions.height) {
    throw new Error('WebP is missing a single complete image payload');
  }
  if (canvasDimensions && (canvasDimensions.width !== dimensions.width || canvasDimensions.height !== dimensions.height)) {
    throw new Error('WebP canvas dimensions do not match its image payload');
  }
  return dimensions;
}

let storyBytes = 0;
for (const relative of [...storyFiles, ...keyframes]) {
  const path = join(root, relative);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size < 8 * 1024) throw new Error(`Missing, empty, or truncated cinematic asset: ${path}`);
  const header = await readFile(path);
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isWebp = header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
  if (relative.endsWith('.jpg') ? !isJpeg : !isWebp) {
    throw new Error(`Cinematic asset format does not match its extension: ${path}`);
  }
  if (relative.startsWith('story-v5/')) {
    const dimensions = webpDimensions(header);
    if (dimensions.width !== 1600 || dimensions.height !== 900) {
      throw new Error(`Cinematic V5 frame must be 1600×900: ${path}`);
    }
  }
  if (relative.startsWith('story-v6/')) {
    const dimensions = webpDimensions(header);
    if (dimensions.width < 1280 || dimensions.height < 720 || Math.abs(dimensions.width / dimensions.height - 16 / 9) > .01) {
      throw new Error(`Route story frame must be at least 720p widescreen: ${path}`);
    }
  }
  if (relative.startsWith('story-v3/')) {
    const dimensions = isJpeg ? jpegDimensions(header) : webpDimensions(header);
    if (dimensions.width !== 1600 || dimensions.height !== 900) {
      throw new Error(`Cinematic V3 frame must be 1600×900: ${path}`);
    }
    if (isJpeg && header.readUInt16BE(header.length - 2) !== 0xffd9) throw new Error(`Truncated JPEG: ${path}`);
  }
  if (relative.startsWith('story/') || relative.startsWith('story-v4/') || relative.startsWith('story-v5/') || relative.startsWith('story-v6/')
    || relative === 'story-v3/forked-truth/03-v5.webp') {
    if (info.size > 320 * 1024) throw new Error(`Story panel exceeds 320KB: ${path} (${info.size} bytes)`);
    storyBytes += info.size;
  } else if (relative.startsWith('story-v2/') || relative.startsWith('story-v3/')) {
    if (info.size > 600 * 1024) throw new Error(`Story panel exceeds 600KB: ${path} (${info.size} bytes)`);
    storyBytes += info.size;
  }
}

if (storyV5Files.length !== 19) throw new Error(`Expected exactly 19 mandatory V5 replacements, mapped ${storyV5Files.length}`);
if (storyFiles.length !== 46) throw new Error(`Expected exactly 46 active story images including route variants, mapped ${storyFiles.length}`);
if (storyBytes > 16 * 1024 * 1024) throw new Error(`Story panel set exceeds 16MiB (${storyBytes} bytes)`);

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
