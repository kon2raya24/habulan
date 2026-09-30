// The 3D view of Habulan, in three.js. It reads the game (game.mjs) and its events and never changes
// them. It builds the place for the current maze (world3d.mjs), the bata and the four titas (cast3d.mjs),
// the pan de sal, Nanay's tsinelas and the fruit (food3d.mjs), then films it:
// - a three-quarter camera that follows the bata and keeps the maze readable (or shows all of it)
// - an establishing flyover for each maze, a crane shot when it's cleared, a punch-in when you're caught
// - a wet floor that mirrors the place (on the high setting), pools of light, particles, floating points
// - the film look (post.mjs), stepping down by itself on slow devices
// Arrows at the screen's edge point to any tita out of shot.
import * as THREE from './vendor/three.module.min.js';
import { COLS, ROWS, FRUIT, DOOR } from './maps.mjs';
import { posOf, TITAS, FRUITS } from './game.mjs';
import { createPost } from './post.mjs';
import { buildWorld, THEME_OF, LOOKS } from './world3d.mjs';
import { makeBata, makeTita, DIR_YAW } from './cast3d.mjs';
import { createPellets, createPower, createFruit } from './food3d.mjs';
import { envSky, envBackdrop } from './envpack.mjs';
import * as T from './tex.mjs';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const X = (x) => x - (COLS - 1) / 2, Z = (y) => y - (ROWS - 1) / 2;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TAUNTS = ['Hoy, bata!', 'Saan ka pupunta?!', 'Isusumbong kita!', 'Chismis ko \'to!', 'Ang takaw mo!', 'Balik dito!', 'Anak ka ni Nena, \'di ba?'];
const SCARED = ['Ay, si Nanay!', 'Takbo!', 'Ay, tsinelas!', 'Susmaryosep!'];
const OUCH = ['Aray ko!', 'Ay!', 'Aruy!'];
const LAUGH = ['Nahuli ka!', 'Hahaha!', 'Ayan ka!', 'Isusumbong kita kay Nanay mo!'];

export function createView(canvas, { low = false, gfx = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c2c8d6', 0.012);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  scene.add(camera);
  const fixed = gfx !== null && gfx !== '', post = createPost(renderer, scene, camera, { level: fixed ? +gfx : low ? 1 : 2, auto: !fixed });
  const pmrem = new THREE.PMREMGenerator(renderer);
  let level = post.level;

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight('#a9bde8', '#6a5a4c', 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffb27a', 2.4);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const points = [];
  function shadowsFor(l) { const s = l >= 2 ? 2048 : 1024; if (sun.shadow.mapSize.x !== s) { sun.shadow.mapSize.set(s, s); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, l >= 2 ? 1.75 : l === 1 ? 1.25 : 1)); }
  post.onLevel((l) => { level = l; shadowsFor(l); });

  // ---------- the sky: a painted gradient, then a photographed one ----------
  const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() } };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top, mid, low; varying vec3 v; void main(){ float h = v.y; vec3 c = h > 0.05 ? mix(mid, top, smoothstep(0.05, 0.6, h)) : mix(low, mid, smoothstep(-0.2, 0.05, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const backMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 40, 20), skyMat); sky.userData.noReflect = false; scene.add(sky);

  // ---------- the cast ----------
  const bata = makeBata(); bata.root.userData.s = 1.4; scene.add(bata.root);
  const titas = TITAS.map((t, i) => { const m = makeTita(i, t.color); m.root.scale.setScalar(1.35); scene.add(m.root); return m; });
  const powers = [0, 1, 2, 3].map(() => { const p = createPower(); scene.add(p.group); return p; });
  const fruit = createFruit(); scene.add(fruit.group); fruit.group.position.set(X(FRUIT.x), 0, Z(FRUIT.y));
  let pellets = null;

  // ---------- particles: sparks and glows (added light), crumbs, dust and confetti (solid) ----------
  const soft = T.glow('rgba(255,255,255,1)', { size: 64 });
  function particleSystem(max, additive) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { map: { value: soft }, scale: { value: 400 } },
      vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vc; uniform float scale; void main(){ vc = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform sampler2D map; varying vec3 vc; void main(){ vec4 t = texture2D(map, gl_PointCoord); ${additive ? 'gl_FragColor = vec4(vc * t.a, 1.0);' : 'if (t.a < 0.35) discard; gl_FragColor = vec4(vc, 1.0);'} }`,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData.noReflect = true; scene.add(pts);
    return { max, list: [], geo, pos, col, size, mat, pts };
  }
  const glows = particleSystem(low ? 300 : 600, true), bits = particleSystem(low ? 300 : 600, false);
  const emit = (sys, x, y, z, color, n, { speed = 2, up = 2, life = 0.8, g = 6, size = 0.12, drag = 0.96, spread = 1 } = {}) => {
    const c = new THREE.Color(color);
    for (let k = 0; k < n && sys.list.length < sys.max; k++) { const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7); sys.list.push({ x, y, z, vx: Math.cos(a) * s * spread, vy: up * (0.4 + Math.random() * 0.8), vz: Math.sin(a) * s * spread, life, max: life, c, g, size: size * (0.6 + Math.random() * 0.8), drag }); }
  };
  function stepParticles(sys, dt) {
    let n = 0;
    for (let i = sys.list.length - 1; i >= 0; i--) {
      const p = sys.list[i]; p.life -= dt;
      if (p.life <= 0) { sys.list.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.vx *= p.drag; p.vz *= p.drag; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
    }
    for (const p of sys.list) { const a = clamp(p.life / p.max * 2, 0, 1); sys.pos[n * 3] = p.x; sys.pos[n * 3 + 1] = p.y; sys.pos[n * 3 + 2] = p.z; sys.col[n * 3] = p.c.r * a; sys.col[n * 3 + 1] = p.c.g * a; sys.col[n * 3 + 2] = p.c.b * a; sys.size[n] = p.size * (sys === glows ? 1 : Math.min(1, a * 1.5)); n++; }
    sys.geo.setDrawRange(0, n);
    sys.geo.attributes.position.needsUpdate = sys.geo.attributes.color.needsUpdate = sys.geo.attributes.size.needsUpdate = true;
  }
  // ambient motes: dust in the morning light, fireflies in the churchyard, sparkle in the mall
  const motes = [];

  // ---------- floating points, in the world ----------
  const floats = [];
  function floatText(text, x, y, z, { color = ['#fffbe0', '#ffd23f', '#e8741c'], size = 1 } = {}) {
    const cv = T.canvas(256, 96), c = cv.getContext('2d');
    c.font = 'italic 900 72px "Barlow Condensed", "Baloo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 12; c.strokeStyle = '#120d14'; c.lineJoin = 'round'; c.strokeText(text, 128, 50);
    const g = c.createLinearGradient(0, 18, 0, 82); g.addColorStop(0, color[0]); g.addColorStop(0.5, color[1]); g.addColorStop(1, color[2]);
    c.fillStyle = g; c.fillText(text, 128, 50);
    const tex = T.toTex(cv), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
    s.renderOrder = 20; s.position.set(x, y, z); s.userData = { t: 0, size, y0: y, noReflect: true }; scene.add(s); floats.push(s);
  }
  function stepFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const s = floats[i], u = s.userData; u.t += dt;
      const pop = u.t < 0.15 ? 0.6 + (u.t / 0.15) * 0.7 : 1.3 - Math.min(0.3, (u.t - 0.15) * 1.5);
      s.scale.set(1.6 * u.size * pop, 0.6 * u.size * pop, 1); s.position.y = u.y0 + u.t * 0.9;
      s.material.opacity = clamp((1.3 - u.t) * 2, 0, 1);
      if (u.t > 1.3) { scene.remove(s); s.material.map.dispose(); s.material.dispose(); floats.splice(i, 1); }
    }
  }

  // ---------- the world, per maze ----------
  let world = null, worldName = '', env = null;
  const envState = { sky: null, back: null };
  function setWorld(maze) {
    if (world && worldName === maze.name) return;
    if (world) { scene.remove(world.group); world.dispose(); }
    for (const l of points) scene.remove(l);
    points.length = 0;
    worldName = maze.name;
    world = buildWorld(maze, { env, low });
    scene.add(world.group);
    const L = world.look;
    renderer.toneMappingExposure = L.exposure;
    sun.color.set(L.sun.color); sun.intensity = L.sun.k; sun.position.set(...L.sun.dir).normalize().multiplyScalar(60); sun.target.position.set(0, 0, 0);
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
    scene.fog.color.set(L.fog[0]); scene.fog.density = L.fog[1];
    skyU.top.value.set(L.sky[0]); skyU.mid.value.set(L.sky[1]); skyU.low.value.set(L.sky[2]);
    sky.material = skyMat;
    post.setStage(world.theme);
    // real lights where the practicals matter most; the rest is baked into the floor
    const n = level >= 2 ? 8 : level === 1 ? 4 : 0;
    for (const p of world.points.slice(0, n)) { const l = new THREE.PointLight(p.color, p.k, p.dist, 2); l.position.set(p.x, p.y, p.z); l.userData.k = p.k; scene.add(l); points.push(l); }
    // motes
    motes.length = 0;
    const count = world.theme === 'simbahan' ? 70 : world.theme === 'mall' ? 50 : 90;
    for (let k = 0; k < count; k++) motes.push({ x: (Math.random() - 0.5) * 34, y: 0.3 + Math.random() * 2.6, z: (Math.random() - 0.5) * 36, ph: Math.random() * TAU, sp: 0.2 + Math.random() * 0.5 });
    // the environment light: the sky of this place (or a painted stand-in)
    scene.environment = fallbackEnv(L); scene.environmentIntensity = L.env ? L.env[1] : 0.4;
    if (env) dressEnv();
    // the reflection sees the new world
    mirrorDirty = true;
  }
  const envCache = new Map();
  function fallbackEnv(L) {
    const key = L.sky.join();
    if (!envCache.has(key)) {
      const s = new THREE.Scene(); const m = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), skyMat.clone()); m.material.uniforms = { top: { value: new THREE.Color(L.sky[0]).multiplyScalar(1.4) }, mid: { value: new THREE.Color(L.sky[1]).multiplyScalar(1.6) }, low: { value: new THREE.Color(L.hemi[1]) } }; s.add(m);
      envCache.set(key, pmrem.fromScene(s, 0.04).texture);
    }
    return envCache.get(key);
  }
  function dressEnv() {
    const w = world, L = w.look;
    const jobs = [w.dress(env)];
    if (L.env) jobs.push(envSky(env, L.env[0], pmrem).then((t) => { if (t && world === w) { scene.environment = t; scene.environmentIntensity = L.env[1]; scene.environmentRotation.set(0, L.env[2], 0); } }));
    if (L.back) jobs.push(envBackdrop(env, L.back[0]).then((t) => { if (t && world === w) { backMat.map = t; backMat.color.setScalar(L.back[2]); backMat.needsUpdate = true; sky.material = backMat; sky.rotation.y = L.back[1]; } }));
    mirrorDirty = true;
    return Promise.all(jobs).then(() => { mirrorDirty = true; });
  }
  function setEnv(e) { env = e; return world ? dressEnv() : Promise.resolve(); }

  // ---------- the wet floor's reflection (high graphics) ----------
  const mirror = { rt: null, cam: new THREE.PerspectiveCamera(), matrix: new THREE.Matrix4(), on: false };
  let mirrorDirty = true;
  const hideForMirror = [];
  function renderMirror() {
    const want = level >= 2 && world && world.floor;
    const U = world && world.floor && world.floor.material.userData.floorU;
    if (!want) { if (U) U.mirrorOn.value = 0; return; }
    const w = Math.max(64, Math.floor(renderer.domElement.width * 0.5)), h = Math.max(64, Math.floor(renderer.domElement.height * 0.5));
    if (!mirror.rt) mirror.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    if (mirror.rt.width !== w || mirror.rt.height !== h) mirror.rt.setSize(w, h);
    // the camera, mirrored in the floor (y = 0)
    const c = mirror.cam; c.copy(camera);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), dir = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
    c.position.set(p.x, -p.y, p.z); c.up.set(up.x, -up.y, up.z); c.lookAt(p.x + dir.x, -(p.y + dir.y), p.z + dir.z);
    c.updateMatrixWorld(); c.projectionMatrix.copy(camera.projectionMatrix);
    mirror.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    // clip everything under the floor (oblique near plane)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.001).applyMatrix4(c.matrixWorldInverse);
    const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), P = c.projectionMatrix, q = new THREE.Vector4((Math.sign(cp.x) + P.elements[8]) / P.elements[0], (Math.sign(cp.y) + P.elements[9]) / P.elements[5], -1, (1 + P.elements[10]) / P.elements[14]);
    cp.multiplyScalar(2 / cp.dot(q)); P.elements[2] = cp.x; P.elements[6] = cp.y; P.elements[10] = cp.z + 1; P.elements[14] = cp.w;
    if (mirrorDirty) { hideForMirror.length = 0; scene.traverse((o) => { if (o.userData.noReflect || o.userData.isFloor || o.isSprite || o.isPoints) hideForMirror.push(o); }); mirrorDirty = false; }
    const was = hideForMirror.map((o) => o.visible);
    for (const o of hideForMirror) o.visible = false;
    for (const s of floats) s.visible = false;
    const auto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    const fog = scene.fog.density; scene.fog.density = fog * 1.15;
    renderer.setRenderTarget(mirror.rt); renderer.clear(); renderer.render(scene, c); renderer.setRenderTarget(null);
    scene.fog.density = fog; renderer.shadowMap.autoUpdate = auto;
    hideForMirror.forEach((o, i) => { o.visible = was[i]; });
    for (const s of floats) s.visible = true;
    U.mirrorMap.value = mirror.rt.texture; U.mirrorMatrix.value.copy(mirror.matrix); U.mirrorOn.value = 1;
  }

  // ---------- the camera ----------
  const cam = { pos: new THREE.Vector3(0, 30, 30), look: new THREE.Vector3(0, 0, 0), tgt: new THREE.Vector3(), vel: new THREE.Vector3(), shake: 0, punch: 0, punchAt: new THREE.Vector3(), flash: 0, cool: 0, grey: 0, mode: '', t: 0, from: null };
  let ELEV = 0.99; // radians above the floor (57°; steeper on a tall screen)
  // how far back the camera stands to show at least `wv` columns and `hv` rows
  function framing(wv, hv) {
    const tan = Math.tan((camera.fov * Math.PI) / 360), a = camera.aspect;
    const d = Math.max(wv / 2 / (tan * a), (hv / 2) * Math.sin(ELEV) / tan);
    return { d, halfW: d * tan * a, halfH: d * tan / Math.sin(ELEV) };
  }
  function playPose(g, o, out) {
    const full = o.camMode === 'full', portrait = camera.aspect < 0.8;
    const f = full ? framing(COLS + 2, ROWS + 3) : portrait ? framing(14.5, 18) : framing(15, 15.5);
    const pl = g.player, p = posOf(pl);
    let tx = X(clamp(p.x, 0, COLS - 1)), tz = Z(clamp(p.y, 0, ROWS - 1));
    if (!full) { tx += [0, -1, 0, 1][pl.dir] * 1.2; tz += [-1, 0, 1, 0][pl.dir] * 1.2; }
    const mx = COLS / 2 + 1.2, mz = ROWS / 2 + 1.4;
    tx = f.halfW >= mx ? tx * 0.12 : clamp(tx, -(mx - f.halfW), mx - f.halfW);
    tz = f.halfH >= mz ? tz * 0.08 : clamp(tz, -(mz - f.halfH), mz - f.halfH);
    if (full) { tx = 0; tz = 0.3; }
    // the HUD sits along the top and the touch pad at the bottom: keep the action between them
    tz += o.touch ? (portrait ? 2.2 : 1.2) : 0.35;
    out.look.set(tx, 0, tz);
    out.pos.set(tx, Math.sin(ELEV) * f.d, tz + Math.cos(ELEV) * f.d);
    return out;
  }
  const pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, pose2 = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const bez = (a, b, c, k, out) => out.set(0, 0, 0).addScaledVector(a, (1 - k) * (1 - k)).addScaledVector(b, 2 * k * (1 - k)).addScaledVector(c, k * k);
  const V = (a) => new THREE.Vector3(...a);

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(0.3, r.width / Math.max(1, r.height));
    camera.fov = camera.aspect < 0.8 ? 50 : 34; ELEV = camera.aspect < 0.8 ? 1.18 : 0.99;
    camera.updateProjectionMatrix();
    post.resize();
  }

  // ---------- speech bubbles and off-screen markers (in the page, over the canvas) ----------
  const barkLayer = document.getElementById('barks'), markLayer = document.getElementById('markers');
  const bubbles = new Map();
  function bark(i, text, color) {
    if (!barkLayer) return;
    let b = bubbles.get(i);
    if (!b) { const el = document.createElement('div'); el.className = 'bark'; barkLayer.appendChild(el); b = { el, t: 0 }; bubbles.set(i, b); }
    b.el.textContent = text; b.el.style.setProperty('--c', color || '#ffd23f'); b.t = 1.6;
    b.el.classList.remove('pop'); void b.el.offsetWidth; b.el.classList.add('pop');
  }
  const marks = TITAS.map((t) => { if (!markLayer) return null; const el = document.createElement('div'); el.className = 'mark'; el.style.setProperty('--c', t.color); el.innerHTML = `<i></i><b>${t.name.split(' ')[1][0]}</b>`; el.hidden = true; markLayer.appendChild(el); return el; });

  // ---------- events ----------
  let tauntT = 4;
  function event(e, g) {
    const at = (x, y) => new THREE.Vector3(X(x), 0, Z(y));
    switch (e.type) {
      case 'pellet': { if (pellets) pellets.eat(e.y * COLS + e.x); const p = at(e.x, e.y); emit(bits, p.x, 0.2, p.z, '#e8a050', 4, { speed: 1.2, up: 1.6, life: 0.4, size: 0.05, g: 7 }); break; }
      case 'power': {
        const p = at(e.x, e.y);
        emit(glows, p.x, 0.4, p.z, '#7fd8ff', 30, { speed: 5, up: 3, life: 0.7, size: 0.3, g: 3 });
        emit(glows, p.x, 0.3, p.z, '#ffffff', 14, { speed: 3, up: 4, life: 0.5, size: 0.4, g: 2 });
        ring(p.x, p.z, '#7fd8ff');
        cam.shake = Math.max(cam.shake, 0.18); cam.flash = 0.5; cam.cool = 1;
        for (const gh of g.ghosts) if (gh.mode === 'active' && Math.random() < 0.6) bark(gh.i, pick(SCARED), TITAS[gh.i].color);
        break;
      }
      case 'ghost': {
        const p = at(e.x, e.y), col = TITAS.find((t) => t.id === e.id).color;
        emit(glows, p.x, 0.5, p.z, col, 26, { speed: 4, up: 3, life: 0.6, size: 0.26, g: 4 });
        emit(bits, p.x, 0.5, p.z, '#ffffff', 16, { speed: 3.5, up: 3, life: 0.6, size: 0.07, g: 8 });
        impact(p.x, p.z);
        floatText(String(e.points), p.x, 1.2, p.z, { size: 0.8 + e.chain * 0.18, color: ['#e8fbff', '#7fd8ff', '#2f6fd6'] });
        cam.shake = Math.max(cam.shake, 0.22 + e.chain * 0.04); cam.punch = 1; cam.punchAt.copy(p); cam.flash = 0.35;
        bark(TITAS.findIndex((t) => t.id === e.id), pick(OUCH), col);
        break;
      }
      case 'fruit': { const p = at(e.x, e.y); emit(glows, p.x, 0.5, p.z, '#ffd23f', 24, { speed: 3, up: 3, life: 0.7, size: 0.25, g: 3 }); floatText(`+${e.points}`, p.x, 1.2, p.z, { size: 1 }); fruit.hide(); break; }
      case 'die': {
        const p = at(e.x, e.y);
        cam.punch = 1.6; cam.punchAt.copy(p); cam.shake = Math.max(cam.shake, 0.3); cam.grey = 1; cam.flash = 0.25;
        emit(glows, p.x, 0.6, p.z, '#ffd23f', 12, { speed: 2, up: 2, life: 0.8, size: 0.2, g: 2 });
        const by = TITAS.findIndex((t) => t.id === e.by);
        if (by >= 0) setTimeout(() => bark(by, pick(LAUGH), TITAS[by].color), 250);
        break;
      }
      case 'clear': { celebrate = 3; const p = posOf(g.player); for (let k = 0; k < 6; k++) setTimeout(() => confetti(X(p.x), Z(p.y)), k * 220); break; }
      case 'extra': { const p = posOf(g.player); emit(glows, X(p.x), 0.8, Z(p.y), '#8bf5a0', 30, { speed: 2.5, up: 3, life: 1, size: 0.25, g: 1 }); break; }
      case 'fruitshow': { const p = new THREE.Vector3(X(FRUIT.x), 0, Z(FRUIT.y)); emit(glows, p.x, 1.4, p.z, '#fff0b0', 20, { speed: 1, up: -2, life: 0.6, size: 0.3, g: -1 }); break; }
      default: break;
    }
  }
  function ring(x, z, color) { // a shockwave across the floor
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.set(x, 0.05, z); m.userData = { t: 0, noReflect: true, ring: true }; scene.add(m); effects.push(m);
  }
  function impact(x, z) { // a white star burst: PAK!
    const m = new THREE.Mesh(new THREE.ShapeGeometry(T.starShape(0.7, 0.28)), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.set(x, 0.7, z); m.userData = { t: 0, noReflect: true, star: true }; m.renderOrder = 15; scene.add(m); effects.push(m);
  }
  function confetti(x, z) { const C = ['#e8384f', '#ffd23f', '#2f9bff', '#3fcf6a', '#ff7eb6', '#ffffff']; for (const c of C) emit(bits, x + (Math.random() - 0.5) * 6, 4, z + (Math.random() - 0.5) * 4, c, 10, { speed: 2.5, up: 1.5, life: 2.2, g: 2.2, size: 0.09, drag: 0.94 }); }
  const effects = [];
  function stepEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const m = effects[i], u = m.userData; u.t += dt;
      if (u.ring) { m.scale.setScalar(1 + u.t * 14); m.material.opacity = Math.max(0, 1 - u.t * 1.6); if (u.t > 0.65) { scene.remove(m); effects.splice(i, 1); } }
      else if (u.star) { m.quaternion.copy(camera.quaternion); m.scale.setScalar(0.5 + u.t * 3); m.material.opacity = Math.max(0, 1 - u.t * 3.5); if (u.t > 0.3) { scene.remove(m); effects.splice(i, 1); } }
    }
  }
  let celebrate = 0;

  // ---------- keeping up with the game ----------
  let lastGame = null;
  function sync(g) {
    if (g === lastGame) return;
    lastGame = g;
    setWorld(g.maze);
    if (pellets) { scene.remove(pellets.buns, pellets.pools); pellets.buns.geometry.dispose(); }
    const list = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (g.pellets[y * COLS + x] === 1) list.push({ x: X(x), z: Z(y), k: y * COLS + x });
    pellets = createPellets(list.length); pellets.set(list); scene.add(pellets.buns, pellets.pools);
    const pw = [];
    g.maze.rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'o') pw.push(y * COLS + x); }));
    powers.forEach((p, i) => { p.k = pw[i]; const k = pw[i] ?? 0; p.group.position.set(X(k % COLS), 0, Z(Math.floor(k / COLS))); });
    mirrorDirty = true;
    fruit.hide();
  }

  // where the titas gather round the caught bata: the open aisle tiles nearest him
  let spots = null, spotsFor = '';
  function gatherSpots(g, p) {
    const key = `${g.maze.name}:${Math.round(p.x)},${Math.round(p.y)}`;
    if (spots && spotsFor === key) return spots;
    const cx = Math.round(p.x), cy = Math.round(p.y), list = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const c = g.maze.rows[cy + dy]?.[cx + dx]; if ((dx || dy) && c && '. o'.includes(c)) list.push({ d: Math.hypot(dx, dy) + (Math.abs(dx) + Math.abs(dy) === 1 ? 0.6 : 0), x: X(cx + dx), z: Z(cy + dy) }); }
    list.sort((a, b) => a.d - b.d);
    while (list.length < 4) list.push({ x: X(cx) + list.length, z: Z(cy) });
    spots = list.slice(0, 4); spotsFor = key;
    return spots;
  }

  // ---------- each frame ----------
  const tmp = new THREE.Vector3(), bv = new THREE.Vector3();
  let clock = 0;
  // o: { mode: 'title' | 'intro' | 'play' | 'pause' | 'level' | 'over', introK (0-1), reduced, camMode, touch, calm }
  function frame(g, dt, o = {}) {
    clock += dt;
    const t = clock;
    sync(g);
    const reduced = !!o.reduced, frozen = (g.pause > 0 && !g.ready && !g.cleared) || o.mode === 'pause';
    const adt = frozen ? 0 : dt; // hit-stop: the world holds its breath while a tita is eaten
    // pellets and power-ups follow the game
    if (pellets) { for (const s of pellets.slots) if (s.alive && !g.pellets[s.k]) pellets.eat(s.k); pellets.update(dt, t, reduced); }
    powers.forEach((p, i) => { p.group.visible = p.k !== undefined && g.pellets[p.k] === 2; if (p.group.visible) p.update(t, reduced, i); });
    if (g.fruit) { fruit.show(g.fruit.id, t); fruit.update(t, reduced, g.fruit.t); } else { fruit.hide(); fruit.update(t, reduced); }
    // the bata
    const pl = g.player, pp = posOf(pl), dying = g.dying > 0 ? 1 - g.dying / 1.6 : g.over ? 1 : 0;
    const bx = X(pp.x), bz = Z(pp.y);
    bata.root.visible = !(g.over && o.mode !== 'over');
    bata.update({ x: bx, z: bz, dir: pl.dir, moving: pl.moving && !g.pause && !g.dying && !g.cleared && (o.mode === 'play' || o.mode === 'title'), mouth: pl.mouth, power: g.frightT > 0 ? g.frightT / Math.max(0.01, g.frightMax) : 0, dying: o.mode === 'over' ? Math.min(dying, 0.84) : dying, cheer: g.cleared || celebrate > 0 ? 1 : 0, reduced }, adt, t);
    // the titas
    const flashNow = g.frightT > 0 && g.frightT < 2 && Math.floor(t * 8) % 2 === 0;
    g.ghosts.forEach((gh, i) => {
      const m = titas[i];
      let x, z, dir = gh.dir, mode, speed = 1, face;
      if (gh.mode === 'house' || gh.mode === 'leaving' || gh.mode === 'entering') { x = X(gh.hx); z = Z(gh.hy); mode = gh.fright ? (flashNow ? 'flash' : 'scared') : 'scatter'; if (gh.mode === 'house') { speed = 0; face = 0; } else dir = gh.mode === 'leaving' ? (Math.abs(gh.hx - DOOR.x) > 0.01 ? (gh.hx < DOOR.x ? 3 : 1) : 0) : 2; }
      else { const q = posOf(gh); x = X(q.x); z = Z(q.y); mode = gh.mode === 'eyes' ? 'eyes' : gh.fright ? (flashNow ? 'flash' : 'scared') : g.scatter ? 'scatter' : 'chase'; }
      if (g.pause > 0 || g.cleared) speed = 0;
      const gossip = o.mode === 'over' || (g.dying > 0 && g.dying < 1.3);
      let y = 0;
      if (o.mode === 'over') { const spot = gatherSpots(g, pp)[i]; x = spot.x; z = spot.z; face = Math.atan2(bx - x, bz - z); mode = 'scatter'; speed = 0; }
      if (gh.mode === 'house' && !reduced) y = 0;
      m.root.visible = !g.cleared || celebrate <= 0 ? true : false;
      m.update({ x, z, y, dir, mode, face, speed, toward: { x: bx, z: bz }, reduced, gossip }, frozen ? 0 : dt, t);
      // a tita now and then calls out while she chases
    });
    if (o.mode === 'play' && !g.pause && !g.dying) {
      tauntT -= dt;
      if (tauntT <= 0) { tauntT = 5 + Math.random() * 6; const ch = g.ghosts.filter((q) => q.mode === 'active' && !q.fright); if (ch.length) { const q = pick(ch); bark(q.i, pick(TAUNTS), TITAS[q.i].color); } }
    }
    // the place: its own life, and a flash of every bulb for a cleared maze
    celebrate = Math.max(0, celebrate - dt);
    world.update(t, dt, { doorOpen: g.ghosts.some((q) => q.mode === 'leaving' || q.mode === 'entering'), celebrate });
    const blink = celebrate > 0 && !reduced ? (Math.floor(t * 8) % 2 ? 1.8 : 0.4) : 1;
    for (const l of points) l.intensity = l.userData.k * blink * (world.theme === 'simbahan' ? 0.85 + Math.sin(t * 13 + l.position.x) * 0.08 + Math.sin(t * 7.3 + l.position.z) * 0.07 : 1);
    if (world.floor) world.floor.material.userData.floorU.poolPulse.value = blink;
    for (const m of world.flicker) m.emissiveIntensity = 1.3 + Math.sin(t * 11 + m.id) * 0.18 + Math.sin(t * 23.7 + m.id * 2) * 0.12;
    // ambient motes
    const mc = world.theme === 'simbahan' ? '#c8ff6a' : world.theme === 'mall' ? '#ffffff' : '#ffe8c0';
    for (const mo of motes) {
      mo.ph += dt * mo.sp;
      const x = mo.x + Math.sin(mo.ph) * 0.8, y = mo.y + Math.sin(mo.ph * 1.7) * 0.3, z = mo.z + Math.cos(mo.ph * 0.8) * 0.8;
      const on = world.theme === 'simbahan' ? Math.max(0, Math.sin(mo.ph * 3)) : 0.5 + Math.sin(mo.ph * 2) * 0.3;
      if (glows.list.length < glows.max - 40) glows.list.push({ x, y, z, vx: 0, vy: 0, vz: 0, life: dt * 1.01, max: dt * 2, c: new THREE.Color(mc).multiplyScalar(on * (world.theme === 'simbahan' ? 1.2 : 0.35)), g: 0, size: world.theme === 'simbahan' ? 0.12 : 0.07, drag: 1 });
    }
    // a trail of light behind the titas going home, dust at the bata's heels
    g.ghosts.forEach((gh, i) => { if (gh.mode === 'eyes' && !frozen && Math.random() < 0.6) { const q = posOf(gh); emit(glows, X(q.x), 0.35, Z(q.y), TITAS[i].color, 1, { speed: 0.2, up: 0.2, life: 0.4, size: 0.18, g: 0 }); } });
    if (pl.moving && !frozen && o.mode === 'play' && !g.dying && Math.random() < 0.25) emit(bits, bx, 0.03, bz, world.theme === 'palengke' ? '#a09880' : '#8a8078', 1, { speed: 0.4, up: 0.4, life: 0.35, size: 0.08, g: 1 });
    if (g.frightT > 0 && !frozen && Math.random() < 0.5) emit(glows, bx + (Math.random() - 0.5) * 0.2, 0.9, bz, '#7fd8ff', 1, { speed: 0.3, up: 0.6, life: 0.5, size: 0.14, g: 0 });
    stepParticles(glows, dt); stepParticles(bits, dt); stepFloats(dt); stepEffects(dt);

    // ---------- the camera ----------
    const want = o.mode === 'title' ? 'title' : o.mode === 'intro' ? 'intro' : o.mode === 'over' ? 'over' : o.mode === 'level' || (g.cleared && o.mode === 'play') ? 'clear' : 'play';
    if (want !== cam.mode) { cam.mode = want; cam.t = 0; cam.from = { pos: cam.pos.clone(), look: cam.look.clone() }; }
    cam.t += dt;
    if (want === 'play') {
      playPose(g, o, pose);
      const k = 1 - Math.exp(-dt * (o.camMode === 'full' ? 3 : 4.5));
      if (cam.t < 0.8 && cam.from) { const e = ease(clamp(cam.t / 0.8, 0, 1)); cam.pos.lerpVectors(cam.from.pos, pose.pos, e); cam.look.lerpVectors(cam.from.look, pose.look, e); }
      else { cam.pos.lerp(pose.pos, k); cam.look.lerp(pose.look, k); }
      // the chase isn't calm: a faint sway (none with reduced motion)
      if (!reduced) { cam.pos.x += Math.sin(t * 0.35) * 0.08; cam.pos.y += Math.sin(t * 0.27) * 0.05; }
    } else if (want === 'intro') {
      const L = world.look, k = ease(clamp(o.introK || 0, 0, 1));
      playPose(g, o, pose);
      if (reduced) { cam.pos.copy(pose.pos); cam.look.copy(pose.look); }
      else { bez(V(L.intro[0].p), V(L.intro[1].p), pose.pos, k, cam.pos); bez(V(L.intro[0].l), V(L.intro[1].l), pose.look, k, cam.look); }
    } else if (want === 'clear') {
      // a crane: in close on the bata celebrating, then up over the whole cleared maze
      const k = ease(clamp(cam.t / 2.6, 0, 1)), a = reduced ? 0.4 : 0.4 + cam.t * 0.25;
      tmp.set(bx + Math.sin(a) * lerp(3, 10, k), lerp(2.2, 26, k), bz + Math.cos(a) * lerp(3, 12, k));
      cam.pos.lerp(tmp, 1 - Math.exp(-dt * 3)); cam.look.lerp(bv.set(lerp(bx, 0, k), lerp(0.6, 0, k), lerp(bz, 0, k)), 1 - Math.exp(-dt * 4));
    } else if (want === 'over') {
      const a = (reduced ? 0.6 : 0.6 + cam.t * 0.12);
      tmp.set(bx + Math.sin(a) * 3.6, 2.4, bz + Math.cos(a) * 3.6);
      cam.pos.lerp(tmp, 1 - Math.exp(-dt * 2)); cam.look.lerp(bv.set(bx + (camera.aspect > 1.2 ? -0.9 : 0), 0.45, bz), 1 - Math.exp(-dt * 3));
    } else {
      // the title: a slow drift over the stalls, the demo chase going on below
      const a = reduced ? 0 : Math.sin(t * 0.05) * 0.5;
      const portrait = camera.aspect < 0.8;
      tmp.set(Math.sin(a) * 16, portrait ? 26 : 11.5, Math.cos(a) * (portrait ? 26 : 23));
      cam.pos.lerp(tmp, 1 - Math.exp(-dt * 1.5)); cam.look.lerp(bv.set(0, 0, portrait ? -1 : -3.5), 1 - Math.exp(-dt * 1.5));
    }
    // punch-in on the big moments, then the shake
    cam.punch = Math.max(0, cam.punch - dt * 1.6);
    const pk = reduced ? 0 : ease(Math.min(1, cam.punch));
    camera.position.copy(cam.pos).lerp(tmp.copy(cam.punchAt).setY(0.4), pk * 0.28);
    const look = bv.copy(cam.look).lerp(cam.punchAt, pk * 0.5);
    const sh = !reduced && !o.calm ? cam.shake : 0;
    cam.shake = Math.max(0, cam.shake - dt * 0.9);
    camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh; camera.position.z += (Math.random() - 0.5) * sh;
    camera.lookAt(look);
    if (debug.cam) { camera.position.set(...debug.cam.slice(0, 3)); camera.lookAt(...debug.cam.slice(3, 6)); }
    // the sun's shadow box follows what's in view
    sun.target.position.set(cam.look.x, 0, cam.look.z); sun.position.copy(sun.target.position).addScaledVector(tmp.set(...world.look.sun.dir).normalize(), 60);

    // ---------- bubbles and markers ----------
    const W = canvas.clientWidth, H = canvas.clientHeight;
    for (const [i, b] of bubbles) {
      b.t -= dt;
      const m = titas[i];
      let on = b.t > 0 && (o.mode === 'play') && m.root.visible;
      if (on) { bv.set(m.root.position.x, 1.35, m.root.position.z).project(camera); on = bv.z < 1 && Math.abs(bv.x) < 1.05 && Math.abs(bv.y) < 1.05; }
      b.el.hidden = !on;
      if (on) { b.el.style.transform = `translate(${((bv.x + 1) / 2 * W).toFixed(1)}px, ${((1 - bv.y) / 2 * H).toFixed(1)}px) translate(-50%, -100%)`; b.el.style.opacity = String(clamp(b.t / 0.3, 0, 1)); }
    }
    g.ghosts.forEach((gh, i) => {
      const el = marks[i]; if (!el) return;
      const m = titas[i];
      bv.set(m.root.position.x, 0.5, m.root.position.z).project(camera);
      const out = Math.abs(bv.x) > 0.98 || Math.abs(bv.y) > 0.9 || bv.z > 1;
      const show = o.mode === 'play' && out && gh.mode !== 'house' && !g.dying;
      el.hidden = !show;
      if (!show) return;
      let x = bv.x, y = bv.y; if (bv.z > 1) { x = -x; y = -y; }
      const s = 0.92 / Math.max(Math.abs(x), Math.abs(y) / 0.84, 1e-3), px = clamp(x * s, -0.92, 0.92), py = clamp(y * s, -0.78, 0.78);
      el.style.transform = `translate(${((px + 1) / 2 * W).toFixed(1)}px, ${((1 - py) / 2 * H).toFixed(1)}px) translate(-50%, -50%)`;
      el.querySelector('i').style.transform = `rotate(${Math.atan2(-y, x).toFixed(3)}rad)`;
      el.classList.toggle('scared', !!gh.fright); el.classList.toggle('eyes', gh.mode === 'eyes');
    });

    // ---------- the frame ----------
    cam.flash = Math.max(0, cam.flash - dt * 3);
    cam.cool = lerp(cam.cool, g.frightT > 0 ? 0.55 : 0, 1 - Math.exp(-dt * 4));
    cam.grey = g.dying > 0 ? Math.min(1, cam.grey + dt * 3) * (g.dying < 0.3 ? g.dying / 0.3 : 1) : Math.max(0, cam.grey - dt * 2);
    renderMirror();
    post.render(dt, { flash: reduced ? 0 : cam.flash, split: reduced ? 0 : Math.max(cam.punch * 0.3, cam.flash * 0.5), cool: cam.cool, grey: o.mode === 'over' ? 0 : cam.grey * 0.8, bloomBoost: celebrate > 0 ? 0.3 : g.frightT > 0 ? 0.08 : 0 });
  }

  const debug = { cam: null };
  resize();
  return { frame, resize, event, renderer, post, scene, camera, setEnv, debug, bark, get world() { return world; }, get level() { return level; } };
}
