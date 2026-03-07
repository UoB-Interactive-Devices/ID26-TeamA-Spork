/**
 * Main entry point — Spork Motion Brewing Game
 *
 * Sets up the page-based UI and WebSocket motion detection.
 */
import './styles/main.css';

import { router } from './pages/router.ts';
import { createMainMenu } from './pages/MainMenu.ts';
import { createLevelSelect } from './pages/LevelSelect.ts';
import { createPlayPage } from './pages/Play.ts';
import { createTutorial } from './pages/Tutorial.ts';
import { createTutorialDetail } from './pages/TutorialDetail.ts';
import { createChoreograph } from './pages/Choreograph.ts';
import { motionDetector } from './components/MotionDetector.ts';
import { bgm } from './modules/bgm.ts';

function init(): void {
  // Apply saved theme (default: dark)
  const savedTheme = localStorage.getItem('spork-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  console.log('While It Steeps — Initializing…');

  const app = document.getElementById('app')!;

  // 1. Mount all pages into #app
  app.appendChild(createMainMenu());
  app.appendChild(createLevelSelect());
  app.appendChild(createPlayPage());
  app.appendChild(createTutorial());
  app.appendChild(createTutorialDetail());
  app.appendChild(createChoreograph());

  // 2. Global BGM picker (visible on all pages)
  const bgmPicker = document.createElement('div');
  bgmPicker.id = 'global-bgm-picker';
  bgmPicker.className = 'global-bgm-picker';
  bgmPicker.innerHTML = `
    <button class="global-bgm-picker__toggle" id="global-bgm-toggle" aria-label="Background music">
      <span class="global-bgm-picker__note">♪</span>
      <span class="global-bgm-picker__label">Music</span>
    </button>
    <div class="global-bgm-picker__panel hidden" id="global-bgm-panel">
      <div class="global-bgm-picker__panel-title">Background Music</div>
      <p class="global-bgm-picker__hint">Tap a track to play — tap again to pause</p>
      <ul class="global-bgm-picker__track-list" id="global-bgm-track-list"></ul>
      <div class="global-bgm-picker__volume-row">
        <span class="global-bgm-picker__vol-icon">🔈</span>
        <input type="range" class="global-bgm-picker__volume" id="global-bgm-volume"
               min="0" max="1" step="0.05" value="0.4" />
        <span class="global-bgm-picker__vol-icon">🔊</span>
      </div>
    </div>
  `;
  document.body.appendChild(bgmPicker);

  // Build track list
  const trackList = bgmPicker.querySelector('#global-bgm-track-list') as HTMLUListElement;
  const panel = bgmPicker.querySelector('#global-bgm-panel') as HTMLElement;
  const toggleBtn = bgmPicker.querySelector('#global-bgm-toggle') as HTMLButtonElement;
  const volSlider = bgmPicker.querySelector('#global-bgm-volume') as HTMLInputElement;

  bgm.tracks.forEach((track, idx) => {
    const li = document.createElement('li');
    li.className = 'global-bgm-picker__track';
    li.dataset.idx = String(idx);
    li.innerHTML = `
      <span class="global-bgm-picker__track-icon">♪</span>
      <span class="global-bgm-picker__track-name">${track.label}</span>
    `;
    li.addEventListener('click', () => {
      bgm.playTrack(idx);
      refreshGlobalTrackList();
    });
    trackList.appendChild(li);
  });

  function refreshGlobalTrackList(): void {
    trackList.querySelectorAll('.global-bgm-picker__track').forEach((li) => {
      const elIdx = parseInt((li as HTMLElement).dataset.idx ?? '-1', 10);
      const isActive = elIdx === bgm.currentIdx;
      li.classList.toggle('active', isActive);
      const icon = li.querySelector('.global-bgm-picker__track-icon') as HTMLElement;
      if (icon) icon.textContent = isActive ? '🔊' : '♪';
    });
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('hidden') &&
        !(e.target as HTMLElement).closest('#global-bgm-picker')) {
      panel.classList.add('hidden');
    }
  });

  volSlider.addEventListener('input', () => {
    bgm.setVolume(parseFloat(volSlider.value));
  });

  // Start BGM on first user interaction (autoplay policy)
  const startBgm = () => {
    bgm.tryStart();
    refreshGlobalTrackList();
    document.removeEventListener('click', startBgm);
    document.removeEventListener('keydown', startBgm);
  };
  document.addEventListener('click', startBgm);
  document.addEventListener('keydown', startBgm);

  // 3. Navigate to main menu
  router.go('main-menu');

  // 4. Connect WebSocket to Python backend
  motionDetector.connect();

  // 5. Debug logging
  document.addEventListener('motion-detected', ((e: CustomEvent) => {
    const { motion, confidence } = e.detail;
    console.log(`🎯 Motion: ${motion} (${Math.round(confidence * 100)}%)`);
  }) as EventListener);

  router.onNavigate((_from, to) => console.log(`📄 Page → ${to}`));

  console.log('☕ While It Steeps — Ready!');
}

init();
