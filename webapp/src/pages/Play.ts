/**
 * Play page — runs through a level's sequence of motions.
 *
 * Shows:
 *  - Current motion prompt
 *  - Cup fill (accuracy)
 *  - Step progress indicator
 */
import { router } from './router.ts';
import { LEVELS, type MotionType, type GameLevel } from '../types/motion.types.ts';
import { CupFill } from '../components/CupFill.ts';
import { MotionPrompt } from '../components/MotionPrompt.ts';

export function createPlayPage(): HTMLElement {
  const page = document.createElement('div');
  page.id = 'play';
  page.className = 'page';

  page.innerHTML = `
    <button class="btn btn--ghost btn--small back-btn" data-action="back">
      <span class="btn-icon btn-back-icon"></span>
      Back
    </button>
    <div class="stack stack--lg" style="text-align: center; width: 100%; max-width: 480px;">
      <h2 id="play-title"></h2>
      <div id="play-progress" class="row" style="justify-content: center; flex-wrap: wrap; gap: var(--space-xs);"></div>
      <div id="play-prompt-area"></div>
      <div id="play-cup-area" style="display: flex; justify-content: center;"></div>
      <div id="play-result" class="hidden stack" style="text-align: center;"></div>
    </div>
  `;

  page.querySelector('[data-action="back"]')!
    .addEventListener('click', () => router.go('level-select'));

  /* ── Game logic runs when page becomes active ── */
  const observer = new MutationObserver(() => {
    if (page.classList.contains('active')) {
      startLevel(page);
    }
  });
  observer.observe(page, { attributes: true, attributeFilter: ['class'] });

  return page;
}

/* ── Level runner ── */
function startLevel(page: HTMLElement): void {
  const levelId = parseInt(page.dataset.levelId ?? '1', 10);
  const level: GameLevel = LEVELS.find(l => l.id === levelId) ?? LEVELS[0];

  const titleEl = page.querySelector('#play-title') as HTMLElement;
  const progressEl = page.querySelector('#play-progress') as HTMLElement;
  const promptArea = page.querySelector('#play-prompt-area') as HTMLElement;
  const cupArea = page.querySelector('#play-cup-area') as HTMLElement;
  const resultArea = page.querySelector('#play-result') as HTMLElement;

  // Reset
  titleEl.textContent = level.name;
  progressEl.innerHTML = '';
  promptArea.innerHTML = '';
  cupArea.innerHTML = '';
  resultArea.innerHTML = '';
  resultArea.classList.add('hidden');

  // Build progress dots
  const dots: HTMLElement[] = level.steps.map((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'progress-dot';
    dot.style.cssText = `
      width: 14px; height: 14px; border-radius: 50%;
      background: var(--bg-card);
      transition: background var(--duration-mid), transform var(--duration-fast) var(--ease-spring);
    `;
    dot.title = `Step ${i + 1}`;
    progressEl.appendChild(dot);
    return dot;
  });

  const cup = new CupFill(cupArea);
  const prompt = new MotionPrompt(promptArea);

  let currentStep = 0;
  let score = 0;
  let motionHandler: ((e: Event) => void) | null = null;

  function advance(): void {
    if (currentStep >= level.steps.length) {
      finish();
      return;
    }

    const step = level.steps[currentStep];
    dots[currentStep].style.background = 'var(--accent-gold)';
    dots[currentStep].style.transform = 'scale(1.3)';

    prompt.show(step.motion);
    prompt.startTimer(step.duration, () => {
      // Timer expired — fail this step
      prompt.markFail();
      dots[currentStep].style.background = 'var(--accent-rose)';
      dots[currentStep].style.transform = 'scale(1)';
      currentStep++;
      setTimeout(advance, 800);
    });

    // Listen for matching motion
    motionHandler = ((e: Event) => {
      const detail = (e as CustomEvent).detail as { motion: MotionType; confidence: number };
      if (detail.motion === step.motion) {
        prompt.stopTimer();
        prompt.markSuccess();
        score += detail.confidence;
        cup.setFill(score / level.steps.length);
        cup.splash();
        dots[currentStep].style.background = 'var(--accent-sage)';
        dots[currentStep].style.transform = 'scale(1)';
        document.removeEventListener('motion-detected', motionHandler!);
        motionHandler = null;
        currentStep++;
        setTimeout(advance, 800);
      }
    });
    document.addEventListener('motion-detected', motionHandler);
  }

  function finish(): void {
    prompt.destroy();
    if (motionHandler) document.removeEventListener('motion-detected', motionHandler);

    const pct = Math.round((score / level.steps.length) * 100);
    const passed = pct >= level.passingScore;

    resultArea.classList.remove('hidden');
    resultArea.innerHTML = `
      <span style="font-size: 3rem;">${passed ? '🎉' : '😅'}</span>
      <h2>${passed ? 'Well Brewed!' : 'Almost There…'}</h2>
      <p>You scored <strong>${pct}%</strong></p>
      <div class="row" style="justify-content: center; gap: var(--space-md); margin-top: var(--space-md);">
        <button class="btn btn--ghost btn--small" data-action="retry">Retry</button>
        <button class="btn btn--primary btn--small" data-action="menu">Back to Menu</button>
      </div>
    `;

    resultArea.querySelector('[data-action="retry"]')!
      .addEventListener('click', () => startLevel(page));
    resultArea.querySelector('[data-action="menu"]')!
      .addEventListener('click', () => router.home());
  }

  advance();
}
