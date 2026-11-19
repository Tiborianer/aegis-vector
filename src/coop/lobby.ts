import { element } from './panel';
export function makeLobby(shell: HTMLElement) {
  const screen = element('section', 'coop-screen hidden');
  screen.id = 'coop-lobby';
  shell.append(screen);
  return {
    screen,
    open(start: () => void, resume: (() => void) | undefined, back: () => void) {
      screen.classList.remove('hidden');
      screen.replaceChildren();
      const wrap = element('div', 'coop-wrap coop-lobby'),
        head = element('header', 'coop-header');
      head.append(element('small', '', 'PELAGOS CAMPAIGN / TWO PILOTS'), element('h2', '', 'Squadron hangar'));
      wrap.append(head);
      const button = (label: string, id: string, click: () => void) => {
        const b = element('button', 'secondary-button', label);
        b.id = id;
        b.onclick = click;
        wrap.append(b);
      };
      button('Start local co-op', 'coop-new', start);
      if (resume) button('Resume local co-op', 'coop-resume', resume);
      const network = element('div', 'coop-room-controls');
      wrap.append(network);
      button('Return to title', 'coop-back', back);
      screen.append(wrap);
      return network;
    },
  };
}
