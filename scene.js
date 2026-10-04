// 3D garage. Car: "F1 2026 concept (polygon model)" by Qvist_Designs, CC BY 4.0 (models/CREDITS.txt),
// split into parts offline. A simple car built from primitives stands in while it loads or if it can't.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/libs/meshopt_decoder.module.js';

const SILVER = new THREE.Color('#c9ced6'), GRAPHITE = new THREE.Color('#1c1d22'), RED = new THREE.Color('#b8101c');
const TEAL = new THREE.Color('#19d3c5'), RACE_RED = new THREE.Color('#ff2436');
const rad = d => d * Math.PI / 180;
const ZONE_OF = { fw:'fw', rw:'rw', don:'diff', doff:'diff', fc:'fsus', ft:'fsus', fs:'fsus', farb:'fsus', frh:'fsus',
  rc:'rsus', rt:'rsus', rs:'rsus', rarb:'rsus', rrh:'rsus', bb:'brk', bp:'brk', tfl:'tfl', tfr:'tfr', trl:'trl', trr:'trr' };

export function initScene({ canvas, reduce, mobile, getView, onFrame }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const BG = new THREE.Color('#07080b');
  scene.background = BG; scene.fog = new THREE.Fog(BG, 20, 140);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x0a0a0a, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 9, 6); scene.add(key);
  const rimL = new THREE.PointLight(TEAL, 18, 14), rimR = new THREE.PointLight(TEAL, 18, 14);
  rimL.position.set(-3.5, 1.6, -3); rimR.position.set(3.5, 1.6, -3); scene.add(rimL, rimR);

  // ---------- ground ----------
  const gridTex = canvasTex(512, 512, g => {
    g.fillStyle = '#0c0d12'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  });
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.repeat.set(190, 190);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.85, metalness: 0, envMapIntensity: 0.1 }));
  scene.add(ground);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: canvasTex(128, 256, g => {
      const r = g.createRadialGradient(64, 128, 10, 64, 128, 128); r.addColorStop(0, 'rgba(0,0,0,.85)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 256); }), transparent: true, depthWrite: false }));
  shadow.position.y = 0.003; scene.add(shadow);

  // ---------- "44" billboard behind the car ----------
  const bigTex = canvasTex(1024, 512, () => {});
  const big = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: bigTex, transparent: true, depthWrite: false, fog: false }));
  scene.add(big);

  // ---------- car ----------
  let car = buildCar();
  scene.add(car.root);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('models/car.glb').then(g => {
    const real = buildFromModel(g.scene, car);
    scene.remove(car.root); car = real; scene.add(car.root); car.drawDecals();
  }).catch(e => console.warn('car model failed, keeping the simple car', e));

  // ---------- real circuit under the car (layouts: bacinger/f1-circuits, MIT) ----------
  const trackGroup = new THREE.Group(); scene.add(trackGroup);
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x18191d, roughness: 0.92, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide });
  const paintLine = new THREE.MeshStandardMaterial({ color: 0xb8bac0, roughness: 0.7, side: THREE.DoubleSide });
  const kerbMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trailMat = new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(dot);
  let trail = null, trailQuads = 0, path = [], tCenter = new THREE.Vector3(), tRadius = 800, ov = 0, ovT0 = -1e9;

  function setTrack(pts, reverse, animate) {
    trackGroup.traverse(o => o.geometry?.dispose()); trackGroup.clear();
    const P = pts.map(([x, y]) => new THREE.Vector3(x, 0, -y)); if (reverse) P.reverse();
    const curve = new THREE.CatmullRomCurve3(P, true, 'centripetal');
    const N = Math.max(400, Math.round(curve.getLength() / 2));
    const S = curve.getSpacedPoints(N); S.pop();
    // move the lap start under the car and point it along +Z (the car's nose)
    const p0 = S[0].clone(), t0 = S[1].clone().sub(S[0]), th = -Math.atan2(t0.x, t0.z), c = Math.cos(th), sn = Math.sin(th);
    for (const p of S) { const x = p.x - p0.x, z = p.z - p0.z; p.set(x * c + z * sn, 0, -x * sn + z * c); }
    const n = S.length, T = S.map((_, i) => S[(i + 1) % n].clone().sub(S[(i - 1 + n) % n]).normalize());
    const side = T.map(t => new THREE.Vector3(t.z, 0, -t.x));
    const bend = T.map((_, i) => T[(i - 3 + n) % n].angleTo(T[(i + 3) % n]) / 12);      // rad per metre
    const strip = (o0, o1, y, keep, colour) => {
      const pos = [], col = [];
      for (let i = 0; i < n; i++) {
        if (keep && !keep(i)) continue;
        const j = (i + 1) % n, q = [[i, o0], [i, o1], [j, o1], [i, o0], [j, o1], [j, o0]];
        for (const [k, o] of q) { const v = S[k].clone().addScaledVector(side[k], o); pos.push(v.x, y, v.z); }
        if (colour) { const cc = colour(i); for (let r = 0; r < 6; r++) col.push(...cc); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
      if (colour) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    };
    const hw = 6.5, isBend = i => bend[i] > 1 / 140;
    trackGroup.add(new THREE.Mesh(strip(-hw, hw, 0.006), asphalt));
    for (const sx of [-1, 1]) {
      trackGroup.add(new THREE.Mesh(strip(sx * (hw - 0.45), sx * (hw - 0.2), 0.01), paintLine));
      trackGroup.add(new THREE.Mesh(strip(sx * hw, sx * (hw + 1.4), 0.012, isBend, i => i % 2 ? [0.82, 0.08, 0.08] : [0.92, 0.92, 0.92]), kerbMat));
    }
    trackGroup.add(box(2 * hw, 0.01, 0.5, 0, 0.012, 3.6, paintLine));                                   // start line
    trail = new THREE.Mesh(strip(-11, 11, 0.06), trailMat); trail.geometry.setDrawRange(0, 0); trailQuads = n; trackGroup.add(trail);
    const box3 = new THREE.Box3().setFromPoints(S); box3.getCenter(tCenter); tCenter.y = 0;
    const sz = box3.getSize(new THREE.Vector3()); tRadius = Math.max(sz.x, sz.z) / 2;
    path = S; if (animate && !reduce) ovT0 = performance.now() / 1000;
  }

  // ---------- airflow streaks + rain ----------
  const NS = mobile ? 130 : 260, streakPos = new Float32Array(NS * 6), streakSeed = [];
  for (let i = 0; i < NS; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    streakSeed.push({ x: side * (1.3 + Math.random() * 6), y: 0.05 + Math.random() * 3.2, z: -30 + Math.random() * 42 });
  }
  const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: TEAL, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.LineSegments(streakGeo, streakMat));

  const NR = mobile ? 350 : 700, rainPos = new Float32Array(NR * 6), rainSeed = [];
  for (let i = 0; i < NR; i++) rainSeed.push({ x: -9 + Math.random() * 18, y: Math.random() * 9, z: -9 + Math.random() * 18 });
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0, depthWrite: false });
  scene.add(new THREE.LineSegments(rainGeo, rainMat));

  // ---------- state ----------
  const S = { fw: rad(14), rw: rad(16), lift: 0, rake: 0, heat: { tfl: 0.5, tfr: 0.5, trl: 0.5, trr: 0.5 } };
  const T = { ...S, heat: { ...S.heat } };
  let wet = 0, wetT = 0, hot = null, career = 0, cam = null, time = 0, last = performance.now(), wheelAngle = 0;
  const accent = TEAL.clone(), paint = SILVER.clone();

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += reduce ? 0 : dt;
    const v = getView(), W = innerWidth, H = innerHeight;
    if (canvas.width !== Math.floor(W * renderer.getPixelRatio()) || canvas.height !== Math.floor(H * renderer.getPixelRatio())) {
      renderer.setSize(W, H, false); camera.aspect = W / H;
    }
    const k = reduce ? 1 : 1 - Math.exp(-dt * 5);

    // colours follow the career scroll (silver/teal → red)
    // silver arrows → black → red: the livery walks the career as you scroll
    career < 0.5 ? paint.lerpColors(SILVER, GRAPHITE, career * 2) : paint.lerpColors(GRAPHITE, RED, career * 2 - 1);
    accent.copy(TEAL).lerpHSL(RACE_RED, career);
    car.paint.color.copy(paint); car.paint.metalness = 0.65 - career * 0.35;
    car.glow.color.copy(accent); streakMat.color.copy(accent); rimL.color.copy(accent); rimR.color.copy(accent);

    // camera choreography: hero → inside the setup panel → low rear chase
    const hero = { el: 12, az: 38 + time * 5, dist: mobile ? 12 : 8.4, cx: W * (mobile ? 0.5 : 0.64), cy: H * (mobile ? 0.68 : 0.56) };
    const p = v.panel, ph = Math.max(160, p.height - 200), pw = Math.max(160, p.width - 40), tan = Math.tan(rad(camera.fov / 2));
    const lab = { el: 70, az: 180, dist: Math.max(6.4 * H / ph, 2.9 * H / pw) / (2 * tan), cx: p.left + p.width / 2, cy: p.top + 160 + ph / 2 };
    const out = { el: 7, az: 152 + time * 3, dist: mobile ? 13 : 9.5, cx: W * (mobile ? 0.5 : 0.7), cy: H * 0.55 };
    const mix = (x, y, t) => x + (y - x) * t, e = t => t * t * (3 - 2 * t);
    const a = e(v.a), b = e(v.b), target = {};
    for (const f of ['el', 'az', 'dist', 'cx', 'cy']) target[f] = mix(mix(hero[f], lab[f], a), out[f], b);
    cam = cam || { ...target };
    for (const f in target) cam[f] += (target[f] - cam[f]) * k;
    // track overview: on a track change the camera climbs to show the whole circuit, draws the lap, then dives back
    const tO = now / 1000 - ovT0, ovRaw = tO < 0 ? 0 : tO < 1 ? tO : tO < 3.2 ? 1 : Math.max(0, 1 - (tO - 3.2) / 1.1);
    ov = e(ovRaw);
    const ovDist = tRadius * 1.2 / (tan * Math.min(1, W / H)) / Math.sin(rad(64));
    const dist = cam.dist * Math.pow(ovDist / cam.dist, ov);
    const el = rad(mix(cam.el, 64, ov)), az = rad(cam.az), tgt = new THREE.Vector3(0, 0.45, 0.25).lerp(tCenter, ov);
    camera.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(tgt);
    camera.near = Math.max(0.1, dist * 0.01); camera.far = dist * 6 + 400;
    camera.setViewOffset(W, H, W / 2 - mix(cam.cx, W / 2, ov), H / 2 - mix(cam.cy, H / 2, ov), W, H);
    camera.updateProjectionMatrix();
    scene.fog.near = 20 + ov * dist * 3; scene.fog.far = 140 + ov * dist * 6;
    if (trail) {
      const q = Math.min(1, Math.max(0, (tO - 0.6) / 2.2)), at = Math.min(path.length - 1, Math.floor(q * path.length));
      trail.geometry.setDrawRange(0, 6 * Math.floor(q * trailQuads)); trailMat.opacity = ov * 0.85; trailMat.color.copy(accent);
      dot.position.copy(path[at]).setY(8); dot.scale.setScalar(Math.max(10, dist * 0.012)); dot.material.opacity = ov;
    }

    // billboard "44"
    const dir = tgt.clone().sub(camera.position).setY(0).normalize();
    big.position.copy(tgt).addScaledVector(dir, 7).setY(2.1); big.quaternion.copy(camera.quaternion);
    big.material.opacity = (1 - a) * (1 - b) * (1 - ov) * 0.9;

    // setup-driven parts
    for (const f of ['fw', 'rw', 'lift', 'rake']) S[f] += (T[f] - S[f]) * k;
    car.frontFlaps.rotation.x = S.fw; car.rearFlap.rotation.x = S.rw;
    car.body.position.y = S.lift; car.body.rotation.x = -S.rake;
    for (const t of ['tfl', 'tfr', 'trl', 'trr']) {
      S.heat[t] += (T.heat[t] - S.heat[t]) * k;
      car.heat[t].color.setHSL((200 - S.heat[t] * 190) / 360, 0.85, 0.55);
    }
    for (const [z, mats] of Object.entries(car.zones)) for (const m of mats) {
      const goal = z === hot ? 0.9 : 0; m.emissive.copy(accent); m.emissiveIntensity += (goal - m.emissiveIntensity) * (reduce ? 1 : 0.2);
    }
    car.rainLight.material.color.setRGB(wet > 0.5 && Math.sin(time * 12) > 0 ? 1 : 0.15, 0.02, 0.02);

    // motion: speed from scroll velocity + section
    const speed = mix(mix(16, 4, a), 30, b) + Math.min(60, Math.abs(v.vel) * 0.06);
    if (!reduce) {
      wheelAngle += speed * dt / 0.36; for (const w of car.wheels) w.rotation.x = wheelAngle;
      const len = 0.35 + speed * 0.05;
      for (let i = 0; i < NS; i++) {
        const s = streakSeed[i]; s.z -= speed * dt; if (s.z < -30) s.z += 42;
        streakPos.set([s.x, s.y, s.z, s.x, s.y, s.z + len], i * 6);
      }
      streakGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < NR; i++) {
        const r = rainSeed[i]; r.y -= 11 * dt; r.z -= speed * 0.3 * dt; if (r.y < 0) { r.y += 9; r.z = -9 + Math.random() * 18; }
        if (r.z < -9) r.z += 18;
        rainPos.set([r.x, r.y, r.z, r.x, r.y + 0.28, r.z + 0.05], i * 6);
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    wet += (wetT - wet) * (reduce ? 1 : 0.05);
    rainMat.opacity = wet * 0.55 * (1 - a * 0.6); streakMat.opacity = 0.05 + (1 - a) * 0.45;
    ground.material.roughness = 0.85 - wet * 0.4;
    asphalt.roughness = 0.92 - wet * 0.62; asphalt.metalness = wet * 0.25;     // wet tarmac shines

    renderer.render(scene, camera);

    if (onFrame) {
      const proj = o => { const q = o.getWorldPosition(new THREE.Vector3()).project(camera); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; };
      onFrame({ tfl: proj(car.anchors.tfl), tfr: proj(car.anchors.tfr), trl: proj(car.anchors.trl), trr: proj(car.anchors.trr),
                fw: proj(car.anchors.fw), rw: proj(car.anchors.rw), lab: a * (1 - b) * (1 - ov) });
    }
  }
  requestAnimationFrame(frame);

  function draw44() {
    const g = bigTex.image.getContext('2d'); g.clearRect(0, 0, 1024, 512);
    g.font = 'italic 900 470px "Titillium Web", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.22)'; g.strokeText('44', 512, 270);
    bigTex.needsUpdate = true; car.drawDecals();
  }
  draw44(); document.fonts?.ready.then(draw44);

  return {
    setSetup(v, RANGE) {
      T.fw = rad(6 + v.fw * 0.36); T.rw = rad(4 + v.rw * 0.52);
      T.lift = (v.frh - 20) * 0.004; T.rake = (v.rrh - 46) * 0.0016;
      for (const t of ['tfl', 'tfr', 'trl', 'trr']) { const [lo, hi] = RANGE[t]; T.heat[t] = (v[t] - lo) / (hi - lo); }
    },
    highlight(k) { hot = k ? ZONE_OF[k] : null; },
    setWeather(w) { wetT = w === 'wet' ? 1 : 0; },
    setCareer(p) { career = p; },
    setTrack,
  };
}

// ---------------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function shape(cmds) {
  const s = new THREE.Shape();
  for (const [c, ...n] of cmds) c === 'm' ? s.moveTo(...n) : c === 'l' ? s.lineTo(...n) : s.quadraticCurveTo(...n);
  return s;
}
// Side profile (u = z forward, v = y up) extruded across the car to width w, centred on x = 0.
function side(cmds, w, bevel = 0.035) {
  const g = new THREE.ExtrudeGeometry(shape(cmds), { depth: w, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 20 });
  return g.rotateY(-Math.PI / 2).translate(w / 2, 0, 0);
}
function box(w, h, d, x, y, z, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function rod(a, b, mat, r = 0.016) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat);
  m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}

function buildCar() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: SILVER, metalness: 0.65, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.42, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ color: TEAL });
  const zones = { fw: [], rw: [], fsus: [], rsus: [], brk: [], diff: [], tfl: [], tfr: [], trl: [], trr: [] };
  const zmat = (z, base) => { const m = base.clone(); m.emissiveIntensity = 0; zones[z].push(m); return m; };

  // floor (top-down planform) + underglow strips
  const floor = new THREE.ExtrudeGeometry(shape([['m', -0.35, 1.15], ['l', 0.35, 1.15], ['l', 0.8, 0.55], ['l', 0.8, -1.05], ['l', 0.55, -1.15], ['l', 0.5, -1.95],
    ['l', -0.5, -1.95], ['l', -0.55, -1.15], ['l', -0.8, -1.05], ['l', -0.8, 0.55], ['l', -0.35, 1.15]]), { depth: 0.05, bevelEnabled: false });
  body.add(new THREE.Mesh(floor.rotateX(Math.PI / 2).translate(0, 0.14, 0), carbon));
  for (const s of [-1, 1]) body.add(box(0.02, 0.02, 2.2, s * 0.81, 0.1, -0.05, glow));

  // nose, chassis, engine cover fin, sidepods
  body.add(new THREE.Mesh(side([['m', 2.55, 0.17], ['l', 2.55, 0.26], ['q', 1.7, 0.42, 0.75, 0.6], ['l', 0.75, 0.22], ['q', 1.6, 0.17, 2.55, 0.17]], 0.3), paint));
  body.add(new THREE.Mesh(side([['m', 1.0, 0.15], ['l', 1.0, 0.55], ['q', 0.55, 0.66, 0.2, 0.63], ['l', -0.3, 0.63], ['l', -0.42, 0.97],
    ['q', -1.2, 0.92, -2.0, 0.52], ['l', -2.2, 0.44], ['l', -2.2, 0.16], ['l', 1.0, 0.15]], 0.62), paint));
  body.add(new THREE.Mesh(side([['m', -0.55, 0.92], ['q', -1.3, 0.98, -2.05, 0.84], ['l', -2.05, 0.5], ['q', -1.3, 0.66, -0.55, 0.86], ['l', -0.55, 0.92]], 0.02, 0.005), paint));
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(side([['m', 0.45, 0.16], ['l', 0.45, 0.52], ['q', -0.05, 0.64, -0.6, 0.44], ['q', -1.0, 0.28, -1.15, 0.2], ['l', -1.15, 0.16], ['l', 0.45, 0.16]], 0.38), paint);
    pod.position.x = s * 0.52; body.add(pod);
    body.add(box(0.3, 0.24, 0.05, s * 0.55, 0.35, 0.49, dark));                       // inlet
    body.add(box(0.2, 0.06, 0.1, s * 0.5, 0.74, 0.55, carbon), rod([s * 0.42, 0.58, 0.55], [s * 0.5, 0.72, 0.55], carbon, 0.012)); // mirrors
  }
  // cockpit, helmet, halo
  const hole = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), dark); hole.scale.set(0.24, 0.07, 0.42); hole.position.set(0, 0.63, 0.12); body.add(hole);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, clearcoat: 1, roughness: 0.2 }));
  helmet.position.set(0, 0.7, 0.02); body.add(helmet, box(0.17, 0.045, 0.06, 0, 0.72, 0.12, dark));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.028, 8, 40), carbon);
  halo.rotation.x = Math.PI / 2; halo.scale.set(1, 1.3, 1); halo.position.set(0, 0.86, 0.05); body.add(halo, rod([0, 0.86, 0.44], [0, 0.62, 0.62], carbon, 0.03));

  // front wing (flaps pivot with the FW value)
  const fwm = zmat('fw', carbon);
  body.add(box(1.95, 0.025, 0.36, 0, 0.1, 2.32, fwm));
  for (const s of [-1, 1]) body.add(box(0.025, 0.22, 0.5, s * 0.98, 0.18, 2.3, fwm), box(0.02, 0.14, 0.2, s * 0.08, 0.18, 2.3, carbon));
  const frontFlaps = new THREE.Group(); frontFlaps.position.set(0, 0.12, 2.24);
  frontFlaps.add(box(1.75, 0.02, 0.16, 0, 0.03, -0.06, fwm), box(1.6, 0.02, 0.13, 0, 0.08, -0.16, fwm)); body.add(frontFlaps);

  // rear wing (flap pivots with the RW value), beam wing, rain light
  const rwm = zmat('rw', carbon);
  for (const s of [-1, 1]) body.add(box(0.025, 0.55, 0.6, s * 0.52, 0.78, -2.3, rwm));
  body.add(box(1.04, 0.03, 0.3, 0, 0.88, -2.24, rwm), box(0.9, 0.02, 0.14, 0, 0.42, -2.3, rwm), box(0.03, 0.45, 0.08, 0, 0.64, -2.2, carbon));
  const rearFlap = new THREE.Group(); rearFlap.position.set(0, 0.92, -2.37); rearFlap.add(box(1.04, 0.02, 0.2, 0, 0, -0.08, rwm)); body.add(rearFlap);
  const rainLight = box(0.12, 0.05, 0.03, 0, 0.3, -2.5, new THREE.MeshBasicMaterial({ color: 0x330000 })); body.add(rainLight);
  body.add(box(0.26, 0.18, 0.3, 0, 0.29, -2.33, zmat('diff', carbon)));               // gearbox / diff

  // number decals
  const decal = canvasTex(256, 128, () => {});
  const dmat = new THREE.MeshBasicMaterial({ map: decal, transparent: true, depthWrite: false });
  const nose44 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), dmat); nose44.rotation.set(-Math.PI / 2 + 0.2, 0, Math.PI); nose44.position.set(0, 0.515, 1.45); body.add(nose44);
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), dmat); f.rotation.y = s * Math.PI / 2; f.position.set(s * 0.025, 0.76, -1.45); body.add(f); }
  const drawDecals = () => { const g = decal.image.getContext('2d'); g.clearRect(0, 0, 256, 128);
    g.font = 'italic 900 112px "Titillium Web", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 6; g.strokeText('44', 128, 68); g.fillText('44', 128, 68); decal.needsUpdate = true; };

  // wheels + suspension
  const wheels = [], heat = {}, anchors = {};
  const fsm = zmat('fsus', carbon), rsm = zmat('rsus', carbon), brk = zmat('brk', new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.5, metalness: 0.4 }));
  const rim = new THREE.MeshStandardMaterial({ color: 0x24262b, metalness: 0.9, roughness: 0.25 });
  for (const [id, x, z, w] of [['tfl', 0.82, 1.55, 0.34], ['tfr', -0.82, 1.55, 0.34], ['trl', 0.8, -1.55, 0.4], ['trr', -0.8, -1.55, 0.4]]) {
    const s = Math.sign(x), hub = new THREE.Group(); hub.position.set(x, 0.36, z); root.add(hub);
    const spin = new THREE.Group(); hub.add(spin); wheels.push(spin);
    const prof = [[0.24, -w / 2], [0.33, -w / 2], [0.36, -w / 2 + 0.05], [0.36, w / 2 - 0.05], [0.33, w / 2], [0.24, w / 2]].map(([r, y]) => new THREE.Vector2(r, y));
    spin.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48).rotateZ(Math.PI / 2), zmat(id, new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.85 }))));
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, w * 0.92, 32).rotateZ(Math.PI / 2), rim));
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.012, 32).rotateZ(Math.PI / 2), carbon); cover.position.x = s * w * 0.47; spin.add(cover);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3399ff }); heat[id] = ringMat;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.011, 6, 48).rotateY(Math.PI / 2), ringMat); ring.position.x = s * (w / 2 + 0.002); hub.add(ring);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24).rotateZ(Math.PI / 2), brk); disc.position.x = -s * w * 0.3; hub.add(disc);
    anchors[id] = new THREE.Object3D(); anchors[id].position.set(x + s * 0.45, 0.36, z); root.add(anchors[id]);
    const m = z > 0 ? fsm : rsm, bx = z > 0 ? 0.22 : 0.3;
    const pts = z > 0 ? [[0.42, 1.65, 0.42], [0.2, 1.7, 0.26], [0.2, 1.35, 0.3], [0.5, 1.45, 0.24]] : [[0.42, -1.4, 0.44], [0.18, -1.3, 0.26], [0.18, -1.75, 0.28]];
    for (const [y, bz, hy] of pts) body.add(rod([s * bx, y, bz], [x - s * 0.16, hy, z], m));
  }
  anchors.fw = new THREE.Object3D(); anchors.fw.position.set(0, 0.25, 2.75);
  anchors.rw = new THREE.Object3D(); anchors.rw.position.set(0, 1.15, -2.6); body.add(anchors.fw, anchors.rw);
  return { root, body, paint, glow, zones, frontFlaps, rearFlap, wheels, heat, anchors, rainLight, drawDecals, dmat };
}

// Real model: meshes arrive named by part (body, floor, fw, rw, fsus, rsus, diff, tfl…, rim_tfl…).
function buildFromModel(model, prev) {
  const { wheels: W } = model.userData;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = prev.paint, glow = prev.glow;
  const carbon = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.38, metalness: 0.3, side: THREE.DoubleSide });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.82, side: THREE.DoubleSide });
  const rim = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide });
  paint.side = THREE.DoubleSide;
  const zones = { fw: [], rw: [], fsus: [], rsus: [], brk: [], diff: [], tfl: [], tfr: [], trl: [], trr: [] };
  const zmat = (z, base) => { const m = base.clone(); m.emissiveIntensity = 0; zones[z].push(m); return m; };
  const brk = zmat('brk', rim), mats = { body: paint, floor: carbon };
  for (const z of ['fw', 'rw', 'fsus', 'rsus', 'diff']) mats[z] = zmat(z, carbon);
  for (const t of ['tfl', 'tfr', 'trl', 'trr']) mats[t] = zmat(t, rubber);

  const wheels = [], heat = {}, anchors = {}, spinOf = {};
  for (const [id, w] of Object.entries(W)) {
    const hub = new THREE.Group(); hub.position.set(w.xc, w.R, w.zc); root.add(hub);
    const spin = new THREE.Group(); hub.add(spin); wheels.push(spin); spinOf[id] = spin;
    const s = Math.sign(w.xc), ringMat = new THREE.MeshBasicMaterial({ color: 0x3399ff }); heat[id] = ringMat;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(w.R * 0.8, 0.008, 6, 64).rotateY(Math.PI / 2), ringMat);
    ring.position.x = s * (w.hw - 0.025); hub.add(ring);
    anchors[id] = new THREE.Object3D(); anchors[id].position.set(w.xc + s * 0.42, w.R, w.zc); root.add(anchors[id]);
  }
  for (const m of [...model.children]) {
    if (!m.isMesh) continue;
    const name = m.name, wid = name.replace('rim_', '');
    m.material = name.startsWith('rim_') ? brk : mats[name] || paint;
    // keep each mesh's own node transform (it de-quantises the compressed positions)
    if (spinOf[wid]) { const w = W[wid], off = new THREE.Group(); off.position.set(-w.xc, -w.R, -w.zc); off.add(m); spinOf[wid].add(off); } else body.add(m);
  }
  // floor glow strips, rain light and "44" decals sit on the real surfaces (found by ray casts)
  for (const sx of [-1, 1]) body.add(box(0.015, 0.015, 2.0, sx * 0.68, 0.04, 0.1, glow));
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), hit = (o, d) => { ray.set(new THREE.Vector3(...o), new THREE.Vector3(...d)); return ray.intersectObjects(body.children, true)[0]; };
  const rearZ = Math.min(W.trl.zc, W.trr.zc);
  const back = hit([0, 0.32, rearZ - 3], [0, 0, 1]);
  const rainLight = box(0.12, 0.05, 0.02, 0, 0.32, back ? back.point.z - 0.012 : rearZ - 0.7, new THREE.MeshBasicMaterial({ color: 0x330000 }));
  body.add(rainLight);
  const decal = (o, d, size, up) => {
    const h = hit(o, d); if (!h) return;
    const n = h.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
    if (n.dot(new THREE.Vector3(...d)) > 0) n.negate();
    const u = new THREE.Vector3(...up).projectOnPlane(n).normalize(), r = new THREE.Vector3().crossVectors(u, n);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 2), prev.dmat);
    p.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, n)); p.position.copy(h.point).addScaledVector(n, 0.004); body.add(p);
  };
  const FZ = W.tfl.zc;
  root.updateMatrixWorld(true);
  decal([0, 2, FZ - 0.25], [0, -1, 0], 0.34, [0, 0, 1]);                       // nose / chassis top
  for (const sx of [-1, 1]) decal([sx * 3, 0.72, -0.55], [-sx, 0, 0], 0.46, [0, 1, 0]);   // engine cover sides
  anchors.fw = new THREE.Object3D(); anchors.fw.position.set(0, 0.28, FZ + 0.95);
  anchors.rw = new THREE.Object3D(); anchors.rw.position.set(0, 1.12, rearZ - 0.55); body.add(anchors.fw, anchors.rw);
  const dummy = new THREE.Object3D();
  return { root, body, paint, glow, zones, frontFlaps: dummy, rearFlap: dummy, wheels, heat, anchors, rainLight, drawDecals: prev.drawDecals, dmat: prev.dmat };
}
