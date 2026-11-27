import { describe, expect, it } from 'vitest';
import { COMMON_CRAFT } from './fleetArt';
import { breakupSample, selectBreakup, type BreakupIndex } from './formationBreakups';

const contacts = { edge: [.8, 0], drive: [.45, -.7], spine: [0, .2], distant: [2, 0] } as const;
const order = {
  scout: ['edge','drive','spine'], interceptor: ['drive','edge','spine'], bomber: ['edge','drive','spine'],
  charger: ['edge','drive','spine'], sniper: ['spine','edge','drive'],
};
describe.each(COMMON_CRAFT)('%s breakup selection', kind => {
  for (const [zone, [x,y]] of Object.entries(contacts)) {
    it('biases '+zone+' impacts and reduces repeats on either side', () => {
      for (const side of [-1,1]) {
        const count = (previous?: BreakupIndex) => {
          const totals = [0,0,0];
          for(let id=1;id<=4096;id++)
            totals[selectBreakup(kind,side*x,y,previous,breakupSample(18265,id))]++;
          return totals.map(n=>n/4096);
        };
        const base = count();
        for(const i of [0,1,2] as const){
          const expected = zone==='distant' ? 1/3 : order[kind][i]===zone ? .68 : .16;
          expect(base[i]).toBeCloseTo(expected,1);
          const repeat = count(i)[i];
          expect(repeat).toBeGreaterThan(0);
          expect(repeat).toBeLessThan(base[i]*.58);
        }
      }
    });
  }
});
