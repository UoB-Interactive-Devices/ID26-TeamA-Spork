/**
 * Level definitions for the Game.
 * 
 * Level 1: Simple — single motions with generous time
 * Level 2: Intermediate — sequences of 2-3 motions
 * Level 3: Advanced — longer sequences, tighter timing
 * Creative: Record and replay your own sequence
 */
import type { GameLevel, MotionType } from './types';

export const MOTION_LABELS: Record<MotionType, { label: string; asset: string; description: string }> = {
  pour:           { label: 'Pour',       asset: '/assets/front_milk.PNG', description: 'Tilt and pour steadily' },
  press_down:     { label: 'Press Down', asset: '/assets/front_press.PNG', description: 'Press the tool firmly downward' },
  scoop:          { label: 'Scoop',      asset: '/assets/front_tea.PNG', description: 'Scoop upward in a smooth arc' },
  squeeze:        { label: 'Squeeze',    asset: '/assets/front_milk.PNG', description: 'Squeeze the tool firmly' },
  stir:           { label: 'Stir',       asset: '/assets/front_tea.PNG', description: 'Stir in quick circular motions' },
  whisk:          { label: 'Whisk',      asset: '/assets/front_whisk.PNG', description: 'Whisk rapidly back and forth' },
  grinding:       { label: 'Grinding',   asset: '/assets/front_grinder.PNG', description: 'Rotate the grinder handle in circles' },
  left_right:     { label: 'Left-Right', asset: '/assets/front_sieve.PNG', description: 'Sway the tool side to side' },
  up_down:        { label: 'Up-Down',    asset: '/assets/front_tea.PNG', description: 'Dip the tool up and down rhythmically' },
};

export const LEVELS: GameLevel[] = [
  {
    id: 1,
    name: 'Tea Time',
    description: 'A simple recipe — make a cup of tea.',
    passingScore: 50,
    steps: [
      { motion: 'scoop',      label: 'Scoop tea leaves',   duration: 8, description: 'Scoop the leaves into the cup' },
      { motion: 'pour',       label: 'Pour hot water',      duration: 8, description: 'Pour water over the leaves' },
      { motion: 'stir',       label: 'Stir it up',          duration: 8, description: 'Stir in a quick circle' },
    ],
  },
  {
    id: 2,
    name: 'Barista Basics',
    description: 'A 5-step recipe — things are heating up.',
    passingScore: 60,
    steps: [
      { motion: 'grinding',        label: 'Grind the beans',   duration: 7, description: 'Grind coffee beans' },
      { motion: 'scoop',           label: 'Scoop grounds',     duration: 7, description: 'Scoop into the filter' },
      { motion: 'pour',            label: 'Pour water',        duration: 6, description: 'Pour hot water over grounds' },
      { motion: 'stir',            label: 'Stir gently',       duration: 6, description: 'Stir to bloom' },
      { motion: 'press_down',      label: 'Press the plunger', duration: 6, description: 'Push down steadily' },
    ],
  },
  {
    id: 3,
    name: 'Master Brew',
    description: 'The full 7-step routine — precision counts!',
    passingScore: 70,
    steps: [
      { motion: 'grinding',       label: 'Grind beans',      duration: 5, description: 'Grind fresh beans' },
      { motion: 'scoop',          label: 'Scoop into filter', duration: 5, description: 'Precise scoop' },
      { motion: 'pour',           label: 'Pour over',         duration: 5, description: 'Steady pour' },
      { motion: 'whisk',          label: 'Whisk the milk',    duration: 5, description: 'Froth the milk' },
      { motion: 'squeeze',        label: 'Squeeze the bag',   duration: 5, description: 'Squeeze out the last drops' },
      { motion: 'stir',           label: 'Final stir',        duration: 4, description: 'Quick finishing stir' },
      { motion: 'scoop',          label: 'Scoop into filter', duration: 5, description: 'Precise scoop' },
    ],
  },
];
