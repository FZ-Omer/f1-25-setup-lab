# F1 25 Setup Lab

Live: https://fz-omer.github.io/f1-25-setup-lab/

Setups for all 24 F1 25 tracks (+3 reverse layouts) — qualifying, sprint, race short/medium/full, dry & wet, wheel & controller (No TC / No ABS).

## Feedback loop
1. On the **Team Radio** page, pick the setup you drove, tick what the car did, **Send to the pit wall** → a `feedback` issue.
2. Tell Claude "check my F1 feedback".
3. Claude replies on the issue with the fix, adds it to `setups.json`, closes the issue → site updates.

## Data (`setups.json`)
- `tracks[].dry / wet`: 20 values in `derive.js` `KEYS` order (published GIGA baseline, Oct 2025).
- `tuned["<track>|<weather>"]`: `{ key: delta }` fixes, applied on top of every variant.
- `log[]`: `{ date, issue, track, weather, symptom, fix, changes }`.

Check every setup stays in the game's slider ranges: `node check.js`

## Files
`index.html` (setup lab) · `radio.html` (team radio) · `credits.html` (credits & licences) · `site.css` (shared styles) · `app.js` (UI for all pages) · `scene.js` (3D garage) · `sfx.js` (synthesised sound) · `derive.js` (setup rules) · `setups.json` (data) · `audio/` (sounds + CREDITS.txt) · `models/` (3D car + CREDITS.txt) · `tracks/` (circuit layouts, MIT) · `vendor/` (three.js r186, MIT — licence included)

## Licences
Everything here is original or openly licensed: three.js (MIT), Titillium Web + JetBrains Mono (SIL OFL 1.1), 3D car "F1 2026 concept (polygon model)" by Qvist_Designs (CC BY 4.0, see `models/CREDITS.txt`), circuit layouts from bacinger/f1-circuits (MIT, `tracks/LICENSE-f1-circuits.md`), real F1 engine field recordings (CC BY 4.0) and radio static (CC0) — see `audio/CREDITS.txt`. No photos, logos, signatures or quotes of real people or teams. Unofficial fan project — not affiliated with Lewis Hamilton, any F1 team, Formula 1, EA or Codemasters.

## Contact
Credit corrections or removal requests: umarofficemail@gmail.com

© 2026 FZ-Omer.
