export interface IntroVideoDefinition {
  file: string;
  poster: string;
  expectedDurationSeconds: number;
  maximumBytes: number;
  hasBakedAudio: true;
}

export type IntroPlaybackState =
  | 'preloading'
  | 'buffering'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'fallback'
  | 'complete';

export interface IntroCaption {
  startsAtSeconds: number;
  endsAtSeconds: number;
  speaker: 'ROOK';
  text: string;
}

export const INTRO_VIDEO: IntroVideoDefinition = {
  file: 'cinematics/video/aegis-vector-intro-v1.mp4',
  poster: 'cinematics/keyframes/scene-01-start.webp',
  expectedDurationSeconds: 34.02,
  maximumBytes: 50 * 1024 * 1024,
  hasBakedAudio: true,
};

export const INTRO_CAPTIONS: readonly IntroCaption[] = [
  {
    startsAtSeconds: 6.1,
    endsAtSeconds: 8.8,
    speaker: 'ROOK',
    text: 'Vector, CROWN is awake. Launch now.',
  },
] as const;

export function formatIntroTime(currentSeconds: number, durationSeconds = INTRO_VIDEO.expectedDurationSeconds): string {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : INTRO_VIDEO.expectedDurationSeconds;
  const safeCurrent = Math.min(safeDuration, Math.max(0, Number.isFinite(currentSeconds) ? currentSeconds : 0));
  const format = (seconds: number): string => {
    const rounded = Math.floor(seconds);
    return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
  };
  return `${format(safeCurrent)} / ${format(Math.round(safeDuration))}`;
}

export function introCaptionAt(seconds: number): IntroCaption | undefined {
  return INTRO_CAPTIONS.find((caption) => seconds >= caption.startsAtSeconds && seconds < caption.endsAtSeconds);
}

export function introMetadataIsValid(durationSeconds: number, width: number, height: number): boolean {
  return durationSeconds >= 33.8
    && durationSeconds <= 34.3
    && width >= 1920
    && height >= 1080;
}
