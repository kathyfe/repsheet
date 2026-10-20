// Pure helpers: increments, plates, estimated maxes, progression, PR session plans.

export const BAR = 20;
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

const r2 = (v) => Math.round(v * 100) / 100;

export function range(a, b, step) {
  const out = [];
  for (let v = a; v <= b + 1e-9; v = r2(v + step)) out.push(r2(v));
  return out;
}

export const DUMBBELLS = [...range(1, 10, 1), ...range(12, 50, 2)];

// How a weight can move for this exercise at this gym.
export function stepsFor(ex, gym) {
  switch (ex.equip) {
    case 'barbell': return { kind: 'step', step: 2.5, min: BAR };
    case 'dumbbell': return { kind: 'list', values: DUMBBELLS };
    case 'kettlebell': return { kind: 'list', values: gym.kettlebells };
    case 'machine': return { kind: 'list', values: gym.machines[ex.machine].values };
    default: return null;
  }
}

export function snap(v, steps, mode = 'nearest') {
  if (v == null || !steps) return v;
  if (steps.kind === 'step') {
    const f = mode === 'down' ? Math.floor : mode === 'up' ? Math.ceil : Math.round;
    return Math.max(steps.min, r2(f(r2(v / steps.step)) * steps.step));
  }
  const vals = steps.values;
  if (mode === 'down') { let out = vals[0]; for (const x of vals) if (x <= v + 1e-9) out = x; return out; }
  if (mode === 'up') { for (const x of vals) if (x >= v - 1e-9) return x; return vals[vals.length - 1]; }
  let best = vals[0];
  for (const x of vals) if (Math.abs(x - v) < Math.abs(best - v)) best = x;
  return best;
}

// One step up or down. With no value yet, start from the hint (or the lightest option).
export function nudge(v, dir, steps, hint) {
  if (!steps) return v;
  if (v == null) return snap(hint ?? (steps.kind === 'step' ? steps.min : steps.values[0]), steps);
  if (steps.kind === 'step') return Math.max(steps.min, r2(v + dir * steps.step));
  const vals = steps.values;
  const i = vals.findIndex((x) => Math.abs(x - v) < 1e-9);
  if (i < 0) return snap(v, steps, dir > 0 ? 'up' : 'down');
  return vals[Math.min(vals.length - 1, Math.max(0, i + dir))];
}

export function e1rm(kg, reps) {
  if (!kg || !reps) return 0;
  return reps <= 1 ? kg : Math.round(kg * (1 + reps / 30) * 10) / 10;
}

export function fromE1rm(e, reps) {
  return reps <= 1 ? e : e / (1 + reps / 30);
}

// Next session's working weight: up one step if every set hit the target reps.
export function nextTarget(last, reps, steps) {
  const work = (last || []).filter((s) => s.kg != null);
  if (!work.length) return null;
  const top = Math.max(...work.map((s) => s.kg));
  const hitAll = reps ? work.every((s) => (s.reps ?? 0) >= reps) : false;
  if (hitAll && steps) {
    const n = nudge(top, 1, steps);
    return { kg: n, bumped: n > top };
  }
  return { kg: top, bumped: false };
}

export function warmupRamp(workKg, steps, count) {
  const scheme = count >= 2 ? [[0.5, 5], [0.7, 3]] : [[0.6, 5]];
  return scheme.map(([p, reps]) => ({ kg: snap(workKg * p, steps, 'down'), reps }));
}

// PR session plan for one lift: warm-up ramp and three attempts.
export function testPlan(best, reps, steps) {
  const est = fromE1rm(best?.e1rm || 0, reps);
  const ramp = [[0.5, 5], [0.7, 3], [0.8, 2], [0.9, 1]].map(([p, r]) => ({ kg: snap(est * p, steps, 'down'), reps: r, done: false }));
  const attempts = [['Opener', 0.92], ['Second', 0.97], ['Third', 1.02]].map(([label, p]) => ({ label, kg: snap(est * p, steps), result: null }));
  for (let i = 1; i < attempts.length; i++) {
    if (attempts[i].kg <= attempts[i - 1].kg) attempts[i].kg = nudge(attempts[i - 1].kg, 1, steps);
  }
  return { est: Math.round(est * 10) / 10, prev: best?.repMax?.[reps] ?? null, ramp, attempts };
}

export function platesPerSide(kg, bar = BAR) {
  if (kg == null || kg <= bar) return [];
  let left = r2((kg - bar) / 2);
  const out = [];
  for (const p of PLATES) {
    while (left >= p - 1e-9) { out.push(p); left = r2(left - p); }
  }
  return left > 0.01 ? null : out;
}

export function fmtKg(v) {
  if (v == null || Number.isNaN(v)) return '–';
  return String(r2(v));
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtRest(sec) {
  if (sec < 60) return `${sec} s`;
  return sec % 60 ? fmtTime(sec) : `${sec / 60} min`;
}
