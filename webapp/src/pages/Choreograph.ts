/**
 * Choreograph page — free-play creative mode.
 *
 * 1. Player performs any sequence of motions → app records them
 * 2. Player can save & name the creation
 * 3. Player can replay — app prompts the sequence and scores accuracy
 */
import { router } from './router.ts';
import { MOTION_META, type MotionType, type RecordedStep, type SavedChoreography } from '../types/motion.types.ts';
import { CupFill } from '../components/CupFill.ts';
import { MotionPrompt } from '../components/MotionPrompt.ts';

const STORAGE_KEY = 'spork_choreographies';

export function createChoreograph(): HTMLElement {
  const page = document.createElement('div');
  page.id = 'choreograph';
  page.className = 'page choreograph-bg';

  page.innerHTML = `
    <button class="btn btn--ghost btn--small back-btn" data-action="back">
      <span class="btn-icon btn-back-icon"></span>
      Back
    </button>

    <div class="stack stack--lg page-scroll" style="text-align: center; width: 100%; max-width: 560px; padding: var(--space-lg) 0;">
      <div>
        <h2>Choreograph Your Own</h2>
        <p class="subtitle">Record a motion sequence, then try to replay it!</p>
      </div>

      <!-- Record mode -->
      <div id="ch-record-section" class="stack">
        <div id="ch-live-feed" style="
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          color: var(--text-muted);
        ">
          Press Record, then start performing motions
        </div>
        <div id="ch-recorded-list" class="row" style="flex-wrap: wrap; justify-content: center; gap: var(--space-xs); min-height: 40px;"></div>
        <div class="row" style="justify-content: center; gap: var(--space-md);">
          <button class="btn btn--rose" id="ch-btn-record">🔴 Record</button>
          <button class="btn btn--gold hidden" id="ch-btn-save">💾 Save</button>
        </div>
      </div>

      <!-- Saved choreographies list -->
      <div id="ch-saved-section" class="stack" style="width: 100%;">
        <h3>Your Choreographies</h3>
        <div id="ch-saved-list" class="stack" style="width: 100%;"></div>
        <p id="ch-empty-msg" class="subtitle">No saved choreographies yet</p>
      </div>

      <!-- Replay mode (hidden until activated) -->
      <div id="ch-replay-section" class="stack hidden" style="width: 100%;">
        <h3 id="ch-replay-title"></h3>
        <div id="ch-replay-prompt-area"></div>
        <div id="ch-replay-cup-area" style="display: flex; justify-content: center;"></div>
        <div id="ch-replay-result"></div>
        <button class="btn btn--ghost btn--small" id="ch-replay-back">Back to list</button>
      </div>
    </div>
  `;

  // ── State ──
  let recording = false;
  let recordStart = 0;
  let recorded: RecordedStep[] = [];
  let motionHandler: ((e: Event) => void) | null = null;

  const liveFeed = page.querySelector('#ch-live-feed') as HTMLElement;
  const recordedList = page.querySelector('#ch-recorded-list') as HTMLElement;
  const btnRecord = page.querySelector('#ch-btn-record') as HTMLButtonElement;
  const btnSave = page.querySelector('#ch-btn-save') as HTMLButtonElement;
  const savedList = page.querySelector('#ch-saved-list') as HTMLElement;
  const emptyMsg = page.querySelector('#ch-empty-msg') as HTMLElement;
  const recordSection = page.querySelector('#ch-record-section') as HTMLElement;
  const replaySection = page.querySelector('#ch-replay-section') as HTMLElement;
  const replayBack = page.querySelector('#ch-replay-back') as HTMLButtonElement;

  // ── Record ──
  btnRecord.addEventListener('click', () => {
    if (!recording) {
      startRecording();
    } else {
      stopRecording();
    }
  });

  function startRecording(): void {
    recording = true;
    recordStart = Date.now();
    recorded = [];
    recordedList.innerHTML = '';
    btnRecord.textContent = '⏹ Stop';
    btnRecord.classList.remove('btn--rose');
    btnRecord.classList.add('btn--gold');
    btnSave.classList.add('hidden');
    liveFeed.textContent = 'Listening for motions…';
    liveFeed.style.color = 'var(--accent-gold)';

    motionHandler = (e: Event) => {
      const { motion, confidence } = (e as CustomEvent).detail as { motion: MotionType; confidence: number };
      const step: RecordedStep = {
        motion,
        timestamp: Date.now() - recordStart,
        confidence,
      };
      recorded.push(step);

      // Show pill
      const pill = document.createElement('span');
      pill.style.cssText = `
        display: inline-block;
        padding: 4px 12px;
        border-radius: var(--radius-pill);
        background: var(--bg-card);
        font-size: 0.85rem;
        color: var(--accent-cream);
        animation: fade-in-up var(--duration-fast) var(--ease-spring) both;
      `;
      pill.innerHTML = `<img class="ch-pill-asset" src="${MOTION_META[motion].asset}" alt="${MOTION_META[motion].label}" /><span>${MOTION_META[motion].label}</span>`;
      recordedList.appendChild(pill);

      liveFeed.innerHTML = `<span class="ch-live-feed-content"><img class="ch-live-feed-asset" src="${MOTION_META[motion].asset}" alt="${MOTION_META[motion].label}" /> ${MOTION_META[motion].label} detected!</span>`;
    };
    document.addEventListener('motion-detected', motionHandler);
  }

  function stopRecording(): void {
    recording = false;
    btnRecord.textContent = '🔴 Record';
    btnRecord.classList.remove('btn--gold');
    btnRecord.classList.add('btn--rose');
    liveFeed.textContent = recorded.length > 0
      ? `Recorded ${recorded.length} motion${recorded.length > 1 ? 's' : ''}`
      : 'No motions captured';
    liveFeed.style.color = 'var(--text-muted)';

    if (motionHandler) {
      document.removeEventListener('motion-detected', motionHandler);
      motionHandler = null;
    }

    if (recorded.length > 0) {
      btnSave.classList.remove('hidden');
    }
  }

  // ── Save ──
  btnSave.addEventListener('click', () => {
    const name = prompt('Name your choreography:', 'My Brew') ?? '';
    if (!name.trim()) return;

    const choreo: SavedChoreography = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: Date.now(),
      steps: [...recorded],
    };

    const saved = loadSaved();
    saved.push(choreo);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    recorded = [];
    recordedList.innerHTML = '';
    btnSave.classList.add('hidden');
    liveFeed.textContent = 'Saved! Press Record to create another.';

    renderSavedList();
  });

  // ── Saved list ──
  function renderSavedList(): void {
    const saved = loadSaved();
    savedList.innerHTML = '';
    emptyMsg.classList.toggle('hidden', saved.length > 0);

    saved.forEach((choreo) => {
      const row = document.createElement('div');
      row.className = 'card';
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: var(--space-md);';
      row.innerHTML = `
        <div style="text-align: left;">
          <div class="card__title" style="margin-bottom: 2px;">${choreo.name}</div>
          <div class="card__subtitle">${choreo.steps.length} motions · ${new Date(choreo.createdAt).toLocaleDateString()}</div>
        </div>
        <div class="row" style="gap: var(--space-sm);">
          <button class="btn btn--sage btn--small ch-replay-btn">▶ Replay</button>
          <button class="btn btn--ghost btn--small ch-delete-btn">🗑</button>
        </div>
      `;

      row.querySelector('.ch-replay-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        startReplay(choreo);
      });

      row.querySelector('.ch-delete-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChoreo(choreo.id);
      });

      savedList.appendChild(row);
    });
  }

  function deleteChoreo(id: string): void {
    const saved = loadSaved().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderSavedList();
  }

  // ── Replay ──
  function startReplay(choreo: SavedChoreography): void {
    recordSection.classList.add('hidden');
    replaySection.classList.remove('hidden');
    (page.querySelector('#ch-saved-section') as HTMLElement).classList.add('hidden');

    const titleEl = page.querySelector('#ch-replay-title') as HTMLElement;
    const promptArea = page.querySelector('#ch-replay-prompt-area') as HTMLElement;
    const cupArea = page.querySelector('#ch-replay-cup-area') as HTMLElement;
    const resultEl = page.querySelector('#ch-replay-result') as HTMLElement;

    titleEl.textContent = `Replaying: ${choreo.name}`;
    promptArea.innerHTML = '';
    cupArea.innerHTML = '';
    resultEl.innerHTML = '';

    const cup = new CupFill(cupArea);
    const motionPrompt = new MotionPrompt(promptArea);

    let idx = 0;
    let score = 0;
    let replayMotionHandler: ((e: Event) => void) | null = null;

    function nextStep(): void {
      if (idx >= choreo.steps.length) {
        finishReplay();
        return;
      }

      const step = choreo.steps[idx];
      motionPrompt.show(step.motion);
      motionPrompt.startTimer(10, () => {
        motionPrompt.markFail();
        idx++;
        setTimeout(nextStep, 800);
      });

      replayMotionHandler = (e: Event) => {
        const { motion, confidence } = (e as CustomEvent).detail as { motion: MotionType; confidence: number };
        if (motion === step.motion) {
          motionPrompt.stopTimer();
          motionPrompt.markSuccess();
          score += confidence;
          cup.setFill(score / choreo.steps.length);
          document.removeEventListener('motion-detected', replayMotionHandler!);
          replayMotionHandler = null;
          idx++;
          setTimeout(nextStep, 800);
        }
      };
      document.addEventListener('motion-detected', replayMotionHandler);
    }

    function finishReplay(): void {
      motionPrompt.destroy();
      if (replayMotionHandler) {
        document.removeEventListener('motion-detected', replayMotionHandler);
      }
      const pct = Math.round((score / choreo.steps.length) * 100);
      resultEl.innerHTML = `
        <div class="stack" style="margin-top: var(--space-lg);">
          <span style="font-size: 3rem;">${pct >= 70 ? '🎉' : '😅'}</span>
          <h3>${pct >= 70 ? 'Nailed it!' : 'Keep practising!'}</h3>
          <p>Accuracy: <strong>${pct}%</strong></p>
        </div>
      `;
    }

    nextStep();
  }

  replayBack.addEventListener('click', () => {
    replaySection.classList.add('hidden');
    recordSection.classList.remove('hidden');
    (page.querySelector('#ch-saved-section') as HTMLElement).classList.remove('hidden');
  });

  // ── Back ──
  page.querySelector('[data-action="back"]')!
    .addEventListener('click', () => router.home());

  // ── Render saved list when page becomes visible ──
  const observer = new MutationObserver(() => {
    if (page.classList.contains('active')) {
      renderSavedList();
      // Reset to record view
      recordSection.classList.remove('hidden');
      replaySection.classList.add('hidden');
      (page.querySelector('#ch-saved-section') as HTMLElement).classList.remove('hidden');
    }
  });
  observer.observe(page, { attributes: true, attributeFilter: ['class'] });

  return page;
}

/* ── localStorage helpers ── */
function loadSaved(): SavedChoreography[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}
