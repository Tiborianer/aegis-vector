import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRoomServer } from './rooms.mjs';
const relay = process.argv.includes('--relay'),
  local = process.argv.includes('--local'),
  internet = process.argv.includes('--internet');
const base = fileURLToPath(new URL('../../', import.meta.url));
const root = relay ? undefined : path.resolve(process.env.AEGIS_WEB_DIR || path.join(base, 'web-dist'));
if (root)
  await stat(path.join(root, 'release.json')).catch(() => {
    throw Error(
      'Build and stage the game with npm run build and npm run web:stage, or set AEGIS_WEB_DIR to a staged release.',
    );
  });
const origins = (process.env.AEGIS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
if (
  (relay || internet) &&
  (!origins.length ||
    origins.some((o) => {
      try {
        const u = new URL(o);
        return u.protocol !== 'https:' || u.origin !== o;
      } catch {
        return true;
      }
    }))
)
  throw Error('Set AEGIS_ALLOWED_ORIGINS to the exact HTTPS game origin.');
const port = Number(process.env.PORT || 4188),
  host = process.env.AEGIS_BIND || (relay || internet ? '127.0.0.1' : '0.0.0.0');
const address =
  process.env.AEGIS_LAN_ADDRESS ||
  Object.values(networkInterfaces())
    .flat()
    .find(
      (a) => a?.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address),
    )?.address;
const lanBase = !relay && !internet && address ? 'http://' + address + ':' + port + '/' : undefined;
const cert = process.env.AEGIS_TLS_CERT,
  key = process.env.AEGIS_TLS_KEY;
if (Boolean(cert) !== Boolean(key)) throw Error('Set both TLS file paths or terminate TLS at the reverse proxy.');
const tls = cert && key ? { cert: await readFile(cert), key: await readFile(key) } : undefined;
const scope = local ? 'local' : relay || internet ? 'internet' : 'lan';
const service = createRoomServer({ root, origins, lanBase, tls, scope });
function openHost() {
  const url = 'http://127.0.0.1:' + port + (local ? '/#two-pilots' : '/#host');
  console.log('Host game: ' + url);
  if (!process.argv.includes('--open')) return;
  const cmd = process.platform === 'win32' ? 'rundll32' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(cmd, process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url], {
    stdio: 'ignore',
    detached: true,
  });
  child.on('error', () => {});
  child.unref();
}
service.http.on('error', async (error) => {
  if (error.code === 'EADDRINUSE' && !relay && !internet) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/coop/config', {
        signal: AbortSignal.timeout(1500),
      });
      const config = await response.json();
      if (config.game === 'aegis-vector' && config.scope === scope && config.protocol === 1) {
        openHost();
        return;
      }
    } catch {
      /* Another application may own the port. */
    }
  }
  console.error(error.message);
  process.exitCode = 1;
});
service.http.listen(port, host, () => {
  console.log(
    relay || internet
      ? 'Private room service listening on ' + host + ':' + port
      : (local ? 'Shared-keyboard game ready.' : 'LAN host ready.') + ' Leave this window open.',
  );
  if (!relay && !internet) {
    if (!local && host !== '127.0.0.1')
      for (const adapters of Object.values(networkInterfaces()))
        for (const a of adapters || [])
          if (a.family === 'IPv4' && !a.internal)
            console.log('Guest game address: http://' + a.address + ':' + port + '/');
    openHost();
  }
});
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => void service.close());
