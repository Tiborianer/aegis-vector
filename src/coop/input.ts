import type { Pair, Seat } from './campaign';
export const ACTIONS = ['up', 'down', 'left', 'right', 'fire', 'emp'] as const;
export type Action = (typeof ACTIONS)[number];
export type Bindings = Record<Action, string>;
export const DEFAULT_KEYS: Pair<Bindings> = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'KeyF', emp: 'KeyG' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'KeyJ', emp: 'KeyK' },
];
export function keyLabel(code: string): string {
  return code.replace(/^Key|^Digit/, '').replace('Arrow', '');
}
export class SquadInput {
  keys: Pair<Bindings> = structuredClone(DEFAULT_KEYS);
  active = false;
  onlineSeat?: Seat;
  private held: Pair<Set<Action>> = [new Set(), new Set()];
  private empEdge: Pair<boolean> = [false, false];
  private pressed = new Set<string>();
  private ignore = new Set<string>();
  onAction?: (seat: Seat, action: Action, down: boolean) => void;
  onRemote?: (seat: Seat, action: Action, down: boolean) => void;
  capturing?: (code: string) => void;
  install(): void {
    try {
      const saved = JSON.parse(localStorage.getItem('aegis-coop-keys') || 'null');
      if (
        Array.isArray(saved) &&
        saved.length === 2 &&
        saved.every((s) => s && ACTIONS.every((a) => typeof s[a] === 'string')) &&
        new Set(saved.flatMap((s) => ACTIONS.map((a) => s[a]))).size === 12
      )
        this.keys = saved as Pair<Bindings>;
    } catch {
      /* Defaults work with storage disabled. */
    }
    window.addEventListener('keydown', this.handle, true);
    window.addEventListener('keyup', this.handle, true);
    window.addEventListener('blur', () => this.clear(false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear(false);
    });
  }
  bind(seat: Seat, action: Action, code: string): boolean {
    if (
      !/^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Comma|Period|Slash|Semicolon|Quote|Bracket(Left|Right)|Numpad[0-9])$/.test(
        code,
      ) ||
      code === 'KeyP'
    )
      return false;
    if (this.keys.some((row, i) => ACTIONS.some((a) => (seat !== i || a !== action) && row[a] === code)))
      return false;
    this.keys[seat][action] = code;
    try {
      localStorage.setItem('aegis-coop-keys', JSON.stringify(this.keys));
    } catch {
      /* Session bindings still apply. */
    }
    return true;
  }
  private handle = (e: KeyboardEvent): void => {
    if (
      !this.active ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      (e.target instanceof HTMLElement && (e.target.matches('input,textarea') || e.target.closest('.equipment-closeup,.equipment-inspect-button')))
    )
      return;
    const down = e.type === 'keydown';
    if (this.capturing && down) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) {
        this.ignore.add(e.code);
        this.capturing(e.code);
      }
      return;
    }
    if (this.ignore.has(e.code)) {
      if (!down) this.ignore.delete(e.code);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const network: Partial<Record<string, Action>> = {
      KeyW: 'up',
      ArrowUp: 'up',
      KeyS: 'down',
      ArrowDown: 'down',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      Space: 'fire',
      KeyZ: 'fire',
      KeyX: 'emp',
      ShiftLeft: 'emp',
      ShiftRight: 'emp',
    };
    for (const seat of [0, 1] as const) {
      if (this.onlineSeat !== undefined && this.onlineSeat !== seat) continue;
      const action =
        this.onlineSeat === undefined ? ACTIONS.find((a) => this.keys[seat][a] === e.code) : network[e.code];
      if (!action) continue;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (down) {
        if (e.repeat || this.pressed.has(e.code)) return;
        this.pressed.add(e.code);
      } else this.pressed.delete(e.code);
      if (!down && this.onlineSeat !== undefined && [...this.pressed].some((key) => network[key] === action))
        return;
      this.set(seat, action, down);
      this.onRemote?.(seat, action, down);
      return;
    }
  };
  set(seat: Seat, action: Action, down: boolean): void {
    if (this.held[seat].has(action) === down) return;
    if (down) this.held[seat].add(action);
    else this.held[seat].delete(action);
    if (down && action === 'emp') this.empEdge[seat] = true;
    this.onAction?.(seat, action, down);
  }
  isDown(seat: Seat, action: Action): boolean {
    return this.held[seat].has(action);
  }
  axes(seat: Seat) {
    const h = this.held[seat];
    return {
      x: Number(h.has('right')) - Number(h.has('left')),
      y: Number(h.has('down')) - Number(h.has('up')),
      fire: h.has('fire'),
    };
  }
  takeEmp(seat: Seat): boolean {
    const pressed = this.empEdge[seat];
    this.empEdge[seat] = false;
    return pressed;
  }
  clear(untilRelease = true): void {
    if (untilRelease) for (const code of this.pressed) this.ignore.add(code);
    else this.ignore.clear();
    this.pressed.clear();
    for (const seat of [0, 1] as const) {
      for (const action of this.held[seat]) this.onRemote?.(seat, action, false);
      this.held[seat].clear();
      this.empEdge[seat] = false;
    }
  }
}
export const squadInput = new SquadInput();
