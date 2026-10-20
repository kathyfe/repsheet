# repsheet: spec v0.4

Kathy's own workout tracker. Fast to log between sets, built for strength and functional training, and feeding her training data into a Google Sheet that her Health Coach (Kat OS) reads.

Status: draft for Kathy's review, 20 Oct 2026.

## 1. Goals

1. **Logging in seconds.** Every set is prefilled with last time's numbers. One tap logs it as planned; steppers adjust it.
2. **Built for how she trains.** Straight sets, supersets, drop sets and circuits (rounds, EMOM, AMRAP, for time) in one app, with tempo and RPE where she wants them.
3. **Consistency.** The programme is a fixed block of 6 to 8 weeks. The app shows what's planned and what she did last time, and makes it easy to stick to.
4. **Her data, her Sheet.** No accounts and no server. Data lives on her phone and in a Google Sheet in Kat OS Files.
5. **Metric only.** kg, m, seconds. Steppers follow each gym's real increments.

## 2. Who and where

- One user: Kathy, on her Android phone, in the gym, often with patchy signal and sweaty hands.
- Also usable on a laptop for building workouts and looking at history.
- Training week today: 3 strength, 1 hybrid, 1 mobility. Sessions 60 to 70 minutes.
- Trains at more than one gym. Cable machines and weight stacks differ a lot between models, so a cable weight at one gym means little at another.

## 3. MVP scope

### Today
- Shows the next workout in the block's rotation (or lets her pick one).
- Gym picker, defaulting to the last gym used.
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
- **Rest timer** starts on ✓. Silent by default: when rest is up the whole screen changes colour, plus a vibration, so it works with the phone on the floor. Default per exercise, adjustable on the fly.
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

### Gyms and equipment
- A profile per gym: name, barbell plates, dumbbells, kettlebells, and its cable stations and machines.
- Default increments: barbell in 2.5 kg steps (1.25 kg plates each side); dumbbells in 1 kg steps up to 10 kg, then 2 kg steps. Each gym can override these.
- Each cable station or machine has its own stack: a step size, or the actual list of values when the stack is odd (some show 31.5 and 38.3). Steppers jump through those real values.
- Machine notes per gym: seat height, pin position, pulley height, attachment.
- **History follows the equipment.** Barbell, dumbbell, kettlebell and bodyweight work counts across all gyms. Cable and machine work is tracked per gym and machine, so "last time" prefills from that gym. At a new gym, the app shows the other gym's numbers greyed out as a hint and asks for a starting weight.
- The programme stays the same everywhere. Only the numbers depend on the gym.

### History
- Sessions list with duration and feel.
- Per exercise: every set over time and its best set.

### PRs
- Spotted automatically as she logs, per exercise:
  - Heaviest weight, best estimated 1RM, and rep PRs (best weight for 1, 3, 5, 8 and 10 reps).
  - Most reps at bodyweight, longest hold, fastest time or most rounds for circuits and benchmarks, heaviest carry over a set distance.
- Cable and machine PRs count per gym and machine, like their history.
- PR moments: a short on-screen celebration (silent) and a PR badge on the set. A PR board lists the current best for every exercise.

### Graphs
- Per exercise: estimated 1RM and top set over time, with tested maxes from PR sessions marked.
- Weekly training: sessions per week against the plan, volume per movement pattern (squat, hinge, push, pull, carry, core).
- Block view: start of block vs now for the main lifts.
- Benchmark circuits: time or rounds each time she repeats one.

### PR session
- A special session type for testing, done every now and then. Natural slot: the end of a block, so the results set the next block's loads.
- She picks what to test: a 1RM, 3RM or 5RM per lift, and optionally a benchmark circuit.
- **Warm-up ramp** built from her last best, using the gym's real increments, e.g. 50% × 5, 70% × 3, 80% × 2, 90% × 1.
- **Attempt planner:** opener, second and third, with longer rest between attempts. After each attempt she marks it made or missed, and the app suggests the next jump.
- Reminder to set the safeties before heavy attempts.
- Results are saved as tested maxes, feed the graphs, and go to the Health Coach for the next block's numbers.

### Sync and backup
- Each finished session is saved on the phone first, then sent to the Google Sheet when online. Nothing is lost offline.
- Workouts and the library are backed up to the Sheet too, so a new phone can restore.
- Manual export and import of a full JSON backup.

### Lyfta import
- Import Lyfta's CSV export. Exercises are matched to the library; anything unknown gets a quick "match or create" step.
- Lyfta's columns: Title, Date, Duration, Exercise, Superset id, Weight, Reps, Distance, Time, Set Type. One row per set; a session is all rows sharing Title and Date.
- Quirks to handle: trailing spaces and "(male)" or "(female)" in exercise names; empty and "null" both mean no value; Time as "2:00"; durations that were left running (03:33:46) or zero; Set Type NORMAL_SET (plus warm-up, drop and failure types if they appear).
- Imported history goes under a "Lyfta history" gym, so old cable numbers don't prefill at today's gyms.
- Kathy's export (checked 20 Oct 2026): 10 sessions from March to July 2026, 182 sets, 33 exercises. The file itself never goes in this repo.

### Changes from Kathy's first look (prototype 0.2, 20 Oct 2026)
- **Plate visual removed.** It was confusing.
- **Per-set options:** tap a set number to set its tempo (or none), add reps to failure after the tempo reps (e.g. 5 on 3-0-3-0, then 2 to failure), change the set type, or remove the set. Tempo and failure reps can be copied to the remaining sets. Reps to failure count towards PRs and volume.
- **Exercise library** by muscle group: Quads, Hamstrings, Glutes, Back, Chest, Shoulders, Arms, Core, Full body, Conditioning, Mobility, Other. Add and edit exercises with equipment, what you log (weight and reps, reps, time, weight and distance, distance, calories) and each-side. Swaps suggest the same muscle group first.
- **Gyms:** add and edit gyms. Smallest barbell plate, dumbbell and kettlebell sets, and named machine or cable stations with their stack written as a range (5-100/5) or a list (6.5, 12.5, 38.3). Each station lists the exercises that use it. During a workout, a machine or cable exercise with no station at that gym asks which station to use, or lets her add one on the spot.
- **Workout editor:** change sets, reps, time, rest, warm-up sets and tempo; swap or add exercises; pair exercises into supersets; add and edit circuits; reorder and remove blocks. Save for every week, use for today only, or save as a new workout (variants like Back A and Back B). New workouts and deleting workouts too.
- **Changes mid-workout:** add sets, drop sets, rounds and exercises while training. At the end, a toggle keeps today's changes for next time; off by default so the plan stays consistent.
- **PR session:** can be discarded while running or after finishing.
- **Sessions per week:** now a row of squares per week (one per planned session, filled when trained) instead of a bar chart.

## 4. Not in the MVP

- Watch app, heart rate, Google Health sync (Google's API isn't open to new projects yet).
- Body measurements, nutrition, social features.
- The coach writing programmes straight into the app. For now the coach proposes changes in the Saturday review and Kathy applies them in the builder.

Candidates for v1.1: plate calculator, warm-up ramps for normal sessions, progression hints from the rules on the Programme page in Kat OS.

## 5. The Google Sheet

One Sheet, `repsheet log`, in Kat OS Files on Google Drive. Flat rows so the Health Coach (or any model) can read it easily.

**Sets** (one row per set)

| Column | Example |
|---|---|
| date | 2026-10-27 |
| session_id | 2026-10-27-legs-a |
| workout | Legs A: strength |
| gym | Home gym |
| block | B (superset) |
| exercise | Barbell RDL |
| machine | (cable or machine name, blank for free weights) |
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

**Sessions** (one row per session): session_id, date, gym, session_type (normal or PR session), workout, block name, week of block, start, end, duration_min, feel, circuit results, notes.

**PRs** (one row per PR): date, session_id, gym, exercise, machine, PR type (1RM, 3RM, rep PR, estimated 1RM, time, rounds), value, previous best. Set types in **Sets** also include `attempt` (made or missed) for PR sessions.

**Library**, **Workouts** and **Gyms**: backups, one row per exercise, workout or gym (workouts and gym equipment stored as JSON in a cell).

Sending a session again replaces its rows (matched on session_id), so retries never double up.

## 6. How it's built

- **Progressive web app** hosted on GitHub Pages from this repo, at `/app/`. Installs to the home screen from Chrome, works offline, no app store.
- Plain JavaScript modules with no build step, so GitHub Pages serves the repo as it is and any model can read and edit the code. IndexedDB for storage on the phone in the MVP (the prototype uses local storage).
- Two typefaces bundled with the app for offline use: Big Shoulders Display for numbers and headings, Archivo for text (both SIL Open Font Licence).
- A service worker caches every file, so the app opens instantly without signal. Bump its version on every deploy.
- **Sync:** a small Google Apps Script attached to the Sheet receives finished sessions. Its URL and a secret key are entered once in the app's settings on Kathy's phone. They never go in this repo, which is public.
- No personal data in the repo, ever. Code only.

## 7. How the Health Coach uses it

- Reads the Sheet (read only) for the Saturday 10:00 review: sessions done, top sets, PRs, stalls.
- Suggests a PR session near the end of each block, and uses the tested maxes to set the next block's loads.
- Proposes next week's loads using simple written progression rules, so any model makes the same call.
- Exercise swaps only at block end, unless Kathy asks.
- Writes the summary to Kat OS (Notion), plus two lines for Jarvis's Sunday review.

## 8. Milestones

1. **Spec agreed.** This document.
2. **Clickable prototype:** Today, Workout in progress, circuit timers, PR moments, PR board, graphs and PR session, with sample data. Live at https://kathyfe.github.io/repsheet/app/ (prototype 0.2, 20 Oct 2026). Kathy tries it in the gym.
3. **MVP:** storage, builder, library, gyms, history, PRs, graphs, PR session, installable, Sheet sync.
4. **Lyfta import and coach hook-up:** history in, Health Coach's weekly review skill reads the Sheet.
5. **First functional block** built in the app and running.

## 9. Open questions

Answered 20 Oct 2026: Lyfta export received; barbell 1.25 kg plates; dumbbells 1 kg steps to 10 kg, then 2 kg; rest timer silent, phone on the floor; several gyms with different cable machines.

Still open:
1. Progression: a default rule for the coach (e.g. hit the top of the rep range on every set, add 2.5 kg) or her own?
2. Tempo notation: four digits (3-1-1-0) fine?
3. Which gyms to set up first (names are enough; equipment can be added on the first visit).
4. Any watch she'd want to log from later?
