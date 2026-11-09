import { describe, expect, it } from 'vitest';
import { getMissionById, MISSIONS, nextMissionId, routeMissionId } from './missions';

describe('Dreadnought approach', () => {
  it('starts with a thirty-second escort before the boss soundtrack transition', () => {
    const finale = getMissionById('dreadnought');
    expect(finale.durationMs).toBe(150_000);
    expect(finale.approachDurationMs).toBe(30_000);
    expect(finale.music).toBe('mission-dreadnought');
    expect(finale.finale).toBe(true);
  });

  it('continues beyond the Dreadnought into a two-boss final mission', () => {
    const finale = getMissionById('lastLight');
    expect(finale.number).toBe(7);
    expect(finale.title).toBe('LAST LIGHT');
    expect(finale.approachDurationMs).toBe(35_000);
    expect(finale.finale).toBe(true);
    expect(finale.briefing).toContain('Obsidian Crown');
    expect(finale.newThreats).toContain('OBSIDIAN CROWN // SIX-GUN COMMAND CRAFT');
    expect(`${finale.briefing} ${finale.newThreats.join(' ')}`).not.toMatch(/Null Architect|cathedral core/i);
    expect(nextMissionId('dreadnought')).toBe('lastLight');
    expect(nextMissionId('lastLight')).toBe('victory');
    expect(new Set(MISSIONS.map(({ id }) => id)).size).toBe(MISSIONS.length);
    expect(new Set(MISSIONS.map(({ music }) => music)).size).toBe(MISSIONS.length);
  });

  it('keeps both independent forks converging before the two finale missions', () => {
    for (const route of ['storm', 'salvage'] as const) {
      expect(nextMissionId('coastal')).toBe('route');
      expect(nextMissionId('coastal', route)).toBe('route');
      expect(nextMissionId('coastal', undefined, route)).toBe(routeMissionId(route));
      expect(nextMissionId('fortress', undefined, route)).toBe('route');
      expect(nextMissionId(routeMissionId(route), route)).toBe('fortress');
      expect(nextMissionId('fortress', route)).toBe(routeMissionId(route, 'fortress'));
      expect(nextMissionId(routeMissionId(route, 'fortress'), route)).toBe('carrierSiege');
      expect(nextMissionId('carrierSiege', route)).toBe('dreadnought');
      expect(nextMissionId('dreadnought', route)).toBe('lastLight');
      expect(nextMissionId('lastLight', route)).toBe('victory');
    }
  });

  it('offers equal-length level-two alternatives and a new choice after Fortress', () => {
    expect(routeMissionId('salvage')).toBe('minefield');
    expect(routeMissionId('storm')).toBe('aurora');
    expect(nextMissionId('fortress')).toBe('route');
    const aurora = getMissionById('aurora');
    expect(aurora.number).toBe(2);
    expect(aurora.durationMs).toBe(getMissionById('minefield').durationMs);
    expect(aurora.music).toBe('mission-aurora');
    expect(aurora.newThreats).toHaveLength(2);
  });
});
