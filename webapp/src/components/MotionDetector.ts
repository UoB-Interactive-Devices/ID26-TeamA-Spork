/**
 * MotionDetector component — WebSocket listener.
 *
 * Connects to the Python backend at ws://localhost:8765 and
 * dispatches custom events when motions are detected.
 */
import type { MotionDetectionMessage, MotionType } from '../types/motion.types.ts';

export type MotionCallback = (motion: MotionType, confidence: number) => void;

class MotionDetectorWS {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: MotionCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  constructor(url = 'ws://localhost:8765') {
    this.url = url;
  }

  /** Whether the WebSocket is currently open */
  get connected(): boolean {
    return this._connected;
  }

  /** Register a callback for motion detection events */
  onMotion(cb: MotionCallback): void {
    this.listeners.push(cb);
  }

  /** Remove a previously registered callback */
  offMotion(cb: MotionCallback): void {
    this.listeners = this.listeners.filter(l => l !== cb);
  }

  /** Open the WebSocket connection */
  connect(): void {
    if (this.ws) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this._connected = true;
        console.log('🔌 WebSocket connected');
        document.dispatchEvent(new CustomEvent('ws-status', { detail: { connected: true } }));
      };

      this.ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg: MotionDetectionMessage = JSON.parse(ev.data);
          if (msg.detected) {
            this.listeners.forEach(cb => cb(msg.motion, msg.confidence));
            document.dispatchEvent(
              new CustomEvent('motion-detected', {
                detail: { motion: msg.motion, confidence: msg.confidence },
              }),
            );
          }
        } catch { /* ignore malformed messages */ }
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.ws = null;
        console.log('🔌 WebSocket disconnected — retrying in 3s');
        document.dispatchEvent(new CustomEvent('ws-status', { detail: { connected: false } }));
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  /** Close the connection */
  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}

/** Singleton instance */
export const motionDetector = new MotionDetectorWS();
