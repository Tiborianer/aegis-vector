# Aegis Vector

A polished, desktop-first 2D browser arcade campaign built with Phaser, TypeScript, and Vite.

**Live game:** <https://tiborianer.github.io/aegis-vector/>

## Play locally

```bash
npm install
npm run dev
```

Open the address printed by Vite. Choose a difficulty and launch. Controls during active combat:

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Space / Z | Hold to fire |
| X / SHIFT | EMP — X, left Shift, and right Shift each activate one pulse per press |
| P / Escape | Pause / resume |

Holding an EMP key does not repeatedly consume charges. X / Shift is inactive outside combat, and held combat keys cannot accidentally activate transition controls. Escape retains its explicit pause/skip behavior on the relevant screen.

## Dimensional arcade graphics

The fixed **Dimensional** look uses 27 modeled spacecraft atlases, each rendered
in Blender at 16 banking angles. Surface, elevated haze, and near clouds scroll
independently, with an additional open-girder structural plane over Fortress Approach.
Last Light uses a layered starfield and sculpted asteroid field.
The round translucent **Ion Bubble** is the fixed player shield.
There are no graphics or shield-style selectors. Old saved preferences and the
`visuals` / `shield` URL flags no longer change the presentation. Existing backup
art is retained only for automatic missing-asset recovery, without changing combat rules.

## Mission Lab — independent level testing

Choose **MISSION LAB** from the title screen, or append `?lab=1` to the local URL
(currently `http://127.0.0.1:4176/?lab=1`). All nine locations, including both
branches at each fork, are available immediately. Select a difficulty and a starting
loadout: **Starter**, **Combat**, or **Maximum**. **God mode is on by default**;
uncheck it to test normal damage.

The Lab does not load your campaign and never writes campaign progress, archive
unlocks, or high scores. The HUD may display your existing best score for reference.
Waypoints exist only for the current test; refreshing starts a fresh test. Completing
a mission offers **REPLAY THIS MISSION** or **CHOOSE ANOTHER MISSION**, not campaign
progression. Pause also offers retry and mission selection.

During a test, expand **MISSION LAB // CONTROLS** to restart, switch missions,
return to the loadout screen, toggle invulnerability by restarting, or summon and
isolate a particular craft. Click the playfield again after using the controls to
resume keyboard flight. Debug **H** deliberately applies a test hit even in God mode;
ordinary enemy impacts do not. All tests keep full mission timing.

A shareable local setup can specify, for example,
`?lab=1&mission=lastLight&loadout=max&difficulty=pilot&god=1`.
Return to the normal menu for your saved campaign. Legacy save-safe graphics-review
links still work, but no longer offer visual comparisons.

The rebuild workflow, full rollback backup, and verification results are documented
in [Graphics V2](docs/GRAPHICS_V2.md) and [Graphics Expansion](docs/GRAPHICS_EXPANSION.md). `npm run verify:graphics` validates every
shipping atlas and environment; the production build runs this check automatically.

## Publish the browser build

GitHub Actions deploys `main` to the live link above after tests and asset checks.
It publishes only the active-assets package in `web-dist`, not the unfiltered
working media folders. Retired recordings, review pages, source maps and private
authoring/reference files are excluded without deleting their local originals.
See [Browser release procedure](docs/WEB_RELEASE.md) for staging and live verification.
This is separate from a Steam release.

## Other commands

```bash
npm test
npm run build
```

Add `?debug=1` to the local URL to enable browser QA controls while preserving full mission pacing and ordinary player damage. In this mode, keys 1–5 grant ARC, NOVA, LANCE, WING, and shield capacity, I grants ION, O grants Overdrive, 6 grants an EMP cell, N cycles specialists including Skimmer and Weaver, V summons the Warden, B summons the mission's current finale boss, H applies one test hit, and C completes the active mission with test salvage. Add `&quick=1` only when a shortened regular mission is needed, `&collisionDebug=1` to show compound collision zones, or `&god=1` for focused invulnerability testing. Outside Mission Lab, God mode requires debug mode and is not enabled by default; debug alone does not protect campaign saves, so use Mission Lab for independent tests. Add `&quality=high`, `balanced`, or `low` to override adaptive graphics quality. The debug-only `&audioTrack=mission-coastal` selector can hold a mapped soundtrack on the menu for loop diagnostics.

## Game rules

- A campaign contains seven playable missions across nine locations, with two independent forks. After Coastal Intercept choose Minefield Run (offense) or Aurora Reach (defense). After Fortress choose Graveyard (recovered memory) or Stormbreak (live directive), keeping the first route's reward. All four combinations reconverge at Carrier Siege → Dreadnought → Last Light. The Campaign Route Map is available from the menu, hangar and pause screen. Version-8 saves store the two choices separately; older campaigns keep their current mission and checkpoints, with the second choice reopened only if its mission has not yet been entered.
- Completing Minefield earns the permanent ARC Resonator (+12% ARC-only damage); completing Aurora earns Aegis Bastion (+1 shield cell). Selecting a route or retrying does not grant duplicate rewards. Legacy campaigns preserve their already-played Minefield and later route choice without retroactive rewards.
- Destroyed enemies award Aegis Credits for 40 between-mission upgrade nodes: seven tiers each in Weapons and Defense, six in Systems. Choose one of each tier's two alternatives, or purchase one consumable sortie module for the next mission.
- ARC carries seven levels and adds exactly one base energy bolt per pickup, from one through seven. NOVA, LANCE, WING, and ION retain five levels. Rare gold Armament Carriers drop deterministic two-choice upgrades; normal enemies drop only tactical utilities. Split Capacitors still adds its explicit bonus ARC bolt.
- The four late refinements are Precision Feed (cadence and damage), Capacitor Reservoir (EMP capacity and damage), Ablative Frame (hull and finite hit protection), and Rapid Recovery (shield recovery). See [Upgrade Review](docs/UPGRADE_REVIEW.md) for exact balance and stacking rules.
- The rechargeable shield can grow to three base cells, or four with the Aurora route reward. Each accepted hit removes one cell, with 850 ms of protection against overlapping impacts. Cells normally recharge one at a time at seven-second intervals without damage; recovery upgrades shorten the interval. Its fixed appearance is the round translucent Ion Bubble.
- Tractor now pulls moving utility pickups from 360 pixels away and adds 25% kill-credit salvage for 12 seconds; paired Armament choices stay put. Overdrive drops and full-service fabrication repeats are less frequent.
- Regular missions rise through five deterministic threat levels while attack warnings retain their readable timing. Later operations add Phantom phase attackers, interruptible Artillery barrages, utility-stealing Reclaimers, banking Skimmers, lattice-firing Weavers, and the multipart Bastion Carrier.
- Dreadnought has a 30-second escort approach and its three-phase boss. Last Light has a 35-second approach in an asteroid field, then the articulated Seraph guardian and the much larger Obsidian Crown in sequence. Destroy all six independently aiming Obsidian Crown turrets before its hull becomes vulnerable. Destroying a turret stops its fire and creates a small nearby bullet-clear pulse. Defeating Seraph does not complete the mission.
- Each mission has two automatic waypoints. Regular missions capture near 33% and 66%, deferred during command encounters or unresolved Armament choices. Dreadnought captures before its boss and at 66% boss health. Last Light captures before Seraph and between the two bosses.
- Retry from the latest waypoint keeps captured credits, equipment, and encounter progress; it restores full shields, at least two hull, and at least one EMP. Temporary effects and combo are cleared. Protections consumed after a waypoint stay consumed, and post-waypoint failed-attempt earnings are not kept. Before the first waypoint, retry is a fresh mission attempt.
- Campaign progress and the latest waypoint use local save version eight and resume after a refresh. Earlier saves retain their progress and equipment; campaigns already marked complete remain complete. Completing or abandoning a mission clears its waypoint.
- Successful missions unlock route-aware story chapters, with Homeward after Last Light. The Flight Manual explains weapon families and specialist counterplay; its Archive replays recovered chapters and the opening. See [Final Mission Contract](docs/FINAL_MISSION_CONTRACT.md) for progression and retry details.

## Narrative and radio assets

The 8 November expansion adds the four-panel Aurora chapter and five new route images. There are now 45 canonical panels and 46 unique active images including variants. Route-specific evidence and later memory scenes retain the same overall narrative; old campaigns do not acquire invented Aurora history. See `docs/story/v6/art-direction.md` and `docs/quality/route-expansion-2026-11-08.md` for the new pass and outstanding release gates. The paragraph below describes the preceding 41-panel base.

The game includes the complete 97-second, 1280×720 authored opening cinematic at `public/cinematics/video/aegis-vector-intro-v2.mp4` plus 41 route-aware illustrated story panels. Every chapter now uses the cinematic presentation with the canonical Hana, Commander Vale and ECHO-7 cast. Nineteen V5 plates replace the remaining legacy art in First Signal, Warden's Key, Vale's Confession and Last Vector; an additional Forked Truth correction keeps Hana remote as a communications hologram. Mission 3 and both Mission 4 routes use eighteen frames in total, including that correction, and Homeward uses four V4 frames. Chapters use varied camera coverage, full-width readable dialogue and decoded-frame dissolves. Production records are in `docs/story/v5/`, with earlier storyboards and music status retained in `docs/story/STORYBOARD_V3.md`. Newly created chapter art does not reuse intro frames as finished scenes.

Chapters advance manually by default, with optional autoplay and a short click shield on each new image. The new chapters allow 11 seconds per shot (66 seconds each), but always wait for **Complete Chapter** at the end. Backgrounding the page pauses autoplay. For a save-safe local preview, use `?debug=1&story=forked-truth`, `?debug=1&story=stillwater-directive`, or `?debug=1&story=project-crown`.

Start New Campaign always plays the video, Continue resumes immediately, and the Flight Manual Archive can replay it. The optimized H.264/AAC file preserves the full edit while remaining below GitHub's individual-file limit and supports progressive playback. Playback ends at a Continue button rather than launching combat automatically. If the video cannot load, a branded poster provides the fallback; the retired slideshow is never used in production.

All eleven gameplay radio recordings are required by production verification and share one active map, `src/audio/radio-files.json`: eight original v2 files, the owner-approved Arc v3 correction, the owner-approved English “EYE-on” Ion v4 correction, and the new ECHO-7 “Shield hit.” v5 line. Shield Hit reports accepted damage that leaves shields above zero; it is limited to once per six seconds, drops while another transmission is active, and yields immediately to more important calls. Depletion keeps “Shield down.”; a reserve-shield activation is not misreported as a partial hit. ECHO-7 (Alice) and Commander Vale (Sarah) use ElevenLabs recordings generated on a paid Creator plan; provenance is in `docs/audio/radio-v2-production.json`, `docs/audio/audio-review-2026-11-07.json`, and `docs/audio/radio-v5-production.json`. Their original radio processing and central −6dB trim remain unchanged, with a separate saved Voice slider and optional subtitles. Radio playback neither ducks nor restarts music. The baked intro soundtrack instead follows the Cinematic slider. Earlier recordings are retained for history but superseded takes are not used or included in desktop candidates. `scripts/generate-radio-voices.sh` prepares the original ElevenLabs masters offline; it never spends credits.

ARC, NOVA, LANCE, WING, and ION currently use distinct, spatially panned layered Web Audio sounds with concurrency limits and mix protection. `SFX_GENERATION_PROMPTS.md` contains the ten dry sample briefs for a later recorded/generated asset pass.

## ElevenLabs music

Six additional mission scores generated through ElevenLabs Music v2.5 are active in `src/audio/mission-scores.json`: Aurora Reach v1 and the owner-approved v2 replacements for Stormbreak, Graveyard, Carrier Siege, Dreadnought and Last Light. All six were approved on 8 November 2026. All nine mission locations now have distinct recordings. The five earlier takes remain locally preserved but are not included in the website release. Listening pages and private production accounting remain local working records, not website assets.

The revision workflow preserves previous takes and activates replacements only after decoding and owner listening approval. Live requests require separate spending authorization, a securely configured local key and one named track; receipts prevent duplicate generation and chargeable requests are never retried automatically. Strict release verification (`node scripts/verify-audio.mjs public --require-mission-scores`) requires all six reviewed entries and rejects missing, shared-path or byte-identical scores across the nine locations. Hash uniqueness is not a listening review. The two story-specific music beds still use the declared hangar soundtrack fallback; bespoke cut-scene scores are not claimed complete.

Both pronunciation corrections are generated, processed, owner-auditioned and mapped. The dry-run workflow is `node scripts/generate-radio-corrections.mjs`; it preserves all earlier takes and requires the observed Sarah voice ID for a live request. The explicit `--cue=ion-upgraded --take=ion-v4` retake uses phonetic “Eye-on conductor upgraded.” while retaining the normal uppercase ION subtitle. It cannot overwrite or silently retry the rejected v3 take.

The supplied soundtrack is mapped by campaign state:

```text
menu.mp3                 title screen
hangar.mp3               between-mission hangar
mission-coastal.mp3      Coastal Intercept and Stormbreak Pursuit
mission-minefield.mp3    Minefield Run and Graveyard Salvage
mission-fortress.mp3     Fortress Approach, Carrier Siege, and finale approaches
boss.mp3                Dreadnought, Seraph, and Obsidian Crown boss encounters
boss-mech-tyrants.mp3    Alternate boss-encounter soundtrack
victory-coastal.mp3      Mission 1 completion
victory-minefield.mp3    Mission 2 completion
victory-fortress.mp3     Mission 3 completion
victory-campaign.mp3     Campaign victory
ending/homeward-vector-v1.mp3  Homeward chapter and final ending sequence
defeat-signal.mp3        Alternating failure sting
defeat-debrief.mp3       Alternating failure sting
```

Gameplay music loops and crossfades in Web Audio; the dedicated ending score plays through once. The two boss tracks alternate deterministically with the campaign seed, so retries preserve the same musical identity while new campaigns provide variation. Mission victory stings continue over the hangar report before blending into hangar music, while defeat stings alternate between failed attempts. The production build fails if a mapped file is absent, and a runtime loading error is shown as `MUSIC UNAVAILABLE` without playing a synthesized hum. The debug-only `?audioSynth=1` option retains a quiet oscillator fallback for diagnostics. Ready-to-paste regeneration prompts are in `ELEVENLABS_PROMPTS.md`.

Two dedicated 180-second cutscene scores are prepared but **not generated yet**: `story-discovery` and `story-revelation`. The manifest explicitly declares the existing hangar track as their temporary bed. Once `ELEVENLABS_API_KEY` is configured locally, `node scripts/generate-story-music.mjs --generate` requests the two instrumental tracks through ElevenLabs and updates their manifest. The command without `--generate` is a free dry run; it never logs the key, overwrites a completed output, or retries a chargeable request automatically. Decode, measure and audition both results, then run `node scripts/verify-audio.mjs public --require-story-scores` before releasing the music pass. Prompts are in `docs/story/v3/music-prompts.json`.
