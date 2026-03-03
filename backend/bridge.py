#!/usr/bin/env python3
"""
Serial → WebSocket Bridge for Spork
====================================
Reads magnetometer JSON from Arduino over serial, runs real-time
motion detection using saved profiles, and broadcasts results to
the webapp via WebSocket (ws://localhost:8765).

Usage:
    python bridge.py                        # auto-detect serial port
    python bridge.py --port /dev/cu.usbmodem14201
    python bridge.py --raw                  # just print raw data (hardware test)

Requirements:
    pip install pyserial websockets numpy
"""

import argparse
import asyncio
import json
import math
import sys
import time
from collections import deque
from pathlib import Path

import numpy as np
import serial
import serial.tools.list_ports
import websockets


# ── Configuration ─────────────────────────────────────────
WS_HOST = "localhost"
WS_PORT = 8765
BAUD_RATE = 115200
SAMPLE_RATE = 25          # Hz  (Arduino sends every 40ms)
BUFFER_SIZE = 200          # ~8 seconds max capture window
DETECTION_COOLDOWN = 1.5   # seconds after a detection before next one
CALIBRATION_SAMPLES = 50   # first ~2 s used to learn the live noise floor

# Segment detection parameters
START_THRESHOLD_SAMPLES = 3    # consecutive samples above noise to START
END_THRESHOLD_SAMPLES = 8      # consecutive samples below noise to END
MIN_GESTURE_SAMPLES = 8        # minimum samples in a gesture (~0.3 s)
MAX_GESTURE_SAMPLES = 150      # maximum gesture length (~6 s) — auto-end

# ── Load motion profiles ─────────────────────────────────
PROFILES_PATH = Path(__file__).parent.parent / "plots" / "motion_profiles.json"
WEBAPP_PROFILES_PATH = Path(__file__).parent.parent / "webapp" / "public" / "motion_profiles.json"


def load_profiles() -> dict:
    """Try to load motion_profiles.json from either location."""
    for path in [PROFILES_PATH, WEBAPP_PROFILES_PATH]:
        if path.exists():
            with open(path) as f:
                data = json.load(f)
            print(f"  ✓ Loaded profiles from {path}")
            return data
    print("  ⚠ No motion_profiles.json found — using defaults")
    return {}


profiles = load_profiles()
baseline = profiles.get("baseline_offsets", {"x": 0, "y": 0, "z": 0})
motions = profiles.get("motions", {})


# ── Auto-detect Arduino serial port ──────────────────────
def find_serial_port() -> str | None:
    """Find the first likely Arduino/USB serial port."""
    ports = serial.tools.list_ports.comports()
    for p in ports:
        desc = (p.description or "").lower()
        mfr = (p.manufacturer or "").lower()
        if any(kw in desc for kw in ["arduino", "ch340", "cp210", "ftdi", "usbmodem", "usbserial", "esp32", "esp"]):
            return p.device
        if any(kw in mfr for kw in ["arduino", "wch", "silicon labs", "ftdi", "espressif"]):
            return p.device
    # Fallback: return any USB serial device or /dev/cu.usb* port
    for p in ports:
        desc = (p.description or "").lower()
        if "usb" in p.device.lower() or "usb serial" in desc:
            return p.device
    return None


# ── Segment-then-classify motion detector ─────────────────
class RealtimeDetector:
    """
    State-machine detector that captures gesture windows, then classifies them.

    States:
      CALIBRATING -> collecting first N samples to learn baseline + noise floor
      IDLE        -> waiting for motion to begin (signal rises above noise)
      ACTIVE      -> gesture in progress, accumulating samples
      COOLDOWN    -> just detected something, waiting before allowing next

    When a gesture ends (signal returns to noise), the captured window is
    analysed and scored against all motion profiles.
    """

    CALIBRATING = "calibrating"
    IDLE = "idle"
    ACTIVE = "active"
    COOLDOWN = "cooldown"

    def __init__(self):
        # Auto-calibration
        self._cal_samples: list[tuple[float, float, float]] = []
        self._calibrated = False
        self._noise_floor = 999.0
        self._live_offset_x = 0.0
        self._live_offset_y = 0.0
        self._live_offset_z = 0.0

        # State machine
        self._state = self.CALIBRATING
        self._consecutive_above = 0
        self._consecutive_below = 0
        self._gesture_buffer: list[dict] = []
        self._cooldown_until: float = 0.0

    def add_sample(self, x_raw: float, y_raw: float, z_raw: float) -> list[dict]:
        """Feed a raw sensor sample. Returns detection events (usually 0 or 1)."""

        # -- CALIBRATING ------------------------------------------------
        if self._state == self.CALIBRATING:
            self._cal_samples.append((x_raw, y_raw, z_raw))
            if len(self._cal_samples) >= CALIBRATION_SAMPLES:
                arr = np.array(self._cal_samples)
                self._live_offset_x = float(arr[:, 0].mean())
                self._live_offset_y = float(arr[:, 1].mean())
                self._live_offset_z = float(arr[:, 2].mean())
                mags_cal = np.sqrt(
                    (arr[:, 0] - self._live_offset_x) ** 2 +
                    (arr[:, 1] - self._live_offset_y) ** 2 +
                    (arr[:, 2] - self._live_offset_z) ** 2
                )
                self._noise_floor = max(
                    15.0, float(mags_cal.mean() + 3.0 * mags_cal.std())
                )
                self._calibrated = True
                self._state = self.IDLE
                print(f"  Auto-calibrated live baseline: "
                      f"x={self._live_offset_x:.1f} y={self._live_offset_y:.1f} "
                      f"z={self._live_offset_z:.1f} uT")
                print(f"    noise floor={self._noise_floor:.1f} uT")
            return []

        # Subtract live baseline
        x = x_raw - self._live_offset_x
        y = y_raw - self._live_offset_y
        z = z_raw - self._live_offset_z
        mag = math.sqrt(x * x + y * y + z * z)
        sample = {"x": x, "y": y, "z": z, "mag": mag, "t": time.time()}

        is_above = mag > self._noise_floor

        # -- COOLDOWN ---------------------------------------------------
        if self._state == self.COOLDOWN:
            if time.time() >= self._cooldown_until:
                self._state = self.IDLE
                self._consecutive_above = 0
                self._consecutive_below = 0
            return []

        # -- IDLE: waiting for gesture to start -------------------------
        if self._state == self.IDLE:
            if is_above:
                self._consecutive_above += 1
                if self._consecutive_above >= START_THRESHOLD_SAMPLES:
                    self._state = self.ACTIVE
                    self._gesture_buffer = []
                    self._consecutive_below = 0
                    print("  >> Motion started - recording gesture...")
            else:
                self._consecutive_above = 0
            return []

        # -- ACTIVE: gesture in progress --------------------------------
        if self._state == self.ACTIVE:
            self._gesture_buffer.append(sample)

            if not is_above:
                self._consecutive_below += 1
            else:
                self._consecutive_below = 0

            gesture_ended = (
                self._consecutive_below >= END_THRESHOLD_SAMPLES
                or len(self._gesture_buffer) >= MAX_GESTURE_SAMPLES
            )

            if gesture_ended:
                # Trim trailing quiet samples
                if self._consecutive_below > 0:
                    self._gesture_buffer = self._gesture_buffer[:-self._consecutive_below]

                n = len(self._gesture_buffer)
                dur = n / SAMPLE_RATE

                if n >= MIN_GESTURE_SAMPLES:
                    print(f"  << Motion ended - {n} samples ({dur:.1f}s). Classifying...")
                    result = self._classify_gesture(self._gesture_buffer)
                    if result:
                        self._state = self.COOLDOWN
                        self._cooldown_until = time.time() + DETECTION_COOLDOWN
                        return [result]
                    else:
                        print("    -> No confident match.")
                else:
                    print(f"    -> Too short ({n} samples) - ignored.")

                self._state = self.IDLE
                self._gesture_buffer = []
                self._consecutive_above = 0
                self._consecutive_below = 0

        return []

    def _classify_gesture(self, gesture: list[dict]) -> dict | None:
        """
        Classify a captured gesture window by scoring its features against
        all motion profiles. Returns the best match or None.
        """
        xs = np.array([s["x"] for s in gesture])
        ys = np.array([s["y"] for s in gesture])
        zs = np.array([s["z"] for s in gesture])
        mags = np.array([s["mag"] for s in gesture])

        g_x_std = float(xs.std())
        g_y_std = float(ys.std())
        g_z_std = float(zs.std())
        g_mag_mean = float(mags.mean())
        g_mag_std = float(mags.std())
        g_mag_max = float(mags.max())

        # Most active axis
        axis_stds = {"x": g_x_std, "y": g_y_std, "z": g_z_std}
        g_most_active = max(axis_stds, key=axis_stds.get)

        # Axis ratio vector (normalised)
        total_std = g_x_std + g_y_std + g_z_std + 1e-6
        g_ratio = np.array([g_x_std / total_std, g_y_std / total_std, g_z_std / total_std])

        # Dominant frequency via FFT on magnitude signal
        g_freq = 0.0
        if len(mags) > 10:
            centered = mags - mags.mean()
            fft_vals = np.abs(np.fft.rfft(centered))
            freqs = np.fft.rfftfreq(len(centered), d=1.0 / SAMPLE_RATE)
            # Ignore DC (index 0) and very low freqs
            if len(fft_vals) > 2:
                dom_idx = np.argmax(fft_vals[1:]) + 1
                g_freq = float(freqs[dom_idx])

        # Count zero-crossings on the most active axis (periodicity proxy)
        active_data = {"x": xs, "y": ys, "z": zs}[g_most_active]
        centered_active = active_data - active_data.mean()
        zero_crossings = int(np.sum(np.diff(np.sign(centered_active)) != 0))
        g_crossings_per_sec = zero_crossings / (len(gesture) / SAMPLE_RATE) if len(gesture) > 1 else 0

        print(f"    Gesture features: axis={g_most_active} freq={g_freq:.2f}Hz "
              f"mag_mean={g_mag_mean:.0f} mag_std={g_mag_std:.0f} max={g_mag_max:.0f} "
              f"x_std={g_x_std:.0f} y_std={g_y_std:.0f} z_std={g_z_std:.0f} "
              f"zc/s={g_crossings_per_sec:.1f}")

        best_name = None
        best_score = 0.0
        all_scores: list[tuple[str, float]] = []

        for name, profile in motions.items():
            if name == "baseline":
                continue

            score = 0.0
            p_mag_mean = profile.get("magnitude_mean", 50)
            p_mag_std = profile.get("magnitude_std", 30)
            p_freq = profile.get("dominant_freq_hz", 0.5)

            # 1. Frequency similarity (0-0.30) — STRONGEST differentiator
            if p_freq > 0 and g_freq > 0:
                freq_ratio = min(g_freq, p_freq) / max(g_freq, p_freq)
                score += 0.30 * freq_ratio
            elif p_freq == 0 and g_freq == 0:
                score += 0.15  # both zero — neutral

            # 2. Most active axis match (0.20)
            if g_most_active == profile.get("most_active_axis", "x"):
                score += 0.20

            # 3. Axis ratio L1 distance (0-0.15) — L1 is more discriminating than cosine
            px = profile.get("x_std", 1)
            py = profile.get("y_std", 1)
            pz = profile.get("z_std", 1)
            pt = px + py + pz + 1e-6
            p_ratio = np.array([px / pt, py / pt, pz / pt])
            l1_dist = float(np.sum(np.abs(g_ratio - p_ratio)))  # 0 = identical, 2 = opposite
            axis_score = max(0.0, 1.0 - l1_dist * 2.0)  # penalise differences
            score += 0.15 * axis_score

            # 4. Magnitude mean similarity (0-0.15)
            if p_mag_mean > 0:
                mag_ratio = min(g_mag_mean, p_mag_mean) / max(g_mag_mean, p_mag_mean)
                score += 0.15 * mag_ratio

            # 5. Magnitude std similarity (0-0.10)
            if p_mag_std > 0:
                std_ratio = min(g_mag_std, p_mag_std) / max(g_mag_std, p_mag_std)
                score += 0.10 * std_ratio

            # 6. Peak magnitude sanity check (0-0.10)
            threshold = profile.get("detection_threshold_uT", 100)
            if g_mag_max >= threshold * 0.4:
                score += 0.10
            elif g_mag_max >= threshold * 0.2:
                score += 0.05

            all_scores.append((name, score))

            if score > best_score:
                best_score = score
                best_name = name

        # Print top 3 matches for debugging
        all_scores.sort(key=lambda x: x[1], reverse=True)
        top3 = all_scores[:3]
        print(f"    Top 3: " + " | ".join(f"{n}={s:.3f}" for n, s in top3))

        # Require minimum score AND gap between #1 and #2
        if best_name and best_score >= 0.40:
            second_score = all_scores[1][1] if len(all_scores) > 1 else 0
            gap = best_score - second_score

            # Reject near-ties unconditionally, or small gaps with low scores
            if gap < 0.005 or (gap < 0.03 and best_score < 0.55):
                print(f"    -> Ambiguous (gap={gap:.3f}) — rejected.")
                return None

            confidence = min(1.0, best_score / 0.80)
            print(f"    -> {best_name} (score={best_score:.3f}, gap={gap:.3f}, confidence={confidence:.0%})")
            return {
                "motion": best_name,
                "detected": True,
                "confidence": round(confidence, 2),
            }
        return None


# ── WebSocket server ──────────────────────────────────────
connected_clients: set = set()


async def ws_handler(websocket):
    """Handle a new WebSocket client connection."""
    connected_clients.add(websocket)
    remote = websocket.remote_address
    print(f"  🌐 Client connected: {remote}")
    try:
        async for _ in websocket:
            pass  # We only send, but keep connection alive
    finally:
        connected_clients.discard(websocket)
        print(f"  🌐 Client disconnected: {remote}")


async def broadcast(message: dict):
    """Send a JSON message to all connected WebSocket clients."""
    if not connected_clients:
        return
    data = json.dumps(message)
    await asyncio.gather(
        *[client.send(data) for client in connected_clients],
        return_exceptions=True,
    )


# ── Serial reader ────────────────────────────────────────
async def serial_reader(port: str, raw_mode: bool = False, baud_rate: int = BAUD_RATE):
    """
    Read JSON lines from Arduino serial, run detection,
    and broadcast results over WebSocket.
    """
    detector = RealtimeDetector()
    sample_count = 0

    print(f"\n  📡 Opening serial port: {port} @ {baud_rate} baud")

    try:
        ser = serial.Serial(port, baud_rate, timeout=1)
    except serial.SerialException as e:
        print(f"  ✗ Could not open {port}: {e}")
        print("    Make sure Arduino is plugged in and the port is correct.")
        print("    Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"      {p.device}  — {p.description}")
        return

    # Flush stale data
    await asyncio.sleep(0.5)
    ser.reset_input_buffer()
    print("  ✓ Serial connected — reading data...\n")

    try:
        while True:
            # Read in executor to avoid blocking the event loop
            line = await asyncio.get_event_loop().run_in_executor(
                None, ser.readline
            )

            if not line:
                continue

            try:
                text = line.decode("utf-8", errors="ignore").strip()
                if not text:
                    continue
                data = json.loads(text)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue

            x_raw = data.get("x", 0)
            y_raw = data.get("y", 0)
            z_raw = data.get("z", 0)

            sample_count += 1

            if raw_mode:
                # Raw mode: just print values for hardware testing
                # Quick baseline subtraction for display only
                x_d = x_raw - baseline.get("x", 0)
                y_d = y_raw - baseline.get("y", 0)
                z_d = z_raw - baseline.get("z", 0)
                mag_d = math.sqrt(x_d * x_d + y_d * y_d + z_d * z_d)
                print(
                    f"  #{sample_count:>5}  "
                    f"x={x_raw:>8.1f}  y={y_raw:>8.1f}  z={z_raw:>8.1f}  "
                    f"(cal: x={x_d:>7.1f} y={y_d:>7.1f} z={z_d:>7.1f}  |mag|={mag_d:>7.1f})"
                )
                # Also broadcast raw data so the webapp can display it
                await broadcast({
                    "raw": True,
                    "x": round(x_raw, 2),
                    "y": round(y_raw, 2),
                    "z": round(z_raw, 2),
                    "mag": round(mag_d, 2),
                })
                continue

            # Detection mode — pass RAW readings; detector does its
            # own live-calibration (per-recording style baseline)
            events = detector.add_sample(x_raw, y_raw, z_raw)

            # Print magnitude periodically so you can see the sensor is alive
            if sample_count % 25 == 0:
                # Use detector's live baseline for display
                x_c = x_raw - detector._live_offset_x
                y_c = y_raw - detector._live_offset_y
                z_c = z_raw - detector._live_offset_z
                mag_c = math.sqrt(x_c * x_c + y_c * y_c + z_c * z_c)
                print(
                    f"  📊 #{sample_count:>5}  |mag|={mag_c:>7.1f} µT  "
                    f"(x={x_c:>7.1f} y={y_c:>7.1f} z={z_c:>7.1f})"
                )

            for event in events:
                print(
                    f"  🎯 Detected: {event['motion']:>12}  "
                    f"confidence={event['confidence']:.0%}"
                )
                await broadcast(event)

            # Periodic heartbeat (every ~2s) so clients know we're alive
            if sample_count % 50 == 0:
                x_h = x_raw - detector._live_offset_x
                y_h = y_raw - detector._live_offset_y
                z_h = z_raw - detector._live_offset_z
                mag_h = math.sqrt(x_h * x_h + y_h * y_h + z_h * z_h)
                await broadcast({
                    "heartbeat": True,
                    "samples": sample_count,
                    "mag": round(mag_h, 2),
                })

    except KeyboardInterrupt:
        pass
    finally:
        ser.close()
        print("\n  Serial port closed.")


# ── Main ──────────────────────────────────────────────────
async def main():
    parser = argparse.ArgumentParser(description="Spork: Arduino → WebSocket bridge")
    parser.add_argument(
        "--port", "-p",
        help="Serial port (e.g. /dev/cu.usbmodem14201 or COM3). Auto-detects if omitted.",
    )
    parser.add_argument(
        "--raw", "-r",
        action="store_true",
        help="Raw mode — just print sensor values (for hardware testing).",
    )
    parser.add_argument(
        "--baud", "-b",
        type=int,
        default=BAUD_RATE,
        help=f"Baud rate (default: {BAUD_RATE})",
    )
    args = parser.parse_args()

    baud = args.baud

    # Find serial port
    port = args.port or find_serial_port()
    if not port:
        print("  ✗ No Arduino serial port found.")
        print("    Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"      {p.device}  — {p.description}")
        print("\n    Specify manually:  python bridge.py --port /dev/cu.usbmodem14201")
        sys.exit(1)

    print(r"""
    ╔═══════════════════════════════════════╗
    ║   ☕  Spork — Arduino Bridge          ║
    ╚═══════════════════════════════════════╝
    """)

    mode = "RAW (hardware test)" if args.raw else "DETECTION"
    print(f"  Mode : {mode}")
    print(f"  Port : {port}")
    print(f"  Baud : {baud}")
    print(f"  WS   : ws://{WS_HOST}:{WS_PORT}")

    # Start WebSocket server
    async with websockets.serve(ws_handler, WS_HOST, WS_PORT):
        print(f"\n  ✓ WebSocket server running on ws://{WS_HOST}:{WS_PORT}")
        print("  ✓ Waiting for webapp to connect...\n")

        # Start serial reader
        await serial_reader(port, raw_mode=args.raw, baud_rate=baud)


if __name__ == "__main__":
    asyncio.run(main())
