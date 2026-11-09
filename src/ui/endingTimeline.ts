export const ENDING_OPENING_MS = 12_000;
export const ENDING_CREDIT_PAGE_MS = 18_000;

export interface EndingCreditPage {
  chapter: string;
  title: string;
  lines: readonly { role: string; name: string }[];
  note: string;
}

export const ENDING_CREDITS: readonly EndingCreditPage[] = [
  {
    chapter: '01 / THE WORLD',
    title: 'A signal worth following.',
    lines: [{ role: 'CREATIVE DIRECTION & WORLD', name: 'Tibor Banach' }],
    note: 'Aegis Vector',
  },
  {
    chapter: '02 / THE FLIGHT',
    title: 'From an idea to the stars.',
    lines: [
      { role: 'DEVELOPMENT', name: 'Codex-assisted' },
      { role: 'GAME ENGINE', name: 'Phaser' },
    ],
    note: 'Built for one more sortie.',
  },
  {
    chapter: '03 / THE CRAFT',
    title: 'A universe taking shape.',
    lines: [
      { role: '3D PRODUCTION', name: 'Blender' },
      { role: 'ART', name: 'AI-assisted production' },
    ],
    note: 'Every silhouette, a story in motion.',
  },
  {
    chapter: '04 / THE SOUND',
    title: 'The sound of coming home.',
    lines: [
      { role: 'ENDING SCORE', name: 'Homeward Vector' },
      { role: 'MUSIC GENERATION', name: 'ElevenLabs' },
    ],
    note: 'Let the last note find its way.',
  },
  {
    chapter: '05 / THE PILOT',
    title: 'Thank you for flying.',
    lines: [{ role: 'FOR EVERY PILOT WHO HELD THE LINE', name: 'This horizon is yours.' }],
    note: 'Until the next vector.',
  },
];

export const ENDING_CREDITS_COMPLETE_MS = ENDING_OPENING_MS + ENDING_CREDITS.length * ENDING_CREDIT_PAGE_MS;

export interface EndingFrame {
  phase: 'opening' | 'credits' | 'complete';
  pageIndex: number;
  progress: number;
}

/** Credits end independently of the score; nothing here exits the ending. */
export function endingFrameAt(elapsedMs: number): EndingFrame {
  const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const progress = Math.min(1, time / ENDING_CREDITS_COMPLETE_MS);
  if (time < ENDING_OPENING_MS) return { phase: 'opening', pageIndex: -1, progress };
  if (time >= ENDING_CREDITS_COMPLETE_MS) return { phase: 'complete', pageIndex: -1, progress };
  return { phase: 'credits', pageIndex: Math.floor((time - ENDING_OPENING_MS) / ENDING_CREDIT_PAGE_MS), progress };
}

/** Hidden tabs and user-paused credits consume no visual timeline time. */
export function advanceEndingTime(elapsedMs: number, deltaMs: number, paused: boolean, hidden: boolean): number {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (paused || hidden || !Number.isFinite(deltaMs)) return elapsed;
  return Math.min(ENDING_CREDITS_COMPLETE_MS, elapsed + Math.min(1000, Math.max(0, deltaMs)));
}

export function endingFreshPressAllowed(repeat: boolean, wasDown: boolean, latchedOnEntry: boolean, sinceShowMs: number): boolean {
  return !repeat && !wasDown && !latchedOnEntry && sinceShowMs >= 400;
}
