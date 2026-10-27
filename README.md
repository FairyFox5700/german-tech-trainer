# WerkWort

A static, privacy-first trainer for **technical vocabulary, active German grammar from A1–C1, and TELC B2 listening practice**. It runs entirely in the browser and is designed for GitHub Pages.

## Features

- Deterministic daily technical-vocabulary set
- 48 original active-grammar sentence cards across A1, B1, B2, and C1
- Configurable practice sessions from 1–100 cards, with pause and resume
- Seven-day TELC B2 YouTube listening plan with local completion tracking
- Optional vocabulary practice by field, level, and mode
- German word and example-sentence speech via the Web Speech API
- Again / Hard / Good / Easy spaced repetition
- Weekly and monthly progress
- Searchable 150-term technical library
- Saved-word dashboard and dedicated saved-word practice
- Listen-first mode
- Local export, import, and reset
- Offline support after the first successful load
- Responsive, keyboard-accessible interface

> The vocabulary is aligned with CEFR B2–C1 and Goethe-Zertifikat practice skills. It is original editorial content, not an official Goethe-Institut word list.

## Run locally

```bash
python -m http.server 4173
```

Open `http://127.0.0.1:4173/`.

## Test

```bash
npm run check
```

The pure domain suite covers deterministic selection, deduplication, spaced repetition, date boundaries, and progress aggregation. `npm run smoke` runs the browser flow while the local server is active.

## Add vocabulary

1. Add a permanent, unique entry to `content/catalog.json`.
2. Keep `level` to `B2` or `C1` and include the German/English example pair.
3. Increment `catalogVersion`.
4. Run `npm run validate`.

Never reuse an ID. Corrections should keep the ID and increment the entry revision so existing learner progress remains attached.

## Scheduling contract

- **Again:** due in 10 minutes; enters relearning.
- **Hard:** first interval 1 day, then grows by 1.2×; ease decreases.
- **Good:** 1 day, 3 days, then current interval × ease.
- **Easy:** first interval 4 days, then current interval × ease × 1.3.

All progress is stored under the namespaced browser key `werkwort.state.v1`.
