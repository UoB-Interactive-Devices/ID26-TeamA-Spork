/**
 * Chart module — real-time Chart.js graph of magnetometer X/Y/Z data
 */
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Title } from 'chart.js';
import { bus } from './eventBus';
import type { SensorData } from './types';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Title);

const MAX_POINTS = 60;

class DataChart {
  private chart: Chart | null = null;

  /** Initialize chart on a canvas element */
  init(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array(MAX_POINTS).fill(''),
        datasets: [
          { label: 'X (µT)', borderColor: '#ff6384', data: [], borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
          { label: 'Y (µT)', borderColor: '#36a2eb', data: [], borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
          { label: 'Z (µT)', borderColor: '#4caf50', data: [], borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#888', font: { size: 11 } } },
        },
        scales: {
          y: {
            min: -500,
            max: 500,
            ticks: { stepSize: 100, color: '#555', font: { size: 10 } },
            grid: { color: '#2A2520' },
            title: { display: true, text: 'µT', color: '#888' },
          },
          x: {
            ticks: { display: false },
            grid: { color: '#2A2520' },
          },
        },
      },
    });

    bus.on('sensor-data', (data: SensorData) => this.onData(data));
  }

  private onData(data: SensorData): void {
    if (!this.chart) return;

    const datasets = this.chart.data.datasets;
    datasets[0].data.push(data.x);
    datasets[1].data.push(data.y);
    datasets[2].data.push(data.z);

    if (datasets[0].data.length > MAX_POINTS) {
      datasets.forEach((d) => (d.data as number[]).shift());
    }

    this.chart.update('none');
  }
}

export const dataChart = new DataChart();
