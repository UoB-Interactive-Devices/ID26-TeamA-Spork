/**
 * Shared type definitions for the Motion Brewing Game.
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
  | 'w_motion'
  | 'pour';

export const ALL_MOTIONS: MotionType[] = [
  'circle', 'left_right', 'press_down', 'scoop', 'squeeze', 'up_down', 'w_motion', 'pour'
];

/** Human-friendly labels for each motion */
export const MOTION_META: Record<MotionType, { label: string; asset: string; description: string; prop: string }> = {
  circle:     { label: 'Circle',     asset: '../assets/front_grinder.PNG', description: 'Move in a circular motion to grind the coffee beans',     prop: 'Coffee Grinder' },
  left_right: { label: 'Left-Right', asset: '../assets/front_sieve.PNG',  description: 'Sway the tool side to side',             prop: 'Sieve' },
  press_down: { label: 'Press Down', asset: '../assets/front_press.PNG',  description: 'Press the tool firmly downward',         prop: 'French Press' },
  scoop:      { label: 'Scoop',      asset: '../assets/front_spoon.PNG', description: 'Scoop upward in a smooth arc',           prop: 'Spoon' },
  squeeze:    { label: 'Squeeze',    asset: '../assets/front_tongs.PNG', description: 'Squeeze to get some ice cubes',                prop: 'Tongs' },
  up_down:    { label: 'Up-Down',    asset: '../assets/front_teabag.PNG',  description: 'Dip the tool up and down rhythmically',  prop: 'Teabag' },
  pour:       { label: 'Pour',       asset: '/assets/front_pour.PNG', description: 'Pour to get some water/milk to your drink',          prop: 'Pour' },
  w_motion:   { label: 'W-Motion',   asset: '/assets/front_whisk.PNG', description: 'Whisk to get a smooth texture',          prop: 'Whisk' },
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
