// The cast, modelled and animated in code: the bata and the four titas. Smooth, toy-like shapes with
// real materials, and procedural motion (anticipation, squash and stretch, follow-through, idle life).
// - The bata wears a yellow cap whose brim points the way he runs (a Pac-Man you can read from above),
//   chomps as he eats, raises Nanay's tsinelas while it lasts, and gets dizzy when a tita catches him.
// - Each tita wears a floral duster (the bell of a ghost), her own hair and her own prop: Baby's fan,
//   Lorna's cellphone, Chona's bayong, Marites's kape. Her eyes follow the bata. Frightened, she goes
//   blue, throws her hands up and trembles (flashing white as it wears off); eaten, only her eyes, her
//   hair and a faint ghost of her duster hurry home.
// The view places them from the game state; nothing here changes the game.
import * as THREE from './vendor/three.module.min.js';
import * as T from './tex.mjs';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const wrapA = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
export const DIR_YAW = [Math.PI, -Math.PI / 2, 0, Math.PI / 2]; // up, left, down, right: the yaw that faces that way (+z is down the maze)

const M = new Map();
function std(color, o = {}) { const k = color + JSON.stringify(o); if (!M.has(k)) M.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o })); return M.get(k); }
function mesh(geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  if (o.s) { if (Array.isArray(o.s)) m.scale.set(...o.s); else m.scale.setScalar(o.s); }
  m.castShadow = o.cast !== false; m.receiveShadow = !!o.receive;
  return m;
}
const G = {
  sph: (r, w = 20, h = 14, ...part) => new THREE.SphereGeometry(r, w, h, ...part),
  cyl: (a, b, h, n = 14) => new THREE.CylinderGeometry(a, b, h, n),
  cap: (r, l, n = 10) => new THREE.CapsuleGeometry(r, l, 6, n),
  lathe: (pts, n = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n),
};
// Merge the rigid parts of a character that share a material and a parent into one mesh each, so a
// whole tita costs a handful of draws. Parts that move or hide on their own are marked solo.
const solo = (...ms) => { for (const m of ms) m.userData.solo = true; };
export function rigidMerge(root) {
  const nodes = [];
  root.traverse((o) => nodes.push(o));
  for (const n of nodes) {
    const buckets = new Map();
    for (const c of n.children) if (c.isMesh && !c.userData.solo && !c.children.length && !Array.isArray(c.material)) { if (!buckets.has(c.material)) buckets.set(c.material, []); buckets.get(c.material).push(c); }
    for (const [mat, list] of buckets) {
      if (list.length < 2) continue;
      const geos = list.map((c) => { c.updateMatrix(); const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; });
      const n3 = geos.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n3 * 3), nor = new Float32Array(n3 * 3), uv = new Float32Array(n3 * 2);
      let at = 0;
      for (const g of geos) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, at * 2); at += c; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const m = new THREE.Mesh(geo, mat); m.castShadow = list.some((c) => c.castShadow); m.frustumCulled = false;
      for (const c of list) n.remove(c);
      n.add(m);
    }
  }
  // then the plain-coloured parts of each node become one mesh, their colours in the vertices
  const plain = (m) => m.isMeshStandardMaterial && !m.map && !m.transparent && !m.userData.live && m.emissive.getHex() === 0 && m.metalness < 0.5;
  const shared = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  for (const n of nodes) {
    const list = n.children.filter((c) => c.isMesh && !c.userData.solo && !c.children.length && !Array.isArray(c.material) && plain(c.material));
    if (list.length < 2) continue;
    const geos = list.map((c) => { c.updateMatrix(); const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix); const col = new Float32Array(g.attributes.position.count * 3); const k = c.material.color; for (let i = 0; i < col.length; i += 3) { col[i] = k.r; col[i + 1] = k.g; col[i + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; });
    const n3 = geos.reduce((a2, g) => a2 + g.attributes.position.count, 0), pos = new Float32Array(n3 * 3), nor = new Float32Array(n3 * 3), col = new Float32Array(n3 * 3);
    let at = 0;
    for (const g of geos) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3); col.set(g.attributes.color.array, at * 3); at += c; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, shared); m.castShadow = list.some((c) => c.castShadow); m.frustumCulled = false;
    for (const c of list) n.remove(c);
    n.add(m);
  }
  // only the bigger parts cast shadows: eyes, lashes and earrings don't need to
  root.traverse((o) => { if (o.isMesh && o.castShadow) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere.radius < 0.06) o.castShadow = false; } });
}

// Then the whole character becomes a few skinned meshes, one per material: every part that moved on its
// own is now a bone, so the animation code above still turns arms, heads and pupils the same way, but a
// tita costs a handful of draws instead of dozens. Hiding a part (visible = false) collapses its bones.
export function skinify(root) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.real) meshes.push(o); });
  const bones = [], index = new Map(), groups = new Map(), m4 = new THREE.Matrix4();
  for (const m of meshes) {
    if (!index.has(m)) { index.set(m, bones.length); bones.push(m); }
    const bi = index.get(m);
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m4.multiplyMatrices(rootInv, m.matrixWorld));
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? bi : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    // plain colours (and parts already coloured by vertex) share one material; textures, glows, glass and live colours keep their own
    const mt = m.material, plain = mt.type === 'MeshStandardMaterial' && !mt.map && !mt.transparent && !mt.userData.live && mt.emissive.getHex() === 0 && mt.metalness < 0.5;
    const key = plain ? 'vc' : mt;
    if (plain && !g.attributes.color) { const col = new Float32Array(n * 3); for (let i = 0; i < n * 3; i += 3) { col[i] = mt.color.r; col[i + 1] = mt.color.g; col[i + 2] = mt.color.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    if (!plain && g.attributes.color && !mt.vertexColors) g.deleteAttribute('color');
    if (!groups.has(key)) groups.set(key, { list: [], cast: false });
    const grp = groups.get(key); grp.list.push(g); grp.cast = grp.cast || m.castShadow;
    m.layers.disableAll(); // it stays as a bone, but never draws again
  }
  // visibility: keep each object's own flag, and collapse the bones under anything hidden
  const objs = [];
  root.traverse((o) => { if (o !== root && !o.userData.real) objs.push(o); });
  for (const o of objs) { let shown = o.visible; o.userData.shown = () => shown; Object.defineProperty(o, 'visible', { get: () => shown, set: (v) => { shown = v; } }); }
  const chains = bones.map((b) => { const c = []; for (let o = b; o && o !== root; o = o.parent) c.push(o); return c; });
  const skel = new THREE.Skeleton(bones);
  const upd = skel.update.bind(skel);
  skel.update = () => { upd(); const bm = skel.boneMatrices; chains.forEach((c, i) => { for (const o of c) if (!o.userData.shown()) { bm.fill(0, i * 16, i * 16 + 16); break; } }); };
  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  for (const [key, { list, cast }] of groups) {
    const mat = key === 'vc' ? vcMat : key;
    const geo = mergeSkinned(list);
    const sm = new THREE.SkinnedMesh(geo, mat);
    sm.castShadow = cast; sm.frustumCulled = false; sm.userData.real = true;
    root.add(sm); sm.bind(skel, root.matrixWorld);
  }
  // rendering must still walk into hidden groups' bones, so three sees them all as visible; the flag above does the hiding
  for (const o of objs) if (o.isMesh) o.matrixAutoUpdate = true;
}
function mergeSkinned(list) {
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
  for (const [k, size, Arr] of [['position', 3, Float32Array], ['normal', 3, Float32Array], ['uv', 2, Float32Array], ['color', 3, Float32Array], ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array]]) {
    if (k === 'color' && !list.every((g) => g.attributes.color)) continue;
    if (k === 'uv' && !list.some((g) => g.attributes.uv)) continue;
    const arr = new Arr(n * size); let at = 0;
    for (const g of list) { const a = g.attributes[k], c = g.attributes.position.count; if (a) arr.set(a.array.subarray(0, c * size), at * size); at += c; }
    out.setAttribute(k, k === 'skinIndex' ? new THREE.Uint16BufferAttribute(arr, 4) : new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// a limb that hangs from its pivot: a capsule from 0 down to -len
function limb(r, len, mat) { const g = new THREE.Group(); g.add(mesh(G.cap(r, len), mat, 0, -len / 2)); return g; }

// ---------- the tsinelas (Nanay's rubber slippers) ----------
export function slipperModel({ sole = '#2f6fd6', top = '#e9f2ff', strap = '#e8384f', scale = 1 } = {}) {
  const s = new THREE.Shape();
  // a footprint: heel, the waist, the wide front and the toes
  s.moveTo(0, -0.12); s.bezierCurveTo(0.05, -0.12, 0.052, -0.07, 0.042, -0.02); s.bezierCurveTo(0.036, 0.03, 0.06, 0.06, 0.056, 0.1);
  s.bezierCurveTo(0.052, 0.14, 0.02, 0.15, 0, 0.15); s.bezierCurveTo(-0.03, 0.15, -0.054, 0.135, -0.056, 0.1); s.bezierCurveTo(-0.058, 0.06, -0.038, 0.03, -0.042, -0.02);
  s.bezierCurveTo(-0.052, -0.07, -0.05, -0.12, 0, -0.12);
  const g = new THREE.Group();
  const layer = (depth, mat, y) => { const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 10 }), mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.castShadow = true; return m; };
  g.add(layer(0.012, std(sole, { roughness: 0.55 }), 0), layer(0.006, std(top, { roughness: 0.7 }), 0.014));
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.05, 0.02, -0.01), new THREE.Vector3(-0.03, 0.045, 0.05), new THREE.Vector3(0, 0.035, 0.1), new THREE.Vector3(0.03, 0.045, 0.05), new THREE.Vector3(0.05, 0.02, -0.01)]);
  const st = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 6), std(strap, { roughness: 0.5 })); st.castShadow = true; g.add(st);
  g.add(mesh(G.sph(0.012, 8, 6), std(strap), 0, 0.03, 0.1));
  g.scale.setScalar(scale);
  return g;
}

// ---------- faces ----------
function eye(r, pupilColor = '#1b1024') {
  const g = new THREE.Group();
  const white = mesh(G.sph(r, 18, 12), std('#ffffff', { roughness: 0.25 }), 0, 0, 0, { s: [1, 1.15, 0.7], cast: false });
  const pupil = new THREE.Group();
  pupil.add(mesh(G.sph(r * 0.52, 14, 10), std(pupilColor, { roughness: 0.2 }), 0, 0, r * 0.5, { s: [1, 1.1, 0.5], cast: false }));
  pupil.add(mesh(G.sph(r * 0.16, 8, 6), std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), r * 0.18, r * 0.2, r * 0.74, { cast: false }));
  g.add(white, pupil);
  return { g, pupil, white, r };
}
// point pupils toward a direction in the head's own space (x right, y up, z forward)
function lookPupil(e, lx, ly) { e.pupil.position.set(clamp(lx, -1, 1) * e.r * 0.42, clamp(ly, -1, 1) * e.r * 0.4, 0); }

// ---------- the bata ----------
export function makeBata() {
  const skin = std('#b8784a', { roughness: 0.55 }), dark = std('#1b1320', { roughness: 0.45 }), yellow = std('#ffc928', { roughness: 0.55 }), red = std('#e8384f', { roughness: 0.55 });
  const shirt = std('#ffd23f', { roughness: 0.8 }), shorts = std('#2a4a8a', { roughness: 0.8 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  // legs and slippers
  const legL = limb(0.042, 0.2, skin), legR = limb(0.042, 0.2, skin);
  legL.position.set(-0.065, 0.3, 0); legR.position.set(0.065, 0.3, 0);
  for (const l of [legL, legR]) { const sl = slipperModel({ scale: 0.95 }); sl.position.set(0, -0.285, 0.02); l.add(sl); }
  body.add(legL, legR);
  // shorts, shirt
  body.add(mesh(G.lathe([[0.001, 0.2], [0.115, 0.2], [0.125, 0.26], [0.13, 0.36], [0.001, 0.36]]), shorts, 0, 0, 0));
  const torso = mesh(G.lathe([[0.001, 0.32], [0.135, 0.33], [0.145, 0.42], [0.135, 0.52], [0.09, 0.57], [0.001, 0.58]]), shirt, 0, 0, 0);
  body.add(torso);
  body.add(mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 20), red, 0, 0.56, 0, { rx: Math.PI / 2 })); // the collar
  body.add(mesh(new THREE.TorusGeometry(0.142, 0.012, 6, 24), red, 0, 0.44, 0, { rx: Math.PI / 2, cast: false })); // a stripe
  // arms
  const arm = (sx) => {
    const g = new THREE.Group(); g.position.set(sx * 0.15, 0.52, 0);
    g.add(mesh(G.sph(0.058, 12, 10), shirt, 0, -0.02, 0)); // the sleeve
    g.add(mesh(G.cap(0.034, 0.14), skin, 0, -0.1, 0));
    g.add(mesh(G.sph(0.042, 12, 10), skin, 0, -0.2, 0.01)); // the hand
    body.add(g); return g;
  };
  const armL = arm(-1), armR = arm(1);
  const held = slipperModel({ sole: '#2f9bff', top: '#ffffff', strap: '#ff3b5c', scale: 1.5 }); held.rotation.set(-0.3, 0, Math.PI / 2 + 0.2); held.position.set(0.02, -0.26, 0.06); held.visible = false; armR.add(held);
  held.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#5fd8ff'); o.material.emissiveIntensity = 0.6; } });
  // the head
  const head = new THREE.Group(); head.position.set(0, 0.6, 0); body.add(head);
  head.add(mesh(G.sph(0.165, 28, 20), skin, 0, 0.13, 0));
  for (const s of [-1, 1]) head.add(mesh(G.sph(0.04, 10, 8), skin, s * 0.16, 0.12, 0, { s: [0.6, 1, 0.8] })); // ears
  // hair under the cap, and the cap: a yellow crown and a brim that points where he runs
  head.add(mesh(G.sph(0.17, 24, 14, 0, TAU, 0, Math.PI * 0.55), dark, 0, 0.14, -0.01, { s: [1.02, 0.95, 1.02] }));
  const crown = mesh(new THREE.SphereGeometry(0.172, 26, 14, 0, TAU, 0, Math.PI * 0.42), yellow, 0, 0.16, -0.005);
  head.add(crown);
  const brim = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 20, 1, false, -Math.PI / 2 - 1.1, 2.2), yellow, 0, 0.225, 0.1, { s: [1.05, 1, 1.25], rx: -0.12 });
  head.add(brim);
  head.add(mesh(G.cyl(0.022, 0.022, 0.012, 10), red, 0, 0.33, 0)); // the button on top
  head.add(mesh(new THREE.TorusGeometry(0.168, 0.01, 6, 28, Math.PI * 1.2), red, 0, 0.2, 0, { rx: Math.PI / 2, rz: Math.PI * 1.4 - 0.2, cast: false }));
  // the face
  const eL = eye(0.034), eR = eye(0.034);
  eL.g.position.set(-0.06, 0.15, 0.145); eR.g.position.set(0.06, 0.15, 0.145); eL.g.rotation.y = -0.35; eR.g.rotation.y = 0.35;
  head.add(eL.g, eR.g);
  const browL = mesh(G.cap(0.008, 0.035, 6), dark, -0.062, 0.2, 0.15, { rz: Math.PI / 2 - 0.15, cast: false }), browR = mesh(G.cap(0.008, 0.035, 6), dark, 0.062, 0.2, 0.15, { rz: Math.PI / 2 + 0.15, cast: false });
  head.add(browL, browR);
  for (const s of [-1, 1]) head.add(mesh(G.sph(0.026, 10, 8), std('#e87a6a', { roughness: 0.8, transparent: true, opacity: 0.6 }), s * 0.1, 0.08, 0.13, { s: [1, 0.6, 0.4], cast: false }));
  const mouth = new THREE.Group(); mouth.position.set(0, 0.06, 0.155); head.add(mouth);
  const mouthIn = mesh(G.sph(0.045, 16, 10), std('#5a1420', { roughness: 0.6 }), 0, 0, 0, { s: [1, 0.2, 0.5], cast: false });
  const tongue = mesh(G.sph(0.028, 10, 8), std('#e85a6a'), 0, -0.012, 0.012, { s: [1, 0.35, 0.6], cast: false });
  mouth.add(mouthIn, tongue);
  // dizzy stars, when he's caught
  const stars = new THREE.Group(); stars.position.y = 0.95; stars.visible = false; root.add(stars);
  const starGeo = new THREE.ExtrudeGeometry(T.starShape(0.05, 0.022), { depth: 0.012, bevelEnabled: false });
  for (let k = 0; k < 4; k++) { const s = mesh(starGeo, std('#ffd23f', { emissive: '#ffb020', emissiveIntensity: 1.2 }), 0, 0, 0, { cast: false }); stars.add(s); }
  // a soft shadow and the player's glow under him
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ map: T.glow('rgba(255,210,70,1)'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.012; root.add(halo); halo.userData.noReflect = true;
  solo(halo, mouthIn, tongue, browL, browR, ...stars.children);
  rigidMerge(root);
  halo.userData.real = true;
  skinify(root);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  const st = { yaw: 0, spin: 0, phase: 0, bob: 0, chomp: 0, lastMouth: 0, squash: 0, turnT: 0, lastDir: -1, cheer: 0, look: 0 };
  // o: { x, z, dir, moving, mouth (distance chewed), power (0-1 of the tsinelas left), dying (0-1), cheer, idle, reduced }
  function update(o, dt, t) {
    root.position.set(o.x, 0, o.z);
    const want = DIR_YAW[o.dir];
    if (st.lastDir !== o.dir) { if (st.lastDir >= 0) { st.turnT = 1; st.squash = -0.5; } st.lastDir = o.dir; }
    st.turnT = Math.max(0, st.turnT - dt * 6);
    st.yaw += wrapA(want - st.yaw) * Math.min(1, dt * 22);
    root.rotation.y = st.yaw;
    const run = o.moving && !o.dying ? 1 : 0;
    st.phase += dt * (run ? 15 : 0);
    const sw = Math.sin(st.phase) * run;
    // squash and stretch: a squash as he plants a turn, bouncing back past round
    st.squash = lerp(st.squash, 0, Math.min(1, dt * 10));
    const bounce = Math.abs(Math.sin(st.phase)) * 0.05 * run;
    const sq = o.reduced ? 0 : st.squash * 0.12 + (run ? Math.sin(st.phase * 2) * 0.03 : 0);
    body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    body.position.y = bounce;
    body.rotation.x = run * 0.16 + (o.reduced ? 0 : st.turnT * 0.12);
    legL.rotation.x = sw * 0.9; legR.rotation.x = -sw * 0.9;
    armL.rotation.set(-sw * 0.9, 0, -0.12); armR.rotation.set(sw * 0.9, 0, 0.12);
    // the chomp: his mouth opens and shuts with every step along the aisle
    const chew = o.moving ? Math.abs(Math.sin(o.mouth * Math.PI)) : 0.25;
    mouthIn.scale.set(1, lerp(0.15, 1.0, chew), 0.55); tongue.visible = chew > 0.4;
    head.rotation.x = -chew * 0.12;
    head.rotation.z = run ? Math.sin(st.phase) * 0.04 : Math.sin(t * 2) * 0.03;
    // Nanay's tsinelas, raised high while it lasts
    held.visible = o.power > 0 && !o.dying;
    if (held.visible) { armR.rotation.set(-2.7 + Math.sin(t * 14) * 0.18, 0, 0.25); held.rotation.z = Math.PI / 2 + 0.2 + Math.sin(t * 14) * 0.3; }
    // eyes: forward, glancing about when he stands still
    const glance = o.moving ? 0 : Math.sin(t * 0.9) * 0.8;
    lookPupil(eL, glance, 0.1); lookPupil(eR, glance, 0.1);
    eL.g.scale.setScalar(1); eR.g.scale.setScalar(1);
    browL.position.y = browR.position.y = 0.2 + (o.power > 0 ? 0.01 : 0);
    // a win: jumping with both arms up
    if (o.cheer > 0) {
      const j = Math.abs(Math.sin(t * 7));
      body.position.y = j * 0.22; armL.rotation.set(-2.8, 0, -0.3); armR.rotation.set(-2.8, 0, 0.3); legL.rotation.x = legR.rotation.x = -j * 0.3;
      root.rotation.y = st.yaw = lerp(st.yaw, 0, Math.min(1, dt * 6));
      mouthIn.scale.set(1.2, 1, 0.55);
    }
    // caught: a dizzy spin, then down on his back with stars going round
    stars.visible = false;
    if (o.dying > 0) {
      const k = o.dying, spin = o.reduced ? 0 : Math.min(1, k / 0.45);
      root.rotation.y = st.yaw + spin * TAU * 2.2;
      const fall = clamp((k - 0.4) / 0.3, 0, 1), e = fall * fall * (3 - 2 * fall);
      body.rotation.x = -e * 1.45; body.position.y = e * 0.1;
      armL.rotation.set(-e * 2.4, 0, -0.6 * e); armR.rotation.set(-e * 2.4, 0, 0.6 * e);
      legL.rotation.x = e * 0.3; legR.rotation.x = -e * 0.2;
      mouthIn.scale.set(0.8, 0.6, 0.55);
      eL.g.scale.set(1, 0.2, 1); eR.g.scale.set(1, 0.2, 1); // squeezed shut
      stars.visible = k > 0.2;
      stars.position.y = lerp(0.95, 0.35, e);
      stars.position.z = -e * 0.55;
      stars.children.forEach((s, i) => { const a = t * 5 + (i / 4) * TAU; s.position.set(Math.cos(a) * 0.2, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.2); s.rotation.y = a * 2; });
      const fade = clamp((k - 0.85) / 0.15, 0, 1);
      root.scale.setScalar((root.userData.s || 1) * (1 - fade * 0.9));
    } else root.scale.setScalar(root.userData.s || 1);
    halo.material.opacity = o.power > 0 ? 0.8 + Math.sin(t * 10) * 0.15 : 0.5;
    halo.material.color.set(o.power > 0 ? '#9fe8ff' : '#ffffff');
  }
  return { root, update, head, held };
}

// ---------- the titas ----------
export const TITA_LOOK = [
  { id: 'baby', skin: '#c68a5e', hair: '#4a1c14', prop: 'fan' },
  { id: 'lorna', skin: '#d09a6a', hair: '#141018', prop: 'phone' },
  { id: 'chona', skin: '#b87a50', hair: '#7a3218', prop: 'bayong' },
  { id: 'marites', skin: '#c88a58', hair: '#1a1214', prop: 'kape' },
];
const SCARED = new THREE.Color('#2438d8'), FLASH = new THREE.Color('#f4f1f8');

export function makeTita(i, color) {
  const look = TITA_LOOK[i], base = new THREE.Color(color);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skinM = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.55 }); skinM.userData.live = true;
  const hairM = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.4, map: T.hair(i + 3).map });
  const print = T.floral(color, i * 17 + 3);
  const dressM = new THREE.MeshStandardMaterial({ color: '#ffffff', map: print, roughness: 0.82 });
  // the hem sways and ripples as she hurries (bent in the vertex shader, so it costs nothing)
  const hemU = { time: { value: 0 }, sway: { value: 0.5 } };
  dressM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, hemU);
    sh.vertexShader = 'uniform float time, sway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hem = smoothstep(0.34, 0.02, position.y);
      float ang = atan(position.z, position.x);
      transformed.xz *= 1.0 + hem * (sin(ang * 7.0 + time * 9.0) * 0.06 * sway + 0.02);
      transformed.z -= hem * hem * 0.05 * sway;`);
  };
  const dress = mesh(G.lathe([[0.001, 0.02], [0.27, 0.03], [0.285, 0.07], [0.24, 0.2], [0.19, 0.34], [0.165, 0.42], [0.185, 0.5], [0.17, 0.57], [0.12, 0.63], [0.06, 0.66], [0.001, 0.665]], 36), dressM, 0, 0, 0);
  body.add(dress);
  const hemTrim = mesh(new THREE.TorusGeometry(0.275, 0.018, 8, 36), new THREE.MeshStandardMaterial({ color: '#fff6ea', roughness: 0.8 }), 0, 0.045, 0, { rx: Math.PI / 2 });
  body.add(hemTrim);
  body.add(mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 20), new THREE.MeshStandardMaterial({ color: '#fff6ea', roughness: 0.8 }), 0, 0.655, 0, { rx: Math.PI / 2 })); // a lace collar
  // feet in slippers, shuffling under the hem
  const feet = [];
  for (const s of [-1, 1]) { const f = slipperModel({ sole: '#7a5a3a', top: '#f2e6d0', strap: color, scale: 0.9 }); f.position.set(s * 0.08, 0.005, 0.12); body.add(f); feet.push(f); }
  // arms: puffy sleeves, skin, hands
  const arm = (sx) => {
    const g = new THREE.Group(); g.position.set(sx * 0.17, 0.58, 0);
    g.add(mesh(G.sph(0.07, 14, 10), dressM, 0, -0.02, 0));
    g.add(mesh(G.cap(0.032, 0.16), skinM, 0, -0.12, 0));
    g.add(mesh(G.sph(0.04, 12, 10), skinM, 0, -0.23, 0.01));
    body.add(g); return g;
  };
  const armL = arm(-1), armR = arm(1);
  // the head
  const head = new THREE.Group(); head.position.set(0, 0.66, 0); body.add(head);
  head.add(mesh(G.sph(0.145, 28, 20), skinM, 0, 0.12, 0));
  const gold = std('#ffd23f', { metalness: 0.9, roughness: 0.25 });
  for (const s of [-1, 1]) { head.add(mesh(G.sph(0.035, 10, 8), skinM, s * 0.142, 0.11, 0, { s: [0.6, 1, 0.8] })); head.add(mesh(G.sph(0.018, 8, 6), gold, s * 0.148, 0.075, 0.01)); } // ears, earrings
  // her own hair
  const hairG = new THREE.Group(); head.add(hairG);
  hairG.add(mesh(G.sph(0.155, 24, 16, 0, TAU, 0, Math.PI * 0.6), hairM, 0, 0.13, -0.012, { s: [1.03, 1, 1.05] }));
  if (look.id === 'baby') {
    hairG.add(mesh(G.sph(0.14, 22, 14), hairM, 0, 0.27, -0.03, { s: [1.25, 0.9, 1.1] })); // a big bouffant
    hairG.add(mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 30, Math.PI), std(color, { roughness: 0.5 }), 0, 0.21, 0.01, { rx: -0.35, cast: false })); // headband
  } else if (look.id === 'lorna') {
    const cols = ['#ff80ab', '#80d8ff', '#ffff8d', '#b9f6ca', '#ff80ab'];
    for (let k = 0; k < 5; k++) { const a = -0.9 + k * 0.45; hairG.add(mesh(G.cyl(0.035, 0.035, 0.1, 12), std(cols[k], { roughness: 0.45 }), Math.sin(a) * 0.12, 0.25 + Math.cos(a) * 0.02, -0.02 + Math.cos(a * 1.4) * 0.02, { rz: Math.PI / 2, ry: a * 0.3 })); } // curlers
    for (let k = 0; k < 3; k++) hairG.add(mesh(G.cyl(0.033, 0.033, 0.09, 12), std(cols[k + 1]), (k - 1) * 0.1, 0.18, -0.12, { rz: Math.PI / 2 }));
  } else if (look.id === 'chona') {
    const r = T.rng(7);
    for (let k = 0; k < 22; k++) { const a = r() * TAU, b = r() * 1.1; hairG.add(mesh(G.sph(0.05, 10, 8), hairM, Math.cos(a) * Math.sin(b) * 0.15, 0.14 + Math.cos(b) * 0.13, Math.sin(a) * Math.sin(b) * 0.15 - 0.02)); } // a tight perm
    const rim = std('#c0c8d0', { metalness: 0.8, roughness: 0.3 });
    for (const s of [-1, 1]) head.add(mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 18), rim, s * 0.055, 0.14, 0.15, { cast: false })); // eyeglasses
    head.add(mesh(G.cyl(0.004, 0.004, 0.04, 4), rim, 0, 0.14, 0.155, { rz: Math.PI / 2, cast: false }));
  } else {
    hairG.add(mesh(G.sph(0.09, 18, 12), hairM, 0, 0.3, -0.05)); // a high bun
    hairG.add(mesh(new THREE.TorusGeometry(0.152, 0.03, 8, 30), std(color, { roughness: 0.6 }), 0, 0.2, -0.02, { rx: Math.PI / 2 + 0.3, cast: false })); // her bandana
    const shades = std('#16121a', { roughness: 0.1, metalness: 0.4 });
    for (const s of [-1, 1]) hairG.add(mesh(G.sph(0.042, 12, 8), shades, s * 0.055, 0.25, 0.1, { s: [1, 0.7, 0.35], rx: -0.9 })); // sunglasses pushed up
  }
  // the face: big eyes that follow the bata, brows that tell her mood, lipstick
  const eL = eye(0.042, '#3a1e12'), eR = eye(0.042, '#3a1e12');
  eL.g.position.set(-0.055, 0.14, 0.12); eR.g.position.set(0.055, 0.14, 0.12); eL.g.rotation.y = -0.4; eR.g.rotation.y = 0.4;
  head.add(eL.g, eR.g);
  for (const e of [eL, eR]) for (let k = 0; k < 3; k++) e.g.add(mesh(G.cyl(0.003, 0.001, 0.02, 4), std('#140c10'), (k - 1) * 0.018, 0.05, 0.02, { rx: 0.5, rz: (k - 1) * 0.3, cast: false })); // lashes
  const browM = std(look.hair === '#7a3218' ? '#4a1c0e' : '#1a1016');
  const browL = mesh(G.cap(0.009, 0.04, 6), browM, -0.058, 0.2, 0.13, { cast: false }), browR = mesh(G.cap(0.009, 0.04, 6), browM, 0.058, 0.2, 0.13, { cast: false });
  head.add(browL, browR);
  const lips = mesh(G.sph(0.03, 14, 8), std('#c2185b', { roughness: 0.3 }), 0, 0.055, 0.137, { s: [1, 0.42, 0.45], cast: false });
  head.add(lips);
  const wobble = mesh(new THREE.TorusGeometry(0.03, 0.005, 5, 16, Math.PI), std('#ffffff'), 0, 0.05, 0.14, { rz: Math.PI, cast: false }); wobble.visible = false; head.add(wobble); // the frightened mouth
  if (look.id === 'marites') head.add(mesh(G.sph(0.008, 6, 5), std('#2a1410'), 0.05, 0.075, 0.135, { cast: false })); // a nunal, for character
  for (const s of [-1, 1]) head.add(mesh(G.sph(0.024, 10, 8), std('#ff6a7a', { roughness: 0.8, transparent: true, opacity: 0.45 }), s * 0.085, 0.085, 0.12, { s: [1, 0.6, 0.4], cast: false }));
  // her prop
  let prop = new THREE.Group();
  if (look.prop === 'fan') {
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.12, 18, 0, Math.PI), new THREE.MeshStandardMaterial({ map: T.weave(21, '#d8b070').map, side: THREE.DoubleSide, roughness: 0.8 }));
    fan.position.set(0, 0.02, 0); prop.add(fan); prop.add(mesh(G.cyl(0.008, 0.008, 0.12, 5), std('#7a4a20'), 0, -0.05, 0));
    prop.position.set(0, -0.3, 0.04); armR.add(prop);
  } else if (look.prop === 'phone') {
    prop.add(mesh(new THREE.BoxGeometry(0.05, 0.1, 0.018), std('#ff4f9a', { roughness: 0.3 }), 0, 0, 0));
    prop.add(mesh(new THREE.BoxGeometry(0.04, 0.06, 0.004), std('#9fe8ff', { emissive: '#6fd0ff', emissiveIntensity: 0.8 }), 0, 0.01, 0.011, { cast: false }));
    prop.position.set(0, -0.25, 0.03); armR.add(prop);
  } else if (look.prop === 'bayong') {
    const bag = mesh(G.lathe([[0.001, 0], [0.08, 0.005], [0.095, 0.06], [0.1, 0.13], [0.001, 0.13]], 16), new THREE.MeshStandardMaterial({ map: T.weave(31, '#caa060').map, roughness: 0.85 }), 0, -0.2, 0.02, { s: [1, 1, 0.65] });
    prop.add(bag, mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 14, Math.PI), std('#7a4a20'), 0, -0.07, 0.02));
    prop.add(mesh(G.cyl(0.012, 0.012, 0.16, 6), std('#5fae3a'), 0.03, -0.02, 0.02, { rz: 0.3 })); // a leek sticking out
    prop.position.set(0, -0.08, 0); armL.add(prop);
  } else {
    prop.add(mesh(G.cyl(0.03, 0.026, 0.06, 14), std('#f4f1e8', { roughness: 0.3 }), 0, 0, 0));
    prop.add(mesh(G.cyl(0.026, 0.026, 0.004, 14), std('#3a1c0c', { roughness: 0.2 }), 0, 0.028, 0, { cast: false }));
    prop.add(mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), std('#f4f1e8'), 0.034, 0, 0, { cast: false }));
    prop.position.set(0, -0.26, 0.04); armR.add(prop);
  }
  // eaten: a faint ghost of her duster, in her colour, going home with her eyes
  const ghostM = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
  const ghost = mesh(dress.geometry, ghostM, 0, 0, 0, { cast: false }); ghost.visible = false; root.add(ghost);
  // sweat drops when scared
  const drops = [];
  for (let k = 0; k < 2; k++) { const d = mesh(G.sph(0.022, 10, 8), std('#bfe8ff', { roughness: 0.05, emissive: '#6ab8ff', emissiveIntensity: 0.4 }), 0, 0, 0, { s: [0.7, 1.2, 0.7], cast: false }); d.visible = false; head.add(d); drops.push(d); }
  // her colour on the floor, so you always know who's where
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ map: T.glow('rgba(255,255,255,1)'), color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.014; halo.userData.noReflect = true; root.add(halo);
  solo(dress, hemTrim, lips, wobble, ghost, halo, browL, browR, ...drops);
  rigidMerge(root);
  ghost.userData.real = halo.userData.real = true;
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const bodyParts = [dress, hemTrim, ...feet, armL, armR, prop, hairG];
  const skinParts = [];
  head.traverse((o) => { if (o.isMesh && o.material === skinM) skinParts.push(o); });

  const st = { yaw: 0, phase: i * 1.3, lastDir: -1, turnT: 0, shake: 0 };
  // o: { x, z, y, dir, mode ('chase' | 'scatter' | 'scared' | 'flash' | 'eyes' | 'house'), toward: {x, z} (the bata), speed, reduced, gossip }
  function update(o, dt, t) {
    root.position.set(o.x, o.y || 0, o.z);
    const eyes = o.mode === 'eyes', scared = o.mode === 'scared' || o.mode === 'flash';
    const want = o.face ?? DIR_YAW[o.dir];
    if (st.lastDir !== o.dir) { if (st.lastDir >= 0) st.turnT = 1; st.lastDir = o.dir; }
    st.turnT = Math.max(0, st.turnT - dt * 5);
    st.yaw += wrapA(want - st.yaw) * Math.min(1, dt * (eyes ? 30 : 14));
    root.rotation.y = st.yaw;
    const moving = o.speed > 0.1;
    st.phase += dt * (moving ? 10 + o.speed * 0.6 : 3);
    // who she is right now
    for (const p of bodyParts) p.visible = !eyes;
    for (const p of skinParts) p.visible = !eyes;
    ghost.visible = eyes; halo.visible = !eyes;
    const col = o.mode === 'flash' ? FLASH : scared ? SCARED : null;
    dressM.color.set(col ? col : '#ffffff'); dressM.map = col ? null : print; dressM.needsUpdate = dressM.needsUpdate || (dressM.userData.col !== !!col);
    dressM.userData.col = !!col;
    dressM.emissive.set(col ? col : '#000000'); dressM.emissiveIntensity = col ? (o.mode === 'flash' ? 0.5 : 0.25) : 0;
    skinM.color.set(scared ? (o.mode === 'flash' ? '#ffe0e0' : '#aab8ff') : look.skin);
    halo.material.color.set(scared ? (o.mode === 'flash' ? '#ffffff' : '#4a6aff') : color);
    halo.material.opacity = scared ? 0.6 : 0.45;
    hemU.time.value = t + i; hemU.sway.value = eyes ? 0 : moving ? (o.mode === 'chase' ? 1 : 0.7) : 0.25;
    // her walk: a bustling bob, leaning in when she's after him
    const bob = o.reduced ? 0 : Math.abs(Math.sin(st.phase)) * (moving ? 0.035 : 0.01);
    body.position.y = bob + (eyes ? 0.25 : 0);
    const lean = o.mode === 'chase' ? 0.14 : o.mode === 'scatter' ? 0.06 : 0;
    body.rotation.x = moving ? lean : 0;
    body.rotation.z = o.reduced ? 0 : Math.sin(st.phase * 0.5) * (moving ? 0.05 : 0.02) + (o.reduced ? 0 : st.turnT * 0.08);
    feet[0].position.z = 0.12 + Math.sin(st.phase) * (moving ? 0.05 : 0); feet[1].position.z = 0.12 - Math.sin(st.phase) * (moving ? 0.05 : 0);
    // arms: busy with her prop, reaching for him in a chase, thrown up in a fright
    if (scared) {
      st.shake += dt;
      const f = o.reduced ? 0 : Math.sin(t * 30 + i) * 0.25;
      armL.rotation.set(-2.9 + f, 0, -0.4); armR.rotation.set(-2.9 - f, 0, 0.4);
      root.position.x += o.reduced ? 0 : Math.sin(t * 47 + i) * 0.015;
    } else if (o.gossip) {
      armL.rotation.set(-0.6 + Math.sin(t * 3 + i) * 0.2, 0, -0.2); armR.rotation.set(-1.2 + Math.sin(t * 5 + i * 2) * 0.35, 0, 0.3);
    } else if (o.mode === 'chase' && moving) {
      armL.rotation.set(-1.3 + Math.sin(st.phase) * 0.2, 0, -0.1); armR.rotation.set(look.prop === 'phone' ? -2.4 : -0.9 - Math.sin(st.phase) * 0.3, 0, 0.1);
    } else {
      armL.rotation.set(Math.sin(st.phase) * 0.35 - 0.15, 0, -0.15); armR.rotation.set(look.prop === 'phone' ? -2.4 : -Math.sin(st.phase) * 0.35 - 0.3, 0, 0.15);
    }
    if (look.prop === 'fan' && !scared) prop.rotation.z = Math.sin(t * 12) * 0.6;
    // her eyes find the bata (in her own space), wide and darting when scared
    head.updateWorldMatrix(true, false);
    let lx = 0, ly = -0.2;
    if (o.toward) {
      const dx = o.toward.x - o.x, dz = o.toward.z - o.z, a = wrapA(Math.atan2(dx, dz) - st.yaw);
      lx = clamp(Math.sin(a) * 1.4, -1, 1); ly = Math.cos(a) < 0 ? 0.3 : -0.1;
    }
    if (scared) { lx = Math.sin(t * 9 + i) * 0.9; ly = 0.4; }
    const pop = o.pop || 0, popS = 1 + Math.sin(Math.min(1, pop * 1.3) * Math.PI * 0.5) * pop * 0.9; // eyes popping wide in fear, settling back
    for (const e of [eL, eR]) { lookPupil(e, lx, ly); e.pupil.scale.setScalar(scared ? 0.55 * (1 - pop * 0.3) : 1); e.g.scale.setScalar((eyes ? 1.35 : 1) * popS); }
    // brows: knitted in a chase, raised in a fright, easy when she heads for her corner
    const angry = o.mode === 'chase' ? 1 : 0;
    browL.rotation.z = Math.PI / 2 + (scared ? -0.35 : angry ? 0.4 : 0.1); browR.rotation.z = Math.PI / 2 - (scared ? -0.35 : angry ? 0.4 : 0.1);
    browL.position.y = browR.position.y = scared ? 0.225 : angry ? 0.195 : 0.21;
    lips.visible = !scared && !eyes; wobble.visible = scared;
    drops.forEach((d, k) => { d.visible = scared && !o.reduced; const f = (t * 1.4 + k * 0.5) % 1; d.position.set((k ? 1 : -1) * (0.13 + f * 0.04), 0.24 - f * 0.12, 0.05); d.scale.setScalar(0.7 + f * 0.5); });
    head.rotation.set(0, 0, scared || o.reduced ? 0 : Math.sin(t * 2 + i) * 0.06);
    if (o.gossip) head.rotation.y = Math.sin(t * 1.3 + i * 2) * 0.5;
    ghost.position.y = 0.25; ghostM.opacity = 0.16 + Math.sin(t * 8) * 0.05;
  }
  skinify(root);
  return { root, update, head, color: base };
}
