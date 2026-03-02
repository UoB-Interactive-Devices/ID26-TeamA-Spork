/**
 * Game state manager — orchestrates level progression, scoring, and step timing.
 * Listens for motion-detected events and drives the game loop.
 */
import { bus } from './eventBus';
import { LEVELS, MOTION_LABELS } from './levels';
import { detector } from './motionDetector';
import type { GameScreen, GameLevel, LevelStep, MotionType } from './types';

export interface GameState {
  screen: GameScreen;
  currentLevelIndex: number;
  currentStepIndex: number;
  score: number;
  stepScores: number[];
  timeRemaining: number;
  stepStartTime: number;
  totalLevelsCompleted: number;
  // Creative mode
  creativeSequence: MotionType[];
  creativeRecording: boolean;
  creativePlaybackIndex: number;
  // Feedback
  lastFeedback: string;
  feedbackTimer: number;
  // Step detection state
  stepDetected: boolean;
  stepConfidence: number;
}

class GameManager {
  state: GameState = {
    screen: 'menu',
    currentLevelIndex: 0,
    currentStepIndex: 0,
    score: 0,
    stepScores: [],
    timeRemaining: 0,
    stepStartTime: 0,
    totalLevelsCompleted: 0,
    creativeSequence: [],
    creativeRecording: false,
    creativePlaybackIndex: 0,
    lastFeedback: '',
    feedbackTimer: 0,
    stepDetected: false,
    stepConfidence: 0,
  };

  private tickInterval: number | null = null;
  private checkInterval: number | null = null;

  get currentLevel(): GameLevel | null {
    return LEVELS[this.state.currentLevelIndex] ?? null;
  }

  get currentStep(): LevelStep | null {
    const level = this.currentLevel;
    if (!level) return null;
    return level.steps[this.state.currentStepIndex] ?? null;
  }

  get levelCount(): number {
    return LEVELS.length;
  }

  /** Initialize event listeners */
  init(): void {
    bus.on('motion-detected', (motion: MotionType, confidence: number) => {
      this.onMotionDetected(motion, confidence);
    });
  }

  /** Navigate to a screen */
  setScreen(screen: GameScreen): void {
    this.state.screen = screen;
    bus.emit('screen-change', screen);
  }

  /** Start a specific level */
  startLevel(levelIndex: number): void {
    this.state.currentLevelIndex = levelIndex;
    this.state.currentStepIndex = 0;
    this.state.score = 0;
    this.state.stepScores = [];
    this.state.stepDetected = false;
    this.state.stepConfidence = 0;

    this.setScreen('tutorial');
    bus.emit('level-start', LEVELS[levelIndex]);
  }

  /** Begin playing the current level (after tutorial) */
  beginPlaying(): void {
    this.state.currentStepIndex = 0;
    this.state.stepDetected = false;
    this.state.stepConfidence = 0;
    this.setScreen('playing');
    this.startStep();
  }

  /** Start the current step timer */
  private startStep(): void {
    const step = this.currentStep;
    if (!step) {
      this.finishLevel();
      return;
    }

    this.state.timeRemaining = step.duration;
    this.state.stepStartTime = Date.now();
    this.state.stepDetected = false;
    this.state.stepConfidence = 0;
    this.showFeedback(`${MOTION_LABELS[step.motion].emoji} ${step.label}`);
    bus.emit('step-start', step, this.state.currentStepIndex);

    // Countdown timer
    this.clearTimers();
    this.tickInterval = window.setInterval(() => this.tick(), 100);
    this.checkInterval = window.setInterval(() => this.checkMotion(), 80);
  }

  /** Tick — update time remaining */
  private tick(): void {
    const step = this.currentStep;
    if (!step) return;

    const elapsed = (Date.now() - this.state.stepStartTime) / 1000;
    this.state.timeRemaining = Math.max(0, step.duration - elapsed);

    if (this.state.timeRemaining <= 0) {
      // Time's up for this step
      if (!this.state.stepDetected) {
        this.scoreStep(0);
        this.showFeedback('⏰ Time\'s up!');
      }
      this.advanceStep();
    }

    bus.emit('tick', this.state);
  }

  /** Actively poll the detector for the expected motion */
  private checkMotion(): void {
    const step = this.currentStep;
    if (!step || this.state.stepDetected) return;

    const result = detector.checkForMotion(step.motion);
    this.state.stepConfidence = result.confidence;

    if (result.detected && result.confidence > 0.3) {
      this.state.stepDetected = true;

      // Score based on how quickly and confidently it was detected
      const elapsed = (Date.now() - this.state.stepStartTime) / 1000;
      const timeBonus = Math.max(0, 1 - elapsed / step.duration);
      const stepScore = Math.round((result.confidence * 50 + timeBonus * 50));
      this.scoreStep(stepScore);

      const rating = stepScore >= 80 ? '⭐ Perfect!' : stepScore >= 50 ? '👍 Good!' : '👌 OK';
      this.showFeedback(rating);

      // Short delay then advance
      setTimeout(() => this.advanceStep(), 1000);
    }

    bus.emit('tick', this.state);
  }

  /** Record score for current step */
  private scoreStep(score: number): void {
    this.state.stepScores.push(score);
    this.state.score = Math.round(
      this.state.stepScores.reduce((a, b) => a + b, 0) / this.state.stepScores.length
    );
  }

  /** Advance to the next step or finish level */
  private advanceStep(): void {
    this.clearTimers();
    this.state.currentStepIndex++;
    this.state.stepDetected = false;
    this.state.stepConfidence = 0;

    const level = this.currentLevel;
    if (!level || this.state.currentStepIndex >= level.steps.length) {
      this.finishLevel();
    } else {
      this.startStep();
    }
  }

  /** Level complete */
  private finishLevel(): void {
    this.clearTimers();
    const level = this.currentLevel;
    const passed = level ? this.state.score >= level.passingScore : false;

    if (passed) {
      this.state.totalLevelsCompleted = Math.max(
        this.state.totalLevelsCompleted,
        this.state.currentLevelIndex + 1
      );
    }

    this.setScreen(passed ? 'level-complete' : 'game-over');
    bus.emit('level-end', { score: this.state.score, passed });
  }

  /** Handle a detected motion (from global detector) */
  private onMotionDetected(motion: MotionType, _confidence: number): void {
    if (this.state.screen === 'creative' && this.state.creativeRecording) {
      this.state.creativeSequence.push(motion);
      const info = MOTION_LABELS[motion];
      this.showFeedback(`${info.emoji} Recorded: ${info.label}`);
      bus.emit('creative-motion-added', motion);
    }
  }

  // --- Creative Mode ---

  /** Start recording a custom sequence */
  startCreativeRecording(): void {
    this.state.creativeSequence = [];
    this.state.creativeRecording = true;
    this.state.creativePlaybackIndex = 0;
    this.setScreen('creative');
    this.showFeedback('🎤 Recording... perform motions!');
  }

  /** Stop recording */
  stopCreativeRecording(): void {
    this.state.creativeRecording = false;
    this.showFeedback(`Recorded ${this.state.creativeSequence.length} motions`);
    bus.emit('creative-recording-stopped', this.state.creativeSequence);
  }

  /** Playback the creative sequence as a custom level */
  playCreativeSequence(): void {
    if (this.state.creativeSequence.length === 0) return;

    // Build a temporary level from the recorded sequence
    const customSteps = this.state.creativeSequence.map((motion) => ({
      motion,
      label: MOTION_LABELS[motion].label,
      duration: 6,
      description: MOTION_LABELS[motion].description,
    }));

    // Temporarily inject as a level
    const customLevel: GameLevel = {
      id: 99,
      name: 'Your Creation',
      description: 'Replay your recorded motion sequence!',
      steps: customSteps,
      passingScore: 40,
    };

    LEVELS[99] = customLevel as any; // temp hack
    this.state.currentLevelIndex = LEVELS.length; // won't match, we'll override
    // Actually let's just use the built-in system
    this.state.currentStepIndex = 0;
    this.state.score = 0;
    this.state.stepScores = [];
    this.state.stepDetected = false;

    // Override currentLevel getter by pushing temporarily
    LEVELS.push(customLevel);
    this.state.currentLevelIndex = LEVELS.length - 1;

    this.setScreen('playing');
    this.startStep();
  }

  // --- Utility ---

  showFeedback(msg: string): void {
    this.state.lastFeedback = msg;
    this.state.feedbackTimer = Date.now();
    bus.emit('feedback', msg);
  }

  private clearTimers(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const game = new GameManager();
