// The food, in 3D: pan de sal (one instanced mesh, each roll warm and glowing on the floor), Nanay's
// tsinelas (a pair of rubber slippers turning in a ring of light), and the fruit bonuses from saging to
// lechon, each modelled to look good enough to eat.
import * as THREE from './vendor/three.module.min.js';
import * as T from './tex.mjs';
import { slipperModel, rigidMerge } from './cast3d.mjs';

const TAU = Math.PI * 2;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  if (o.s) { if (Array.isArray(o.s)) m.scale.set(...o.s); else m.scale.setScalar(o.s); }
  m.castShadow = o.cast !== false; m.receiveShadow = false;
  return m;
}

// A roll of pan de sal: round on top, flat where it sat on the tray, a seam down the middle.
function bunGeometry() {
  const g = new THREE.SphereGeometry(1, 12, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    y = y < 0 ? y * 0.35 : y * 0.72;
    const seam = Math.exp(-(x * x) * 40) * 0.06 * Math.max(0, y); // the split along the top
    y -= seam;
    p.setXYZ(i, x * 1.1, y, z * 0.92);
  }
  g.computeVertexNormals();
  return g;
}

export function createPellets(count) {
  const crust = T.crust(5);
  const mat = new THREE.MeshStandardMaterial({ map: crust.map, normalMap: crust.normalMap, roughnessMap: crust.roughnessMap, color: '#ffffff', roughness: 1, emissive: '#ff9a3a', emissiveIntensity: 0.55 });
  const buns = new THREE.InstancedMesh(bunGeometry(), mat, count);
  buns.castShadow = false; buns.receiveShadow = false; buns.frustumCulled = false;
  // a warm pool of light under each roll: they read as glowing dots from anywhere in the maze
  const glowM = new THREE.MeshBasicMaterial({ map: T.glow('rgba(255,170,70,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, toneMapped: false });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowM, count);
  pools.frustumCulled = false; pools.userData.noReflect = true;
  const slots = []; // { x, z, k (the tile index), yaw, s, alive, pop }
  const d = new THREE.Object3D();
  function set(list) {
    slots.length = 0;
    for (const s of list) slots.push({ ...s, yaw: Math.random() * TAU, s: 0.085 + Math.random() * 0.012, alive: true, pop: 0, ph: Math.random() * TAU });
    buns.count = pools.count = slots.length;
  }
  function eat(k) { const s = slots.find((q) => q.k === k); if (s && s.alive) { s.alive = false; s.pop = 0.14; } }
  function update(dt, t, reduced) {
    slots.forEach((s, i) => {
      let sc = s.alive ? s.s : 0, y = 0.08;
      if (!s.alive && s.pop > 0) { s.pop -= dt; const f = Math.max(0, s.pop / 0.14); sc = s.s * (0.4 + f * 1.1); y += (1 - f) * 0.25; }
      if (s.alive && !reduced) y += Math.sin(t * 2.2 + s.ph) * 0.012;
      d.position.set(s.x, y, s.z); d.rotation.set(0, s.yaw + (s.alive ? 0 : t * 20), 0); d.scale.setScalar(sc); d.updateMatrix(); buns.setMatrixAt(i, d.matrix);
      d.position.set(s.x, 0.02, s.z); d.rotation.set(0, 0, 0); d.scale.setScalar(s.alive ? 0.62 : 0); d.updateMatrix(); pools.setMatrixAt(i, d.matrix);
    });
    buns.instanceMatrix.needsUpdate = true; pools.instanceMatrix.needsUpdate = true;
  }
  return { buns, pools, set, eat, update, slots };
}

// Nanay's tsinelas: a pair, leaning on each other and turning, in a ring and a column of light.
export function createPower() {
  const g = new THREE.Group();
  const pair = new THREE.Group(); g.add(pair);
  for (const s of [-1, 1]) {
    const sl = slipperModel({ sole: '#2f9bff', top: '#ffffff', strap: '#ff3b5c', scale: 2.1 });
    sl.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#3fb8ff'); o.material.emissiveIntensity = 0.35; } });
    sl.rotation.set(-1.25, 0, s * 0.25); sl.position.set(s * 0.07, 0.24, s * 0.03); sl.rotation.y = s * 0.2;
    pair.add(sl);
  }
  const shared = new Map(); pair.traverse((o) => { if (o.isMesh) { const k = o.material.color.getHex(); if (!shared.has(k)) shared.set(k, o.material); o.material = shared.get(k); o.castShadow = false; } });
  rigidMerge(pair);
  const ringM = new THREE.MeshBasicMaterial({ map: T.glow('rgba(110,210,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.9 });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), ringM); ring.position.y = 0.02; ring.userData.noReflect = true; g.add(ring);
  const band = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.38, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#bff0ff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  band.position.y = 0.025; band.userData.noReflect = true; g.add(band);
  const beamGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 20, 1, true); beamGeo.translate(0, 0.8, 0);
  const beamM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color('#7fd8ff') }, k: { value: 1 } },
    vertexShader: 'varying float vy; varying vec3 vn, vv; void main(){ vy = position.y / 1.6; vec4 mv = modelViewMatrix * vec4(position, 1.0); vn = normalize(normalMatrix * normal); vv = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float k; varying float vy; varying vec3 vn, vv; void main(){ float f = pow(1.0 - abs(dot(vn, vv)), 1.5); gl_FragColor = vec4(color * (1.0 - vy) * (1.0 - vy) * (0.25 + f * 0.5) * k, 1.0); }',
  });
  const beam = new THREE.Mesh(beamGeo, beamM); beam.userData.noReflect = true; g.add(beam);
  return {
    group: g,
    update(t, reduced, i = 0) {
      const p = reduced ? 1 : 1 + Math.sin(t * 6 + i) * 0.1;
      pair.rotation.y = reduced ? 0.6 : t * 1.8 + i; pair.position.y = reduced ? 0.05 : 0.06 + Math.sin(t * 3 + i) * 0.05;
      pair.scale.setScalar(p);
      ring.scale.setScalar(p); band.scale.setScalar(1 + ((t * 0.7 + i * 0.25) % 1) * 0.6); band.material.opacity = 0.8 * (1 - ((t * 0.7 + i * 0.25) % 1));
      beamM.uniforms.k.value = 0.8 + Math.sin(t * 4 + i) * 0.2;
    },
  };
}

// ---------- the fruit bonuses ----------
function saging() {
  const g = new THREE.Group(), peel = phys('#ffd23a', { roughness: 0.45, clearcoat: 0.3 }), tip = std('#4a3218');
  for (let k = 0; k < 5; k++) {
    const a = (k - 2) * 0.32, pts = [];
    for (let j = 0; j <= 8; j++) { const f = j / 8; pts.push(new THREE.Vector3(Math.sin(a) * f * 0.1, 0.05 + Math.sin(f * Math.PI) * 0.06 + f * 0.1, -0.16 + f * 0.34).applyAxisAngle(new THREE.Vector3(0, 1, 0), a * 0.5)); }
    const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, 16, 0.042, 7, false), p = tube.attributes.position;
    // taper both ends
    for (let i = 0; i < p.count; i++) { const seg = Math.floor(i / 8) / 16, c = curve.getPointAt(Math.min(1, seg)), tpr = Math.sin(Math.min(1, seg) * Math.PI) ** 0.45; p.setXYZ(i, c.x + (p.getX(i) - c.x) * tpr, c.y + (p.getY(i) - c.y) * tpr, c.z + (p.getZ(i) - c.z) * tpr); }
    tube.computeVertexNormals();
    g.add(mesh(tube, peel));
    g.add(mesh(new THREE.SphereGeometry(0.014, 6, 5), tip, pts[8].x, pts[8].y, pts[8].z));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.09, 8), std('#6a8a2a'), 0, 0.07, -0.19, { rx: 0.9 }));
  return g;
}
function mangga() {
  const g = new THREE.Group(), geo = new THREE.SphereGeometry(0.15, 28, 18), p = geo.attributes.position, col = [];
  const c1 = new THREE.Color('#ffc21a'), c2 = new THREE.Color('#ff8a1a'), c3 = new THREE.Color('#9ac23a'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bend = Math.sin((y / 0.15) * 1.4) * 0.03; // the kidney curve
    p.setXYZ(i, x * 0.72 + bend, y * 1.25, z * 0.62);
    c.copy(c1).lerp(c2, Math.max(0, x / 0.15) * 0.6).lerp(c3, Math.max(0, (y / 0.15) - 0.6) * 0.8); col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = mesh(geo, phys('#ffffff', { vertexColors: true, roughness: 0.35, clearcoat: 0.5 }), 0, 0.2, 0, { rz: 0.5 });
  g.add(m);
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.05, 6), std('#5a3a1a'), -0.08, 0.36, 0, { rz: 0.5 }));
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6), std('#2f8a3a', { roughness: 0.5 })); leaf.scale.set(1.6, 0.12, 0.55); leaf.position.set(-0.02, 0.38, 0); leaf.rotation.z = -0.4; leaf.castShadow = true; g.add(leaf);
  return g;
}
function lanzones() {
  const g = new THREE.Group(), skin = phys('#e6cf8a', { roughness: 0.55, clearcoat: 0.2 }), spot = std('#8a6a3a');
  const r = T.rng(3);
  for (let k = 0; k < 14; k++) {
    const layer = Math.floor(k / 5), a = k * 2.4 + r(), rad = 0.07 - layer * 0.02;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad, y = 0.08 + layer * 0.07 + r() * 0.02;
    g.add(mesh(new THREE.SphereGeometry(0.048, 14, 10), skin, x, y, z, { s: [1, 1.08, 1] }));
    g.add(mesh(new THREE.SphereGeometry(0.008, 5, 4), spot, x * 1.6, y + 0.02, z * 1.6, { cast: false }));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.18, 6), std('#6a4a22'), 0, 0.3, 0, { rz: 0.15 }));
  return g;
}
function balut() {
  const g = new THREE.Group();
  const egg = new THREE.LatheGeometry(Array.from({ length: 14 }, (_, k) => { const f = k / 13, a = f * Math.PI; return new THREE.Vector2(Math.sin(a) * 0.1 * (1 - f * 0.18), -Math.cos(a) * 0.13); }), 24);
  g.add(mesh(egg, phys('#f2e8d2', { roughness: 0.35, clearcoat: 0.4 }), 0, 0.2, 0));
  // cracked open on top, the salt in a twist of paper beside it
  g.add(mesh(new THREE.CircleGeometry(0.06, 14), std('#e8d8a0', { roughness: 0.6 }), 0, 0.325, 0, { rx: -Math.PI / 2, cast: false }));
  const bowl = new THREE.LatheGeometry([[0.001, 0], [0.12, 0.005], [0.16, 0.06], [0.17, 0.08]].map(([a, b]) => new THREE.Vector2(a, b)), 24);
  g.add(mesh(bowl, new THREE.MeshStandardMaterial({ map: T.weave(41, '#c49658').map, roughness: 0.8, side: THREE.DoubleSide }), 0, 0.02, 0));
  const cone = new THREE.ConeGeometry(0.04, 0.1, 10, 1, true); g.add(mesh(cone, std('#f4f1e8', { side: THREE.DoubleSide }), 0.16, 0.1, 0.05, { rx: Math.PI, rz: 0.3 }));
  return g;
}
function bibingka() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.08, 28), std('#8a4a2a', { roughness: 0.9 }), 0, 0.04, 0)); // the clay pot
  const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), std('#3a8a3a', { roughness: 0.5, side: THREE.DoubleSide })); leaf.rotation.x = -Math.PI / 2; leaf.position.y = 0.085; g.add(leaf);
  const cake = new THREE.CylinderGeometry(0.18, 0.185, 0.07, 32), p = cake.attributes.position, col = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const top = p.getY(i) > 0.02; c.set(top ? '#d88a3a' : '#f2c880'); if (top) c.lerp(new THREE.Color('#7a3a14'), Math.random() * 0.35); col.push(c.r, c.g, c.b); }
  cake.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.add(mesh(cake, std('#ffffff', { vertexColors: true, roughness: 0.7 }), 0, 0.125, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 16), std('#ff7a3a', { roughness: 0.4 }), 0.05, 0.168, 0.02)); // salted egg
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.06), std('#ffe07a', { roughness: 0.5 }), -0.06, 0.168, -0.03, { ry: 0.5 })); // kesong puti
  for (let k = 0; k < 20; k++) { const a = Math.random() * TAU, r = Math.random() * 0.14; g.add(mesh(new THREE.SphereGeometry(0.006, 4, 3), std('#fff8e8'), Math.cos(a) * r, 0.163, Math.sin(a) * r, { cast: false })); } // grated coconut
  return g;
}
function lechon() {
  const g = new THREE.Group(), skin = phys('#b8521c', { roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.3, sheenColor: new THREE.Color('#ffb070') });
  // the tray, a banana leaf on it
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.03, 28), new THREE.MeshStandardMaterial({ map: T.weave(51, '#caa060').map, roughness: 0.8 }), 0, 0.015, 0));
  const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.27, 24), std('#3a8a3a', { roughness: 0.45, side: THREE.DoubleSide })); leaf.rotation.x = -Math.PI / 2; leaf.position.y = 0.033; g.add(leaf);
  const pig = new THREE.Group(); pig.position.y = 0.1; g.add(pig);
  const bodyG = new THREE.CapsuleGeometry(0.1, 0.24, 8, 18); bodyG.rotateZ(Math.PI / 2);
  pig.add(mesh(bodyG, skin, 0, 0.03, 0, { s: [1, 0.85, 0.95] }));
  const headG = new THREE.SphereGeometry(0.085, 18, 14); pig.add(mesh(headG, skin, 0.24, 0.04, 0, { s: [1.1, 0.9, 0.9] }));
  pig.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.06, 14), skin, 0.32, 0.03, 0, { rz: Math.PI / 2 })); // the snout
  for (const s of [-1, 1]) { pig.add(mesh(new THREE.ConeGeometry(0.03, 0.06, 8), skin, 0.23, 0.12, s * 0.05, { rz: -0.4, rx: s * 0.3 })); pig.add(mesh(new THREE.SphereGeometry(0.01, 6, 5), std('#1a0a04'), 0.3, 0.07, s * 0.035, { cast: false })); } // ears, eyes
  pig.add(mesh(new THREE.SphereGeometry(0.035, 14, 10), phys('#e81a2a', { roughness: 0.2 }), 0.36, 0.02, 0)); // the apple in its mouth
  for (const [x, z] of [[-0.12, 0.08], [-0.12, -0.08], [0.1, 0.08], [0.1, -0.08]]) pig.add(mesh(new THREE.CapsuleGeometry(0.022, 0.06, 4, 8), skin, x, -0.06, z, { rz: x < 0 ? 1.2 : -1.2 }));
  pig.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI * 1.5), skin, -0.24, 0.07, 0, { ry: Math.PI / 2 })); // the curly tail
  // a few crackling highlights
  for (let k = 0; k < 16; k++) { const a = Math.random() * Math.PI, x = (Math.random() - 0.5) * 0.3; pig.add(mesh(new THREE.SphereGeometry(0.012, 5, 4), phys('#e88a3a', { roughness: 0.2, clearcoat: 1 }), x, 0.03 + Math.sin(a) * 0.085, Math.cos(a) * 0.09, { cast: false })); }
  return g;
}
const MAKERS = { saging, mangga, lanzones, balut, bibingka, lechon };

export function createFruit() {
  const g = new THREE.Group(), models = {};
  const stand = new THREE.Group(); g.add(stand);
  for (const [id, make] of Object.entries(MAKERS)) { const m = make(); m.visible = false; stand.add(m); models[id] = m; }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.glow('rgba(255,220,120,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.8 }));
  pool.position.y = 0.02; pool.userData.noReflect = true; g.add(pool);
  let showing = null, t0 = 0;
  return {
    group: g,
    models,
    show(id, t) { if (showing !== id) { for (const [k, m] of Object.entries(models)) m.visible = k === id; showing = id; t0 = t; } },
    hide() { if (showing) { for (const m of Object.values(models)) m.visible = false; showing = null; } },
    update(t, reduced, left = 9) {
      g.visible = !!showing;
      if (!showing) return;
      const k = Math.min(1, (t - t0) / 0.45), drop = reduced ? 0 : (1 - k) * (1 - k) * 1.6, bounce = reduced ? 0 : Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 0.15;
      stand.position.y = 0.12 + drop + bounce + (reduced ? 0 : Math.sin(t * 2.5) * 0.03);
      stand.rotation.y = reduced ? 0.5 : t * 1.2;
      const blink = left < 2 && !reduced && Math.floor(t * 8) % 2 === 0; // about to go
      stand.visible = !blink;
      stand.scale.setScalar(1.35);
      pool.material.opacity = 0.6 + Math.sin(t * 5) * 0.15;
    },
  };
}
// a fruit on its own, for the HUD's row of levels (rendered once into an icon)
export function fruitModel(id) { return MAKERS[id] ? MAKERS[id]() : null; }
