import type { CampaignSnapshot } from '../game/simulation/types';
import { advanceEndingTime, ENDING_CREDITS, ENDING_CREDITS_COMPLETE_MS, endingFrameAt, endingFreshPressAllowed } from './endingTimeline';
import '../styles/ending.css';

export interface EndingSequenceOptions {
  onExit: () => void;
  /** Optional owner hook, e.g. restart the ending score. Never runs automatically. */
  onReplay?: () => void;
  reducedMotion?: boolean;
}

export interface EndingSequenceSnapshot {
  visible: boolean;
  elapsedMs: number;
  phase: 'opening' | 'credits' | 'complete';
  page: number;
  paused: boolean;
  visibilityPaused: boolean;
  reducedMotion: boolean;
}

const formatStat = (value: number): string => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)).toLocaleString('en-US');

/** DOM-only ending presentation. The owner retains scene, save, and audio control. */
export class EndingSequence {
  private readonly root: HTMLElement;
  private readonly opening: HTMLElement;
  private readonly credits: HTMLElement;
  private readonly closing: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly replayButton: HTMLButtonElement;
  private readonly exitButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private options?: EndingSequenceOptions;
  private shown = false;
  private paused = false;
  private elapsedMs = 0;
  private lastFrameAt = 0;
  private shownAt = 0;
  private renderedFrame = '';
  private renderedControlState = '';
  private frameRequest = 0;
  private heldKeys = new Set<string>();
  private latchedKeys = new Set<string>();
  private previousFocus: HTMLElement | null = null;
  private reducedMotion = false;

  constructor(root: HTMLElement | null = document.getElementById('ending-screen')) {
    if (!root) throw new Error('EndingSequence requires #ending-screen');
    this.root = root;
    const find = <T extends HTMLElement>(selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (!element) throw new Error(`EndingSequence requires ${selector}`);
      return element;
    };
    this.opening = find('[data-ending-opening]');
    this.credits = find('[data-ending-credits]');
    this.closing = find('[data-ending-closing]');
    this.pauseButton = find('[data-ending-pause]');
    this.replayButton = find('[data-ending-replay]');
    this.exitButton = find('[data-ending-exit]');
    this.status = find('[data-ending-status]');
    this.progress = find('[data-ending-progress]');
    this.image = find('[data-ending-image]');
    this.pauseButton.addEventListener('click', this.togglePause);
    this.replayButton.addEventListener('click', this.replay);
    this.exitButton.addEventListener('click', this.exit);
    this.image.addEventListener('error', this.imageFailed);
    this.image.addEventListener('load', this.imageLoaded);
    // Window capture runs before the game's document input handlers. Track keys
    // even while hidden so a key held through the transition never activates UI.
    window.addEventListener('keydown', this.keyDown, true);
    window.addEventListener('keyup', this.keyUp, true);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.motionQuery.addEventListener('change', this.motionChanged);
  }

  get isVisible(): boolean { return this.shown; }

  show(state: CampaignSnapshot, options: EndingSequenceOptions): void {
    this.hide(false);
    this.options = options;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.shown = true;
    this.paused = false;
    this.elapsedMs = 0;
    this.shownAt = performance.now();
    this.lastFrameAt = this.shownAt;
    this.renderedFrame = '';
    this.renderedControlState = '';
    this.latchedKeys = new Set(this.heldKeys);
    this.root.querySelector<HTMLElement>('[data-ending-score]')!.textContent = formatStat(state.score);
    this.root.querySelector<HTMLElement>('[data-ending-kills]')!.textContent = formatStat(state.campaignKills);
    this.root.classList.remove('hidden');
    this.root.scrollTop = 0;
    this.root.scrollLeft = 0;
    this.root.setAttribute('aria-hidden', 'false');
    this.root.dataset.imageState = this.image.complete && this.image.naturalWidth > 0 ? 'ready' : 'loading';
    this.image.src = `${import.meta.env.BASE_URL}story-v4/homeward/homeward-04.webp`;
    this.applyMotionPreference();
    this.render();
    this.root.focus({ preventScroll: true });
    this.frameRequest = requestAnimationFrame(this.tick);
  }

  hide(restoreFocus = true): void {
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    this.shown = false;
    this.root.classList.add('hidden');
    this.root.setAttribute('aria-hidden', 'true');
    this.options = undefined;
    if (restoreFocus && this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  snapshot(): EndingSequenceSnapshot {
    const frame = endingFrameAt(this.elapsedMs);
    return { visible: this.shown, elapsedMs: this.elapsedMs, phase: frame.phase, page: frame.pageIndex + 1,
      paused: this.paused, visibilityPaused: document.hidden, reducedMotion: this.reducedMotion };
  }

  destroy(): void {
    this.hide();
    this.pauseButton.removeEventListener('click', this.togglePause);
    this.replayButton.removeEventListener('click', this.replay);
    this.exitButton.removeEventListener('click', this.exit);
    this.image.removeEventListener('error', this.imageFailed);
    this.image.removeEventListener('load', this.imageLoaded);
    window.removeEventListener('keydown', this.keyDown, true);
    window.removeEventListener('keyup', this.keyUp, true);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.motionQuery.removeEventListener('change', this.motionChanged);
  }

  private readonly imageFailed = (): void => { this.root.dataset.imageState = 'unavailable'; };
  private readonly imageLoaded = (): void => { this.root.dataset.imageState = 'ready'; };
  private readonly motionChanged = (): void => { this.applyMotionPreference(); };
  private applyMotionPreference(): void {
    this.reducedMotion = this.options?.reducedMotion ?? this.motionQuery.matches;
    this.root.classList.toggle('ending-reduced-motion', this.reducedMotion);
  }

  private readonly tick = (now: number): void => {
    if (!this.shown) return;
    this.elapsedMs = advanceEndingTime(this.elapsedMs, now - this.lastFrameAt, this.paused, document.hidden);
    this.lastFrameAt = now;
    this.render();
    this.frameRequest = this.elapsedMs < ENDING_CREDITS_COMPLETE_MS ? requestAnimationFrame(this.tick) : 0;
  };

  private readonly visibilityChanged = (): void => {
    this.lastFrameAt = performance.now();
    this.root.classList.toggle('ending-tab-hidden', document.hidden);
  };

  private readonly togglePause = (): void => {
    if (!this.shown || this.elapsedMs >= ENDING_CREDITS_COMPLETE_MS) return;
    this.paused = !this.paused;
    this.lastFrameAt = performance.now();
    this.render();
  };

  private readonly replay = (): void => {
    if (!this.shown) return;
    this.elapsedMs = 0;
    this.paused = false;
    this.lastFrameAt = performance.now();
    this.renderedFrame = '';
    this.render();
    if (!this.frameRequest) this.frameRequest = requestAnimationFrame(this.tick);
    this.options?.onReplay?.();
  };

  private readonly exit = (): void => {
    if (!this.shown) return;
    const onExit = this.options?.onExit;
    this.hide(false);
    onExit?.();
  };

  private readonly blur = (): void => {
    this.heldKeys.clear();
    // Keep the entry latch until keyup: a window focus change must not turn a
    // physically-held key into an eligible first press.
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
    this.latchedKeys.delete(event.code);
    // Do not stop propagation: the game's own transition latch must release.
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    const wasDown = this.heldKeys.has(event.code);
    this.heldKeys.add(event.code);
    if (!this.shown) return;
    const fresh = endingFreshPressAllowed(event.repeat, wasDown, this.latchedKeys.has(event.code), performance.now() - this.shownAt);
    const target = event.target instanceof HTMLElement ? event.target : null;
    const ownButton = target?.closest<HTMLButtonElement>('#ending-screen button');
    // Existing audio controls remain usable above this overlay.
    const audioControl = target?.closest('#audio-panel, #audio-button');
    if (audioControl && fresh) return;
    if (event.code === 'Tab' && fresh) {
      const controls = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const audioButton = document.querySelector<HTMLButtonElement>('#audio-button:not(.hidden)');
      if (audioButton) controls.push(audioButton);
      const activeIndex = controls.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.shiftKey
        ? (activeIndex <= 0 ? controls.length - 1 : activeIndex - 1)
        : (activeIndex + 1) % controls.length;
      controls[nextIndex]?.focus({ preventScroll: true });
    } else if ((event.code === 'Enter' || event.code === 'Space') && ownButton && !ownButton.disabled && fresh) {
      ownButton.click();
    }
    // There are deliberately no Escape / gameplay-key shortcuts to exit.
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private render(): void {
    this.root.dataset.endingElapsedMs = String(Math.floor(this.elapsedMs));
    const frame = endingFrameAt(this.elapsedMs);
    const identity = `${frame.phase}-${frame.pageIndex}`;
    if (identity !== this.renderedFrame) {
      this.renderedFrame = identity;
      this.root.dataset.endingPhase = frame.phase;
      this.opening.hidden = frame.phase !== 'opening';
      this.credits.hidden = frame.phase !== 'credits';
      this.closing.hidden = frame.phase !== 'complete';
      if (frame.phase === 'credits') {
        const page = ENDING_CREDITS[frame.pageIndex];
        const chapter = document.createElement('p');
        chapter.className = 'ending-chapter'; chapter.textContent = page.chapter;
        const title = document.createElement('h2');
        title.className = 'ending-credit-title'; title.textContent = page.title;
        const people = document.createElement('dl');
        people.className = 'ending-credit-list';
        for (const line of page.lines) {
          const group = document.createElement('div');
          const role = document.createElement('dt'); role.textContent = line.role;
          const name = document.createElement('dd'); name.textContent = line.name;
          group.append(role, name); people.append(group);
        }
        const note = document.createElement('p');
        note.className = 'ending-credit-note'; note.textContent = page.note;
        this.credits.replaceChildren(chapter, title, people, note);
      }
    }
    const complete = frame.phase === 'complete';
    const controlState = `${identity}-${this.paused}`;
    if (controlState !== this.renderedControlState) {
      this.renderedControlState = controlState;
      this.pauseButton.disabled = complete;
      this.pauseButton.textContent = this.paused ? 'Resume credits' : 'Pause credits';
      this.pauseButton.setAttribute('aria-pressed', String(this.paused));
      this.root.classList.toggle('ending-paused', this.paused);
      this.status.textContent = complete ? 'THE HORIZON IS YOURS' : this.paused ? 'CREDITS PAUSED'
        : frame.phase === 'opening' ? 'A MOMENT OF QUIET' : `CREDITS ${String(frame.pageIndex + 1).padStart(2, '0')} / ${String(ENDING_CREDITS.length).padStart(2, '0')}`;
    }
    this.progress.style.transform = `scaleX(${frame.progress})`;
  }
}
