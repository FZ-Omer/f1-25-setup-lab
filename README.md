# F1 25 Setup Lab

Live: https://fz-omer.github.io/f1-25-setup-lab/

Setups for all 24 F1 25 tracks (+3 reverse layouts) — qualifying, sprint, race short/medium/full, dry & wet, wheel & controller (No TC / No ABS).

## Feedback loop
1. On the site, pick the setup you drove, tick what the car did, **Send to GitHub** → a `feedback` issue.
2. Tell Claude "check my F1 feedback".
3. Claude replies on the issue with the fix, adds it to `setups.json`, closes the issue → site updates.

## Data (`setups.json`)
- `tracks[].dry / wet`: 20 values in `derive.js` `KEYS` order (published GIGA baseline, Oct 2025).
- `tuned["<track>|<weather>"]`: `{ key: delta }` fixes, applied on top of every variant.
- `log[]`: `{ date, issue, track, weather, symptom, fix, changes }`.

Check every setup stays in the game's slider ranges: `node check.js`
