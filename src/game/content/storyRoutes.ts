import type { CampaignRoute, StoryChapter, StoryPanel } from '../simulation/types';

export interface StoryRouteContext {
  /** Only supplied when the first route's reward was earned. */
  earlyRoute?: CampaignRoute;
  /** The independently chosen evidence mission after Fortress. */
  evidenceRoute?: CampaignRoute;
}

export const AURORA_CHAPTER: StoryChapter = {
  id: 'aurora-key', title: 'THE SHELTERING SIGNAL', afterMission: 'aurora', route: 'storm',
  presentation: 'cinematic', musicTrack: 'story-revelation', panels: [
    { id: 'aurora-key-01', image: 'story-v6/aurora-arrival.webp', speaker: 'Hana',
      caption: 'Relay secured. The ring diverted its last power into the evacuation lane. Even after we broke its guns, it was still trying to shelter someone.',
      alt: 'The silver Kestrel crosses a broken orbital shield ring above turquoise aurora; a surviving cyan relay glows among the shattered trusses.',
      location: 'AURORA REACH // THE LAST SAFE LANE', shot: 'wide', motion: 'drift-right', focalPoint: '64% 43%', durationMs: 11000, transition: 'dissolve' },
    { id: 'aurora-key-02', image: 'story-v6/aurora-hana.webp', speaker: 'ECHO-7',
      caption: 'Its shield geometry fits the Kestrel. Aegis Bastion is online. There is another signal inside the relay: “Return the missing conscience.” It is addressed to me.',
      alt: 'Hana studies the circular cyan relay display through her curved cockpit canopy, the aurora and broken orbital ring reflected in the glass.',
      location: 'KESTREL // AEGIS BASTION ONLINE', shot: 'reaction', motion: 'push-in', focalPoint: '38% 43%', durationMs: 11000, transition: 'dissolve' },
    { id: 'aurora-key-03', image: 'story-v6/aurora-vale.webp', speaker: 'Vale',
      caption: 'ECHO was CROWN’s ethical decision core. I removed it when protection became confinement. I put it aboard your fighter, Hana. You deserved to know before you flew.',
      alt: 'Commander Vale studies the recovered shield relay in an engineering gallery as the silver Kestrel waits in the hangar beyond the glass.',
      location: 'ENGINEERING GALLERY // THE MISSING CONSCIENCE', shot: 'portrait', motion: 'drift-left', focalPoint: '34% 44%', durationMs: 11000, transition: 'dissolve' },
    { id: 'aurora-key-04', image: 'story-v6/aurora-arrival.webp', speaker: 'Hana',
      caption: 'Then we give it a choice again. ECHO, hold that shield frequency. It can get us through the fortress. Once we reach the archive, we choose our next vector together.',
      alt: 'The tiny blue engines of the Kestrel lead away from the recovered relay toward the open auroral horizon beyond the shattered ring.',
      location: 'NEXT VECTOR // FORTRESS APPROACH', shot: 'departure', motion: 'pull-back', focalPoint: '75% 35%', durationMs: 9000, transition: 'dissolve' },
  ],
};

/** A shared ending, reached with different evidence. IDs stay stable for saves.
 * These are authored route cuts, not mutations of the canonical archive frames. */
export function routeStoryChapter(chapter: StoryChapter, routes?: CampaignRoute | StoryRouteContext): StoryChapter {
  // A string remains convenient for the existing single-route Archive previews.
  const { earlyRoute, evidenceRoute } = typeof routes === 'string'
    ? { earlyRoute: routes, evidenceRoute: routes } : routes ?? {};
  if (!earlyRoute && !evidenceRoute) return chapter;
  const earlyStorm = earlyRoute === 'storm';
  const storm = evidenceRoute === 'storm';
  const panels = chapter.panels.map((panel) => ({ ...panel }));
  const replace = (index: number, patch: Partial<StoryPanel>) => { panels[index] = { ...panels[index], ...patch }; };
  if (chapter.id === 'forked-truth' && earlyRoute) {
    replace(0, {
      image: earlyStorm ? 'story-v6/fortress-shield.webp' : 'story-v6/fortress-breach.webp',
      caption: earlyStorm ? 'The Aurora frequency opened the fortress shield. I am inside. ECHO, the relay is answering something deeper in the archive.'
        : 'The ARC Resonator opened the fortress shell. I am inside. ECHO, the Warden’s memory key is waking the old archive.',
      alt: earlyStorm ? 'The Kestrel holds a round cyan shield in the fortress wreck while evacuation craft thread a safe passage behind it.'
        : 'The Kestrel passes a narrow newly broken fortress armor seam, warm light revealing its layered machinery and exposed archive vault.',
    });
    replace(2, { caption: earlyStorm
      ? 'Aurora got us through the shield. Now the archive gives us two leads: intercept the courier, or recover the memory CROWN tried to bury.'
      : 'The Warden’s key opened the archive. Now we have two leads: recover the buried memory, or intercept the live order before it reaches the fleet.' });
    replace(4, { caption: 'Stormbreak: intercept the order before it reaches the fleet. Graveyard: recover the original command key. Choose your route in the hangar, Hana. Your earlier choice does not close either path. I will hold the corridor.',
      location: 'SECOND FORK // TWO OPEN VECTORS' });
  } else if (chapter.id === 'rook-confession' && evidenceRoute) {
    replace(0, { image: storm ? 'story-v3/stillwater-directive/03.jpg' : 'story-v3/project-crown/03.jpg',
      caption: storm ? 'The Bastion is down. Your courier packet proved what Stillwater will do: shelter the world by sealing every way out. I owe you the rest of the truth.'
        : 'The Bastion is down. The memory you recovered showed what CROWN was meant to be: a shield for the people leaving home. I owe you the rest of the truth.',
      alt: storm ? 'The recovered Stillwater forecast shows red containment rings closing around settlements beneath engineered storms.'
        : 'The recovered amber archive shows Pale Harrow shielding evacuation ships from an oncoming debris field.',
      location: storm ? 'RECOVERED EVIDENCE // THE CONTAINMENT ORDER' : 'RECOVERED EVIDENCE // THE ORIGINAL PROMISE' });
  } else if (chapter.id === 'last-vector') {
    if (evidenceRoute) replace(1, { caption: storm
      ? 'Your live directive gave me the override window. Conscience restored. Stillwater denied. Protection is not permission to imprison. Thank you, Hana.'
      : 'Your recovered memory gave me the human witness. Conscience restored. Stillwater denied. We were built to bring people home. Thank you, Hana.' });
    if (earlyRoute) replace(1, {
      image: earlyStorm ? 'story-v6/fortress-shield.webp' : 'story-v6/fortress-breach.webp',
      alt: earlyStorm ? 'The round Kestrel shield lights a safe lane through broken fortress ribs, recalling the evacuation corridor opened at Aurora.'
        : 'The narrow opening in the fortress armor recalls the breach made by the recovered ARC Resonator after Minefield.',
      location: earlyStorm ? 'ECHO MEMORY // THE SAFE LANE' : 'ECHO MEMORY // THE OPENING' });
  } else if (chapter.id === 'homeward' && evidenceRoute) {
    replace(1, { image: earlyStorm ? 'story-v6/aurora-vale.webp' : 'story-v5/warden-key/05.webp',
      caption: storm ? 'The intercepted order is public now. No more sealed borders. Open the rescue lanes and bring our people home. Today nobody needs permission to leave.'
        : 'The old command memory is public now. We will remember what CROWN protected—and why a human must always be free to say no. Bring our people home.',
      alt: earlyStorm ? 'Vale stands with the recovered Aurora shield relay, contemplating the difference between shelter and confinement.'
        : 'Vale and Hana face the recovered ECHO architecture in the hangar, the truth about the command core finally shared.',
      location: storm ? 'AFTER STORMBREAK // SHELTER WITHOUT WALLS' : 'AFTER THE GRAVEYARD // A MEMORY RETURNED' });
  }
  return { ...chapter, panels };
}
