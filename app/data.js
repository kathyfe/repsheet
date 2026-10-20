// Sample data for the prototype. Invented numbers, nothing real.
import { range } from './logic.js';

export const BLOCK = { name: 'Block 1', week: 2, weeks: 6 };

export const GYMS = [
  {
    id: 'city',
    name: 'City gym',
    kettlebells: [8, 12, 16, 20, 24, 28, 32],
    machines: {
      abduction: { name: 'Lever hip abduction', values: range(5, 100, 5) },
      cableRow: { name: 'Seated cable row', values: [4.5, 9, 13.5, 18, 22.5, 27, 31.5, 36, 40.5, 45, 49.5, 54] },
      latPull: { name: 'Lat pulldown', values: [6.5, 12.5, 18.5, 25, 31.5, 38.3, 44.5, 50.5, 57, 63.5] },
    },
  },
  {
    id: 'box',
    name: 'Box gym',
    kettlebells: [8, 12, 16, 20, 24],
    machines: {
      abduction: { name: 'Plate-loaded abduction', values: range(10, 80, 2.5) },
      cableRow: { name: 'Dual cable column', values: range(2.5, 50, 2.5) },
      latPull: { name: 'Lat pulldown', values: range(7, 84, 7) },
    },
  },
];

// track: kgReps | reps | time | kgDistance
// equip: barbell | dumbbell | kettlebell | machine | bodyweight
export const EXERCISES = {
  squat: { name: 'Back squat', equip: 'barbell', track: 'kgReps', alts: ['frontSquat', 'gobletSquat'] },
  frontSquat: { name: 'Front squat', equip: 'barbell', track: 'kgReps', alts: ['squat', 'gobletSquat'] },
  gobletSquat: { name: 'Goblet squat', equip: 'kettlebell', track: 'kgReps', alts: ['frontSquat'] },
  rdl: { name: 'Romanian deadlift', equip: 'barbell', track: 'kgReps', alts: ['dbRdl', 'slRdl'] },
  dbRdl: { name: 'Dumbbell Romanian deadlift', equip: 'dumbbell', track: 'kgReps', alts: ['rdl'] },
  slRdl: { name: 'Single-leg RDL', equip: 'dumbbell', track: 'kgReps', perSide: true, alts: ['dbRdl'] },
  revLunge: { name: 'Reverse lunge', equip: 'dumbbell', track: 'kgReps', perSide: true, alts: ['splitSquat', 'stepUp'] },
  splitSquat: { name: 'Bulgarian split squat', equip: 'dumbbell', track: 'kgReps', perSide: true, alts: ['revLunge'] },
  stepUp: { name: 'Step-up', equip: 'dumbbell', track: 'kgReps', perSide: true, alts: ['revLunge'] },
  abduction: { name: 'Hip abduction', equip: 'machine', machine: 'abduction', track: 'kgReps', alts: ['bandWalk'] },
  bandWalk: { name: 'Banded lateral walk', equip: 'bodyweight', track: 'reps', perSide: true, alts: ['abduction'] },
  bench: { name: 'Bench press', equip: 'barbell', track: 'kgReps', alts: ['dbBench'] },
  dbBench: { name: 'Dumbbell bench press', equip: 'dumbbell', track: 'kgReps', alts: ['bench'] },
  ohp: { name: 'Overhead press', equip: 'barbell', track: 'kgReps', alts: ['dbPress'] },
  dbPress: { name: 'Half-kneeling dumbbell press', equip: 'dumbbell', track: 'kgReps', perSide: true, alts: ['ohp'] },
  cableRow: { name: 'Seated cable row', equip: 'machine', machine: 'cableRow', track: 'kgReps', alts: ['dbRow'] },
  dbRow: { name: 'One-arm dumbbell row', equip: 'dumbbell', track: 'kgReps', perSide: true, alts: ['cableRow'] },
  latPull: { name: 'Lat pulldown', equip: 'machine', machine: 'latPull', track: 'kgReps', alts: ['pullNeg'] },
  pullNeg: { name: 'Pull-up negative', equip: 'bodyweight', track: 'reps', alts: ['latPull'] },
  copenhagen: { name: 'Copenhagen plank', equip: 'bodyweight', track: 'time', perSide: true, alts: ['sidePlank'] },
  sidePlank: { name: 'Side plank', equip: 'bodyweight', track: 'time', perSide: true, alts: ['copenhagen'] },
  suitcase: { name: 'Suitcase carry', equip: 'kettlebell', track: 'kgDistance', perSide: true, alts: ['farmer'] },
  farmer: { name: 'Farmer carry', equip: 'kettlebell', track: 'kgDistance', alts: ['suitcase'] },
};

// Block types: straight | superset | rounds | emom | amrap | fortime
export const WORKOUTS = {
  legsA: {
    name: 'Legs A', focus: 'Strength', minutes: 60,
    blocks: [
      { type: 'straight', items: [{ ex: 'squat', sets: 4, reps: 5, tempo: '3-1-1-0', rest: 180, warmups: 2 }] },
      { type: 'superset', rounds: 3, rest: 90, items: [{ ex: 'rdl', reps: 8 }, { ex: 'revLunge', reps: 10 }] },
      { type: 'straight', items: [{ ex: 'abduction', sets: 3, reps: 15, rest: 60, dropLast: true }] },
      { type: 'emom', minutes: 8, items: [{ text: '12 kettlebell swings', detail: '20 kg' }, { text: 'Farmer carry, 40 m', detail: '2 × 20 kg' }] },
    ],
  },
  upper: {
    name: 'Upper', focus: 'Strength', minutes: 55,
    blocks: [
      { type: 'straight', items: [{ ex: 'bench', sets: 4, reps: 6, rest: 150, warmups: 1 }] },
      { type: 'superset', rounds: 3, rest: 90, items: [{ ex: 'cableRow', reps: 10 }, { ex: 'dbPress', reps: 8 }] },
      { type: 'straight', items: [{ ex: 'latPull', sets: 3, reps: 10, rest: 75 }] },
      { type: 'rounds', rounds: 3, rest: 60, items: [{ text: '5 pull-up negatives' }, { text: '20 dead bugs' }, { text: 'Side plank', detail: '30 s each side' }] },
    ],
  },
  hybrid: {
    name: 'Hybrid', focus: 'Strength and conditioning', minutes: 50,
    blocks: [
      { type: 'straight', items: [{ ex: 'frontSquat', sets: 3, reps: 6, rest: 120, warmups: 1 }] },
      { type: 'amrap', minutes: 12, items: [{ text: '10 goblet squats', detail: '16 kg' }, { text: '8 push-ups' }, { text: '12 kettlebell swings', detail: '20 kg' }, { text: '200 m row' }] },
      { type: 'fortime', rounds: 4, cap: 14, items: [{ text: '10 step-ups each leg', detail: '2 × 10 kg' }, { text: '10 wall balls', detail: '6 kg' }, { text: '15 cal bike' }] },
    ],
  },
  legsB: {
    name: 'Legs B', focus: 'Mobility and functional', minutes: 45,
    blocks: [
      { type: 'rounds', rounds: 2, rest: 30, items: [{ text: '90/90 hip switches', detail: '10' }, { text: 'Cossack squats', detail: '8 each side' }, { text: "World's greatest stretch", detail: '5 each side' }, { text: 'Couch stretch', detail: '60 s each side' }] },
      { type: 'superset', rounds: 3, rest: 60, items: [{ ex: 'slRdl', reps: 8 }, { ex: 'copenhagen', time: 20 }] },
      { type: 'straight', items: [{ ex: 'suitcase', sets: 3, distance: 40, rest: 60 }] },
    ],
  },
};

export const ROTATION = ['legsA', 'upper', 'hybrid', 'legsB'];

// Last session's working sets. Machines are keyed per gym.
export const LAST = {
  squat: [{ kg: 80, reps: 5 }, { kg: 80, reps: 5 }, { kg: 80, reps: 5 }, { kg: 80, reps: 5 }],
  rdl: [{ kg: 60, reps: 8 }, { kg: 60, reps: 8 }, { kg: 60, reps: 8 }],
  revLunge: [{ kg: 12, reps: 10 }, { kg: 12, reps: 10 }, { kg: 12, reps: 9 }],
  'abduction@city': [{ kg: 45, reps: 15 }, { kg: 45, reps: 15 }, { kg: 45, reps: 12 }],
  bench: [{ kg: 42.5, reps: 6 }, { kg: 42.5, reps: 6 }, { kg: 42.5, reps: 5 }, { kg: 42.5, reps: 5 }],
  'cableRow@city': [{ kg: 36, reps: 10 }, { kg: 36, reps: 10 }, { kg: 36, reps: 10 }],
  dbPress: [{ kg: 10, reps: 8 }, { kg: 10, reps: 8 }, { kg: 10, reps: 7 }],
  'latPull@city': [{ kg: 38.3, reps: 10 }, { kg: 38.3, reps: 9 }, { kg: 38.3, reps: 8 }],
  frontSquat: [{ kg: 50, reps: 6 }, { kg: 50, reps: 6 }, { kg: 50, reps: 6 }],
  slRdl: [{ kg: 12, reps: 8 }, { kg: 12, reps: 8 }, { kg: 12, reps: 8 }],
  copenhagen: [{ time: 20 }, { time: 20 }, { time: 15 }],
  suitcase: [{ kg: 20, dist: 40 }, { kg: 20, dist: 40 }, { kg: 20, dist: 40 }],
};

// Current bests. Machines are keyed per gym.
export const BEST = {
  squat: { e1rm: 93.3, heaviest: { kg: 87.5, reps: 1 }, repMax: { 1: 87.5, 3: 82.5, 5: 80, 8: 70, 10: 65 } },
  frontSquat: { e1rm: 60, heaviest: { kg: 55, reps: 3 }, repMax: { 3: 55, 5: 52.5, 8: 45 } },
  rdl: { e1rm: 76, heaviest: { kg: 65, reps: 5 }, repMax: { 5: 65, 8: 60, 10: 55 } },
  bench: { e1rm: 51, heaviest: { kg: 47.5, reps: 2 }, repMax: { 3: 45, 5: 42.5, 8: 40 } },
  ohp: { e1rm: 33, heaviest: { kg: 30, reps: 3 }, repMax: { 3: 30, 5: 27.5, 8: 25 } },
  revLunge: { e1rm: 16, heaviest: { kg: 12, reps: 10 }, repMax: { 10: 12 } },
  dbPress: { e1rm: 12.7, heaviest: { kg: 10, reps: 8 }, repMax: { 8: 10 } },
  slRdl: { e1rm: 15.2, heaviest: { kg: 12, reps: 8 }, repMax: { 8: 12 } },
  'abduction@city': { e1rm: 67.5, heaviest: { kg: 50, reps: 10 }, repMax: { 10: 50 } },
  'cableRow@city': { e1rm: 48, heaviest: { kg: 36, reps: 10 }, repMax: { 10: 36 } },
  'latPull@city': { e1rm: 51.1, heaviest: { kg: 38.3, reps: 10 }, repMax: { 10: 38.3 } },
  copenhagen: { time: 20 },
};

// Estimated 1RM over time, plus tested maxes from PR sessions.
const weeks = ['2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13'];
const series = (vals) => vals.map((e, i) => ({ d: weeks[i], e }));
export const SERIES = {
  squat: { points: series([85, 86.7, 88, 88, 89.3, 90.7, 92, 92, 93.3]), tested: [{ d: '2026-09-05', kg: 87.5, reps: 1 }] },
  frontSquat: { points: series([54, 55, 55, 56, 57, 57, 58, 59, 60]), tested: [] },
  rdl: { points: series([68, 69, 70, 70, 72, 73, 74, 76, 76]), tested: [] },
  bench: { points: series([46, 46.7, 47, 48, 48, 49, 50, 50, 51]), tested: [{ d: '2026-09-05', kg: 47.5, reps: 2 }] },
  ohp: { points: series([30, 30, 30.8, 31, 31.5, 32, 32, 33, 33]), tested: [] },
};

export const MAIN_LIFTS = ['squat', 'frontSquat', 'rdl', 'bench', 'ohp'];

// Sessions per week, oldest first. The last week is still running.
export const WEEKLY = { plan: 5, done: [4, 5, 3, 5, 4, 5, 4, 2] };
