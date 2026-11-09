import path from 'node:path';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { CONTENT_SECURITY_POLICY, MIME_TYPES, isWithin, parseByteRange, resolveAssetPath } from './policy.mjs';

/** Stream packaged assets directly; range requests never read the complete intro into memory. */
export function createAssetHandler(assetRoot) {
  return async (request) => {
    const headers = new Headers({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer', 'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    const fail = (status) => new Response(null, { status, headers });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('Allow', 'GET, HEAD');
      return fail(405);
    }
    const requestedPath = resolveAssetPath(assetRoot, request.url);
    if (!requestedPath) return fail(403);
    const contentType = MIME_TYPES[path.extname(requestedPath).toLowerCase()];
    if (!contentType) return fail(404);
    try {
      // Also prevent a packaged symlink from leaving the allowlisted dist directory.
      const [root, file] = await Promise.all([realpath(assetRoot), realpath(requestedPath)]);
      if (!isWithin(root, file)) return fail(403);
      const info = await stat(file);
      if (!info.isFile()) return fail(404);
      const range = parseByteRange(request.headers.get('range'), info.size);
      if (range === null) {
        headers.set('Content-Range', `bytes */${info.size}`);
        return fail(416);
      }
      const start = range?.start ?? 0, end = range?.end ?? info.size - 1;
      headers.set('Content-Type', contentType);
      headers.set('Content-Length', String(range ? end - start + 1 : info.size));
      if (range) headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
      const status = range ? 206 : 200;
      if (request.method === 'HEAD' || info.size === 0) return new Response(null, { status, headers });
      const stream = createReadStream(file, { start, end });
      const abort = () => stream.destroy();
      request.signal?.addEventListener('abort', abort, { once: true });
      stream.once('close', () => request.signal?.removeEventListener('abort', abort));
      return new Response(Readable.toWeb(stream), { status, headers });
    } catch (error) {
      return fail(error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? 404 : 500);
    }
  };
}
