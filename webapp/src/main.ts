/**
 * Main entry point — initializes all modules and wires them together.
 */
import './style.css';
import { bus } from './modules/eventBus';
import './modules/serial';
import { detector } from './modules/motionDetector';
import { game } from './modules/gameManager';
import { renderer } from './modules/renderer';
import { dataChart } from './modules/chart';
import { ui } from './modules/ui';

async function init(): Promise<void> {
  console.log('☕ Spork — Initializing...');

  // 1. Load motion profiles for detection
  await detector.loadProfiles();

  // 2. Initialize the motion detector (listens for sensor-data events)
  detector.init();

  // 3. Initialize the game manager (listens for motion-detected events)
  game.init();

  // 4. Initialize the canvas renderer
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  renderer.init(gameCanvas);

  // 5. Initialize the Chart.js data graph
  const chartCanvas = document.getElementById('data-chart') as HTMLCanvasElement;
  dataChart.init(chartCanvas);

  // 6. Initialize UI overlays
  ui.init();

  // 7. Chart toggle
  const chartToggle = document.getElementById('show-chart') as HTMLInputElement;
  const chartPanel = document.getElementById('chart-panel')!;
  chartToggle.addEventListener('change', () => {
    chartPanel.classList.toggle('hidden', !chartToggle.checked);
    // Trigger resize so the game canvas reflows
    window.dispatchEvent(new Event('resize'));
  });

  // 8. Log events for debugging
  bus.on('serial-connected', () => console.log('✅ Arduino connected'));
  bus.on('serial-disconnected', () => console.log('🔌 Arduino disconnected'));
  bus.on('motion-detected', (m: string, c: number) => console.log(`🎯 Motion: ${m} (${(c * 100).toFixed(0)}%)`));
  bus.on('level-start', (l: any) => console.log(`🎮 Level ${l.id}: ${l.name}`));
  bus.on('level-end', (r: any) => console.log(`🏁 Level end — Score: ${r.score}, Passed: ${r.passed}`));

  console.log('☕ Spork — Ready! Connect your Arduino to start.');
}

init().catch(console.error);
