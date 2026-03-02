/**
 * MainMenu page — the landing screen with 3 warm, tactile buttons.
 *
 * ┌──────────────────────┐
 * │       ☕ Spork        │
 * │  the motion brewing  │
 * │       game           │
 * │                      │
 * │    [ ▶ Play    ]     │
 * │    [ 📖 Tutorial ]    │
 * │    [ 🎨 Create  ]    │
 * │                      │
 * │        ● connected   │
 * └──────────────────────┘
 */
import { router } from './router.ts';
import { motionDetector } from '../components/MotionDetector.ts';

export function createMainMenu(): HTMLElement {
  const page = document.createElement('div');
  page.id = 'main-menu';
  page.className = 'page menu-bg';

  page.innerHTML = `
    <div class="stack stack--xl" style="text-align: center;">
      <!-- Logo / brand area — swap div for <img> later -->
      <div class="menu-logo-placeholder" aria-label="Spork logo">
        <span style="font-size: 4.5rem; display: block; margin-bottom: var(--space-sm);">☕</span>
        <h1>Spork</h1>
        <p class="subtitle">the motion brewing game</p>
      </div>

      <!-- Three main buttons -->
      <nav class="stack stagger-children" role="navigation" aria-label="Main Menu">
        <button class="btn btn--primary btn--large" data-action="play">
          <span class="btn-icon btn-play-icon"></span>
          Play
        </button>
        <button class="btn btn--sage btn--large" data-action="tutorial">
          <span class="btn-icon btn-learn-icon"></span>
          Tutorial
        </button>
        <button class="btn btn--rose btn--large" data-action="choreograph">
          <span class="btn-icon btn-create-icon"></span>
          Choreograph
        </button>
      </nav>

      <!-- Connection status -->
      <div class="row" style="justify-content: center; margin-top: var(--space-md);">
        <span class="connection-dot" id="ws-dot"></span>
        <span class="connection-label" style="font-size: 0.85rem; color: var(--text-muted);" id="ws-label">
          Connecting…
        </span>
      </div>
    </div>
  `;

  // ── Wire up button clicks ──
  page.querySelector('[data-action="play"]')!
    .addEventListener('click', () => router.go('level-select'));

  page.querySelector('[data-action="tutorial"]')!
    .addEventListener('click', () => router.go('tutorial'));

  page.querySelector('[data-action="choreograph"]')!
    .addEventListener('click', () => router.go('choreograph'));

  // ── WebSocket status badge ──
  const dot = page.querySelector('#ws-dot') as HTMLElement;
  const label = page.querySelector('#ws-label') as HTMLElement;

  const updateStatus = () => {
    if (motionDetector.connected) {
      dot.classList.add('connected');
      label.textContent = 'Sensor connected';
    } else {
      dot.classList.remove('connected');
      label.textContent = 'Connecting…';
    }
  };

  document.addEventListener('ws-status', updateStatus);
  // Initial state
  updateStatus();

  return page;
}
