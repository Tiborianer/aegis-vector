import '../styles/introEndCard.css';
import { mountIntroEndCard, type IntroScene } from './introEndCard';

const screen = document.querySelector<HTMLElement>('#screen')!;
const choices = document.querySelectorAll<HTMLButtonElement>('nav [data-scene]');
const card = mountIntroEndCard(document.querySelector('#review-card')!, () => {
  // The existing mission lab flies the real mission with an isolated save.
  const origin = location.protocol === 'file:' ? 'http://127.0.0.1:4218/' : './';
  location.assign(new URL('?lab=1&mission=coastal&loadout=starter&god=0', new URL(origin, location.href)));
});

function selectScene() {
  const selected = [...choices].find(button => button.dataset.scene === location.hash.slice(1)) ?? choices[0];
  card.prepare(selected.dataset.scene as IntroScene);
  card.show(false);
  for (const button of choices) button.setAttribute('aria-pressed', String(button === selected));
}

for (const button of choices) button.addEventListener('click', () => { location.hash = button.dataset.scene!; });
window.addEventListener('hashchange', selectScene);
selectScene();

const full = document.querySelector<HTMLButtonElement>('#full')!;
if (screen.requestFullscreen && document.fullscreenEnabled) {
  full.addEventListener('click', () => { void screen.requestFullscreen().catch(() => full.focus()); });
} else full.hidden = true;
