import { BLOCK, GYMS, EXERCISES, WORKOUTS, ROTATION, LAST, BEST, SERIES, MAIN_LIFTS, WEEKLY } from './data.js';
import * as L from './logic.js';

const VERSION = 'prototype 0.1';

// ---------- small helpers ----------
const $ = (sel) => document.querySelector(sel);
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const letter = (i) => 'ABCDEFGH'[i];
const gymById = (id) => GYMS.find((g) => g.id === id) || GYMS[0];
const histKey = (exId, gymId) => (EXERCISES[exId].equip === 'machine' ? `${exId}@${gymId}` : exId);
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };
const shortDate = (d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

const store = {
  get(k, d) { try { const v = localStorage.getItem(`repsheet.${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`repsheet.${k}`, JSON.stringify(v)); } catch { /* storage off */ } },
  del(k) { try { localStorage.removeItem(`repsheet.${k}`); } catch { /* storage off */ } },
};

// ---------- bests and PRs ----------
const REP_MARKS = [1, 3, 5, 8, 10];

function applyBest(bests, key, s, track) {
  const hits = [];
  const b = bests[key] || (bests[key] = { e1rm: 0, heaviest: null, repMax: {} });
  b.repMax ||= {};
  const had = !!(b.e1rm || b.time);
  if (track === 'kgReps' && s.kg && s.reps) {
    const e = L.e1rm(s.kg, s.reps);
    if (s.kg > (b.heaviest?.kg ?? 0)) {
      if (had && b.heaviest) hits.push({ label: 'Heaviest ever', value: `${L.fmtKg(s.kg)} kg`, prev: `${L.fmtKg(b.heaviest.kg)} kg` });
      b.heaviest = { kg: s.kg, reps: s.reps };
    }
    if (REP_MARKS.includes(s.reps)) {
      const prev = b.repMax[s.reps];
      if (prev != null && s.kg > prev) hits.push({ label: `Best ${s.reps}-rep set`, value: `${L.fmtKg(s.kg)} kg`, prev: `${L.fmtKg(prev)} kg` });
      if (prev == null || s.kg > prev) b.repMax[s.reps] = s.kg;
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
const state = {
  screen: 'today',
  gymId: store.get('gym', 'city'),
  pick: null,
  session: store.get('active', null),
  test: store.get('test', null),
  rest: null,
  restMin: false,
  sheet: null,
  detail: null,
  confirm: null,
  bests: loadBests(),
};
if (state.session) state.screen = state.session.endedAt ? 'summary' : 'workout';
else if (state.test) state.screen = 'test';

function persist() {
  if (state.session) store.set('active', state.session); else store.del('active');
  if (state.test) store.set('test', state.test); else store.del('test');
}

function nextWorkoutId() {
  const i = ROTATION.indexOf(store.get('lastWorkout', null));
  return ROTATION[(i + 1) % ROTATION.length];
}

// ---------- building a session ----------
function stepsOf(item, gymId) {
  return L.stepsFor(EXERCISES[item.exId], gymById(gymId));
}

function buildItem(rx, gymId, rounds) {
  const ex = EXERCISES[rx.ex];
  const steps = L.stepsFor(ex, gymById(gymId));
  const key = histKey(rx.ex, gymId);
  const last = LAST[key] || null;
  let hint = null;
  if (!last && ex.equip === 'machine') {
    for (const g of GYMS) {
      const l = LAST[`${rx.ex}@${g.id}`];
      if (g.id !== gymId && l) { hint = { gym: g.name, kg: Math.max(...l.map((s) => s.kg)) }; break; }
    }
  }
  const target = ex.track === 'kgReps' || ex.track === 'kgDistance'
    ? L.nextTarget(last, ex.track === 'kgReps' ? rx.reps : null, steps)
    : null;
  const n = rounds || rx.sets || 3;
  const sets = [];
  if (rx.warmups && target && ex.equip === 'barbell') {
    for (const w of L.warmupRamp(target.kg, steps, rx.warmups)) sets.push({ type: 'warmup', kg: w.kg, reps: w.reps, done: false });
  }
  for (let i = 0; i < n; i++) {
    sets.push({
      type: 'working',
      kg: target?.kg ?? null,
      reps: rx.reps ?? null,
      time: rx.time ?? null,
      dist: rx.distance ?? null,
      done: false,
    });
  }
  return { exId: rx.ex, from: null, rx, key, last, hint, target, sets };
}

function freshCircuit() {
  return { status: 'idle', startedAt: null, before: 0, rounds: 0, extra: 0, lastMinute: -1, result: null };
}

function buildSession(workoutId, gymId) {
  const w = WORKOUTS[workoutId];
  const blocks = w.blocks.map((b) => {
    if (b.type === 'straight') return { type: 'straight', rest: b.items[0].rest, items: [buildItem(b.items[0], gymId)] };
    if (b.type === 'superset') return { type: 'superset', rest: b.rest, rounds: b.rounds, items: b.items.map((rx) => buildItem(rx, gymId, b.rounds)) };
    return { type: b.type, def: b, c: freshCircuit() };
  });
  return {
    id: `${new Date().toISOString().slice(0, 10)}-${workoutId}`,
    workoutId, gymId, startedAt: Date.now(), endedAt: null, feel: null,
    blocks, bests: clone(state.bests), prs: [],
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
  if (track === 'kgReps') return `${L.fmtKg(s.kg)} kg × ${s.reps}`;
  if (track === 'time') return `${s.time} s`;
  if (track === 'kgDistance') return `${L.fmtKg(s.kg)} kg for ${s.dist} m`;
  return `${s.reps} reps`;
}

function lastLine(item, gymId) {
  const ex = EXERCISES[item.exId];
  const bits = [];
  if (item.from) bits.push(`Swapped from ${EXERCISES[item.from].name} for this session.`);
  const last = item.last;
  if (last?.length) {
    if (ex.track === 'kgReps') {
      const same = last.every((s) => s.kg === last[0].kg);
      bits.push(same
        ? `Last time ${L.fmtKg(last[0].kg)} kg × ${last.map((s) => s.reps).join(', ')}.`
        : `Last time ${last.map((s) => `${L.fmtKg(s.kg)} × ${s.reps}`).join(', ')}.`);
      if (item.target?.bumped) bits.push(`<b class="up">Up to ${L.fmtKg(item.target.kg)} kg today.</b>`);
      else if (item.rx.reps) bits.push(`Same weight until every set hits ${item.rx.reps}.`);
    } else if (ex.track === 'time') {
      bits.push(`Last time ${last.map((s) => s.time).join(', ')} s.`);
    } else if (ex.track === 'kgDistance') {
      bits.push(`Last time ${L.fmtKg(last[0].kg)} kg for ${last[0].dist} m.`);
    } else {
      bits.push(`Last time ${last.map((s) => s.reps).join(', ')}.`);
    }
  } else if (item.hint) {
    const m = gymById(gymId).machines[ex.machine];
    bits.push(`New here. You used ${L.fmtKg(item.hint.kg)} kg at ${esc(item.hint.gym)}, and every ${esc(m.name.toLowerCase())} is its own beast. Tap + to pick a starting weight.`);
  } else if (ex.track === 'kgReps' || ex.track === 'kgDistance') {
    bits.push('First time. Tap + to pick a starting weight.');
  }
  return bits.length ? `<p class="last">${bits.join(' ')}</p>` : '';
}

function doseText(item, count) {
  const ex = EXERCISES[item.exId];
  const side = ex.perSide ? ' each side' : '';
  if (item.rx.reps) return `${count} × ${item.rx.reps}${side}`;
  if (item.rx.time) return `${count} × ${item.rx.time} s${side}`;
  if (item.rx.distance) return `${count} × ${item.rx.distance} m`;
  return `${count} sets`;
}

// Where the next undone set is, for the rest screen.
function blockOrder(b, bi) {
  const out = [];
  if (b.type === 'straight') {
    const it = b.items[0];
    let w = 0;
    it.sets.forEach((s, si) => {
      const lbl = s.type === 'warmup' ? 'warm-up' : s.type === 'drop' ? 'drop set' : `set ${++w}`;
      out.push({ s, label: `${EXERCISES[it.exId].name}, ${lbl}`, si });
    });
  } else if (b.type === 'superset') {
    for (let r = 0; r < b.rounds; r++) {
      b.items.forEach((it, ii) => out.push({ s: it.sets[r], label: `${letter(bi)}${ii + 1} ${EXERCISES[it.exId].name}, round ${r + 1}` }));
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

// ---------- rendering: shared bits ----------
const CHECK = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function brand() {
  return `<span class="brand"><span class="mark" aria-hidden="true"><i class="p25"></i><i class="p20"></i><i class="p15"></i><i class="p10"></i><i class="p5"></i></span><span class="word">repsheet</span></span>`;
}

function tabs() {
  const on = (s) => (state.screen === s || (s === 'prs' && state.screen === 'detail') ? 'on' : '');
  return `<nav class="tabs" aria-label="Main">
    <button class="${on('today')}" data-act="nav" data-to="today">Today</button>
    <button class="${on('prs')}" data-act="nav" data-to="prs">PRs</button>
  </nav>`;
}

const PLATE_CLASS = { 25: 'p25', 20: 'p20', 15: 'p15', 10: 'p10', 5: 'p5', 2.5: 'p2', 1.25: 'p1' };

function platesHtml(kg) {
  const plates = L.platesPerSide(kg);
  if (!plates || !plates.length) return '';
  return `<div class="plates" aria-label="Plates each side: ${plates.join(', ')} kilograms">
    <span class="sleeve" aria-hidden="true">${plates.map((p) => `<i class="${PLATE_CLASS[p]}"></i>`).join('')}</span>
    <span class="plates-text">${plates.map((p) => L.fmtKg(p)).join(' + ')} each side</span>
  </div>`;
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
  const ex = EXERCISES[item.exId];
  const t = ex.track;
  const side = ex.perSide ? ' each side' : '';
  const f = [];
  if (t === 'kgReps' || t === 'kgDistance') f.push(field('kg', s.kg, 'decimal', 'kg', 'weight', s.done));
  if (t === 'kgReps' || t === 'reps') f.push(field('reps', s.reps, 'numeric', `reps${side}`, 'reps', s.done));
  if (t === 'time') f.push(field('time', s.time, 'numeric', `sec${side}`, 'seconds', s.done));
  if (t === 'kgDistance') f.push(field('dist', s.dist, 'numeric', 'metres', 'metres', s.done));
  const plates = ex.equip === 'barbell' ? platesHtml(s.kg) : '';
  return `<div class="set ${s.type} ${s.done ? 'done' : ''}" data-b="${bi}" data-i="${ii}" data-s="${si}">
    <span class="set-label">${label}</span>
    <div class="fields" style="--n:${f.length}">${f.join('')}</div>
    <button class="tick" data-act="tick" aria-pressed="${s.done}" aria-label="${s.done ? 'Undo this set' : 'Log this set'}">${CHECK}</button>
    ${plates}
  </div>`;
}

// ---------- screens ----------
function todayScreen() {
  const wid = state.pick || nextWorkoutId();
  const w = WORKOUTS[wid];
  const gym = gymById(state.gymId);
  const isNext = wid === nextWorkoutId();
  const rows = w.blocks.flatMap((b, bi) => {
    if (b.type === 'straight' || b.type === 'superset') {
      return b.items.map((rx, ii) => {
        const it = buildItem(rx, state.gymId, b.rounds);
        const ex = EXERCISES[rx.ex];
        const tag = b.type === 'superset' ? `${letter(bi)}${ii + 1}` : letter(bi);
        let load = '';
        if (it.target) load = `<span class="load ${it.target.bumped ? 'up' : ''}">${L.fmtKg(it.target.kg)} kg</span>`;
        else if (ex.equip === 'machine') load = '<span class="load new">New here</span>';
        else if (ex.equip === 'bodyweight') load = '<span class="load">Body</span>';
        return `<li><span class="tag">${tag}</span><span class="nm">${ex.name}</span><span class="dose">${doseText(it, b.rounds || rx.sets)}</span>${load}</li>`;
      });
    }
    return [`<li><span class="tag">${letter(bi)}</span><span class="nm">${circuitTitle(b)}</span><span class="dose"></span></li>`];
  }).join('');
  const others = ROTATION.filter((id) => id !== wid).map((id) => {
    const o = WORKOUTS[id];
    return `<button class="other" data-act="pick" data-w="${id}"><span class="o-name">${o.name}</span><span class="o-focus">${o.focus}, about ${o.minutes} min</span></button>`;
  }).join('');
  return `
  <header class="top">${brand()}<button class="chip" data-act="gym" aria-label="Change gym, currently ${esc(gym.name)}">${esc(gym.name)}<span aria-hidden="true">▾</span></button></header>
  <section class="hero">
    <p class="when">${isNext ? `Next up in ${BLOCK.name.toLowerCase()}, week ${BLOCK.week} of ${BLOCK.weeks}` : 'Picked for today'}</p>
    <h1 class="wname">${w.name}</h1>
    <p class="focus">${w.focus}, about ${w.minutes} minutes</p>
    <ol class="preview">${rows}</ol>
    <button class="primary big" data-act="start" data-w="${wid}">Start ${w.name}</button>
  </section>
  <section class="others">
    <h2>Or train something else</h2>
    ${others}
  </section>
  <p class="note">This is a prototype with sample numbers. Sessions save on this phone only; syncing to your Sheet comes with the MVP. ${VERSION}.</p>
  ${tabs()}`;
}

function straightBlock(b, bi) {
  const it = b.items[0];
  const ex = EXERCISES[it.exId];
  const gym = gymById(state.session.gymId);
  const working = it.sets.filter((s) => s.type === 'working').length;
  const rx = [doseText(it, working)];
  if (it.rx.tempo) rx.push(`tempo ${it.rx.tempo}`);
  rx.push(`rest ${L.fmtRest(b.rest)}`);
  const machine = ex.equip === 'machine' ? `<p class="machine">${esc(gym.machines[ex.machine].name)}, ${esc(gym.name)}</p>` : '';
  let w = 0;
  const rows = it.sets.map((s, si) => {
    const label = s.type === 'warmup' ? 'W' : s.type === 'drop' ? '↓' : String(++w);
    return setRow(bi, 0, si, s, it, label);
  }).join('');
  const lastWorking = it.sets[it.sets.length - 1];
  const drop = it.rx.dropLast && lastWorking.kg != null
    ? `<button class="text-btn" data-act="drop" data-b="${bi}" data-i="0">Add a drop set</button>` : '';
  const anyDone = it.sets.some((s) => s.done);
  return `<section class="block" id="b${bi}">
    <header class="bh">
      <span class="letter">${letter(bi)}</span>
      <div class="bh-text"><h2>${ex.name}</h2><p class="rx">${rx.join(', ')}</p>${machine}</div>
      ${ex.alts?.length && !anyDone ? `<button class="chip small" data-act="swap" data-b="${bi}" data-i="0">Swap</button>` : ''}
    </header>
    ${lastLine(it, state.session.gymId)}
    <div class="sets">${rows}</div>
    ${drop}
  </section>`;
}

function supersetBlock(b, bi) {
  const tagBase = letter(bi);
  const intro = b.items.map((it, ii) => {
    const ex = EXERCISES[it.exId];
    const gym = gymById(state.session.gymId);
    const machine = ex.equip === 'machine' ? `<p class="machine">${esc(gym.machines[ex.machine].name)}, ${esc(gym.name)}</p>` : '';
    const anyDone = it.sets.some((s) => s.done);
    return `<div class="ss-item">
      <span class="tag">${tagBase}${ii + 1}</span>
      <div class="bh-text"><h3>${ex.name}</h3><p class="rx">${doseText(it, b.rounds)}</p>${machine}${lastLine(it, state.session.gymId)}</div>
      ${ex.alts?.length && !anyDone ? `<button class="chip small" data-act="swap" data-b="${bi}" data-i="${ii}">Swap</button>` : ''}
    </div>`;
  }).join('');
  let rounds = '';
  for (let r = 0; r < b.rounds; r++) {
    rounds += `<div class="round"><p class="round-label">Round ${r + 1}</p>${b.items.map((it, ii) => setRow(bi, ii, r, it.sets[r], it, `${tagBase}${ii + 1}`)).join('')}</div>`;
  }
  return `<section class="block" id="b${bi}">
    <header class="bh">
      <span class="letter">${tagBase}</span>
      <div class="bh-text"><h2>Superset</h2><p class="rx">${b.rounds} rounds, rest ${L.fmtRest(b.rest)} after ${tagBase}${b.items.length}</p></div>
    </header>
    ${intro}
    ${rounds}
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
      const it = d.items[m % d.items.length];
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
  const w = WORKOUTS[s.workoutId];
  const blocks = s.blocks.map((b, bi) => {
    if (b.type === 'straight') return straightBlock(b, bi);
    if (b.type === 'superset') return supersetBlock(b, bi);
    return circuitBlock(b, bi);
  }).join('');
  return `
  <header class="wtop">
    <div><h1>${w.name}</h1><p class="sub">${esc(gymById(s.gymId).name)}, <span data-elapsed>0:00</span></p></div>
    <button class="ghost" data-act="finish">Finish</button>
  </header>
  ${blocks}
  <div class="end">
    <button class="primary big" data-act="finish">Finish workout</button>
    <button class="text-btn danger" data-act="discard">${state.confirm === 'discard' ? 'Tap again to discard this workout' : 'Discard workout'}</button>
  </div>`;
}

function sessionStats(s) {
  let sets = 0; let volume = 0;
  for (const b of s.blocks) {
    for (const it of b.items || []) {
      const t = EXERCISES[it.exId].track;
      for (const x of it.sets) {
        if (!x.done) continue;
        sets += 1;
        if (t === 'kgReps' && x.kg && x.reps) volume += x.kg * x.reps;
      }
    }
  }
  return { sets, volume: Math.round(volume) };
}

const FEELS = ['Rough', 'Heavy', 'Solid', 'Strong', 'Flying'];

function summaryScreen() {
  const s = state.session;
  const w = WORKOUTS[s.workoutId];
  const st = sessionStats(s);
  const dur = (s.endedAt || Date.now()) - s.startedAt;
  const circuits = s.blocks.filter((b) => b.c && b.c.status === 'done' && b.type !== 'rounds').map((b) => `<li>${circuitTitle(b)}: <b>${circuitView(b).big}</b></li>`).join('');
  const prs = s.prs.map((p) => `<li><b>${esc(p.name)}</b> ${setText(p.set, p.track)}<span>${p.hits.map((h) => h.label).join(', ')}</span></li>`).join('');
  return `
  <header class="wtop"><div><h1>${w.name} done</h1><p class="sub">${esc(gymById(s.gymId).name)}</p></div></header>
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

function weeklyChart() {
  const { plan, done } = WEEKLY;
  const W = 320; const H = 132; const top = 12; const base = 104;
  const max = Math.max(plan, ...done) + 1;
  const bw = 26; const gap = (W - done.length * bw) / (done.length + 1);
  const y = (v) => base - (v / max) * (base - top);
  const bars = done.map((v, i) => {
    const x = gap + i * (bw + gap);
    const current = i === done.length - 1;
    return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${base - y(v)}" rx="3" class="${current ? 'bar now' : v >= plan ? 'bar hit' : 'bar'}"/>
      <text x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle" class="bar-n">${v}</text>`;
  }).join('');
  const total = done.slice(0, -1).reduce((a, b) => a + b, 0);
  return `<figure class="weekly">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sessions per week for the last ${done.length} weeks">
      <line x1="0" x2="${W}" y1="${y(plan)}" y2="${y(plan)}" class="plan-line"/>
      <text x="${W}" y="${y(plan) - 4}" text-anchor="end" class="plan-text">Plan ${plan}</text>
      ${bars}
      <text x="${gap}" y="${H - 6}" class="axis">${done.length - 1} weeks ago</text>
      <text x="${W - gap}" y="${H - 6}" text-anchor="end" class="axis">This week</text>
    </svg>
    <figcaption>${total} of ${plan * (done.length - 1)} planned sessions over the last ${done.length - 1} full weeks.</figcaption>
  </figure>`;
}

function liftRow(key) {
  const b = state.bests[key];
  const ex = EXERCISES[key];
  const ser = seriesFor(key);
  const cells = REP_MARKS.map((r) => `<span><small>${r}</small>${b?.repMax?.[r] != null ? L.fmtKg(b.repMax[r]) : '–'}</span>`).join('');
  return `<button class="lift" data-act="detail" data-k="${key}">
    <span class="l-name">${ex.name}</span>
    <span class="l-e1"><b>${L.fmtKg(b?.e1rm)}</b><small>kg estimated 1RM</small></span>
    ${sparkline(ser.points)}
    <span class="l-reps" aria-label="Best weight for 1, 3, 5, 8 and 10 reps">${cells}</span>
  </button>`;
}

function prsScreen() {
  return `
  <header class="top">${brand()}</header>
  <h1 class="page">PRs and progress</h1>
  ${weeklyChart()}
  <div class="pr-cta">
    <button class="primary big" data-act="test-setup">Start a PR session</button>
    <p class="hint">Test a 1RM, 3RM or 5RM. Best done at the end of a block.</p>
  </div>
  <h2 class="sec">Main lifts</h2>
  <p class="hint">Best kg for 1, 3, 5, 8 and 10 reps under each lift.</p>
  <div class="lifts">${MAIN_LIFTS.map(liftRow).join('')}</div>
  <p class="note">Cable and machine PRs count per gym, so they'll live with each gym's equipment in the MVP.</p>
  ${tabs()}`;
}

function detailScreen() {
  const key = state.detail;
  const ex = EXERCISES[key];
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
  const tested = ser.tested.map((t) => `<g class="tested"><rect x="${x(t.d) - 5}" y="${y(t.kg) - 5}" width="10" height="10" transform="rotate(45 ${x(t.d)} ${y(t.kg)})"/><text x="${x(t.d) + 9}" y="${y(t.kg) + 4}">Tested ${L.fmtKg(t.kg)} × ${t.reps}</text></g>`).join('');
  const reps = REP_MARKS.map((r) => `<div><dt>${r} rep${r > 1 ? 's' : ''}</dt><dd>${b?.repMax?.[r] != null ? `${L.fmtKg(b.repMax[r])} kg` : '–'}</dd></div>`).join('');
  return `
  <header class="top"><button class="ghost" data-act="nav" data-to="prs">Back</button></header>
  <h1 class="page">${ex.name}</h1>
  <figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated 1RM over time for ${ex.name}">
      <line x1="${padL}" x2="${W - padR}" y1="${y(max)}" y2="${y(max)}" class="grid"/>
      <line x1="${padL}" x2="${W - padR}" y1="${y(min)}" y2="${y(min)}" class="grid"/>
      <text x="${padL - 6}" y="${y(max) + 4}" text-anchor="end" class="axis">${max}</text>
      <text x="${padL - 6}" y="${y(min) + 4}" text-anchor="end" class="axis">${min}</text>
      <polyline points="${line}" class="trend"/>
      ${dots}${tested}
      <text x="${padL}" y="${H - 8}" class="axis">${shortDate(ser.points[0].d)}</text>
      <text x="${W - padR}" y="${H - 8}" text-anchor="end" class="axis">${shortDate(ser.points[ser.points.length - 1].d)}</text>
    </svg>
    <figcaption>Estimated 1RM in kg. Diamonds are maxes you tested in a PR session.</figcaption>
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
        <span class="o-name">${EXERCISES[k].name}</span><span class="o-focus">Current estimate ${L.fmtKg(Math.round(est * 10) / 10)} kg for ${t.reps}</span></button>`;
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
      return `<li><b>${EXERCISES[p.key].name}</b><span>${best != null ? `${L.fmtKg(best)} kg × ${t.reps}` : 'No attempt made'}${isPr ? ' <em class="pr">PR</em>' : ''}${p.prev != null ? ` <small>(best before ${L.fmtKg(p.prev)} kg)</small>` : ''}</span></li>`;
    }).join('');
    return `
    <header class="wtop"><div><h1>PR session done</h1><p class="sub">${t.reps}RM test, ${esc(gymById(t.gymId).name)}</p></div></header>
    <ul class="pr-list results">${rows}</ul>
    <p class="hint">Your Health Coach uses these to set the next block's loads.</p>
    <div class="end"><button class="primary big" data-act="test-save">Save results</button><button class="text-btn" data-act="test-back">Back to the session</button></div>`;
  }
  // running
  const cards = t.plans.map((p, li) => {
    const ex = EXERCISES[p.key];
    const open = li === t.cur;
    if (!open) {
      const made = p.attempts.filter((a) => a.result === 'made').map((a) => a.kg);
      const status = made.length ? `Best today ${L.fmtKg(Math.max(...made))} kg` : p.attempts.some((a) => a.result) ? 'No attempt made' : 'Up later';
      return `<section class="block test-lift closed"><header class="bh"><span class="letter">${letter(li)}</span><div class="bh-text"><h2>${ex.name}</h2><p class="rx">${status}</p></div><button class="chip small" data-act="tgo" data-l="${li}">Open</button></header></section>`;
    }
    const ramp = p.ramp.map((r, ri) => `<div class="set ${r.done ? 'done' : ''}" data-l="${li}" data-r="${ri}">
      <span class="set-label">W</span>
      <div class="ramp-val"><b>${L.fmtKg(r.kg)}</b> kg × ${r.reps}</div>
      <button class="tick" data-act="tramp" aria-pressed="${r.done}" aria-label="${r.done ? 'Undo warm-up set' : 'Log warm-up set'}">${CHECK}</button>
      ${platesHtml(r.kg)}
    </div>`).join('');
    const attempts = p.attempts.map((a, ai) => {
      const res = a.result
        ? `<span class="result res-${a.result}">${a.result === 'made' ? 'Made' : 'Missed'}</span><button class="text-btn small" data-act="tundo" data-l="${li}" data-a="${ai}">Undo</button>`
        : `<button class="btn-made" data-act="tmade" data-l="${li}" data-a="${ai}">Made</button><button class="btn-missed" data-act="tmiss" data-l="${li}" data-a="${ai}">Missed</button>`;
      return `<div class="attempt ${a.result || ''}" data-l="${li}" data-a="${ai}">
        <span class="a-label">${a.label}</span>
        <div class="field" data-f="akg"><button class="step" data-act="tdec" aria-label="Less weight" ${a.result ? 'disabled' : ''}>−</button><label class="val"><input type="text" inputmode="decimal" value="${L.fmtKg(a.kg)}" aria-label="${a.label} weight" data-act="tinput" ${a.result ? 'disabled' : ''}><small>kg</small></label><button class="step" data-act="tinc" aria-label="More weight" ${a.result ? 'disabled' : ''}>+</button></div>
        <div class="a-res">${res}</div>
        ${platesHtml(a.kg)}
      </div>`;
    }).join('');
    const allDone = p.attempts.every((a) => a.result);
    const nextBtn = li < t.plans.length - 1
      ? `<button class="${allDone ? 'primary' : 'ghost'}" data-act="tnext">Next lift: ${EXERCISES[t.plans[li + 1].key].name}</button>`
      : `<button class="${allDone ? 'primary' : 'ghost'}" data-act="tfinish">Finish PR session</button>`;
    return `<section class="block test-lift" id="t${li}">
      <header class="bh"><span class="letter">${letter(li)}</span><div class="bh-text"><h2>${ex.name}</h2>
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
  ${cards}`;
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

function renderSheet() {
  const el = $('#sheet');
  const sh = state.sheet;
  if (!sh) { el.innerHTML = ''; el.className = ''; return; }
  let body = '';
  if (sh.kind === 'gym') {
    body = `<h2>Where are you training?</h2>
      <div class="opts">${GYMS.map((g) => `<button class="opt ${g.id === state.gymId ? 'on' : ''}" data-act="setgym" data-g="${g.id}"><span class="o-name">${esc(g.name)}</span><span class="o-focus">${Object.keys(g.machines).length} machines set up, kettlebells ${g.kettlebells[0]} to ${g.kettlebells[g.kettlebells.length - 1]} kg</span></button>`).join('')}</div>
      <p class="hint">Barbell and dumbbell numbers follow you everywhere. Cable and machine numbers stay with each gym.</p>`;
  } else if (sh.kind === 'swap') {
    const it = state.session.blocks[sh.b].items[sh.i];
    const orig = it.from || it.exId;
    const alts = [...new Set([...(EXERCISES[orig].alts || []), orig])].filter((x) => x !== it.exId);
    body = `<h2>Swap ${esc(EXERCISES[it.exId].name)}</h2>
      <div class="opts">${alts.map((x) => `<button class="opt" data-act="doswap" data-x="${x}"><span class="o-name">${EXERCISES[x].name}${x === orig ? ' (back to the plan)' : ''}</span><span class="o-focus">${EXERCISES[x].equip}</span></button>`).join('')}</div>
      <p class="hint">Swaps last for this session only. Your programme stays the same.</p>`;
  }
  el.className = 'on';
  el.innerHTML = `<div class="sheet-back" data-act="sheet-close"></div><div class="sheet-panel" role="dialog" aria-modal="true">${body}<button class="ghost wide" data-act="sheet-close">Close</button></div>`;
}

// ---------- render ----------
let lastScreen = null;
function renderScreen() {
  const views = { today: todayScreen, workout: workoutScreen, summary: summaryScreen, prs: prsScreen, detail: detailScreen, test: testScreen };
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
function finishCircuit(b, bi, title, sub) {
  b.c.before = elapsedOf(b.c);
  b.c.status = 'done';
  vibrate([300, 120, 300]);
  showFlash(title, sub);
  persist();
  renderScreen();
}

function tick() {
  const now = Date.now();
  const started = state.session?.startedAt ?? state.test?.startedAt;
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
  state.session?.blocks.forEach((b, bi) => {
    if (!b.c || b.c.status !== 'running') return;
    const d = b.def;
    const e = elapsedOf(b.c, now);
    if (b.type === 'emom') {
      if (e >= d.minutes * 60) return finishCircuit(b, bi, 'EMOM done', `${d.minutes} minutes in the bank`);
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
    if (b.type === 'amrap' && e >= d.minutes * 60) return finishCircuit(b, bi, 'Time', 'Add any extra reps from the last round');
    if (b.type === 'fortime' && e >= d.cap * 60) { b.c.result = { time: d.cap * 60, capped: true }; return finishCircuit(b, bi, 'Time cap', `${b.c.rounds} of ${d.rounds} rounds done`); }
    const v = circuitView(b, now);
    const big = document.querySelector(`[data-cbig="${bi}"]`);
    const small = document.querySelector(`[data-csmall="${bi}"]`);
    if (big) big.textContent = v.big;
    if (small) small.textContent = v.small;
  });
}
setInterval(tick, 250);

// ---------- actions ----------
function setFromRow(row) {
  const { b, i, s } = row.dataset;
  const item = state.session.blocks[+b].items[+i];
  return { bi: +b, ii: +i, si: +s, item, set: item.sets[+s] };
}

function adjust(row, f, dir) {
  const { item, set, si } = setFromRow(row);
  if (f === 'kg') {
    const old = set.kg;
    set.kg = L.nudge(set.kg, dir, stepsOf(item, state.session.gymId), item.hint?.kg);
    if (set.type === 'working') {
      for (const later of item.sets.slice(si + 1)) if (!later.done && later.type === 'working' && later.kg === old) later.kg = set.kg;
    }
  } else if (f === 'reps') set.reps = Math.max(0, (set.reps ?? 0) + dir);
  else if (f === 'time') set.time = Math.max(0, (set.time ?? 0) + dir * 5);
  else if (f === 'dist') set.dist = Math.max(0, (set.dist ?? 0) + dir * 10);
  persist();
  renderScreen();
}

function onTick(row) {
  const { bi, ii, si, item, set } = setFromRow(row);
  const s = state.session;
  const b = s.blocks[bi];
  const ex = EXERCISES[item.exId];
  if (set.done) { set.done = false; persist(); renderScreen(); return; }
  if ((ex.track === 'kgReps' || ex.track === 'kgDistance') && set.kg == null) { toast('Pick a weight first'); return; }
  if (ex.track === 'kgReps' && !set.reps) { toast('Add your reps first'); return; }
  set.done = true;
  vibrate(40);
  if (set.type !== 'warmup') {
    const hits = applyBest(s.bests, item.key, set, ex.track);
    if (hits.length) {
      s.prs.push({ key: item.key, exId: item.exId, name: ex.name, set: { kg: set.kg, reps: set.reps, time: set.time, dist: set.dist }, track: ex.track, hits });
      celebrate(ex.name, setText(set, ex.track), hits);
    }
  }
  const next = nextLabel(bi);
  if (b.type === 'straight') {
    const nextIsDrop = item.sets[si + 1]?.type === 'drop';
    if (!nextIsDrop && next) startRest(set.type === 'warmup' ? 90 : b.rest, next);
  } else if (b.type === 'superset') {
    if (ii === b.items.length - 1) { if (next) startRest(b.rest, next); } else toast(`Straight into ${letter(bi)}${ii + 2}: ${EXERCISES[b.items[ii + 1].exId].name}`);
  }
  persist();
  renderScreen();
}

function onInput(el) {
  const raw = el.value.replace(',', '.').trim();
  const num = raw === '' ? null : Number(raw);
  if (raw !== '' && Number.isNaN(num)) { toast('Numbers only'); renderScreen(); return; }
  if (el.dataset.act === 'tinput') {
    const at = el.closest('.attempt');
    state.test.plans[+at.dataset.l].attempts[+at.dataset.a].kg = num;
    persist(); renderScreen(); return;
  }
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

function startWorkout(wid) {
  state.session = buildSession(wid, state.gymId);
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
  store.set('lastWorkout', s.workoutId);
  state.bests = clone(s.bests);
  state.session = null;
  state.rest = null;
  renderRest();
  keepAwake(false);
  persist();
  state.screen = 'today';
  renderScreen();
  toast('Session saved on this phone');
}

function testPlanFor(t) {
  return t.lifts.map((k) => ({ key: k, ...L.testPlan(state.bests[k], t.reps, L.stepsFor(EXERCISES[k], gymById(t.gymId))) }));
}

function attemptOf(btn) {
  const el = btn.closest('[data-l]');
  const li = +el.dataset.l;
  return { li, ai: +btn.dataset.a, plan: state.test.plans[li] };
}

function onAction(el) {
  const act = el.dataset.act;
  const row = el.closest('.set');
  const s = state.session;
  if (act !== 'discard' && state.confirm) state.confirm = null;
  switch (act) {
    case 'nav': state.screen = el.dataset.to; renderScreen(); break;
    case 'gym': state.sheet = { kind: 'gym' }; renderSheet(); break;
    case 'setgym': state.gymId = el.dataset.g; store.set('gym', state.gymId); state.sheet = null; renderSheet(); renderScreen(); break;
    case 'sheet-close': state.sheet = null; renderSheet(); break;
    case 'pick': state.pick = el.dataset.w; renderScreen(); break;
    case 'start': startWorkout(el.dataset.w); break;
    case 'inc': adjust(row, el.closest('.field').dataset.f, 1); break;
    case 'dec': adjust(row, el.closest('.field').dataset.f, -1); break;
    case 'tick': onTick(row); break;
    case 'drop': {
      const it = s.blocks[+el.dataset.b].items[+el.dataset.i];
      const prev = it.sets[it.sets.length - 1];
      const steps = stepsOf(it, s.gymId);
      let kg = L.snap(prev.kg * 0.8, steps, 'down');
      if (kg >= prev.kg) kg = L.nudge(prev.kg, -1, steps);
      it.sets.push({ type: 'drop', kg, reps: it.rx.reps, done: false });
      persist(); renderScreen(); break;
    }
    case 'swap': state.sheet = { kind: 'swap', b: +el.dataset.b, i: +el.dataset.i }; renderSheet(); break;
    case 'doswap': {
      const { b, i } = state.sheet;
      const block = s.blocks[b];
      const old = block.items[i];
      const orig = old.from || old.exId;
      const fresh = buildItem({ ...old.rx, ex: el.dataset.x }, s.gymId, block.type === 'superset' ? block.rounds : undefined);
      fresh.from = el.dataset.x === orig ? null : orig;
      block.items[i] = fresh;
      state.sheet = null; renderSheet(); persist(); renderScreen();
      toast(fresh.from ? `Swapped to ${EXERCISES[fresh.exId].name} for today` : 'Back to the plan');
      break;
    }
    case 'cstart': { const c = s.blocks[+el.dataset.b].c; c.status = 'running'; c.startedAt = Date.now(); vibrate(60); persist(); renderScreen(); break; }
    case 'cpause': { const c = s.blocks[+el.dataset.b].c; c.before = elapsedOf(c); c.status = 'paused'; persist(); renderScreen(); break; }
    case 'cend': {
      const bi = +el.dataset.b; const b = s.blocks[bi];
      if (b.type === 'fortime') b.c.result = { time: elapsedOf(b.c), capped: b.c.rounds < b.def.rounds };
      b.c.status = 'done'; persist(); renderScreen(); break;
    }
    case 'creset': { s.blocks[+el.dataset.b].c = freshCircuit(); persist(); renderScreen(); break; }
    case 'cextra': { const c = s.blocks[+el.dataset.b].c; c.extra = Math.max(0, c.extra + Number(el.dataset.d)); persist(); renderScreen(); break; }
    case 'cround': {
      const bi = +el.dataset.b; const b = s.blocks[bi]; const c = b.c; const d = b.def;
      c.rounds += 1; vibrate(40);
      if (b.type === 'fortime' && c.rounds >= d.rounds) { c.result = { time: elapsedOf(c), capped: false }; finishCircuit(b, bi, 'Done', `${d.rounds} rounds in ${L.fmtTime(c.result.time)}`); break; }
      if (b.type === 'rounds') {
        if (c.rounds < d.rounds) startRest(d.rest, `Round ${c.rounds + 1} of ${d.rounds}`);
        else { c.status = 'done'; const next = nextLabel(bi + 1); if (next) startRest(60, next); }
      }
      persist(); renderScreen(); break;
    }
    case 'finish': s.endedAt = Date.now(); state.rest = null; renderRest(); persist(); state.screen = 'summary'; renderScreen(); break;
    case 'resume': s.endedAt = null; persist(); state.screen = 'workout'; renderScreen(); break;
    case 'feel': s.feel = Number(el.dataset.v); persist(); renderScreen(); break;
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
    // PR session
    case 'test-setup': state.test = { stage: 'setup', lifts: ['squat', 'bench'], reps: 1 }; state.screen = 'test'; persist(); renderScreen(); break;
    case 'test-cancel': state.test = null; persist(); state.screen = 'prs'; renderScreen(); break;
    case 'tlift': {
      const k = el.dataset.k; const t = state.test;
      t.lifts = t.lifts.includes(k) ? t.lifts.filter((x) => x !== k) : TEST_LIFTS.filter((x) => x === k || t.lifts.includes(x));
      persist(); renderScreen(); break;
    }
    case 'treps': state.test.reps = Number(el.dataset.r); persist(); renderScreen(); break;
    case 'test-plan': {
      const t = state.test;
      t.gymId = state.gymId; t.plans = testPlanFor(t); t.cur = 0; t.stage = 'run'; t.startedAt = Date.now(); t.bests = clone(state.bests);
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
      a.kg = L.nudge(a.kg, act === 'tinc' ? 1 : -1, L.stepsFor(EXERCISES[p.key], gymById(state.test.gymId)));
      persist(); renderScreen(); break;
    }
    case 'tmade': case 'tmiss': {
      const { ai, plan } = attemptOf(el); const a = plan.attempts[ai]; const t = state.test;
      a.result = act === 'tmade' ? 'made' : 'missed';
      const next = plan.attempts[ai + 1];
      const steps = L.stepsFor(EXERCISES[plan.key], gymById(t.gymId));
      if (a.result === 'made') {
        vibrate(40);
        const hits = applyBest(t.bests, plan.key, { kg: a.kg, reps: t.reps }, 'kgReps');
        if (hits.length) celebrate(EXERCISES[plan.key].name, `${L.fmtKg(a.kg)} kg × ${t.reps}`, hits);
        if (next && !next.result && next.kg <= a.kg) next.kg = L.nudge(a.kg, 1, steps);
      } else if (next && !next.result) {
        next.kg = a.kg;
        toast('Next attempt set to the same weight. Lower it if that felt like a grinder.');
      }
      if (next && !next.result) startRest(240, `${next.label}, ${L.fmtKg(next.kg)} kg`);
      persist(); renderScreen(); break;
    }
    case 'tundo': { const { ai, plan } = attemptOf(el); plan.attempts[ai].result = null; persist(); renderScreen(); break; }
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

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.tagName === 'INPUT') return;
  onAction(el);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.act === 'input' || el.dataset?.act === 'tinput') onInput(el);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.sheet) { state.sheet = null; renderSheet(); }
    $('#flash').className = ''; $('#celebrate').className = '';
  }
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
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
