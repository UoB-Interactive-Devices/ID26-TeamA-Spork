/**
 * Level definitions for the Spork Motion Game.
 * 
 * Level 1: Simple — single motions with generous time
 * Level 2: Intermediate — sequences of 2-3 motions
 * Level 3: Advanced — longer sequences, tighter timing
 * Creative: Record and replay your own sequence
 */
import type { GameLevel, MotionType } from './types';

export const MOTION_LABELS: Record<MotionType, { label: string; emoji: string; description: string }> = {
  circle:     { label: 'Circle',     emoji: '🔄', description: 'Move in a circular stirring motion' },
  left_right: { label: 'Left-Right', emoji: '↔️', description: 'Sway the tool side to side' },
  press_down: { label: 'Press Down', emoji: '⬇️', description: 'Press the tool firmly downward' },
  scoop:      { label: 'Scoop',      emoji: '🥄', description: 'Scoop upward in a smooth arc' },
  squeeze:    { label: 'Squeeze',    emoji: '✊', description: 'Squeeze the tool firmly' },
  up_down:    { label: 'Up-Down',    emoji: '↕️', description: 'Dip the tool up and down rhythmically' },
  w_motion:   { label: 'W-Motion',   emoji: '〰️', description: 'Trace a W shape with the tool' },
};

export const LEVELS: GameLevel[] = [
  {
    id: 1,
    name: 'Tutorial',
    description: 'Learn the basics — perform each motion one at a time.',
    passingScore: 50,
    steps: [
      { motion: 'left_right', label: 'Stir the pot', duration: 8, description: 'Sway left and right to stir' },
      { motion: 'scoop',      label: 'Scoop the tea', duration: 8, description: 'Scoop upward gently' },
      { motion: 'press_down', label: 'Press the plunger', duration: 8, description: 'Press down firmly' },
    ],
  },
  {
    id: 2,
    name: 'Play',
    description: 'Chain multiple motions together — the drink is getting complex!',
    passingScore: 60,
    steps: [
      { motion: 'circle',     label: 'Whisk matcha',     duration: 7, description: 'Circular whisking motion' },
      { motion: 'up_down',    label: 'Dip tea bag',      duration: 7, description: 'Rhythmic dipping' },
      { motion: 'left_right', label: 'Stir in sugar',    duration: 6, description: 'Side to side stirring' },
      { motion: 'scoop',      label: 'Scoop foam',       duration: 6, description: 'Gentle scooping arc' },
      { motion: 'press_down', label: 'Press French press', duration: 6, description: 'Push down steadily' },
    ],
  },
  {
    id: 3,
    name: 'Master Brewer',
    description: 'The full routine — tight timing, precise motions!',
    passingScore: 70,
    steps: [
      { motion: 'scoop',      label: 'Scoop grounds',  duration: 5, description: 'Quick scoop' },
      { motion: 'circle',     label: 'Bloom the grounds', duration: 5, description: 'Circular pour' },
      { motion: 'w_motion',   label: 'W-pattern pour', duration: 5, description: 'Trace a W shape' },
      { motion: 'up_down',    label: 'Agitate',        duration: 5, description: 'Up and down motion' },
      { motion: 'squeeze',    label: 'Squeeze filter',  duration: 5, description: 'Squeeze firmly' },
      { motion: 'press_down', label: 'Final press',     duration: 5, description: 'Press down hard' },
      { motion: 'left_right', label: 'Final stir',      duration: 4, description: 'Quick side stir' },
    ],
  },
];
