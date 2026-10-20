// Seed data for the prototype. Invented numbers, nothing real.
// Exercises, gyms and workouts are copied into the phone's storage on first run and can be edited there.

export const SEED_VERSION = 2;

export const BLOCK = { name: 'Block 1', week: 2, weeks: 6 };

export const GROUPS = ['Quads', 'Hamstrings', 'Glutes', 'Back', 'Chest', 'Shoulders', 'Arms', 'Core', 'Full body', 'Conditioning', 'Mobility', 'Other'];

export const EQUIP = {
  barbell: 'Barbell', dumbbell: 'Dumbbells', kettlebell: 'Kettlebell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight', other: 'Other weight',
};

export const TRACKS = {
  kgReps: 'Weight and reps', reps: 'Reps only', time: 'Time', kgDistance: 'Weight and distance', distance: 'Distance', calories: 'Calories',
};

// track: kgReps | reps | time | kgDistance | distance | calories
export const EXERCISES = {
  squat: { name: 'Back squat', group: 'Quads', equip: 'barbell', track: 'kgReps', alts: ['frontSquat', 'gobletSquat'] },
  frontSquat: { name: 'Front squat', group: 'Quads', equip: 'barbell', track: 'kgReps', alts: ['squat', 'gobletSquat'] },
  gobletSquat: { name: 'Goblet squat', group: 'Quads', equip: 'kettlebell', track: 'kgReps' },
  splitSquat: { name: 'Bulgarian split squat', group: 'Quads', equip: 'dumbbell', track: 'kgReps', perSide: true },
  revLunge: { name: 'Reverse lunge', group: 'Quads', equip: 'dumbbell', track: 'kgReps', perSide: true, alts: ['splitSquat', 'stepUp'] },
  stepUp: { name: 'Step-up', group: 'Quads', equip: 'dumbbell', track: 'kgReps', perSide: true },
  legPress: { name: 'Leg press', group: 'Quads', equip: 'machine', track: 'kgReps' },
  legExt: { name: 'Leg extension', group: 'Quads', equip: 'machine', track: 'kgReps' },
  cossack: { name: 'Cossack squat', group: 'Quads', equip: 'bodyweight', track: 'reps', perSide: true },
  rdl: { name: 'Romanian deadlift', group: 'Hamstrings', equip: 'barbell', track: 'kgReps', alts: ['dbRdl', 'slRdl'] },
  dbRdl: { name: 'Dumbbell Romanian deadlift', group: 'Hamstrings', equip: 'dumbbell', track: 'kgReps' },
  slRdl: { name: 'Single-leg RDL', group: 'Hamstrings', equip: 'dumbbell', track: 'kgReps', perSide: true },
  legCurl: { name: 'Leg curl', group: 'Hamstrings', equip: 'machine', track: 'kgReps' },
  nordic: { name: 'Nordic curl', group: 'Hamstrings', equip: 'bodyweight', track: 'reps' },
  hipThrust: { name: 'Hip thrust', group: 'Glutes', equip: 'barbell', track: 'kgReps' },
  abduction: { name: 'Hip abduction', group: 'Glutes', equip: 'machine', track: 'kgReps', alts: ['bandWalk'] },
  bandWalk: { name: 'Banded lateral walk', group: 'Glutes', equip: 'bodyweight', track: 'reps', perSide: true },
  backExt: { name: 'Back extension', group: 'Glutes', equip: 'other', track: 'kgReps' },
  kickback: { name: 'Cable kickback', group: 'Glutes', equip: 'cable', track: 'kgReps', perSide: true },
  latPull: { name: 'Lat pulldown', group: 'Back', equip: 'machine', track: 'kgReps', alts: ['pullNeg'] },
  cableRow: { name: 'Seated cable row', group: 'Back', equip: 'cable', track: 'kgReps', alts: ['dbRow'] },
  dbRow: { name: 'One-arm dumbbell row', group: 'Back', equip: 'dumbbell', track: 'kgReps', perSide: true },
  bbRow: { name: 'Barbell row', group: 'Back', equip: 'barbell', track: 'kgReps' },
  pullUp: { name: 'Pull-up', group: 'Back', equip: 'bodyweight', track: 'reps' },
  pullNeg: { name: 'Pull-up negative', group: 'Back', equip: 'bodyweight', track: 'reps' },
  facePull: { name: 'Face pull', group: 'Back', equip: 'cable', track: 'kgReps' },
  bench: { name: 'Bench press', group: 'Chest', equip: 'barbell', track: 'kgReps', alts: ['dbBench'] },
  dbBench: { name: 'Dumbbell bench press', group: 'Chest', equip: 'dumbbell', track: 'kgReps' },
  inclineDb: { name: 'Incline dumbbell press', group: 'Chest', equip: 'dumbbell', track: 'kgReps' },
  pushUp: { name: 'Push-up', group: 'Chest', equip: 'bodyweight', track: 'reps' },
  ohp: { name: 'Overhead press', group: 'Shoulders', equip: 'barbell', track: 'kgReps', alts: ['dbPress'] },
  dbPress: { name: 'Half-kneeling dumbbell press', group: 'Shoulders', equip: 'dumbbell', track: 'kgReps', perSide: true },
  latRaise: { name: 'Lateral raise', group: 'Shoulders', equip: 'dumbbell', track: 'kgReps' },
  rearFly: { name: 'Rear delt fly', group: 'Shoulders', equip: 'machine', track: 'kgReps' },
  curl: { name: 'Biceps curl', group: 'Arms', equip: 'dumbbell', track: 'kgReps' },
  pushdown: { name: 'Triceps pushdown', group: 'Arms', equip: 'cable', track: 'kgReps' },
  plank: { name: 'Plank', group: 'Core', equip: 'bodyweight', track: 'time' },
  sidePlank: { name: 'Side plank', group: 'Core', equip: 'bodyweight', track: 'time', perSide: true },
  copenhagen: { name: 'Copenhagen plank', group: 'Core', equip: 'bodyweight', track: 'time', perSide: true, alts: ['sidePlank'] },
  deadBug: { name: 'Dead bug', group: 'Core', equip: 'bodyweight', track: 'reps' },
  pallof: { name: 'Pallof press', group: 'Core', equip: 'cable', track: 'kgReps', perSide: true },
  suitcase: { name: 'Suitcase carry', group: 'Full body', equip: 'kettlebell', track: 'kgDistance', perSide: true, alts: ['farmer'] },
  farmer: { name: 'Farmer carry', group: 'Full body', equip: 'kettlebell', track: 'kgDistance' },
  kbSwing: { name: 'Kettlebell swing', group: 'Full body', equip: 'kettlebell', track: 'kgReps' },
  wallBall: { name: 'Wall ball', group: 'Conditioning', equip: 'other', track: 'kgReps' },
  rowErg: { name: 'Row erg', group: 'Conditioning', equip: 'bodyweight', track: 'distance' },
  bike: { name: 'Air bike', group: 'Conditioning', equip: 'bodyweight', track: 'calories' },
  hip9090: { name: '90/90 hip switch', group: 'Mobility', equip: 'bodyweight', track: 'reps' },
  wgs: { name: "World's greatest stretch", group: 'Mobility', equip: 'bodyweight', track: 'reps', perSide: true },
  couch: { name: 'Couch stretch', group: 'Mobility', equip: 'bodyweight', track: 'time', perSide: true },
};

// Stacks are written as ranges (from-to/step) or lists, e.g. "5-100/5" or "6.5, 12.5, 38.3".
export const GYMS = [
  {
    id: 'city', name: 'City gym', plate: 1.25, dumbbells: '1-10/1, 12-50/2', kettlebells: '8, 12, 16, 20, 24, 28, 32',
    stations: [
      { id: 'c1', name: 'Lever hip abduction', stack: '5-100/5' },
      { id: 'c2', name: 'Seated cable row', stack: '4.5-54/4.5' },
      { id: 'c3', name: 'Lat pulldown', stack: '6.5, 12.5, 18.5, 25, 31.5, 38.3, 44.5, 50.5, 57, 63.5' },
      { id: 'c4', name: 'Cable column', stack: '2.5-50/2.5' },
    ],
    use: { abduction: 'c1', cableRow: 'c2', latPull: 'c3', pushdown: 'c4', facePull: 'c4', kickback: 'c4', pallof: 'c4' },
  },
  {
    id: 'box', name: 'Box gym', plate: 1.25, dumbbells: '1-10/1, 12-40/2', kettlebells: '8, 12, 16, 20, 24',
    stations: [
      { id: 'b1', name: 'Plate-loaded abduction', stack: '10-80/2.5' },
      { id: 'b2', name: 'Dual cable column', stack: '2.5-50/2.5' },
      { id: 'b3', name: 'Lat pulldown', stack: '7-84/7' },
    ],
    use: { abduction: 'b1', cableRow: 'b2', latPull: 'b3', pushdown: 'b2' },
  },
];

// Block types: straight | superset | rounds | emom | amrap | fortime
export const WORKOUTS = {
  legsA: {
    name: 'Legs A', focus: 'Strength',
    blocks: [
      { type: 'straight', items: [{ ex: 'squat', sets: 4, reps: 5, tempo: '3-1-1-0', rest: 180, warmups: 2 }] },
      { type: 'superset', rounds: 3, rest: 90, items: [{ ex: 'rdl', reps: 8 }, { ex: 'revLunge', reps: 10 }] },
      { type: 'straight', items: [{ ex: 'abduction', sets: 3, reps: 15, rest: 60, dropLast: true }] },
      { type: 'emom', minutes: 8, items: [{ text: '12 kettlebell swings', detail: '20 kg' }, { text: 'Farmer carry, 40 m', detail: '2 × 20 kg' }] },
    ],
  },
  upper: {
    name: 'Upper', focus: 'Strength',
    blocks: [
      { type: 'straight', items: [{ ex: 'bench', sets: 4, reps: 6, rest: 150, warmups: 1 }] },
      { type: 'superset', rounds: 3, rest: 90, items: [{ ex: 'cableRow', reps: 10 }, { ex: 'dbPress', reps: 8 }] },
      { type: 'straight', items: [{ ex: 'latPull', sets: 3, reps: 10, rest: 75 }] },
      { type: 'rounds', rounds: 3, rest: 60, items: [{ text: '5 pull-up negatives' }, { text: '20 dead bugs' }, { text: 'Side plank', detail: '30 s each side' }] },
    ],
  },
  hybrid: {
    name: 'Hybrid', focus: 'Strength and conditioning',
    blocks: [
      { type: 'straight', items: [{ ex: 'frontSquat', sets: 3, reps: 6, rest: 120, warmups: 1 }] },
      { type: 'amrap', minutes: 12, items: [{ text: '10 goblet squats', detail: '16 kg' }, { text: '8 push-ups' }, { text: '12 kettlebell swings', detail: '20 kg' }, { text: '200 m row' }] },
      { type: 'fortime', rounds: 4, cap: 14, items: [{ text: '10 step-ups each leg', detail: '2 × 10 kg' }, { text: '10 wall balls', detail: '6 kg' }, { text: '15 cal bike' }] },
    ],
  },
  legsB: {
    name: 'Legs B', focus: 'Mobility and functional',
    blocks: [
      { type: 'rounds', rounds: 2, rest: 30, items: [{ text: '90/90 hip switches', detail: '10' }, { text: 'Cossack squats', detail: '8 each side' }, { text: "World's greatest stretch", detail: '5 each side' }, { text: 'Couch stretch', detail: '60 s each side' }] },
      { type: 'superset', rounds: 3, rest: 60, items: [{ ex: 'slRdl', reps: 8 }, { ex: 'copenhagen', time: 20 }] },
      { type: 'straight', items: [{ ex: 'suitcase', sets: 3, distance: 40, rest: 60 }] },
    ],
  },
};

export const ORDER = ['legsA', 'upper', 'hybrid', 'legsB'];

// Last session's working sets (sample). Machines and cables are keyed per gym.
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

// Current bests (sample). Machines and cables are keyed per gym.
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
