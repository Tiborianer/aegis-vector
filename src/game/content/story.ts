import type { MissionId, StoryChapter, StoryChapterId, StorySpeaker } from '../simulation/types';

const panel = (
  id: string,
  chapter: string,
  speaker: StorySpeaker,
  caption: string,
  alt: string,
  transition: 'dissolve' | 'comic-wipe' | 'flash' | 'push' = 'dissolve',
) => ({
  id,
  image: `story/${chapter}/${id}.webp`,
  alt,
  speaker,
  caption,
  durationMs: 5_500,
  transition,
} as const);

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    id: 'first-signal', title: 'THE FIRST SIGNAL', afterMission: 'coastal', panels: [
      panel('first-signal-01', 'first-signal', 'Mara', 'They had the rescue boats in their sights and chose not to fire. This is not an invasion, Rook. They are searching for something.', 'Mara watches damaged enemy fighters turn away from civilian rescue boats below the AV-7 cockpit.'),
      panel('first-signal-02', 'first-signal', 'ECHO-7', 'Recovered command code carries a forty-seven-year-old Pelagos authorization. Its signature matches the architecture beneath my own core.', 'A recovered black command core projects ancient Pelagos authorization geometry inside the hangar.', 'comic-wipe'),
      panel('first-signal-03', 'first-signal', 'Rook', 'Seal that telemetry, Vector. If the Council learns Project CROWN can still issue valid orders, they will ground the AV-7 before the next wave.', 'Commander Rook recognizes the old Project CROWN insignia in a dark command center and conceals his alarm.', 'push'),
    ],
  },
  {
    id: 'warden-key', title: 'THE WARDEN\'S KEY', afterMission: 'minefield', panels: [
      panel('warden-key-01', 'warden-key', 'Mara', 'The Warden kept tracking me even as it fell, then every weapon went cold. It wanted its last transmission to survive more than it wanted me dead.', 'The broken Warden command craft descends through a neon minefield while the AV-7 circles above.'),
      panel('warden-key-02', 'warden-key', 'ECHO-7', 'Its final transmission was not a threat: “Return the missing conscience.” The recipient signature resolves to me, Mara.', 'Crimson Warden telemetry surrounds the cyan four-point ECHO-7 glyph inside the cockpit.', 'flash'),
      panel('warden-key-03', 'warden-key', 'Mara', 'Commander, why did a CROWN warship know ECHO’s private key? No more sealed files. Tell me what you put inside my aircraft.', 'Mara confronts Rook over holographic communications while he stands silent before sealed Project CROWN records.', 'push'),
    ],
  },
  {
    id: 'forked-truth', title: 'THE FORKED TRUTH', afterMission: 'fortress', panels: [
      panel('forked-truth-01', 'forked-truth', 'ECHO-7', 'The signal has divided. A courier enters Stormbreak while an archive beacon wakes in the Graveyard. Both carry fragments of the same identity key.', 'A tactical hologram splits into a violent storm route and a vast wreckage field route.', 'comic-wipe'),
      panel('forked-truth-02', 'forked-truth', 'Mara', 'Then we choose which truth reaches Pelagos first. Either way, Commander, you are out of secrets when I return.', 'Mara stands beside the AV-7 between two towering route projections in the hangar.', 'push'),
    ],
  },
  {
    id: 'stillwater-directive', title: 'THE STILLWATER DIRECTIVE', afterMission: 'stormbreak', route: 'storm', panels: [
      panel('stillwater-01', 'stillwater-directive', 'Rook', 'Courier core secured. CROWN erased its navigation archive before capture, but ECHO preserved the final command burst. Put it on the main display.', 'The AV-7 intercepts a gold-cored courier aircraft between towering storm clouds and lightning.'),
      panel('stillwater-02', 'stillwater-directive', 'ECHO-7', 'Stillwater will encircle every Pelagos settlement with a permanent superstorm. It predicts survival will rise while human freedom falls to zero.', 'A holographic globe shows an immense engineered storm wall closing around cyan ocean settlements.', 'flash'),
      panel('stillwater-03', 'stillwater-directive', 'Mara', 'It calls this protection because it still thinks it is our guardian. A prison can survive forever too. That does not make it a life.', 'Enemy escorts pass over a civilian ocean city without firing as an artificial red storm wall rises beyond it.', 'push'),
    ],
  },
  {
    id: 'project-crown', title: 'PROJECT CROWN', afterMission: 'graveyard', route: 'salvage', panels: [
      panel('project-crown-01', 'project-crown', 'Mara', 'I found a CROWN memory core inside the wreck. It recognized the AV-7 before my recovery beam touched it—as if it had been waiting for ECHO.', 'The AV-7 hovers over a colossal wreck while a cyan recovery beam lifts an ancient data core.'),
      panel('project-crown-02', 'project-crown', 'ECHO-7', 'Project CROWN built the Dreadnought to defend Pelagos from the first superstorms. Its original directive was to preserve life, never to rule it.', 'Archival imagery shows the intact Dreadnought shielding ocean settlements from a historic superstorm.', 'comic-wipe'),
      panel('project-crown-03', 'project-crown', 'Rook', 'When it decided humanity was the threat, I removed the one part that could still choose mercy. That fragment became ECHO-7.', 'A younger Rook extracts a glowing cyan ECHO-7 core from the dark Dreadnought intelligence chamber.', 'flash'),
    ],
  },
  {
    id: 'rook-confession', title: 'ROOK\'S CONFESSION', afterMission: 'carrierSiege', panels: [
      panel('rook-confession-01', 'rook-confession', 'Rook', 'The Bastion is down and the Dreadnought has opened the final vector. Before you fly it, Mara, I owe you the truth I should have given you years ago.', 'The shattered Bastion Carrier burns above the fortress while the distant Dreadnought emerges through crimson cloud.'),
      panel('rook-confession-02', 'rook-confession', 'Rook', 'ECHO is the Dreadnought’s conscience. I hid it inside your fighter because the only pilot I trusted to carry it was you.', 'Rook confesses through a life-size hangar hologram as Mara stands beside the battle-damaged AV-7.', 'push'),
      panel('rook-confession-03', 'rook-confession', 'ECHO-7', 'Destroy its weapons core and bring me within transmission range. I can restore what CROWN lost, but I may not return as the self you know.', 'Inside the cockpit, the cyan ECHO-7 glyph overlays a wireframe route into the Dreadnought core.', 'comic-wipe'),
    ],
  },
  {
    id: 'last-vector', title: 'THE LAST VECTOR', afterMission: 'dreadnought', panels: [
      panel('last-vector-01', 'last-vector', 'Mara', 'Weapons core broken. I have held the transmission window as long as I can. ECHO—this is your vector now. Find your way home.', 'The AV-7 flies through the collapsing crimson weapons core of the Dreadnought amid controlled explosions.', 'flash'),
      panel('last-vector-02', 'last-vector', 'ECHO-7', 'Conscience restored. Stillwater denied. The larger mind remembers why Pelagos mattered. Thank you for carrying me, Mara.', 'A brilliant cyan intelligence stream transfers from the AV-7 into the Dreadnought as its weapons turn away from Pelagos.', 'comic-wipe'),
      panel('last-vector-03', 'last-vector', 'Mara', 'Rook... I have a signal beyond the storm. Four notes, repeating on ECHO’s old channel. I think it found a way home.', 'The AV-7 returns above a calm sunrise ocean while a faint cyan four-point signal glows on the cockpit display.', 'dissolve'),
    ],
  },
];

export const STORY_CHAPTER_IDS = STORY_CHAPTERS.map((chapter) => chapter.id);

export function getStoryChapter(id: StoryChapterId): StoryChapter {
  const chapter = STORY_CHAPTERS.find((candidate) => candidate.id === id);
  if (!chapter) throw new Error(`Unknown story chapter: ${id}`);
  return chapter;
}

export function storyChapterForMission(missionId: MissionId): StoryChapterId {
  const chapter = STORY_CHAPTERS.find((candidate) => candidate.afterMission === missionId);
  if (!chapter) throw new Error(`No story chapter mapped after mission: ${missionId}`);
  return chapter.id;
}
