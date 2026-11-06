// Flat rows for the Google Sheet, and the small client that sends them.
// The web app link and key are entered on the phone and never live in this repo.

const pad = (n) => String(n).padStart(2, '0');
export const localDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const idTime = (ms) => clock(ms).replace(':', '');

export function isSyncUrl(url) {
  return /^https:\/\/script\.google\.com\/.*\/exec$/.test(url);
}

// One finished session: rows for the Sets, Sessions and PRs tabs.
export function sessionMessage(s, h) {
  const id = s.syncId || `${localDate(s.startedAt)}-${s.workoutId}-${idTime(s.startedAt)}`;
  const date = localDate(s.startedAt);
  const gym = h.gymName(s.gymId);
  const sets = [];
  s.blocks.forEach((b, bi) => {
    for (const it of b.items || []) {
      it.sets.forEach((x, i) => {
        if (!x.done) return;
        sets.push([
          date, id, s.name, gym, `${h.letter(bi)}${b.type === 'superset' ? ' (superset)' : ''}`, h.exName(it.exId), it.damper ? `damper ${it.damper}` : h.machine(it.exId, s.gymId),
          i + 1, x.type, x.kg ?? '', x.reps ?? '', x.time ?? '', x.dist ?? '', x.cal ?? '', x.tempo ?? '', '',
          it.from ? h.exName(it.from) : '', [x.extra ? `then ${x.extra} to failure` : '', (x.note || '').trim()].filter(Boolean).join('. '),
        ]);
      });
    }
  });
  const circuits = s.blocks.filter((b) => b.c && (b.c.status === 'done' || b.c.rounds > 0)).map(h.circuitLine).join('; ');
  const notes = s.blocks.flatMap((b) => (b.items || []).filter((it) => (it.note || '').trim()).map((it) => `${h.exName(it.exId)}: ${it.note.trim()}`)).join('; ');
  const end = s.endedAt || Date.now();
  const session = [id, date, gym, 'normal', s.name, '', '', clock(s.startedAt), clock(end), Math.round((end - s.startedAt) / 60000), s.feel ?? '', circuits, notes];
  const prs = s.prs.flatMap((p) => p.hits.map((hit) => [date, id, gym, p.name, h.machine(p.exId, s.gymId), hit.label, hit.value, hit.prev ?? '']));
  return { id, session, sets, prs };
}

// One PR session: every attempt goes in Sets, and made lifts in PRs.
export function testMessage(t, h) {
  const id = `${localDate(t.startedAt)}-pr-session-${idTime(t.startedAt)}`;
  const date = localDate(t.startedAt);
  const gym = h.gymName(t.gymId);
  const sets = [];
  const prs = [];
  t.plans.forEach((p, li) => {
    const name = h.exName(p.key);
    p.attempts.forEach((a, ai) => {
      if (a.result) sets.push([date, id, 'PR session', gym, h.letter(li), name, '', ai + 1, 'attempt', a.kg, t.reps, '', '', '', '', '', '', a.result]);
    });
    const made = p.attempts.filter((a) => a.result === 'made').map((a) => a.kg);
    if (made.length) prs.push([date, id, gym, name, '', `${t.reps}RM`, `${Math.max(...made)} kg`, p.prev != null ? `${p.prev} kg` : '']);
  });
  const end = Date.now();
  const session = [id, date, gym, 'PR session', `${t.reps}RM test`, '', '', clock(t.startedAt), clock(end), Math.round((end - t.startedAt) / 60000), '', '', ''];
  return { id, session, sets, prs };
}

// The routines, exercises and gyms as they stand on the phone.
export function programmeMessage(db, h) {
  return {
    workouts: db.order.filter((id) => db.workouts[id]).map((id, i) => {
      const w = db.workouts[id];
      return [i + 1, id, w.name, w.focus || '', h.minutes(w.blocks), h.summary(w), JSON.stringify(w)];
    }),
    library: Object.entries(db.exercises).map(([id, e]) => [id, e.name, e.group || '', e.equip || '', e.track || '', e.perSide ? 'yes' : '']),
    gyms: db.gyms.map((g) => [g.id, g.name, g.plate, g.dumbbells, g.kettlebells, JSON.stringify(g.stations || []), JSON.stringify(g.use || {})]),
  };
}

// Plain text keeps the request simple enough for a Google web app to accept.
export async function post(cfg, message) {
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: cfg.key, ...message }),
    redirect: 'follow',
  });
  return r.json();
}
