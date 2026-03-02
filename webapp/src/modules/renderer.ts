/**
 * Canvas-based game renderer — draws the interactive game visuals:
 * - 2D compass/dot visualizer showing real-time sensor position
 * - Motion guide animations (target patterns)
 * - Progress indicators and feedback effects
 * - "Cup filling" animation based on score
 */
import { bus } from './eventBus';
// detector is used indirectly via the bus
import { game } from './gameManager';
import { MOTION_LABELS } from './levels';
import type { SensorData, MotionType } from './types';

const TWO_PI = Math.PI * 2;

class GameRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private lastSensorData: SensorData | null = null;
  private trailPoints: { x: number; y: number; age: number }[] = [];
  private sensitivity = 2.5;
  private time = 0;

  // Cup fill animation
  private cupFillTarget = 0;
  private cupFillCurrent = 0;

  /** Attach to a canvas element */
  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    bus.on('sensor-data', (data: SensorData) => {
      this.lastSensorData = data;
    });

    this.animate();
  }

  /** Handle canvas resize */
  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  setSensitivity(val: number): void {
    this.sensitivity = val;
  }

  /** Main animation loop */
  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.time += 1 / 60;
    this.draw();
  };

  /** Main draw dispatcher */
  private draw(): void {
    const { ctx, width: w, height: h } = this;
    ctx.clearRect(0, 0, w, h);

    switch (game.state.screen) {
      case 'menu':
        this.drawMenu();
        break;
      case 'connecting':
        this.drawConnecting();
        break;
      case 'tutorial':
        this.drawTutorial();
        break;
      case 'playing':
        this.drawPlaying();
        break;
      case 'level-complete':
        this.drawLevelComplete();
        break;
      case 'game-over':
        this.drawGameOver();
        break;
      case 'creative':
        this.drawCreative();
        break;
    }
  }

  // ── MENU ────────────────────────────────────────────────────────

  private drawMenu(): void {
    const { ctx, width: w, height: h } = this;

    // Background pattern
    this.drawBackground();

    // Title
    ctx.fillStyle = '#E8D5B7';
    ctx.font = 'bold 48px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('☕ Spork', w / 2, h * 0.2);

    ctx.font = '18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#A89279';
    ctx.fillText('A motion-based tea & coffee brewing game', w / 2, h * 0.2 + 40);

    // Draw floating cup icon
    const cupY = h * 0.4 + Math.sin(this.time * 2) * 8;
    this.drawCup(w / 2, cupY, 60, 0.3 + Math.sin(this.time) * 0.1 + 0.2);

    // Instructions
    ctx.fillStyle = '#888';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Connect your Arduino and use the tools to brew!', w / 2, h * 0.7);
  }

  // ── CONNECTING ──────────────────────────────────────────────────

  private drawConnecting(): void {
    const { ctx, width: w, height: h } = this;
    this.drawBackground();

    ctx.fillStyle = '#E8D5B7';
    ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';

    const dots = '.'.repeat(Math.floor(this.time * 2) % 4);
    ctx.fillText(`Connecting${dots}`, w / 2, h / 2);

    ctx.fillStyle = '#888';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Select your Arduino serial port in the browser dialog', w / 2, h / 2 + 30);
  }

  // ── TUTORIAL ────────────────────────────────────────────────────

  private drawTutorial(): void {
    const { ctx, width: w, height: h } = this;
    this.drawBackground();

    const level = game.currentLevel;
    if (!level) return;

    // Title
    ctx.fillStyle = '#E8D5B7';
    ctx.font = 'bold 32px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${level.id}: ${level.name}`, w / 2, 60);

    ctx.fillStyle = '#A89279';
    ctx.font = '16px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(level.description, w / 2, 90);

    // Motion sequence preview
    const startX = w / 2 - (level.steps.length * 100) / 2;
    level.steps.forEach((step, i) => {
      const x = startX + i * 100 + 50;
      const y = h * 0.35;

      // Card background
      ctx.fillStyle = '#2A2520';
      ctx.beginPath();
      ctx.roundRect(x - 40, y - 30, 80, 80, 10);
      ctx.fill();

      ctx.strokeStyle = '#4A3F35';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - 40, y - 30, 80, 80, 10);
      ctx.stroke();

      // Motion animation preview
      this.drawMotionIcon(x, y + 5, step.motion, 20);

      // Label
      ctx.fillStyle = '#A89279';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(step.label, x, y + 60);

      // Arrow between steps
      if (i < level.steps.length - 1) {
        ctx.fillStyle = '#4A3F35';
        ctx.font = '18px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('→', x + 50, y + 10);
      }
    });

    // Live sensor preview if connected
    if (this.lastSensorData) {
      this.drawCompass(w / 2, h * 0.7, 70);
    }

    // Start prompt
    ctx.fillStyle = '#6B8F71';
    ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press "Start" when ready!', w / 2, h - 40);
  }

  // ── PLAYING ─────────────────────────────────────────────────────

  private drawPlaying(): void {
    const { ctx, width: w, height: h } = this;
    this.drawBackground();

    const level = game.currentLevel;
    const step = game.currentStep;
    if (!level || !step) return;

    const state = game.state;

    // ─ Top bar: level info + score
    ctx.fillStyle = '#1E1A16';
    ctx.fillRect(0, 0, w, 50);

    ctx.fillStyle = '#A89279';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${level.id} • Step ${state.currentStepIndex + 1}/${level.steps.length}`, 15, 30);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#6B8F71';
    ctx.fillText(`Score: ${state.score}`, w - 15, 30);

    // ─ Current motion instruction
    ctx.textAlign = 'center';
    ctx.fillStyle = '#E8D5B7';
    ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
    const label = MOTION_LABELS[step.motion];
    ctx.fillText(`${label.emoji} ${step.label}`, w / 2, 100);

    ctx.fillStyle = '#888';
    ctx.font = '15px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(step.description, w / 2, 130);

    // ─ Timer ring
    const timerX = w / 2;
    const timerY = h * 0.35;
    const timerR = 50;
    const progress = state.timeRemaining / step.duration;

    // Background ring
    ctx.beginPath();
    ctx.arc(timerX, timerY, timerR, 0, TWO_PI);
    ctx.strokeStyle = '#2A2520';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Progress ring
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + progress * TWO_PI;
    ctx.beginPath();
    ctx.arc(timerX, timerY, timerR, startAngle, endAngle);
    const timerColor = progress > 0.5 ? '#6B8F71' : progress > 0.2 ? '#C4A35A' : '#C25450';
    ctx.strokeStyle = timerColor;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Timer text
    ctx.fillStyle = '#E8D5B7';
    ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(Math.ceil(state.timeRemaining).toString(), timerX, timerY + 8);

    // ─ Motion guide animation (target pattern)
    const guideX = w * 0.25;
    const guideY = h * 0.65;
    ctx.fillStyle = '#A89279';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Target Pattern', guideX, guideY - 70);
    this.drawMotionGuide(guideX, guideY, step.motion, 60);

    // ─ Live sensor compass
    const compassX = w * 0.75;
    const compassY = h * 0.65;
    ctx.fillStyle = '#A89279';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Your Motion', compassX, compassY - 70);
    this.drawCompass(compassX, compassY, 60);

    // ─ Confidence bar at bottom
    const barY = h - 40;
    const barW = w * 0.6;
    const barH = 12;
    const barX = (w - barW) / 2;

    ctx.fillStyle = '#2A2520';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();

    const fillW = barW * Math.min(1, state.stepConfidence);
    const barColor = state.stepDetected ? '#6B8F71' : `hsl(${30 + state.stepConfidence * 90}, 70%, 50%)`;
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillW, barH, 6);
    ctx.fill();

    ctx.fillStyle = '#888';
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Match Confidence', w / 2, barY - 5);

    // ─ Feedback overlay
    if (state.lastFeedback && Date.now() - state.feedbackTimer < 1500) {
      const alpha = 1 - (Date.now() - state.feedbackTimer) / 1500;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#E8D5B7';
      ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(state.lastFeedback, w / 2, h * 0.48);
      ctx.globalAlpha = 1;
    }

    // ─ Step progress dots at very top
    const dotY = 65;
    const dotSpacing = 20;
    const dotsStart = w / 2 - (level.steps.length * dotSpacing) / 2;
    level.steps.forEach((_, i) => {
      const dx = dotsStart + i * dotSpacing + dotSpacing / 2;
      ctx.beginPath();
      ctx.arc(dx, dotY, 4, 0, TWO_PI);
      if (i < state.currentStepIndex) {
        ctx.fillStyle = '#6B8F71'; // completed
      } else if (i === state.currentStepIndex) {
        ctx.fillStyle = '#C4A35A'; // current
      } else {
        ctx.fillStyle = '#3A3530'; // upcoming
      }
      ctx.fill();
    });
  }

  // ── LEVEL COMPLETE ──────────────────────────────────────────────

  private drawLevelComplete(): void {
    const { ctx, width: w, height: h } = this;
    this.drawBackground();

    const level = game.currentLevel;
    const state = game.state;

    // Animated cup fill
    this.cupFillTarget = state.score / 100;
    this.cupFillCurrent += (this.cupFillTarget - this.cupFillCurrent) * 0.03;

    this.drawCup(w / 2, h * 0.35, 80, this.cupFillCurrent);

    ctx.fillStyle = '#6B8F71';
    ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('☕ Level Complete!', w / 2, h * 0.58);

    ctx.fillStyle = '#E8D5B7';
    ctx.font = 'bold 48px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${state.score}%`, w / 2, h * 0.68);

    ctx.fillStyle = '#A89279';
    ctx.font = '16px "Segoe UI", system-ui, sans-serif';
    const stars = state.score >= 90 ? '⭐⭐⭐' : state.score >= 70 ? '⭐⭐' : '⭐';
    ctx.fillText(stars, w / 2, h * 0.74);

    if (level) {
      ctx.fillStyle = '#888';
      ctx.font = '14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`${level.name} — Passing: ${level.passingScore}%`, w / 2, h * 0.80);
    }
  }

  // ── GAME OVER ───────────────────────────────────────────────────

  private drawGameOver(): void {
    const { ctx, width: w, height: h } = this;
    this.drawBackground();

    this.cupFillTarget = game.state.score / 100;
    this.cupFillCurrent += (this.cupFillTarget - this.cupFillCurrent) * 0.03;
    this.drawCup(w / 2, h * 0.35, 80, this.cupFillCurrent);

    ctx.fillStyle = '#C25450';
    ctx.font = 'bold 32px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Not Quite...', w / 2, h * 0.58);

    ctx.fillStyle = '#E8D5B7';
    ctx.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${game.state.score}%`, w / 2, h * 0.66);

    ctx.fillStyle = '#888';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Try again — you\'ll get it!', w / 2, h * 0.74);
  }

  // ── CREATIVE MODE ───────────────────────────────────────────────

  private drawCreative(): void {
    const { ctx, width: w, height: h } = this;
    this.drawBackground();

    const state = game.state;

    ctx.fillStyle = '#E8D5B7';
    ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎨 Creative Mode', w / 2, 50);

    if (state.creativeRecording) {
      // Pulsing record indicator
      const pulse = 0.5 + Math.sin(this.time * 4) * 0.5;
      ctx.fillStyle = `rgba(194, 84, 80, ${pulse})`;
      ctx.beginPath();
      ctx.arc(w / 2, 80, 8, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = '#C25450';
      ctx.font = '14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('Recording...', w / 2, 100);
    }

    // Show recorded motions
    const seq = state.creativeSequence;
    if (seq.length > 0) {
      const startX = w / 2 - (Math.min(seq.length, 8) * 60) / 2;
      seq.slice(-8).forEach((motion, i) => {
        const x = startX + i * 60 + 30;
        const y = h * 0.4;
        const info = MOTION_LABELS[motion];

        ctx.fillStyle = '#2A2520';
        ctx.beginPath();
        ctx.roundRect(x - 25, y - 20, 50, 50, 8);
        ctx.fill();

        ctx.fillStyle = '#E8D5B7';
        ctx.font = '20px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(info.emoji, x, y + 10);

        ctx.fillStyle = '#888';
        ctx.font = '9px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(info.label, x, y + 38);
      });
    } else {
      ctx.fillStyle = '#888';
      ctx.font = '14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('Perform motions to record your sequence!', w / 2, h * 0.4);
    }

    // Live compass
    this.drawCompass(w / 2, h * 0.7, 60);
  }

  // ── SHARED DRAWING HELPERS ──────────────────────────────────────

  /** Cozy dark background with subtle grain */
  private drawBackground(): void {
    const { ctx, width: w, height: h } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1A1612');
    grad.addColorStop(1, '#12100E');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  /** Draw the compass/dot visualizer */
  private drawCompass(cx: number, cy: number, radius: number): void {
    const { ctx } = this;

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.fillStyle = '#1A1612';
    ctx.fill();
    ctx.strokeStyle = '#3A3530';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cross-hairs
    ctx.strokeStyle = '#2A2520';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, TWO_PI);
    ctx.fillStyle = '#555';
    ctx.fill();

    // Sensor dot (if data available)
    if (this.lastSensorData) {
      const d = this.lastSensorData;
      let dx = d.x * this.sensitivity;
      let dy = -d.y * this.sensitivity; // invert Y for screen coords

      // Clamp to circle
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius - 5) {
        const ratio = (radius - 5) / dist;
        dx *= ratio;
        dy *= ratio;
      }

      // Trail
      this.trailPoints.push({ x: cx + dx, y: cy + dy, age: 0 });
      if (this.trailPoints.length > 40) this.trailPoints.shift();

      // Draw trail
      this.trailPoints.forEach((p) => {
        p.age++;
        const alpha = Math.max(0, 1 - p.age / 40);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, TWO_PI);
        ctx.fillStyle = `rgba(54, 162, 235, ${alpha * 0.5})`;
        ctx.fill();
      });

      // Main dot
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, 6, 0, TWO_PI);
      ctx.fillStyle = '#36a2eb';
      ctx.shadowColor = '#36a2eb';
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /** Draw an animated motion guide showing what the target motion looks like */
  private drawMotionGuide(cx: number, cy: number, motion: MotionType, radius: number): void {
    const { ctx } = this;
    const t = this.time;

    // Background
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.fillStyle = '#1A1612';
    ctx.fill();
    ctx.strokeStyle = '#3A3530';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Animated guide dot showing expected motion path
    ctx.fillStyle = '#C4A35A';
    ctx.shadowColor = '#C4A35A';
    ctx.shadowBlur = 10;

    let gx = 0, gy = 0;
    const r = radius * 0.6;

    switch (motion) {
      case 'circle':
        gx = Math.cos(t * 3) * r;
        gy = Math.sin(t * 3) * r;
        break;
      case 'left_right':
        gx = Math.sin(t * 4) * r;
        gy = 0;
        break;
      case 'up_down':
        gx = 0;
        gy = Math.sin(t * 4) * r;
        break;
      case 'press_down':
        gy = Math.abs(Math.sin(t * 3)) * r;
        gx = Math.sin(t * 0.5) * r * 0.1;
        break;
      case 'scoop':
        gx = Math.sin(t * 2) * r * 0.5;
        gy = -Math.abs(Math.cos(t * 2)) * r;
        break;
      case 'squeeze':
        const squeeze = Math.sin(t * 5);
        gx = squeeze * r * 0.3;
        gy = squeeze * r * 0.3;
        break;
      case 'w_motion':
        // W shape trace
        const phase = (t * 2) % 4;
        if (phase < 1) { gx = -r + phase * r; gy = -r * phase; }
        else if (phase < 2) { gx = (phase - 1) * r; gy = -r + (phase - 1) * r; }
        else if (phase < 3) { gx = (phase - 2) * r; gy = -(phase - 2) * r; }
        else { gx = (phase - 3) * r; gy = -r + (phase - 3) * r; }
        break;
    }

    ctx.beginPath();
    ctx.arc(cx + gx, cy + gy, 5, 0, TWO_PI);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Motion name
    ctx.fillStyle = '#C4A35A';
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(MOTION_LABELS[motion].emoji, cx, cy + radius + 18);
  }

  /** Draw a motion icon (static) for the tutorial cards */
  private drawMotionIcon(cx: number, cy: number, motion: MotionType, size: number): void {
    const { ctx } = this;

    ctx.fillStyle = '#E8D5B7';
    ctx.font = `${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(MOTION_LABELS[motion].emoji, cx, cy);
    ctx.textBaseline = 'alphabetic';
  }

  /** Draw a cozy teacup with liquid fill level */
  private drawCup(cx: number, cy: number, size: number, fillLevel: number): void {
    const { ctx } = this;
    const w = size;
    const h = size * 1.2;
    const x = cx - w / 2;
    const y = cy - h / 2;

    // Cup body
    ctx.fillStyle = '#E8D5B7';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.85, y + h);
    ctx.lineTo(x + w * 0.15, y + h);
    ctx.closePath();
    ctx.fill();

    // Liquid
    const liquidH = h * Math.min(1, Math.max(0, fillLevel)) * 0.85;
    const liquidY = y + h - liquidH;
    const liquidColor = fillLevel > 0.7 ? '#6B8F71' : fillLevel > 0.4 ? '#C4A35A' : '#8B6E4E';

    ctx.fillStyle = liquidColor;
    ctx.beginPath();
    const shrinkTop = w * 0.15 * (1 - liquidH / h);
    ctx.moveTo(x + shrinkTop + (w * 0.15 * liquidH / h), liquidY);
    ctx.lineTo(x + w - shrinkTop - (w * 0.15 * liquidH / h), liquidY);
    ctx.lineTo(x + w * 0.85, y + h);
    ctx.lineTo(x + w * 0.15, y + h);
    ctx.closePath();
    ctx.fill();

    // Cup outline
    ctx.strokeStyle = '#A89279';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.85, y + h);
    ctx.lineTo(x + w * 0.15, y + h);
    ctx.closePath();
    ctx.stroke();

    // Handle
    ctx.beginPath();
    ctx.arc(x + w + 10, cy, 15, -0.8, 0.8);
    ctx.strokeStyle = '#A89279';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Steam
    if (fillLevel > 0.3) {
      ctx.strokeStyle = `rgba(168, 146, 121, ${0.3 + Math.sin(this.time * 3) * 0.15})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const sx = x + w * 0.3 + i * w * 0.2;
        ctx.beginPath();
        ctx.moveTo(sx, y - 5);
        ctx.quadraticCurveTo(
          sx + Math.sin(this.time * 2 + i) * 8,
          y - 20,
          sx + Math.sin(this.time * 3 + i) * 5,
          y - 35
        );
        ctx.stroke();
      }
    }
  }
}

export const renderer = new GameRenderer();
