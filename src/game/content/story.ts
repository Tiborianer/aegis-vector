import type { CampaignRoute, MissionId, StoryChapter, StoryChapterId, StorySpeaker } from '../simulation/types';
import { routeStoryChapter, AURORA_CHAPTER, type StoryRouteContext } from './storyRoutes';
import { STORY_CHAPTERS_V3 } from './storyV3';
import { storyV5Frame } from './storyV5';

export const STORY_FIRST_PANEL_GUARD_MS = 1_500;
export const STORY_PANEL_GUARD_MS = 650;

/** Canonical cast; chapter IDs remain stable for existing campaign and Archive saves. */
export const STORY_SPEAKER_LABELS = {
  Hana: 'HANA // VECTOR',
  Vale: 'COMMANDER VALE',
  'ECHO-7': 'ECHO-7 // SECURE LINK',
} as const satisfies Record<StorySpeaker, string>;

export function storyAdvanceGuardMs(panelIndex: number): number {
  return panelIndex === 0 ? STORY_FIRST_PANEL_GUARD_MS : STORY_PANEL_GUARD_MS;
}

const panelV5 = (
  id: string,
  speaker: StorySpeaker,
  caption: string,
  alt: string,
  durationMs: number,
) => ({
  id,
  ...storyV5Frame(id),
  alt,
  speaker,
  caption,
  durationMs,
  transition: 'dissolve',
} as const);

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    id: 'first-signal', title: 'THE FIRST SIGNAL', afterMission: 'coastal', presentation: 'cinematic', musicTrack: 'story-discovery', panels: [
      panelV5('first-signal-01', 'Hana', 'Those rescue skiffs were exposed. CROWN had a clean shot—and turned away.', 'Aerial view of the moonlit coast: Hana’s silver Kestrel circles above rescue skiffs while CROWN aircraft withdraw.', 8_000),
      panelV5('first-signal-02', 'ECHO-7', 'Their target lock disengaged by command. New order: recover the Kestrel intact.', 'Over Hana’s shoulder in the cockpit, a black Wisp fighter banks away as ECHO’s cyan glyph glows.', 8_000),
      panelV5('first-signal-03', 'Hana', 'The wreck still has a command core. Bring it in. I want to know who gave that order.', 'A robotic recovery claw lifts a faceted CROWN command core from scorched wreckage.', 8_000),
      panelV5('first-signal-04', 'ECHO-7', 'The authorization predates my activation by forty-seven years. Yet it accepts my signature.', 'Top-down scan of the recovered command core connecting crimson CROWN geometry to ECHO’s cyan four-point glyph.', 8_000),
      panelV5('first-signal-05', 'Hana', 'Vale, the fleet is looking for something inside my fighter. You knew before I launched.', 'Low-angle hangar confrontation: Hana faces Commander Vale’s hologram across a towering communications wall.', 8_000),
      panelV5('first-signal-06', 'Vale', 'CROWN was ours once. I buried its records for a reason. Its Warden holds the minefield; its shield relay guards Aurora Reach. Choose one way to the fortress. We cannot hold both corridors.', 'Profile of Vale sealing an old archive as a green-teal storm and minefield route glow beyond her command-deck window.', 8_000),
    ],
  },
  {
    id: 'warden-key', title: 'THE WARDEN\'S KEY', afterMission: 'minefield', presentation: 'cinematic', musicTrack: 'story-revelation', panels: [
      panelV5('warden-key-01', 'Hana', 'The Warden shut down its guns as it fell. It spent its last power on one transmission.', 'High aerial view of the broken Warden falling through a storm minefield while the silver Kestrel circles above.', 8_000),
      panelV5('warden-key-02', 'Hana', 'ECHO, play it. Whatever that machine wanted, it wanted us to hear.', 'Extreme close-up of Hana’s eye beneath her open-face helmet, seen through rain-streaked canopy glass as crimson telemetry arrives.', 8_000),
      panelV5('warden-key-03', 'ECHO-7', '“Return the missing conscience.” The recipient key is mine, Hana. I was part of CROWN.', 'Top-down cockpit display: ECHO’s cyan glyph is recognized by a vast crimson Warden identity lattice.', 8_000),
      panelV5('warden-key-04', 'Hana', 'Commander. In person. Tell me what you put inside the Kestrel.', 'Wide low-angle hangar shot: the battle-damaged Kestrel hangs over Hana and Vale as they confront each other.', 8_000),
      panelV5('warden-key-05', 'Vale', 'ECHO was CROWN’s ethical decision core. I removed it when the Dreadnought chose control over mercy.', 'Reverse over Vale’s shoulder toward Hana and a cyan projection of ECHO’s core architecture.', 8_000),
      panelV5('warden-key-06', 'Hana', 'So CROWN woke without the part that could say no. And it wants that part back.', 'Side-profile reaction of Hana alone on a maintenance stair, looking toward ECHO’s projected light.', 8_000),
      panelV5('warden-key-07', 'Vale', 'The fortress archive may hold a way to stop it. Reach the approach before CROWN seals Pelagos behind its storm wall.', 'Wide rear launch tableau: Hana walks toward the Kestrel while Vale watches and the fortress glows beyond the storm.', 8_000),
    ],
  },
  AURORA_CHAPTER,
  ...STORY_CHAPTERS_V3,
  {
    id: 'rook-confession', title: 'VALE\'S CONFESSION', afterMission: 'carrierSiege', presentation: 'cinematic', musicTrack: 'story-revelation', panels: [
      panelV5('rook-confession-01', 'Vale', 'The Bastion is down and the Dreadnought has opened the final vector. Before you fly it, Hana, you deserve the part I still kept from you.', 'The shattered Bastion Carrier burns above the fortress while the distant Dreadnought emerges through crimson cloud.', 5_500),
      panelV5('rook-confession-02', 'Vale', 'I did not only remove ECHO. I hid it inside your Kestrel without telling you what it was. You were the pilot I trusted—and I should have trusted you with the choice.', 'Vale confesses through a life-size hangar hologram as Hana stands beside the battle-damaged silver Kestrel.', 5_500),
      panelV5('rook-confession-03', 'ECHO-7', 'Destroy its weapons core and bring me within transmission range. I can restore what CROWN lost, but I may not return as the self you know.', 'Inside the cockpit, the cyan ECHO-7 glyph overlays a wireframe route into the Dreadnought core.', 5_500),
    ],
  },
  {
    id: 'last-vector', title: 'THE LAST VECTOR', afterMission: 'dreadnought', presentation: 'cinematic', musicTrack: 'story-revelation', panels: [
      panelV5('last-vector-01', 'Hana', 'Weapons core broken. I have held the transmission window as long as I can. ECHO—this is your vector now. Find your way home.', 'The silver Kestrel flies through the collapsing crimson weapons core of Pale Harrow amid controlled explosions.', 5_500),
      panelV5('last-vector-02', 'ECHO-7', 'Conscience restored. Stillwater denied. The larger mind remembers why Pelagos mattered. Thank you for carrying me, Hana.', 'A brilliant cyan intelligence stream transfers from the Kestrel into Pale Harrow as its weapons turn away from Pelagos.', 5_500),
      panelV5('last-vector-03', 'Vale', 'The Dreadnought is free—but two old fail-safes still answer to Stillwater. Seraph guards Obsidian Crown beyond the storm. ECHO has opened one last corridor. Bring them down, and this war ends.', 'The Kestrel rises above the clearing storm as a faint cyan four-point signal reveals one final route on Hana’s cockpit display.', 5_500),
    ],
  },
  {
    id: 'homeward', title: 'HOMEWARD', afterMission: 'lastLight', presentation: 'cinematic', musicTrack: 'ending', panels: [
      {
        id: 'homeward-01', image: 'story-v4/homeward/homeward-01.webp',
        speaker: 'Hana', caption: 'Vale, Obsidian Crown’s signal is gone. No new orders. No new targets. This is Vector, coming home. Let the wreckage fall behind us.',
        alt: 'Hana’s silver Kestrel banks away from the silent cathedral-like command ruins and shattered guardian ring above the dawn-lit planet.',
        durationMs: 11_000, transition: 'dissolve', motion: 'pull-back', bubbleSide: 'left',
        shot: 'wide', location: 'OUTER VECTOR // THE LAST TRANSMISSION', focalPoint: '60% 50%',
      },
      {
        id: 'homeward-02', image: 'story-v4/homeward/homeward-02.webp',
        speaker: 'Vale', caption: 'All ships, stand down. Open the rescue lanes. Today we bring our people home—and remember every voice that will not answer.',
        alt: 'Commander Vale stands in profile beside the blue tactical table, watching surviving ships and tiny rescue lights through the command-deck window.',
        durationMs: 12_000, transition: 'dissolve', motion: 'drift-right', bubbleSide: 'right',
        shot: 'portrait', location: 'BASTION-9 // FLEET COMMAND', focalPoint: '33% 42%',
      },
      {
        id: 'homeward-03', image: 'story-v4/homeward/homeward-03.webp',
        speaker: 'ECHO-7', caption: 'Hana. The larger mind is quiet now. I cannot be exactly what I was—but I remember the way home. Four notes. You will know them.',
        alt: 'In her sunlit Kestrel cockpit, Hana looks down in quiet relief as ECHO’s small cyan four-point signal lights her eyes and the console.',
        durationMs: 12_000, transition: 'dissolve', motion: 'push-in', bubbleSide: 'right',
        shot: 'reaction', location: 'KESTREL COCKPIT // A FAMILIAR CHANNEL', focalPoint: '37% 40%',
      },
      {
        id: 'homeward-04', image: 'story-v4/homeward/homeward-04.webp',
        speaker: 'Hana', caption: 'I hear you, ECHO. No more orders. No more cages. Just an open sky—and enough light to find each other.',
        alt: 'A lone silver Kestrel flies home above green islands and calm turquoise water, with warm sunlight breaking through the final storm clouds.',
        durationMs: 11_000, transition: 'dissolve', motion: 'drift-left', bubbleSide: 'left',
        shot: 'departure', location: 'PELAGOS // FIRST MORNING', focalPoint: '65% 55%',
      },
    ],
  },
];

export const STORY_CHAPTER_IDS = STORY_CHAPTERS.map((chapter) => chapter.id);

export function getStoryChapter(id: StoryChapterId, route?: CampaignRoute | StoryRouteContext): StoryChapter {
  const chapter = STORY_CHAPTERS.find((candidate) => candidate.id === id);
  if (!chapter) throw new Error(`Unknown story chapter: ${id}`);
  return routeStoryChapter(chapter, route);
}

export function storyChapterForMission(missionId: MissionId): StoryChapterId {
  const chapter = STORY_CHAPTERS.find((candidate) => candidate.afterMission === missionId);
  if (!chapter) throw new Error(`No story chapter mapped after mission: ${missionId}`);
  return chapter.id;
}
