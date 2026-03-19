/**
 * TutorialDetail page — shows what motion to perform for a specific prop.
 *
 * Flow per step:
 *   1. Show "Show your <Tool> to Mr Spork"  (scan phase)
 *   2. NFC scanned → countdown 3…2…1 flashes fullscreen
 *   3. Motion window (8 s backend / open-ended keyboard fallback)
 *   4. Result ≥ 60% confidence → success, else fail/retry
 */
import { router } from './router.ts';
import { MOTION_META, type MotionType } from '../types/motion.types.ts';
import { GrinderTutorial } from '../components/GrinderTutorial.ts';
import { DipTutorial }     from '../components/DipTutorial.ts';
import { PressTutorial }   from '../components/PressTutorial.ts';
import { CupFill }         from '../components/CupFill.ts';
import { SensorXYMap }     from '../components/SensorXYMap.ts';
import { SensorZStrip }    from '../components/SensorZStrip.ts';
import { CountdownFlash }  from '../components/CountdownFlash.ts';
import { tutorialBridge }  from '../services/tutorialBridge.ts';

const TUTORIAL_ORDER: MotionType[] = ['grinding', 'up_down', 'press_down'];

export function createTutorialDetail(): HTMLElement {
  const page = document.createElement('div');
  page.id = 'tutorial-detail';
  page.className = 'page tutorial-bg';

  page.innerHTML = `
    <button class="btn btn--ghost btn--small back-btn" data-action="back">
      <span class="btn-icon btn-back-icon"></span>
      Back
    </button>
    <div class="stack stack--lg" style="text-align: center; width: 100%; max-width: 480px;">
      <div id="td-emoji" style="font-size: 5rem;"></div>
      <h2 id="td-prop"></h2>
      <p id="td-label" class="subtitle"></p>
      <p id="td-desc"></p>

      <div id="td-grinder-container"></div>

      <div id="td-demo" class="tutorial-demo-area" style="
        width: 100%; height: 180px;
        border-radius: var(--radius-lg);
        background: var(--bg-card);
        display: flex; align-items: center; justify-content: center;
        font-size: 1rem; color: var(--text-muted);
        box-shadow: var(--shadow-soft);
      ">
        <span id="td-demo-text">Perform the motion to see feedback</span>
      </div>

      <div id="td-feedback" class="stack" style="min-height: 60px;">
        <div id="td-status" style="
          font-family: var(--font-display); font-size: 1.3rem;
          color: var(--text-muted); transition: color var(--duration-mid);
        ">Waiting for motion…</div>
        <div id="td-confidence-bar" style="
          width: 100%; max-width: 300px; height: 8px;
          border-radius: var(--radius-pill); background: var(--bg-card); overflow: hidden;
        ">
          <div id="td-confidence-fill" style="
            width: 0%; height: 100%; background: var(--accent-sage);
            border-radius: var(--radius-pill);
            transition: width var(--duration-mid) var(--ease-out-soft), background var(--duration-mid);
          "></div>
        </div>
      </div>

      <div id="td-scan-prompt" class="play-scan-prompt hidden"></div>
    </div>

    <div id="td-cup-container" class="td-cup-container"></div>
    <div id="td-flash"   class="td-flash"></div>
    <div id="td-counter" class="td-counter"></div>

    <div id="td-popup" class="td-popup hidden">
      <div class="td-popup__card">
        <h3 class="td-popup__title">Nice work!</h3>
        <p class="td-popup__text">You completed this motion.</p>
        <div class="td-popup__actions">
          <button class="btn btn--ghost btn--small" data-popup="stay">Try Again</button>
          <button class="btn btn--ghost btn--small hidden" data-popup="redo">Redo Tutorial</button>
          <button class="btn btn--gold btn--small"  data-popup="next">Next Tutorial</button>
        </div>
      </div>
    </div>
  `;

  page.querySelector('[data-action="back"]')!
    .addEventListener('click', () => router.go('tutorial'));
  page.querySelector('[data-popup="stay"]')!
    .addEventListener('click', () => handleStay(page));
  page.querySelector('[data-popup="redo"]')!
    .addEventListener('click', () => handleRedo(page));
  page.querySelector('[data-popup="next"]')!
    .addEventListener('click', () => handleNext(page));

  /* ── State ── */
  let motionHandler:           ((e: Event) => void) | null = null;
  let keyHandler:              ((e: KeyboardEvent) => void) | null = null;
  let promptHandler:           ((e: Event) => void) | null = null;
  let countdownHandler:        ((e: Event) => void) | null = null;
  let nfcWrongHandler:         ((e: Event) => void) | null = null;
  let motionFailedHandler:     ((e: Event) => void) | null = null;
  let tutorialCompleteHandler: ((e: Event) => void) | null = null;

  let grinder:       GrinderTutorial | null = null;
  let dipTut:        DipTutorial     | null = null;
  let pressTut:      PressTutorial   | null = null;
  let cup:           CupFill         | null = null;
  let xyMap:         SensorXYMap     | null = null;
  let zStrip:        SensorZStrip    | null = null;
  let countdownFlash: CountdownFlash | null = null;

  let resolved      = false;
  let successCount  = 0;
  let lastSuccessAt = 0;
  const SUCCESS_STEP        = 1;
  const SUCCESS_DEBOUNCE_MS = 600;
  const REQUIRED_SUCCESSES  = 2;
  const PASS_THRESHOLD      = 0.6;  // 60 % accuracy required

  function triggerSuccess(): void {
    grinder?.triggerSuccess();
    dipTut?.triggerSuccess();
    pressTut?.triggerSuccess();
  }

  function triggerWrong(): void {
    grinder?.triggerWrong();
    dipTut?.triggerWrong();
    pressTut?.triggerWrong();
  }

  function cleanupListeners(): void {
    if (motionHandler)           { document.removeEventListener('motion-detected',       motionHandler);           motionHandler = null; }
    if (keyHandler)              { document.removeEventListener('keydown',                keyHandler);              keyHandler = null; }
    if (promptHandler)           { document.removeEventListener('tutorial-prompt',        promptHandler);           promptHandler = null; }
    if (countdownHandler)        { document.removeEventListener('tutorial-countdown',     countdownHandler);        countdownHandler = null; }
    if (nfcWrongHandler)         { document.removeEventListener('tutorial-nfc-wrong',     nfcWrongHandler);         nfcWrongHandler = null; }
    if (motionFailedHandler)     { document.removeEventListener('tutorial-motion-failed', motionFailedHandler);     motionFailedHandler = null; }
    if (tutorialCompleteHandler) { document.removeEventListener('tutorial-complete',      tutorialCompleteHandler); tutorialCompleteHandler = null; }
  }

  /* ── Activate / deactivate ── */
  const observer = new MutationObserver(() => {
    if (page.classList.contains('active')) {
      resolved = false; successCount = 0; lastSuccessAt = 0;
      hidePopup(page);
      updateCounter(page, 0, REQUIRED_SUCCESSES);

      const motion = (page.dataset.motion ?? 'grinding') as MotionType;
      setupDetail(page, motion);

      // Tear down old components
      (page.querySelector('#td-grinder-container') as HTMLElement).innerHTML = '';
      grinder = dipTut = pressTut = null;
      cup = xyMap = zStrip = null;

      // Re-create countdown flash for this page activation
      countdownFlash?.destroy();
      countdownFlash = new CountdownFlash(page);

      // Sensor visualiser
      const cupContainer = page.querySelector('#td-cup-container') as HTMLElement;
      cupContainer.innerHTML = '';
      if (motion === 'grinding') {
        xyMap = new SensorXYMap(cupContainer, '/ID26-TeamA-Spork/assets/motion_arrows/circle.PNG', 0.65);
        xyMap.startListening();
      } else if (motion === 'up_down') {
        zStrip = new SensorZStrip(cupContainer, '/ID26-TeamA-Spork/assets/motion_arrows/up_down.PNG', 0.65);
        zStrip.startListening();
      } else if (motion === 'press_down') {
        zStrip = new SensorZStrip(cupContainer, '/ID26-TeamA-Spork/assets/motion_arrows/press_down.PNG', 0.65);
        zStrip.startListening();
      } else {
        cup = new CupFill(cupContainer);
        cup.startListening();
      }

      // Tutorial animation component
      const container  = page.querySelector('#td-grinder-container') as HTMLElement;
      const demoEl     = page.querySelector('#td-demo')     as HTMLElement;
      const feedbackEl = page.querySelector('#td-feedback') as HTMLElement;

      if (motion === 'grinding') {
        grinder = new GrinderTutorial(container);
        grinder.start();
        demoEl.style.display = feedbackEl.style.display = 'none';
      } else if (motion === 'up_down') {
        dipTut = new DipTutorial(container);
        dipTut.start();
        demoEl.style.display = feedbackEl.style.display = 'none';
      } else if (motion === 'press_down') {
        pressTut = new PressTutorial(container);
        pressTut.start();
        demoEl.style.display = feedbackEl.style.display = 'none';
      } else {
        demoEl.style.display = 'flex';
        feedbackEl.style.display = 'flex';
      }

      const resetFeedbackVisuals = (): void => {
        setTimeout(() => { cup?.reset(); xyMap?.reset(); zStrip?.reset(); }, 500);
      };

      // Helper: handle a confirmed-pass result
      const handlePass = (confidence: number): void => {
        if (resolved) return;
        const now = Date.now();
        if (now - lastSuccessAt < SUCCESS_DEBOUNCE_MS) return;
        lastSuccessAt = now;

        scanPromptEl.classList.add('hidden');
        triggerSuccess();
        cup?.confirmFill(confidence);
        xyMap?.confirm();
        zStrip?.confirm();
        successCount = Math.min(REQUIRED_SUCCESSES, successCount + SUCCESS_STEP);
        updateCounter(page, successCount, REQUIRED_SUCCESSES);

        if (successCount >= REQUIRED_SUCCESSES) {
          resolved = true;
          onSuccess(page);
        } else {
          setTimeout(() => { cup?.reset(); xyMap?.reset(); zStrip?.reset(); }, 1200);
          flashRadial(page, 'success');
        }
      };

      // Helper: handle a fail result
      const handleFail = (): void => {
        flashRadial(page, 'wrong');
        triggerWrong();
        resetFeedbackVisuals();
      };

      tutorialBridge.connect();
      const scanPromptEl = page.querySelector('#td-scan-prompt') as HTMLElement;

      if (tutorialBridge.isConnected()) {
        // ── Backend path ─────────────────────────────────────────────────

        // Step 1: show which tool to scan
        promptHandler = ((e: Event) => {
          const detail = (e as CustomEvent).detail as {
            motion: MotionType; tool: string; action: number; totalActions: number;
          };
          if (detail.motion !== motion) return;
          scanPromptEl.classList.remove('hidden');
          scanPromptEl.textContent = `Show your ${detail.tool} to Mr Spork`;
          updateStatus(page, 'Waiting for NFC scan…', 'var(--text-muted)');
        });
        document.addEventListener('tutorial-prompt', promptHandler);

        // Step 2: backend sends countdown ticks after correct NFC scan
        countdownHandler = ((e: Event) => {
          const detail = (e as CustomEvent).detail as { seconds: number };
          if (detail.seconds > 0) {
            // Flash the number fullscreen
            countdownFlash!.flash(detail.seconds);
            scanPromptEl.classList.remove('hidden');
            scanPromptEl.textContent = `Get ready… ${detail.seconds}`;
          } else {
            // Countdown done → start motion window
            countdownFlash!.hide();
            scanPromptEl.classList.remove('hidden');
            scanPromptEl.textContent = 'Do the motion now!';
            updateStatus(page, 'Do the motion now!', 'var(--accent-gold)');
          }
        });
        document.addEventListener('tutorial-countdown', countdownHandler);

        // Wrong NFC tag
        nfcWrongHandler = (() => {
          scanPromptEl.classList.remove('hidden');
          scanPromptEl.textContent = 'Wrong tool — try again!';
          handleFail();
        });
        document.addEventListener('tutorial-nfc-wrong', nfcWrongHandler);

        // Backend scored the motion — failed (retry skips NFC → next countdown)
        motionFailedHandler = (() => {
          scanPromptEl.classList.add('hidden');
          updateStatus(page, 'Not quite — try again!', 'var(--accent-rose)');
          handleFail();
        });
        document.addEventListener('tutorial-motion-failed', motionFailedHandler);

        // Backend scored the motion — passed (emitted as motion-detected)
        motionHandler = createMotionListener(page, motion,
          (confidence) => {
            if (confidence >= PASS_THRESHOLD) {
              handlePass(confidence);
            } else {
              updateStatus(page, `${Math.round(confidence * 100)}% — need 60%+ to pass`, 'var(--accent-rose)');
              handleFail();
            }
          },
          () => handleFail(),
        );
        document.addEventListener('motion-detected', motionHandler);

        // All 3 steps complete — only handle on last step
        if (motion === TUTORIAL_ORDER[TUTORIAL_ORDER.length - 1]) {
          tutorialCompleteHandler = (() => {
            if (resolved) return;
            resolved = true;
            triggerSuccess();
            onSuccess(page);
          });
          document.addEventListener('tutorial-complete', tutorialCompleteHandler);
        }

      } else {
        // ── Keyboard fallback (no hardware) ──────────────────────────────
        // Simulate scan phase: show prompt, wait for Space/Enter as "scan"
        scanPromptEl.classList.remove('hidden');
        scanPromptEl.textContent = 'Press Space to simulate NFC scan';

        let scanDone = false;

        keyHandler = (e: KeyboardEvent) => {
          if (!page.classList.contains('active')) return;
          if (page.querySelector('#td-popup')!.classList.contains('hidden') === false) return;

          if (!scanDone && (e.key === ' ' || e.key === 'Enter')) {
            // Simulate scan → run 3-2-1 countdown
            e.preventDefault();
            scanDone = true;
            document.removeEventListener('keydown', keyHandler!);
            keyHandler = null;

            scanPromptEl.textContent = 'Get ready…';
            let count = 3;
            countdownFlash!.flash(count);

            const countInterval = setInterval(() => {
              count--;
              if (count > 0) {
                countdownFlash!.flash(count);
                scanPromptEl.textContent = `Get ready… ${count}`;
              } else {
                clearInterval(countInterval);
                countdownFlash!.hide();
                scanPromptEl.textContent = 'Do the motion now!';
                updateStatus(page, 'Do the motion now! (Space = correct, any key = wrong)', 'var(--accent-gold)');

                // After countdown — register motion listener + keyboard motion fallback
                motionHandler = createMotionListener(page, motion,
                  (confidence) => {
                    if (confidence >= PASS_THRESHOLD) {
                      handlePass(confidence);
                    } else {
                      updateStatus(page, `${Math.round(confidence * 100)}% — need 60%+`, 'var(--accent-rose)');
                      handleFail();
                    }
                  },
                  () => handleFail(),
                );
                document.addEventListener('motion-detected', motionHandler);

                keyHandler = (e2: KeyboardEvent) => {
                  if (!page.classList.contains('active')) return;
                  if (page.querySelector('#td-popup')!.classList.contains('hidden') === false) return;

                  if (e2.key === ' ' || e2.key === 'Enter') {
                    e2.preventDefault();
                    if (resolved) return;
                    // Simulate correct motion with full confidence
                    document.dispatchEvent(new CustomEvent('motion-detected', {
                      detail: { motion, confidence: 1 },
                    }));
                  } else if (e2.key.length === 1) {
                    document.dispatchEvent(new CustomEvent('motion-detected', {
                      detail: { motion: 'unknown', confidence: 0 },
                    }));
                  }
                };
                document.addEventListener('keydown', keyHandler);
              }
            }, 1000);
          }
        };
        document.addEventListener('keydown', keyHandler);
      }

    } else {
      // Leaving page — clean up
      cleanupListeners();
      countdownFlash?.destroy(); countdownFlash = null;
      if (grinder)  { grinder.destroy();  grinder  = null; }
      if (dipTut)   { dipTut.destroy();   dipTut   = null; }
      if (pressTut) { pressTut.destroy(); pressTut = null; }
      if (cup)      { cup.destroy();      cup      = null; }
      if (xyMap)    { xyMap.destroy();    xyMap    = null; }
      if (zStrip)   { zStrip.destroy();   zStrip   = null; }
    }
  });
  observer.observe(page, { attributes: true, attributeFilter: ['class'] });

  return page;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function setupDetail(page: HTMLElement, motion: MotionType): void {
  const meta = MOTION_META[motion];
  (page.querySelector('#td-emoji') as HTMLElement).innerHTML =
    `<img class="tutorial-detail__asset" src="${meta.asset}" alt="${meta.label}" />`;
  (page.querySelector('#td-prop') as HTMLElement).textContent      = meta.prop;
  (page.querySelector('#td-label') as HTMLElement).textContent     = meta.label;
  (page.querySelector('#td-desc') as HTMLElement).textContent      = meta.description;
  (page.querySelector('#td-status') as HTMLElement).textContent    = 'Waiting for motion…';
  (page.querySelector('#td-status') as HTMLElement).style.color    = 'var(--text-muted)';
  (page.querySelector('#td-confidence-fill') as HTMLElement).style.width = '0%';
  (page.querySelector('#td-demo-text') as HTMLElement).textContent = 'Perform the motion to see feedback';
}

function updateStatus(page: HTMLElement, text: string, color: string): void {
  const el = page.querySelector('#td-status') as HTMLElement;
  el.textContent = text;
  el.style.color = color;
}

function createMotionListener(
  page: HTMLElement,
  expectedMotion: MotionType,
  onCorrect: (confidence: number) => void,
  onWrongMotion?: () => void,
) {
  return (e: Event) => {
    const { motion, confidence } = (e as CustomEvent).detail as {
      motion: MotionType; confidence: number;
    };
    const statusEl = page.querySelector('#td-status') as HTMLElement;
    const fillEl   = page.querySelector('#td-confidence-fill') as HTMLElement;
    const demoText = page.querySelector('#td-demo-text') as HTMLElement;

    if (motion === expectedMotion) {
      const pct = Math.round(confidence * 100);
      statusEl.textContent    = `Detected! ${pct}% confidence`;
      statusEl.style.color    = 'var(--accent-sage)';
      fillEl.style.width      = `${pct}%`;
      fillEl.style.background = 'var(--accent-sage)';
      demoText.textContent    = 'Great job!';
      onCorrect(confidence);
    } else {
      const label = MOTION_META[motion]?.label ?? 'wrong motion';
      statusEl.textContent    = `Detected "${label}" — try the correct motion`;
      statusEl.style.color    = 'var(--accent-rose)';
      fillEl.style.width      = '20%';
      fillEl.style.background = 'var(--accent-rose)';
      onWrongMotion?.();
    }
  };
}

/* ── Visual feedback ─────────────────────────────────────────────────────── */

function flashRadial(page: HTMLElement, type: 'success' | 'wrong'): void {
  const flash = page.querySelector('#td-flash') as HTMLElement;
  flash.classList.remove('td-flash--success', 'td-flash--wrong');
  void flash.offsetWidth;
  flash.classList.add(type === 'success' ? 'td-flash--success' : 'td-flash--wrong');
  setTimeout(() => flash.classList.remove('td-flash--success', 'td-flash--wrong'), 700);
}

function onSuccess(page: HTMLElement): void {
  flashRadial(page, 'success');
  setTimeout(() => showPopup(page), 500);
}

function updateCounter(page: HTMLElement, count: number, total: number): void {
  (page.querySelector('#td-counter') as HTMLElement).textContent = `${count} / ${total}`;
}

function showPopup(page: HTMLElement): void {
  const popup = page.querySelector('#td-popup') as HTMLElement;
  const currentMotion = (page.dataset.motion ?? 'grinding') as MotionType;
  const idx    = TUTORIAL_ORDER.indexOf(currentMotion);
  const isLast = idx === TUTORIAL_ORDER.length - 1;

  const stayBtn = popup.querySelector('[data-popup="stay"]') as HTMLButtonElement;
  const redoBtn = popup.querySelector('[data-popup="redo"]') as HTMLButtonElement;
  const nextBtn = popup.querySelector('[data-popup="next"]') as HTMLButtonElement;

  if (isLast) {
    stayBtn.textContent = 'Try Again';
    redoBtn.classList.remove('hidden');
    redoBtn.textContent = 'Redo Tutorial';
    nextBtn.textContent = 'Start Game';
    (popup.querySelector('.td-popup__title') as HTMLElement).textContent = 'Tutorials Complete!';
    (popup.querySelector('.td-popup__text') as HTMLElement).textContent  =
      'You\'ve practised all the motions. Ready to play?';
  } else {
    stayBtn.textContent = 'Try Again';
    redoBtn.classList.add('hidden');
    nextBtn.textContent = 'Next Tutorial';
    (popup.querySelector('.td-popup__title') as HTMLElement).textContent = 'Nice work!';
    (popup.querySelector('.td-popup__text') as HTMLElement).textContent  = 'You completed this motion.';
  }
  popup.classList.remove('hidden');
}

function hidePopup(page: HTMLElement): void {
  page.querySelector('#td-popup')!.classList.add('hidden');
}

function handleStay(page: HTMLElement): void {
  hidePopup(page);
  page.classList.remove('active');
  requestAnimationFrame(() => page.classList.add('active'));
}

function handleRedo(page: HTMLElement): void {
  hidePopup(page);
  page.classList.add('td-slide-out-left');
  setTimeout(() => {
    page.classList.remove('td-slide-out-left', 'active');
    page.style.display = 'none';
    router.go('tutorial-detail', { motion: TUTORIAL_ORDER[0] });
  }, 450);
}

function handleNext(page: HTMLElement): void {
  hidePopup(page);
  const currentMotion = (page.dataset.motion ?? 'grinding') as MotionType;
  const idx = TUTORIAL_ORDER.indexOf(currentMotion);
  if (idx < TUTORIAL_ORDER.length - 1) {
    const nextMotion = TUTORIAL_ORDER[idx + 1];
    page.classList.add('td-slide-out-left');
    setTimeout(() => {
      page.classList.remove('td-slide-out-left', 'active');
      page.style.display = 'none';
      router.go('tutorial-detail', { motion: nextMotion });
    }, 450);
  } else {
    router.go('play', { levelId: '1' });
  }
}