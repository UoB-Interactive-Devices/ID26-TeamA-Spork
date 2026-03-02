/**
 * Tutorial page — grid of all available props/tools.
 * Tapping one opens the TutorialDetail screen for that motion.
 */
import { router } from './router.ts';
import { ALL_MOTIONS, MOTION_META } from '../types/motion.types.ts';

export function createTutorial(): HTMLElement {
  const page = document.createElement('div');
  page.id = 'tutorial';
  page.className = 'page tutorial-bg';

  page.innerHTML = `
    <button class="btn btn--ghost btn--small back-btn" data-action="back">
      <span class="btn-icon btn-back-icon"></span>
      Back
    </button>
    <div class="stack stack--xl" style="text-align: center; width: 100%; max-width: 720px;">
      <div>
        <h2>Learn Your Props</h2>
        <p class="subtitle">Tap a prop to see how it works</p>
      </div>
      <div class="grid-3 stagger-children" id="prop-cards"></div>
    </div>
  `;

  const grid = page.querySelector('#prop-cards')!;

  ALL_MOTIONS.forEach((motion) => {
    const meta = MOTION_META[motion];
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    card.innerHTML = `
      <div class="card__emoji">${meta.emoji}</div>
      <div class="card__title">${meta.prop}</div>
      <div class="card__subtitle">${meta.label} — ${meta.description}</div>
    `;

    card.addEventListener('click', () => {
      router.go('tutorial-detail', { motion });
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        router.go('tutorial-detail', { motion });
      }
    });

    grid.appendChild(card);
  });

  page.querySelector('[data-action="back"]')!
    .addEventListener('click', () => router.home());

  return page;
}
