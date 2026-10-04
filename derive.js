// Pure setup logic — shared by index.html (browser) and check.js (node).
const KEYS = ['fw','rw','don','doff','fc','rc','ft','rt','fs','rs','farb','rarb','frh','rrh','bb','bp','tfr','tfl','trr','trl'];

// [min, max, decimals] — F1 25 slider ranges as listed by GIGA (Oct 2025).
const RANGE = {
  fw:[0,50,0], rw:[0,50,0], don:[10,100,0], doff:[10,100,0],
  fc:[-3.5,-2.5,2], rc:[-2.2,-0.7,2], ft:[0,0.5,2], rt:[0,0.5,2],
  fs:[1,41,0], rs:[1,41,0], farb:[1,21,0], rarb:[1,21,0], frh:[10,40,0], rrh:[40,100,0],
  bb:[50,70,0], bp:[80,100,0], tfr:[22.5,29.5,1], tfl:[22.5,29.5,1], trr:[20.5,26.5,1], trl:[20.5,26.5,1],
};

// Tyre-life demand per session. Quali = the published baseline untouched.
const WEAR = { quali:0, sprint:1, short:1, medium:2, full:3 };

// Direction of every rule is sourced; step sizes are our own heuristic (stated on the page).
const RULES = {
  R1: 'Longer distance → +0.2 psi per wear step (dry). EA: higher pressure makes tyres last longer.',
  R2: 'Heavy fuel (medium/full race) → brake bias 1% rearward. Traxion: heavy fuel needs more rearward bias.',
  R3: 'No traction control on wheel → on-throttle diff −10 (−15 full race). Traxion: drop 10–20% if struggling for control.',
  R4: 'Controller → on-throttle diff 10, rear wing 3 clicks above front. F1Laps controller guide.',
  R5: 'Off-throttle diff ≥ 50 for controller / long races. Traxion: higher = more entry stability, 50–60% recommended.',
  R8: 'Reverse layout → no published setup; forward-layout baseline used. Test before trusting.',
  TUNED: 'Changed after your driver feedback — see Tuning Log.',
};

function derive(data, trackId, { weather, session, length, input }) {
  const track = data.tracks.find(t => t.id === trackId);
  const src = track.baseOf ? data.tracks.find(t => t.id === track.baseOf) : track;
  const base = Object.fromEntries(KEYS.map((k, i) => [k, src[weather][i]]));
  const v = { ...base }, why = {};
  const set = (k, val, rule) => {
    const [lo, hi, d] = RANGE[k];
    val = +Math.min(hi, Math.max(lo, val)).toFixed(d);
    if (val !== v[k]) { v[k] = val; (why[k] ??= []).push(rule); }
  };

  const lvl = session === 'race' ? WEAR[length] : WEAR[session];
  if (weather === 'dry') for (const k of ['tfr','tfl','trr','trl']) set(k, v[k] + 0.2 * lvl, 'R1');
  if (lvl >= 2) { set('bb', v.bb - 1, 'R2'); set('doff', Math.max(v.doff, 50), 'R5'); }
  if (input === 'wheel') {
    set('don', v.don - (session === 'race' && length === 'full' ? 15 : 10), 'R3');
  } else {
    set('don', 10, 'R4');
    set('doff', Math.max(v.doff, 50), 'R5');
    if (v.rw < v.fw + 3) v.fw + 3 <= 50 ? set('rw', v.fw + 3, 'R4') : set('fw', v.rw - 3, 'R4');
  }
  // Feedback fixes: deltas per track|weather, applied on top of every variant.
  const tuned = data.tuned[`${trackId}|${weather}`] || {};
  for (const [k, delta] of Object.entries(tuned)) if (k in RANGE) set(k, v[k] + delta, 'TUNED');

  return { v, base, why, reverse: !!track.baseOf, track };
}

if (typeof module !== 'undefined') module.exports = { KEYS, RANGE, WEAR, RULES, derive };
