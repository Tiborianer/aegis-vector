import type { StoryPanel } from '../simulation/types';

// Shipping-only metadata. Production prompts and local source paths stay out of the game bundle.
type FrameMetadata = Required<Pick<StoryPanel, 'image' | 'shot' | 'motion' | 'focalPoint' | 'location'>>;

export const STORY_V5_FRAMES = {
  "first-signal-01": {
    "image": "story-v5/first-signal/01.webp",
    "shot": "wide",
    "motion": "drift-right",
    "focalPoint": "56% 43%",
    "location": "PELAGOS COAST // RESCUE LANE"
  },
  "first-signal-02": {
    "image": "story-v5/first-signal/02.webp",
    "shot": "over-shoulder",
    "motion": "push-in",
    "focalPoint": "56% 40%",
    "location": "KESTREL COCKPIT // THE WITHDRAWAL"
  },
  "first-signal-03": {
    "image": "story-v5/first-signal/03.webp",
    "shot": "insert",
    "motion": "pull-back",
    "focalPoint": "52% 42%",
    "location": "RECOVERY DECK // COMMAND CORE"
  },
  "first-signal-04": {
    "image": "story-v5/first-signal/04.webp",
    "shot": "insert",
    "motion": "push-in",
    "focalPoint": "51% 42%",
    "location": "DIAGNOSTIC TRAY // A FAMILIAR SIGNATURE"
  },
  "first-signal-05": {
    "image": "story-v5/first-signal/05.webp",
    "shot": "over-shoulder",
    "motion": "drift-left",
    "focalPoint": "52% 40%",
    "location": "FORWARD HANGAR // A WITHHELD ANSWER"
  },
  "first-signal-06": {
    "image": "story-v5/first-signal/06.webp",
    "shot": "portrait",
    "motion": "drift-right",
    "focalPoint": "50% 50%",
    "location": "FLEET COMMAND // THE SEALED ARCHIVE"
  },
  "warden-key-01": {
    "image": "story-v5/warden-key/01.webp",
    "shot": "wide",
    "motion": "pull-back",
    "focalPoint": "53% 43%",
    "location": "MINEFIELD // THE WARDEN'S LAST SIGNAL"
  },
  "warden-key-02": {
    "image": "story-v5/warden-key/02.webp",
    "shot": "reaction",
    "motion": "drift-left",
    "focalPoint": "52% 39%",
    "location": "KESTREL COCKPIT // INCOMING TRANSMISSION"
  },
  "warden-key-03": {
    "image": "story-v5/warden-key/03.webp",
    "shot": "insert",
    "motion": "push-in",
    "focalPoint": "51% 42%",
    "location": "ECHO-7 // THE MISSING CONSCIENCE"
  },
  "warden-key-04": {
    "image": "story-v5/warden-key/04.webp",
    "shot": "wide",
    "motion": "drift-right",
    "focalPoint": "52% 42%",
    "location": "MAINTENANCE HANGAR // FACE TO FACE"
  },
  "warden-key-05": {
    "image": "story-v5/warden-key/05.webp",
    "shot": "over-shoulder",
    "motion": "drift-left",
    "focalPoint": "58% 40%",
    "location": "KESTREL DIAGNOSTICS // THE EXTRACTION"
  },
  "warden-key-06": {
    "image": "story-v5/warden-key/06.webp",
    "shot": "reaction",
    "motion": "pull-back",
    "focalPoint": "43% 40%",
    "location": "MAINTENANCE STAIR // THE RIGHT TO REFUSE"
  },
  "warden-key-07": {
    "image": "story-v5/warden-key/07.webp",
    "shot": "departure",
    "motion": "push-in",
    "focalPoint": "55% 42%",
    "location": "FORTRESS APPROACH // THE NEXT VECTOR"
  },
  "rook-confession-01": {
    "image": "story-v5/rook-confession/01.webp",
    "shot": "wide",
    "motion": "pull-back",
    "focalPoint": "57% 43%",
    "location": "BASTION WRECK // THE OPENING"
  },
  "rook-confession-02": {
    "image": "story-v5/rook-confession/02.webp",
    "shot": "portrait",
    "motion": "push-in",
    "focalPoint": "50% 40%",
    "location": "FORWARD HANGAR // A CHOICE WITHHELD"
  },
  "rook-confession-03": {
    "image": "story-v5/rook-confession/03.webp",
    "shot": "over-shoulder",
    "motion": "push-in",
    "focalPoint": "55% 40%",
    "location": "KESTREL COCKPIT // ECHO'S REQUEST"
  },
  "last-vector-01": {
    "image": "story-v5/last-vector/01.webp",
    "shot": "wide",
    "motion": "drift-right",
    "focalPoint": "54% 42%",
    "location": "PALE HARROW // TRANSMISSION WINDOW"
  },
  "last-vector-02": {
    "image": "story-v5/last-vector/02.webp",
    "shot": "wide",
    "motion": "pull-back",
    "focalPoint": "55% 41%",
    "location": "PELAGOS ORBIT // CONSCIENCE RESTORED"
  },
  "last-vector-03": {
    "image": "story-v5/last-vector/03.webp",
    "shot": "departure",
    "motion": "drift-left",
    "focalPoint": "51% 41%",
    "location": "BEYOND THE STORM // ONE LAST CORRIDOR"
  }
} as const satisfies Record<string, FrameMetadata>;

export function storyV5Frame(panelId: string): FrameMetadata {
  const frame = STORY_V5_FRAMES[panelId as keyof typeof STORY_V5_FRAMES];
  if (!frame) throw new Error(`Missing V5 frame metadata: ${panelId}`);
  return frame;
}
