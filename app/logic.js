// Pure helpers: increments, stacks, estimated maxes, progression, PR session plans, formatting.

export const BAR = 20;

const r2 = (v) => Math.round(v * 100) / 100;

export function range(a, b, step) {
  const out = [];
  if (!(step > 0)) return out;
  for (let v = a; v <= b + 1e-9 && out.length < 500; v = r2(v + step)) out.push(r2(v));
  return out;
}

// "5-100/5, 102.5" or "6.5 12.5 38.3" -> sorted list of weights. Dots for decimals.
export function parseValues(spec) {
  const out = [];
  for (const raw of String(spec || '').split(/[,;\n]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (m) { out.push(...range(Number(m[1]), Number(m[2]), Number(m[3]))); continue; }
    for (const part of t.split(/\s+/)) {
      const n = Number(part);
      if (Number.isFinite(n) && n >= 0) out.push(r2(n));
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function previewValues(vals) {
  if (!vals.length) return 'No weights yet';
  if (vals.length <= 7) return `${vals.join(', ')} kg`;
  return `${vals.length} weights from ${vals[0]} to ${vals[vals.length - 1]} kg`;
}

// How a weight can move for this exercise at this gym.
export function stepsFor(ex, gym, exId) {
  if (!ex || !gym) return null;
  switch (ex.equip) {
    case 'barbell': return { kind: 'step', step: r2((gym.plate || 1.25) * 2), min: BAR };
    case 'dumbbell': return { kind: 'list', values: parseValues(gym.dumbbells || '1-10/1, 12-50/2') };
    case 'kettlebell': return { kind: 'list', values: parseValues(gym.kettlebells || '8, 12, 16, 20, 24') };
    case 'machine':
    case 'cable': {
      const st = (gym.stations || []).find((s) => s.id === gym.use?.[exId]);
      const vals = st ? parseValues(st.stack) : [];
      return vals.length ? { kind: 'list', values: vals, station: st } : { kind: 'step', step: 2.5, min: 0, unset: true };
    }
    case 'other': return { kind: 'step', step: 1, min: 0 };
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
  const hitAll = reps ? work.every((s) => (s.reps ?? 0) + (s.extra ?? 0) >= reps) : false;
  if (hitAll && steps && !steps.unset) {
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

// Rough session length in minutes, rounded to 5.
export function estimateMinutes(blocks) {
  let sec = 0;
  for (const b of blocks || []) {
    if (b.type === 'straight') { const it = b.items[0]; sec += (it.sets || 3) * ((it.rest || 90) + 45) + (it.warmups || 0) * 75; }
    else if (b.type === 'superset') sec += (b.rounds || 3) * ((b.items.length * 45) + (b.rest || 90));
    else if (b.type === 'emom' || b.type === 'amrap') sec += (b.minutes || 10) * 60;
    else if (b.type === 'fortime') sec += (b.cap || 12) * 50;
    else if (b.type === 'rounds') sec += (b.rounds || 3) * ((b.items.length * 40) + (b.rest || 60));
  }
  return Math.max(5, Math.round(sec / 300) * 5);
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

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
}
