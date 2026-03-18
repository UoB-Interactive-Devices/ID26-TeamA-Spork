/**
 * MotionDetector component — WebSocket listener (Scored Protocol v2).
 *
 * Connects to the Python backend at ws://localhost:8765.
 *
 * NEW PROTOCOL:
 *   → Outgoing: {"expect": "circular"}  — sent before each motion step
 *   ← Incoming: {"score": 0.85, "motion": "circular", "passed": true}
 *
 * LEGACY COMPAT:
 *   ← Incoming: {"detected": true, "motion": "...", "confidence": 0.9}
 *   Both incoming shapes dispatch a "motion-detected" CustomEvent on document
 *   so Play.ts, TutorialDetail.ts etc. need no changes.
 *
 * SENSOR DATA:
 *   ← Incoming: {"sensor": true, x, y, z, mag, state, phase_remaining, noise_floor}
 *   Dispatches "sensor-data" CustomEvent on document.
 */
import type { MotionDetectionMessage, MotionType } from '../types/motion.types.ts';

// Backend motion names → frontend MotionType
// (backend speaks "circular" / "teabag" / "up_down";
//  frontend types are "grinding" / "up_down" / "press_down")
const MOTION_MAP: Record<string, MotionType> = {
  circular: 'grinding',
  teabag:   'up_down',
  up_down:  'press_down',
  // pass-through if backend already uses frontend names
  grinding:   'grinding',
  press_down: 'press_down',
};

export type MotionCallback = (motion: MotionType, confidence: number) => void;

class MotionDetectorWS {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: MotionCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  // The motion the frontend is currently expecting (set via expectMotion())
  private _expectedMotion: string | null = null;

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

  /**
   * Tell the backend which motion to score next.
   * Call this just before the player is prompted to perform a step.
   *
   * @param frontendMotion  The MotionType as used by the frontend
   *                        e.g. "grinding", "up_down", "press_down"
   */
  expectMotion(frontendMotion: MotionType): void {
    // Translate frontend name → backend name
    const backendName = FRONTEND_TO_BACKEND[frontendMotion] ?? frontendMotion;
    this._expectedMotion = backendName;

    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this._sendExpect(backendName);
    } else {
      // Will be sent once reconnected (see onopen handler)
      console.log(`[WS] Will send expect="${backendName}" once connected`);
    }
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

        // If a motion was queued before connection was ready, send it now
        if (this._expectedMotion) {
          this._sendExpect(this._expectedMotion);
        }
      };

      this.ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
          this._handleMessage(msg);
        } catch { /* ignore malformed messages */ }
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.ws = null;
        console.log('🔌 WebSocket disconnected — retrying in 3s');
        document.dispatchEvent(new CustomEvent('ws-status', { detail: { connected: false } }));
        this._scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this._scheduleReconnect();
    }
  }

  /** Close the connection */
  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _sendExpect(backendMotion: string): void {
    try {
      this.ws!.send(JSON.stringify({ expect: backendMotion }));
      console.log(`[WS] → expect="${backendMotion}"`);
    } catch (e) {
      console.warn('[WS] Failed to send expect:', e);
    }
  }

  private _handleMessage(msg: Record<string, unknown>): void {
    // ── Sensor data (25 Hz heartbeat) ──────────────────────────────────────
    if (msg.sensor) {
      document.dispatchEvent(
        new CustomEvent('sensor-data', {
          detail: {
            x:              msg.x              as number,
            y:              msg.y              as number,
            z:              msg.z              as number,
            mag:            msg.mag            as number,
            state:          msg.state          as string,
            phaseRemaining: msg.phase_remaining as number,
            noiseFloor:     msg.noise_floor    as number,
          },
        }),
      );
      return;
    }

    // ── Scored result (new protocol) ───────────────────────────────────────
    // Shape: { score: number, motion: string, passed: boolean }
    if (typeof msg.score === 'number' && typeof msg.motion === 'string') {
      const backendMotion = msg.motion as string;
      const frontendMotion = MOTION_MAP[backendMotion] ?? (backendMotion as MotionType);
      const score  = msg.score  as number;
      const passed = msg.passed as boolean;

      console.log(
        `[WS] ← score  motion="${backendMotion}" → "${frontendMotion}"`,
        `score=${(score * 100).toFixed(0)}%  passed=${passed}`,
      );

      // Use score directly as "confidence" so Play.ts works unchanged
      this.listeners.forEach(cb => cb(frontendMotion, score));
      document.dispatchEvent(
        new CustomEvent('motion-detected', {
          detail: {
            motion:     frontendMotion,
            confidence: score,
            passed,
            score,
          },
        }),
      );
      return;
    }

    // ── Legacy detection event (old protocol / fallback) ───────────────────
    // Shape: { detected: true, motion: string, confidence: number }
    if (msg.detected) {
      const det = msg as unknown as MotionDetectionMessage;
      const backendMotion = det.motion as string;
      const frontendMotion = MOTION_MAP[backendMotion] ?? (backendMotion as MotionType);
      const confidence = det.confidence;

      console.log(
        `[WS] ← detected  motion="${backendMotion}" → "${frontendMotion}"`,
        `confidence=${(confidence * 100).toFixed(0)}%`,
      );

      this.listeners.forEach(cb => cb(frontendMotion, confidence));
      document.dispatchEvent(
        new CustomEvent('motion-detected', {
          detail: { motion: frontendMotion, confidence },
        }),
      );
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}

// Frontend MotionType → backend motion name used in the Python detector
const FRONTEND_TO_BACKEND: Partial<Record<MotionType, string>> = {
  grinding:   'circular',
  up_down:    'teabag',
  press_down: 'up_down',
};

/** Singleton instance used across the entire app */
export const motionDetector = new MotionDetectorWS();