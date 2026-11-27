import type { CommonCraft } from './fleetArt';

export type BreakupIndex = 0 | 1 | 2;
type HitArea = 'edge' | 'drive' | 'spine';
type Path = readonly [release: number, dx: number, dy: number, spin: number, roll: number];
type Cue = readonly [time: number, part: number, color: 'fire' | 'ion' | 'field', size: number];
export interface Fracture { name: string; duration: number; paths: readonly Path[]; cues: readonly Cue[] }
interface Shot { original: string; zones: readonly [HitArea, HitArea, HitArea]; cuts: readonly [Fracture, Fracture] }

// Seven mesh groups, in the order struck wing, other wing, struck pod/drive,
// other pod/drive, forebody, struck aft keel, opposite aft keel. Durations are seconds.
// A positive horizontal speed is towards the struck side of the ship.
export const FORMATION_SHOTS: Record<CommonCraft, Shot> = {
  scout: { original: 'Wing-root breach', zones: ['edge','drive','spine'], cuts: [
    { name: 'Tailwheel', duration: .91, paths: [
      [.14,28,2,2.1,4],[.27,-18,-7,-1,3],[0,68,-59,5,7],[.24,-26,-24,-2,6],
      [.25,-14,42,-1.4,2],[.13,29,-38,3,7],[.24,-19,-17,-1,4]],
      cues: [[.01,2,'ion',.37],[.22,5,'fire',.29]] },
    { name: 'Keel scissors', duration: .98, paths: [
      [.18,52,16,3.8,4],[.18,-52,16,-3.8,4],[.10,25,-38,2,6],[.10,-25,-38,-2,6],
      [.02,2,69,.4,2],[.04,29,-10,3.4,3],[.04,-29,-10,-3.4,3]],
      cues: [[0,4,'field',.29],[.15,5,'fire',.30]] },
  ]},
  interceptor: { original: 'Nacelle seam rupture', zones: ['drive','edge','spine'], cuts: [
    { name: 'Flank spar peel', duration: 1.13, paths: [
      [0,103,18,5.8,6],[.34,-29,31,-1.2,3],[.12,64,-37,4,8],[.33,-12,-19,-1,4],
      [.31,-4,54,-.5,2],[.18,49,-4,3.6,5],[.35,-18,-17,-1.1,2]],
      cues: [[0,0,'fire',.33],[.26,2,'ion',.31]] },
    { name: 'Cockpit ejection', duration: 1.06, paths: [
      [.25,41,-13,2,3],[.31,-37,-8,-1.5,4],[.27,40,-47,2.7,4],[.31,-32,-37,-2,5],
      [0,-5,109,-1.1,4],[.18,22,-18,1.7,2],[.18,-21,-18,-1.7,2]],
      cues: [[.01,4,'field',.25],[.23,6,'fire',.4]] },
  ]},
  bomber: { original: 'Pod mount breach', zones: ['edge','drive','spine'], cuts: [
    { name: 'Drive burnout', duration: 1.46, paths: [
      [.41,34,15,1.1,2],[.51,-27,12,-.8,2],[.03,55,-69,3.7,7],[.37,-32,-53,-2,6],
      [.46,-12,32,-.52,2],[.26,22,-29,1.8,4],[.43,-18,-17,-1.1,3]],
      cues: [[0,2,'ion',.46],[.25,2,'fire',.52],[.47,3,'ion',.38]] },
    { name: 'Fuselage split', duration: 1.4, paths: [
      [.22,61,10,2.4,3],[.22,-61,10,-2.4,3],[.32,71,-21,3.5,6],[.32,-71,-21,-3.5,6],
      [.12,1,44,.25,1],[.01,40,-16,1.7,2],[.01,-40,-16,-1.7,2]],
      cues: [[.01,5,'fire',.43],[.16,4,'fire',.42],[.36,2,'fire',.3]] },
  ]},
  charger: { original: 'Leading-edge tear', zones: ['edge','drive','spine'], cuts: [
    { name: 'Twin-drive kickback', duration: 1.02, paths: [
      [.29,28,31,2.1,4],[.29,-28,31,-2.1,4],[0,45,-89,4.6,8],[.09,-41,-83,-4.2,8],
      [.23,1,69,.35,2],[.19,22,-22,2.5,4],[.19,-22,-22,-2.5,4]],
      cues: [[0,2,'ion',.38],[.09,3,'ion',.38],[.25,5,'fire',.28]] },
    { name: 'Dive-spine shear', duration: .92, paths: [
      [.17,55,-5,3.4,6],[.27,-47,-11,-2.7,4],[.18,33,-29,3,6],[.28,-31,-34,-2,6],
      [0,4,116,.5,3],[.09,23,7,2.3,4],[.16,-18,-3,-2.1,3]],
      cues: [[.01,4,'fire',.28],[.19,6,'ion',.32]] },
  ]},
  sniper: { original: 'Capacitor rupture', zones: ['spine','edge','drive'], cuts: [
    { name: 'Spotter wing release', duration: 1.13, paths: [
      [0,87,-8,5.7,5],[.40,-21,7,-.7,2],[.12,44,-33,3,6],[.38,-19,-24,-1,3],
      [.32,-14,35,-.8,3],[.29,31,-10,2.2,4],[.39,-16,-7,-1,3]],
      cues: [[0,0,'field',.33],[.29,4,'fire',.36]] },
    { name: 'Breech backfire', duration: 1.21, paths: [
      [.3,39,19,2,3],[.3,-39,19,-2,3],[.03,34,-49,2.8,6],[.13,-31,-45,-2.5,6],
      [.19,0,91,.3,3],[.06,24,-27,2.3,5],[.16,-21,-21,-1.7,4]],
      cues: [[0,2,'ion',.42],[.16,4,'field',.32],[.28,5,'fire',.25]] },
  ]},
};

export function selectBreakup(kind: CommonCraft, localX: number, localY: number, previous: BreakupIndex | undefined, random: number): BreakupIndex {
  // Coordinates are relative to the visible half-span/nose length. Very distant contact is an area effect.
  const zone: HitArea | undefined = Math.max(Math.abs(localX), Math.abs(localY)) > 1.7 ? undefined
    : localY < -.20 && Math.abs(localX) > .16 ? 'drive' : Math.abs(localX) > .37 ? 'edge' : 'spine';
  const weights = FORMATION_SHOTS[kind].zones.map((area, i) => (zone === area ? 4.25 : 1) * (i === previous ? .22 : 1));
  let roll = random * weights.reduce((sum, n) => sum+n, 0);
  for (const [i, weight] of weights.entries()) {
    roll -= weight;
    if (roll < 0) return i as BreakupIndex;
  }
  return 2;
}

/** A cosmetic sample based on the host's stable entity ID never consumes encounter or reward randomness. */
export function breakupSample(seed: number, entity: number): number {
  let x = seed ^ Math.imul(entity, 0x9e3779b1);
  x = Math.imul(x ^ x >>> 16, 0x85ebca6b);
  x = Math.imul(x ^ x >>> 13, 0xc2b2ae35);
  return ((x ^ x >>> 16) >>> 0) / 0x100000000;
}
