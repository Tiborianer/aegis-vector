# Upgrade and ARC balance review

## Intent

Make each ARC pickup visibly add exactly one energy bolt, keep late-campaign damage useful, make weak upgrade choices genuinely functional, and add four refinements without turning the fighter invulnerable. This pass preserves the existing mutually exclusive pairs and costs through tier six.

## ARC progression

`WEAPON_MAX_LEVEL` is the single weapon-cap table. ARC reaches level seven; NOVA, LANCE, WING, and ION remain capped at five. `getArcVolley()` is a pure, tested firing-layout function consumed by the battle renderer. Its symmetric fan adds one bolt per level; even volleys straddle the center rather than inventing an extra center bolt.

| ARC level | Bolts | Damage per bolt | Interval | Ideal full-volley DPS |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1 | 1.00 | 142 ms | 7.04 |
| 2 | 2 | 1.00 | 134 ms | 14.93 |
| 3 | 3 | 1.00 | 126 ms | 23.81 |
| 4 | 4 | 1.05 | 118 ms | 35.59 |
| 5 | 5 | 1.10 | 110 ms | 50.00 |
| 6 | 6 | 1.15 | 102 ms | 67.65 |
| 7 | 7 | 1.20 | 94 ms | 89.36 |

These are upper bounds with every bolt hitting, without upgrades or Overdrive. The first pickup previously jumped to three bolts, roughly 23.1 ideal DPS; it now gives two and approximately 14.9 DPS. Maximum base ARC is about 10% below the former seven-bolt level-five output (99.3 DPS), rather than gaining the old extra projectiles and damage jumps at once. The fan remains narrow, at most ±0.225 radians. Split Capacitors still explicitly adds one extra shot; it is not another hidden ARC level. Prismatic Core empowers the innermost shots when a volley has no exact center.

Campaign saves and waypoint restores preserve ARC levels six/seven. Other weapons are clamped to their own caps, and ARC cannot restore below its starting level one. Legacy saves retain their existing levels; there is no silent conversion from the old level-two three-shot pattern. Pickup offers remain deterministic and can offer ARC through level six. WING formation lookup safely treats the shared level-six/seven type as its existing level-five formation.

## Complete upgrade review

The catalogue now has 40 nodes: 36 existing choices and four additions. Every node must alter the default combat modifier set, have an existing icon, and retain a same-tier sibling and previous-tier prerequisite. Tier seven costs 330 credits per choice, versus 280 at tier six.

| Branch / tier | Choice pair | Decision |
| --- | --- | --- |
| Weapons 1 | Rapid Cycling / Amplified Munitions | Retain the cadence-versus-damage distinction and modest 10% / 12% bonuses. |
| Weapons 2 | Split Capacitors / Hunter Logic | Retain energy coverage versus guided-weapon improvement. ARC's explicit bonus bolt stays separate from level progression. |
| Weapons 3 | Overdrive Reactor / Phase Arsenal | Retain chain reward versus penetration; reactor remains temporary and requires ten chained kills. |
| Weapons 4 | Ordnance Cascade / Prismatic Core | Retain guided ordnance versus energy specialization. Support even ARC volleys in the center-shot rule. |
| Weapons 5 | Swarm Doctrine / Resonance Matrix | Retain target prioritization versus accumulated energy discharge; neither is a blanket damage replacement. |
| Weapons 6 | Helios Battery / Gravity Payload | Retain periodic ARC salvos versus enemy grouping. No additional stacking damage buff here. |
| Weapons 7 | Precision Feed / Capacitor Reservoir | New: 6% shorter intervals and 8% damage versus +1 EMP capacity and 25% EMP damage. Both compose with earlier refinements. |
| Defense 1 | Reinforced Frame / Aegis Bank | Retain permanent hull versus one reserve shield per mission. Correct hull description so it does not promise the wrong cap. |
| Defense 2 | Quick-Charge Loop / Reactive Armor | Retain recharge versus finite hit grace; fix recharge synergy with Harmonics below. |
| Defense 3 | Phoenix Protocol / Repulsor Shield | Retain a single lethal-hit rescue versus local bullet clearing. No resetting consumed rescue at waypoints. |
| Defense 4 | Second Wind / Kinetic Reversal | Retain one emergency recovery versus shield-hit reflection; protections remain finite. |
| Defense 5 | Nanite Lattice / Aegis Harmonics | Retain one conditional hull repair versus shield-pip recovery. Harmonics is 4.5s per pip, 3.5s with Quick-Charge Loop, 2.5s with Rapid Recovery; Quick-Charge is no longer ignored. |
| Defense 6 | Guardian Pulse / Fortress Frame | Retain recharge-linked clearing versus hull and one unshielded ram protection. |
| Defense 7 | Ablative Frame / Rapid Recovery | New: +1 hull and +250ms hull-hit grace, capped at six hull, versus four-second full-shield recovery or 2.5s Harmonics pips. |
| Systems 1 | Salvage Protocol / Tractor Array | Fix fractional credit accumulation so +20% works on one/two-credit enemies. Raise passive Tractor radius from 140px to 180px; it still excludes Armament choices. |
| Systems 2 | EMP Overcharger / Combat Computer | Retain charge/damage improvement versus score-chain opportunity. Reservoir stacks multiplicatively to 1.875× EMP damage, not unlimited pulses. |
| Systems 3 | Field Fabricator / Flux Capacitor | Retain utility supply versus effect duration. Fix excess EMP score being awarded twice through the Flux route. |
| Systems 4 | Chrono Relay / Emergency Capacitor | Retain deliberate EMP time control versus two emergency hull-hit activations. |
| Systems 5 | Threat Analyzer / Salvage Router | Retain specialist scoring versus excess-utility conversion. Remove duplicate excess-repair score so the award matches the displayed 500 points and optional two credits. |
| Systems 6 | Temporal Echo / Fabrication Matrix | Retain one delayed weaker EMP echo versus carrier/fabrication utility generation; no new tier required for this pass. |

New refinements deliberately reuse the appropriate existing technology icon: Rapid Cycling, EMP Overcharger, Reinforced Frame, and Quick-Charge Loop respectively. They do not refer to nonexistent new artwork.

Salvage's fractional credit remainder is stored in optional `GameCheckpointSnapshot.creditRemainder`, defaulting to zero for older checkpoints. Whole credits still appear in the HUD and mission result; five one-credit enemies with Salvage now award six credits. Restoring a checkpoint neither loses the remainder nor duplicates its already-earned whole credits.

## Enemy durability evidence and tuning

The graphics changes do not determine health. Actual durability comes from enemy base health, mission threat scaling, and explicit shields/armor. The former shield-carrier aura admitted only 30% damage, effectively multiplying protected health by 3.33. The combat pass now admits 55% on Cadet, 40% on Pilot, and 30% on Ace. Bulwark's visible armor mechanic remains distinct.

Regular specialist base health is reduced modestly: Bomber 12→11, Elite 22→20, Charger 7→6, Sniper 8→7, Minelayer 14→13, Shield Carrier 18→16, Phantom 9→8, Artillery 18→16, Reclaimer 10→9. Scout and Interceptor baselines, enemy speed/fire cadence, credits, and score are unchanged. Existing command and boss health is not reduced in this pass. This avoids making every encounter trivial while correcting the much larger shield-aura effect.

## Verification

Automated tests cover exact ARC counts, symmetry, cadence, cap handling, bounded DPS, every upgrade's modifier effect, sibling/prerequisite structure, new upgrade purchase/respec/save behavior, legacy saves, deterministic capped offers, WING formation compatibility, shield timing, finite defenses, score/credit correctness, and waypoint recovery. Browser damage-per-second, upgrade-screen readability, projectile legibility, and collision playtests remain integration checks; mathematical upper-bound DPS is not a substitute for those checks.
