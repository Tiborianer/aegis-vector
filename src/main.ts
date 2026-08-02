import Phaser from 'phaser';
import './styles.css';
import { SoundEngine, type SoundCue } from './audio/SoundEngine';
import { WEAPON_LABELS, WORLD_HEIGHT, WORLD_WIDTH } from './game/content/balance';
import type { Difficulty, GameSnapshot, WeaponType } from './game/simulation/types';
import { BootScene } from './phaser/scenes/BootScene';
import { BattleScene } from './phaser/scenes/BattleScene';

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required UI element: #${id}`);
  return element as T;
};

const ui = {
  hud: required<HTMLElement>('hud'),
  start: required<HTMLElement>('start-screen'),
  pause: required<HTMLElement>('pause-screen'),
  result: required<HTMLElement>('result-screen'),
  launch: required<HTMLButtonElement>('launch-button'),
  resume: required<HTMLButtonElement>('resume-button'),
  restart: required<HTMLButtonElement>('restart-button'),
  replay: required<HTMLButtonElement>('replay-button'),
  pauseButton: required<HTMLButtonElement>('pause-button'),
  soundButton: required<HTMLButtonElement>('sound-button'),
  hull: required<HTMLElement>('hull-pips'),
  shield: required<HTMLElement>('shield-pips'),
  shieldTimer: required<HTMLElement>('shield-timer'),
  score: required<HTMLElement>('score-value'),
  multiplier: required<HTMLElement>('multiplier'),
  highScore: required<HTMLElement>('high-score'),
  stageProgress: required<HTMLElement>('stage-progress'),
  stageTime: required<HTMLElement>('stage-time'),
  bossHud: required<HTMLElement>('boss-hud'),
  bossProgress: required<HTMLElement>('boss-progress'),
  bossPercent: required<HTMLElement>('boss-percent'),
  weaponRack: required<HTMLElement>('weapon-rack'),
  announcement: required<HTMLElement>('announcement'),
  resultKicker: required<HTMLElement>('result-kicker'),
  resultTitle: required<HTMLElement>('result-title'),
  resultScore: required<HTMLElement>('result-score'),
  resultKills: required<HTMLElement>('result-kills'),
};

let difficulty: Difficulty = 'pilot';
let latestSnapshot: GameSnapshot | undefined;
let ready = false;
let announceTimer = 0;
const audio = new SoundEngine();

ui.launch.disabled = true;
ui.launch.textContent = 'INITIALIZING…';

document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
  button.addEventListener('click', () => {
    difficulty = button.dataset.difficulty as Difficulty;
    document.querySelectorAll('[data-difficulty]').forEach((item) => item.classList.toggle('selected', item === button));
  });
});

ui.launch.addEventListener('click', () => {
  if (!ready) return;
  void audio.unlock();
  launchRun();
});
ui.replay.addEventListener('click', () => launchRun());
ui.restart.addEventListener('click', () => launchRun());
ui.pauseButton.addEventListener('click', () => window.dispatchEvent(new CustomEvent('aegis:pause')));
ui.resume.addEventListener('click', () => window.dispatchEvent(new CustomEvent('aegis:resume')));
ui.soundButton.addEventListener('click', () => {
  audio.setEnabled(!audio.isEnabled());
  ui.soundButton.textContent = audio.isEnabled() ? 'SOUND ON' : 'SOUND OFF';
});

window.addEventListener('aegis:ready', () => {
  ready = true;
  ui.launch.disabled = false;
  ui.launch.innerHTML = 'LAUNCH MISSION <span>→</span>';
});

window.addEventListener('aegis:state', (raw) => {
  latestSnapshot = (raw as CustomEvent<GameSnapshot>).detail;
  updateHud(latestSnapshot);
});

window.addEventListener('aegis:announce', (raw) => {
  const message = (raw as CustomEvent<string>).detail;
  window.clearTimeout(announceTimer);
  ui.announcement.classList.remove('show');
  void ui.announcement.offsetWidth;
  ui.announcement.textContent = message;
  ui.announcement.classList.add('show');
  announceTimer = window.setTimeout(() => ui.announcement.classList.remove('show'), 2_300);
});

window.addEventListener('aegis:sound', (raw) => audio.play((raw as CustomEvent<SoundCue>).detail));

window.addEventListener('aegis:pause-state', (raw) => {
  const paused = (raw as CustomEvent<boolean>).detail;
  ui.pause.classList.toggle('hidden', !paused);
});

window.addEventListener('aegis:ended', (raw) => {
  const snapshot = (raw as CustomEvent<GameSnapshot>).detail;
  const victory = snapshot.mode === 'victory';
  ui.pause.classList.add('hidden');
  ui.result.classList.remove('hidden');
  ui.resultKicker.textContent = victory ? 'MISSION COMPLETE // PELAGOS ARRAY' : 'MISSION FAILED // SIGNAL LOST';
  ui.resultTitle.textContent = victory ? 'SECTOR SECURED' : 'FIGHTER DOWN';
  ui.resultTitle.style.color = victory ? 'var(--cyan)' : 'var(--danger)';
  ui.resultScore.textContent = formatScore(snapshot.score);
  ui.resultKills.textContent = String(snapshot.kills);
});

function launchRun(): void {
  ui.start.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  window.dispatchEvent(new CustomEvent<Difficulty>('aegis:start', { detail: difficulty }));
}

function updateHud(snapshot: GameSnapshot): void {
  renderPips(ui.hull, snapshot.hullMax, snapshot.hull, 'hull');
  renderPips(ui.shield, snapshot.shieldMax, snapshot.shield, 'shield');
  ui.shieldTimer.textContent = snapshot.shieldRechargeRemainingMs > 0
    ? `${(snapshot.shieldRechargeRemainingMs / 1_000).toFixed(1)}s`
    : 'READY';
  ui.score.textContent = formatScore(snapshot.score);
  ui.multiplier.textContent = `×${snapshot.multiplier}`;
  ui.highScore.textContent = `BEST ${formatScore(snapshot.highScore)}`;

  const progress = Math.min(1, snapshot.stageElapsedMs / snapshot.stageDurationMs);
  ui.stageProgress.style.width = `${progress * 100}%`;
  const remainingSeconds = Math.max(0, Math.ceil((snapshot.stageDurationMs - snapshot.stageElapsedMs) / 1_000));
  ui.stageTime.textContent = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  ui.bossHud.classList.toggle('hidden', !snapshot.bossActive);
  ui.bossProgress.style.width = `${snapshot.bossHealthRatio * 100}%`;
  ui.bossPercent.textContent = `${Math.ceil(snapshot.bossHealthRatio * 100)}%`;
  renderWeapons(snapshot);
}

function renderPips(container: HTMLElement, max: number, value: number, type: 'hull' | 'shield'): void {
  const signature = `${type}:${max}:${value}`;
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.replaceChildren(...Array.from({ length: max }, (_, index) => {
    const pip = document.createElement('i');
    pip.className = `pip ${type}${index < value ? ' active' : ''}`;
    return pip;
  }));
}

function renderWeapons(snapshot: GameSnapshot): void {
  const weaponTypes = Object.keys(WEAPON_LABELS) as WeaponType[];
  const signature = weaponTypes.map((type) => snapshot.weapons[type]).join(':');
  if (ui.weaponRack.dataset.signature === signature) return;
  ui.weaponRack.dataset.signature = signature;
  ui.weaponRack.replaceChildren(...weaponTypes.map((type) => {
    const data = WEAPON_LABELS[type];
    const level = snapshot.weapons[type];
    const chip = document.createElement('div');
    chip.className = `weapon-chip${level > 0 ? ' active' : ''}`;
    chip.style.setProperty('--weapon', data.css);
    chip.innerHTML = `<b>${data.short}</b><span>${[1, 2, 3].map((dot) => `<i class="level-dot${dot <= level ? ' on' : ''}"></i>`).join('')}</span>`;
    return chip;
  }));
}

function formatScore(score: number): string {
  return Math.max(0, Math.round(score)).toString().padStart(6, '0');
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  parent: 'game-canvas',
  backgroundColor: '#050b19',
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: new URLSearchParams(window.location.search).get('hitboxes') === '1',
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    keyboard: {
      capture: [Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN],
    },
  },
  scene: [BootScene, BattleScene],
};

new Phaser.Game(config);

// Useful to browser tests and harmless in production.
Object.defineProperty(window, '__AEGIS_LAST_STATE__', {
  get: () => latestSnapshot,
  configurable: true,
});
