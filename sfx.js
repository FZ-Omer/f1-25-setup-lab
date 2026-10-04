// All sounds are synthesised live with the Web Audio API — no recorded samples, nothing to license.
let ctx, master, wind, rain, noiseBuf;
const KEY = 'setuplab-sound';
const store = { get(){ try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } },
                set(v){ try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {} } };

export const sfx = {
  on: false,
  wanted: store.get(),           // remembered choice; still needs a click before audio may start

  enable(v){
    this.on = v; store.set(v); this.wanted = v;
    if (v && !ctx) boot();
    if (ctx) master.gain.setTargetAtTime(v ? 0.55 : 0, ctx.currentTime, 0.05);
    if (v && ctx.state === 'suspended') ctx.resume();
  },

  beep(f = 880, d = 0.16, type = 'sine', vol = 0.35){
    if (!this.on) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.02);
  },

  tick(){ this.on && burst(3200, 0.03, 0.25); },
  shift(){ if (!this.on) return; burst(900, 0.09, 0.5); this.beep(140, 0.08, 'square', 0.12); },
  radio(){ if (!this.on) return; burst(2400, 0.25, 0.12); this.beep(1320, 0.09); setTimeout(() => this.beep(1320, 0.09), 140); },

  // V-shaped engine note: detuned saws + sub square through distortion and a sweeping lowpass.
  rev(peak = 1, hold = 0.25){
    if (!this.on) return;
    const t = ctx.currentTime, idle = 48, top = idle + 260 * peak, end = t + 0.45 + hold + 1.1;
    const out = ctx.createGain(), lp = ctx.createBiquadFilter(), shaper = ctx.createWaveShaper();
    shaper.curve = curve(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(3200 * peak + 600, t + 0.45); lp.frequency.exponentialRampToValueAtTime(400, end);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.32, t + 0.06); out.gain.setValueAtTime(0.32, t + 0.45 + hold); out.gain.exponentialRampToValueAtTime(0.001, end);
    shaper.connect(lp).connect(out).connect(master);
    for (const [type, mult, det] of [['sawtooth', 1, -7], ['sawtooth', 1, 7], ['square', 0.5, 0]]) {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = det;
      o.frequency.setValueAtTime(idle * mult, t);
      o.frequency.exponentialRampToValueAtTime(top * mult, t + 0.45);
      o.frequency.setValueAtTime(top * mult, t + 0.45 + hold);
      o.frequency.exponentialRampToValueAtTime(idle * mult, end);
      o.connect(shaper); o.start(t); o.stop(end + 0.05);
    }
  },

  lights(n){ this.beep(n < 5 ? 660 : 990, 0.22, 'sine', 0.3); },
  speed(v){ if (ctx && this.on) wind.gain.setTargetAtTime(Math.min(0.18, v * 0.0009), ctx.currentTime, 0.12); },
  rain(on){ if (ctx) rain.gain.setTargetAtTime(on && this.on ? 0.06 : 0, ctx.currentTime, 0.6); },
};

function boot(){
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  wind = loop(600, 'bandpass'); rain = loop(5000, 'highpass');
}
function loop(freq, type){
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; g.gain.value = 0;
  s.connect(f).connect(g).connect(master); s.start(); return g;
}
function burst(freq, d, vol){
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + d + 0.02);
}
let _curve;
function curve(){
  if (_curve) return _curve;
  _curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; _curve[i] = Math.tanh(3 * x); }
  return _curve;
}
