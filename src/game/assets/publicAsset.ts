export function publicAssetUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  const configuredBase = import.meta.env.BASE_URL || './';
  const base = configuredBase === '/' ? './' : configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
  return `${base}${clean}`;
}
