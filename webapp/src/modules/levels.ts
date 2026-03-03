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
  // Primary motions (multi-recording profiles)
  coffee_grinder: { label: 'Grind',      emoji: '⚙️',  description: 'Rotate the grinder handle in circles' },
  pour:           { label: 'Pour',       emoji: '🫗',  description: 'Tilt and pour steadily' },
  press_down:     { label: 'Press Down', emoji: '⬇️',  description: 'Press the tool firmly downward' },
  scoop:          { label: 'Scoop',      emoji: '🥄',  description: 'Scoop upward in a smooth arc' },
  sieve:          { label: 'Sieve',      emoji: '🪣',  description: 'Shake side to side to sieve' },
  squeeze:        { label: 'Squeeze',    emoji: '✊',  description: 'Squeeze the tool firmly' },
  stir:           { label: 'Stir',       emoji: '🥄',  description: 'Stir in quick circular motions' },
  tea_bag:        { label: 'Tea Bag',    emoji: '🍵',  description: 'Dip the tea bag up and down' },
  whisk:          { label: 'Whisk',      emoji: '🥚',  description: 'Whisk rapidly back and forth' },
  // Legacy motions
  circle:         { label: 'Circle',     emoji: '🔄',  description: 'Move in a circular stirring motion' },
  left_right:     { label: 'Left-Right', emoji: '↔️',  description: 'Sway the tool side to side' },
  up_down:        { label: 'Up-Down',    emoji: '↕️',  description: 'Dip the tool up and down rhythmically' },
  w_motion:       { label: 'W-Motion',   emoji: '〰️', description: 'Trace a W shape with the tool' },
};

export const LEVELS: GameLevel[] = [
  {
    id: 1,
    name: 'Tea Time',
    description: 'Learn the basics — make a simple cup of tea.',
    passingScore: 50,
    steps: [
      { motion: 'scoop',      label: 'Scoop tea leaves',   duration: 8, description: 'Scoop the leaves into the cup' },
      { motion: 'pour',       label: 'Pour hot water',      duration: 8, description: 'Pour water over the leaves' },
      { motion: 'tea_bag',    label: 'Dip the tea bag',     duration: 8, description: 'Dip up and down gently' },
      { motion: 'stir',       label: 'Stir it up',          duration: 8, description: 'Stir in a quick circle' },
    ],
  },
  {
    id: 2,
    name: 'Barista Basics',
    description: 'Chain motions together — make a proper coffee!',
    passingScore: 60,
    steps: [
      { motion: 'coffee_grinder', label: 'Grind the beans',   duration: 7, description: 'Grind coffee beans' },
      { motion: 'scoop',           label: 'Scoop grounds',     duration: 7, description: 'Scoop into the filter' },
      { motion: 'pour',            label: 'Pour water',        duration: 6, description: 'Pour hot water over grounds' },
      { motion: 'stir',            label: 'Stir gently',       duration: 6, description: 'Stir to bloom' },
      { motion: 'press_down',      label: 'Press the plunger', duration: 6, description: 'Push down steadily' },
    ],
  },
  {
    id: 3,
    name: 'Master Brewer',
    description: 'The full routine — tight timing, precise motions!',
    passingScore: 70,
    steps: [
      { motion: 'coffee_grinder', label: 'Grind beans',      duration: 5, description: 'Grind fresh beans' },
      { motion: 'sieve',          label: 'Sieve the grounds', duration: 5, description: 'Sieve out coarse bits' },
      { motion: 'scoop',          label: 'Scoop into filter', duration: 5, description: 'Precise scoop' },
      { motion: 'pour',           label: 'Pour over',         duration: 5, description: 'Steady pour' },
      { motion: 'whisk',          label: 'Whisk the milk',    duration: 5, description: 'Froth the milk' },
      { motion: 'squeeze',        label: 'Squeeze the bag',   duration: 5, description: 'Squeeze out the last drops' },
      { motion: 'stir',           label: 'Final stir',        duration: 4, description: 'Quick finishing stir' },
    ],
  },
];
