import type { CombatModifiers, UpgradeBranch, UpgradeNode, UpgradeNodeId } from '../simulation/types';

export const UPGRADE_NODES: UpgradeNode[] = [
  { id: 'rapid-cycling', branch: 'weapons', tier: 1, name: 'RAPID CYCLING', description: 'Fire every weapon 10% faster.', cost: 60 },
  { id: 'amplified-munitions', branch: 'weapons', tier: 1, name: 'AMPLIFIED MUNITIONS', description: 'All weapons deal 12% more damage.', cost: 60 },
  { id: 'split-capacitors', branch: 'weapons', tier: 2, name: 'SPLIT CAPACITORS', description: 'ARC gains one shot; LANCE is 20% wider.', cost: 100 },
  { id: 'hunter-logic', branch: 'weapons', tier: 2, name: 'HUNTER LOGIC', description: 'Missiles hit and turn 25% harder; drones fire 20% faster.', cost: 100 },
  { id: 'overdrive-reactor', branch: 'weapons', tier: 3, name: 'OVERDRIVE REACTOR', description: 'A 10-kill chain triggers six seconds of rapid fire.', cost: 140 },
  { id: 'phase-arsenal', branch: 'weapons', tier: 3, name: 'PHASE ARSENAL', description: 'Shots pierce once; missiles gain a 90px blast.', cost: 140 },
  { id: 'ordnance-cascade', branch: 'weapons', tier: 4, name: 'ORDNANCE CASCADE', description: 'NOVA gains a missile; WING launches micro-missiles.', cost: 160 },
  { id: 'prismatic-core', branch: 'weapons', tier: 4, name: 'PRISMATIC CORE', description: 'Empower ARC/LANCE centers and add two ION chains.', cost: 160 },
  { id: 'reinforced-frame', branch: 'defense', tier: 1, name: 'REINFORCED FRAME', description: '+1 maximum hull, capped at five.', cost: 60 },
  { id: 'aegis-bank', branch: 'defense', tier: 1, name: 'AEGIS BANK', description: 'Store one reserve shield pip per mission.', cost: 60 },
  { id: 'quick-charge-loop', branch: 'defense', tier: 2, name: 'QUICK-CHARGE LOOP', description: 'Shield recharge drops to 5.5 seconds.', cost: 100 },
  { id: 'reactive-armor', branch: 'defense', tier: 2, name: 'REACTIVE ARMOR', description: 'Hull-hit grace increases to two seconds.', cost: 100 },
  { id: 'phoenix-protocol', branch: 'defense', tier: 3, name: 'PHOENIX PROTOCOL', description: 'Survive one lethal hit per mission.', cost: 140 },
  { id: 'repulsor-shield', branch: 'defense', tier: 3, name: 'REPULSOR SHIELD', description: 'Shield hits clear bullets within 130px.', cost: 140 },
  { id: 'second-wind', branch: 'defense', tier: 4, name: 'SECOND WIND', description: 'At one hull, restore shield and clear nearby fire once.', cost: 160 },
  { id: 'kinetic-reversal', branch: 'defense', tier: 4, name: 'KINETIC REVERSAL', description: 'Shield hits reflect fire and grant brief protection.', cost: 160 },
  { id: 'salvage-protocol', branch: 'systems', tier: 1, name: 'SALVAGE PROTOCOL', description: 'Earn 20% more campaign credits.', cost: 60 },
  { id: 'tractor-array', branch: 'systems', tier: 1, name: 'TRACTOR ARRAY', description: 'Passively attract pickups within 140px.', cost: 60 },
  { id: 'emp-overcharger', branch: 'systems', tier: 2, name: 'EMP OVERCHARGER', description: '+1 EMP capacity and 50% EMP damage.', cost: 100 },
  { id: 'combat-computer', branch: 'systems', tier: 2, name: 'COMBAT COMPUTER', description: '4.2s combo window with a ×6 cap.', cost: 100 },
  { id: 'field-fabricator', branch: 'systems', tier: 3, name: 'FIELD FABRICATOR', description: 'Every 30 kills fabricates a utility pickup.', cost: 140 },
  { id: 'flux-capacitor', branch: 'systems', tier: 3, name: 'FLUX CAPACITOR', description: 'Utility effects last 50% longer; excess EMP scores.', cost: 140 },
  { id: 'chrono-relay', branch: 'systems', tier: 4, name: 'CHRONO RELAY', description: 'EMP leaves a five-second time-dilation field.', cost: 160 },
  { id: 'emergency-capacitor', branch: 'systems', tier: 4, name: 'EMERGENCY CAPACITOR', description: 'The first two hull hits restore EMP and Tractor.', cost: 160 },
];

export const UPGRADE_BRANCHES: UpgradeBranch[] = ['weapons', 'defense', 'systems'];

export const DEFAULT_COMBAT_MODIFIERS: CombatModifiers = {
  fireIntervalMultiplier: 1,
  damageMultiplier: 1,
  splitCapacitors: false,
  hunterLogic: false,
  overdriveReactor: false,
  phaseArsenal: false,
  hullBonus: 0,
  reserveShield: false,
  shieldRechargeMs: 7_000,
  hullInvulnerabilityMs: 1_250,
  phoenixProtocol: false,
  repulsorShield: false,
  creditMultiplier: 1,
  passiveTractorRadius: 0,
  empCapacityBonus: 0,
  empDamageMultiplier: 1,
  comboWindowMs: 2_700,
  comboMax: 5,
  fieldFabricator: false,
  utilityDurationMultiplier: 1,
  ordnanceCascade: false,
  prismaticCore: false,
  secondWind: false,
  kineticReversal: false,
  chronoRelay: false,
  emergencyCapacitor: false,
};

export function getUpgradeNode(id: UpgradeNodeId): UpgradeNode {
  const node = UPGRADE_NODES.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Unknown upgrade node: ${id}`);
  return node;
}

export function getSibling(node: UpgradeNode): UpgradeNode {
  const sibling = UPGRADE_NODES.find((candidate) =>
    candidate.branch === node.branch && candidate.tier === node.tier && candidate.id !== node.id,
  );
  if (!sibling) throw new Error(`Missing sibling for upgrade node: ${node.id}`);
  return sibling;
}

export function buildCombatModifiers(purchased: readonly UpgradeNodeId[]): CombatModifiers {
  const owned = new Set(purchased);
  return {
    fireIntervalMultiplier: owned.has('rapid-cycling') ? 0.9 : 1,
    damageMultiplier: owned.has('amplified-munitions') ? 1.12 : 1,
    splitCapacitors: owned.has('split-capacitors'),
    hunterLogic: owned.has('hunter-logic'),
    overdriveReactor: owned.has('overdrive-reactor'),
    phaseArsenal: owned.has('phase-arsenal'),
    hullBonus: owned.has('reinforced-frame') ? 1 : 0,
    reserveShield: owned.has('aegis-bank'),
    shieldRechargeMs: owned.has('quick-charge-loop') ? 5_500 : 7_000,
    hullInvulnerabilityMs: owned.has('reactive-armor') ? 2_000 : 1_250,
    phoenixProtocol: owned.has('phoenix-protocol'),
    repulsorShield: owned.has('repulsor-shield'),
    creditMultiplier: owned.has('salvage-protocol') ? 1.2 : 1,
    passiveTractorRadius: owned.has('tractor-array') ? 140 : 0,
    empCapacityBonus: owned.has('emp-overcharger') ? 1 : 0,
    empDamageMultiplier: owned.has('emp-overcharger') ? 1.5 : 1,
    comboWindowMs: owned.has('combat-computer') ? 4_200 : 2_700,
    comboMax: owned.has('combat-computer') ? 6 : 5,
    fieldFabricator: owned.has('field-fabricator'),
    utilityDurationMultiplier: owned.has('flux-capacitor') ? 1.5 : 1,
    ordnanceCascade: owned.has('ordnance-cascade'),
    prismaticCore: owned.has('prismatic-core'),
    secondWind: owned.has('second-wind'),
    kineticReversal: owned.has('kinetic-reversal'),
    chronoRelay: owned.has('chrono-relay'),
    emergencyCapacitor: owned.has('emergency-capacitor'),
  };
}
