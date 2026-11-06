/**
 * repsheet sync. Files finished sessions from the app in this Sheet.
 * Paste it into Extensions > Apps Script, swap in your key, and deploy as a web app.
 * @OnlyCurrentDoc
 */

const KEY = 'PASTE_YOUR_KEY_HERE';

const TABS = {
  Sets: ['date', 'session_id', 'workout', 'gym', 'block', 'exercise', 'machine', 'set_no', 'set_type', 'kg', 'reps', 'time_s', 'distance_m', 'calories', 'tempo', 'rpe', 'swapped_from', 'notes'],
  Sessions: ['session_id', 'date', 'gym', 'session_type', 'workout', 'block_name', 'week_of_block', 'start', 'end', 'duration_min', 'feel', 'circuit_results', 'notes'],
  PRs: ['date', 'session_id', 'gym', 'exercise', 'machine', 'pr_type', 'value', 'previous_best'],
  Workouts: ['order', 'id', 'name', 'focus', 'about_minutes', 'summary', 'json'],
  Library: ['id', 'name', 'muscle_group', 'equipment', 'tracking', 'each_side'],
  Gyms: ['id', 'name', 'smallest_plate', 'dumbbells', 'kettlebells', 'stations_json', 'uses_json'],
};

// Sheets would read these as dates, times or sums, so they stay plain text.
const TEXT_COLUMNS = ['date', 'tempo', 'start', 'end', 'dumbbells', 'kettlebells'];

function doGet() {
  return reply({ ok: true, app: 'repsheet sync' });
}

function doPost(e) {
  const m = JSON.parse(e.postData.contents);
  if (m.key !== KEY) return reply({ ok: false, error: 'key' });
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    Object.keys(TABS).forEach(tab);
    if (m.session) {
      replace('Sets', m.session.id, m.session.sets);
      replace('Sessions', m.session.id, [m.session.session]);
      replace('PRs', m.session.id, m.session.prs);
    }
    if (m.programme) {
      overwrite('Workouts', m.programme.workouts);
      overwrite('Library', m.programme.library);
      overwrite('Gyms', m.programme.gyms);
    }
    return reply({ ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() });
  } finally {
    lock.releaseLock();
  }
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Finds a tab, or makes it. The empty first tab becomes Sets.
function tab(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  const all = ss.getSheets();
  const blank = all.length === 1 && all[0].getLastRow() === 0 && !TABS[all[0].getName()];
  sh = blank ? all[0].setName(name) : ss.insertSheet(name);
  const head = TABS[name];
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function clean(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' && /^[=+@]/.test(v) ? `'${v}` : v;
}

function append(name, rows) {
  if (!rows || !rows.length) return;
  const sh = tab(name);
  const head = TABS[name];
  const start = sh.getLastRow() + 1;
  const short = start + rows.length - 1 - sh.getMaxRows();
  if (short > 0) sh.insertRowsAfter(sh.getMaxRows(), short);
  head.forEach((h, c) => {
    if (TEXT_COLUMNS.includes(h)) sh.getRange(start, c + 1, rows.length, 1).setNumberFormat('@');
  });
  sh.getRange(start, 1, rows.length, head.length).setValues(rows.map((r) => head.map((_, i) => clean(r[i]))));
}

// Sending a session again swaps its rows, so retries never double up.
function replace(name, id, rows) {
  const sh = tab(name);
  const col = TABS[name].indexOf('session_id') + 1;
  const last = sh.getLastRow();
  const old = [];
  if (last > 1) {
    sh.getRange(2, col, last - 1, 1).getValues().forEach((r, i) => {
      if (r[0] === id) old.push(i + 2);
    });
  }
  append(name, rows);
  old.reverse().forEach((row) => sh.deleteRow(row));
}

function overwrite(name, rows) {
  const sh = tab(name);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, TABS[name].length).clearContent();
  append(name, rows);
}
