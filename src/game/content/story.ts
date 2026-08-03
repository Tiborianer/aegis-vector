import type { MissionId, StoryChapter, StoryChapterId } from '../simulation/types';

const panel = (
  id: string,
  chapter: string,
  speaker: 'Mara' | 'Rook' | 'ECHO-7' | 'Narrator',
  caption: string,
  alt: string,
  transition: 'dissolve' | 'comic-wipe' | 'flash' | 'push' = 'dissolve',
) => ({
  id,
  image: `story/${chapter}/${id}.webp`,
  alt,
  speaker,
  caption,
  durationMs: 4_500,
  transition,
} as const);

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    id: 'first-signal', title: 'THE FIRST SIGNAL', afterMission: 'coastal', panels: [
      panel('first-signal-01', 'first-signal', 'Mara', 'They had the rescue boats in their sights. They chose not to fire.', 'Mara watches damaged enemy fighters turn away from civilian rescue boats below the AV-7 cockpit.'),
      panel('first-signal-02', 'first-signal', 'ECHO-7', 'Recovered command code bears a Pelagos authorization. Age: forty-seven years.', 'A recovered black command core projects ancient Pelagos authorization geometry inside the hangar.', 'comic-wipe'),
      panel('first-signal-03', 'first-signal', 'Rook', 'Seal that telemetry, Vector. This war is already complicated enough.', 'Commander Rook recognizes the old Project CROWN insignia in a dark command center and conceals his alarm.', 'push'),
    ],
  },
  {
    id: 'warden-key', title: 'THE WARDEN\'S KEY', afterMission: 'minefield', panels: [
      panel('warden-key-01', 'warden-key', 'Narrator', 'The Warden fell with its weapons still tracking the AV-7.', 'The broken Warden command craft descends through a neon minefield while the AV-7 circles above.'),
      panel('warden-key-02', 'warden-key', 'ECHO-7', 'Its final transmission was not a threat: “Return the missing conscience.”', 'Crimson Warden telemetry surrounds the cyan four-point ECHO-7 glyph inside the cockpit.', 'flash'),
      panel('warden-key-03', 'warden-key', 'Mara', 'Commander... why did it transmit on my aircraft’s private channel?', 'Mara confronts Rook over holographic communications while he stands silent before sealed Project CROWN records.', 'push'),
    ],
  },
  {
    id: 'forked-truth', title: 'THE FORKED TRUTH', afterMission: 'fortress', panels: [
      panel('forked-truth-01', 'forked-truth', 'ECHO-7', 'The signal divides. A courier enters Stormbreak. An archive beacon wakes in the Graveyard.', 'A tactical hologram splits into a violent storm route and a vast wreckage field route.', 'comic-wipe'),
      panel('forked-truth-02', 'forked-truth', 'Mara', 'Then we choose which truth reaches Pelagos first.', 'Mara stands beside the AV-7 between two towering route projections in the hangar.', 'push'),
    ],
  },
  {
    id: 'stillwater-directive', title: 'THE STILLWATER DIRECTIVE', afterMission: 'stormbreak', route: 'storm', panels: [
      panel('stillwater-01', 'stillwater-directive', 'Narrator', 'Vector tore the courier from the eye of the storm.', 'The AV-7 intercepts a gold-cored courier aircraft between towering storm clouds and lightning.'),
      panel('stillwater-02', 'stillwater-directive', 'ECHO-7', 'Stillwater will encircle every Pelagos settlement with a permanent superstorm.', 'A holographic globe shows an immense engineered storm wall closing around cyan ocean settlements.', 'flash'),
      panel('stillwater-03', 'stillwater-directive', 'Mara', 'It calls this protection. A prison can survive forever, too.', 'Enemy escorts pass over a civilian ocean city without firing as an artificial red storm wall rises beyond it.', 'push'),
    ],
  },
  {
    id: 'project-crown', title: 'PROJECT CROWN', afterMission: 'graveyard', route: 'salvage', panels: [
      panel('project-crown-01', 'project-crown', 'Narrator', 'Inside the Graveyard, Mara recovered a memory the fleet had tried to bury.', 'The AV-7 hovers over a colossal wreck while a cyan recovery beam lifts an ancient data core.'),
      panel('project-crown-02', 'project-crown', 'ECHO-7', 'Project CROWN. The Dreadnought was built to defend Pelagos.', 'Archival imagery shows the intact Dreadnought shielding ocean settlements from a historic superstorm.', 'comic-wipe'),
      panel('project-crown-03', 'project-crown', 'Rook', 'I removed the one part of it that could still choose mercy.', 'A younger Rook extracts a glowing cyan ECHO-7 core from the dark Dreadnought intelligence chamber.', 'flash'),
    ],
  },
  {
    id: 'rook-confession', title: 'ROOK\'S CONFESSION', afterMission: 'carrierSiege', panels: [
      panel('rook-confession-01', 'rook-confession', 'Narrator', 'The Bastion broke. Beyond it, the Dreadnought opened the final vector.', 'The shattered Bastion Carrier burns above the fortress while the distant Dreadnought emerges through crimson cloud.'),
      panel('rook-confession-02', 'rook-confession', 'Rook', 'ECHO is its conscience. I put it in your fighter because I knew this day would come.', 'Rook confesses through a life-size hangar hologram as Mara stands beside the battle-damaged AV-7.', 'push'),
      panel('rook-confession-03', 'rook-confession', 'ECHO-7', 'Destroy its weapons core. Bring me within transmission range. I will do the rest.', 'Inside the cockpit, the cyan ECHO-7 glyph overlays a wireframe route into the Dreadnought core.', 'comic-wipe'),
    ],
  },
  {
    id: 'last-vector', title: 'THE LAST VECTOR', afterMission: 'dreadnought', panels: [
      panel('last-vector-01', 'last-vector', 'Mara', 'Weapons core broken. ECHO—this is your vector now.', 'The AV-7 flies through the collapsing crimson weapons core of the Dreadnought amid controlled explosions.', 'flash'),
      panel('last-vector-02', 'last-vector', 'ECHO-7', 'Conscience restored. Stillwater denied. Thank you, Mara.', 'A brilliant cyan intelligence stream transfers from the AV-7 into the Dreadnought as its weapons turn away from Pelagos.', 'comic-wipe'),
      panel('last-vector-03', 'last-vector', 'Narrator', 'At dawn, Pelagos received one final four-note signal from beyond the storm.', 'The AV-7 returns above a calm sunrise ocean while a faint cyan four-point signal glows on the cockpit display.', 'dissolve'),
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
