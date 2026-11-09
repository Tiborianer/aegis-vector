import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {} }));
import { createSeraphModules, createSiegeModules, drawSeraphModules, drawSiegeModules } from './bossModulesView';
import { createModularBoss, seraphWingPoint, seraphWingRotation, SERAPH_WINGS, siegeTurretPose } from '../../game/simulation/modularBoss';

function views() {
  const g: Record<string, unknown> = {};
  for (const name of ['clear', 'lineStyle', 'strokeEllipse', 'fillStyle', 'fillCircle', 'lineBetween', 'beginPath', 'arc', 'strokePath']) {
    g[name] = vi.fn(() => g);
  }
  const guns = Array.from({ length: 6 }, () => {
    const gun: Record<string, unknown> = {};
    for (const name of ['setOrigin', 'setPosition', 'setRotation', 'setVisible', 'setDisplaySize']) gun[name] = vi.fn(() => gun);
    return gun;
  });
  const data: Record<string, unknown> = {};
  const container = { setData: (key: string, value: unknown) => { data[key] = value; return container; },
    getData: (key: string) => data[key] };
  let index = 0;
  const scene = { add: { graphics: () => g, image: vi.fn(() => guns[index++]), container: vi.fn(() => container) } };
  return { scene, container, g, guns };
}

describe('Crown turret presentation', () => {
  it('owns six real baked gun images with centered pivots and shared physical pose', () => {
    const { scene, container, g, guns } = views();
    expect(createSiegeModules(scene as never)).toBe(container);
    expect(scene.add.container).toHaveBeenCalledWith(0, 0, [g, ...guns]);
    expect(scene.add.image).toHaveBeenCalledTimes(6);
    expect(scene.add.image).toHaveBeenCalledWith(0, 0, 'crown-turret');
    const state = createModularBoss(1000);
    state.turrets.forEach((turret, index) => { turret.rotation = (index - 2.5) * .2; });
    drawSiegeModules(container as never, state, 1000, true);
    guns.forEach((gun, index) => {
      const pose = siegeTurretPose(index, state.turrets[index].rotation, 260, 210);
      expect(gun.setOrigin).toHaveBeenCalledWith(.5);
      expect(gun.setDisplaySize).toHaveBeenCalledWith(48, 48);
      expect(gun.setPosition).toHaveBeenLastCalledWith(pose.x, pose.y);
      expect(gun.setRotation).toHaveBeenLastCalledWith(pose.rotation);
      expect(gun.setVisible).toHaveBeenLastCalledWith(true);
      pose.muzzles.forEach((muzzle) => expect(g.fillCircle).toHaveBeenCalledWith(muzzle.x, muzzle.y, 2.4));
    });
    state.turrets[3].health = 0;
    drawSiegeModules(container as never, state, 1100, false);
    expect(guns[3].setVisible).toHaveBeenLastCalledWith(false);
    expect(guns.filter((_, index) => index !== 3).every((gun) => vi.mocked(gun.setVisible as ReturnType<typeof vi.fn>).mock.lastCall?.[0])).toBe(true);
  });
});

describe('Eclipse Seraph presentation', () => {
  it('selects coherent procedural wings in Classic/fallback mode even when baked PNGs are loaded', () => {
    const { scene, container, guns } = views();
    expect(createSeraphModules(scene as never, false)).toBe(container);
    drawSeraphModules(container as never, 2100, false);
    SERAPH_WINGS.forEach((wing, index) => {
      expect(scene.add.image).toHaveBeenCalledWith(wing.hinge[0], wing.hinge[1], `classic-${wing.textureKey}`);
      expect(scene.add.image).not.toHaveBeenCalledWith(wing.hinge[0], wing.hinge[1], wing.textureKey);
      expect(guns[index].setOrigin).toHaveBeenCalledWith(...wing.origin);
      expect(guns[index].setRotation).toHaveBeenLastCalledWith(seraphWingRotation(index, 2100));
    });
  });
  it('owns two approved baked wing meshes with physical hinge origins and exact muzzle warnings', () => {
    const { scene, container, g, guns } = views();
    expect(createSeraphModules(scene as never)).toBe(container);
    expect(scene.add.container).toHaveBeenCalledWith(0, 0, [guns[0], guns[1], g]);
    expect(scene.add.image).toHaveBeenCalledTimes(2);
    drawSeraphModules(container as never, 2100, true);
    SERAPH_WINGS.forEach((wing, index) => {
      expect(scene.add.image).toHaveBeenCalledWith(wing.hinge[0], wing.hinge[1], wing.textureKey);
      expect(guns[index].setOrigin).toHaveBeenCalledWith(...wing.origin);
      expect(guns[index].setDisplaySize).toHaveBeenCalledWith(320, 164);
      expect(guns[index].setRotation).toHaveBeenLastCalledWith(seraphWingRotation(index, 2100));
      const muzzle = seraphWingPoint(index, { x: wing.muzzle[0], y: wing.muzzle[1] }, 2100);
      expect(g.fillCircle).toHaveBeenCalledWith(muzzle.x, muzzle.y, 2.1);
    });
    vi.mocked(g.fillCircle as ReturnType<typeof vi.fn>).mockClear();
    drawSeraphModules(container as never, 2500, false);
    expect(g.fillCircle).not.toHaveBeenCalled();
  });
});
