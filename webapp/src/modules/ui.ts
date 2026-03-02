/**
 * UI module — creates and manages DOM overlays (buttons, HUD).
 * The canvas handles the game visuals; the DOM handles interactive controls.
 */
import { bus } from './eventBus';
import { serial } from './serial';
import { game } from './gameManager';
import { renderer } from './renderer';
import { LEVELS } from './levels';
import type { GameScreen } from './types';

class UI {
  private overlay!: HTMLElement;

  init(): void {
    document.getElementById('sidebar')!; // reserved for future use
    this.overlay = document.getElementById('overlay')!;

    this.setupButtons();
    this.render(game.state.screen);

    bus.on('screen-change', (screen: GameScreen) => this.render(screen));
    bus.on('feedback', (msg: string) => this.showToast(msg));
  }

  private setupButtons(): void {
    // Connect button
    document.getElementById('btn-connect')!.addEventListener('click', async () => {
      try {
        game.setScreen('connecting');
        await serial.connect();
        game.setScreen('menu');
      } catch (e) {
        game.setScreen('menu');
        this.showToast('Connection failed — check Serial Monitor is closed');
      }
    });

    // Zero / Tare
    document.getElementById('btn-tare')!.addEventListener('click', () => {
      serial.tare();
      this.showToast('Sensor zeroed');
    });

    // Sensitivity slider
    const slider = document.getElementById('sensitivity') as HTMLInputElement;
    const display = document.getElementById('sensitivity-val')!;
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      renderer.setSensitivity(val);
      display.textContent = val.toFixed(1) + 'x';
    });
  }

  /** Render the appropriate overlay UI for each screen */
  private render(screen: GameScreen): void {
    switch (screen) {
      case 'menu':
        this.renderMenu();
        break;
      case 'connecting':
        this.overlay.innerHTML = '';
        break;
      case 'tutorial':
        this.renderTutorial();
        break;
      case 'playing':
        this.overlay.innerHTML = '';
        break;
      case 'level-complete':
        this.renderLevelComplete();
        break;
      case 'game-over':
        this.renderGameOver();
        break;
      case 'creative':
        this.renderCreative();
        break;
    }
  }

  private renderMenu(): void {
    const connected = serial.isConnected;

    let levelsHtml = LEVELS.map((level, i) => {
      const locked = i > game.state.totalLevelsCompleted && i > 0;
      const completed = i < game.state.totalLevelsCompleted;
      return `
        <button class="btn-level ${locked ? 'locked' : ''} ${completed ? 'completed' : ''}"
                data-level="${i}" ${locked ? 'disabled' : ''}>
          <span class="level-num">${level.id}</span>
          <span class="level-name">${level.name}</span>
          ${completed ? '<span class="check">✓</span>' : ''}
          ${locked ? '<span class="lock">🔒</span>' : ''}
        </button>
      `;
    }).join('');

    this.overlay.innerHTML = `
      <div class="menu-panel">
        <div class="level-grid">
          <h3>Select Level</h3>
          ${levelsHtml}
        </div>
        <button class="btn-creative" id="btn-creative">🎨 Creative Mode</button>
        ${!connected ? '<p class="hint">Connect your Arduino first →</p>' : ''}
      </div>
    `;

    // Level button handlers
    this.overlay.querySelectorAll('.btn-level:not(.locked)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.level!);
        game.startLevel(idx);
      });
    });

    document.getElementById('btn-creative')?.addEventListener('click', () => {
      game.startCreativeRecording();
    });
  }

  private renderTutorial(): void {
    const level = game.currentLevel;
    if (!level) return;

    this.overlay.innerHTML = `
      <div class="tutorial-panel">
        <button class="btn-primary btn-start" id="btn-start-level">▶ Start Level</button>
        <button class="btn-secondary" id="btn-back-menu">← Back</button>
      </div>
    `;

    document.getElementById('btn-start-level')!.addEventListener('click', () => {
      game.beginPlaying();
    });

    document.getElementById('btn-back-menu')!.addEventListener('click', () => {
      game.setScreen('menu');
    });
  }

  private renderLevelComplete(): void {
    const nextLevel = game.state.currentLevelIndex + 1;
    const hasNext = nextLevel < LEVELS.length;

    this.overlay.innerHTML = `
      <div class="result-panel">
        ${hasNext ? '<button class="btn-primary" id="btn-next">Next Level →</button>' : ''}
        <button class="btn-secondary" id="btn-retry">Retry</button>
        <button class="btn-secondary" id="btn-menu">Menu</button>
      </div>
    `;

    document.getElementById('btn-next')?.addEventListener('click', () => {
      game.startLevel(nextLevel);
    });

    document.getElementById('btn-retry')?.addEventListener('click', () => {
      game.startLevel(game.state.currentLevelIndex);
    });

    document.getElementById('btn-menu')?.addEventListener('click', () => {
      game.setScreen('menu');
    });
  }

  private renderGameOver(): void {
    this.overlay.innerHTML = `
      <div class="result-panel">
        <button class="btn-primary" id="btn-retry">Try Again</button>
        <button class="btn-secondary" id="btn-menu">Menu</button>
      </div>
    `;

    document.getElementById('btn-retry')!.addEventListener('click', () => {
      game.startLevel(game.state.currentLevelIndex);
    });

    document.getElementById('btn-menu')!.addEventListener('click', () => {
      game.setScreen('menu');
    });
  }

  private renderCreative(): void {
    const state = game.state;

    this.overlay.innerHTML = `
      <div class="creative-panel">
        ${state.creativeRecording
          ? '<button class="btn-danger" id="btn-stop-rec">⏹ Stop Recording</button>'
          : `
            <button class="btn-primary" id="btn-play-seq"
                    ${state.creativeSequence.length === 0 ? 'disabled' : ''}>
              ▶ Play Sequence (${state.creativeSequence.length} motions)
            </button>
            <button class="btn-secondary" id="btn-record-again">🔴 Record New</button>
          `
        }
        <button class="btn-secondary" id="btn-creative-back">← Back</button>
      </div>
    `;

    document.getElementById('btn-stop-rec')?.addEventListener('click', () => {
      game.stopCreativeRecording();
      this.renderCreative();
    });

    document.getElementById('btn-play-seq')?.addEventListener('click', () => {
      game.playCreativeSequence();
    });

    document.getElementById('btn-record-again')?.addEventListener('click', () => {
      game.startCreativeRecording();
      this.renderCreative();
    });

    document.getElementById('btn-creative-back')?.addEventListener('click', () => {
      game.state.creativeRecording = false;
      game.setScreen('menu');
    });
  }

  /** Show a brief toast notification */
  private showToast(msg: string): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

export const ui = new UI();
