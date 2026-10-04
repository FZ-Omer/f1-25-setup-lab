import { sfx } from './sfx.js';

// One script for all three pages; <body data-page="home|radio|credits"> decides what runs.
const PAGE = document.body.dataset.page || 'home';
const REPO = 'FZ-Omer/f1-25-setup-lab';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches;
const $ = s => document.querySelector(s);
const LABEL = {
  fw:['Front wing','0–50'], rw:['Rear wing','0–50'], don:['Diff on-throttle','%'], doff:['Diff off-throttle','%'],
  fc:['Front camber','°'], rc:['Rear camber','°'], ft:['Front toe-out','°'], rt:['Rear toe-in','°'],
  fs:['Front suspension','1–41'], rs:['Rear suspension','1–41'], farb:['Front anti-roll bar','1–21'], rarb:['Rear anti-roll bar','1–21'],
  frh:['Front ride height','10–40'], rrh:['Rear ride height','40–100'], bb:['Front brake bias','%'], bp:['Brake pressure','%'],
  tfr:['Front right','psi'], tfl:['Front left','psi'], trr:['Rear right','psi'], trl:['Rear left','psi'],
};
const GROUPS = [['Aerodynamics',['fw','rw']],['Transmission',['don','doff']],['Suspension geometry',['fc','rc','ft','rt']],
  ['Suspension',['fs','rs','farb','rarb','frh','rrh']],['Brakes',['bb','bp']],['Tyres',['tfr','tfl','trr','trl']]];
const ZONE = {fw:'z-fw',rw:'z-rw',don:'z-diff',doff:'z-diff',fc:'z-fsus',ft:'z-fsus',fs:'z-fsus',farb:'z-fsus',frh:'z-fsus',
  rc:'z-rsus',rt:'z-rsus',rs:'z-rsus',rarb:'z-rsus',rrh:'z-rsus',bb:'z-brk',bp:'z-brk',tfr:'z-tfr',tfl:'z-tfl',trr:'z-trr',trl:'z-trl'};
const OPTS = {
  weather:[['dry','Dry'],['wet','Wet']],
  session:[['quali','Qualifying'],['sprint','Sprint'],['race','Race']],
  length:[['short','Short · 5 laps/25%'],['medium','Medium · 35/50%'],['full','Full · 100%']],
  input:[['wheel','Wheel'],['controller','Controller']],
};
const SYMPTOMS = ['Understeer – entry','Understeer – mid-corner','Understeer – exit','Oversteer – entry','Oversteer – mid-corner','Oversteer – exit',
  'Wheelspin / snap on throttle','Front lock-ups','Rear lock-ups','Unstable over kerbs','Bottoming / sparks','Slow on straights',
  'Front tyre wear high','Rear tyre wear high','Uneven left/right wear','Tyres overheating'];

let data, TR = {}, lastTrack = null, scene = null, state = { track:'australia', weather:'dry', session:'quali', length:'full', input:'wheel' }, shown = {};
const fmt = (k, x) => x.toFixed(RANGE[k][2]);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const clamp = x => Math.max(0, Math.min(1, x));

// ---------------- state <-> URL (nav links carry it, so every page shows the same setup) ----------------
function readHash(){
  const [track, weather, session, length, input] = location.hash.slice(1).split('/');
  if (data.tracks.some(t => t.id === track)) state.track = track;
  for (const [k, v] of Object.entries({weather, session, length, input})) if (OPTS[k].some(o => o[0] === v)) state[k] = v;
}
function writeHash(){
  const h = `#${state.track}/${state.weather}/${state.session}/${state.length}/${state.input}`;
  history.replaceState(null, '', h);
  document.querySelectorAll('a[data-nav]').forEach(a => a.href = a.dataset.nav + h);
}

// ---------------- UI build ----------------
function buildControls(){
  $('#tracks').innerHTML = data.tracks.map((t, i) => `<button type="button" data-id="${t.id}" aria-pressed="false"><em>${t.baseOf ? 'REV' : 'R' + String(data.tracks.filter((x, j) => j <= i && !x.baseOf).length).padStart(2, '0')}</em>${t.name}<small>${t.circuit}</small><svg class="mini" viewBox="0 0 100 56" aria-hidden="true"><path d="${mapPath(t.baseOf || t.id, 100, 56, 4)}"/></svg></button>`).join('');
  $('#tracks').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.id !== state.track) { state.track = b.dataset.id; sfx.passby(1.1, 0.6); update(); radioMsg(`Copy. ${b.firstChild.nextSibling.textContent} setup loaded.`); } };
  for (const key of Object.keys(OPTS)) {
    const fs = $(`#${key}Seg`);
    fs.insertAdjacentHTML('beforeend', OPTS[key].map(([v, l]) => `<input type="radio" name="${key}" id="${key}-${v}" value="${v}"><label for="${key}-${v}">${l}</label>`).join(''));
    fs.onchange = e => {
      state[key] = e.target.value;
      if (key === 'weather') { sfx.tick(); sfx.rain(state.weather === 'wet'); radioMsg(state.weather === 'wet' ? 'Rain is coming. Wet setup is on the sheet.' : 'Track is drying. Dry setup loaded.'); } else sfx.shift();
      update();
    };
  }
  if ($('#symp')) {
    $('#symp').insertAdjacentHTML('beforeend', SYMPTOMS.map((s, i) => `<input type="checkbox" id="s${i}" value="${s}"><label for="s${i}">${s}</label>`).join(''));
    $('#symp').onchange = () => { sfx.tick(); $('#fbSend').disabled = !document.querySelector('#symp input:checked'); };
  }
  if ($('#groups')) {
    $('#groups').innerHTML = GROUPS.map(([g, keys]) => `<div class="group"><h4>${g}</h4>${keys.map(k =>
      `<div class="rowp" tabindex="0" data-k="${k}"><div class="n">${LABEL[k][0]}<small>${LABEL[k][1]}</small></div><div class="bar"><div class="fill"></div><div class="base"></div></div><div class="val">–</div><div class="tag"></div><div class="why"></div></div>`).join('')}</div>`).join('');
    // phones can't hover: tap a row to read why it differs from the published base
    $('#groups').addEventListener('click', e => { const r = e.target.closest('.rowp'); if (r) r.classList.toggle('open'); });
    const hot = k => {
      document.querySelectorAll('.car .hot').forEach(z => z.classList.remove('hot'));
      if (k) document.getElementById(ZONE[k]).classList.add('hot');
      scene?.highlight(k);
    };
    $('#groups').addEventListener('pointerover', e => hot(e.target.closest('.rowp')?.dataset.k));
    $('#groups').addEventListener('focusin', e => hot(e.target.closest('.rowp')?.dataset.k));
    $('#groups').addEventListener('pointerleave', () => hot());
    $('#groups').addEventListener('focusout', () => hot());
  }
}

// SVG outline of a circuit, fitted into a w×h box (north up)
function mapPath(id, w, h, pad){
  const p = TR[id]?.pts; if (!p) return '';
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]), x0 = Math.min(...xs), y1 = Math.max(...ys);
  const sc = Math.min((w - 2 * pad) / (Math.max(...xs) - x0), (h - 2 * pad) / (y1 - Math.min(...ys)));
  const ox = (w - (Math.max(...xs) - x0) * sc) / 2, oy = (h - (y1 - Math.min(...ys)) * sc) / 2;
  return 'M' + p.map(([x, y]) => `${(ox + (x - x0) * sc).toFixed(1)},${(oy + (y1 - y) * sc).toFixed(1)}`).join('L') + 'Z';
}
function drawMap(svg, id, w, h, pad){
  svg.querySelector('path').setAttribute('d', mapPath(id, w, h, pad));
  svg.classList.remove('draw'); void svg.getBoundingClientRect(); svg.classList.add('draw');
}

function tick(el, from, to, k){
  if (reduce || from === undefined || from === to) { el.textContent = fmt(k, to); return; }
  const t0 = performance.now(), d = 700;
  const step = now => { const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(k, from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function notes(r){
  const n = [];
  if (r.reverse) n.push(RULES.R8);
  n.push(state.weather === 'wet' ? 'Wet base is its own published wet setup — not a modified dry one.' : 'Qualifying = the published baseline untouched; sprint/race variants add tyre-life and stability tweaks.');
  if (state.session === 'sprint') n.push('Sprint weekend: parc fermé may lock your setup after practice (F1 25 rule not verified). If it does, run this Sprint setup for the Grand Prix too.');
  if (state.session === 'race') n.push('Diff can be changed on track: as fuel burns off and the rears wear, raise off-throttle a few % to calm entry oversteer (Traxion).');
  n.push('No ABS: locking fronts? Drop brake pressure 2–4% or move bias 1% rearward (Traxion). No TC: short-shift out of slow corners.');
  if (state.input === 'controller') n.push('Controller: on-throttle 10 is the stability floor (F1Laps). If exits feel lazy, raise it in +5 steps.');
  return n;
}

function update(){
  writeHash();
  document.querySelectorAll('#tracks button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === state.track));
  const active = document.querySelector(`#tracks [data-id="${state.track}"]`), strip = $('#tracks');
  strip.scrollTo({ left: active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  for (const key of Object.keys(OPTS)) document.getElementById(`${key}-${state[key]}`).checked = true;
  $('#lengthSeg').hidden = state.session !== 'race';
  const r = derive(data, state.track, state);
  const sess = OPTS.session.find(o => o[0] === state.session)[1] + (state.session === 'race' ? ' · ' + OPTS.length.find(o => o[0] === state.length)[1] : '');
  window._current = r;
  if (PAGE === 'home') updateLab(r, sess); else updateRadio(r, sess);
}

function updateLab(r, sess){
  const v = r.v;
  $('#tName').textContent = r.track.name; $('#tCirc').textContent = r.track.circuit;
  if (state.track !== lastTrack) {           // real layout under the 3D car + redraw the panel's track map
    const base = r.track.baseOf || r.track.id;
    if (TR[base]) scene?.setTrack(TR[base].pts, !!r.track.baseOf, lastTrack !== null);
    drawMap($('#tmap'), base, 160, 90, 6);
    $('#tLen').textContent = TR[base] ? `${(TR[base].len / 1000).toFixed(3)} km${r.track.baseOf ? ' · reversed' : ''}` : '';
    lastTrack = state.track;
  }
  const df = v.fw + v.rw, dfl = df < 30 ? 'Low downforce' : df < 70 ? 'Medium downforce' : 'High downforce';
  $('#carChips').innerHTML = `<span class="chip acc">${dfl}</span><span class="chip">Aero ${v.fw}/${v.rw}</span>${state.weather === 'wet' ? '<span class="chip wx">Wet</span>' : ''}${r.reverse ? '<span class="chip amber">Reverse · untested</span>' : ''}`;
  $('#sheetSub').textContent = `${r.track.name} · ${state.weather === 'dry' ? 'Dry' : 'Wet'} · ${sess} · ${state.input === 'wheel' ? 'Wheel' : 'Controller'} · No TC / No ABS`;
  const nDer = Object.values(r.why).filter(w => !w.includes('TUNED')).length, tuned = Object.values(r.why).some(w => w.includes('TUNED'));
  $('#sheetChips').innerHTML = `<span class="chip">${20 - Object.keys(r.why).length} base</span><span class="chip amber">${nDer} derived</span>${tuned ? '<span class="chip green">tuned by feedback</span>' : ''}`;

  document.querySelectorAll('.rowp').forEach((row, i) => {
    const k = row.dataset.k, [lo, hi] = RANGE[k], why = r.why[k] || [], pct = x => (x - lo) / (hi - lo);
    const fill = row.querySelector('.fill');
    fill.style.transitionDelay = reduce ? '0s' : i * 24 + 'ms';
    fill.style.transform = `scaleX(${Math.max(0.015, pct(v[k]))})`;
    row.querySelector('.base').style.left = `calc(${pct(r.base[k]) * 100}% - 1px)`;
    tick(row.querySelector('.val'), shown[k], v[k], k);
    row.classList.toggle('changed', why.length > 0 && !why.includes('TUNED'));
    row.classList.toggle('tuned', why.includes('TUNED'));
    row.querySelector('.tag').innerHTML = why.map(w => `<span class="chip ${w === 'TUNED' ? 'green' : 'amber'}" title="${esc(RULES[w])}">${w}</span>`).join(' ');
    row.title = why.length ? `Base ${fmt(k, r.base[k])} → ${fmt(k, v[k])}. ` + why.map(w => RULES[w]).join(' ') : 'Published base value';
    row.querySelector('.why').innerHTML = why.length ? `Base ${fmt(k, r.base[k])} → ${fmt(k, v[k])}<br>` + why.map(w => `<b>${w}</b> ${esc(RULES[w])}`).join('<br>') : 'Published base value — unchanged.';
  });
  shown = { ...v };
  // 2D fallback labels + tyre heat
  $('#lFW').textContent = `FW ${v.fw}`; $('#lRW').textContent = `RW ${v.rw}`;
  $('#lFL').textContent = fmt('tfl', v.tfl); $('#lFR').textContent = fmt('tfr', v.tfr);
  $('#lRL').textContent = fmt('trl', v.trl); $('#lRR').textContent = fmt('trr', v.trr);
  for (const k of ['tfl','tfr','trl','trr']) { const [lo, hi] = RANGE[k], p = (v[k] - lo) / (hi - lo);
    document.getElementById(ZONE[k]).style.setProperty('--heat', `hsl(${200 - p * 190} 85% 55%)`); }
  // 3D HUD labels
  hud.fw.innerHTML = `<small>FRONT WING</small>${v.fw}`; hud.rw.innerHTML = `<small>REAR WING</small>${v.rw}`;
  for (const k of ['tfl','tfr','trl','trr']) hud[k].innerHTML = `<small>${k.slice(1).toUpperCase()} PSI</small>${fmt(k, v[k])}`;
  scene?.setSetup(v, RANGE); scene?.setWeather(state.weather);
  $('#notes').innerHTML = notes(r).map((t, i) => `<li style="animation-delay:${i * 70}ms">${t}</li>`).join('');
}

function updateRadio(r, sess){
  if (state.track !== lastTrack) { drawMap($('#bgmap'), r.track.baseOf || r.track.id, 160, 90, 4); lastTrack = state.track; }
  $('#fbCtx').innerHTML = `<span class="chip acc">${r.track.name}</span><span class="chip">${state.weather}</span><span class="chip">${sess}</span><span class="chip">${state.input}</span>`;
  $('#ranSheet').innerHTML = GROUPS.map(([g, keys]) => `<div><h4>${g}</h4>${keys.map(k => {
    const w = r.why[k] || [], c = w.includes('TUNED') ? 'tuned' : w.length ? 'changed' : '';
    return `<div class="kv"><span>${LABEL[k][0]}</span><b class="${c}">${fmt(k, r.v[k])}</b></div>`; }).join('')}</div>`).join('');
}

// ---------------- feedback → GitHub issue (radio page) ----------------
function setupLine(v){
  return `FW ${v.fw} · RW ${v.rw} · Diff ${v.don}/${v.doff} · Camber ${fmt('fc',v.fc)}/${fmt('rc',v.rc)} · Toe ${fmt('ft',v.ft)}/${fmt('rt',v.rt)} · Susp ${v.fs}/${v.rs} · ARB ${v.farb}/${v.rarb} · RH ${v.frh}/${v.rrh} · Bias ${v.bb} · BP ${v.bp} · Tyres FR ${fmt('tfr',v.tfr)} FL ${fmt('tfl',v.tfl)} RR ${fmt('trr',v.trr)} RL ${fmt('trl',v.trl)}`;
}
if ($('#fbForm')) $('#fbForm').onsubmit = e => {
  e.preventDefault(); radioMsg('Copy that. Feedback is with the engineers, fix coming.');
  const r = window._current, sym = [...document.querySelectorAll('#symp input:checked')].map(i => i.value);
  const sess = state.session === 'race' ? `Race ${state.length}` : state.session;
  const title = `[Feedback] ${r.track.name} · ${state.weather} · ${sess} · ${state.input} — ${sym.join(', ')}`.slice(0, 240);
  const body = [
    '### Context', `- Track: ${r.track.name} (${state.weather})`, `- Session: ${sess}`, `- Input: ${state.input} · No TC / No ABS`,
    `- Compound: ${$('#fbTyre').value} · Corners: ${$('#fbSpeed').value}`, `- Setup used: ${setupLine(r.v)}`,
    '', '### Symptoms', ...sym.map(s => `- ${s}`), '', '### Where', $('#fbWhere').value || '—',
    '', '### Best lap', $('#fbLap').value || '—', '', '### Notes', $('#fbNotes').value || '—', '',
    `<!-- data ${JSON.stringify({ ...state, setup: r.v })} -->`,
  ].join('\n');
  open(`https://github.com/${REPO}/issues/new?labels=feedback&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
};

function renderLog(){
  const name = id => data.tracks.find(t => t.id === id)?.name || id;
  $('#log').innerHTML = data.log.length ? data.log.slice().reverse().map(l => `<div class="entry">
      <div class="meta">${esc(l.date)} · <a href="https://github.com/${REPO}/issues/${+l.issue}">#${+l.issue}</a> · ${esc(name(l.track))} · ${esc(l.weather)}</div>
      <div><b>${esc(l.symptom)}</b> → ${esc(l.fix)}</div>
      <div class="chips">${Object.entries(l.changes).map(([k, d]) => `<span class="chip green">${esc(LABEL[k]?.[0] || k)} ${d > 0 ? '+' : ''}${d}</span>`).join('')}</div></div>`).join('')
    : '<div class="empty">No fixes yet — your first radio message lands here.</div>';
  fetch(`https://api.github.com/repos/${REPO}/issues?labels=feedback&state=open&per_page=20`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(list => $('#pending').innerHTML = list.length ? list.map(i => `<div class="entry"><div class="meta">#${i.number} · ${i.created_at.slice(0, 10)}</div><a href="${esc(i.html_url)}">${esc(i.title)}</a></div>`).join('') : 'Nothing open — all feedback handled.')
    .catch(() => $('#pending').textContent = "Couldn't reach GitHub right now.");
}

// ---------------- motion: reveals, marquee, career colour, scroll speed ----------------
function splitWords(el){
  let i = 0;
  const walk = node => [...node.childNodes].forEach(c => {
    if (c.nodeType === 3) {
      const frag = document.createDocumentFragment();
      c.textContent.split(/(\s+)/).forEach(w => {
        if (!w) return;
        if (/^\s+$/.test(w)) return frag.append(w);
        const o = document.createElement('span'); o.className = 'w';
        const s = document.createElement('span'); s.textContent = w; s.style.setProperty('--i', i++); o.append(s); frag.append(o);
      });
      c.replaceWith(frag);
    } else walk(c);
  });
  walk(el);
}
document.querySelectorAll('.split').forEach(splitWords);
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
document.querySelectorAll('[data-reveal], .split').forEach(el => el.closest('.hero') || io.observe(el));

if ($('#mq1')) {
  $('#mq1').innerHTML = 'Dry · Wet · Qualifying · Sprint · Race · <b>44</b> · Wheel · Pad · No TC · No ABS · '.repeat(6);
  $('#mq2').innerHTML = 'Team radio · Box this lap · Tyres · Balance · <b>44</b> · Push now · '.repeat(6);
}

let lastY = scrollY, vel = 0, career = -1, mq = 0, lastPass = 0, garageOn = false;
const hud = Object.fromEntries([...document.querySelectorAll('#hud span')].map(s => [s.dataset.h, s]));

function loop(now){
  requestAnimationFrame(loop);
  const H = innerHeight, y = scrollY;
  vel = vel * 0.85 + (y - lastY) * 60 * 0.15; lastY = y;
  // fast scroll flick → a real car passing (left to right), pitch follows how hard you flick
  if (Math.abs(vel) > 2600 && now - lastPass > 2400) { lastPass = now; sfx.passby(0.9 + Math.min(0.5, Math.abs(vel) / 9000), 0.45); }
  if (PAGE === 'home') { const v = view(), inLab = v.a > 0.5 && v.b < 0.5; if (inLab !== garageOn && sfx.garage(inLab) !== false) garageOn = inLab; }
  const p = clamp(y / Math.max(1, document.documentElement.scrollHeight - H));
  if (Math.abs(p - career) > 0.003) {
    career = p;   // teal → purple → red, same hue walk as the 3D accent
    document.documentElement.style.setProperty('--accent', `hsl(${Math.round(175 + 180 * p)} 85% 58%)`);
    if ($('#rail')) $('#rail b').style.top = p * 100 + '%';
    scene?.setCareer(p);
  }
  if (!reduce && $('#mq1')) {
    mq += 0.4 + Math.abs(vel) * 0.004;
    $('#mq1').style.transform = `translateX(${-(mq % 2000)}px)`;
    $('#mq2').style.transform = `translateX(${(mq % 2000) - 2000}px)`;
  }
}
requestAnimationFrame(loop);

function view(){
  // the car is framed inside #carSafe: the empty area between the panel's header and its legend
  const H = innerHeight, top = $('#carpanel').getBoundingClientRect().top, out = $('#outro').getBoundingClientRect();
  return { a: clamp((H - top) / (H * 0.7)), b: clamp((H * 0.85 - out.top) / (H * 0.6)), panel: $('#carSafe').getBoundingClientRect(), vel };
}
function placeHud(f){
  const panel = $('#carSafe').getBoundingClientRect();
  $('#hud').style.opacity = f.lab > 0.6 ? 1 : 0;
  for (const k in hud) {
    const [x, y] = f[k], inside = x > panel.left && x < panel.right && y > panel.top - 4 && y < panel.bottom + 4;
    hud[k].style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    hud[k].style.visibility = inside ? 'visible' : 'hidden';
  }
}

// ---------------- sound, radio captions, start gate ----------------
const soundBtn = $('#sound');
function setSound(on){
  sfx.enable(on); soundBtn.setAttribute('aria-pressed', on); $('#soundTxt').textContent = on ? 'Sound on' : 'Sound off';
  sfx.rain(on && state.weather === 'wet'); garageOn = false; if (!on) sfx.garage(false);
}
soundBtn.onclick = async () => { setSound(!sfx.on); if (sfx.on) { await sfx.ready(); sfx.shift(); } };
// browsers only allow audio after a tap: if sound was on before, switch it back on at the first one
if (sfx.wanted && PAGE !== 'home') addEventListener('pointerdown', e => { if (!soundBtn.contains(e.target) && !sfx.on) setSound(true); }, { once: true });

// team-radio caption (no voices — lines are generic, written for this site)
let radioT, radioSound = 0;
function radioMsg(text){
  const el = $('#radioMsg'); el.querySelector('p').textContent = text; el.classList.add('show');
  if (performance.now() - radioSound > 3500) { radioSound = performance.now(); sfx.radio(); }
  clearTimeout(radioT); radioT = setTimeout(() => el.classList.remove('show'), 3800);
}

const SEEN = 'setuplab-gate';
function heroIn(){ document.querySelectorAll('.hero .split, .hero [data-reveal]').forEach((el, i) => setTimeout(() => el.classList.add('in'), 150 + i * 110)); }
async function enter(withSound){
  const gate = $('#gate'), dots = gate.querySelectorAll('.lights i'), done = () => {
    gate.classList.add('gone'); heroIn();
    try { sessionStorage.setItem(SEEN, '1'); } catch {}
    setTimeout(() => radioMsg('Radio check. Car is in the garage, setups loaded.'), 1400);
  };
  gate.querySelectorAll('button').forEach(b => b.disabled = true);
  setSound(withSound);
  if (withSound) { $('#startSound').textContent = 'Warming up the engine…'; await sfx.ready(); sfx.start(); }
  if (reduce) return done();
  const lead = withSound ? 1600 : 200;           // let the engine fire up before the first light
  dots.forEach((d, i) => setTimeout(() => { d.classList.add('on'); sfx.lights(); }, lead + i * 700));
  setTimeout(() => { dots.forEach(d => d.classList.remove('on')); sfx.launch(); done(); }, lead + 5 * 700 + 450);
}
if (PAGE === 'home') {
  let seen = false; try { seen = sessionStorage.getItem(SEEN) === '1'; } catch {}
  if (seen) {                                   // coming back from another page: skip the start lights
    $('#gate').classList.add('gone'); heroIn();
    if (sfx.wanted) addEventListener('pointerdown', e => { if (!soundBtn.contains(e.target) && !sfx.on) setSound(true); }, { once: true });
  } else {
    $('#startSound').onclick = () => enter(true);
    $('#startQuiet').onclick = () => enter(false);
    $('#gate').addEventListener('keydown', e => e.key === 'Escape' && enter(false));
    (sfx.wanted ? $('#startSound') : $('#startQuiet')).focus();
  }
}

// ---------------- boot ----------------
const files = PAGE === 'credits' ? ['setups.json'] : ['setups.json', 'tracks/tracks.json'];
Promise.all(files.map(u => fetch(u, { cache: 'no-cache' }).then(r => r.json()))).then(async ([d, tr]) => {
  data = d; TR = tr || {}; $('#upd').textContent = d.updated;
  if (PAGE === 'credits') { document.querySelectorAll('a[data-nav]').forEach(a => a.href = a.dataset.nav + location.hash); $('#rules').innerHTML = Object.entries(RULES).map(([c, t]) => `<li><code>${c}</code> ${esc(t)}</li>`).join(''); return; }
  if ($('#stats')) $('#stats').innerHTML = `<span><b>${d.tracks.length}</b> layouts</span><span><b>${d.tracks.length * 20}</b> setups</span><span><b>${d.log.length}</b> radio fixes</span><span>No TC · No ABS</span>`;
  readHash(); buildControls();
  if (PAGE === 'home') {
    // the sticky car panel sits just under the sticky selector bar, whatever its height (it wraps on narrow screens)
    new ResizeObserver(([e]) => document.documentElement.style.setProperty('--ctrl', e.target.offsetHeight + 'px')).observe($('.controls'));
    try {
      const { initScene } = await import('./scene.js');
      scene = initScene({ canvas: $('#gl'), reduce, mobile, getView: view, onFrame: placeHud });
    } catch (err) { console.warn('3D unavailable, using 2D car', err); document.body.classList.add('no3d'); }
  }
  update();
  if (PAGE === 'radio') { renderLog(); if (!mobile) $('#ranWrap').open = true; }   // phones: values folded so the form stays close
  addEventListener('hashchange', () => { readHash(); update(); });
}).catch(err => { console.warn(err); const g = $('#groups') || $('#ranSheet'); if (g) g.innerHTML = '<p class="empty">Could not load the setup data.</p>'; });
