#!/usr/bin/env python3
"""
Gesture Detector v3 — Per-tool calibration based on new tool recordings.
=========================================================================
Classifier tuned to weaker signals from embedded-magnet tools.

Key approach:
- press_down: very low ZC (≤ tool threshold), spike present
- up_down:    high ZC (≥ tool threshold) OR high dom_freq — either is enough
- circular:   medium ZC within tool-specific range

Usage:
    python detector_v3.py --test
    python detector_v3.py --test --tool "Kettle"
"""

import argparse
import glob
import math
import os
import time

import numpy as np
import pandas as pd
from scipy.signal import butter, filtfilt

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SAMPLE_RATE          = 25
CALIBRATION_SECONDS  = 2.0
COUNTDOWN_SECONDS    = 3.0
RECORDING_SECONDS    = 8.0
COOLDOWN_SECONDS     = 3.0
MIN_MOTION_SAMPLES   = 8
LOW_PASS_CUTOFF_HZ   = 3.0
NOISE_FLOOR_MIN      = 5.0
NOISE_FLOOR_MAX      = 50.0
BASELINE_SAMPLES     = 50

TEABAG_RHYTHM_LOW_HZ  = 1.5
TEABAG_RHYTHM_HIGH_HZ = 3.5
TEABAG_RHYTHM_RATIO   = 0.25

# ---------------------------------------------------------------------------
# Per-tool profiles
# ---------------------------------------------------------------------------
# Thresholds tuned from --test output analysis.
#
# press_zc_max      — ZC at or below this = press_down
# up_down_zc_min    — ZC at or above this = up_down candidate
# up_down_freq_min  — dom_freq above this also triggers up_down (OR with ZC)
# circular_zc_min   — ZC lower bound for circular
# circular_zc_max   — ZC upper bound for circular
# peak_reject_uT    — hard reject if mag_max below this

TOOL_PROFILES: dict[str, dict] = {
    "Coffee Grinder": {
        "peak_reject_uT":   2.0,
        "press_zc_max":     10,
        "up_down_zc_min":   35,
        "up_down_freq_min": 0.5,
        "circular_zc_min":  15,
        "circular_zc_max":  32,
    },
    "Coffee Press": {
        "peak_reject_uT":   2.0,
        "press_zc_max":     16,
        "up_down_zc_min":   28,
        "up_down_freq_min": 0.6,
        "circular_zc_min":  17,
        "circular_zc_max":  27,
    },
    "Kettle": {
        "peak_reject_uT":   3.0,
        "press_zc_max":     5,
        "up_down_zc_min":   55,
        "up_down_freq_min": 0.8,
        "circular_zc_min":  6,
        "circular_zc_max":  20,
    },
    "Sieve": {
        "peak_reject_uT":   2.0,
        "press_zc_max":     3,
        "up_down_zc_min":   40,
        "up_down_freq_min": 1.5,
        "circular_zc_min":  12,
        "circular_zc_max":  25,
    },
    "Spork": {
        "peak_reject_uT":   3.0,
        "press_zc_max":     4,
        "up_down_zc_min":   15,
        "up_down_freq_min": 0.5,
        "circular_zc_min":  17,
        "circular_zc_max":  35,
    },
    "Tea Bag": {
        "peak_reject_uT":   2.0,
        "press_zc_max":     5,
        "up_down_zc_min":   18,
        "up_down_freq_min": 0.8,
        "circular_zc_min":  18,
        "circular_zc_max":  28,
    },
    "Tongs": {
        "peak_reject_uT":   2.0,
        "press_zc_max":     5,
        "up_down_zc_min":   50,
        "up_down_freq_min": 2.0,
        "circular_zc_min":  18,
        "circular_zc_max":  28,
    },
}


# ---------------------------------------------------------------------------
# Signal processing
# ---------------------------------------------------------------------------

def low_pass_filter(data: np.ndarray,
                    cutoff_hz: float = LOW_PASS_CUTOFF_HZ,
                    sample_rate: float = SAMPLE_RATE) -> np.ndarray:
    nyq  = sample_rate / 2.0
    norm = cutoff_hz / nyq
    b, a = butter(2, norm, btype="low")
    return filtfilt(b, a, data)


def zero_crossings(signal: np.ndarray) -> int:
    centered = signal - signal.mean()
    return int(np.sum(np.diff(np.sign(centered)) != 0))


def dominant_frequency(signal: np.ndarray,
                       sample_rate: float = SAMPLE_RATE) -> float:
    fft_vals    = np.abs(np.fft.rfft(signal - signal.mean()))
    freqs       = np.fft.rfftfreq(len(signal), d=1.0 / sample_rate)
    fft_vals[0] = 0
    if len(freqs) < 2:
        return 0.0
    return float(freqs[np.argmax(fft_vals)])


def has_rhythmic_content(magnitude: np.ndarray,
                         sample_rate: float = SAMPLE_RATE) -> bool:
    fft_vals    = np.abs(np.fft.rfft(magnitude - magnitude.mean()))
    freqs       = np.fft.rfftfreq(len(magnitude), d=1.0 / sample_rate)
    low_mask    = (freqs >= 0) & (freqs < 1.0)
    rhythm_mask = (freqs >= TEABAG_RHYTHM_LOW_HZ) & (freqs <= TEABAG_RHYTHM_HIGH_HZ)
    if not np.any(low_mask) or not np.any(rhythm_mask):
        return False
    low_e   = float(np.max(fft_vals[low_mask]))
    rhythm_e = float(np.max(fft_vals[rhythm_mask]))
    return low_e > 0 and rhythm_e > low_e * TEABAG_RHYTHM_RATIO


def compute_xy_rotation(x: np.ndarray,
                        y: np.ndarray) -> tuple[float, float, float]:
    if len(x) < 4:
        return 0.0, 0.0, 0.0
    angles    = np.arctan2(y, x)
    unwrapped = np.unwrap(angles)
    total_rot = unwrapped[-1] - unwrapped[0]
    n_circles = total_rot / (2.0 * np.pi)
    diffs     = np.diff(unwrapped)
    if len(diffs) == 0 or total_rot == 0:
        return n_circles, 0.0, float(np.sqrt(x**2 + y**2).mean())
    same_dir    = float(np.sum(np.sign(diffs) == np.sign(total_rot)))
    consistency = same_dir / len(diffs)
    xy_mag_mean = float(np.sqrt(x**2 + y**2).mean())
    return n_circles, consistency, xy_mag_mean


def extract_features(x: np.ndarray,
                     y: np.ndarray,
                     z: np.ndarray) -> dict:
    mag      = np.sqrt(x**2 + y**2 + z**2)
    zc_mag   = zero_crossings(mag)
    mag_mean = float(mag.mean())
    mag_std  = float(mag.std())
    mag_max  = float(np.max(mag))
    dom_freq = dominant_frequency(mag)

    active_mask = mag > mag.mean()
    if np.sum(active_mask) > 5:
        xa, ya, za = x[active_mask], y[active_mask], z[active_mask]
    else:
        xa, ya, za = x, y, z

    axis_stds     = {'x': float(np.std(xa)), 'y': float(np.std(ya)), 'z': float(np.std(za))}
    dominant_axis = max(axis_stds, key=axis_stds.get)

    xy_circles, xy_consistency, xy_mag_mean = compute_xy_rotation(x, y)
    xy_mag_max = float(np.max(np.sqrt(x**2 + y**2)))

    return {
        "zc_mag":         zc_mag,
        "mag_mean":       round(mag_mean, 2),
        "mag_std":        round(mag_std, 2),
        "mag_max":        round(mag_max, 2),
        "dom_freq":       round(dom_freq, 3),
        "dominant_axis":  dominant_axis,
        "xy_circles":     round(xy_circles, 2),
        "xy_consistency": round(xy_consistency, 2),
        "xy_mag_mean":    round(xy_mag_mean, 2),
        "xy_mag_max":     round(xy_mag_max, 2),
    }


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------

def classify_v3(features: dict,
                magnitude: np.ndarray,
                noise_floor: float,
                tool_name: str | None) -> tuple[str | None, float]:
    if tool_name is None:
        return (None, 0.0)

    profile = TOOL_PROFILES.get(tool_name)
    if profile is None:
        return (None, 0.0)

    if features["mag_max"] < profile["peak_reject_uT"]:
        return (None, 0.0)
    if features["mag_mean"] < 1.0:
        return (None, 0.0)

    zc  = features["zc_mag"]
    df  = features["dom_freq"]
    std = features["mag_std"]

    # ── Press down ─────────────────────────────────────────────────────────
    if zc <= profile["press_zc_max"]:
        if std > features["mag_mean"] * 0.5:
            conf = min(1.0, features["mag_max"] / 50.0)
            return ("press_down", round(conf, 2))
        return (None, 0.0)

    # ── Up down ────────────────────────────────────────────────────────────
    # High ZC OR high dominant frequency — either is sufficient
    is_high_zc   = zc >= profile["up_down_zc_min"]
    is_high_freq = df >= profile["up_down_freq_min"]

    if is_high_zc or is_high_freq:
        rhythmic  = has_rhythmic_content(magnitude)
        zc_conf   = min(1.0, zc / 70.0)
        freq_conf = min(1.0, df / 2.0)
        conf      = round(max(zc_conf, freq_conf), 2)
        if rhythmic:
            conf = min(1.0, conf + 0.1)
        return ("up_down", conf)

    # ── Circular ───────────────────────────────────────────────────────────
    if profile["circular_zc_min"] <= zc <= profile["circular_zc_max"]:
        xy_circles     = features["xy_circles"]
        xy_consistency = features["xy_consistency"]

        if abs(xy_circles) >= 0.5 and xy_consistency >= 0.55:
            circ_conf = min(1.0, xy_consistency / 0.85)
            rot_conf  = min(1.0, abs(xy_circles) / 3.0)
            conf      = round((circ_conf + rot_conf) / 2.0, 2)
        else:
            zc_range = max(1, profile["circular_zc_max"] - profile["circular_zc_min"])
            zc_pos   = zc - profile["circular_zc_min"]
            conf     = round(min(1.0, (zc_pos / zc_range) * 0.6 + 0.4), 2)

        return ("grinding", conf)

    return (None, 0.0)


# ---------------------------------------------------------------------------
# Detector state machine
# ---------------------------------------------------------------------------

class DetectorV3:
    """
    Guided motion detector v3 with per-tool NFC calibration.
    Requires set_tool() before any classification will occur.
    """

    CALIBRATING = "calibrating"
    COUNTDOWN   = "countdown"
    RECORDING   = "recording"
    CLASSIFYING = "classifying"
    COOLDOWN    = "cooldown"

    def __init__(self):
        self.state              = self.CALIBRATING
        self._phase_start       = time.time()
        self._cal_buffer: list[tuple] = []
        self._rec_buffer: list[tuple] = []
        self._baseline_x        = 0.0
        self._baseline_y        = 0.0
        self._baseline_z        = 0.0
        self._noise_floor       = 999.0
        self.last_result: dict | None = None
        self.last_mag           = 0.0
        self._tool_name: str | None = None
        self._printed_countdown: set[int] = set()
        self._printed_recording: set[int] = set()
        self._announced_phase   = False

    def set_tool(self, tool_name: str | None) -> None:
        self._tool_name = tool_name
        if tool_name:
            known  = tool_name in TOOL_PROFILES
            status = "known" if known else "UNKNOWN — motions will be rejected"
            print(f"  [TOOL] Active tool: {tool_name} ({status})")
        else:
            print("  [TOOL] No tool — scan NFC tag to enable detection")

    @property
    def tool_name(self) -> str | None:
        return self._tool_name

    @property
    def phase_remaining(self) -> float:
        elapsed   = time.time() - self._phase_start
        durations = {
            self.CALIBRATING: CALIBRATION_SECONDS,
            self.COUNTDOWN:   COUNTDOWN_SECONDS,
            self.RECORDING:   RECORDING_SECONDS,
            self.COOLDOWN:    COOLDOWN_SECONDS,
        }
        return max(0.0, durations.get(self.state, 0.0) - elapsed)

    def _enter_state(self, new_state: str) -> None:
        self.state              = new_state
        self._phase_start       = time.time()
        self._announced_phase   = False
        self._printed_countdown = set()
        self._printed_recording = set()

    def add_sample(self, x_raw: float, y_raw: float, z_raw: float) -> list[dict]:
        xc = x_raw - self._baseline_x
        yc = y_raw - self._baseline_y
        zc = z_raw - self._baseline_z
        self.last_mag = math.sqrt(xc**2 + yc**2 + zc**2)
        remaining     = self.phase_remaining

        if self.state == self.CALIBRATING:
            if not self._announced_phase:
                tool_str = f" [{self._tool_name}]" if self._tool_name else " [NO TOOL]"
                print(f"\n  [CALIBRATING]{tool_str} Hold still... ({CALIBRATION_SECONDS:.0f}s)")
                self._announced_phase = True
            self._cal_buffer.append((x_raw, y_raw, z_raw))
            if remaining <= 0:
                self._finish_calibration()
            return []

        if self.state == self.COUNTDOWN:
            if not self._announced_phase:
                print(f"\n  [COUNTDOWN] Get ready... ({COUNTDOWN_SECONDS:.0f}s)")
                self._announced_phase = True
            self._cal_buffer.append((x_raw, y_raw, z_raw))
            sec = int(remaining) + 1
            if sec not in self._printed_countdown and sec <= COUNTDOWN_SECONDS:
                self._printed_countdown.add(sec)
                print(f"    {sec}...")
            if remaining <= 0:
                self._finish_countdown()
            return []

        if self.state == self.RECORDING:
            if not self._announced_phase:
                print(f"\n  [RECORDING] >>> GO! ({RECORDING_SECONDS:.0f}s) <<<")
                self._announced_phase = True
            self._rec_buffer.append((x_raw, y_raw, z_raw))
            sec = int(remaining)
            if sec not in self._printed_recording and sec < RECORDING_SECONDS:
                self._printed_recording.add(sec)
                n = len(self._rec_buffer)
                print(f"    {sec + 1}s remaining... ({n} samples, |mag|={self.last_mag:.1f})")
            if remaining <= 0:
                return self._finish_recording()
            return []

        if self.state == self.COOLDOWN:
            if not self._announced_phase:
                if self.last_result:
                    print(f"\n  [RESULT] >>> {self.last_result['motion'].upper()} "
                          f"({self.last_result['confidence']:.0%}) <<<")
                else:
                    print("\n  [RESULT] No confident match.")
                print(f"  [COOLDOWN] Next round in {COOLDOWN_SECONDS:.0f}s...")
                self._announced_phase = True
            if remaining <= 0:
                self._cal_buffer = []
                self._enter_state(self.CALIBRATING)
            return []

        return []

    def _finish_calibration(self) -> None:
        if not self._cal_buffer:
            self._enter_state(self.COUNTDOWN)
            return
        arr = np.array(self._cal_buffer)
        self._baseline_x = float(arr[:, 0].mean())
        self._baseline_y = float(arr[:, 1].mean())
        self._baseline_z = float(arr[:, 2].mean())
        centered  = arr - [self._baseline_x, self._baseline_y, self._baseline_z]
        mags      = np.sqrt(np.sum(centered**2, axis=1))
        self._noise_floor = min(NOISE_FLOOR_MAX,
                                max(NOISE_FLOOR_MIN,
                                    float(mags.mean() + 3.0 * mags.std())))
        print(f"    baseline: x={self._baseline_x:.1f} y={self._baseline_y:.1f} "
              f"z={self._baseline_z:.1f}")
        print(f"    noise floor: {self._noise_floor:.1f} uT")
        if self._noise_floor >= 45.0:
            print("  [!] WARNING: High noise floor — move magnet away during calibration")
            self._noise_floor = 15.0
        self._cal_buffer = []
        self._enter_state(self.COUNTDOWN)

    def _finish_countdown(self) -> None:
        if self._cal_buffer:
            arr = np.array(self._cal_buffer)
            self._baseline_x = float(arr[:, 0].mean())
            self._baseline_y = float(arr[:, 1].mean())
            self._baseline_z = float(arr[:, 2].mean())
            centered  = arr - [self._baseline_x, self._baseline_y, self._baseline_z]
            mags      = np.sqrt(np.sum(centered**2, axis=1))
            self._noise_floor = min(NOISE_FLOOR_MAX,
                                    max(NOISE_FLOOR_MIN,
                                        float(mags.mean() + 3.0 * mags.std())))
        self._rec_buffer = []
        self._enter_state(self.RECORDING)

    def _finish_recording(self) -> list[dict]:
        n = len(self._rec_buffer)
        print(f"\n  [CLASSIFYING] {n} samples ({n / SAMPLE_RATE:.1f}s)")

        if n < MIN_MOTION_SAMPLES:
            print(f"    Too few samples ({n})")
            self.last_result = None
            self._enter_state(self.COOLDOWN)
            return []

        arr = np.array(self._rec_buffer)
        x   = arr[:, 0] - self._baseline_x
        y   = arr[:, 1] - self._baseline_y
        z   = arr[:, 2] - self._baseline_z

        x_f = low_pass_filter(x)
        y_f = low_pass_filter(y)
        z_f = low_pass_filter(z)

        magnitude = np.sqrt(x_f**2 + y_f**2 + z_f**2)
        features  = extract_features(x_f, y_f, z_f)

        print(f"    Tool: {self._tool_name or 'NONE'}")
        print(f"    zc={features['zc_mag']} df={features['dom_freq']} "
              f"mag_mean={features['mag_mean']} mag_max={features['mag_max']}")

        motion, confidence = classify_v3(
            features, magnitude, self._noise_floor, self._tool_name
        )

        if motion is None:
            if self._tool_name is None:
                print("    No tool scanned — scan NFC tag first.")
            elif self._tool_name not in TOOL_PROFILES:
                print(f"    Unknown tool '{self._tool_name}'.")
            else:
                print("    No motion detected.")
            self.last_result = None
            self._enter_state(self.COOLDOWN)
            return []

        print(f"    -> {motion} (confidence={confidence:.0%})")
        self.last_result = {
            "motion":     motion,
            "detected":   True,
            "confidence": confidence,
        }
        self._enter_state(self.COOLDOWN)
        return [self.last_result]


# ---------------------------------------------------------------------------
# Offline test
# ---------------------------------------------------------------------------

def run_test(tool_filter: str | None = None) -> None:
    data_dir  = os.path.join(os.path.dirname(__file__), "data")
    csv_files = sorted(glob.glob(os.path.join(data_dir, "*.csv")))

    KNOWN_TOOLS = set(TOOL_PROFILES.keys())
    csv_files   = [
        p for p in csv_files
        if any(os.path.basename(p).startswith(t) for t in KNOWN_TOOLS)
    ]

    if tool_filter:
        csv_files = [p for p in csv_files
                     if os.path.basename(p).startswith(tool_filter)]

    if not csv_files:
        print(f"  No matching CSV files in {data_dir}")
        return

    print(f"\n  Found {len(csv_files)} CSV files\n")
    print(f"  {'File':<38} {'Tool':<16} {'Expected':<12} {'Detected':<12} "
          f"{'Conf':>5}    {'zc':>4} {'df':>6} {'m_m':>6} {'m_x':>7} {'m_s':>6}")
    print("  " + "-" * 122)

    totals:  dict[str, int] = {}
    correct: dict[str, int] = {}

    motion_map = {
        "circular":   "grinding",
        "up_down":    "up_down",
        "press_down": "press_down",
    }

    for path in csv_files:
        filename  = os.path.basename(path)
        tool_name = None
        expected  = None

        for t in TOOL_PROFILES:
            if filename.startswith(t):
                tool_name = t
                remainder = filename[len(t):].lstrip("_ ")
                for m in ["circular", "press_down", "up_down"]:
                    if remainder.startswith(m):
                        expected = m
                        break
                break

        if tool_name is None or expected is None:
            continue

        expected_frontend = motion_map[expected]

        try:
            df_csv = pd.read_csv(path)
        except Exception as e:
            print(f"  {filename:<38} ERROR: {e}")
            continue

        if len(df_csv) < 20:
            continue

        n_bl = max(1, min(BASELINE_SAMPLES, len(df_csv) // 4))
        x = df_csv["x_uT"].values.copy()
        y = df_csv["y_uT"].values.copy()
        z = df_csv["z_uT"].values.copy()
        x -= x[:n_bl].mean()
        y -= y[:n_bl].mean()
        z -= z[:n_bl].mean()

        x_m, y_m, z_m = x[n_bl:], y[n_bl:], z[n_bl:]
        if len(x_m) < MIN_MOTION_SAMPLES:
            continue

        x_f = low_pass_filter(x_m)
        y_f = low_pass_filter(y_m)
        z_f = low_pass_filter(z_m)

        mag  = np.sqrt(x_f**2 + y_f**2 + z_f**2)
        feat = extract_features(x_f, y_f, z_f)
        motion, conf = classify_v3(feat, mag, NOISE_FLOOR_MIN, tool_name)

        det_str = motion if motion else "--"
        match   = "✓" if motion == expected_frontend else "✗"

        totals[expected]  = totals.get(expected, 0) + 1
        if motion == expected_frontend:
            correct[expected] = correct.get(expected, 0) + 1

        print(f"  {filename:<38} {tool_name:<16} {expected_frontend:<12} "
              f"{det_str:<12} {conf:>5.0%} {match}  "
              f"{feat['zc_mag']:>4} {feat['dom_freq']:>6.2f} "
              f"{feat['mag_mean']:>6.1f} {feat['mag_max']:>7.1f} {feat['mag_std']:>6.1f}")

    print("\n  " + "=" * 60)
    print("  ACCURACY SUMMARY")
    print("  " + "=" * 60)
    overall_t = 0
    overall_c = 0
    for m in ["circular", "press_down", "up_down"]:
        t        = totals.get(m, 0)
        c        = correct.get(m, 0)
        overall_t += t
        overall_c += c
        pct      = f"{c/t:.0%}" if t > 0 else "n/a"
        print(f"  {m:<12}: {c}/{t}  {pct}")
    if overall_t > 0:
        print(f"  {'TOTAL':<12}: {overall_c}/{overall_t}  "
              f"{overall_c/overall_t:.0%}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gesture Detector v3")
    parser.add_argument("--test", "-t", action="store_true")
    parser.add_argument("--tool", type=str, default=None,
                        help="Filter test to a specific tool name")
    args = parser.parse_args()

    if args.test:
        run_test(tool_filter=args.tool)
    else:
        print("  Use --test to run offline CSV analysis.")
        print("  Import DetectorV3 in bridge_v2.py for live detection.")