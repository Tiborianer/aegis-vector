import media from './intro-media.json';

export type IntroScene = keyof typeof media.scenes;
export const selectedIntroScene = media.selectedScene as IntroScene;

/** The game and the local comparison use the same artwork, lighting and action. */
export function mountIntroEndCard(root: HTMLElement, onContinue: () => void) {
  root.classList.add('intro-endcard');
  root.innerHTML = `
    <div class="launch-art" aria-hidden="true">
      <img alt="" draggable="false">
      <div class="launch-ambient"></div><div class="launch-detail"></div><div class="launch-reflection"></div>
    </div>
    <div class="launch-action">
      <p></p>
      <button id="intro-continue-button" type="button"><span></span><i aria-hidden="true">→</i></button>
    </div>`;
  const image = root.querySelector('img')!;
  const button = root.querySelector('button')!;
  const label = button.querySelector('span')!;
  const location = root.querySelector('p')!;
  button.addEventListener('click', onContinue);

  const interactive = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  function clearLight() { root.classList.remove('lit'); }
  root.addEventListener('pointermove', (event) => {
    if (!interactive.matches || event.pointerType === 'touch' || root.hidden) return;
    const rect = root.getBoundingClientRect();
    root.style.setProperty('--beam-x', ((event.clientX - rect.left) / rect.width * 100) + '%');
    root.style.setProperty('--beam-y', ((event.clientY - rect.top) / rect.height * 100) + '%');
    root.classList.add('lit');
  }, { passive: true });
  root.addEventListener('pointerleave', clearLight);
  root.addEventListener('pointercancel', clearLight);
  interactive.addEventListener('change', clearLight);

  return {
    button,
    prepare(scene: IntroScene, archive = false) {
      clearLight();
      root.dataset.scene = scene;
      image.src = media.scenes[scene];
      if (scene === 'title') root.style.setProperty('--title-art', 'url("' + image.src + '")');
      else root.style.removeProperty('--title-art');
      location.textContent = archive ? 'Flight archive' : 'Mission 01  /  Pelagos';
      label.textContent = archive ? 'Return to archive' : 'Launch Coastal Intercept';
    },
    show(focus = true) {
      root.hidden = false;
      if (focus) button.focus({ preventScroll: true });
    },
    hide() { root.hidden = true; clearLight(); },
  };
}
