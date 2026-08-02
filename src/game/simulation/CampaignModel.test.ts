import { describe, expect, it } from 'vitest';
import { CampaignModel } from './CampaignModel';
import { GameModel } from './GameModel';
import type { CampaignSnapshot } from './types';

const fundedCampaign = (): CampaignSnapshot => ({
  version: 1,
  phase: 'hangar',
  difficulty: 'pilot',
  missionIndex: 1,
  credits: 500,
  score: 1_000,
  campaignKills: 10,
  weapons: { spread: 2, missile: 1, laser: 0, drone: 0, ion: 0 },
  shieldBaseMax: 2,
  purchased: [],
  respecAvailable: true,
});

describe('CampaignModel', () => {
  it('enforces prerequisites and exclusive sibling choices', () => {
    const campaign = new CampaignModel(fundedCampaign());
    expect(campaign.purchase('split-capacitors')).toEqual({ ok: false, reason: 'locked' });
    expect(campaign.purchase('rapid-cycling').ok).toBe(true);
    expect(campaign.purchase('amplified-munitions')).toEqual({ ok: false, reason: 'locked' });
    expect(campaign.purchase('split-capacitors').ok).toBe(true);
    expect(campaign.snapshot().credits).toBe(340);
  });

  it('refunds all nodes exactly once', () => {
    const campaign = new CampaignModel(fundedCampaign());
    campaign.purchase('rapid-cycling');
    campaign.purchase('split-capacitors');
    expect(campaign.respec()).toBe(true);
    expect(campaign.snapshot().credits).toBe(500);
    expect(campaign.snapshot().purchased).toEqual([]);
    expect(campaign.respec()).toBe(false);
  });

  it('commits only successful mission earnings and carried equipment', () => {
    const campaign = new CampaignModel();
    campaign.startNew('pilot');
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.registerKill(100, 5);
    battle.upgrade('missile');
    battle.complete();
    const state = campaign.completeMission(battle.snapshot());
    expect(state.missionIndex).toBe(1);
    expect(state.credits).toBe(30);
    expect(state.weapons.missile).toBe(1);
    expect(state.lastReport?.creditsEarned).toBe(30);
  });

  it('restores a failed mission to the unchanged pre-mission campaign state', () => {
    const campaign = new CampaignModel(fundedCampaign());
    const before = campaign.snapshot();
    campaign.beginMission();
    campaign.failMission();
    const after = campaign.snapshot();
    expect(after.credits).toBe(before.credits);
    expect(after.score).toBe(before.score);
    expect(after.weapons).toEqual(before.weapons);
    expect(after.phase).toBe('hangar');
  });

  it('exports an in-progress mission as a resumable checkpoint', () => {
    const campaign = new CampaignModel();
    campaign.startNew('ace');
    campaign.beginMission();
    expect(campaign.exportSave().phase).toBe('briefing');
  });

  it('migrates version one campaigns to five-level weapons and ION', () => {
    const legacy = fundedCampaign();
    const campaign = new CampaignModel(legacy);
    expect(campaign.snapshot().version).toBe(2);
    expect(campaign.snapshot().weapons.ion).toBe(0);
    expect(campaign.snapshot().campaignSeed).toBeTypeOf('number');
  });

  it('requires a complete branch before buying a tier-four capstone', () => {
    const campaign = new CampaignModel(fundedCampaign());
    expect(campaign.purchase('prismatic-core')).toEqual({ ok: false, reason: 'locked' });
    campaign.purchase('amplified-munitions');
    campaign.purchase('hunter-logic');
    campaign.purchase('phase-arsenal');
    expect(campaign.purchase('prismatic-core').ok).toBe(true);
  });
});
