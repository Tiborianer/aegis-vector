import { describe, expect, it } from 'vitest';
import { publicAssetUrl } from './publicAsset';

describe('publicAssetUrl', () => {
  it('never emits a host-root URL that breaks GitHub Pages subpaths', () => {
    expect(publicAssetUrl('/ui/upgrades/rapid-cycling.png')).toBe('./ui/upgrades/rapid-cycling.png');
    expect(publicAssetUrl('ui/upgrades/rapid-cycling.png')).not.toMatch(/^\/ui\//);
  });
});
