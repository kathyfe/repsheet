import {
  SEED_VERSION, BLOCK, GROUPS, EQUIP, TRACKS, EXERCISES, GYMS, WORKOUTS, ORDER, LAST, BEST, SERIES, MAIN_LIFTS, WEEKLY,
} from './data.js';
import * as L from './logic.js';

const VERSION = 'prototype 0.2';

// ---------- small helpers ----------
const $ = (sel) => document.querySelector(sel);
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const letter = (i) => 'ABCDEFGHIJKLMNOP'[i] || '?';
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };
const shortDate = (d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const uid = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const store = {
  get(k, d) { try { const v = localStorage.getItem(`repsheet.${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`repsheet.${k}`, JSON.stringify(v)); } catch { /* storage off */ } },
  del(k) { try { localStorage.removeItem(`repsheet.${k}`); } catch { /* storage off */ } },
};

// ---------- the phone's own copy of exercises, gyms and workouts ----------
function seedDb() {
  return { v: SEED_VERSION, exercises: clone(EXERCISES), gyms: clone(GYMS), workouts: clone(WORKOUTS), order: [...ORDER] };
}
function loadDb() {
  const d = store.get('db', null);
  if (!d || !d.v || !d.exercises || !d.gyms?.length || !d.workouts) return seedDb();
  for (const [k, v] of Object.entries(EXERCISES)) if (!d.exercises[k]) d.exercises[k] = clone(v);
  d.order = (d.order || []).filter((id) => d.workouts[id]);
  for (const id of Object.keys(d.workouts)) if (!d.order.includes(id)) d.order.push(id);
  return d;
}
let db = loadDb();
const saveDb = () => store.set('db', db);

const exOf = (id) => db.exercises[id] || { name: 'Unknown exercise', group: 'Other', equip: 'other', track: 'kgReps' };
const gymById = (id) => db.gyms.find((g) => g.id === id) || db.gyms[0];
const isStation = (ex) => ex.equip === 'machine' || ex.equip === 'cable';
const stepsOf = (exId, gymId) => L.stepsFor(exOf(exId), gymById(gymId), exId);
const histKey = (exId, gymId) => (isStation(exOf(exId)) ? `${exId}@${gymId}` : exId);
let lastMap = store.get('last', {});
const lastFor = (key) => lastMap[key] ?? LAST[key] ?? null;

function defaultRx(exId) {
  const t = exOf(exId).track;
  const rx = { ex: exId, sets: 3, rest: 90 };
  if (t === 'time') rx.time = 30;
  else if (t === 'kgDistance' || t === 'distance') rx.distance = 40;
  else if (t === 'calories') rx.cal = 15;
  else rx.reps = 10;
  return rx;
}
function doseOnly(rx) {
  const o = { ex: rx.ex };
  for (const k of ['reps', 'time', 'distance', 'cal', 'tempo']) if (rx[k] != null) o[k] = rx[k];
  return o;
}

// ---------- bests and PRs ----------
const REP_MARKS = [1, 3, 5, 8, 10];
const totalReps = (s) => (s.reps || 0) + (s.extra || 0);

function applyBest(bests, key, s, track) {
  const hits = [];
  const b = bests[key] || (bests[key] = { e1rm: 0, heaviest: null, repMax: {} });
  b.repMax ||= {};
  const had = !!(b.e1rm || b.time);
  const reps = totalReps(s);
  if (track === 'kgReps' && s.kg && reps) {
    const e = L.e1rm(s.kg, reps);
    if (s.kg > (b.heaviest?.kg ?? 0)) {
      if (had && b.heaviest) hits.push({ label: 'Heaviest ever', value: `${L.fmtKg(s.kg)} kg`, prev: `${L.fmtKg(b.heaviest.kg)} kg` });
      b.heaviest = { kg: s.kg, reps };
    }
    if (REP_MARKS.includes(reps)) {
      const prev = b.repMax[reps];
      if (prev != null && s.kg > prev) hits.push({ label: `Best ${reps}-rep set`, value: `${L.fmtKg(s.kg)} kg`, prev: `${L.fmtKg(prev)} kg` });
      if (prev == null || s.kg > prev) b.repMax[reps] = s.kg;
    }
    if (e > (b.e1rm || 0)) {
      if (had) hits.push({ label: 'Estimated 1RM', value: `${L.fmtKg(e)} kg`, prev: `${L.fmtKg(b.e1rm)} kg` });
      b.e1rm = e;
    }
  }
  if (track === 'time' && s.time && s.time > (b.time ?? 0)) {
    if (b.time) hits.push({ label: 'Longest hold', value: `${s.time} s`, prev: `${b.time} s` });
    b.time = s.time;
  }
  if (track === 'kgDistance' && s.kg && s.kg > (b.heaviest?.kg ?? 0)) {
    if (b.heaviest) hits.push({ label: 'Heaviest carry', value: `${L.fmtKg(s.kg)} kg`, prev: `${L.fmtKg(b.heaviest.kg)} kg` });
    b.heaviest = { kg: s.kg, dist: s.dist };
  }
  return hits;
}

function loadBests() {
  const b = clone(BEST);
  for (const p of store.get('prs', [])) applyBest(b, p.key, p.set, p.track);
  return b;
}

// ---------- state ----------
for (const k of ['active', 'test']) { const v = store.get(k, null); if (v && v.v !== 2) store.del(k); }

const state = {
  screen: 'today',
  gymId: store.get('gym', db.gyms[0].id),
  pick: null,
  session: store.get('active', null),
  test: store.get('test', null),
  rest: null,
  restMin: false,
  sheet: null,
  detail: null,
  confirm: null,
  edit: null,
  gymDraft: null,
  exDraft: null,
  pending: null,
  libQ: '',
  back: 'today',
  bests: loadBests(),
};
if (!db.gyms.find((g) => g.id === state.gymId)) state.gymId = db.gyms[0].id;
if (state.session) state.screen = state.session.endedAt ? 'summary' : 'workout';
else if (state.test) state.screen = 'test';

function persist() {
  if (state.session) store.set('active', state.session); else store.del('active');
  if (state.test) store.set('test', state.test); else store.del('test');
}

function nextWorkoutId() {
  const order = db.order.filter((id) => db.workouts[id]);
  const i = order.indexOf(store.get('lastWorkout', null));
  return order[(i + 1) % order.length];
}

// ---------- building a session ----------
function newSet(type, v = {}) {
  return { type, kg: v.kg ?? null, reps: v.reps ?? null, time: v.time ?? null, dist: v.dist ?? null, cal: v.cal ?? null, tempo: v.tempo ?? null, extra: v.extra ?? 0, done: false };
}

function buildItem(rx, gymId, rounds) {
  const ex = exOf(rx.ex);
  const steps = stepsOf(rx.ex, gymId);
  const key = histKey(rx.ex, gymId);
  const last = lastFor(key);
  let hint = null;
  if (!last && isStation(ex)) {
    for (const g of db.gyms) {
      if (g.id === gymId) continue;
      const l = lastFor(`${rx.ex}@${g.id}`);
      if (l?.length) { hint = { gym: g.name, kg: Math.max(...l.map((s) => s.kg || 0)) }; break; }
    }
  }
  const target = ex.track === 'kgReps' || ex.track === 'kgDistance'
    ? L.nextTarget(last, ex.track === 'kgReps' ? rx.reps : null, steps)
    : null;
  const n = rounds || rx.sets || 3;
  const sets = [];
  if (rx.warmups && target && ex.equip === 'barbell') {
    for (const w of L.warmupRamp(target.kg, steps, rx.warmups)) sets.push(newSet('warmup', { kg: w.kg, reps: w.reps }));
  }
  for (let i = 0; i < n; i++) {
    sets.push(newSet('working', {
      kg: target?.kg ?? null,
      reps: rx.reps ?? null,
      time: rx.time ?? last?.[0]?.time ?? null,
      dist: rx.distance ?? last?.[0]?.dist ?? null,
      cal: rx.cal ?? null,
      tempo: rx.tempo || null,
    }));
  }
  return { exId: rx.ex, from: null, rx: clone(rx), key, last, hint, target, sets };
}

function freshCircuit() {
  return { status: 'idle', startedAt: null, before: 0, rounds: 0, extra: 0, lastMinute: -1, result: null };
}

function buildBlock(b, gymId) {
  if (b.type === 'straight') return { type: 'straight', rest: b.items[0].rest ?? 90, items: [buildItem(b.items[0], gymId)] };
  if (b.type === 'superset') return { type: 'superset', rest: b.rest ?? 90, rounds: b.rounds || 3, items: b.items.map((rx) => buildItem(rx, gymId, b.rounds || 3)) };
  return { type: b.type, def: clone(b), c: freshCircuit() };
}

function buildSession(tpl, workoutId, gymId) {
  return {
    v: 2,
    id: `${new Date().toISOString().slice(0, 10)}-${workoutId}`,
    workoutId, name: tpl.name, gymId, startedAt: Date.now(), endedAt: null, feel: null,
    blocks: tpl.blocks.map((b) => buildBlock(b, gymId)),
    bests: clone(state.bests), prs: [], changed: false, keep: false,
  };
}

function sessionToTemplate(s, base) {
  return {
    ...base,
    blocks: s.blocks.map((b) => {
      if (b.type === 'straight') {
        const it = b.items[0];
        const working = it.sets.filter((x) => x.type === 'working' || x.type === 'failure').length || 1;
        const rx = { ...it.rx, ex: it.exId, sets: working, rest: b.rest };
        if (it.sets.some((x) => x.type === 'drop')) rx.dropLast = true;
        return { type: 'straight', items: [rx] };
      }
      if (b.type === 'superset') return { type: 'superset', rounds: b.rounds, rest: b.rest, items: b.items.map((it) => ({ ...doseOnly(it.rx), ex: it.exId })) };
      return clone(b.def);
    }),
  };
}

// ---------- text helpers ----------
function circuitTitle(b) {
  const d = b.def || b;
  switch (b.type) {
    case 'emom': return `EMOM, ${d.minutes} minutes`;
    case 'amrap': return `AMRAP, ${d.minutes} minutes`;
    case 'fortime': return `For time, ${d.rounds} rounds`;
    case 'rounds': return `${d.rounds} rounds`;
    default: return '';
  }
}

function circuitSub(b) {
  const d = b.def;
  switch (b.type) {
    case 'emom': return d.items.length === 2 ? 'Alternate each minute' : `Rotate through ${d.items.length} moves`;
    case 'amrap': return 'As many rounds as you can';
    case 'fortime': return `Time cap ${d.cap} minutes`;
    case 'rounds': return `Rest ${L.fmtRest(d.rest)} between rounds`;
    default: return '';
  }
}

function setText(s, track) {
  const extra = s.extra ? ` + ${s.extra} to failure` : '';
  if (track === 'kgReps') return `${L.fmtKg(s.kg)} kg × ${s.reps}${extra}`;
  if (track === 'time') return `${s.time} s`;
  if (track === 'kgDistance') return `${L.fmtKg(s.kg)} kg for ${s.dist} m`;
  if (track === 'distance') return `${s.dist} m`;
  if (track === 'calories') return `${s.cal} cal`;
  return `${s.reps} reps${extra}`;
}

function doseOf(rx, ex, count) {
  const side = ex.perSide ? ' each side' : '';
  if (rx.reps) return `${count} × ${rx.reps}${side}`;
  if (rx.time) return `${count} × ${rx.time} s${side}`;
  if (rx.distance) return `${count} × ${rx.distance} m`;
  if (rx.cal) return `${count} × ${rx.cal} cal`;
  return `${count} sets`;
}

function lastLine(item, gymId) {
  const ex = exOf(item.exId);
  const bits = [];
  if (item.from) bits.push(`Swapped from ${esc(exOf(item.from).name)} for this session.`);
  const last = item.last;
  if (last?.length) {
    if (ex.track === 'kgReps') {
      const same = last.every((s) => s.kg === last[0].kg);
      const reps = (s) => `${s.reps}${s.extra ? `+${s.extra}` : ''}`;
      bits.push(same
        ? `Last time ${L.fmtKg(last[0].kg)} kg × ${last.map(reps).join(', ')}.`
        : `Last time ${last.map((s) => `${L.fmtKg(s.kg)} × ${reps(s)}`).join(', ')}.`);
      if (item.target?.bumped) bits.push(`<b class="up">Up to ${L.fmtKg(item.target.kg)} kg today.</b>`);
      else if (item.rx.reps) bits.push(`Same weight until every set hits ${item.rx.reps}.`);
    } else if (ex.track === 'time') bits.push(`Last time ${last.map((s) => s.time).join(', ')} s.`);
    else if (ex.track === 'kgDistance') bits.push(`Last time ${L.fmtKg(last[0].kg)} kg for ${last[0].dist} m.`);
    else if (ex.track === 'distance') bits.push(`Last time ${last.map((s) => s.dist).join(', ')} m.`);
    else if (ex.track === 'calories') bits.push(`Last time ${last.map((s) => s.cal).join(', ')} cal.`);
    else bits.push(`Last time ${last.map((s) => s.reps).join(', ')}.`);
  } else if (item.hint) {
    bits.push(`New here. You used ${L.fmtKg(item.hint.kg)} kg at ${esc(item.hint.gym)}, and every ${ex.equip === 'cable' ? 'cable stack' : 'machine'} is its own beast. Tap + to pick a starting weight.`);
  } else if (ex.track === 'kgReps' || ex.track === 'kgDistance') {
    bits.push('First time. Tap + to pick a starting weight.');
  }
  void gymId;
  return bits.length ? `<p class="last">${bits.join(' ')}</p>` : '';
}

function blockOrder(b, bi) {
  const out = [];
  if (b.type === 'straight') {
    const it = b.items[0];
    let w = 0;
    it.sets.forEach((s) => {
      const lbl = s.type === 'warmup' ? 'warm-up' : s.type === 'drop' ? 'drop set' : `set ${++w}`;
      out.push({ s, label: `${exOf(it.exId).name}, ${lbl}` });
    });
  } else if (b.type === 'superset') {
    for (let r = 0; r < b.rounds; r++) {
      b.items.forEach((it, ii) => { if (it.sets[r]) out.push({ s: it.sets[r], label: `${letter(bi)}${ii + 1} ${exOf(it.exId).name}, round ${r + 1}` }); });
    }
  }
  return out;
}

function nextLabel(fromBi) {
  const blocks = state.session.blocks;
  for (let bi = fromBi; bi < blocks.length; bi++) {
    const b = blocks[bi];
    if (b.type === 'straight' || b.type === 'superset') {
      const n = blockOrder(b, bi).find((x) => !x.s.done);
      if (n) return n.label;
    } else if (b.c.status !== 'done') {
      return circuitTitle(b);
    }
  }
  return null;
}

// ---------- shared UI bits ----------
const CHECK = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function brand() {
  return '<span class="brand"><span class="mark" aria-hidden="true"><i class="p25"></i><i class="p20"></i><i class="p15"></i><i class="p10"></i><i class="p5"></i></span><span class="word">repsheet</span></span>';
}

function tabs() {
  const on = (s) => {
    if (s === 'prs') return ['prs', 'detail'].includes(state.screen) ? 'on' : '';
    if (s === 'exercises') return state.screen === 'exercises' ? 'on' : '';
    return state.screen === s ? 'on' : '';
  };
  return `<nav class="tabs" aria-label="Main">
    <button class="${on('today')}" data-act="nav" data-to="today">Today</button>
    <button class="${on('exercises')}" data-act="nav" data-to="exercises">Exercises</button>
    <button class="${on('prs')}" data-act="nav" data-to="prs">PRs</button>
  </nav>`;
}

function field(name, value, mode, unit, label, done) {
  const shown = value == null ? '' : name === 'kg' ? L.fmtKg(value) : value;
  const dis = done ? 'disabled' : '';
  return `<div class="field" data-f="${name}">
    <button class="step" data-act="dec" aria-label="Less ${label}" ${dis}>−</button>
    <label class="val"><input type="text" inputmode="${mode}" value="${shown}" placeholder="–" aria-label="${label}" data-act="input" ${dis}><small>${unit}</small></label>
    <button class="step" data-act="inc" aria-label="More ${label}" ${dis}>+</button>
  </div>`;
}

function setRow(bi, ii, si, s, item, label) {
  const ex = exOf(item.exId);
  const t = ex.track;
  const side = ex.perSide ? ' each side' : '';
  const f = [];
  if (t === 'kgReps' || t === 'kgDistance') f.push(field('kg', s.kg, 'decimal', 'kg', 'weight', s.done));
  if (t === 'kgReps' || t === 'reps') f.push(field('reps', s.reps, 'numeric', `reps${side}`, 'reps', s.done));
  if (t === 'time') f.push(field('time', s.time, 'numeric', `sec${side}`, 'seconds', s.done));
  if (t === 'kgDistance' || t === 'distance') f.push(field('dist', s.dist, 'numeric', 'metres', 'metres', s.done));
  if (t === 'calories') f.push(field('cal', s.cal, 'numeric', 'cal', 'calories', s.done));
  const meta = [];
  if (s.tempo) meta.push(`Tempo ${esc(s.tempo)}`);
  if (s.extra) meta.push(`then ${s.extra} to failure`);
  if (s.type === 'failure') meta.push('To failure');
  return `<div class="set ${s.type} ${s.done ? 'done' : ''}" data-b="${bi}" data-i="${ii}" data-s="${si}">
    <button class="set-label" data-act="setopts" aria-label="Options for set ${label}">${label}<i aria-hidden="true"></i></button>
    <div class="fields" style="--n:${f.length}">${f.join('')}</div>
    <button class="tick" data-act="tick" aria-pressed="${s.done}" aria-label="${s.done ? 'Undo this set' : 'Log this set'}">${CHECK}</button>
    ${meta.length ? `<button class="set-meta" data-act="setopts">${meta.join(', ')}</button>` : ''}
  </div>`;
}

function stationLine(it, bi, ii, gymId) {
  const ex = exOf(it.exId);
  if (!isStation(ex)) return '';
  const gym = gymById(gymId);
  const steps = stepsOf(it.exId, gymId);
  if (steps.unset) return `<button class="machine warn" data-act="station" data-b="${bi}" data-i="${ii}">No ${ex.equip === 'cable' ? 'cable station' : 'machine'} picked at ${esc(gym.name)} yet. Pick one</button>`;
  return `<button class="machine" data-act="station" data-b="${bi}" data-i="${ii}">${esc(steps.station.name)}, ${esc(gym.name)}<span aria-hidden="true"> ▾</span></button>`;
}

// ---------- Today ----------
function previewRows(tpl, gymId) {
  return tpl.blocks.flatMap((b, bi) => {
    if (b.type === 'straight' || b.type === 'superset') {
      return b.items.map((rx, ii) => {
        const it = buildItem(rx, gymId, b.rounds);
        const ex = exOf(rx.ex);
        const tag = b.type === 'superset' ? `${letter(bi)}${ii + 1}` : letter(bi);
        let load = '';
        if (it.target) load = `<span class="load ${it.target.bumped ? 'up' : ''}">${L.fmtKg(it.target.kg)} kg</span>`;
        else if (isStation(ex)) load = `<span class="load new">${stepsOf(rx.ex, gymId).unset ? 'Pick station' : 'New here'}</span>`;
        else if (ex.equip === 'bodyweight') load = '<span class="load">Body</span>';
        return `<li><span class="tag">${tag}</span><span class="nm">${esc(ex.name)}</span><span class="dose">${doseOf(rx, ex, b.type === 'superset' ? b.rounds : rx.sets)}</span>${load}</li>`;
      });
    }
    return [`<li><span class="tag">${letter(bi)}</span><span class="nm">${circuitTitle(b)}</span><span class="dose"></span></li>`];
  }).join('');
}

function todayScreen() {
  let wid = state.pick && db.workouts[state.pick] ? state.pick : nextWorkoutId();
  const w = db.workouts[wid];
  const gym = gymById(state.gymId);
  const isNext = wid === nextWorkoutId();
  const others = db.order.filter((id) => id !== wid && db.workouts[id]).map((id) => {
    const o = db.workouts[id];
    return `<button class="other" data-act="pick" data-w="${id}"><span class="o-name">${esc(o.name)}</span><span class="o-focus">${esc(o.focus || 'Workout')}, about ${L.estimateMinutes(o.blocks)} min</span></button>`;
  }).join('');
  return `
  <header class="top">${brand()}<button class="chip" data-act="gym" aria-label="Change gym, currently ${esc(gym.name)}">${esc(gym.name)}<span aria-hidden="true">▾</span></button></header>
  <section class="hero">
    <p class="when">${isNext ? `Next up in ${BLOCK.name.toLowerCase()}, week ${BLOCK.week} of ${BLOCK.weeks}` : 'Picked for today'}</p>
    <h1 class="wname">${esc(w.name)}</h1>
    <p class="focus">${esc(w.focus || 'Workout')}, about ${L.estimateMinutes(w.blocks)} minutes</p>
    <ol class="preview">${previewRows(w, state.gymId)}</ol>
    <button class="primary big" data-act="start" data-w="${wid}">Start ${esc(w.name)}</button>
    <button class="ghost wide" data-act="edit" data-w="${wid}">Edit this workout</button>
  </section>
  <section class="others">
    <h2>Or train something else</h2>
    ${others}
    <button class="ghost wide" data-act="new-workout">New workout</button>
  </section>
  <p class="note">This is a prototype with sample numbers. Sessions save on this phone only; syncing to your Sheet comes with the MVP. ${VERSION}.</p>
  ${tabs()}`;
}

// ---------- workout in progress ----------
function straightBlock(b, bi) {
  const it = b.items[0];
  const ex = exOf(it.exId);
  const working = it.sets.filter((s) => s.type !== 'warmup' && s.type !== 'drop').length;
  const rx = [doseOf(it.rx, ex, working)];
  if (it.rx.tempo) rx.push(`tempo ${esc(it.rx.tempo)}`);
  rx.push(`rest ${L.fmtRest(b.rest)}`);
  let w = 0;
  const rows = it.sets.map((s, si) => {
    const label = s.type === 'warmup' ? 'W' : s.type === 'drop' ? '↓' : String(++w);
    return setRow(bi, 0, si, s, it, label);
  }).join('');
  const anyDone = it.sets.some((s) => s.done);
  return `<section class="block" id="b${bi}">
    <header class="bh">
      <span class="letter">${letter(bi)}</span>
      <div class="bh-text"><h2>${esc(ex.name)}</h2><p class="rx">${rx.join(', ')}</p>${stationLine(it, bi, 0, state.session.gymId)}</div>
      ${!anyDone ? `<button class="chip small" data-act="swap" data-b="${bi}" data-i="0">Swap</button>` : ''}
    </header>
    ${lastLine(it, state.session.gymId)}
    <div class="sets">${rows}</div>
    <div class="add-row">
      <button class="chip small" data-act="add-set" data-b="${bi}">+ Set</button>
      ${ex.track === 'kgReps' ? `<button class="chip small" data-act="drop" data-b="${bi}">+ Drop set</button>` : ''}
    </div>
  </section>`;
}

function supersetBlock(b, bi) {
  const tagBase = letter(bi);
  const intro = b.items.map((it, ii) => {
    const ex = exOf(it.exId);
    const anyDone = it.sets.some((s) => s.done);
    return `<div class="ss-item">
      <span class="tag">${tagBase}${ii + 1}</span>
      <div class="bh-text"><h3>${esc(ex.name)}</h3><p class="rx">${doseOf(it.rx, ex, b.rounds)}${it.rx.tempo ? `, tempo ${esc(it.rx.tempo)}` : ''}</p>${stationLine(it, bi, ii, state.session.gymId)}${lastLine(it, state.session.gymId)}</div>
      ${!anyDone ? `<button class="chip small" data-act="swap" data-b="${bi}" data-i="${ii}">Swap</button>` : ''}
    </div>`;
  }).join('');
  let rounds = '';
  for (let r = 0; r < b.rounds; r++) {
    rounds += `<div class="round"><p class="round-label">Round ${r + 1}</p>${b.items.map((it, ii) => (it.sets[r] ? setRow(bi, ii, r, it.sets[r], it, `${tagBase}${ii + 1}`) : '')).join('')}</div>`;
  }
  return `<section class="block" id="b${bi}">
    <header class="bh">
      <span class="letter">${tagBase}</span>
      <div class="bh-text"><h2>Superset</h2><p class="rx">${b.rounds} rounds, rest ${L.fmtRest(b.rest)} after ${tagBase}${b.items.length}</p></div>
    </header>
    ${intro}
    ${rounds}
    <div class="add-row"><button class="chip small" data-act="add-round" data-b="${bi}">+ Round</button></div>
  </section>`;
}

function elapsedOf(c, now = Date.now()) {
  return c.before + (c.status === 'running' ? (now - c.startedAt) / 1000 : 0);
}

function circuitView(b, now = Date.now()) {
  const d = b.def;
  const c = b.c;
  const e = elapsedOf(c, now);
  switch (b.type) {
    case 'emom': {
      if (c.status === 'done') return { big: 'Done', small: `${d.minutes} minutes, every minute on the minute` };
      const m = Math.min(d.minutes - 1, Math.floor(e / 60));
      const left = c.status === 'idle' ? 60 : 60 - (e - m * 60);
      const it = d.items[m % d.items.length] || { text: '' };
      return { big: L.fmtTime(left), small: `Minute ${m + 1} of ${d.minutes}: ${it.text}${it.detail ? `, ${it.detail}` : ''}` };
    }
    case 'amrap':
      if (c.status === 'done') return { big: `${c.rounds} + ${c.extra}`, small: 'Rounds plus extra reps' };
      return { big: L.fmtTime(d.minutes * 60 - e), small: `${c.rounds} ${c.rounds === 1 ? 'round' : 'rounds'} so far` };
    case 'fortime':
      if (c.status === 'done') return { big: L.fmtTime(c.result.time), small: c.result.capped ? `Stopped with ${c.rounds} of ${d.rounds} rounds done` : `All ${d.rounds} rounds done` };
      return { big: L.fmtTime(e), small: `Round ${Math.min(c.rounds + 1, d.rounds)} of ${d.rounds}, cap ${d.cap}:00` };
    case 'rounds':
      if (c.rounds >= d.rounds) return { big: 'Done', small: `${d.rounds} rounds` };
      return { big: `Round ${c.rounds + 1}`, small: `of ${d.rounds}` };
    default: return { big: '', small: '' };
  }
}

function circuitBlock(b, bi) {
  const d = b.def;
  const c = b.c;
  const v = circuitView(b);
  const moves = d.items.map((it, i) => {
    let tag = '';
    if (b.type === 'emom') tag = d.items.length === 2 ? (i === 0 ? 'Odd minutes' : 'Even minutes') : `Minute ${i + 1}`;
    return `<li>${tag ? `<span class="mv-tag">${tag}</span>` : ''}<span class="mv">${esc(it.text)}</span>${it.detail ? `<span class="mv-detail">${esc(it.detail)}</span>` : ''}</li>`;
  }).join('');
  let actions = '';
  const B = `data-b="${bi}"`;
  if (b.type === 'rounds') {
    actions = c.rounds < d.rounds
      ? `<button class="primary" data-act="cround" ${B}>Round done</button>`
      : `<button class="text-btn" data-act="creset" ${B}>Reset</button>`;
  } else if (c.status === 'idle') {
    actions = `<button class="primary" data-act="cstart" ${B}>Start</button>`;
  } else if (c.status === 'running') {
    if (b.type === 'amrap') actions = `<button class="primary" data-act="cround" ${B}>+1 round</button>`;
    if (b.type === 'fortime') actions = `<button class="primary" data-act="cround" ${B}>Round done</button>`;
    actions += `<button class="ghost" data-act="cpause" ${B}>Pause</button>`;
  } else if (c.status === 'paused') {
    actions = `<button class="primary" data-act="cstart" ${B}>Resume</button><button class="ghost" data-act="cend" ${B}>End now</button>`;
  } else if (c.status === 'done') {
    if (b.type === 'amrap') {
      actions = `<div class="extra"><span>Extra reps</span>
        <div class="field" data-f="extra"><button class="step" data-act="cextra" data-d="-1" ${B} aria-label="Fewer extra reps">−</button><span class="val"><b>${c.extra}</b></span><button class="step" data-act="cextra" data-d="1" ${B} aria-label="More extra reps">+</button></div></div>`;
    }
    actions += `<button class="text-btn" data-act="creset" ${B}>Reset</button>`;
  }
  return `<section class="block circuit ${c.status}" id="b${bi}" data-ctype="${b.type}">
    <header class="bh">
      <span class="letter">${letter(bi)}</span>
      <div class="bh-text"><h2>${circuitTitle(b)}</h2><p class="rx">${circuitSub(b)}</p></div>
    </header>
    <ol class="moves">${moves}</ol>
    <div class="clock" data-clock="${bi}">
      <span class="c-big" data-cbig="${bi}">${v.big}</span>
      <span class="c-small" data-csmall="${bi}">${esc(v.small)}</span>
    </div>
    <div class="c-actions">${actions}</div>
  </section>`;
}

function workoutScreen() {
  const s = state.session;
  const blocks = s.blocks.map((b, bi) => {
    if (b.type === 'straight') return straightBlock(b, bi);
    if (b.type === 'superset') return supersetBlock(b, bi);
    return circuitBlock(b, bi);
  }).join('');
  return `
  <header class="wtop">
    <div><h1>${esc(s.name)}</h1><p class="sub">${esc(gymById(s.gymId).name)}, <span data-elapsed>0:00</span></p></div>
    <button class="ghost" data-act="finish">Finish</button>
  </header>
  <p class="tip">Tap a set number to change its tempo, add reps to failure or remove it.</p>
  ${blocks}
  <div class="add-row center"><button class="ghost" data-act="add-ex">+ Add an exercise</button></div>
  <div class="end">
    <button class="primary big" data-act="finish">Finish workout</button>
    <button class="text-btn danger" data-act="discard">${state.confirm === 'discard' ? 'Tap again to discard this workout' : 'Discard workout'}</button>
  </div>`;
}

function sessionStats(s) {
  let sets = 0; let volume = 0;
  for (const b of s.blocks) {
    for (const it of b.items || []) {
      const t = exOf(it.exId).track;
      for (const x of it.sets) {
        if (!x.done) continue;
        sets += 1;
        if (t === 'kgReps' && x.kg) volume += x.kg * totalReps(x);
      }
    }
  }
  return { sets, volume: Math.round(volume) };
}

const FEELS = ['Rough', 'Heavy', 'Solid', 'Strong', 'Flying'];

function summaryScreen() {
  const s = state.session;
  const st = sessionStats(s);
  const dur = (s.endedAt || Date.now()) - s.startedAt;
  const circuits = s.blocks.filter((b) => b.c && b.c.status === 'done' && b.type !== 'rounds').map((b) => `<li>${circuitTitle(b)}: <b>${circuitView(b).big}</b></li>`).join('');
  const prs = s.prs.map((p) => `<li><b>${esc(p.name)}</b> ${setText(p.set, p.track)}<span>${p.hits.map((h) => h.label).join(', ')}</span></li>`).join('');
  const canKeep = s.changed && db.workouts[s.workoutId];
  return `
  <header class="wtop"><div><h1>${esc(s.name)} done</h1><p class="sub">${esc(gymById(s.gymId).name)}</p></div></header>
  <dl class="stats">
    <div><dt>Time</dt><dd>${L.fmtTime(dur / 1000)}</dd></div>
    <div><dt>Sets</dt><dd>${st.sets}</dd></div>
    <div><dt>Volume</dt><dd>${st.volume.toLocaleString('en-AU')}<small> kg</small></dd></div>
    <div><dt>PRs</dt><dd class="${s.prs.length ? 'pr' : ''}">${s.prs.length}</dd></div>
  </dl>
  ${prs ? `<h2 class="sec">New PRs</h2><ul class="pr-list">${prs}</ul>` : ''}
  ${circuits ? `<h2 class="sec">Circuits</h2><ul class="circ-list">${circuits}</ul>` : ''}
  <h2 class="sec">How did it feel?</h2>
  <div class="feel" role="radiogroup" aria-label="How did it feel">
    ${FEELS.map((f, i) => `<button role="radio" aria-checked="${s.feel === i + 1}" class="${s.feel === i + 1 ? 'on' : ''}" data-act="feel" data-v="${i + 1}"><b>${i + 1}</b><span>${f}</span></button>`).join('')}
  </div>
  ${canKeep ? `<h2 class="sec">You changed this workout today</h2>
    <button class="toggle ${s.keep ? 'on' : ''}" aria-pressed="${s.keep}" data-act="keep"><span class="box" aria-hidden="true"></span><span>Keep today's exercises and sets for next time</span></button>
    <p class="hint">Leave it off and ${esc(db.workouts[s.workoutId].name)} stays as planned.</p>` : ''}
  <div class="end">
    <button class="primary big" data-act="save">Save session</button>
    <button class="text-btn" data-act="resume">Back to the workout</button>
  </div>`;
}

// ---------- PR board and graphs ----------
function sparkline(points, w = 112, h = 34) {
  if (points.length < 2) return '';
  const vals = points.map((p) => p.e);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (w - 4) + 2, h - 3 - ((p.e - min) / span) * (h - 6)]);
  const last = xy[xy.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polyline points="${xy.map((p) => p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" class="spark-dot"/>
  </svg>`;
}

function seriesFor(key) {
  const base = SERIES[key] ? clone(SERIES[key]) : { points: [], tested: [] };
  const b = state.bests[key];
  const lastE = base.points[base.points.length - 1]?.e ?? 0;
  if (b?.e1rm && b.e1rm > lastE) base.points.push({ d: new Date().toISOString().slice(0, 10), e: b.e1rm });
  for (const t of store.get('tested', [])) if (t.key === key) base.tested.push(t);
  return base;
}

function weeksGrid() {
  const { plan } = WEEKLY;
  const done = [...WEEKLY.done];
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  done[done.length - 1] += store.get('sessions', []).filter((x) => x.startedAt >= monday.getTime()).length;
  const rows = done.map((n, i) => {
    const age = done.length - 1 - i;
    const d = new Date(monday); d.setDate(d.getDate() - 7 * age);
    const squares = Array.from({ length: Math.max(plan, n) }, (_, k) => `<i class="${k < n ? 'on' : ''}${k >= plan ? ' extra' : ''}"></i>`).join('');
    return `<li class="${age === 0 ? 'now' : ''}"><span class="wk">${age === 0 ? 'This week' : `Week of ${shortDate(d)}`}</span><span class="sq" aria-hidden="true">${squares}</span><span class="wn">${n} of ${plan}${age === 0 ? ' so far' : ''}</span></li>`;
  }).reverse().join('');
  const full = done.slice(0, -1);
  const total = full.reduce((a, b) => a + b, 0);
  return `<section class="weeks">
    <h2 class="sec">Sessions per week</h2>
    <p class="hint">Each square is one planned session. Filled squares are sessions you trained.</p>
    <ol>${rows}</ol>
    <p class="hint">${total} of ${plan * full.length} planned sessions in the last ${full.length} full weeks.</p>
  </section>`;
}

function liftRow(key) {
  const b = state.bests[key];
  const ex = exOf(key);
  const ser = seriesFor(key);
  const cells = REP_MARKS.map((r) => `<span><small>${r}</small>${b?.repMax?.[r] != null ? L.fmtKg(b.repMax[r]) : '–'}</span>`).join('');
  return `<button class="lift" data-act="detail" data-k="${key}">
    <span class="l-name">${esc(ex.name)}</span>
    <span class="l-e1"><b>${L.fmtKg(b?.e1rm)}</b><small>kg estimated 1RM</small></span>
    ${sparkline(ser.points)}
    <span class="l-reps" aria-label="Best weight for 1, 3, 5, 8 and 10 reps">${cells}</span>
  </button>`;
}

function prsScreen() {
  return `
  <header class="top">${brand()}</header>
  <h1 class="page">PRs and progress</h1>
  <div class="pr-cta">
    <button class="primary big" data-act="test-setup">Start a PR session</button>
    <p class="hint">Test a 1RM, 3RM or 5RM. Best done at the end of a block.</p>
  </div>
  <h2 class="sec">Main lifts</h2>
  <p class="hint">Best kg for 1, 3, 5, 8 and 10 reps under each lift. Tap one for its graph.</p>
  <div class="lifts">${MAIN_LIFTS.map(liftRow).join('')}</div>
  ${weeksGrid()}
  <p class="note">Cable and machine PRs count per gym, so they'll live with each gym's equipment in the MVP.</p>
  ${tabs()}`;
}

function detailScreen() {
  const key = state.detail;
  const ex = exOf(key);
  const b = state.bests[key];
  const ser = seriesFor(key);
  const W = 340; const H = 210; const padL = 36; const padR = 12; const padT = 16; const padB = 30;
  const vals = [...ser.points.map((p) => p.e), ...ser.tested.map((t) => t.kg)];
  const min = Math.floor(Math.min(...vals) - 2); const max = Math.ceil(Math.max(...vals) + 2);
  const t0 = new Date(ser.points[0].d).getTime(); const t1 = new Date(ser.points[ser.points.length - 1].d).getTime();
  const x = (d) => padL + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const line = ser.points.map((p) => `${x(p.d).toFixed(1)},${y(p.e).toFixed(1)}`).join(' ');
  const dots = ser.points.map((p) => `<circle cx="${x(p.d)}" cy="${y(p.e)}" r="3" class="dot"/>`).join('');
  const tested = ser.tested.map((t) => `<g class="tested"><rect x="${x(t.d) - 5}" y="${y(t.kg) - 5}" width="10" height="10" transform="rotate(45 ${x(t.d)} ${y(t.kg)})"/><text x="${x(t.d) + 9}" y="${y(t.kg) + 16}">Tested ${L.fmtKg(t.kg)} × ${t.reps}</text></g>`).join('');
  const reps = REP_MARKS.map((r) => `<div><dt>${r} rep${r > 1 ? 's' : ''}</dt><dd>${b?.repMax?.[r] != null ? `${L.fmtKg(b.repMax[r])} kg` : '–'}</dd></div>`).join('');
  return `
  <header class="top"><button class="ghost" data-act="nav" data-to="prs">Back</button></header>
  <h1 class="page">${esc(ex.name)}</h1>
  <figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated 1RM over time for ${esc(ex.name)}">
      <line x1="${padL}" x2="${W - padR}" y1="${y(max)}" y2="${y(max)}" class="grid"/>
      <line x1="${padL}" x2="${W - padR}" y1="${y(min)}" y2="${y(min)}" class="grid"/>
      <text x="${padL - 6}" y="${y(max) + 4}" text-anchor="end" class="axis">${max}</text>
      <text x="${padL - 6}" y="${y(min) + 4}" text-anchor="end" class="axis">${min}</text>
      <polyline points="${line}" class="trend"/>
      ${dots}${tested}
      <text x="${padL}" y="${H - 8}" class="axis">${shortDate(ser.points[0].d)}</text>
      <text x="${W - padR}" y="${H - 8}" text-anchor="end" class="axis">${shortDate(ser.points[ser.points.length - 1].d)}</text>
    </svg>
    <figcaption>Estimated 1RM in kg over time. Red diamonds are maxes you tested in a PR session.</figcaption>
  </figure>
  <dl class="stats two">
    <div><dt>Estimated 1RM</dt><dd>${L.fmtKg(b?.e1rm)}<small> kg</small></dd></div>
    <div><dt>Heaviest lift</dt><dd>${b?.heaviest ? `${L.fmtKg(b.heaviest.kg)}<small> kg × ${b.heaviest.reps}</small>` : '–'}</dd></div>
  </dl>
  <h2 class="sec">Best by reps</h2>
  <dl class="reps-table">${reps}</dl>
  ${tabs()}`;
}

// ---------- PR session ----------
const TEST_LIFTS = ['squat', 'frontSquat', 'rdl', 'bench', 'ohp'];

function testScreen() {
  const t = state.test;
  if (t.stage === 'setup') {
    const lifts = TEST_LIFTS.map((k) => {
      const on = t.lifts.includes(k);
      const est = L.fromE1rm(state.bests[k]?.e1rm || 0, t.reps);
      return `<button class="opt ${on ? 'on' : ''}" role="checkbox" aria-checked="${on}" data-act="tlift" data-k="${k}">
        <span class="o-name">${esc(exOf(k).name)}</span><span class="o-focus">Current estimate ${L.fmtKg(Math.round(est * 10) / 10)} kg for ${t.reps}</span></button>`;
    }).join('');
    return `
    <header class="top"><button class="ghost" data-act="test-cancel">Cancel</button></header>
    <h1 class="page">PR session</h1>
    <p class="lede">Pick what to test. The app builds a warm-up ramp from your current best and plans three attempts.</p>
    <h2 class="sec">Test</h2>
    <div class="seg" role="radiogroup" aria-label="Rep max to test">
      ${[1, 3, 5].map((r) => `<button role="radio" aria-checked="${t.reps === r}" class="${t.reps === r ? 'on' : ''}" data-act="treps" data-r="${r}">${r}RM</button>`).join('')}
    </div>
    <h2 class="sec">Lifts</h2>
    <div class="opts">${lifts}</div>
    <div class="end"><button class="primary big" data-act="test-plan" ${t.lifts.length ? '' : 'disabled'}>Plan my session</button></div>`;
  }
  if (t.stage === 'done') {
    const rows = t.plans.map((p) => {
      const made = p.attempts.filter((a) => a.result === 'made').map((a) => a.kg);
      const best = made.length ? Math.max(...made) : null;
      const isPr = best != null && (p.prev == null || best > p.prev);
      return `<li><b>${esc(exOf(p.key).name)}</b><span>${best != null ? `${L.fmtKg(best)} kg × ${t.reps}` : 'No attempt made'}${isPr ? ' <em class="pr">PR</em>' : ''}${p.prev != null ? ` <small>(best before ${L.fmtKg(p.prev)} kg)</small>` : ''}</span></li>`;
    }).join('');
    return `
    <header class="wtop"><div><h1>PR session done</h1><p class="sub">${t.reps}RM test, ${esc(gymById(t.gymId).name)}</p></div></header>
    <ul class="pr-list results">${rows}</ul>
    <p class="hint">Your Health Coach uses these to set the next block's loads.</p>
    <div class="end">
      <button class="primary big" data-act="test-save">Save results</button>
      <button class="text-btn" data-act="test-back">Back to the session</button>
      <button class="text-btn danger" data-act="test-discard">${state.confirm === 'test-discard' ? 'Tap again to throw these results away' : 'Discard results'}</button>
    </div>`;
  }
  const cards = t.plans.map((p, li) => {
    const ex = exOf(p.key);
    if (li !== t.cur) {
      const made = p.attempts.filter((a) => a.result === 'made').map((a) => a.kg);
      const status = made.length ? `Best today ${L.fmtKg(Math.max(...made))} kg` : p.attempts.some((a) => a.result) ? 'No attempt made' : 'Up later';
      return `<section class="block test-lift closed"><header class="bh"><span class="letter">${letter(li)}</span><div class="bh-text"><h2>${esc(ex.name)}</h2><p class="rx">${status}</p></div><button class="chip small" data-act="tgo" data-l="${li}">Open</button></header></section>`;
    }
    const ramp = p.ramp.map((r, ri) => `<div class="set ${r.done ? 'done' : ''}" data-l="${li}" data-r="${ri}">
      <span class="set-label static">W</span>
      <div class="ramp-val"><b>${L.fmtKg(r.kg)}</b> kg × ${r.reps}</div>
      <button class="tick" data-act="tramp" aria-pressed="${r.done}" aria-label="${r.done ? 'Undo warm-up set' : 'Log warm-up set'}">${CHECK}</button>
    </div>`).join('');
    const attempts = p.attempts.map((a, ai) => {
      const res = a.result
        ? `<span class="result res-${a.result}">${a.result === 'made' ? 'Made' : 'Missed'}</span><button class="text-btn small" data-act="tundo" data-l="${li}" data-a="${ai}">Undo</button>`
        : `<button class="btn-made" data-act="tmade" data-l="${li}" data-a="${ai}">Made</button><button class="btn-missed" data-act="tmiss" data-l="${li}" data-a="${ai}">Missed</button>`;
      const dis = a.result ? 'disabled' : '';
      return `<div class="attempt ${a.result || ''}" data-l="${li}" data-a="${ai}">
        <span class="a-label">${a.label}</span>
        <div class="field" data-f="akg"><button class="step" data-act="tdec" aria-label="Less weight" ${dis}>−</button><label class="val"><input type="text" inputmode="decimal" value="${L.fmtKg(a.kg)}" aria-label="${a.label} weight" data-act="tinput" ${dis}><small>kg</small></label><button class="step" data-act="tinc" aria-label="More weight" ${dis}>+</button></div>
        <div class="a-res">${res}</div>
      </div>`;
    }).join('');
    const allDone = p.attempts.every((a) => a.result);
    const nextBtn = li < t.plans.length - 1
      ? `<button class="${allDone ? 'primary' : 'ghost'}" data-act="tnext">Next lift: ${esc(exOf(t.plans[li + 1].key).name)}</button>`
      : `<button class="${allDone ? 'primary' : 'ghost'}" data-act="tfinish">Finish PR session</button>`;
    return `<section class="block test-lift" id="t${li}">
      <header class="bh"><span class="letter">${letter(li)}</span><div class="bh-text"><h2>${esc(ex.name)}</h2>
        <p class="rx">Estimated ${t.reps}RM ${L.fmtKg(p.est)} kg${p.prev != null ? `, tested best ${L.fmtKg(p.prev)} kg` : ''}</p></div></header>
      <h3 class="sub-h">Warm-up</h3>
      <div class="sets">${ramp}</div>
      <h3 class="sub-h">Attempts, ${t.reps} rep${t.reps > 1 ? 's' : ''} each</h3>
      <p class="safety">Set the safeties before your attempts.</p>
      <div class="attempts">${attempts}</div>
      <div class="c-actions">${nextBtn}</div>
    </section>`;
  }).join('');
  return `
  <header class="wtop">
    <div><h1>PR session</h1><p class="sub">${t.reps}RM test, ${esc(gymById(t.gymId).name)}, <span data-elapsed>0:00</span></p></div>
    <button class="ghost" data-act="tfinish">Finish</button>
  </header>
  ${cards}
  <div class="end"><button class="text-btn danger" data-act="test-discard">${state.confirm === 'test-discard' ? 'Tap again to discard this PR session' : 'Discard PR session'}</button></div>`;
}

// ---------- exercise library ----------
function libListHtml(q) {
  const query = (q || '').toLowerCase().trim();
  const ids = Object.keys(db.exercises).filter((id) => {
    const e = db.exercises[id];
    return !query || e.name.toLowerCase().includes(query) || e.group.toLowerCase().includes(query);
  });
  if (!ids.length) return `<p class="hint">Nothing called "${esc(q)}" yet. Add it as a new exercise.</p>`;
  return GROUPS.map((g) => {
    const list = ids.filter((id) => (db.exercises[id].group || 'Other') === g).sort((a, b) => db.exercises[a].name.localeCompare(db.exercises[b].name));
    if (!list.length) return '';
    return `<h2 class="grp">${g}</h2>${list.map((id) => {
      const e = db.exercises[id];
      return `<button class="exrow" data-act="ex-open" data-x="${id}"><span class="o-name small">${esc(e.name)}</span><span class="o-focus">${EQUIP[e.equip] || 'Other'}, ${(TRACKS[e.track] || '').toLowerCase()}${e.perSide ? ', each side' : ''}</span></button>`;
    }).join('')}`;
  }).join('');
}

function exercisesScreen() {
  return `
  <header class="top">${brand()}</header>
  <h1 class="page">Exercises</h1>
  <div class="search"><input type="search" placeholder="Search exercises or muscle groups" value="${esc(state.libQ)}" data-act="lib-q" aria-label="Search exercises"></div>
  <button class="primary big" data-act="ex-new">Add an exercise</button>
  <div id="lib-list">${libListHtml(state.libQ)}</div>
  ${tabs()}`;
}

function chips(act, options, current, labels) {
  return `<div class="chips">${options.map((o) => `<button class="chip ${o === current ? 'on' : ''}" aria-pressed="${o === current}" data-act="${act}" data-v="${o}">${esc(labels ? labels[o] : o)}</button>`).join('')}</div>`;
}

function exEditScreen() {
  const d = state.exDraft;
  const used = d.id ? Object.values(db.workouts).filter((w) => JSON.stringify(w.blocks).includes(`"ex":"${d.id}"`)).map((w) => w.name) : [];
  return `
  <header class="top"><button class="ghost" data-act="ex-cancel">Back</button></header>
  <h1 class="page">${d.id ? 'Edit exercise' : 'New exercise'}</h1>
  <label class="fld"><span>Name</span><input type="text" value="${esc(d.name)}" data-act="exf-name" placeholder="e.g. Hack squat" autocomplete="off"></label>
  <p class="lbl">Muscle group</p>${chips('exf-group', GROUPS, d.group)}
  <p class="lbl">Equipment</p>${chips('exf-equip', Object.keys(EQUIP), d.equip, EQUIP)}
  <p class="lbl">What you log</p>${chips('exf-track', Object.keys(TRACKS), d.track, TRACKS)}
  <button class="toggle ${d.perSide ? 'on' : ''}" aria-pressed="${!!d.perSide}" data-act="exf-side"><span class="box" aria-hidden="true"></span><span>Each side (one arm or leg at a time)</span></button>
  ${isStation(d) ? '<p class="hint">Machines and cables get their weight stack from each gym\'s stations.</p>' : ''}
  ${used.length ? `<p class="hint">Used in ${used.map(esc).join(', ')}.</p>` : ''}
  <div class="end">
    <button class="primary big" data-act="ex-save">Save exercise</button>
    ${d.id && d.custom && !used.length ? `<button class="text-btn danger" data-act="ex-delete">${state.confirm === 'ex-delete' ? 'Tap again to delete' : 'Delete exercise'}</button>` : ''}
  </div>`;
}

// ---------- gym editor ----------
function gymEditScreen() {
  const g = state.gymDraft;
  const exName = (id) => esc(exOf(id).name);
  const stations = g.stations.map((st) => {
    const usedFor = Object.entries(g.use || {}).filter(([, s]) => s === st.id).map(([x]) => x);
    const vals = L.parseValues(st.stack);
    return `<div class="station" data-st="${st.id}">
      <label class="fld"><span>Name</span><input type="text" value="${esc(st.name)}" data-act="g-st-name" placeholder="e.g. Cable column, left" autocomplete="off"></label>
      <label class="fld"><span>Weight stack</span><input type="text" value="${esc(st.stack)}" data-act="g-st-stack" placeholder="e.g. 5-100/5 or 6.5, 12.5, 38.3" autocomplete="off"></label>
      <p class="preview-vals ${vals.length ? '' : 'warn'}">${esc(L.previewValues(vals))}</p>
      <p class="lbl small">Used for</p>
      <div class="chips">${usedFor.map((x) => `<button class="chip small" data-act="g-unuse" data-x="${x}" aria-label="Remove ${exName(x)} from this station">${exName(x)} ✕</button>`).join('')}<button class="chip small add" data-act="g-use" data-st="${st.id}">+ Exercise</button></div>
      <button class="text-btn danger small" data-act="g-st-del" data-st="${st.id}">Remove station</button>
    </div>`;
  }).join('');
  const isNew = !db.gyms.find((x) => x.id === g.id);
  return `
  <header class="top"><button class="ghost" data-act="g-cancel">Back</button></header>
  <h1 class="page">${isNew ? 'New gym' : 'Edit gym'}</h1>
  <label class="fld"><span>Name</span><input type="text" value="${esc(g.name)}" data-act="g-name" placeholder="e.g. Hotel gym" autocomplete="off"></label>
  <p class="lbl">Smallest barbell plate</p>
  <div class="seg small">${[1.25, 2.5].map((p) => `<button class="${g.plate === p ? 'on' : ''}" aria-pressed="${g.plate === p}" data-act="g-plate" data-v="${p}">${p} kg</button>`).join('')}</div>
  <p class="hint">The bar moves in ${L.fmtKg(g.plate * 2)} kg steps.</p>
  <label class="fld"><span>Dumbbells</span><input type="text" value="${esc(g.dumbbells)}" data-act="g-db" autocomplete="off"></label>
  <p class="preview-vals">${esc(L.previewValues(L.parseValues(g.dumbbells)))}</p>
  <label class="fld"><span>Kettlebells</span><input type="text" value="${esc(g.kettlebells)}" data-act="g-kb" autocomplete="off"></label>
  <p class="preview-vals">${esc(L.previewValues(L.parseValues(g.kettlebells)))}</p>
  <h2 class="sec">Machines and cable stations</h2>
  <p class="hint">Write a stack as a range, like 5-100/5 (5 to 100 in steps of 5), or list the numbers: 6.5, 12.5, 38.3. Use dots for decimals.</p>
  ${stations}
  <button class="ghost wide" data-act="g-st-add">Add a station</button>
  <div class="end">
    <button class="primary big" data-act="g-save">Save gym</button>
    ${!isNew && db.gyms.length > 1 ? `<button class="text-btn danger" data-act="g-delete">${state.confirm === 'g-delete' ? 'Tap again to delete this gym' : 'Delete gym'}</button>` : ''}
  </div>`;
}

// ---------- workout editor ----------
function estep(label, value, unit, attrs) {
  return `<div class="estep"><span class="estep-l">${label}</span><div class="field small">
    <button class="step" data-act="e-step" ${attrs} data-d="-1" aria-label="Less ${label.toLowerCase()}">−</button>
    <span class="val"><b>${value}</b>${unit ? `<small>${unit}</small>` : ''}</span>
    <button class="step" data-act="e-step" ${attrs} data-d="1" aria-label="More ${label.toLowerCase()}">+</button></div></div>`;
}

function doseSteppers(rx, ex, attrs) {
  if (rx.time != null) return estep('Time', rx.time, `sec${ex.perSide ? ' each side' : ''}`, `${attrs} data-f="time"`);
  if (rx.distance != null) return estep('Distance', rx.distance, 'metres', `${attrs} data-f="distance"`);
  if (rx.cal != null) return estep('Calories', rx.cal, 'cal', `${attrs} data-f="cal"`);
  return estep('Reps', rx.reps ?? 10, ex.perSide ? 'each side' : '', `${attrs} data-f="reps"`);
}

function editBlock(b, bi, count) {
  const ctrl = `<div class="e-ctrl">
    <button class="icon" data-act="e-up" data-b="${bi}" aria-label="Move up" ${bi === 0 ? 'disabled' : ''}>↑</button>
    <button class="icon" data-act="e-down" data-b="${bi}" aria-label="Move down" ${bi === count - 1 ? 'disabled' : ''}>↓</button>
    <button class="icon danger" data-act="e-del" data-b="${bi}" aria-label="Remove block">✕</button></div>`;
  if (b.type === 'straight') {
    const rx = b.items[0];
    const ex = exOf(rx.ex);
    const A = `data-b="${bi}" data-i="0"`;
    return `<section class="eblock">
      <header class="eb-h"><span class="letter">${letter(bi)}</span><button class="ex-pick" data-act="e-ex" ${A}>${esc(ex.name)}<span aria-hidden="true"> ▾</span></button>${ctrl}</header>
      <div class="egrid">
        ${estep('Sets', rx.sets ?? 3, '', `${A} data-f="sets"`)}
        ${doseSteppers(rx, ex, A)}
        ${estep('Rest', L.fmtRest(rx.rest ?? 90), '', `${A} data-f="rest"`)}
        ${ex.equip === 'barbell' ? estep('Warm-up sets', rx.warmups ?? 0, '', `${A} data-f="warmups"`) : ''}
      </div>
      <label class="fld inline"><span>Tempo for all sets</span><input type="text" value="${esc(rx.tempo || '')}" data-act="e-tempo" ${A} placeholder="none, or e.g. 3-0-3-0" maxlength="9" autocomplete="off"></label>
      <button class="chip small" data-act="e-add-ss" data-b="${bi}">+ Pair with another exercise (superset)</button>
    </section>`;
  }
  if (b.type === 'superset') {
    const items = b.items.map((rx, ii) => {
      const ex = exOf(rx.ex);
      const A = `data-b="${bi}" data-i="${ii}"`;
      return `<div class="ss-edit">
        <div class="eb-h sub"><span class="tag">${letter(bi)}${ii + 1}</span><button class="ex-pick" data-act="e-ex" ${A}>${esc(ex.name)}<span aria-hidden="true"> ▾</span></button><button class="icon danger" data-act="e-ss-del" ${A} aria-label="Remove from superset">✕</button></div>
        <div class="egrid">${doseSteppers(rx, ex, A)}</div>
        <label class="fld inline"><span>Tempo</span><input type="text" value="${esc(rx.tempo || '')}" data-act="e-tempo" ${A} placeholder="none" maxlength="9" autocomplete="off"></label>
      </div>`;
    }).join('');
    const B = `data-b="${bi}"`;
    return `<section class="eblock">
      <header class="eb-h"><span class="letter">${letter(bi)}</span><span class="eb-title">Superset</span>${ctrl}</header>
      <div class="egrid">${estep('Rounds', b.rounds, '', `${B} data-f="rounds"`)}${estep('Rest after round', L.fmtRest(b.rest ?? 90), '', `${B} data-f="rest"`)}</div>
      ${items}
      <button class="chip small" data-act="e-add-ss" ${B}>+ Add an exercise to this superset</button>
    </section>`;
  }
  const B = `data-b="${bi}"`;
  const types = { rounds: 'Rounds', emom: 'EMOM', amrap: 'AMRAP', fortime: 'For time' };
  let steppers = '';
  if (b.type === 'rounds') steppers = estep('Rounds', b.rounds, '', `${B} data-f="rounds"`) + estep('Rest', L.fmtRest(b.rest ?? 60), '', `${B} data-f="rest"`);
  if (b.type === 'emom' || b.type === 'amrap') steppers = estep('Minutes', b.minutes, '', `${B} data-f="minutes"`);
  if (b.type === 'fortime') steppers = estep('Rounds', b.rounds, '', `${B} data-f="rounds"`) + estep('Time cap', b.cap, 'min', `${B} data-f="cap"`);
  const moves = b.items.map((m, mi) => `<div class="move-edit" data-b="${bi}" data-m="${mi}">
    <input type="text" value="${esc(m.text)}" data-act="e-move" data-k="text" placeholder="Move, e.g. 12 kettlebell swings" aria-label="Move ${mi + 1}" autocomplete="off">
    <input type="text" value="${esc(m.detail || '')}" data-act="e-move" data-k="detail" placeholder="Detail, e.g. 20 kg" aria-label="Detail for move ${mi + 1}" autocomplete="off">
    <button class="icon danger" data-act="e-move-del" aria-label="Remove move">✕</button>
  </div>`).join('');
  return `<section class="eblock">
    <header class="eb-h"><span class="letter">${letter(bi)}</span><span class="eb-title">Circuit</span>${ctrl}</header>
    <div class="seg small four">${Object.entries(types).map(([k, v]) => `<button class="${b.type === k ? 'on' : ''}" aria-pressed="${b.type === k}" data-act="e-ctype" ${B} data-t="${k}">${v}</button>`).join('')}</div>
    <div class="egrid">${steppers}</div>
    ${moves}
    <button class="chip small" data-act="e-move-add" ${B}>+ Add a move</button>
  </section>`;
}

function editScreen() {
  const e = state.edit;
  const d = e.draft;
  const existing = e.id && db.workouts[e.id];
  return `
  <header class="top"><button class="ghost" data-act="e-cancel">Cancel</button><span class="hint">About ${L.estimateMinutes(d.blocks)} minutes</span></header>
  <label class="fld big"><span>Workout name</span><input type="text" value="${esc(d.name)}" data-act="e-name" placeholder="e.g. Back A" autocomplete="off"></label>
  <label class="fld"><span>Focus</span><input type="text" value="${esc(d.focus || '')}" data-act="e-focus" placeholder="e.g. Strength" autocomplete="off"></label>
  ${d.blocks.map((b, bi) => editBlock(b, bi, d.blocks.length)).join('')}
  <div class="add-row"><button class="ghost" data-act="e-add-ex">+ Exercise</button><button class="ghost" data-act="e-add-circuit">+ Circuit</button></div>
  <div class="end">
    <button class="primary big" data-act="e-save">${existing ? 'Save for every week' : 'Save workout'}</button>
    ${existing ? '<button class="ghost wide" data-act="e-today">Use for today only</button>' : ''}
    ${existing ? (e.saveAs
    ? `<div class="saveas"><label class="fld"><span>Name for the new workout</span><input type="text" value="${esc(e.newName)}" data-act="e-saveas-name" placeholder="e.g. Back B" autocomplete="off"></label><button class="primary wide" data-act="e-saveas-go">Save as new workout</button></div>`
    : '<button class="ghost wide" data-act="e-saveas">Save as a new workout (a variant)</button>') : ''}
    ${existing && db.order.length > 1 ? `<button class="text-btn danger" data-act="e-delete">${state.confirm === 'e-delete' ? 'Tap again to delete this workout' : 'Delete workout'}</button>` : ''}
  </div>`;
}

// ---------- overlays ----------
function renderRest() {
  const el = $('#rest');
  const r = state.rest;
  if (!r) { el.innerHTML = ''; el.className = ''; document.body.classList.remove('resting'); return; }
  document.body.classList.add('resting');
  const left = (r.endsAt - Date.now()) / 1000;
  if (state.restMin) {
    el.className = 'on min';
    el.innerHTML = `<button class="rest-bar" data-act="rest-max" aria-label="Show rest timer">Rest <b data-rest-time>${L.fmtTime(left)}</b></button>`;
    return;
  }
  el.className = 'on';
  el.innerHTML = `<div class="rest-panel" role="timer" aria-label="Rest timer">
    <div class="rest-head"><span>Rest</span><button class="text-btn small" data-act="rest-min">Hide</button></div>
    <b class="rest-time" data-rest-time>${L.fmtTime(left)}</b>
    ${r.next ? `<p class="rest-next">Next: ${esc(r.next)}</p>` : ''}
    <div class="rest-actions">
      <button class="ghost" data-act="rest-dec">−15 s</button>
      <button class="ghost" data-act="rest-inc">+15 s</button>
      <button class="primary" data-act="rest-skip">Skip</button>
    </div>
  </div>`;
}

function startRest(sec, next) {
  state.rest = { endsAt: Date.now() + sec * 1000, total: sec, next };
  state.restMin = false;
  renderRest();
}

let flashTimer = null;
function showFlash(title, sub) {
  const el = $('#flash');
  el.innerHTML = `<button class="flash-inner" data-act="flash-close"><span class="flash-title">${esc(title)}</span>${sub ? `<span class="flash-sub">${esc(sub)}</span>` : ''}<span class="flash-close">Tap to close</span></button>`;
  el.className = 'on';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.className = ''; }, 10000);
}

const QUIPS = ['The bar never stood a chance.', 'Chalk well spent.', 'Strong as.', 'Put that one on the fridge.', 'The plates felt that one.'];
let celebrateTimer = null;
function celebrate(name, setLine, hits) {
  const el = $('#celebrate');
  const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
  const plates = ['p25', 'p20', 'p15', 'p10'].map((c, i) => `<i class="${c}" style="--d:${i}"></i>`).join('');
  el.innerHTML = `<button class="cel-inner" data-act="cel-close">
    <span class="cel-bar" aria-hidden="true"><span class="cel-side l">${plates}</span><span class="cel-shaft"></span><span class="cel-side r">${plates}</span></span>
    <span class="cel-badge">New PR</span>
    <span class="cel-name">${esc(name)}</span>
    <span class="cel-set">${esc(setLine)}</span>
    <span class="cel-hits">${hits.map((h) => `<span>${esc(h.label)}: <b>${esc(h.value)}</b>${h.prev ? ` (was ${esc(h.prev)})` : ''}</span>`).join('')}</span>
    <span class="cel-quip">${quip}</span>
  </button>`;
  el.className = 'on';
  vibrate([80, 60, 80, 60, 260]);
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => { el.className = ''; }, 4200);
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'on';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

// Exercise picker, shared by swaps, editors and gym stations.
function pickListHtml(sh) {
  const q = (sh.q || '').toLowerCase().trim();
  let ids = Object.keys(db.exercises);
  if (sh.stationOnly) ids = ids.filter((id) => isStation(exOf(id)));
  if (q) ids = ids.filter((id) => exOf(id).name.toLowerCase().includes(q) || (exOf(id).group || '').toLowerCase().includes(q));
  const row = (id) => `<button class="pick" data-act="pick-ex" data-x="${id}"><span>${esc(exOf(id).name)}</span><small>${EQUIP[exOf(id).equip] || ''}</small></button>`;
  let html = '';
  if (sh.purpose === 'swap' && !q) {
    const it = state.session.blocks[sh.b].items[sh.i];
    const orig = it.from || it.exId;
    const sug = [...new Set([...(exOf(orig).alts || []), ...(it.from ? [orig] : []), ...Object.keys(db.exercises).filter((id) => exOf(id).group === exOf(orig).group)])].filter((id) => id !== it.exId && db.exercises[id]).slice(0, 8);
    if (sug.length) html += `<h3 class="grp">Same muscle group</h3>${sug.map(row).join('')}`;
  }
  html += GROUPS.map((g) => {
    const list = ids.filter((id) => (exOf(id).group || 'Other') === g).sort((a, b) => exOf(a).name.localeCompare(exOf(b).name));
    return list.length ? `<h3 class="grp">${g}</h3>${list.map(row).join('')}` : '';
  }).join('');
  return html || '<p class="hint">No match. Add it as a new exercise below.</p>';
}

function setSheet(sh) {
  const b = state.session.blocks[sh.b];
  const it = b.items[sh.i];
  const set = it.sets[sh.s];
  if (!set) return '';
  const ex = exOf(it.exId);
  const presets = ['3-0-3-0', '3-1-1-0', '2-0-2-0', '4-0-1-0', '3-0-1-0'];
  if (it.rx.tempo && !presets.includes(it.rx.tempo)) presets.unshift(it.rx.tempo);
  const custom = set.tempo && !presets.includes(set.tempo) ? set.tempo : '';
  const isSs = b.type === 'superset';
  const canRemove = !set.done && (isSs ? b.rounds > 1 : it.sets.length > 1);
  const types = { warmup: 'Warm-up', working: 'Working', drop: 'Drop', failure: 'To failure' };
  return `<h2>${isSs ? `Round ${sh.s + 1}` : 'Set options'}</h2>
    <p class="hint">${esc(ex.name)}</p>
    <p class="lbl">Tempo</p>
    <div class="chips"><button class="chip ${!set.tempo ? 'on' : ''}" data-act="so-tempo" data-v="">No tempo</button>${presets.map((p) => `<button class="chip ${set.tempo === p ? 'on' : ''}" aria-pressed="${set.tempo === p}" data-act="so-tempo" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <label class="fld"><span>Or type your own</span><input type="text" value="${esc(custom)}" data-act="so-tempo-in" placeholder="e.g. 4-1-2-0" maxlength="9" autocomplete="off"></label>
    ${ex.track === 'kgReps' || ex.track === 'reps' ? `<p class="lbl">Then reps to failure</p>
    <p class="hint">Say 5 reps on tempo, then 2 more to failure: log 5 reps on the set and 2 here.</p>
    <div class="field mid"><button class="step" data-act="so-extra" data-d="-1" aria-label="Fewer reps to failure">−</button><span class="val"><b>${set.extra || 0}</b><small>reps to failure</small></span><button class="step" data-act="so-extra" data-d="1" aria-label="More reps to failure">+</button></div>` : ''}
    <p class="lbl">Set type</p>
    <div class="chips">${Object.entries(types).map(([k, v]) => `<button class="chip ${set.type === k ? 'on' : ''}" aria-pressed="${set.type === k}" data-act="so-type" data-v="${k}">${v}</button>`).join('')}</div>
    <button class="ghost wide" data-act="so-later">Copy tempo and failure reps to the remaining sets</button>
    <button class="primary wide" data-act="sheet-close">Done</button>
    ${canRemove ? `<button class="text-btn danger" data-act="so-remove">${isSs ? 'Remove this round' : 'Remove this set'}</button>` : ''}`;
}

function stationSheet(sh) {
  const it = state.session.blocks[sh.b].items[sh.i];
  const gym = gymById(state.session.gymId);
  const ex = exOf(it.exId);
  const cur = gym.use?.[it.exId];
  return `<h2>Which station at ${esc(gym.name)}?</h2>
    <p class="hint">For ${esc(ex.name)}. The app remembers it for this gym.</p>
    <div class="opts">${gym.stations.map((st) => `<button class="opt ${cur === st.id ? 'on' : ''}" data-act="st-pick" data-st="${st.id}"><span class="o-name">${esc(st.name || 'Unnamed station')}</span><span class="o-focus">${esc(L.previewValues(L.parseValues(st.stack)))}</span></button>`).join('') || '<p class="hint">No stations set up here yet.</p>'}</div>
    <p class="lbl">Or add a new one</p>
    <label class="fld"><span>Name</span><input type="text" id="st-new-name" placeholder="e.g. Cable column, left" autocomplete="off"></label>
    <label class="fld"><span>Weight stack</span><input type="text" id="st-new-stack" placeholder="e.g. 5-100/5 or 6.5, 12.5, 38.3" autocomplete="off"></label>
    <button class="primary wide" data-act="st-create">Add station and use it</button>`;
}

function renderSheet() {
  const el = $('#sheet');
  const sh = state.sheet;
  if (!sh) { el.innerHTML = ''; el.className = ''; return; }
  let body = '';
  if (sh.kind === 'gym') {
    body = `<h2>Where are you training?</h2>
      <div class="opts">${db.gyms.map((g) => `<div class="gym-opt ${g.id === state.gymId ? 'on' : ''}">
        <button class="opt-main" data-act="setgym" data-g="${g.id}"><span class="o-name">${esc(g.name)}</span><span class="o-focus">${g.stations.length} station${g.stations.length === 1 ? '' : 's'}, kettlebells ${esc(L.previewValues(L.parseValues(g.kettlebells)))}</span></button>
        <button class="chip small" data-act="gym-edit" data-g="${g.id}">Edit</button></div>`).join('')}</div>
      <button class="ghost wide" data-act="gym-new">Add a gym</button>
      <p class="hint">Barbell and dumbbell numbers follow you everywhere. Cable and machine numbers stay with each gym.</p>`;
  } else if (sh.kind === 'pick') {
    const titles = { swap: 'Swap for today', 'add-ex-session': 'Add an exercise', 'edit-ex': 'Pick an exercise', 'edit-add-block': 'Add an exercise', 'edit-add-ss': 'Add to superset', 'gym-use': 'Which exercises use this station?' };
    body = `<h2>${titles[sh.purpose] || 'Pick an exercise'}</h2>
      ${sh.purpose === 'swap' ? '<p class="hint">Swaps last for this session only. Your programme stays the same.</p>' : ''}
      <div class="search"><input type="search" placeholder="Search" value="${esc(sh.q || '')}" data-act="pick-q" aria-label="Search exercises"></div>
      <div id="pick-list">${pickListHtml(sh)}</div>
      <button class="ghost wide" data-act="pick-new">Create a new exercise</button>`;
  } else if (sh.kind === 'set') {
    body = setSheet(sh);
  } else if (sh.kind === 'station') {
    body = stationSheet(sh);
  }
  el.className = 'on';
  el.innerHTML = `<div class="sheet-back" data-act="sheet-close"></div><div class="sheet-panel" role="dialog" aria-modal="true">${body}<button class="ghost wide" data-act="sheet-close">Close</button></div>`;
}

// ---------- render ----------
let lastScreen = null;
function renderScreen() {
  const views = {
    today: todayScreen, workout: workoutScreen, summary: summaryScreen, prs: prsScreen, detail: detailScreen, test: testScreen,
    exercises: exercisesScreen, 'ex-edit': exEditScreen, 'gym-edit': gymEditScreen, edit: editScreen,
  };
  const y = window.scrollY;
  $('#screen').innerHTML = views[state.screen]();
  document.body.dataset.screen = state.screen;
  if (lastScreen === state.screen) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastScreen = state.screen;
  tick();
}

// ---------- wake lock ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not allowed right now */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (state.session || state.test?.stage === 'run')) keepAwake(true);
});

// ---------- timers ----------
function finishCircuit(b, title, sub) {
  b.c.before = elapsedOf(b.c);
  b.c.status = 'done';
  vibrate([300, 120, 300]);
  showFlash(title, sub);
  persist();
  renderScreen();
}

function tick() {
  const now = Date.now();
  const started = state.screen === 'test' ? state.test?.startedAt : state.session?.startedAt;
  if (started) document.querySelectorAll('[data-elapsed]').forEach((el) => { el.textContent = L.fmtTime((now - started) / 1000); });
  if (state.rest) {
    const left = (state.rest.endsAt - now) / 1000;
    if (left <= 0) {
      const next = state.rest.next;
      state.rest = null;
      renderRest();
      vibrate([400, 150, 400]);
      showFlash("Rest's up", next ? `Next: ${next}` : 'Time for the next set');
    } else {
      document.querySelectorAll('[data-rest-time]').forEach((el) => { el.textContent = L.fmtTime(left); });
    }
  }
  if (state.screen !== 'workout') return;
  state.session?.blocks.forEach((b, bi) => {
    if (!b.c || b.c.status !== 'running') return;
    const d = b.def;
    const e = elapsedOf(b.c, now);
    if (b.type === 'emom') {
      if (e >= d.minutes * 60) { finishCircuit(b, 'EMOM done', `${d.minutes} minutes in the bank`); return; }
      const m = Math.floor(e / 60);
      if (m !== b.c.lastMinute) {
        if (b.c.lastMinute >= 0) {
          vibrate(250);
          const card = document.getElementById(`b${bi}`);
          card?.classList.remove('pulse'); void card?.offsetWidth; card?.classList.add('pulse');
        }
        b.c.lastMinute = m;
      }
    }
    if (b.type === 'amrap' && e >= d.minutes * 60) { finishCircuit(b, 'Time', 'Add any extra reps from the last round'); return; }
    if (b.type === 'fortime' && e >= d.cap * 60) { b.c.result = { time: d.cap * 60, capped: true }; finishCircuit(b, 'Time cap', `${b.c.rounds} of ${d.rounds} rounds done`); return; }
    const v = circuitView(b, now);
    const big = document.querySelector(`[data-cbig="${bi}"]`);
    const small = document.querySelector(`[data-csmall="${bi}"]`);
    if (big) big.textContent = v.big;
    if (small) small.textContent = v.small;
  });
}
setInterval(tick, 250);

// ---------- workout actions ----------
function setFromRow(row) {
  const { b, i, s } = row.dataset;
  const item = state.session.blocks[+b].items[+i];
  return { bi: +b, ii: +i, si: +s, item, set: item.sets[+s] };
}

function adjust(row, f, dir) {
  const { item, set, si } = setFromRow(row);
  if (f === 'kg') {
    const old = set.kg;
    set.kg = L.nudge(set.kg, dir, stepsOf(item.exId, state.session.gymId), item.hint?.kg);
    if (set.type === 'working') {
      for (const later of item.sets.slice(si + 1)) if (!later.done && later.type === 'working' && later.kg === old) later.kg = set.kg;
    }
  } else if (f === 'reps') set.reps = Math.max(0, (set.reps ?? 0) + dir);
  else if (f === 'time') set.time = Math.max(0, (set.time ?? 0) + dir * 5);
  else if (f === 'dist') set.dist = Math.max(0, (set.dist ?? 0) + dir * 10);
  else if (f === 'cal') set.cal = Math.max(0, (set.cal ?? 0) + dir);
  persist();
  renderScreen();
}

function onTick(row) {
  const { bi, ii, si, item, set } = setFromRow(row);
  const s = state.session;
  const b = s.blocks[bi];
  const ex = exOf(item.exId);
  if (set.done) { set.done = false; persist(); renderScreen(); return; }
  if ((ex.track === 'kgReps' || ex.track === 'kgDistance') && set.kg == null) { toast('Pick a weight first'); return; }
  if (ex.track === 'kgReps' && !set.reps) { toast('Add your reps first'); return; }
  set.done = true;
  vibrate(40);
  if (set.type !== 'warmup') {
    const hits = applyBest(s.bests, item.key, set, ex.track);
    if (hits.length) {
      s.prs.push({ key: item.key, exId: item.exId, name: ex.name, set: { kg: set.kg, reps: set.reps, extra: set.extra, time: set.time, dist: set.dist }, track: ex.track, hits });
      celebrate(ex.name, setText(set, ex.track), hits);
    }
  }
  const next = nextLabel(bi);
  if (b.type === 'straight') {
    const nextIsDrop = item.sets[si + 1]?.type === 'drop';
    if (!nextIsDrop && next) startRest(set.type === 'warmup' ? 90 : b.rest, next);
  } else if (b.type === 'superset') {
    if (ii === b.items.length - 1) { if (next) startRest(b.rest, next); } else toast(`Straight into ${letter(bi)}${ii + 2}: ${exOf(b.items[ii + 1].exId).name}`);
  }
  persist();
  renderScreen();
}

function onSetInput(el) {
  const raw = el.value.replace(',', '.').trim();
  const num = raw === '' ? null : Number(raw);
  if (raw !== '' && Number.isNaN(num)) { toast('Numbers only'); renderScreen(); return; }
  const row = el.closest('.set');
  const f = el.closest('.field').dataset.f;
  const { set, item, si } = setFromRow(row);
  if (f === 'kg') {
    const old = set.kg;
    set.kg = num;
    if (set.type === 'working') for (const later of item.sets.slice(si + 1)) if (!later.done && later.type === 'working' && later.kg === old) later.kg = num;
  } else set[f] = num == null ? null : Math.round(num);
  persist();
  renderScreen();
}

function startWorkout(tpl, workoutId, changed = false) {
  state.session = buildSession(tpl, workoutId, state.gymId);
  state.session.changed = changed;
  state.screen = 'workout';
  state.pick = null;
  keepAwake(true);
  persist();
  renderScreen();
}

function saveSession() {
  const s = state.session;
  const sessions = store.get('sessions', []);
  sessions.push({ id: s.id, workoutId: s.workoutId, gymId: s.gymId, startedAt: s.startedAt, endedAt: s.endedAt, feel: s.feel, stats: sessionStats(s), prs: s.prs.length });
  store.set('sessions', sessions.slice(-60));
  const saved = store.get('prs', []);
  const date = new Date().toISOString().slice(0, 10);
  for (const p of s.prs) saved.push({ key: p.key, set: p.set, track: p.track, date });
  store.set('prs', saved);
  for (const b of s.blocks) {
    for (const it of b.items || []) {
      const done = it.sets.filter((x) => x.done && (x.type === 'working' || x.type === 'failure'));
      if (done.length) lastMap[it.key] = done.map(({ kg, reps, extra, time, dist, cal }) => ({ kg, reps, extra, time, dist, cal }));
    }
  }
  store.set('last', lastMap);
  if (s.keep && db.workouts[s.workoutId]) { db.workouts[s.workoutId] = sessionToTemplate(s, db.workouts[s.workoutId]); saveDb(); }
  store.set('lastWorkout', s.workoutId);
  state.bests = clone(s.bests);
  state.session = null;
  state.rest = null;
  renderRest();
  keepAwake(false);
  persist();
  state.screen = 'today';
  renderScreen();
  toast(s.keep ? 'Saved, and the workout is updated for next time' : 'Session saved on this phone');
}

// ---------- picker results ----------
function pickExercise(x, sh) {
  const s = state.session;
  switch (sh.purpose) {
    case 'swap': {
      const block = s.blocks[sh.b];
      const old = block.items[sh.i];
      const orig = old.from || old.exId;
      const sameTrack = exOf(x).track === exOf(old.exId).track;
      const base = sameTrack ? { ...old.rx, ex: x } : { ...defaultRx(x), sets: old.rx.sets, rest: old.rx.rest };
      const fresh = buildItem(base, s.gymId, block.type === 'superset' ? block.rounds : undefined);
      fresh.from = x === orig ? null : orig;
      block.items[sh.i] = fresh;
      s.changed = true;
      persist();
      toast(fresh.from ? `Swapped to ${exOf(x).name} for today` : 'Back to the plan');
      break;
    }
    case 'add-ex-session': {
      const rx = defaultRx(x);
      s.blocks.push({ type: 'straight', rest: rx.rest, items: [buildItem(rx, s.gymId)] });
      s.changed = true;
      persist();
      toast(`${exOf(x).name} added at the end`);
      break;
    }
    case 'edit-ex': {
      const b = state.edit.draft.blocks[sh.b];
      const old = b.items[sh.i];
      const sameTrack = exOf(x).track === exOf(old.ex).track;
      b.items[sh.i] = sameTrack ? { ...old, ex: x } : (b.type === 'superset' ? doseOnly(defaultRx(x)) : { ...defaultRx(x), sets: old.sets, rest: old.rest });
      break;
    }
    case 'edit-add-block':
      state.edit.draft.blocks.push({ type: 'straight', items: [defaultRx(x)] });
      break;
    case 'edit-add-ss': {
      const blocks = state.edit.draft.blocks;
      const b = blocks[sh.b];
      if (b.type === 'straight') {
        const it = b.items[0];
        blocks[sh.b] = { type: 'superset', rounds: it.sets || 3, rest: it.rest ?? 90, items: [doseOnly(it), doseOnly(defaultRx(x))] };
      } else b.items.push(doseOnly(defaultRx(x)));
      break;
    }
    case 'gym-use':
      state.gymDraft.use ||= {};
      state.gymDraft.use[x] = sh.st;
      break;
    default: break;
  }
  state.sheet = null;
  renderSheet();
  renderScreen();
}

function openPicker(purpose, extra = {}) {
  state.sheet = { kind: 'pick', purpose, q: '', ...extra };
  renderSheet();
}

// ---------- editor helpers ----------
const ESTEP = { sets: [1, 1, 20], reps: [1, 1, 100], time: [5, 5, 600], distance: [10, 10, 5000], cal: [1, 1, 200], rest: [15, 0, 600], warmups: [1, 0, 3], rounds: [1, 1, 20], minutes: [1, 1, 60], cap: [1, 1, 60] };
function editStep(el) {
  const d = state.edit.draft;
  const b = d.blocks[+el.dataset.b];
  const target = el.dataset.i != null ? b.items[+el.dataset.i] : b;
  const f = el.dataset.f;
  const [step, min, max] = ESTEP[f];
  const fallback = { sets: 3, reps: 10, rest: 90, warmups: 0, rounds: 3, minutes: 10, cap: 12 }[f] ?? 0;
  target[f] = Math.min(max, Math.max(min, (target[f] ?? fallback) + Number(el.dataset.d) * step));
  renderScreen();
}

function openEditor(id, draft) {
  state.edit = { id, draft: clone(draft), saveAs: false, newName: '' };
  state.screen = 'edit';
  renderScreen();
}

function cleanDraft(d) {
  for (const b of d.blocks) if (b.items && !['straight', 'superset'].includes(b.type)) b.items = b.items.filter((m) => (m.text || '').trim());
  d.blocks = d.blocks.filter((b) => b.items?.length);
  d.name = (d.name || '').trim();
  return d;
}

function newId(name, taken) {
  const base = L.slug(name);
  let id = base; let n = 2;
  while (taken[id]) id = `${base}-${n++}`;
  return id;
}

// ---------- the action switchboard ----------
function onAction(el) {
  const act = el.dataset.act;
  const row = el.closest('.set');
  const s = state.session;
  const keepConfirm = ['discard', 'test-discard', 'e-delete', 'g-delete', 'ex-delete'];
  if (!keepConfirm.includes(act) && state.confirm) state.confirm = null;
  switch (act) {
    // navigation and gyms
    case 'nav': state.screen = el.dataset.to; renderScreen(); break;
    case 'gym': state.sheet = { kind: 'gym' }; renderSheet(); break;
    case 'setgym': state.gymId = el.dataset.g; store.set('gym', state.gymId); state.sheet = null; renderSheet(); renderScreen(); break;
    case 'gym-edit': state.gymDraft = clone(gymById(el.dataset.g)); state.back = state.screen; state.sheet = null; renderSheet(); state.screen = 'gym-edit'; renderScreen(); break;
    case 'gym-new': state.gymDraft = { id: uid('g'), name: '', plate: 1.25, dumbbells: '1-10/1, 12-50/2', kettlebells: '8, 12, 16, 20, 24', stations: [], use: {} }; state.back = state.screen; state.sheet = null; renderSheet(); state.screen = 'gym-edit'; renderScreen(); break;
    case 'sheet-close': state.sheet = null; renderSheet(); break;
    case 'pick': state.pick = el.dataset.w; renderScreen(); break;
    case 'start': startWorkout(db.workouts[el.dataset.w], el.dataset.w); break;
    case 'edit': openEditor(el.dataset.w, db.workouts[el.dataset.w]); break;
    case 'new-workout': openEditor(null, { name: '', focus: '', blocks: [] }); break;

    // logging
    case 'inc': adjust(row, el.closest('.field').dataset.f, 1); break;
    case 'dec': adjust(row, el.closest('.field').dataset.f, -1); break;
    case 'tick': onTick(row); break;
    case 'setopts': { const r = el.closest('.set'); state.sheet = { kind: 'set', b: +r.dataset.b, i: +r.dataset.i, s: +r.dataset.s }; renderSheet(); break; }
    case 'add-set': {
      const it = s.blocks[+el.dataset.b].items[0];
      const src = [...it.sets].reverse().find((x) => x.type !== 'warmup') || it.sets[it.sets.length - 1];
      it.sets.push(newSet('working', { ...src, extra: 0 }));
      s.changed = true; persist(); renderScreen(); break;
    }
    case 'drop': {
      const it = s.blocks[+el.dataset.b].items[0];
      const prev = it.sets[it.sets.length - 1];
      const steps = stepsOf(it.exId, s.gymId);
      let kg = prev.kg != null ? L.snap(prev.kg * 0.8, steps, 'down') : null;
      if (kg != null && kg >= prev.kg) kg = L.nudge(prev.kg, -1, steps);
      it.sets.push(newSet('drop', { kg, reps: prev.reps, tempo: null }));
      persist(); renderScreen(); break;
    }
    case 'add-round': {
      const b = s.blocks[+el.dataset.b];
      b.rounds += 1;
      for (const it of b.items) { const src = it.sets[it.sets.length - 1]; it.sets.push(newSet('working', { ...src, extra: 0 })); }
      s.changed = true; persist(); renderScreen(); break;
    }
    case 'add-ex': openPicker('add-ex-session'); break;
    case 'swap': openPicker('swap', { b: +el.dataset.b, i: +el.dataset.i }); break;
    case 'station': state.sheet = { kind: 'station', b: +el.dataset.b, i: +el.dataset.i }; renderSheet(); break;
    case 'st-pick': {
      const sh = state.sheet; const it = s.blocks[sh.b].items[sh.i]; const gym = gymById(s.gymId);
      gym.use ||= {}; gym.use[it.exId] = el.dataset.st; saveDb();
      state.sheet = null; renderSheet(); renderScreen(); toast('Station saved for this gym'); break;
    }
    case 'st-create': {
      const name = $('#st-new-name').value.trim(); const stack = $('#st-new-stack').value.trim();
      if (!name || !L.parseValues(stack).length) { toast('Add a name and a weight stack'); break; }
      const sh = state.sheet; const it = s.blocks[sh.b].items[sh.i]; const gym = gymById(s.gymId);
      const st = { id: uid('s'), name, stack };
      gym.stations.push(st); gym.use ||= {}; gym.use[it.exId] = st.id; saveDb();
      state.sheet = null; renderSheet(); renderScreen(); toast(`${name} added to ${gym.name}`); break;
    }

    // set options
    case 'so-tempo': { const sh = state.sheet; s.blocks[sh.b].items[sh.i].sets[sh.s].tempo = el.dataset.v || null; persist(); renderScreen(); renderSheet(); break; }
    case 'so-extra': { const sh = state.sheet; const set = s.blocks[sh.b].items[sh.i].sets[sh.s]; set.extra = Math.max(0, (set.extra || 0) + Number(el.dataset.d)); persist(); renderScreen(); renderSheet(); break; }
    case 'so-type': { const sh = state.sheet; s.blocks[sh.b].items[sh.i].sets[sh.s].type = el.dataset.v; persist(); renderScreen(); renderSheet(); break; }
    case 'so-later': {
      const sh = state.sheet; const it = s.blocks[sh.b].items[sh.i]; const src = it.sets[sh.s];
      let n = 0;
      for (const later of it.sets.slice(sh.s + 1)) if (!later.done && later.type !== 'warmup') { later.tempo = src.tempo; later.extra = src.extra; n += 1; }
      persist(); renderScreen(); toast(n ? `Copied to ${n} more set${n > 1 ? 's' : ''}` : 'No sets left to copy to'); break;
    }
    case 'so-remove': {
      const sh = state.sheet; const b = s.blocks[sh.b];
      if (b.type === 'superset') { for (const it of b.items) it.sets.splice(sh.s, 1); b.rounds -= 1; } else b.items[sh.i].sets.splice(sh.s, 1);
      s.changed = true; state.sheet = null; renderSheet(); persist(); renderScreen(); break;
    }

    // circuits
    case 'cstart': { const c = s.blocks[+el.dataset.b].c; c.status = 'running'; c.startedAt = Date.now(); vibrate(60); persist(); renderScreen(); break; }
    case 'cpause': { const c = s.blocks[+el.dataset.b].c; c.before = elapsedOf(c); c.status = 'paused'; persist(); renderScreen(); break; }
    case 'cend': {
      const b = s.blocks[+el.dataset.b];
      if (b.type === 'fortime') b.c.result = { time: elapsedOf(b.c), capped: b.c.rounds < b.def.rounds };
      b.c.status = 'done'; persist(); renderScreen(); break;
    }
    case 'creset': s.blocks[+el.dataset.b].c = freshCircuit(); persist(); renderScreen(); break;
    case 'cextra': { const c = s.blocks[+el.dataset.b].c; c.extra = Math.max(0, c.extra + Number(el.dataset.d)); persist(); renderScreen(); break; }
    case 'cround': {
      const bi = +el.dataset.b; const b = s.blocks[bi]; const c = b.c; const d = b.def;
      c.rounds += 1; vibrate(40);
      if (b.type === 'fortime' && c.rounds >= d.rounds) { c.result = { time: elapsedOf(c), capped: false }; finishCircuit(b, 'Done', `${d.rounds} rounds in ${L.fmtTime(c.result.time)}`); break; }
      if (b.type === 'rounds') {
        if (c.rounds < d.rounds) startRest(d.rest, `Round ${c.rounds + 1} of ${d.rounds}`);
        else { c.status = 'done'; const next = nextLabel(bi + 1); if (next) startRest(60, next); }
      }
      persist(); renderScreen(); break;
    }

    // finishing
    case 'finish': s.endedAt = Date.now(); state.rest = null; renderRest(); persist(); state.screen = 'summary'; renderScreen(); break;
    case 'resume': s.endedAt = null; persist(); state.screen = 'workout'; renderScreen(); break;
    case 'feel': s.feel = Number(el.dataset.v); persist(); renderScreen(); break;
    case 'keep': s.keep = !s.keep; persist(); renderScreen(); break;
    case 'save': saveSession(); break;
    case 'discard':
      if (state.confirm !== 'discard') { state.confirm = 'discard'; renderScreen(); break; }
      state.confirm = null; state.session = null; state.rest = null; renderRest(); keepAwake(false); persist(); state.screen = 'today'; renderScreen(); toast('Workout discarded'); break;
    case 'rest-dec': state.rest.endsAt -= 15000; tick(); break;
    case 'rest-inc': state.rest.endsAt += 15000; tick(); break;
    case 'rest-skip': state.rest = null; renderRest(); break;
    case 'rest-min': state.restMin = true; renderRest(); break;
    case 'rest-max': state.restMin = false; renderRest(); break;
    case 'flash-close': $('#flash').className = ''; break;
    case 'cel-close': $('#celebrate').className = ''; break;
    case 'detail': state.detail = el.dataset.k; state.screen = 'detail'; renderScreen(); break;

    // picker
    case 'pick-ex': pickExercise(el.dataset.x, state.sheet); break;
    case 'pick-new': {
      state.pending = { sheet: clone(state.sheet), screen: state.screen };
      state.exDraft = { id: null, name: state.sheet.q || '', group: 'Other', equip: state.sheet.stationOnly ? 'cable' : 'dumbbell', track: 'kgReps', perSide: false, custom: true };
      state.sheet = null; renderSheet(); state.screen = 'ex-edit'; renderScreen(); break;
    }

    // exercise library
    case 'ex-new': state.pending = null; state.exDraft = { id: null, name: '', group: 'Quads', equip: 'barbell', track: 'kgReps', perSide: false, custom: true }; state.screen = 'ex-edit'; renderScreen(); break;
    case 'ex-open': state.pending = null; state.exDraft = { id: el.dataset.x, ...clone(db.exercises[el.dataset.x]) }; state.screen = 'ex-edit'; renderScreen(); break;
    case 'exf-group': state.exDraft.group = el.dataset.v; renderScreen(); break;
    case 'exf-equip': state.exDraft.equip = el.dataset.v; renderScreen(); break;
    case 'exf-track': state.exDraft.track = el.dataset.v; renderScreen(); break;
    case 'exf-side': state.exDraft.perSide = !state.exDraft.perSide; renderScreen(); break;
    case 'ex-cancel': {
      const p = state.pending; state.pending = null;
      state.screen = p ? p.screen : 'exercises'; renderScreen();
      if (p) { state.sheet = p.sheet; renderSheet(); }
      break;
    }
    case 'ex-save': {
      const d = state.exDraft;
      if (!d.name.trim()) { toast('Give the exercise a name'); break; }
      const id = d.id || newId(d.name, db.exercises);
      const { id: _drop, ...rest } = d; void _drop;
      db.exercises[id] = { ...rest, name: d.name.trim() };
      saveDb();
      const p = state.pending; state.pending = null;
      if (p) { state.screen = p.screen; renderScreen(); pickExercise(id, p.sheet); }
      else { state.screen = 'exercises'; renderScreen(); }
      toast(`${d.name.trim()} saved`);
      break;
    }
    case 'ex-delete':
      if (state.confirm !== 'ex-delete') { state.confirm = 'ex-delete'; renderScreen(); break; }
      state.confirm = null; delete db.exercises[state.exDraft.id]; saveDb(); state.screen = 'exercises'; renderScreen(); toast('Exercise deleted'); break;

    // gym editor
    case 'g-plate': state.gymDraft.plate = Number(el.dataset.v); renderScreen(); break;
    case 'g-st-add': state.gymDraft.stations.push({ id: uid('s'), name: '', stack: '' }); renderScreen(); break;
    case 'g-st-del': {
      const id = el.dataset.st; const g = state.gymDraft;
      g.stations = g.stations.filter((x) => x.id !== id);
      for (const [x, st] of Object.entries(g.use || {})) if (st === id) delete g.use[x];
      renderScreen(); break;
    }
    case 'g-use': openPicker('gym-use', { st: el.dataset.st, stationOnly: true }); break;
    case 'g-unuse': delete state.gymDraft.use[el.dataset.x]; renderScreen(); break;
    case 'g-cancel': state.gymDraft = null; state.screen = state.back || 'today'; renderScreen(); break;
    case 'g-save': {
      const g = state.gymDraft;
      if (!g.name.trim()) { toast('Give the gym a name'); break; }
      g.name = g.name.trim();
      g.stations = g.stations.filter((st) => st.name.trim() || st.stack.trim());
      const i = db.gyms.findIndex((x) => x.id === g.id);
      if (i >= 0) db.gyms[i] = g; else { db.gyms.push(g); state.gymId = g.id; store.set('gym', g.id); }
      saveDb(); state.gymDraft = null; state.screen = state.back || 'today'; renderScreen(); toast(`${g.name} saved`); break;
    }
    case 'g-delete': {
      if (state.confirm !== 'g-delete') { state.confirm = 'g-delete'; renderScreen(); break; }
      state.confirm = null;
      db.gyms = db.gyms.filter((x) => x.id !== state.gymDraft.id);
      if (state.gymId === state.gymDraft.id) { state.gymId = db.gyms[0].id; store.set('gym', state.gymId); }
      saveDb(); state.gymDraft = null; state.screen = state.back || 'today'; renderScreen(); toast('Gym deleted'); break;
    }

    // workout editor
    case 'e-cancel': state.edit = null; state.screen = 'today'; renderScreen(); break;
    case 'e-step': editStep(el); break;
    case 'e-up': case 'e-down': {
      const bl = state.edit.draft.blocks; const i = +el.dataset.b; const j = act === 'e-up' ? i - 1 : i + 1;
      if (j >= 0 && j < bl.length) [bl[i], bl[j]] = [bl[j], bl[i]];
      renderScreen(); break;
    }
    case 'e-del': state.edit.draft.blocks.splice(+el.dataset.b, 1); renderScreen(); break;
    case 'e-ex': openPicker('edit-ex', { b: +el.dataset.b, i: +el.dataset.i }); break;
    case 'e-add-ex': openPicker('edit-add-block'); break;
    case 'e-add-ss': openPicker('edit-add-ss', { b: +el.dataset.b }); break;
    case 'e-ss-del': {
      const blocks = state.edit.draft.blocks; const b = blocks[+el.dataset.b];
      b.items.splice(+el.dataset.i, 1);
      if (b.items.length === 1) blocks[+el.dataset.b] = { type: 'straight', items: [{ ...b.items[0], sets: b.rounds, rest: b.rest }] };
      renderScreen(); break;
    }
    case 'e-add-circuit': state.edit.draft.blocks.push({ type: 'rounds', rounds: 3, rest: 60, items: [{ text: '', detail: '' }] }); renderScreen(); break;
    case 'e-ctype': {
      const b = state.edit.draft.blocks[+el.dataset.b]; const t = el.dataset.t;
      b.type = t;
      if (t === 'emom' || t === 'amrap') b.minutes ||= t === 'emom' ? 8 : 12;
      if (t === 'fortime') { b.rounds ||= 4; b.cap ||= 14; }
      if (t === 'rounds') { b.rounds ||= 3; b.rest ??= 60; }
      renderScreen(); break;
    }
    case 'e-move-add': state.edit.draft.blocks[+el.dataset.b].items.push({ text: '', detail: '' }); renderScreen(); break;
    case 'e-move-del': { const r = el.closest('.move-edit'); state.edit.draft.blocks[+r.dataset.b].items.splice(+r.dataset.m, 1); renderScreen(); break; }
    case 'e-save': {
      const e = state.edit; const d = cleanDraft(e.draft);
      if (!d.name) { toast('Give the workout a name'); renderScreen(); break; }
      if (!d.blocks.length) { toast('Add at least one exercise or circuit'); renderScreen(); break; }
      const id = e.id || newId(d.name, db.workouts);
      db.workouts[id] = d;
      if (!db.order.includes(id)) db.order.push(id);
      saveDb(); state.edit = null; state.pick = id; state.screen = 'today'; renderScreen();
      toast(e.id ? 'Saved. Next time it looks like this.' : `${d.name} saved`);
      break;
    }
    case 'e-today': {
      const e = state.edit; const d = cleanDraft(e.draft);
      if (!d.blocks.length) { toast('Add at least one exercise or circuit'); break; }
      state.edit = null; startWorkout(d, e.id, true); break;
    }
    case 'e-saveas': state.edit.saveAs = true; state.edit.newName = `${state.edit.draft.name} B`; renderScreen(); break;
    case 'e-saveas-go': {
      const e = state.edit; const name = (e.newName || '').trim();
      if (!name) { toast('Give the new workout a name'); break; }
      if (Object.values(db.workouts).some((w) => w.name.toLowerCase() === name.toLowerCase())) { toast(`There's already a workout called ${name}`); break; }
      const d = cleanDraft({ ...clone(e.draft), name });
      const id = newId(name, db.workouts);
      db.workouts[id] = d;
      db.order.splice(db.order.indexOf(e.id) + 1, 0, id);
      saveDb(); state.edit = null; state.pick = id; state.screen = 'today'; renderScreen(); toast(`Saved as ${name}`); break;
    }
    case 'e-delete': {
      if (state.confirm !== 'e-delete') { state.confirm = 'e-delete'; renderScreen(); break; }
      state.confirm = null; const id = state.edit.id;
      delete db.workouts[id]; db.order = db.order.filter((x) => x !== id);
      saveDb(); state.edit = null; state.pick = null; state.screen = 'today'; renderScreen(); toast('Workout deleted'); break;
    }

    // PR session
    case 'test-setup': state.test = { v: 2, stage: 'setup', lifts: ['squat', 'bench'], reps: 1 }; state.screen = 'test'; persist(); renderScreen(); break;
    case 'test-cancel': state.test = null; persist(); state.screen = 'prs'; renderScreen(); break;
    case 'test-discard':
      if (state.confirm !== 'test-discard') { state.confirm = 'test-discard'; renderScreen(); break; }
      state.confirm = null; state.test = null; state.rest = null; renderRest(); keepAwake(false); persist(); state.screen = 'prs'; renderScreen(); toast('PR session discarded'); break;
    case 'tlift': {
      const k = el.dataset.k; const t = state.test;
      t.lifts = t.lifts.includes(k) ? t.lifts.filter((x) => x !== k) : TEST_LIFTS.filter((x) => x === k || t.lifts.includes(x));
      persist(); renderScreen(); break;
    }
    case 'treps': state.test.reps = Number(el.dataset.r); persist(); renderScreen(); break;
    case 'test-plan': {
      const t = state.test;
      t.gymId = state.gymId; t.cur = 0; t.stage = 'run'; t.startedAt = Date.now(); t.bests = clone(state.bests);
      t.plans = t.lifts.map((k) => ({ key: k, ...L.testPlan(state.bests[k], t.reps, stepsOf(k, t.gymId)) }));
      keepAwake(true); persist(); renderScreen(); break;
    }
    case 'tgo': state.test.cur = Number(el.dataset.l); persist(); renderScreen(); break;
    case 'tramp': {
      const r = el.closest('.set'); const p = state.test.plans[+r.dataset.l]; const w = p.ramp[+r.dataset.r];
      w.done = !w.done;
      if (w.done) { vibrate(40); const nxt = p.ramp.find((x) => !x.done); startRest(nxt ? 120 : 180, nxt ? `Warm-up ${L.fmtKg(nxt.kg)} kg × ${nxt.reps}` : `${p.attempts[0].label}, ${L.fmtKg(p.attempts[0].kg)} kg`); }
      persist(); renderScreen(); break;
    }
    case 'tinc': case 'tdec': {
      const at = el.closest('.attempt'); const p = state.test.plans[+at.dataset.l]; const a = p.attempts[+at.dataset.a];
      a.kg = L.nudge(a.kg, act === 'tinc' ? 1 : -1, stepsOf(p.key, state.test.gymId));
      persist(); renderScreen(); break;
    }
    case 'tmade': case 'tmiss': {
      const plan = state.test.plans[+el.dataset.l]; const ai = +el.dataset.a; const a = plan.attempts[ai]; const t = state.test;
      a.result = act === 'tmade' ? 'made' : 'missed';
      const next = plan.attempts[ai + 1];
      const steps = stepsOf(plan.key, t.gymId);
      if (a.result === 'made') {
        vibrate(40);
        const hits = applyBest(t.bests, plan.key, { kg: a.kg, reps: t.reps }, 'kgReps');
        if (hits.length) celebrate(exOf(plan.key).name, `${L.fmtKg(a.kg)} kg × ${t.reps}`, hits);
        if (next && !next.result && next.kg <= a.kg) next.kg = L.nudge(a.kg, 1, steps);
      } else if (next && !next.result) {
        next.kg = a.kg;
        toast('Next attempt set to the same weight. Lower it if that one was a grinder.');
      }
      if (next && !next.result) startRest(240, `${next.label}, ${L.fmtKg(next.kg)} kg`);
      persist(); renderScreen(); break;
    }
    case 'tundo': { const plan = state.test.plans[+el.dataset.l]; plan.attempts[+el.dataset.a].result = null; persist(); renderScreen(); break; }
    case 'tnext': state.test.cur += 1; state.rest = null; renderRest(); persist(); renderScreen(); break;
    case 'tfinish': state.test.stage = 'done'; state.rest = null; renderRest(); persist(); renderScreen(); break;
    case 'test-back': state.test.stage = 'run'; persist(); renderScreen(); break;
    case 'test-save': {
      const t = state.test; const date = new Date().toISOString().slice(0, 10);
      const tested = store.get('tested', []); const saved = store.get('prs', []);
      for (const p of t.plans) {
        const made = p.attempts.filter((a) => a.result === 'made').map((a) => a.kg);
        if (!made.length) continue;
        const kg = Math.max(...made);
        tested.push({ key: p.key, d: date, kg, reps: t.reps });
        saved.push({ key: p.key, set: { kg, reps: t.reps }, track: 'kgReps', date });
      }
      store.set('tested', tested); store.set('prs', saved);
      state.bests = loadBests(); state.test = null; keepAwake(false); persist();
      state.screen = 'prs'; renderScreen(); toast('PR session saved'); break;
    }
    default: break;
  }
}

// Text inputs: some update quietly as you type, others re-render when you leave the field.
function onTyping(el) {
  const act = el.dataset.act;
  const v = el.value;
  switch (act) {
    case 'pick-q': state.sheet.q = v; $('#pick-list').innerHTML = pickListHtml(state.sheet); break;
    case 'lib-q': state.libQ = v; $('#lib-list').innerHTML = libListHtml(v); break;
    case 'exf-name': state.exDraft.name = v; break;
    case 'e-name': state.edit.draft.name = v; break;
    case 'e-focus': state.edit.draft.focus = v; break;
    case 'e-saveas-name': state.edit.newName = v; break;
    case 'e-tempo': { const rx = state.edit.draft.blocks[+el.dataset.b].items[+el.dataset.i]; const t = v.trim(); if (t) rx.tempo = t; else delete rx.tempo; break; }
    case 'e-move': { const r = el.closest('.move-edit'); state.edit.draft.blocks[+r.dataset.b].items[+r.dataset.m][el.dataset.k] = v; break; }
    case 'g-name': state.gymDraft.name = v; break;
    case 'g-db': state.gymDraft.dumbbells = v; break;
    case 'g-kb': state.gymDraft.kettlebells = v; break;
    case 'g-st-name': state.gymDraft.stations.find((x) => x.id === el.closest('.station').dataset.st).name = v; break;
    case 'g-st-stack': state.gymDraft.stations.find((x) => x.id === el.closest('.station').dataset.st).stack = v; break;
    default: break;
  }
}

function onChange(el) {
  const act = el.dataset.act;
  if (act === 'input') { onSetInput(el); return; }
  if (act === 'tinput') {
    const at = el.closest('.attempt');
    const num = Number(el.value.replace(',', '.'));
    if (Number.isFinite(num)) state.test.plans[+at.dataset.l].attempts[+at.dataset.a].kg = num;
    persist(); renderScreen(); return;
  }
  if (act === 'so-tempo-in') {
    const sh = state.sheet; const t = el.value.trim();
    state.session.blocks[sh.b].items[sh.i].sets[sh.s].tempo = t || null;
    persist(); renderScreen(); renderSheet(); return;
  }
  if (['g-db', 'g-kb', 'g-st-stack'].includes(act)) renderScreen();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.tagName === 'INPUT') return;
  onAction(el);
});
document.addEventListener('input', (e) => { if (e.target.dataset?.act) onTyping(e.target); });
document.addEventListener('change', (e) => { if (e.target.dataset?.act) onChange(e.target); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.sheet) { state.sheet = null; renderSheet(); }
    $('#flash').className = ''; $('#celebrate').className = '';
  }
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'search') e.target.blur();
});

// ---------- boot ----------
if (state.session || state.test?.stage === 'run') keepAwake(true);
renderScreen();
renderRest();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline install not available */ });
}
