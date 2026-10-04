// Real F1 field recordings (CC BY 4.0, see audio/CREDITS.txt) + CC0 radio static.
// Only the start-light beeps, UI ticks and rain hiss are synthesised.
let ctx, master, rainGain, verb, noiseBuf, garageSrc, garageGain, loading = Promise.resolve();
const buf = {};
const FILES = ['engine-start', 'launch', 'passby', 'garage', 'radio-static'];
const KEY = 'setuplab-sound';
const store = { get(){ try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } },
                set(v){ try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {} } };

export const sfx = {
  on: false,
  wanted: store.get(),

  enable(v){
    this.on = v; store.set(v); this.wanted = v;
    if (v && !ctx) boot();
    if (!ctx) return;
    master.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, 0.05);
    if (v && ctx.state === 'suspended') ctx.resume();
  },

  ready(){ return Promise.race([loading, new Promise(r => setTimeout(r, 3000))]); },   // samples decoded (or give up after 3s)
  start(){ play('engine-start', { gain: 0.9 }); },
  launch(){ play('launch', { gain: 1 }); },
  passby(rate = 1, gain = 0.7){
    const p = ctx && ctx.createStereoPanner();
    if (p) { const t = ctx.currentTime; p.pan.setValueAtTime(-0.85, t); p.pan.linearRampToValueAtTime(0.85, t + 3.2 / rate); }
    play('passby', { rate, gain, pan: p });
  },
  shift(){ play('engine-start', { offset: 3.1, dur: 0.32, gain: 0.55, rate: 1.15 }); },   // a real throttle blip
  tick(){ if (this.on) burst(2600, 0.025, 0.18); },

  garage(on){                                   // returns false if it couldn't start yet (sound off / still loading)
    if (on && (!this.on || !buf.garage)) return false;
    if (on && !garageSrc) {
      garageGain = ctx.createGain(); garageGain.gain.value = 0; garageGain.connect(master);
      garageSrc = ctx.createBufferSource(); garageSrc.buffer = buf.garage; garageSrc.loop = true;
      garageSrc.connect(garageGain); garageSrc.start(); garageGain.gain.setTargetAtTime(0.22, ctx.currentTime, 0.8);
    } else if (!on && garageSrc) {
      const s = garageSrc; garageGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4); s.stop(ctx.currentTime + 2); garageSrc = null;
    }
    return true;
  },

  // radio: squelch open (real static) → two pit-wall chirps → squelch tail
  radio(){
    if (!this.on) return;
    const off = Math.random() * 1.8;
    play('radio-static', { offset: off, dur: 0.22, gain: 0.8 });
    setTimeout(() => { this.chirp(1250); setTimeout(() => this.chirp(1250), 120); }, 160);
    setTimeout(() => play('radio-static', { offset: off + 0.3, dur: 0.18, gain: 0.6 }), 520);
  },
  chirp(f){ tone(f, 0.07, 'square', 0.05, false); },

  lights(){ if (this.on) tone(880, 0.28, 'sine', 0.28, true); },
  rain(on){ if (ctx) rainGain.gain.setTargetAtTime(on && this.on ? 0.05 : 0, ctx.currentTime, 0.6); },
};

function boot(){
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  // small room reverb for the synthesised beeps so they don't sound dry/robotic
  verb = ctx.createConvolver(); const ir = ctx.createBuffer(2, ctx.sampleRate * 0.8, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
  verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.25; verb.connect(vg).connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(); rainGain = ctx.createGain(); rainGain.gain.value = 0;
  s.buffer = noiseBuf; s.loop = true; f.type = 'highpass'; f.frequency.value = 4500; s.connect(f).connect(rainGain).connect(master); s.start();
  loading = Promise.all(FILES.map(n => fetch(`audio/${n}.mp3`).then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).then(b => { buf[n] = b; }).catch(() => {})));
}

function play(name, { offset = 0, dur, gain = 1, rate = 1, pan } = {}){
  if (!sfx.on || !buf[name]) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf[name]; s.playbackRate.value = rate;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02);
  if (dur) g.gain.setTargetAtTime(0, t + dur, 0.04);
  (pan ? s.connect(g).connect(pan) : s.connect(g)).connect(master);
  s.start(t, offset, dur ? dur + 0.3 : undefined);
}
function tone(f, d, type, vol, wet){
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.setTargetAtTime(0, t + d * 0.6, d * 0.25);
  o.connect(g).connect(master); if (wet) g.connect(verb);
  o.start(t); o.stop(t + d + 0.4);
}
function burst(freq, d, vol){
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + d + 0.02);
}
