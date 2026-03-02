/**
 * Shared type definitions for the Spork Motion Brewing Game.
 */

/* ── Sensor Types ──────────────────────────────────────── */

/** Raw magnetometer reading from Arduino */
export interface MagReading {
  x: number;
  y: number;
  z: number;
  x2?: number;
  y2?: number;
}

/** Smoothed & offset-corrected sensor data */
export interface SensorData {
  x: number;
  y: number;
  z: number;
  magnitude: number;
  timestamp: number;
}

/* ── Motion Profiles ───────────────────────────────────── */

/** Single motion profile from motion_profiles.json */
export interface MotionProfile {
  motion: string;
  x_range: number;
  x_max: number;
  x_min: number;
  x_std: number;
  y_range: number;
  y_max: number;
  y_min: number;
  y_std: number;
  z_range: number;
  z_max: number;
  z_min: number;
  z_std: number;
  magnitude_mean: number;
  magnitude_max: number;
  magnitude_std: number;
  dominant_freq_hz: number;
  most_active_axis: 'x' | 'y' | 'z';
  axes_all_active: boolean;
  spike_count: number;
  is_periodic_spikes: boolean;
  detection_threshold_uT: number;
  min_active_samples: number;
}

/** Full profiles JSON structure */
export interface MotionProfilesData {
  baseline_offsets: { x: number; y: number; z: number };
  sample_rate_hz: number;
  motions: Record<string, MotionProfile>;
}

/* ── Game Motion Types ─────────────────────────────────── */

export type MotionType =
  | 'circle'
  | 'left_right'
  | 'press_down'
  | 'scoop'
  | 'squeeze'
  | 'up_down'
  | 'w_motion';

export const ALL_MOTIONS: MotionType[] = [
  'circle', 'left_right', 'press_down', 'scoop', 'squeeze', 'up_down', 'w_motion',
];

/** Human-friendly labels for each motion */
export const MOTION_META: Record<MotionType, { label: string; emoji: string; description: string; prop: string }> = {
  circle:     { label: 'Circle',     emoji: '🔄', description: 'Move in a circular stirring motion',     prop: 'Matcha Whisk' },
  left_right: { label: 'Left-Right', emoji: '↔️',  description: 'Sway the tool side to side',             prop: 'Stirring Spoon' },
  press_down: { label: 'Press Down', emoji: '⬇️',  description: 'Press the tool firmly downward',         prop: 'French Press' },
  scoop:      { label: 'Scoop',      emoji: '🥄', description: 'Scoop upward in a smooth arc',           prop: 'Sieve' },
  squeeze:    { label: 'Squeeze',    emoji: '✊', description: 'Squeeze the tool firmly',                prop: 'Tea Bag' },
  up_down:    { label: 'Up-Down',    emoji: '↕️',  description: 'Dip the tool up and down rhythmically',  prop: 'Kettle' },
  w_motion:   { label: 'W-Motion',   emoji: '〰️', description: 'Trace a W shape with the tool',          prop: 'Pour-Over Kettle' },
};

/* ── Level Definitions ─────────────────────────────────── */

export interface LevelStep {
  motion: MotionType;
  label: string;
  duration: number; // seconds allowed
  description: string;
}

export interface GameLevel {
  id: number;
  name: string;
  description: string;
  steps: LevelStep[];
  passingScore: number; // 0–100
}

/** Pre-built levels for Play mode */
export const LEVELS: GameLevel[] = [
  {
    id: 1,
    name: 'First Sip',
    description: 'A simple 3-step recipe — learn the ropes.',
    passingScore: 50,
    steps: [
      { motion: 'left_right', label: 'Stir the pot',      duration: 8, description: 'Sway left and right to stir' },
      { motion: 'scoop',      label: 'Scoop the tea',     duration: 8, description: 'Scoop upward gently' },
      { motion: 'press_down', label: 'Press the plunger', duration: 8, description: 'Press down firmly' },
    ],
  },
  {
    id: 2,
    name: 'Tea Time',
    description: 'A 5-step recipe — things are heating up.',
    passingScore: 60,
    steps: [
      { motion: 'circle',     label: 'Whisk matcha',        duration: 7, description: 'Circular whisking motion' },
      { motion: 'up_down',    label: 'Dip tea bag',         duration: 7, description: 'Rhythmic dipping' },
      { motion: 'left_right', label: 'Stir in sugar',       duration: 6, description: 'Side to side stirring' },
      { motion: 'scoop',      label: 'Scoop foam',          duration: 6, description: 'Gentle scooping arc' },
      { motion: 'press_down', label: 'Press French press',  duration: 6, description: 'Push down steadily' },
    ],
  },
  {
    id: 3,
    name: 'Master Brew',
    description: 'The full 7-step routine — precision counts!',
    passingScore: 70,
    steps: [
      { motion: 'scoop',      label: 'Scoop grounds',    duration: 5, description: 'Quick scoop' },
      { motion: 'circle',     label: 'Bloom the grounds', duration: 5, description: 'Circular pour' },
      { motion: 'w_motion',   label: 'W-pattern pour',   duration: 5, description: 'Trace a W shape' },
      { motion: 'up_down',    label: 'Agitate',          duration: 5, description: 'Up and down motion' },
      { motion: 'squeeze',    label: 'Squeeze filter',   duration: 5, description: 'Squeeze firmly' },
      { motion: 'press_down', label: 'Final press',      duration: 5, description: 'Press down hard' },
      { motion: 'left_right', label: 'Final stir',       duration: 4, description: 'Quick side stir' },
    ],
  },
];

/* ── WebSocket Messages ────────────────────────────────── */

/** Message from the Python WebSocket backend */
export interface MotionDetectionMessage {
  motion: MotionType;
  detected: boolean;
  confidence: number;
}

/* ── Choreograph Mode ──────────────────────────────────── */

export interface RecordedStep {
  motion: MotionType;
  timestamp: number;    // ms since recording start
  confidence: number;
}

export interface SavedChoreography {
  id: string;
  name: string;
  createdAt: number;
  steps: RecordedStep[];
}

/* ── Page Router ───────────────────────────────────────── */

export type PageId =
  | 'main-menu'
  | 'level-select'
  | 'play'
  | 'tutorial'
  | 'tutorial-detail'
  | 'choreograph';
