import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../../public/graphics-v2/manifest.json';
import { BANK_ANGLES, bankFrame, cloudLayerVisibility, currentVisualStyle, easeBank, environmentAsset, ENVIRONMENT_IDS, forwardSurfaceFrame, isGraphicsPreview, NEUTRAL_BANK, resolveVisualStyle, SHIP_SIZES, SURFACE_SEAM_BLEND_FRACTION, visualLateralSpeed, wrappedPlaneY } from './visuals';
import { FORTRESS_PLATFORMS, STRUCTURE_CLEAR_CORRIDOR, STRUCTURE_OPACITY, STRUCTURE_SPEED_PX_PER_SECOND, STRUCTURE_TILE_HEIGHT, structuralGapFractionLowerBound, structuralPlaneEnabled } from './structuralPlane';
import { MISSIONS } from '../content/missions';
import { ENEMIES } from '../content/balance';

afterEach(() => vi.unstubAllGlobals());

describe('approved dimensional graphics', () => {
  it('keeps all missions and every enemy kind covered', () => {
    expect(ENVIRONMENT_IDS).toEqual(MISSIONS.map((mission) => mission.id));
    expect(Object.keys(SHIP_SIZES).sort()).toEqual([...Object.keys(ENEMIES), 'player', 'drone', 'droneMk2'].sort());
  });
  it('keeps the approved artwork even for stale Classic links and saved preferences', () => {
    expect(resolveVisualStyle('?visuals=classic', 'dimensional')).toBe('dimensional');
    expect(resolveVisualStyle('?visuals=dimensional', 'classic')).toBe('dimensional');
    expect(resolveVisualStyle('', 'classic')).toBe('dimensional');
    expect(resolveVisualStyle('?visuals=classic', 'classic')).toBe('dimensional');
    expect(resolveVisualStyle('?visuals=invalid')).toBe('dimensional');
  });
  it('does not read or mutate preferences or campaign storage to select artwork', () => {
    const getItem = vi.fn(() => 'classic'), setItem = vi.fn();
    vi.stubGlobal('window', { location: { search: '?visuals=classic' } });
    vi.stubGlobal('localStorage', { getItem, setItem });
    expect(currentVisualStyle()).toBe('dimensional');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
  it('isolates the Mission Lab lobby and legacy explicit art reviews', () => {
    expect(isGraphicsPreview('?graphics=1')).toBe(false);
    expect(isGraphicsPreview('?debug=1')).toBe(false);
    expect(isGraphicsPreview('?lab=1')).toBe(true);
    expect(isGraphicsPreview('?lab=1&mission=aurora&god=1')).toBe(true);
    expect(isGraphicsPreview('?lab=0')).toBe(false);
    expect(isGraphicsPreview('?lab=true')).toBe(false);
    expect(isGraphicsPreview('')).toBe(false);
    expect(isGraphicsPreview('?debug=1&graphics=1&mission=coastal')).toBe(true);
  });
  it('quantizes 16 real angles with a stable neutral bank', () => {
    expect(bankFrame(0)).toBe(NEUTRAL_BANK);
    expect(bankFrame(NaN)).toBe(NEUTRAL_BANK);
    expect(bankFrame(-100)).toBe(0);
    expect(bankFrame(100)).toBe(15);
    BANK_ANGLES.forEach((angle,index) => expect(bankFrame(angle)).toBe(index));
  });
  it('eases view state independently of framerate without overshooting', () => {
    expect(easeBank(0,36,100)).toBeCloseTo(easeBank(easeBank(0,36,50),36,50),10);
    expect(easeBank(0,36,16)).toBeGreaterThan(0);
    expect(easeBank(0,36,16)).toBeLessThan(36);
    expect(easeBank(5,36,-5)).toBe(5);
  });
  it('banks scripted-position craft without changing their movement state', () => {
    expect(visualLateralSpeed(600,602,20,0)).toBe(100);
    expect(visualLateralSpeed(602,600,20,0)).toBe(-100);
    expect(visualLateralSpeed(undefined,600,20,230)).toBe(230);
    expect(visualLateralSpeed(0,600,0,230)).toBe(230);
    expect(visualLateralSpeed(0,600,20,230)).toBe(430);
  });
  it('keeps scrolling physical planes adjacent across two complete wraps', () => {
    const height = 1380;
    for (let offset = 0; offset < height*4; offset += 11) {
      const y = [wrappedPlaneY(offset,height,0),wrappedPlaneY(offset,height,1)].sort((a,b) => a-b);
      expect(y[1]-y[0]).toBeCloseTo(height,8);
      expect(y[0]).toBeLessThanOrEqual(0);
      expect(y[1]+height).toBeGreaterThanOrEqual(720);
    }
  });
  it('keeps authored scenery upright across repeated forward-overlap wraps', () => {
    expect(SURFACE_SEAM_BLEND_FRACTION).toBe(.10);
    for (const height of [1380, 1640, 2180]) {
      for (let offset = -height * 2; offset < height * 4; offset += 37) {
        const frames = [0,1].map((index) => forwardSurfaceFrame(offset, height, index)).sort((a,b) => a.y-b.y);
        expect(frames.every((frame) => frame.flipY === false)).toBe(true);
        expect(frames[1].y-frames[0].y).toBeCloseTo(height * .9, 7);
        expect(frames[0].y+height-frames[1].y).toBeCloseTo(height * .1, 7);
        expect(frames[0].y).toBeLessThanOrEqual(0);
        expect(frames[1].y+height).toBeGreaterThanOrEqual(720);
        expect(frames[1].depthOffset).toBeGreaterThan(frames[0].depthOffset);
      }
    }
  });
  it('accentuates clouds without allowing dense-fire foreground washout', () => {
    expect(cloudLayerVisibility('coastal', 'high', 0)).toEqual({ atmosphere: .4, foreground: .22 });
    expect(cloudLayerVisibility('stormbreak', 'high', 0).atmosphere).toBe(.48);
    expect(cloudLayerVisibility('graveyard', 'high', 0).atmosphere).toBe(.30);
    expect(cloudLayerVisibility('fortress', 'high', 1).foreground).toBeCloseTo(.066);
    expect(cloudLayerVisibility('fortress', 'high', 1).atmosphere).toBeCloseTo(.36);
    expect(cloudLayerVisibility('fortress', 'low', 0).foreground).toBe(0);
    expect(cloudLayerVisibility('fortress', 'high', -1)).toEqual(cloudLayerVisibility('fortress', 'high', 0));
    expect(cloudLayerVisibility('fortress', 'high', 2)).toEqual(cloudLayerVisibility('fortress', 'high', 1));
    expect(cloudLayerVisibility('fortress', 'high', NaN)).toEqual(cloudLayerVisibility('fortress', 'high', 0));
    expect(cloudLayerVisibility('lastLight', 'high', 0)).toEqual({ atmosphere: 0, foreground: 0 });
  });
  it('matches packaged frame dimensions, keeping native physics footprints', () => {
    for(const [kind,[width,height]] of Object.entries(SHIP_SIZES)) {
      expect(manifest.ships[kind as keyof typeof manifest.ships]).toMatchObject({ width, height, frameCount:16, neutralFrame:7, angles:[...BANK_ANGLES] });
    }
    ENVIRONMENT_IDS.forEach((id) => expect(manifest.environments[id].width).toBeGreaterThanOrEqual(1024));
  });
  it('retains a compatibility preload alias while the finale uses native asteroid scenery', () => {
    expect(environmentAsset('lastLight')).toBe(environmentAsset('dreadnought'));
    expect(manifest.environments.lastLight).toMatchObject({
      aliasOf: 'dreadnought', file: manifest.environments.dreadnought.file,
      sha256: manifest.environments.dreadnought.sha256,
    });
    for (const kind of ['skimmer','weaver','seraph','nullArchitect'] as const) {
      expect(manifest.ships[kind].frameCount).toBe(16);
      expect(manifest.ships[kind].source).toBe(`assets/graphics-v2/models/${kind}.glb`);
    }
  });
  it('keeps the sparse structural prototype exclusive to fortress and easy to compare', () => {
    expect(structuralPlaneEnabled('fortress')).toBe(true);
    expect(structuralPlaneEnabled('fortress','?structuralPlane=off')).toBe(false);
    expect(structuralPlaneEnabled('fortress','?structuralPlane=on')).toBe(true);
    for (const id of ENVIRONMENT_IDS.filter((id) => id !== 'fortress')) expect(structuralPlaneEnabled(id)).toBe(false);
  });
  it('uses isolated opaque maintenance docks while leaving over ninety percent empty', () => {
    expect(structuralGapFractionLowerBound()).toBeGreaterThan(.90);
    expect(STRUCTURE_OPACITY).toBe(1);
    expect(STRUCTURE_SPEED_PX_PER_SECOND).toBeGreaterThan(28);
    expect(STRUCTURE_SPEED_PX_PER_SECOND).toBeLessThan(47);
    expect(FORTRESS_PLATFORMS.filter((platform) => platform.side === 'left')).toHaveLength(2);
    expect(FORTRESS_PLATFORMS.filter((platform) => platform.side === 'right')).toHaveLength(2);
    expect(STRUCTURE_CLEAR_CORRIDOR.right - STRUCTURE_CLEAR_CORRIDOR.left).toBe(680);
    for (const platform of FORTRESS_PLATFORMS) {
      expect(platform.outline.length).toBeGreaterThan(6);
      const xs = platform.outline.map((point) => point.x);
      expect(Math.max(...xs) < STRUCTURE_CLEAR_CORRIDOR.left || Math.min(...xs) > STRUCTURE_CLEAR_CORRIDOR.right).toBe(true);
      expect(Math.max(...xs)-Math.min(...xs)).toBeGreaterThan(50);
      const ys = platform.outline.map((point) => point.y);
      expect(Math.max(...ys)-Math.min(...ys)).toBeLessThan(260);
      expect(Math.min(...ys)).toBeGreaterThan(0);
      expect(Math.max(...ys)).toBeLessThan(STRUCTURE_TILE_HEIGHT);
    }
    for (let offset=0;offset<STRUCTURE_TILE_HEIGHT*4;offset+=13) {
      const positions=[0,1].map((index)=>wrappedPlaneY(offset,STRUCTURE_TILE_HEIGHT,index)).sort((a,b)=>a-b);
      expect(positions[1]-positions[0]).toBeCloseTo(STRUCTURE_TILE_HEIGHT,8);
      expect(positions[0]).toBeLessThanOrEqual(0);
      expect(positions[1]+STRUCTURE_TILE_HEIGHT).toBeGreaterThanOrEqual(720);
    }
  });
});
