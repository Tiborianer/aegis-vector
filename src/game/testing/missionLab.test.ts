import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEAPON_MAX_LEVEL } from '../content/balance';
import { MISSIONS } from '../content/missions';
import { CampaignModel } from '../simulation/CampaignModel';
import { createMissionLabCampaign, isMissionLab, missionLabUrl, readMissionLabOptions, type MissionLabOptions } from './missionLab';

afterEach(() => vi.unstubAllGlobals());

describe('Mission Lab configuration', () => {
  it('opens the lobby with safe defaults and requires an explicit lab flag', () => {
    expect(isMissionLab('?lab=1')).toBe(true);
    for (const query of ['', '?lab=0', '?lab=true', '?debug=1&graphics=1']) expect(isMissionLab(query)).toBe(false);
    expect(readMissionLabOptions('?lab=1')).toEqual({ mission: undefined, difficulty: 'pilot', godMode: true, loadout: 'combat' });
  });

  it.each(MISSIONS.map(({ id }) => id))('validates the independent %s mission selection', (mission) => {
    expect(readMissionLabOptions(`?lab=1&mission=${mission}&god=0&difficulty=ace&loadout=max`))
      .toEqual({ mission, difficulty: 'ace', godMode: false, loadout: 'max' });
  });

  it('rejects unknown values rather than interpreting them as saved settings', () => {
    expect(readMissionLabOptions('?lab=1&mission=constructor&difficulty=extreme&loadout=god&god=no'))
      .toEqual({ mission: undefined, difficulty: 'pilot', godMode: true, loadout: 'combat' });
    expect(readMissionLabOptions('?lab=1&difficulty=cadet&loadout=starter').difficulty).toBe('cadet');
    expect(readMissionLabOptions('?lab=1&difficulty=cadet&loadout=starter').loadout).toBe('starter');
  });

  it('builds a clean lobby URL while preserving deployment subpaths', () => {
    const result = new URL(missionLabUrl('https://example.test/aegis-vector/?story=homeward&quick=1&visuals=classic&shield=hex&ending=1&audioTrack=ending#old'));
    expect(result.origin).toBe('https://example.test');
    expect(result.pathname).toBe('/aegis-vector/');
    expect(result.hash).toBe('');
    expect(Object.fromEntries(result.searchParams)).toEqual({ lab: '1', debug: '1', graphics: '1', god: '1', difficulty: 'pilot', loadout: 'combat' });
  });

  it.each(MISSIONS.map(({ id }) => id))('round-trips selected %s options without inheriting the current run', (mission) => {
    const options: MissionLabOptions = { mission, difficulty: 'cadet', godMode: false, loadout: 'starter' };
    const result = new URL(missionLabUrl('http://127.0.0.1:4176/?lab=1&mission=fortress&god=1&collisionDebug=1', options));
    expect(readMissionLabOptions(result.search)).toEqual(options);
    expect(result.searchParams.has('collisionDebug')).toBe(false);
  });

  it('normalizes malformed runtime options and omits an invalid mission', () => {
    const result = new URL(missionLabUrl('http://127.0.0.1:4176/', {
      mission: 'invalid', difficulty: 'invalid', loadout: 'invalid',
    } as unknown as Partial<MissionLabOptions>));
    expect(readMissionLabOptions(result.search)).toEqual({ mission: undefined, difficulty: 'pilot', godMode: true, loadout: 'combat' });
  });

  it.each(MISSIONS.map(({ id }) => id))('creates an independent launchable %s campaign', (mission) => {
    const snapshot = createMissionLabCampaign({ mission, difficulty: 'ace', godMode: true, loadout: 'combat' });
    expect(snapshot).toMatchObject({ currentMissionId: mission, missionIndex: MISSIONS.findIndex(({ id }) => id === mission),
      campaignSeed: 73101, difficulty: 'ace', credits: 0, score: 0, campaignKills: 0,
      purchased: [], discoveredEnemies: [], seenStoryChapters: [], shieldBaseMax: 2,
      weapons: { spread: 3, missile: 2, laser: 1, drone: 1, ion: 1 },
    });
    for (const key of ['route', 'earlyRoute', 'routeReward', 'sortieModule', 'lastReport', 'activeWaypoint', 'pendingStoryChapter']) {
      expect(snapshot).not.toHaveProperty(key);
    }
    const config = new CampaignModel(snapshot).beginMission();
    expect(config.mission.id).toBe(mission);
    expect(config.campaignSeed).toBe(73101);
    expect(config.debugDurationMs).toBeUndefined();
    expect(config.resumeFrom).toBeUndefined();
  });

  it('keeps starter equipment minimal and maximum equipment within production caps', () => {
    const base: MissionLabOptions & { mission: 'coastal' } = { mission: 'coastal', difficulty: 'pilot', godMode: true, loadout: 'starter' };
    const starter = createMissionLabCampaign(base);
    expect(starter.weapons).toEqual({ spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 });
    expect(starter.shieldBaseMax).toBe(1);
    const max = createMissionLabCampaign({ ...base, loadout: 'max' });
    expect(max.weapons).toEqual(WEAPON_MAX_LEVEL);
    expect(max.weapons).not.toBe(WEAPON_MAX_LEVEL);
    expect(max.shieldBaseMax).toBe(3);
    max.weapons.spread = 1;
    expect(createMissionLabCampaign({ ...base, loadout: 'max' }).weapons.spread).toBe(7);
  });

  it('uses Coastal as the safe model fallback for an unselected lobby', () => {
    expect(createMissionLabCampaign(readMissionLabOptions('?lab=1'))).toMatchObject({ currentMissionId: 'coastal', missionIndex: 0 });
  });

  it('never reads or writes campaign, archive, or high-score storage', () => {
    const getItem = vi.fn(), setItem = vi.fn(), removeItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem, setItem, removeItem });
    const options = { ...readMissionLabOptions('?lab=1&mission=lastLight'), mission: 'lastLight' as const };
    createMissionLabCampaign(options);
    missionLabUrl('http://127.0.0.1:4176/', options);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
