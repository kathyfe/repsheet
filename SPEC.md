# repsheet: spec v0.1

Kathy's own workout tracker. Fast to log between sets, built for strength and functional training, and feeding her training data into a Google Sheet that her Health Coach (Kat OS) reads.

Status: draft for Kathy's review, 20 Oct 2026.

## 1. Goals

1. **Logging in seconds.** Every set is prefilled with last time's numbers. One tap logs it as planned; steppers adjust it.
2. **Built for how she trains.** Straight sets, supersets, drop sets and circuits (rounds, EMOM, AMRAP, for time) in one app, with tempo and RPE where she wants them.
3. **Consistency.** The programme is a fixed block of 6 to 8 weeks. The app shows what's planned and what she did last time, and makes it easy to stick to.
4. **Her data, her Sheet.** No accounts and no server. Data lives on her phone and in a Google Sheet in Kat OS Files.
5. **Metric only.** kg, m, seconds. Whole plates, sensible increments.

## 2. Who and where

- One user: Kathy, on her Android phone, in the gym, often with patchy signal and sweaty hands.
- Also usable on a laptop for building workouts and looking at history.
- Training week today: 3 strength, 1 hybrid, 1 mobility. Sessions 60 to 70 minutes.

## 3. MVP scope

### Today
- Shows the next workout in the block's rotation (or lets her pick one).
- For each exercise: last time's top set and today's target.
- Start button.

### Workout in progress
- One screen per block, scrolling.
- **Set rows** prefilled from last session: kg, reps (or time, distance, calories, depending on the exercise). Tap ✓ to log, steppers to adjust.
- **Set types:** warm-up, working, drop, to failure. A drop set chains drops under its parent set.
- **Supersets:** A1, A2 (A3) alternate automatically, rest after the last exercise in the round.
- **Circuits:** rounds counter plus the right timer:
  - Rounds: rest between rounds.
  - EMOM: beeps each minute, shows which exercise is up.
  - AMRAP: countdown, logs rounds plus extra reps.
  - For time: stopwatch with optional time cap.
- **Rest timer** starts on ✓, with vibration and sound. Default per exercise, adjustable on the fly.
- **Tempo** shown per exercise when prescribed (e.g. 3-1-1-0).
- **Swap exercise** when equipment is busy. Logged as a swap for this session only; the programme stays as it is.
- Notes per set and per session. End-of-session "how did it feel" (1 to 5).
- Screen stays awake during a workout.

### Builder
- Workouts made of blocks: straight sets, superset, circuit (rounds, EMOM, AMRAP, for time).
- Per exercise: sets, reps or rep range (8 to 10), target kg or RPE, tempo, rest, notes.
- Drag to reorder. Duplicate a workout (handy for Legs A and Legs B).
- Group workouts into a **block** with a start date and length in weeks.

### Exercise library
- Starter library of common strength, functional, carry and mobility moves.
- Each exercise has a tracking type: kg × reps, reps only, time, distance, kg × distance (carries, sleds), calories (rower, ski erg, bike).
- Unilateral flag (logs left and right as one set unless she splits them).
- Add custom exercises.

### History
- Sessions list with duration and feel.
- Per exercise: every set over time, best set, estimated 1RM trend for kg × reps moves.

### Sync and backup
- Each finished session is saved on the phone first, then sent to the Google Sheet when online. Nothing is lost offline.
- Workouts and the library are backed up to the Sheet too, so a new phone can restore.
- Manual export and import of a full JSON backup.

### Lyfta import
- Import Lyfta's CSV export. Exercises are matched to the library; anything unknown gets a quick "match or create" step.

## 4. Not in the MVP

- Watch app, heart rate, Google Health sync (Google's API isn't open to new projects yet).
- Body measurements, nutrition, social features.
- The coach writing programmes straight into the app. For now the coach proposes changes in the Saturday review and Kathy applies them in the builder.

Candidates for v1.1: plate calculator, warm-up set generator, progression hints from the rules on the Programme page in Kat OS, PR moments with a bit of fanfare.

## 5. The Google Sheet

One Sheet, `repsheet log`, in Kat OS Files on Google Drive. Flat rows so the Health Coach (or any model) can read it easily.

**Sets** (one row per set)

| Column | Example |
|---|---|
| date | 2026-10-27 |
| session_id | 2026-10-27-legs-a |
| workout | Legs A: strength |
| block | B (superset) |
| exercise | Barbell RDL |
| set_no | 3 |
| set_type | working |
| kg | 70 |
| reps | 8 |
| time_s | |
| distance_m | |
| calories | |
| tempo | 3-1-1-0 |
| rpe | 8 |
| swapped_from | |
| notes | grip went first |

**Sessions** (one row per session): session_id, date, workout, block name, week of block, start, end, duration_min, feel, circuit results, notes.

**Library** and **Workouts**: backups, one row per exercise or workout (workouts stored as JSON in a cell).

Sending a session again replaces its rows (matched on session_id), so retries never double up.

## 6. How it's built

- **Progressive web app** hosted on GitHub Pages from this repo, at `/app/`. Installs to the home screen from Chrome, works offline, no app store.
- TypeScript, a small UI library, IndexedDB for storage on the phone.
- **Sync:** a small Google Apps Script attached to the Sheet receives finished sessions. Its URL and a secret key are entered once in the app's settings on Kathy's phone. They never go in this repo, which is public.
- No personal data in the repo, ever. Code only.

## 7. How the Health Coach uses it

- Reads the Sheet (read only) for the Saturday 10:00 review: sessions done, top sets, PRs, stalls.
- Proposes next week's loads using simple written progression rules, so any model makes the same call.
- Exercise swaps only at block end, unless Kathy asks.
- Writes the summary to Kat OS (Notion), plus two lines for Jarvis's Sunday review.

## 8. Milestones

1. **Spec agreed.** This document.
2. **Clickable prototype:** Today, Workout in progress and the circuit timers, with dummy data. Kathy tries it in the gym.
3. **MVP:** storage, builder, library, history, installable, Sheet sync.
4. **Lyfta import and coach hook-up:** history in, Health Coach's weekly review skill reads the Sheet.
5. **First functional block** built in the app and running.

## 9. Open questions

1. Lyfta CSV: export it and attach it, so the importer matches its columns.
2. Increments: smallest jump on barbell (2.5 kg or 1.25 kg plates?) and on dumbbells at her gym.
3. Rest timer: sound, vibration or both? Phone in pocket or on the floor?
4. Progression: a default rule for the coach (e.g. hit the top of the rep range on every set, add 2.5 kg) or her own?
5. Tempo notation: four digits (3-1-1-0) fine?
6. Any watch she'd want to log from later?
