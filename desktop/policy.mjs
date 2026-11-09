import path from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'aegis';
export const APP_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;
export const SESSION_PARTITION = 'persist:aegis-vector';
export const USER_DATA_DIRECTORY = 'AegisVector';
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "media-src 'self' blob:", "font-src 'self' data:",
  "connect-src 'self'", "worker-src 'none'", "object-src 'none'", "frame-src 'none'",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'none'",
].join('; ');

export const WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  navigateOnDragDrop: false,
  spellcheck: false,
  devTools: false,
  partition: SESSION_PARTITION,
});

/** Check the raw path before URL normalization can remove encoded dot segments. */
export function resolveAssetPath(root, rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 8192) return undefined;
  const match = /^app:\/\/aegis(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/.exec(rawUrl);
  if (!match) return undefined;
  let decoded;
  try { decoded = decodeURIComponent(match[1] ?? '/'); } catch { return undefined; }
  if (/[\\\0-\x1f\x7f:%]/.test(decoded)) return undefined;
  const segments = decoded.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.') || /[. ]$/.test(segment))) return undefined;
  if (segments.some((segment) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) return undefined;
  const assetPath = path.resolve(root, ...(segments.length ? segments : ['index.html']));
  return isWithin(root, assetPath) ? assetPath : undefined;
}

export function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function isAllowedRequest(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'app:' && parsed.hostname === APP_HOST && !parsed.port && !parsed.username && !parsed.password;
  } catch { return false; }
}

/** A single HTTP byte range only; malformed/multipart and unsatisfiable requests fail closed. */
export function parseByteRange(value, size) {
  if (value === null || value === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return null;
  let start = match[1] ? Number(match[1]) : undefined;
  let end = match[2] ? Number(match[2]) : undefined;
  if ((start !== undefined && !Number.isSafeInteger(start)) || (end !== undefined && !Number.isSafeInteger(end))) return null;
  if (start === undefined) {
    if (!end) return null;
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    end = end === undefined ? size - 1 : Math.min(end, size - 1);
  }
  return start >= size || start > end ? null : { start, end };
}

export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
});
