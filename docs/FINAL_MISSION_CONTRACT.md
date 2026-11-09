# Last Light mission contract

## Campaign route and compatibility

The campaign offers two independent choices: Minefield or Aurora after Coastal, then Graveyard or Stormbreak after Fortress. All four combinations converge at Carrier Siege, then Dreadnought, then mission seven, Last Light. Dreadnought remains an approach-and-boss encounter and awards 95 completion credits. Clearing it commits the result and plays `last-vector`, then opens the Last Light hangar. Only Last Light followed by `homeward` reaches campaign victory. Likewise, only Last Light uses the “BEGIN FINAL ASSAULT” launch label; Dreadnought uses “LAUNCH MISSION 6”.

Saves are version eight. `earlyRoute` records Minefield/Aurora and the existing `route` field records the independent Graveyard/Stormbreak decision. The first route's earned reward remains active on either later path. Story images remember the first approach while subsequent evidence dialogue follows the second choice.

Version-seven saves previously coupled the two forks. Migration retains their first approach, reward, equipment, credits, score, pending chapter, seed and active checkpoint. If the second branch has not yet been entered, Fortress offers a new choice; saves already in or beyond Stormbreak/Graveyard keep their existing later path. Version-one through version-six saves retain the historical Minefield visit and any already-selected later route, without retroactive reward grants. A previously completed campaign stays completed. Corrupt active checkpoints are discarded in favor of the unchanged pre-mission campaign state, not partially restored with invented defense availability.

## Runtime state and transitions

`GameModel.finaleBossStage` is the authoritative Last Light sequence cursor. It is present in `GameSnapshot` and `GameCheckpointSnapshot`.

1. Start: `finalePhase='approach'`, `finaleBossStage='seraph'`.
2. Clear the 35-second escort approach. Clear hazards and set phase `boss`. Capture waypoint one with Seraph stage and no active boss ratio, then spawn Seraph.
3. Register Seraph's kill/reward once, then call `advanceFinaleBoss()`. It succeeds once, changes the stage to `nullArchitect`, clears the boss HUD, and sets the new boss ratio to one. It does not heal or complete the mission.
4. Clear remaining hazards/enemies and invalidate the old Seraph sprite reference before capturing waypoint two. Its snapshot must have Null Architect stage and no boss ratio, or a ratio of exactly one. Then spawn Null Architect.
5. Defeat Null Architect and call `complete(true)`. Campaign completion requires the Null Architect stage and cleared finale phase. The campaign result can be committed only once.

`finaleBossKind(missionId, stage)` selects the correct enemy on normal spawn and retry. A waypoint-two restore must never spawn Seraph, repeat its death animation rewards, or re-run the escort approach. `bossSpawned` is renderer runtime state and can be reset before recreating the appropriate current boss.

Dreadnought continues to use its own `boss` enemy and existing 66%-health second waypoint. Calling `complete(true)` for Dreadnought now yields ordinary mission completion, not victory.

## Checkpoints

`sanitizeMissionWaypoint()` checks mission/id, finite counters, whole weapon levels and per-weapon caps, all one-use-defense flags, deterministic offer history, encounter cursor, time consistency, and the legal finale stage. Last Light checkpoints are only legal at the two clean boss boundaries. Dreadnought can additionally carry its second-waypoint boss health ratio.

`restoreEncounterCursor()` provides a render-independent copy of the wave/carrier/offer/utility cursor. `cloneMissionWaypoint()` deep-copies equipment and offer pairs. Restoring a model preserves elapsed time even when a boss fight exceeded the nominal mission duration. Partial service restores at least two hull, full shields, and at least one EMP without reducing a healthier saved state. Temporary effects and combo are cleared. Flags already consumed at the snapshot remain consumed.

`CampaignModel.abandonMission()` clears the active waypoint while leaving the pre-mission campaign earnings/equipment intact. Full campaign abandonment remains the existing UI operation. Completing the mission removes its waypoint before the story chapter. Duplicate completion calls are rejected before changing credits.

`CampaignModel.recordConsumedDefenses(checkpoint, missionId)` monotonically merges spent one-use flags and Emergency Capacitor trigger counts into the current waypoint. It must be called and saved after a non-ignored damage/defense result and a Nanite hull-repair tick. This prevents protections spent after the waypoint from refreshing on death or browser refresh. The merge never copies post-waypoint score, kills, credits, weapons, or time, so it cannot turn a failed run into permanent earnings.

Before the first waypoint there is no retained mission progress: a retry is a genuine fresh attempt with its normal starting protections. Once a waypoint exists, all six one-use flags and both Emergency Capacitor uses remain monotonically consumed across death, manual retry, later waypoint capture, and refresh. Last Light rejects checkpoints with a defeated fighter, an uncleared command encounter, or an already spawned boss; no mid-boss state can masquerade as a clean boundary.

## HUD progress

Use `finaleProgress(snapshot)` and `finaleWaypointPosition(missionId, waypointId)` rather than the elapsed mission timer during bosses. Last Light reserves 0–15% for approach, 15–55% for Seraph health, and 55–100% for Null Architect health. Both sides of the transition meet at 55%. Dreadnought reserves 0–18% for approach and the rest for boss health. Standard missions return no finale-specific progress and retain timed progress.

## Verification boundary

Pure tests cover all four route combinations, both choice screens' map states, earned-reward retention, crossed-route story continuity, version-seven checkpoint migration before and after the second fork, and the final-only launch label. They also cover phase ordering, no completion after only Seraph, single result commit, waypoint-two death/refresh recovery, retained first-boss earnings, malformed checkpoint rejection, one-use flags, partial service, temporary-effect removal, deterministic cursors, and continuous HUD progress. Boss spawn/attack visuals, safe pauses/skips, collision, music, and the complete story-to-victory sequence require the separate browser integration playtest.
