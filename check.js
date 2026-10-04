// Run: node check.js — fails loudly if any setup leaves the game's slider ranges.
const assert = require('assert');
const { KEYS, RANGE, derive } = require('./derive.js');
const data = require('./setups.json');

let n = 0;
for (const t of data.tracks) {
  for (const weather of ['dry', 'wet']) {
    if (!t.baseOf) assert.strictEqual(t[weather].length, KEYS.length, `${t.id} ${weather} length`);
    for (const [session, length] of [['quali'], ['sprint'], ['race','short'], ['race','medium'], ['race','full']])
      for (const input of ['wheel', 'controller']) {
        const { v, base } = derive(data, t.id, { weather, session, length, input });
        for (const k of KEYS) {
          const [lo, hi] = RANGE[k];
          assert(base[k] >= lo && base[k] <= hi, `base ${t.id} ${weather} ${k}=${base[k]} outside ${lo}..${hi}`);
          assert(v[k] >= lo && v[k] <= hi, `${t.id} ${weather} ${session} ${input} ${k}=${v[k]}`);
        }
        if (input === 'controller') assert(v.don === 10 && v.rw >= v.fw + 3, `${t.id} controller rule`);
        n++;
      }
  }
}
const q = derive(data, 'bahrain', { weather:'dry', session:'quali', input:'wheel' });
const f = derive(data, 'bahrain', { weather:'dry', session:'race', length:'full', input:'wheel' });
assert(q.v.tfr === 28.5 && f.v.tfr === 29.1 && f.v.bb === 54 && f.v.don === 60, 'bahrain rule chain');
console.log(`ok — ${n} setups in range`);
