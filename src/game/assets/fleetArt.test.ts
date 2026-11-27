import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCombatModifiers } from '../content/upgrades';
import { COMMON_CRAFT, HARDPOINTS, PAINT, equipmentRows, equipmentStage, missionPaint } from './fleetArt';
import { FORMATION_SHOTS, breakupSample, selectBreakup } from './formationBreakups';

const read = (file: string) => JSON.parse(readFileSync('public/graphics-v2/roadmap/' + file, 'utf8'));
describe('installed Kestrel equipment', () => {
  it('starts a new visual stage only at ranks one, three and five', () => {
    expect([0,1,2,3,4,5,6,7].map(equipmentStage)).toEqual([0,1,1,2,2,3,3,3]);
    const levels = {spread:7, missile:5, drone:2, laser:4, ion:0} as const;
    expect(equipmentRows(levels, 2, buildCombatModifiers(['overdrive-reactor']))).toEqual([2,4,8,9,15,16]);
    expect(equipmentRows({...levels,spread:0,missile:0,drone:0,laser:0}, 1, buildCombatModifiers([]))).toEqual([]);
    expect(HARDPOINTS).toHaveLength(5);
  });
});
describe('formation paint and destruction', () => {
  it('gives independent branch destinations distinct marked squadrons', () => {
    expect(missionPaint('minefield')).not.toBe(missionPaint('aurora'));
    expect(missionPaint('stormbreak')).not.toBe(missionPaint('graveyard'));
    expect(missionPaint('coastal')).toBe('patrol');
  });
  it('covers seven authentic assemblies at every banking angle in all three paint schemes', () => {
    const atlas=read('formation-parts.json');
    for (const kind of COMMON_CRAFT) {
      const shots=FORMATION_SHOTS[kind];
      expect(new Set([shots.original,...shots.cuts.map(c=>c.name)]).size).toBe(3);
      for (const cut of shots.cuts) {
        expect(cut.paths).toHaveLength(7);
        expect(cut.cues.length).toBeGreaterThanOrEqual(2);
      }
      for (let bank=0;bank<16;bank++) for (let part=0;part<7;part++) {
        expect(atlas.meta.anchors[`${kind}/${bank}/${part}`]).toHaveLength(2);
        for (const paint of PAINT) expect(atlas.frames[`${kind}/${paint}/${bank}/${part}`].frame.w).toBeGreaterThan(0);
      }
    }
  });
  it('biases the final contact, de-emphasizes the last cut, and keeps cosmetic selection reproducible', () => {
    const sample=(x:number,y:number,previous?:0|1|2) => {
      const counts=[0,0,0];
      for(let i=0;i<1000;i++) counts[selectBreakup('bomber',x,y,previous,breakupSample(73,i))]++;
      return counts;
    };
    const port=sample(-.85,.12), drive=sample(-.52,-.7), spine=sample(.12,.46);
    expect(port[0]).toBeGreaterThan(600);
    expect(drive[1]).toBeGreaterThan(600);
    expect(spine[2]).toBeGreaterThan(600);
    expect(sample(-.85,.12,0)[0]).toBeLessThan(400);
    expect(port).toEqual(sample(-.85,.12));
  });
});
