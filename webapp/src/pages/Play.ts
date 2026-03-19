/**
 * Play page — runs through a level's sequence of motions.
 *
 * Flow per step:
 *   1. Show "Show your <Tool> to Mr Spork"  (scan phase)
 *      → Space/Enter simulates scan in keyboard fallback
 *   2. NFC scanned → countdown 3…2…1 flashes fullscreen
 *   3. 8-second motion window
 *      → Space/Enter simulates correct motion in keyboard fallback
 *      → Any other key simulates wrong motion
 *   4. Result ≥ 60% confidence → pass, else fail
 */
import { router } from './router.ts';
import { LEVELS, MOTION_META, type MotionType, type GameLevel, type SavedChoreography } from '../types/motion.types.ts';
import { playBridge } from '../services/playBridge.ts';
import { CupFill } from '../components/CupFill.ts';
import { MotionPrompt } from '../components/MotionPrompt.ts';
import { CountdownFlash } from '../components/CountdownFlash.ts';

const CHOREO_REPLAY_STORAGE_KEY = 'spork_choreo_replay';
const BACKEND_PROMPT_TIMEOUT_MS = 15000;
const PASS_THRESHOLD = 0.6;

type PlayStep = {
  motion: MotionType;
  duration: number;
  label: string;
  description: string;
  tool?: string;
};

function formatToolName(tool?: string, fallback?: string): string {
  const raw = (tool ?? fallback ?? 'Tool').trim();
  if (!raw) return fallback ?? 'Tool';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function loadChoreographyReplay(replayId?: string): SavedChoreography | null {
  if (!replayId) return null;
  try {
    const raw = sessionStorage.getItem(CHOREO_REPLAY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedChoreography;
    if (parsed.id !== replayId || !Array.isArray(parsed.steps) || parsed.steps.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createPlayPage(): HTMLElement {
  const page = document.createElement('div');
  page.id = 'play';
  page.className = 'page';

  page.innerHTML = `
    <button class="btn btn--ghost btn--small back-btn" data-action="back">
      <span class="btn-icon btn-back-icon"></span>
      Back
    </button>
    <div class="play-timer" id="play-timer"></div>
    <div class="play-round">
      <h2 id="play-title"></h2>
      <div id="play-progress" class="play-progress-dots"></div>
      <div id="play-stamps" class="play-stamps"></div>
      <div id="play-prompt-area" class="sr-only"></div>
      <div id="play-scan-prompt" class="play-scan-prompt hidden"></div>
      <div id="play-arrow-area" class="play-arrow-wrap"></div>
      <div id="play-cup-area" class="play-cup-wrap"></div>
      <div id="play-result" class="hidden stack play-result-overlay" style="text-align: center;"></div>
    </div>
  `;

  page.querySelector('[data-action="back"]')!
    .addEventListener('click', () => {
      if (page.dataset.replayId) { router.go('choreograph'); return; }
      router.go('level-select');
    });

  const observer = new MutationObserver(() => {
    if (page.classList.contains('active')) startLevel(page);
  });
  observer.observe(page, { attributes: true, attributeFilter: ['class'] });

  return page;
}

/* ── Level runner ── */
function startLevel(page: HTMLElement): void {
  const replayId = page.dataset.replayId?.trim();
  const replay   = loadChoreographyReplay(replayId);

  const levelId = parseInt(page.dataset.levelId ?? '1', 10);
  const level: GameLevel = LEVELS.find(l => l.id === levelId) ?? LEVELS[0];

  const isChoreographyReplay = Boolean(replay);
  const runName              = replay ? replay.name : level.name;
  const runPassingScore      = replay ? 70 : level.passingScore;
  const runSteps: PlayStep[] = replay
    ? replay.steps.map((step, index) => ({
        motion:      step.motion,
        duration:    8,
        label:       `Step ${index + 1}`,
        description: MOTION_META[step.motion].description,
        tool:        step.tool,
      }))
    : level.steps;

  const VISUAL_STAMP_COUNT = runSteps.length;
  const stampVisualClasses = Array.from({ length: VISUAL_STAMP_COUNT }, (_, i) => `stamp-${i + 1}`);

  const titleEl      = page.querySelector('#play-title')       as HTMLElement;
  const progressEl   = page.querySelector('#play-progress')    as HTMLElement;
  const stampsEl     = page.querySelector('#play-stamps')      as HTMLElement;
  const promptArea   = page.querySelector('#play-prompt-area') as HTMLElement;
  const scanPromptEl = page.querySelector('#play-scan-prompt') as HTMLElement;
  const arrowArea    = page.querySelector('#play-arrow-area')  as HTMLElement;
  const cupArea      = page.querySelector('#play-cup-area')    as HTMLElement;
  const timerEl      = page.querySelector('#play-timer')       as HTMLElement;
  const resultArea   = page.querySelector('#play-result')      as HTMLElement;

  // Reset UI
  titleEl.textContent = isChoreographyReplay ? `Replay: ${runName}` : runName;
  progressEl.innerHTML = stampsEl.innerHTML = promptArea.innerHTML = '';
  scanPromptEl.innerHTML = '';
  scanPromptEl.classList.add('hidden');
  arrowArea.innerHTML = cupArea.innerHTML = resultArea.innerHTML = '';
  resultArea.classList.add('hidden');

  // Progress dots
  const dots: HTMLElement[] = Array.from({ length: VISUAL_STAMP_COUNT }, (_, i) => {
    const dot = document.createElement('span');
    dot.className = 'play-progress-dot';
    dot.title = `Step ${i + 1}`;
    progressEl.appendChild(dot);
    return dot;
  });

  // Stamps
  const stamps: HTMLElement[] = Array.from({ length: VISUAL_STAMP_COUNT }, (_, i) => {
    const stepMotion = runSteps[i].motion;
    const stamp      = document.createElement('div');
    stamp.className  = `play-stamp ${stampVisualClasses[i]}`;
    stamp.title      = formatToolName(runSteps[i].tool, MOTION_META[stepMotion].prop);
    stamp.innerHTML  = `
      <div class="play-stamp__inner">
        <img class="play-stamp__asset" src="${MOTION_META[stepMotion].asset}" alt="${MOTION_META[stepMotion].label}" />
      </div>`;
    stampsEl.appendChild(stamp);
    return stamp;
  });

  const cup    = new CupFill(cupArea);
  const prompt = new MotionPrompt(promptArea);
  const countdownFlash = new CountdownFlash(page);

  const useBackendRandom = !isChoreographyReplay;
  playBridge.connect();
  if (useBackendRandom) playBridge.clearPromptQueue();

  let currentStep      = 0;
  let completedCorrect = 0;
  let score            = 0;

  let motionHandler:          ((e: Event) => void) | null = null;
  let scanHandler:            ((e: Event) => void) | null = null;
  let keyHandler:             ((e: KeyboardEvent) => void) | null = null;
  let backendFailHandler:     ((e: Event) => void) | null = null;
  let backendNfcWrongHandler: ((e: Event) => void) | null = null;
  let countdownHandler:       ((e: Event) => void) | null = null;
  let timerInterval:          ReturnType<typeof setInterval> | null = null;
  let timerRaf:               number | null = null;

  function applyBackendPromptToStep(stepIndex: number, motion: MotionType, tool?: string): void {
    const step = runSteps[stepIndex];
    if (!step) return;
    step.motion = motion;
    step.tool   = tool;
    const stamp = stamps[stepIndex];
    if (!stamp) return;
    const meta = MOTION_META[motion];
    stamp.title = formatToolName(tool, meta.prop);
    const img = stamp.querySelector('.play-stamp__asset') as HTMLImageElement | null;
    if (img) { img.src = meta.asset; img.alt = meta.label; }
  }

  function updateVisualProgress(): void {
    dots.forEach((dot, i)     => dot.classList.toggle('is-complete', i < completedCorrect));
    stamps.forEach((stamp, i) => stamp.classList.toggle('is-active',  i < completedCorrect));
    cup.setFill(Math.min(completedCorrect, VISUAL_STAMP_COUNT) / VISUAL_STAMP_COUNT);
  }

  function flashWrongStamp(): void {
    const stamp = stamps[Math.min(completedCorrect, VISUAL_STAMP_COUNT - 1)];
    if (!stamp) return;
    stamp.classList.remove('is-wrong');
    void stamp.offsetWidth;
    stamp.classList.add('is-wrong');
    setTimeout(() => stamp.classList.remove('is-wrong'), 320);
  }

  updateVisualProgress();

  function cleanupListeners(): void {
    if (motionHandler)          { document.removeEventListener('motion-detected',       motionHandler);          motionHandler = null; }
    if (scanHandler)            { document.removeEventListener('tool-scanned',           scanHandler);            scanHandler = null; }
    if (keyHandler)             { document.removeEventListener('keydown',                keyHandler);             keyHandler = null; }
    if (backendFailHandler)     { document.removeEventListener('backend-motion-failed',  backendFailHandler);     backendFailHandler = null; }
    if (backendNfcWrongHandler) { document.removeEventListener('backend-nfc-wrong',      backendNfcWrongHandler); backendNfcWrongHandler = null; }
    if (countdownHandler)       { document.removeEventListener('play-countdown',         countdownHandler);       countdownHandler = null; }
    if (timerInterval)          { clearInterval(timerInterval);   timerInterval = null; }
    if (timerRaf)               { cancelAnimationFrame(timerRaf); timerRaf = null; }
    timerEl.textContent = '';
    timerEl.style.removeProperty('--sweep');
    timerEl.removeAttribute('data-state');
  }

  // ── Shared: register motion handler + keyboard motion fallback ───────────
  // Called after countdown finishes (both backend and local paths).

  function startMotionPhase(step: PlayStep, meta: ReturnType<typeof MOTION_META[MotionType]>, backendDriven: boolean): void {
    // Motion event listener (from backend result or keyboard dispatch)
    motionHandler = ((e: Event) => {
      const detail = (e as CustomEvent).detail as { motion: MotionType; confidence: number };
      if (detail.motion === step.motion) {
        if ((detail.confidence ?? 0) >= PASS_THRESHOLD) {
          if (!backendDriven) prompt.stopTimer();
          prompt.markSuccess();
          score += detail.confidence ?? 0;
          completedCorrect++;
          updateVisualProgress();
          cup.splash();
          cleanupListeners();
          currentStep++;
          setTimeout(advance, 800);
        } else {
          // Recognised but below threshold — flash wrong, timer keeps running
          flashWrongStamp();
        }
      } else {
        flashWrongStamp();
      }
    });
    document.addEventListener('motion-detected', motionHandler);

    // Keyboard fallback for motion phase — always active so devs can test
    if (!backendDriven) {
      keyHandler = (e: KeyboardEvent) => {
        if (!page.classList.contains('active')) return;
        if (!resultArea.classList.contains('hidden')) return;
        if (e.key === ' ') {
          e.preventDefault();
          // Simulate a correct motion with full confidence
          document.dispatchEvent(new CustomEvent('motion-detected', {
            detail: { motion: step.motion, confidence: 1 },
          }));
        } else if (e.key.length === 1) {
          // Any other printable key = wrong motion
          flashWrongStamp();
        }
      };
      document.addEventListener('keydown', keyHandler);
    }
  }

  // ── Phase 1: Scan ────────────────────────────────────────────────────────

  function advance(): void {
    if (currentStep >= runSteps.length) { finish(); return; }

    const stepIndex     = currentStep;
    const backendDriven = useBackendRandom && playBridge.isConnected();

    const beginScanPhase = (): void => {
      if (stepIndex !== currentStep) return;

      const step = runSteps[currentStep];
      const meta = MOTION_META[step.motion];

      prompt.show(step.motion);
      arrowArea.innerHTML = '';

      scanPromptEl.classList.remove('hidden');
      scanPromptEl.textContent = `Show your ${formatToolName(step.tool, meta.prop)} to Mr Spork`;

      // NFC scan event (fired by playBridge on correct scan)
      scanHandler = ((e: Event) => {
        const detail = (e as CustomEvent).detail as { tool?: string };
        if (detail?.tool) onScanComplete();
      });
      document.addEventListener('tool-scanned', scanHandler);

      if (backendDriven) {
        backendNfcWrongHandler = () => flashWrongStamp();
        document.addEventListener('backend-nfc-wrong', backendNfcWrongHandler);
      } else {
        // ── Keyboard fallback: Space/Enter = simulate NFC scan ──
        keyHandler = (e: KeyboardEvent) => {
          if (!page.classList.contains('active')) return;
          if (!resultArea.classList.contains('hidden')) return;
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onScanComplete();
          }
        };
        document.addEventListener('keydown', keyHandler);
      }
    };

    if (backendDriven) {
      scanPromptEl.classList.remove('hidden');
      scanPromptEl.textContent = 'Waiting for backend prompt…';
      void playBridge.nextPrompt(stepIndex + 1, BACKEND_PROMPT_TIMEOUT_MS).then((msg) => {
        if (stepIndex !== currentStep) return;
        if (msg) applyBackendPromptToStep(stepIndex, msg.motion, msg.tool);
        beginScanPhase();
      });
      return;
    }

    beginScanPhase();
  }

  // ── Phase 2: Countdown → Motion ─────────────────────────────────────────

  function onScanComplete(): void {
    // Clear scan-phase listeners
    if (scanHandler)            { document.removeEventListener('tool-scanned',     scanHandler);            scanHandler = null; }
    if (keyHandler)             { document.removeEventListener('keydown',           keyHandler);             keyHandler = null; }
    if (backendNfcWrongHandler) { document.removeEventListener('backend-nfc-wrong', backendNfcWrongHandler); backendNfcWrongHandler = null; }

    const step          = runSteps[currentStep];
    const meta          = MOTION_META[step.motion];
    const backendDriven = useBackendRandom && playBridge.isConnected();

    // Stamp lights up on scan
    if (currentStep < VISUAL_STAMP_COUNT) {
      const stamp = stamps[currentStep];
      stamp.classList.add('is-scanned');
      stamp.classList.remove('pop');
      void stamp.offsetWidth;
      stamp.classList.add('pop');
      setTimeout(() => stamp.classList.remove('pop'), 320);
    }

    scanPromptEl.classList.remove('hidden');
    scanPromptEl.textContent = 'Get ready…';

    if (backendDriven) {
      // ── Backend path ─────────────────────────────────────────────────────
      // Hide the circular timer — backend drives timing
      timerEl.textContent = '';
      timerEl.style.removeProperty('--sweep');
      timerEl.removeAttribute('data-state');

      // Flash countdown numbers as backend sends them, show arrow + start
      // motion phase when countdown reaches 0
      countdownHandler = ((e: Event) => {
        const detail = (e as CustomEvent).detail as { seconds: number };
        if (detail.seconds > 0) {
          countdownFlash.flash(detail.seconds);
          scanPromptEl.textContent = `Get ready… ${detail.seconds}`;
        } else {
          countdownFlash.hide();
          scanPromptEl.textContent = 'Do the following motion!';
          arrowArea.innerHTML = `<img class="play-arrow" src="${meta.arrow}" alt="${meta.label} motion" />`;
        }
      });
      document.addEventListener('play-countdown', countdownHandler);

      backendFailHandler = ((e: Event) => {
        const detail = (e as CustomEvent).detail as { motion: MotionType };
        if (detail.motion === step.motion) flashWrongStamp();
      });
      document.addEventListener('backend-motion-failed', backendFailHandler);

      // Register motion handler immediately — backend controls when to score
      startMotionPhase(step, meta, true);

    } else {
      // ── Local keyboard fallback path ─────────────────────────────────────
      // Run 3-2-1 countdown in JS, then start 8-second motion window
      arrowArea.innerHTML = '';

      let count = 3;
      countdownFlash.flash(count);
      scanPromptEl.textContent = `Get ready… ${count}`;

      const countInterval = setInterval(() => {
        count--;
        if (count > 0) {
          countdownFlash.flash(count);
          scanPromptEl.textContent = `Get ready… ${count}`;
        } else {
          clearInterval(countInterval);
          countdownFlash.hide();

          // Countdown done — show arrow, start 8-second timer, register handlers
          scanPromptEl.textContent = 'Do the following motion!';
          arrowArea.innerHTML = `<img class="play-arrow" src="${meta.arrow}" alt="${meta.label} motion" />`;

          // Circular sweep timer
          if (timerInterval) clearInterval(timerInterval);
          if (timerRaf)      { cancelAnimationFrame(timerRaf); timerRaf = null; }
          let remaining       = step.duration;
          const totalDuration = step.duration;
          const startMs       = performance.now();
          const totalMs       = totalDuration * 1000;
          timerEl.textContent   = String(remaining);
          timerEl.dataset.state = 'high';

          function animateTimer(): void {
            const elapsed  = performance.now() - startMs;
            const fraction = Math.max(0, 1 - elapsed / totalMs);
            timerEl.style.setProperty('--sweep', `${(fraction * 360).toFixed(1)}deg`);
            if (fraction > 0) timerRaf = requestAnimationFrame(animateTimer);
          }
          timerRaf = requestAnimationFrame(animateTimer);

          timerInterval = setInterval(() => {
            remaining--;
            timerEl.textContent = remaining > 0 ? String(remaining) : '';
            const pct = remaining / totalDuration;
            timerEl.dataset.state = pct > 0.4 ? 'high' : pct > 0.15 ? 'medium' : 'low';
            if (remaining <= 0) { clearInterval(timerInterval!); timerInterval = null; }
          }, 1000);

          // Time's up — fail this step
          prompt.startTimer(step.duration, () => {
            prompt.markFail();
            flashWrongStamp();
            cleanupListeners();
            currentStep++;
            setTimeout(advance, 800);
          });

          // Register motion handler + keyboard motion fallback
          // This is the key fix: both are registered HERE, inside the countdown
          // callback, so they only become active after the countdown finishes
          startMotionPhase(step, meta, false);
        }
      }, 1000);
    }
  }

  // ── Finish ───────────────────────────────────────────────────────────────

  function finish(): void {
    prompt.destroy();
    countdownFlash.destroy();
    cleanupListeners();

    const pct       = Math.round((score / runSteps.length) * 100);
    const passed    = pct >= runPassingScore;
    const nextLevel = isChoreographyReplay ? null : LEVELS.find(l => l.id === level.id + 1);

    resultArea.classList.remove('hidden');
    resultArea.innerHTML = `
      <span style="font-size: 3rem;">${passed ? '🎉' : '😅'}</span>
      <h2>${passed ? 'Well Brewed!' : 'Almost There…'}</h2>
      <p>You scored <strong>${pct}%</strong></p>
      <div class="row" style="justify-content: center; gap: var(--space-md); margin-top: var(--space-md);">
        <button class="btn btn--ghost btn--small" data-action="retry">Retry</button>
        ${nextLevel ? '<button class="btn btn--gold btn--small" data-action="next">Next Round</button>' : ''}
        <button class="btn btn--primary btn--small" data-action="menu">${isChoreographyReplay ? 'Back to Recipes' : 'Back to Menu'}</button>
      </div>
    `;

    resultArea.querySelector('[data-action="retry"]')!
      .addEventListener('click', () => startLevel(page));

    if (nextLevel) {
      resultArea.querySelector('[data-action="next"]')!
        .addEventListener('click', () => {
          playBridge.sendReady();
          router.go('play', { levelId: String(nextLevel.id) });
        });
    }

    resultArea.querySelector('[data-action="menu"]')!
      .addEventListener('click', () => {
        if (isChoreographyReplay) { router.go('choreograph'); return; }
        router.home();
      });
  }

  advance();
}