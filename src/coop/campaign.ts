import { CampaignModel } from '../game/simulation/CampaignModel';
import { buildCombatModifiers } from '../game/content/upgrades';
import type {
  CampaignRoute,
  CampaignSnapshot,
  Difficulty,
  GameSnapshot,
  MissionStartConfig,
  MissionWaypointSnapshot,
  UpgradeType,
  WeaponLevels,
} from '../game/simulation/types';

export type Seat = 0 | 1;
export type Pair<T> = [T, T];
export type Kit = 'precision' | 'coverage';
export type Offer = [UpgradeType, UpgradeType];
export type PilotOffers = Pair<Offer[]>;
export const SEATS: readonly Seat[] = [0, 1];
const upgrades: UpgradeType[] = ['spread', 'laser', 'missile', 'drone', 'ion', 'shield'];
export interface PilotStatus {
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  emp: number;
  empMax: number;
  shieldBaseMax: number;
  down: boolean;
  rescueAvailable: boolean;
  rescueMs: number;
  x: number;
  y: number;
  weapons: WeaponLevels;
  shots: number;
}
export interface SquadStatus {
  pilots: Pair<PilotStatus>;
  offers: PilotOffers;
}
export interface SquadSave {
  version: 1;
  pilots: Pair<CampaignSnapshot>;
  offers: PilotOffers;
  checkpointOffers: PilotOffers;
}

/** One transaction contains both seats. CampaignModel retains the authored route, store and retry rules. */
export class SquadCampaign {
  private constructor(
    readonly pilots: Pair<CampaignModel>,
    public offers: PilotOffers,
    private checkpointOffers: PilotOffers,
  ) {}
  static fresh(difficulty: Difficulty, kits: Pair<Kit>): SquadCampaign {
    const base = CampaignModel.fresh(difficulty);
    const pilot = (kit: Kit) =>
      new CampaignModel({
        ...base,
        weapons: { ...base.weapons, laser: kit === 'precision' ? 1 : 0, drone: kit === 'coverage' ? 1 : 0 },
      });
    return new SquadCampaign([pilot(kits[0]), pilot(kits[1])], [[], []], [[], []]);
  }
  static restore(value: unknown): SquadCampaign | undefined {
    if (!value || typeof value !== 'object') return;
    const raw = value as Partial<SquadSave>;
    if (raw.version !== 1 || !Array.isArray(raw.pilots) || raw.pilots.length !== 2) return;
    const [a, b] = raw.pilots.map(CampaignModel.restore);
    if (
      !a ||
      !b ||
      a.phase !== b.phase ||
      a.currentMissionId !== b.currentMissionId ||
      a.campaignSeed !== b.campaignSeed ||
      a.difficulty !== b.difficulty ||
      a.pendingStoryChapter !== b.pendingStoryChapter ||
      a.earlyRoute !== b.earlyRoute ||
      a.route !== b.route ||
      a.activeWaypoint?.waypointId !== b.activeWaypoint?.waypointId
    )
      return;
    function readOffers(input: unknown): PilotOffers | undefined {
      if (
        !Array.isArray(input) ||
        input.length !== 2 ||
        !input.every(
          (list) =>
            Array.isArray(list) &&
            list.length <= 64 &&
            list.every(
              (pair) => Array.isArray(pair) && pair.length === 2 && pair.every((type) => upgrades.includes(type)),
            ),
        )
      )
        return;
      return structuredClone(input) as PilotOffers;
    }
    const offers = readOffers(raw.offers),
      checkpoint = readOffers(raw.checkpointOffers);
    if (!offers || !checkpoint) return;
    return new SquadCampaign([new CampaignModel(a), new CampaignModel(b)], offers, checkpoint);
  }
  save(): SquadSave {
    return {
      version: 1,
      pilots: [this.pilots[0].exportSave(), this.pilots[1].exportSave()],
      offers: structuredClone(this.offers),
      checkpointOffers: structuredClone(this.checkpointOffers),
    };
  }
  begin(duration?: number): MissionStartConfig {
    const [lead, wing] = this.pilots.map((p) => p.beginMission(duration));
    return {
      ...lead,
      wingmate: wing,
      coopOffers: structuredClone(lead.resumeFrom ? this.checkpointOffers : this.offers),
    };
  }
  waypoint(primary: MissionWaypointSnapshot, wing: MissionWaypointSnapshot, offers: PilotOffers): boolean {
    if (
      primary.waypointId !== wing.waypointId ||
      !this.pilots[0].eligibleWaypoint(primary) ||
      !this.pilots[1].eligibleWaypoint(wing)
    )
      return false;
    this.pilots[0].saveWaypoint(primary);
    this.pilots[1].saveWaypoint(wing);
    this.checkpointOffers = structuredClone(offers);
    return true;
  }
  finish(team: GameSnapshot, wing: GameSnapshot, offers: PilotOffers): CampaignSnapshot {
    const payout = Math.round(
      this.pilots[0].currentMission().completionCredits *
        Math.max(...this.pilots.map((p) => buildCombatModifiers(p.snapshot().purchased).creditMultiplier)),
    );
    const state = this.pilots[0].completeMission(team, payout);
    this.pilots[1].completeMission({ ...team, weapons: wing.weapons, shieldBaseMax: wing.shieldBaseMax }, payout);
    this.offers = structuredClone(offers);
    this.checkpointOffers = [[], []];
    return state;
  }
  fail(): void {
    this.pilots.forEach((p) => p.failMission());
  }
  story(): CampaignSnapshot {
    this.pilots[1].completeStoryChapter();
    return this.pilots[0].completeStoryChapter();
  }
  chooseRoute(seat: Seat, route: CampaignRoute): boolean {
    const expected = this.pilots[0].currentMission().id === 'fortress' ? 1 : 0;
    if (seat !== expected || !this.pilots[0].selectRoute(route)) return false;
    this.pilots[1].selectRoute(route);
    return true;
  }
  claim(seat: Seat, option: number): boolean {
    const offer = this.offers[seat][0];
    if (!offer || (option !== 0 && option !== 1) || !['route', 'hangar'].includes(this.pilots[0].snapshot().phase))
      return false;
    this.pilots[seat].claimArmament(offer[option]);
    this.offers[seat].shift();
    return true;
  }
}
