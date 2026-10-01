// The three places the chase happens, built in code around the maze from maps.mjs:
// - the Palengke at dawn: tiled wet-market counters heaped with produce, fish on ice and egg trays, bulbs
//   hanging over the stalls, tarps and shopfronts around, a wet concrete floor that mirrors the lights
// - the Simbahan churchyard at night: coral-stone walls lined with votive candles, capiz lanterns and
//   parols, the old church's facade and bell tower, fireflies over the cobbles
// - the Mall at night: glossy kiosks edged in neon, glass counters of goods, lit storefronts and SALE
//   signs, a polished granite floor that reflects it all
// Each is dressed later with CC0 scans (envpack.mjs) where they help; without them it stands as painted.
import * as THREE from './vendor/three.module.min.js';
import { COLS, ROWS, TUNNEL_ROW } from './maps.mjs';
import * as T from './tex.mjs';
import * as K from './kit3d.mjs';
import { envTex, envProp, applySurface } from './envpack.mjs';

const { X, Z, mesh, box, TAU } = K;
export const THEME_OF = { Palengke: 'palengke', Simbahan: 'simbahan', Mall: 'mall' };
// materials with only plain settings are shared (fewer materials, fewer draws once statics merge)
const MC = new Map();
const plainOpts = (o) => Object.values(o).every((v) => v === null || ['number', 'string', 'boolean'].includes(typeof v));
const M = (color, o = {}) => { if (!plainOpts(o)) return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o }); const k = 'M' + color + JSON.stringify(o); if (!MC.has(k)) MC.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o })); return MC.get(k); };
const glowM = (color, k = 2) => { const key = 'G' + color + k; if (!MC.has(key)) MC.set(key, new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: k, roughness: 1 })); return MC.get(key); };
const stripeM = (a, b, o = {}, extra = {}) => { const key = 'S' + a + b + JSON.stringify(o) + JSON.stringify(extra); if (!MC.has(key)) MC.set(key, new THREE.MeshStandardMaterial({ map: T.stripes(a, b, o), roughness: 0.8, side: THREE.DoubleSide, ...extra })); return MC.get(key); };
const EDGE = { x0: X(0) - 0.5, x1: X(COLS - 1) + 0.5, z0: Z(0) - 0.5, z1: Z(ROWS - 1) + 0.5 };

// the look of each place: light, sky, fog, the intro's path
export const LOOKS = {
  palengke: {
    exposure: 0.95, sun: { color: '#ffae70', k: 3.2, dir: [0.9, 0.36, 0.2] }, hemi: ['#8ea6dc', '#4a3a30', 0.7], env: ['qwantani_sunrise_puresky', 0.4, 2.2], back: ['qwantani_sunrise_puresky', 2.4, 1],
    fog: ['#b8b8c8', 0.0055], sky: ['#6f93c8', '#e8c8b8', '#f4d8b0'], pool: '#ffb060', bulb: '#ffc070',
    intro: [{ p: [0.3, 3.2, 20.2], l: [0, 0.6, 8] }, { p: [-7, 6, 18], l: [0, 0, 2] }],
  },
  simbahan: {
    exposure: 1.0, sun: { color: '#8ea4ff', k: 0.55, dir: [-0.45, 0.75, -0.35] }, hemi: ['#2a3a6a', '#1a120c', 0.35], env: ['qwantani_night_puresky', 0.22, 0], back: ['qwantani_night_puresky', 0.3, 1],
    fog: ['#1a2238', 0.016], sky: ['#0a1030', '#1a2450', '#3a3050'], pool: '#ff9a40', bulb: '#ffb050',
    intro: [{ p: [0, 2.2, 7], l: [0, 5, -26] }, { p: [6, 8, 12], l: [0, 0, -4] }],
  },
  mall: {
    exposure: 1.0, sun: { color: '#eef2ff', k: 1.3, dir: [0.2, 1, 0.35] }, hemi: ['#c8d0ff', '#221c2a', 0.55], env: ['leadenhall_market', 0.5, 0.8], back: null,
    fog: ['#0e0a18', 0.014], sky: ['#06040c', '#140c24', '#2a1030'], pool: '#dfe8ff', bulb: '#ffffff',
    intro: [{ p: [-4, 2.6, -8], l: [3, 2.4, -19] }, { p: [-9, 7, 5], l: [0, 0, -3] }],
  },
};

export function buildWorld(maze, { env = null, low = false } = {}) {
  const theme = THEME_OF[maze.name] || 'palengke', look = LOOKS[theme];
  const group = new THREE.Group(); group.name = theme;
  const inst = K.instancer();
  const W = { theme, look, group, anim: [], practicals: [], points: [], wires: [], dressers: [], flicker: [], celebrate: 0 };
  const r = T.rng({ palengke: 11, simbahan: 23, mall: 37 }[theme]);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const rects = K.wallRects(maze);
  ({ palengke, simbahan, mall })[theme]({ maze, W, inst, r, pick, rects, group, low });
  inst.build(group);
  if (W.baker) W.baker.build(group, W.bakedMats);
  group.traverse((o) => { if (o.isInstancedMesh && !/^(bulb|parol|candle|flame|crate|karton|sako)/.test(o.name)) o.userData.noReflect = true; });
  if (W.wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(W.wires, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: W.wireColor || '#1a1614' })); l.userData.noReflect = false; group.add(l); }
  K.mergeStatic(group);
  W.update = (t, dt, s) => { for (const f of W.anim) f(t, dt, s); };
  W.dress = (e) => Promise.all(W.dressers.map((f) => f(e).catch(() => null)));
  W.dispose = () => { MC.clear(); disposeAll(); };
  const disposeAll = () => group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) { for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k]) m[k].dispose(); m.dispose(); }
  });
  return W;
}

// ---------- shared pieces ----------
function floor(W, maze, { base, wet, pools, wetRough, wetDark, reflect, poolK, size = 90 }) {
  const mask = K.floorMask(maze, { wet, pools, seed: maze.name.length * 7 });
  const mat = K.floorMaterial(base, mask, { wetRough, wetDark, poolColor: W.look.pool, poolK, reflect });
  const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i)); // world-space UVs, a metre each
  const f = mesh(g, mat, { cast: false, receive: true }); f.userData.keep = true; f.userData.isFloor = true;
  W.group.add(f); W.floor = f;
  return mat;
}
function walls(W, maze, { h, m, side, top, lip, lipOpt, topH = 0 }) {
  const grid = K.wallGrid(maze, m);
  const sideGeo = K.wallGeometry(grid, h, { tops: false }), topGeo = K.wallGeometry(grid, h + topH, { faces: false });
  const s = mesh(sideGeo, side, { cast: true, receive: true }); s.userData.keep = s.userData.wall = true; W.group.add(s);
  const t = mesh(topGeo, top, { cast: true, receive: true }); t.userData.keep = t.userData.wall = true; W.group.add(t);
  if (lip) { const l = mesh(K.lipGeometry(grid, h + topH, lipOpt), lip, { cast: true, receive: true }); l.userData.keep = l.userData.wall = true; W.group.add(l); }
  W.grid = grid;
  return grid;
}
// the tunnel's ends: a covered passage out of each side of the maze, dark inside
function tunnels(W, { wall, roof, h = 0.6, roofH = 1.25 }) {
  const z = Z(TUNNEL_ROW);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? EDGE.x0 : EDGE.x1, len = 3.2, cx = x0 + sx * len / 2;
    for (const dz of [-1, 1]) W.group.add(box(len, h, 0.3, wall, { x: cx, y: h / 2, z: z + dz * 0.65 }));
    W.group.add(box(len, 0.08, 1.9, roof, { x: cx, y: roofH, z, cast: true }));
    const dark = mesh(new THREE.PlaneGeometry(1.6, roofH), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.85, depthWrite: false }), { x: x0 + sx * (len - 0.1), y: roofH / 2, z, ry: -sx * Math.PI / 2, cast: false, receive: false });
    W.group.add(dark);
  }
}
function poolsFromPracticals(W, k = 1, rad = 2) { return W.practicals.map((p) => ({ x: p.x, z: p.z, r: p.r || rad, k: (p.k ?? 1) * k })); }
// a bulb hanging on its cord, with a little shade; it glows, pools light on the floor and may get a real light
function bulb(W, inst, x, y, z, { cord = 0.5, color, shade = '#2a2a2a', k = 1, r = 1.8, big = false } = {}) {
  inst.add('bulb', () => ({ geo: new THREE.SphereGeometry(big ? 0.07 : 0.055, 8, 6), mat: glowM(color || W.look.bulb, 3.2) }), x, y, z, { cast: false });
  if (shade) inst.add('shade:' + shade, () => ({ geo: new THREE.ConeGeometry(0.11, 0.09, 14, 1, true), mat: M(shade, { roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }) }), x, y + 0.07, z);
  W.wires.push(x, y + 0.1, z, x, y + cord, z);
  W.practicals.push({ x, y, z, k, r });
}
// a star lantern: five points of coloured paper around a glowing heart, with two tails
function parol(W, inst, x, y, z, color, s = 1) {
  const key = 'parol:' + color;
  inst.add(key, () => { const g = new THREE.ExtrudeGeometry(T.starShape(0.34, 0.15), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }); g.translate(0, 0, -0.035); return { geo: g, mat: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.7 }) }; }, x, y, z, { s, ry: r0(x, z) });
  inst.add('parolheart', () => ({ geo: new THREE.SphereGeometry(0.09, 10, 8), mat: glowM('#fff0c0', 3) }), x, y, z + 0.0, { s });
  for (const dx of [-0.08, 0.08]) inst.add('paroltail:' + color, () => ({ geo: new THREE.CylinderGeometry(0.012, 0.004, 0.5, 5).translate(0, -0.25, 0), mat: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }) }), x + dx * s, y - 0.25 * s, z, { s });
  W.practicals.push({ x, y, z, k: 0.6, r: 2.2 });
}
const r0 = (x, z) => ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * 0.6 - 0.3;
function wirePath(W, pts) { for (let k = 1; k < pts.length; k++) W.wires.push(pts[k - 1].x, pts[k - 1].y, pts[k - 1].z, pts[k].x, pts[k].y, pts[k].z); }
// a shopfront painted on a canvas: its sign, a roll-up shutter (half up) and the shop lit inside
function shopTex(name, sub, color, r, { night = false, w = 4, h = 3 } = {}) {
  const PX = 64, cv = T.canvas(w * PX, h * PX), x = cv.getContext('2d');
  x.fillStyle = T.shade(color, 0.85); x.fillRect(0, 0, w * PX, h * PX);
  const n = T.noise(64, 48, 6, r); for (let j = 0; j < 48; j++) for (let i = 0; i < 64; i++) { x.fillStyle = `rgba(0,0,0,${n[j * 64 + i] * 0.12})`; x.fillRect(i * w * PX / 64, j * h * PX / 48, w * PX / 64 + 1, h * PX / 48 + 1); }
  // the sign
  const sy = 0.12 * PX, sh = 0.7 * PX;
  x.fillStyle = '#f4efe2'; x.fillRect(0.2 * PX, sy, (w - 0.4) * PX, sh);
  x.fillStyle = color; x.fillRect(0.2 * PX, sy + sh - 8, (w - 0.4) * PX, 8);
  x.fillStyle = '#1a1420'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `italic 900 ${sh * 0.52}px "Barlow Condensed", system-ui`; x.fillText(name, w * PX / 2, sy + sh * 0.42, (w - 0.6) * PX);
  x.font = `700 ${sh * 0.2}px "Baloo 2", system-ui`; x.fillStyle = T.shade(color, 0.6); x.fillText(sub, w * PX / 2, sy + sh * 0.8, (w - 0.6) * PX);
  // the opening: goods on shelves under a warm light, the shutter above
  const oy = 1.0 * PX, oh = (h - 1.05) * PX, ox = 0.25 * PX, ow = (w - 0.5) * PX;
  const g = x.createLinearGradient(0, oy, 0, oy + oh); g.addColorStop(0, night ? '#ffd890' : '#e8b870'); g.addColorStop(1, night ? '#8a5020' : '#6a4424');
  x.fillStyle = g; x.fillRect(ox, oy, ow, oh);
  const C = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#f4f1e6', '#ff9f43', '#ff7eb6'];
  for (let s = 0; s < 4; s++) { const yy = oy + oh * (0.3 + s * 0.18); x.fillStyle = '#5a3a1e'; x.fillRect(ox, yy, ow, 4); for (let k = 0; k < ow / 9; k++) if (r() < 0.8) { x.fillStyle = C[(k * 7 + s * 3) % C.length]; x.fillRect(ox + k * 9 + 1, yy - 10 - r() * 8, 7, 10 + r() * 8); } }
  x.fillStyle = '#8a9098'; x.fillRect(ox, oy, ow, oh * 0.28); for (let k = 0; k < oh * 0.28; k += 5) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(ox, oy + k, ow, 1.5); }
  return { cv };
}

// ---------- the Palengke ----------
function palengke({ maze, W, inst, r, pick, rects, group }) {
  const H = 0.5, m = 0.08;
  const tiles = T.tiles(3, '#e9efe6', { n: 8 }), tileM = M('#ffffff', { map: tiles.map, normalMap: tiles.normalMap, roughnessMap: tiles.roughnessMap, roughness: 1 });
  tileM.map.repeat.set(2.2, 2.2); tileM.normalMap.repeat.set(2.2, 2.2); tileM.roughnessMap.repeat.set(2.2, 2.2);
  const plank = T.planks(4, { color: '#9a6a3a' }), topM = M('#ffffff', { map: plank.map, normalMap: plank.normalMap, roughness: 0.8 });
  topM.map.repeat.set(1.4, 1.4); topM.normalMap.repeat.set(1.4, 1.4);
  const lipM = M('#1f9a82', { roughness: 0.45, metalness: 0.3 });
  const grid = walls(W, maze, { h: H, m, side: tileM, top: topM, lip: lipM, lipOpt: { w: 0.075, t: 0.055, out: 0.03 } });
  W.dressers.push(async (e) => { const [t1, t2] = await Promise.all([envTex(e, 'long_white_tiles'), envTex(e, 'wood_floor_worn')]); applySurface(tileM, t1, { tile: 0.9, rough: 0.9, tint: '#f2f6ee' }); applySurface(topM, t2, { tile: 1.2, rough: 0.85, tint: '#c89a6a' }); });
  // a dark kick strip at the foot of every counter, where the floor is always wet
  const kick = mesh(K.wallGeometry({ ...grid, tops: [] }, 0.07, { faces: true }), M('#20302c', { roughness: 0.4 }), { cast: false }); kick.scale.set(1.002, 1, 1.002); kick.userData.keep = true; group.add(kick);
  // corner posts at some convex corners, holding a bulb over the stall
  const postM = M('#3a3a3a', { roughness: 0.5, metalness: 0.7 });
  // ---------- what each stall sells, heaped the way vendors heap it ----------
  const B = K.baker();
  W.baker = B;
  const G2 = {
    ball: new THREE.SphereGeometry(1, 6, 3), big: new THREE.IcosahedronGeometry(1, 1), egg: new THREE.SphereGeometry(1, 6, 3).scale(0.8, 1, 0.8), long: new THREE.CapsuleGeometry(0.5, 1.4, 2, 6),
    mound: (() => { const g = new THREE.SphereGeometry(1, 16, 5, 0, TAU, 0, Math.PI / 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.12; if (p.getY(i) > 0.05) p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.computeVertexNormals(); return g; })(), box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    sack: new THREE.CylinderGeometry(0.85, 1, 1, 10), bilao: new THREE.CylinderGeometry(1, 0.92, 0.12, 18), leaf: new THREE.CylinderGeometry(1, 1, 0.02, 12),
    fish: (() => { const g = new THREE.SphereGeometry(1, 8, 5); g.scale(1, 0.35, 0.28); const t = new THREE.ConeGeometry(0.35, 0.5, 4); t.rotateZ(Math.PI / 2); t.translate(-1.15, 0, 0); t.scale(1, 1, 0.3); return K.mergeGeos([g, t]); })(),
  };
  // [colour, shape, size, squash]
  const KIND = {
    kamatis: ['#d42a1e', 'ball', 0.058], sibuyas: ['#b8742a', 'ball', 0.055], bawang: ['#eee4d0', 'ball', 0.042], talong: ['#4a1a5a', 'long', 0.085], repolyo: ['#8ac25a', 'big', 0.11],
    kalabasa: ['#e07a1a', 'big', 0.12, 0.7], patatas: ['#b08a5a', 'egg', 0.055], mangga: ['#ffc21a', 'egg', 0.068], kalamansi: ['#5aa02a', 'ball', 0.036], lanzones: ['#e0c888', 'ball', 0.042],
    saging: ['#ffd23a', 'long', 0.1], pakwan: ['#2a6a2a', 'egg', 0.14], sili: ['#e8301a', 'long', 0.03],
  };
  const MATS = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    shiny: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.55 }),
    weave: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.weave(12, '#d8c0a0').map, roughness: 0.9 }),
  };
  W.bakedMats = MATS;
  // a heap: a mound in the produce's own colour, then pieces scattered over it, settling where the slope puts them
  const heap = (kind, cx, y0, cz, R, { mound = true } = {}) => {
    const [col, shape, sz0, squash = 1] = KIND[kind], sz = Math.max(sz0, R * 0.2); // bigger pieces on a bigger heap, so they cover it
    if (kind === 'pakwan') { for (const [dx, dz, dy] of [[-0.6, -0.3, 0], [0.6, -0.3, 0], [0, 0.5, 0], [0, 0, 1]]) B.add('matte', G2.egg, col, cx + dx * sz, y0 + sz * (0.62 + dy * 0.9), cz + dz * sz, { s: [sz, sz * 0.82, sz], rx: Math.PI / 2, ry: r() * TAU, vary: 0.1 }); return; }
    const mh = R * 0.42;
    if (mound) B.add('matte', G2.mound, T.shade(col, 0.72), cx, y0, cz, { s: [R * 0.96, mh, R * 0.96], vary: 0.04 });
    const n = Math.max(5, Math.min(22, Math.round((R * R) / (sz * sz) * 1.0)));
    for (let k = 0; k < n; k++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.92, h = mound ? mh * Math.sqrt(Math.max(0, 1 - (d / R) ** 2)) : 0, s = sz * (0.82 + r() * 0.36);
      const lie = shape === 'long';
      B.add('matte', G2[shape], col, cx + Math.cos(a) * d, y0 + h + s * (lie ? 0.35 : 0.55 * squash), cz + Math.sin(a) * d, { s: lie ? s * 0.62 : [s, s * squash, s], rx: lie ? Math.PI / 2 + (r() - 0.5) * 0.5 : 0, ry: r() * TAU, rz: lie ? 0 : (r() - 0.5) * 0.5, vary: 0.12 });
    }
  };
  const hands = (cx, y0, cz, n = 4) => { for (let k = 0; k < n; k++) { const a = r() * TAU, x = cx + (r() - 0.5) * 0.2, z = cz + (r() - 0.5) * 0.2; for (let f = 0; f < 5; f++) B.add('matte', G2.long, '#ffd23a', x + Math.cos(a + Math.PI / 2) * (f - 2) * 0.035, y0 + 0.04 + (k % 2) * 0.04, z + Math.sin(a + Math.PI / 2) * (f - 2) * 0.035, { s: 0.085, rx: Math.PI / 2 + 0.15, ry: a + (f - 2) * 0.1, vary: 0.06 }); } };
  const bilao = (x, y0, z, rad) => B.add('weave', G2.bilao, '#ffffff', x, y0 + 0.03, z, { s: [rad, 0.5, rad], vary: 0.05 });
  const along = (rc, f, across = 0) => (rc.w >= rc.d ? [rc.x0w + f * (rc.x1w - rc.x0w), rc.cz + across] : [rc.cx + across, rc.z0w + f * (rc.z1w - rc.z0w)]);
  // price signs: eight lettered boards in one texture
  const signs = ['₱60/KILO', '₱25', 'SARIWA!', '₱120/KL', 'BAGONG HULI', '₱10 ISA', 'PAMPALASA', '₱45'];
  const sc = T.canvas(768, 192), sx2 = sc.getContext('2d');
  signs.forEach((s, k) => sx2.drawImage(T.sign([[s, 17, 900]], k % 2 ? '#f4eedc' : '#fff4a8', '#c0182e', { w: 192, h: 96 }).image, (k % 4) * 192, Math.floor(k / 4) * 96));
  const signM = new THREE.MeshStandardMaterial({ map: T.toTex(sc), roughness: 0.9 });
  const priceSign = (x, z, k) => {
    const g = new THREE.PlaneGeometry(0.34, 0.17), uv = g.attributes.uv, u0 = (k % 4) / 4, v0 = 1 - (Math.floor(k / 4) + 1) / 2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 2);
    group.add(mesh(g, signM, { x, y: H + 0.36, z, rx: -0.5 })); group.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), postM, { x, y: H + 0.15, z }));
  };
  const VEG = ['kamatis', 'sibuyas', 'talong', 'repolyo', 'kalabasa', 'patatas', 'bawang', 'kamatis', 'sili'], FRUIT = ['mangga', 'kalamansi', 'lanzones', 'mangga', 'pakwan'];
  const dress = (rc) => {
    rc.x0w = X(rc.x0) - 0.5 + m + 0.16; rc.x1w = X(rc.x1) + 0.5 - m - 0.16; rc.z0w = Z(rc.y0) - 0.5 + m + 0.16; rc.z1w = Z(rc.y1) + 0.5 - m - 0.16;
    const w = rc.x1w - rc.x0w, d = rc.z1w - rc.z0w, L = Math.max(w, d), Wd = Math.min(w, d);
    const type = rc.perimeter ? pick(['karton', 'gulay', 'prutas', 'karton', 'bigas']) : TYPES[Math.floor(r() * TYPES.length)];
    rc.type = type;
    const y0 = H + 0.03, lanes = Wd > 1.6 ? [-Wd * 0.25, Wd * 0.25] : [0];
    for (const lane of lanes) {
      const n = Math.max(1, Math.round(L / 0.85)), R0 = Math.min((Wd / lanes.length) * 0.47, (L / n) * 0.56);
      for (let k = 0; k < n; k++) {
        if (r() < 0.04) continue;
        const f = (k + 0.5 + (r() - 0.5) * 0.35) / n, [x, z] = along(rc, f, lane + (r() - 0.5) * 0.08), R = R0 * (0.8 + r() * 0.25);
        if (type === 'gulay') { if (r() < 0.15) { for (let q = 0; q < 14; q++) B.add('matte', G2.cyl, '#3a8a2a', x + (r() - 0.5) * 0.06, y0 + 0.02 + (q % 3) * 0.02, z + (r() - 0.5) * 0.1, { s: [0.012, 0.32, 0.012], rx: Math.PI / 2, ry: (r() - 0.5) * 0.3 + (rc.w >= rc.d ? Math.PI / 2 : 0) }); } else heap(pick(VEG), x, y0, z, R); }
        else if (type === 'prutas') { if (r() < 0.25) hands(x, y0, z); else heap(pick(FRUIT), x, y0, z, R); }
        else if (type === 'isda') { B.add('shiny', G2.box, '#b8bcc0', x, y0 + 0.02, z, { s: [R * 2.1, 0.04, R * 2.1], vary: 0 }); B.add('shiny', G2.mound, '#e8f4ff', x, y0 + 0.04, z, { s: [R * 0.95, 0.06, R * 0.95], vary: 0.03 }); for (let q = 0; q < 5; q++) B.add('shiny', G2.fish, pick(['#b8c4cc', '#9aa8b4', '#c8b8a8']), x + (r() - 0.5) * R, y0 + 0.09 + q * 0.012, z + (r() - 0.5) * R * 1.2, { s: 0.1 + r() * 0.03, ry: r() * TAU, rz: 0.1 }); }
        else if (type === 'itlog') { const st = 1 + Math.floor(r() * 3); for (let q = 0; q < st; q++) B.add('matte', G2.box, '#9a7450', x, y0 + 0.02 + q * 0.05, z, { s: [0.34, 0.04, 0.34], ry: (r() - 0.5) * 0.3 }); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) B.add('matte', G2.egg, r() < 0.35 ? '#c0503a' : '#e8d8c0', x + (a - 1) * 0.1, y0 + st * 0.05 + 0.04, z + (b - 1) * 0.1, { s: 0.05, vary: 0.05 }); }
        else if (type === 'bigas') { B.add('matte', G2.sack, '#b89a68', x, y0 + 0.13, z, { s: [R * 0.8, 0.26, R * 0.8], vary: 0.08 }); B.add('matte', G2.mound, '#f4f0e4', x, y0 + 0.26, z, { s: [R * 0.7, 0.16, R * 0.7], vary: 0.02 }); B.add('shiny', G2.cyl, '#c0c4c8', x + R * 0.3, y0 + 0.38, z, { s: [0.04, 0.12, 0.04], rz: 0.6 }); }
        else if (type === 'kakanin') { bilao(x, y0, z, R); B.add('matte', G2.leaf, '#3a8a3a', x, y0 + 0.07, z, { s: [R * 0.88, 1, R * 0.88] }); const kk = pick(['#fff8f0', '#ff9ab8', '#8a3a14', '#e8c060']); for (let q = 0; q < 7; q++) { const a = q * 0.9, dd = q ? R * 0.5 : 0; B.add('matte', G2.cyl, kk, x + Math.cos(a) * dd, y0 + 0.1, z + Math.sin(a) * dd, { s: [0.06, 0.05, 0.06], vary: 0.04 }); } }
        else { const hgt = 0.18 + r() * 0.12; B.add('matte', G2.box, pick(['#8a6440', '#a07a50', '#6a8ab8']), x, y0 + hgt / 2, z, { s: [R * 1.6, hgt, R * 1.4], ry: (r() - 0.5) * 0.3 }); if (r() < 0.5) B.add('matte', G2.box, '#a07a50', x, y0 + hgt + 0.08, z, { s: [R * 1.1, 0.16, R * 1.1], ry: (r() - 0.5) * 0.5 }); }
      }
    }
    if (!rc.perimeter && type !== 'karton' && r() < 0.7) { const [x, z] = along(rc, 0.15 + r() * 0.7, (lanes.length > 1 ? 0 : Wd * 0.35)); priceSign(x, z, Math.floor(r() * 8)); }
    // a bulb over most stalls, on a post at its back corner
    if (!rc.perimeter && r() < 0.8) {
      const px = X(rc.x0) - 0.5 + m + 0.04, pz = Z(rc.y0) - 0.5 + m + 0.04, bx = (rc.x0w + rc.x1w) / 2, bz = (rc.z0w + rc.z1w) / 2, top = 1.25;
      group.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, top - H, 6), postM, { x: px, y: H + (top - H) / 2, z: pz }));
      W.wires.push(px, top, pz, bx, top + 0.02, bz);
      bulb(W, inst, bx, 1.0, bz, { cord: 0.27, shade: null, big: true, r: 1.6 + Math.min(w, d) * 0.4 });
    }
  };
  const TYPES = ['gulay', 'prutas', 'isda', 'itlog', 'gulay', 'prutas', 'kakanin', 'bigas'];
  for (const rc of rects) dress(rc);
  // ---------- around the maze ----------
  // the shops along the north side, their awnings, and the permanent market hall beyond
  const shopNames = [['BIGASAN', 'Mang Juan · bigas at itlog', '#2f6fd6'], ['KARINDERYA', 'ni Aling Nena · almusal na!', '#e8384f'], ['SARI-SARI', 'load · kape · pan de sal', '#3fae5a'], ['ISDAAN', 'sariwang huli araw-araw', '#1f9a82'], ['PRUTAS', 'Tindahan ni Lola Iska', '#ff9f43'], ['PANADERYA', 'mainit na pan de sal!', '#c0182e']];
  const nz = EDGE.z0 - 2.2, sw = 4.6;
  // all seven shopfronts painted into one texture, so they draw together
  const shops = Array.from({ length: 7 }, (_, k) => shopTex(...shopNames[k % shopNames.length], r, { w: 4.4, h: 3.2 }));
  const sw0 = shops[0].cv.width, sh0 = shops[0].cv.height, atlas = T.canvas(sw0 * 4, sh0 * 2), ax = atlas.getContext('2d');
  shops.forEach((q, k) => ax.drawImage(q.cv, (k % 4) * sw0, Math.floor(k / 4) * sh0));
  const shopTexA = T.toTex(atlas), shopM = new THREE.MeshStandardMaterial({ map: shopTexA, emissive: '#ffffff', emissiveMap: shopTexA, emissiveIntensity: 0.18, roughness: 0.85 });
  for (let k = 0; k < 7; k++) {
    const [, , col] = shopNames[k % shopNames.length], x = -3.5 * sw / 1 + k * sw + sw / 2 - 0.4;
    const fg = new THREE.PlaneGeometry(4.4, 3.2), fuv = fg.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, ((k % 4) + fuv.getX(i)) / 4, 1 - (Math.floor(k / 4) + 1 - fuv.getY(i)) / 2);
    const face = mesh(fg, shopM, { x, y: 1.6, z: nz });
    group.add(face);
    group.add(box(4.5, 1.6, 2.4, M(T.shade(col, 0.9), { roughness: 0.9 }), { x, y: 4.0, z: nz - 1.2 })); // the storey above
    group.add(box(4.6, 0.12, 2.6, M('#6a6a6a', { roughness: 0.6, metalness: 0.5 }), { x, y: 4.85, z: nz - 1.2 }));
    for (let wdw = 0; wdw < 2; wdw++) group.add(mesh(new THREE.PlaneGeometry(1.1, 0.8), wdw === k % 2 ? glowM('#ffcf8a', 0.9) : M('#2a3440', { roughness: 0.2, metalness: 0.4 }), { x: x - 1 + wdw * 2, y: 4.05, z: nz + 0.01 }));
    const aw = K.tarpMesh(4.4, 1.3, stripeM(k % 2 ? '#e8384f' : '#2f6fd6', '#f4f1e6', { n: 10 }), { sagBy: 0.05, tilt: 0.5 });
    aw.position.set(x, 2.75, nz + 0.65); group.add(aw);
    bulb(W, inst, x, 2.1, nz + 0.9, { cord: 0.4, shade: null, k: 0.9, r: 2.2 });
  }
  group.add(box(34, 2.4, 0.4, M('#8a8680', { roughness: 0.95 }), { x: 0, y: 1.2, z: nz - 2.3 }));
  // east and west: more stalls under tarps, with crates and baskets on the floor
  const tarpCols = [['#2f6fd6', '#2f6fd6'], ['#ff9f43', '#ff9f43'], ['#e8384f', '#f4f1e6'], ['#3fae5a', '#f4f1e6']];
  for (const sx of [-1, 1]) {
    const cx = sx * (EDGE.x1 + 2.6);
    for (let k = 0; k < 6; k++) {
      const z = EDGE.z0 + 2.8 + k * 5.4;
      group.add(box(1.6, H + 0.05, 4.4, tileM, { x: cx, y: (H + 0.05) / 2, z }));
      group.add(box(1.7, 0.05, 4.5, topM, { x: cx, y: H + 0.05, z }));
      for (let q = 0; q < 5; q++) heap(pick(['kamatis', 'mangga', 'kalamansi', 'sibuyas', 'patatas']), cx + (r() - 0.5) * 0.3, H + 0.08, z - 1.7 + q * 0.85 + (r() - 0.5) * 0.15, 0.36);
      const [a, b] = tarpCols[(k + (sx > 0 ? 1 : 0)) % tarpCols.length];
      const tp = K.tarpMesh(3.4, 5.2, stripeM(a, b, { n: a === b ? 2 : 8, vertical: false }), { sagBy: 0.18, tilt: 0 });
      tp.position.set(cx + sx * 0.7, 2.5, z); tp.rotation.z = sx * 0.12; group.add(tp);
      for (const dz of [-2.4, 2.4]) group.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6), postM, { x: cx - sx * 1.0, y: 1.25, z: z + dz }));
      bulb(W, inst, cx - sx * 0.2, 1.9, z, { cord: 0.5, shade: '#2a2a2a', k: 0.9, r: 2.4 });
    }
    group.add(box(0.4, 3, 34, M('#8a8680', { roughness: 0.95 }), { x: sx * (EDGE.x1 + 5.2), y: 1.5, z: 0 }));
  }
  // south: the edge of the street, crates and baskets waiting to be carried in
  for (let k = 0; k < 16; k++) {
    const x = EDGE.x0 + 1 + k * 1.8 + r() * 0.5, z = EDGE.z1 + 1.1 + r() * 0.9;
    if (r() < 0.5) { const ry = r() * 0.5; B.add('matte', G2.box, '#3a7ad8', x, 0.15, z, { s: [0.5, 0.3, 0.4], ry }); if (r() < 0.4) B.add('matte', G2.box, '#3a7ad8', x, 0.45, z, { s: [0.5, 0.3, 0.4], ry: ry + 0.2 }); }
    else { bilao(x, 0, z, 0.34); heap(pick(['kamatis', 'kalamansi', 'sibuyas']), x, 0.08, z, 0.26); }
  }
  // strings of bulbs over the walkways around the maze
  const ring = [[EDGE.x0 - 1.2, EDGE.z0 - 0.9], [EDGE.x1 + 1.2, EDGE.z0 - 0.9], [EDGE.x1 + 1.2, EDGE.z1 + 0.9], [EDGE.x0 - 1.2, EDGE.z1 + 0.9]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 4], len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 3.2);
    for (let q = 0; q < n; q++) {
      const a = new THREE.Vector3(ax + (bx - ax) * q / n, 2.3, az + (bz - az) * q / n), b = new THREE.Vector3(ax + (bx - ax) * (q + 1) / n, 2.3, az + (bz - az) * (q + 1) / n), pts = K.sag(a, b, 0.35, 6);
      wirePath(W, pts);
      inst.add('pole', () => ({ geo: new THREE.CylinderGeometry(0.04, 0.05, 2.3, 6).translate(0, 1.15, 0), mat: postM }), a.x, 0, a.z);
      for (const p of [pts[2], pts[4]]) { inst.add('bulbS', () => ({ geo: new THREE.SphereGeometry(0.06, 8, 6), mat: glowM('#ffc070', 3) }), p.x, p.y - 0.06, p.z, { cast: false }); W.practicals.push({ x: p.x, y: p.y, z: p.z, k: 0.5, r: 1.6 }); }
    }
  }
  // the titas' tambayan in the middle: a low bamboo fence, a banig inside, a thermos of coffee and cups
  const banig = T.weave(61, '#c8a060').map; banig.repeat.set(10, 4); house(W, inst, { fence: 'bamboo', H: 0.34, gate: '#ff7eb6', mat: new THREE.MeshStandardMaterial({ map: banig, roughness: 0.85 }) });
  tunnels(W, { wall: tileM, roof: new THREE.MeshStandardMaterial({ map: T.stripes('#2f6fd6', '#2f6fd6', { n: 2 }), roughness: 0.8 }), h: H });
  // distant roofs, a bell tower against the dawn
  const far = M('#5a5a6a', { roughness: 1 });
  for (let k = 0; k < 12; k++) group.add(box(4 + r() * 5, 5 + r() * 7, 4, far, { x: -30 + k * 5.5, y: 3, z: nz - 9 - r() * 6, cast: false }));
  group.add(box(2.4, 13, 2.4, M('#8a7a6a', { roughness: 1 }), { x: 9, y: 6.5, z: nz - 12, cast: false }));
  group.add(mesh(new THREE.ConeGeometry(1.9, 2.8, 4), M('#6a4a3a'), { x: 9, y: 14.4, z: nz - 12, ry: Math.PI / 4, cast: false }));
  // the floor: wet concrete with puddles, the light of every bulb pooled on it
  const cf = T.concrete(5, '#6e6a66', { size: 256, repeat: [1, 1] });
  const fm = floor(W, maze, { base: { map: cf.map, normalMap: cf.normalMap, roughnessMap: cf.roughnessMap, roughness: 0.95 }, wet: 0.62, wetRough: 0.08, wetDark: 0.62, reflect: 0.9, poolK: 1.2, pools: poolsFromPracticals(W, 1) });
  fm.map.repeat.set(1 / 3, 1 / 3); fm.normalMap.repeat.set(1 / 3, 1 / 3); fm.roughnessMap.repeat.set(1 / 3, 1 / 3);
  W.dressers.push(async (e) => { const t = await envTex(e, 'concrete_floor_damaged_01'); applySurface(fm, t, { tile: 3.2, rough: 1, tint: '#a8a49c' }); });
  // real produce and baskets where the painted ones stood
  W.dressers.push(async (e) => {
    const [ban, bas, crate] = await Promise.all(['bananas', 'wicker_basket_02', 'plastic_crate_02'].map((id) => envProp(e, id)));
    const g = new THREE.Group(), d = new THREE.Object3D();
    const place = (tpl, list) => { if (!tpl) return; tpl.updateMatrixWorld(true); tpl.traverse((p) => { if (!p.isMesh) return; const im = new THREE.InstancedMesh(p.geometry, p.material, list.length); list.forEach(([x, y, z, ry, s], i) => { d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.setScalar(s); d.updateMatrix(); im.setMatrixAt(i, d.matrix.clone().multiply(p.matrixWorld)); }); im.castShadow = false; im.receiveShadow = true; g.add(im); }); };
    const southBaskets = [], northBananas = [], crates = [];
    for (let k = 0; k < 5; k++) southBaskets.push([EDGE.x0 + 3 + k * 5.4, 0, EDGE.z1 + 2.4 + (k % 2) * 0.5, k * 1.3, 1.1]);
    for (let k = 0; k < 7; k++) { const x = -14 + k * 4.6; northBananas.push([x - 0.8, 0.02, nz + 1.3, k, 1]); if (k % 2 === 0) crates.push([x + 0.9, 0, nz + 1.2, k * 0.7, 1.2], [x + 0.9, 0.3, nz + 1.2, k * 0.7 + 0.3, 1.2]); }
    place(bas, southBaskets); place(ban, northBananas); place(crate, crates);
    W.group.add(g);
  });
  // light: the sun just up, low and gold through the haze; the bulbs still on from the night
  W.points = [...W.practicals].filter((p, i) => i % 3 === 0).slice(0, 10).map((p) => ({ x: p.x, y: p.y - 0.1, z: p.z, color: '#ffae5a', k: 2.2, dist: 4.5 }));
  W.anim.push((t) => { /* the bulbs flash for a cleared maze (the view sets W.celebrate) */ });
  // god rays: long soft shafts of the morning sun slanting across the market
  const rayM = new THREE.MeshBasicMaterial({ map: rayTex(), color: '#ffd8a0', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
  for (let k = 0; k < 5; k++) { const ray = mesh(new THREE.PlaneGeometry(3 + r() * 2, 22), rayM, { x: -6 + k * 3.8, y: 5, z: -2 + k * 1.5, rz: -1.0, ry: 0.3, cast: false, receive: false }); ray.userData.noReflect = true; ray.userData.keep = true; group.add(ray); }
}
// a soft cone of light in the air (a floodlight's or a downlight's beam): brightest at its source
function coneBeam(color, k = 1, len = 6, r0 = 0.15, r1 = 1.6) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 24, 1, true); g.translate(0, len / 2, 0); // narrow at its source (y = 0), opening out
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { color: { value: new THREE.Color(color) }, k: { value: k }, len: { value: len } },
    vertexShader: 'uniform float len; varying float vy; varying vec3 vn, vv; void main(){ vy = position.y / len; vec4 mv = modelViewMatrix * vec4(position, 1.0); vn = normalize(normalMatrix * normal); vv = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float k; varying float vy; varying vec3 vn, vv; void main(){ float f = pow(abs(dot(vn, vv)), 1.4); gl_FragColor = vec4(color * pow(1.0 - vy, 1.6) * f * 0.35 * k, 1.0); }',
  });
  const b = new THREE.Mesh(g, m); b.userData.keep = true; b.userData.noReflect = true; b.castShadow = false;
  return b;
}
function washTex() {
  const cv = T.canvas(128, 128), x = cv.getContext('2d'), g = x.createRadialGradient(64, 128, 4, 64, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return T.toTex(cv);
}
function rayTex() {
  const cv = T.canvas(64, 256), x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  const v = x.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.3, 'rgba(0,0,0,0)'); v.addColorStop(0.8, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = v; x.fillRect(0, 0, 64, 256);
  return T.toTex(cv);
}

// The titas' house in the middle: its walls one tile thick around three tiles of floor, and its gate.
function house(W, inst, { fence, H, gate, mat, stoneM }) {
  const g = W.group, x0 = X(10) - 0.5 + 0.1, x1 = X(17) + 0.5 - 0.1, z0 = Z(12) - 0.5 + 0.1, z1 = Z(16) + 0.5 - 0.1, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // the mat on the floor inside
  g.add(mesh(new THREE.PlaneGeometry(x1 - x0 - 1.6, z1 - z0 - 1.6).rotateX(-Math.PI / 2), mat, { x: cx, y: 0.012, z: cz + 0.1, cast: false }));
  const gateL = X(13) - 0.5, gateR = X(14) + 0.5;
  const seg = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (fence === 'bamboo') {
      const bam = M('#c8a860', { roughness: 0.55 });
      for (const y of [H * 0.45, H]) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8).rotateZ(Math.PI / 2), bam, { x: mx, y, z: mz, ry: -ang }));
      const n = Math.max(2, Math.round(len / 0.5));
      for (let k = 0; k <= n; k++) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, H + 0.1, 8), bam, { x: ax + (bx - ax) * k / n, y: (H + 0.1) / 2, z: az + (bz - az) * k / n }));
    } else if (fence === 'stone') {
      g.add(box(len + 0.3, H, 0.3, stoneM, { x: mx, y: H / 2, z: mz, ry: -ang }));
      g.add(box(len + 0.42, 0.07, 0.42, M('#d8ccb0', { roughness: 0.9 }), { x: mx, y: H + 0.035, z: mz, ry: -ang }));
    } else {
      g.add(box(len + 0.3, H, 0.3, M('#f4f4f8', { roughness: 0.2 }), { x: mx, y: H / 2, z: mz, ry: -ang }));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, len + 0.3, 8).rotateZ(Math.PI / 2), glowM('#ff4fd8', 2.6), { x: mx, y: H + 0.02, z: mz + 0, ry: -ang }));
    }
  };
  seg(x0, z1, x1, z1); seg(x0, z0, x0, z1); seg(x1, z0, x1, z1); seg(x0, z0, gateL, z0); seg(gateR, z0, x1, z0);
  // the gate: a swinging half-door in her favourite pink
  const door = new THREE.Group(); door.position.set(gateL, 0, z0);
  door.add(box(gateR - gateL, H * 0.7, 0.05, M(gate, { roughness: 0.6 }), { x: (gateR - gateL) / 2, y: H * 0.55 }));
  g.add(door); door.userData.keep = true; door.children[0].userData.keep = true;
  W.anim.push((t, dt, s) => { door.rotation.y = s && s.doorOpen ? -1.2 : Math.sin(t * 2) * 0.05; });
  // the tsismis table: a thermos and cups
  if (fence === 'bamboo') {
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 12), M('#e8384f', { roughness: 0.3, metalness: 0.2 }), { x: x1 - 0.55, y: 0.13, z: z1 - 0.45 }));
    for (let k = 0; k < 3; k++) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.07, 10), M('#f4f1e8', { roughness: 0.3 }), { x: x1 - 0.85 - k * 0.15, y: 0.035, z: z1 - 0.4 + (k % 2) * 0.1 }));
  }
}

// ---------- the Simbahan ----------
function simbahan({ maze, W, inst, r, pick, rects, group }) {
  const H = 0.56, m = 0.07;
  const st = T.stoneBlocks(8), stoneM = M('#ffffff', { map: st.map, normalMap: st.normalMap, roughnessMap: st.roughnessMap, roughness: 1 });
  const capM = M('#b8ac94', { roughness: 0.85 }), topS = M('#8a8274', { map: st.map, normalMap: st.normalMap, roughness: 0.95 });
  walls(W, maze, { h: H, m, side: stoneM, top: topS, lip: capM, lipOpt: { w: 0.12, t: 0.07, out: 0.05 } });
  W.dressers.push(async (e) => { const t = await envTex(e, 'coral_stone_wall'); applySurface(stoneM, t, { tile: 1.1, rough: 1, tint: '#c8bca8' }); applySurface(topS, t, { tile: 1.1, rough: 1, tint: '#958a7a' }); });
  // votive candles along the wall tops, in red and amber glass
  const glassR = new THREE.MeshStandardMaterial({ color: '#c0182e', emissive: '#ff3a2a', emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.9 });
  const glassA = new THREE.MeshStandardMaterial({ color: '#e89a1a', emissive: '#ffa020', emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.9 });
  const flameM = glowM('#ffd080', 4);
  W.flicker.push(glassR, glassA, flameM);
  for (const rc of rects) {
    const x0 = X(rc.x0) - 0.5 + m + 0.14, x1 = X(rc.x1) + 0.5 - m - 0.14, z0 = Z(rc.y0) - 0.5 + m + 0.14, z1 = Z(rc.y1) + 0.5 - m - 0.14;
    const along = rc.w >= rc.d, n = Math.max(1, Math.round((along ? x1 - x0 : z1 - z0) / 0.34));
    for (let k = 0; k <= n; k++) {
      if (r() < 0.12) continue;
      const f = n ? k / n : 0.5, x = along ? x0 + (x1 - x0) * f : (x0 + x1) / 2 + (r() - 0.5) * 0.2, z = along ? (z0 + z1) / 2 + (r() - 0.5) * 0.2 : z0 + (z1 - z0) * f;
      const red = r() < 0.6;
      inst.add(red ? 'candleR' : 'candleA', () => ({ geo: new THREE.CylinderGeometry(0.06, 0.052, 0.16, 10), mat: red ? glassR : glassA }), x, H + 0.15, z, { cast: false });
      inst.add('flame', () => ({ geo: new THREE.SphereGeometry(0.026, 6, 5).scale(1, 1.8, 1), mat: flameM }), x, H + 0.27, z, { cast: false });
    }
    W.practicals.push({ x: rc.cx, y: H + 0.2, z: rc.cz, k: 0.45 + Math.min(rc.w, rc.d) * 0.08, r: 1.3 + Math.max(rc.w, rc.d) * 0.25 });
    // flowers on some walls
    if (!rc.perimeter && r() < 0.35) inst.add('pot', () => ({ geo: new THREE.CylinderGeometry(0.09, 0.07, 0.14, 10), mat: M('#9a4a2a', { roughness: 0.9 }) }), rc.cx, H + 0.14, rc.cz, {});
  }
  // capiz lanterns on posts at some of the corners
  const capizM = new THREE.MeshStandardMaterial({ map: T.capiz(9), emissive: '#ffcf8a', emissiveMap: T.capiz(9), emissiveIntensity: 1.5, roughness: 0.6 });
  const postM = M('#2a1a10', { roughness: 0.7 });
  W.grid.corners.forEach((c, i) => {
    if (i % 5 !== 0) return;
    const cx = c.x + Math.sign(-c.x) * 0.0, cz = c.z;
    const ins = inset(c, 0.18);
    group.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), postM, { x: ins.x, y: H + 0.27, z: ins.z }));
    group.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), capizM, { x: ins.x, y: H + 0.62, z: ins.z, cast: false }));
    group.add(mesh(new THREE.ConeGeometry(0.14, 0.08, 4), postM, { x: ins.x, y: H + 0.76, z: ins.z, ry: Math.PI / 4 }));
    W.practicals.push({ x: ins.x, y: H + 0.62, z: ins.z, k: 0.8, r: 1.8 });
    void cx;
  });
  function inset(c, d) { // step a corner point in toward the middle of the wall it belongs to
    const probe = (dx, dz) => W.grid.kw(Math.round(c.x + dx * 0.3 + (COLS - 1) / 2), Math.round(c.z + dz * 0.3 + (ROWS - 1) / 2));
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (probe(dx, dz)) return { x: c.x + dx * d, z: c.z + dz * d };
    return c;
  }
  // parols on wires over the walks around the churchyard
  const PC = ['#e8384f', '#ffd23f', '#2f9bff', '#3fcf6a', '#ff7eb6', '#ff9f43'];
  const ring = [[EDGE.x0 - 1.1, EDGE.z0 - 1.2], [EDGE.x1 + 1.1, EDGE.z0 - 1.2], [EDGE.x1 + 1.1, EDGE.z1 + 1], [EDGE.x0 - 1.1, EDGE.z1 + 1]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 4], n = Math.round(Math.hypot(bx - ax, bz - az) / 4);
    for (let q = 0; q < n; q++) {
      const a = new THREE.Vector3(ax + (bx - ax) * q / n, 2.6, az + (bz - az) * q / n), b = new THREE.Vector3(ax + (bx - ax) * (q + 1) / n, 2.6, az + (bz - az) * (q + 1) / n), pts = K.sag(a, b, 0.4, 8);
      wirePath(W, pts);
      inst.add('lamppost', () => ({ geo: new THREE.CylinderGeometry(0.05, 0.07, 2.6, 8).translate(0, 1.3, 0), mat: M('#1a1a1e', { roughness: 0.4, metalness: 0.7 }) }), a.x, 0, a.z);
      const p = pts[4]; parol(W, inst, p.x, p.y - 0.35, p.z, PC[(k * 3 + q) % PC.length], 0.8);
    }
  }
  W.wireColor = '#0a0a0c';
  // the old church: a two-storey baroque facade in coral stone, with paired pilasters, cornices, an
  // open arched door with its carved frame, a capiz rose window, niches, scrolled gables and buttresses;
  // and its bell tower, with bells hanging in open arches
  const cz = EDGE.z0 - 4.5, fac = M('#c8b898', { roughness: 0.95 }), trim = M('#e0d4bc', { roughness: 0.9 }), dark = M('#1a120c', { roughness: 0.9 }), wood = M('#5a3018', { roughness: 0.7 });
  W.dressers.push(async (e) => { const t = await envTex(e, 'coral_stone_wall'); applySurface(fac, t, { tile: 2.2, rough: 1, tint: '#d8c8b0' }); });
  const archPath = (P, x, y, w, h) => { P.moveTo(x - w / 2, y); P.lineTo(x + w / 2, y); P.lineTo(x + w / 2, y + h - w / 2); P.absarc(x, y + h - w / 2, w / 2, 0, Math.PI, false); P.lineTo(x - w / 2, y); return P; };
  const arch = (w, h) => new THREE.ShapeGeometry(archPath(new THREE.Shape(), 0, 0, w, h), 16);
  const ext = (shape, depth, mat, o) => mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 16 }), mat, o);
  // the wall itself, with real openings: the great door, two side doors, the choir window, two windows above
  const FW = 18, wall = new THREE.Shape(); wall.moveTo(-FW / 2, 0); wall.lineTo(FW / 2, 0); wall.lineTo(FW / 2, 9.4); wall.lineTo(-FW / 2, 9.4); wall.closePath();
  const HOLES = [[0, 0, 2.4, 4.2], [-5.2, 0, 1.5, 3], [5.2, 0, 1.5, 3], [-5.2, 5.9, 1.1, 1.9], [5.2, 5.9, 1.1, 1.9]];
  for (const [x, y, w, h] of HOLES) wall.holes.push(archPath(new THREE.Path(), x, y, w, h));
  const rose = new THREE.Path(); rose.absarc(0, 7.4, 1.15, 0, TAU, true); wall.holes.push(rose);
  group.add(ext(wall, 1.0, fac, { z: cz - 1.0 }));
  group.add(box(FW - 0.4, 9.2, 0.2, M('#2a1a10', { roughness: 1 }), { x: 0, y: 4.7, z: cz - 1.6 })); // the dark nave behind the openings
  // what shows through: the warm nave through the great door, dark through the others
  group.add(mesh(arch(2.4, 4.2), glowM('#ffb860', 1.5), { y: 0, z: cz - 1.45, cast: false }));
  for (const [x, y, w, h] of HOLES.slice(1)) group.add(mesh(arch(w, h), y > 0 ? glowM('#ff9a40', 0.7) : dark, { x, y, z: cz - 1.45, cast: false }));
  // the door leaves, swung open
  for (const sx of [-1, 1]) group.add(box(1.2, 3.4, 0.1, wood, { x: sx * 1.6, y: 1.7, z: cz - 0.3, ry: sx * 1.1 }));
  // carved frames round the doors and windows (an arch-shaped ring standing proud of the wall)
  const frame = (x, y, w, h, b) => { const s = archPath(new THREE.Shape(), 0, 0, w + b * 2, h + b); s.holes.push(archPath(new THREE.Path(), 0, 0, w, h)); group.add(ext(s, 0.18, trim, { x, y, z: cz })); };
  for (const [x, y, w, h] of HOLES) frame(x, y, w, h, x === 0 && y === 0 ? 0.35 : 0.2);
  const rf = new THREE.Shape(); rf.absarc(0, 0, 1.5, 0, TAU, false); const rh = new THREE.Path(); rh.absarc(0, 0, 1.15, 0, TAU, true); rf.holes.push(rh);
  group.add(ext(rf, 0.22, trim, { y: 7.4, z: cz }));
  // the rose window: capiz behind a stone wheel of tracery
  group.add(mesh(new THREE.CircleGeometry(1.16, 32), capizM, { y: 7.4, z: cz - 0.6, cast: false }));
  for (let k = 0; k < 8; k++) group.add(box(0.07, 2.25, 0.12, trim, { y: 7.4, z: cz - 0.5, rz: (k / 8) * Math.PI }));
  group.add(mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 24), trim, { y: 7.4, z: cz - 0.48 }));
  // paired pilasters on both storeys, with bases and capitals, and the cornices between
  for (const [y0, hgt] of [[0, 5.0], [5.4, 3.7]]) for (const px of [-8.4, -3.3, 3.3, 8.4]) for (const dx of [-0.38, 0.38]) {
    const x = px + dx; group.add(box(0.42, hgt, 0.3, trim, { x, y: y0 + hgt / 2, z: cz + 0.12 }));
    group.add(box(0.56, 0.22, 0.42, trim, { x, y: y0 + 0.11, z: cz + 0.14 })); group.add(box(0.6, 0.24, 0.44, trim, { x, y: y0 + hgt - 0.12, z: cz + 0.15 }));
  }
  for (const [y, w] of [[5.15, FW + 0.8], [9.4, FW + 0.6]]) { group.add(box(w, 0.3, 0.7, trim, { y, z: cz + 0.2 })); group.add(box(w - 0.3, 0.14, 0.5, trim, { y: y - 0.22, z: cz + 0.12 })); }
  // niches between the pilasters, upstairs
  for (const sx of [-1, 1]) group.add(mesh(arch(0.8, 1.6), dark, { x: sx * 7.3, y: 6.4, z: cz + 0.02, cast: false }));
  // the gable: a third storey narrowing in scrolls, crowned by a little belfry niche and a cross
  const gab = new THREE.Shape(); gab.moveTo(-5.5, 0); gab.lineTo(5.5, 0); gab.bezierCurveTo(5.6, 1.2, 3.4, 1.0, 3.2, 2.2); gab.lineTo(3.2, 3.2); gab.lineTo(1.6, 4.0); gab.lineTo(-1.6, 4.0); gab.lineTo(-3.2, 3.2); gab.lineTo(-3.2, 2.2); gab.bezierCurveTo(-3.4, 1.0, -5.6, 1.2, -5.5, 0);
  gab.holes.push(archPath(new THREE.Path(), 0, 1.4, 1.0, 1.8));
  group.add(ext(gab, 0.9, fac, { y: 9.55, z: cz - 0.95 }));
  group.add(mesh(arch(1.0, 1.8), glowM('#ffcf8a', 0.6), { y: 10.95, z: cz - 0.9, cast: false }));
  for (const sx of [-1, 1]) group.add(mesh(new THREE.TorusGeometry(0.42, 0.13, 8, 16, Math.PI * 1.5), trim, { x: sx * 4.6, y: 10.1, z: cz + 0.05, rz: sx > 0 ? Math.PI : -Math.PI / 2 })); // the scrolls
  group.add(box(0.18, 1.3, 0.18, trim, { y: 14.2, z: cz - 0.5 })); group.add(box(0.8, 0.18, 0.18, trim, { y: 14.45, z: cz - 0.5 }));
  // the buttresses, stepped and massive, as old churches built against earthquakes
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) group.add(box(1.4 - k * 0.3, 6.5 - k * 1.8, 2.6 - k * 0.7, fac, { x: sx * (FW / 2 + 0.7 - k * 0.1), y: (6.5 - k * 1.8) / 2, z: cz + 0.3 - k * 0.35 }));
  // a big parol over the door, and the light spilling out onto the yard
  parol(W, inst, 0, 5.0, cz + 1.0, '#ffd23f', 2.2);
  W.practicals.push({ x: 0, y: 1, z: cz + 1.5, k: 1.6, r: 4 });
  // the bell tower: a solid base, then two open storeys of arches with the bells inside, and a dome
  const tx = 12.8, tz = cz - 1.2;
  group.add(box(3.8, 6.4, 3.8, fac, { x: tx, y: 3.2, z: tz })); group.add(box(4.1, 0.3, 4.1, trim, { x: tx, y: 6.45, z: tz }));
  const bellG = new THREE.LatheGeometry([[0.001, 0.62], [0.2, 0.6], [0.3, 0.4], [0.36, 0.12], [0.46, 0], [0.42, -0.02], [0.001, 0.02]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
  const bronze = M('#8a6a2a', { metalness: 0.85, roughness: 0.35 });
  for (let k = 0; k < 2; k++) {
    const w = 3.4 - k * 0.5, y0 = 6.6 + k * 3.1, hgt = 2.9;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) group.add(box(0.6, hgt, 0.6, fac, { x: tx + sx * (w / 2 - 0.3), y: y0 + hgt / 2, z: tz + sz * (w / 2 - 0.3) }));
    for (let f = 0; f < 4; f++) { const s = new THREE.Shape(); s.moveTo(-w / 2 + 0.6, 0); s.lineTo(w / 2 - 0.6, 0); s.lineTo(w / 2 - 0.6, hgt); s.lineTo(-w / 2 + 0.6, hgt); s.closePath(); s.holes.push(archPath(new THREE.Path(), 0, 0, w - 1.5, hgt - 0.5)); const g = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false, curveSegments: 12 }), fac, { x: tx + Math.sin(f * Math.PI / 2) * (w / 2 - 0.3), y: y0, z: tz + Math.cos(f * Math.PI / 2) * (w / 2 - 0.3), ry: f * Math.PI / 2 }); g.geometry.translate(0, 0, -0.15); group.add(g); }
    group.add(box(w + 0.3, 0.25, w + 0.3, trim, { x: tx, y: y0 + hgt + 0.12, z: tz }));
    group.add(mesh(bellG, bronze, { x: tx, y: y0 + 1.1, z: tz, s: k ? 0.8 : 1.1 }));
  }
  group.add(mesh(new THREE.SphereGeometry(1.25, 16, 8, 0, TAU, 0, Math.PI / 2), M('#6a4a3a', { roughness: 0.8 }), { x: tx, y: 12.95, z: tz }));
  group.add(box(0.5, 1.0, 0.5, trim, { x: tx, y: 14.5, z: tz })); group.add(box(0.12, 0.9, 0.12, trim, { x: tx, y: 15.4, z: tz })); group.add(box(0.5, 0.12, 0.12, trim, { x: tx, y: 15.55, z: tz }));
  // floodlights from the yard washing the facade, and moonlight slanting down
  for (const sx of [-1, 1]) {
    group.add(box(0.4, 0.25, 0.3, M('#202024', { roughness: 0.5, metalness: 0.6 }), { x: sx * 2.6, y: 0.12, z: cz + 2.2, rx: -0.6 }));
    const beam = coneBeam('#ffc078', 0.7, 9, 0.18, 2.2); beam.position.set(sx * 2.6, 0.2, cz + 2.2); beam.rotation.set(-0.35, 0, sx * 0.18); group.add(beam);
  }
  const wash = mesh(new THREE.PlaneGeometry(FW + 2, 10), new THREE.MeshBasicMaterial({ map: washTex(), color: '#ffb070', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), { y: 5, z: cz + 0.45, cast: false, receive: false });
  wash.userData.keep = true; wash.userData.noReflect = true; group.add(wash);
  const moonM = new THREE.MeshBasicMaterial({ map: rayTex(), color: '#8fa8ff', transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
  for (let k = 0; k < 4; k++) { const ray = mesh(new THREE.PlaneGeometry(2.5 + r() * 2, 22), moonM, { x: 8 - k * 5, y: 5, z: -4 + k * 2.5, rz: 0.75, ry: -0.4, cast: false, receive: false }); ray.userData.noReflect = true; ray.userData.keep = true; group.add(ray); }
  // trees along the sides, lamp posts, benches
  const leaf = M('#1e3a22', { roughness: 0.9 }), bark = M('#3a2a1e', { roughness: 1 });
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
    const x = sx * (EDGE.x1 + 3.2 + r() * 1.5), z = EDGE.z0 + 1 + k * 7;
    group.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, 3, 8), bark, { x, y: 1.5, z }));
    for (let q = 0; q < 7; q++) group.add(mesh(new THREE.IcosahedronGeometry(1.1 + r() * 0.7, 1), leaf, { x: x + (r() - 0.5) * 2.8, y: 3.4 + r() * 1.2, z: z + (r() - 0.5) * 2.8 }));
  }
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) inst.add('bench', () => ({ geo: new THREE.BoxGeometry(0.5, 0.45, 1.6), mat: M('#5a3a24', { roughness: 0.8 }) }), sx * (EDGE.x1 + 1.3), 0.22, EDGE.z0 + 5 + k * 7);
  W.dressers.push(async (e) => {
    const [lant, bench] = await Promise.all([envProp(e, 'wooden_lantern_01'), envProp(e, 'painted_wooden_bench')]);
    const g = new THREE.Group();
    if (lant) for (let k = 0; k < 6; k++) { const o = lant.clone(); o.position.set((k % 2 ? 1 : -1) * (EDGE.x1 + 0.9), 0, EDGE.z0 + 3 + Math.floor(k / 2) * 10); o.traverse((q) => { if (q.isMesh) q.castShadow = false; }); g.add(o); }
    if (bench) for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const o = bench.clone(); o.position.set(sx * (EDGE.x1 + 1.35), 0, EDGE.z0 + 5 + k * 7); o.rotation.y = sx * Math.PI / 2; g.add(o); }
    W.group.add(g);
  });
  house(W, inst, { fence: 'stone', H: 0.45, gate: '#6a3a1e', stoneM, mat: new THREE.MeshStandardMaterial({ color: '#3a5a2a', roughness: 1 }) });
  tunnels(W, { wall: stoneM, roof: M('#3a2a1e', { roughness: 0.9 }), h: H });
  // the floor: old cobbles, damp with dew
  const cb = T.cobbles(6);
  const fm = floor(W, maze, { base: { map: cb.map, normalMap: cb.normalMap, roughnessMap: cb.roughnessMap, roughness: 1 }, wet: 0.45, wetRough: 0.15, wetDark: 0.75, reflect: 0.6, poolK: 1.3, pools: poolsFromPracticals(W, 1) });
  fm.map.repeat.set(0.5, 0.5); fm.normalMap.repeat.set(0.5, 0.5); fm.roughnessMap.repeat.set(0.5, 0.5);
  W.dressers.push(async (e) => { const t = await envTex(e, 'square_cobblestone'); applySurface(fm, t, { tile: 2.4, rough: 1, tint: '#b8b0a8' }); });
  W.points = [{ x: 0, y: 1.6, z: cz + 2, color: '#ffa050', k: 6, dist: 9 }, ...W.practicals.filter((p, i) => i % 4 === 1).slice(0, 9).map((p) => ({ x: p.x, y: p.y + 0.2, z: p.z, color: '#ff9a40', k: 1.8, dist: 3.8 }))];
  // fireflies
  W.fireflies = 60;
}

// ---------- the Mall ----------
function mall({ maze, W, inst, r, pick, rects, group }) {
  const H = 0.52, m = 0.08;
  const bodyM = new THREE.MeshPhysicalMaterial({ color: '#f4f4f8', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
  const topM = new THREE.MeshPhysicalMaterial({ color: '#1a1e2a', roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.35 });
  const cyan = glowM('#34e8ff', 2.0), mag = glowM('#ff3fd0', 2.0);
  const grid = walls(W, maze, { h: H, m, side: bodyM, top: topM, lip: null });
  // neon along every edge: cyan inside, magenta round the outside
  const inner = { runs: grid.runs.filter((q) => !perim(q)) }, outer = { runs: grid.runs.filter(perim) };
  function perim(q) { const lim = 1.2; return q.ax === 'x' ? q.at < EDGE.z0 + lim || q.at > EDGE.z1 - lim : q.at < EDGE.x0 + lim || q.at > EDGE.x1 - lim; }
  for (const [set, mat] of [[inner, cyan], [outer, mag]]) { const l = mesh(K.lipGeometry(set, H + 0.005, { w: 0.03, t: 0.035, out: 0.018, round: true }), mat, { cast: false }); l.userData.keep = l.userData.wall = true; group.add(l); }
  const kick = mesh(K.wallGeometry({ ...grid, tops: [] }, 0.06, { faces: true }), M('#1a1a24', { roughness: 0.3, metalness: 0.5 }), { cast: false }); kick.scale.set(1.002, 1, 1.002); kick.userData.keep = true; group.add(kick);
  // the goods on the kiosks, baked into a few meshes: sneakers on plinths, phones with their screens lit,
  // mannequins and racks of shirts, food-court trays, milk tea
  const C = ['#e8384f', '#ffd23f', '#2f9bff', '#3fcf6a', '#ff7eb6', '#ff9f43', '#9a6aff', '#f4f4f4'];
  const B = K.baker(); W.baker = B;
  W.bakedMats = { matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15 }), glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) };
  const Q = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8, 1, false), thin: new THREE.CylinderGeometry(1, 1, 1, 4, 1, true), cup: new THREE.CylinderGeometry(1, 0.8, 1, 8), ball: new THREE.SphereGeometry(1, 6, 4), cap: new THREE.CapsuleGeometry(0.5, 1, 2, 6), dome: new THREE.SphereGeometry(1, 8, 3, 0, TAU, 0, Math.PI / 2), cone: new THREE.ConeGeometry(1, 1, 8) };
  const y0 = H + 0.005;
  const sneaker = (x, z, ry, c) => { const ca = Math.cos(ry), sa = Math.sin(ry), at = (f) => [x + sa * f, z + ca * f]; B.add('gloss', Q.box, '#f4f4f4', x, y0 + 0.11, z, { s: [0.075, 0.025, 0.17], ry }); const [ux, uz] = at(-0.015); B.add('matte', Q.cap, c, ux, y0 + 0.15, uz, { s: [0.07, 0.11, 0.07], rx: Math.PI / 2, ry, vary: 0.03 }); const [tx, tz] = at(0.06); B.add('gloss', Q.ball, '#f4f4f4', tx, y0 + 0.135, tz, { s: [0.036, 0.025, 0.04], ry }); };
  const plinth = (x, z) => B.add('gloss', Q.box, '#e8e8f0', x, y0 + 0.045, z, { s: [0.22, 0.09, 0.26] });
  const phone = (x, z, ry, c) => { B.add('matte', Q.box, '#2a2a34', x, y0 + 0.03, z, { s: [0.06, 0.06, 0.06], ry }); B.add('gloss', Q.box, '#16161c', x, y0 + 0.12, z, { s: [0.09, 0.16, 0.012], rx: -0.5, ry }); B.add('glow', Q.box, c, x + Math.sin(ry) * 0.005, y0 + 0.12, z + Math.cos(ry) * 0.005, { s: [0.075, 0.14, 0.004], rx: -0.5, ry, k: 1.6 }); };
  const mannequin = (x, z, c) => { B.add('gloss', Q.cyl, '#d8d8e0', x, y0 + 0.01, z, { s: [0.09, 0.02, 0.09] }); B.add('gloss', Q.cyl, '#c0c0c8', x, y0 + 0.12, z, { s: [0.01, 0.22, 0.01] }); B.add('matte', Q.cone, c, x, y0 + 0.33, z, { s: [0.11, 0.24, 0.11], vary: 0.05 }); B.add('matte', Q.cap, c, x, y0 + 0.47, z, { s: [0.14, 0.12, 0.1], vary: 0.05 }); B.add('gloss', Q.ball, '#f2ece4', x, y0 + 0.6, z, { s: 0.05 }); };
  const rack = (x0, x1, z, along) => { const L = Math.abs(x1 - x0); for (const e of [x0, x1]) B.add('gloss', Q.cyl, '#c0c0c8', along ? e : z, y0 + 0.18, along ? z : e, { s: [0.012, 0.36, 0.012] }); B.add('gloss', Q.cyl, '#c0c0c8', along ? (x0 + x1) / 2 : z, y0 + 0.36, along ? z : (x0 + x1) / 2, { s: [0.01, L, 0.01], rz: along ? Math.PI / 2 : 0, rx: along ? 0 : Math.PI / 2 }); const n = Math.floor(L / 0.07); for (let k = 0; k < n; k++) { const f = Math.min(x0, x1) + (k + 0.5) * L / n; B.add('matte', Q.box, pick(C), along ? f : z, y0 + 0.24, along ? z : f, { s: along ? [0.025, 0.22, 0.17] : [0.17, 0.22, 0.025], vary: 0.05 }); } };
  const tray = (x, z, ry) => { B.add('matte', Q.box, '#8a5a30', x, y0 + 0.012, z, { s: [0.3, 0.02, 0.22], ry }); B.add('gloss', Q.cyl, '#f4f4f4', x - 0.04, y0 + 0.03, z, { s: [0.075, 0.015, 0.075] }); B.add('matte', Q.dome, '#f8f6ee', x - 0.06, y0 + 0.035, z, { s: [0.04, 0.035, 0.04] }); B.add('matte', Q.ball, pick(['#8a3a14', '#c86a20', '#b8521c']), x - 0.015, y0 + 0.05, z + 0.02, { s: [0.035, 0.02, 0.035] }); B.add('gloss', Q.cup, pick(C), x + 0.09, y0 + 0.07, z - 0.04, { s: [0.028, 0.1, 0.028] }); };
  const milktea = (x, z) => { B.add('gloss', Q.cup, pick(['#d8b890', '#c89a70', '#e8d0c0', '#a8d098']), x, y0 + 0.08, z, { s: [0.035, 0.16, 0.035], vary: 0.06 }); B.add('gloss', Q.dome, '#ffffff', x, y0 + 0.16, z, { s: [0.036, 0.015, 0.036] }); B.add('gloss', Q.thin, pick(C), x + 0.01, y0 + 0.21, z, { s: [0.007, 0.12, 0.007], rz: 0.15 }); };
  for (const rc of rects) {
    const x0 = X(rc.x0) - 0.5 + m + 0.16, x1 = X(rc.x1) + 0.5 - m - 0.16, z0 = Z(rc.y0) - 0.5 + m + 0.16, z1 = Z(rc.y1) + 0.5 - m - 0.16, w = x1 - x0, d = z1 - z0;
    const kind = rc.perimeter ? 'rack' : w * d >= 7 ? pick(['mannequin', 'rack', 'mannequin']) : pick(['sapatos', 'phones', 'foodcourt', 'milktea', 'sapatos', 'phones']);
    const along = w >= d, L = Math.max(w, d);
    const row = (step, f) => { const n = Math.max(1, Math.floor(L / step)); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; const lanes = Math.max(1, Math.floor(Math.min(w, d) / 0.45)); for (let l = 0; l < lanes; l++) { const a = (l + 0.5) / lanes; f(along ? x0 + t * w : x0 + a * w, along ? z0 + a * d : z0 + t * d); } } };
    if (kind === 'sapatos') row(0.36, (x, z) => { plinth(x, z); const c = pick(C), ry = 0.4 + (r() - 0.5) * 0.3; sneaker(x - 0.045, z, ry, c); sneaker(x + 0.045, z + 0.02, ry, c); });
    else if (kind === 'phones') row(0.24, (x, z) => phone(x, z, (r() - 0.5) * 0.3, pick(['#5fd8ff', '#ff7ad8', '#ffe07a', '#7affb0', '#a08aff'])));
    else if (kind === 'foodcourt') row(0.36, (x, z) => tray(x, z, (r() - 0.5) * 0.4));
    else if (kind === 'milktea') row(0.17, (x, z) => milktea(x + (r() - 0.5) * 0.03, z + (r() - 0.5) * 0.03));
    else if (kind === 'mannequin') { row(0.7, (x, z) => mannequin(x, z, pick(C))); }
    else { const lanes = Math.max(1, Math.floor(Math.min(w, d) / 0.5)); for (let l = 0; l < lanes; l++) { const a = (l + 0.5) / lanes; if (along) rack(x0, x1, z0 + a * d, true); else rack(z0, z1, x0 + a * w, false); } }
    // a soft light in the counter under the goods
    inst.add('shelf', () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: glowM('#5a6aa0', 0.12) }), rc.cx, H + 0.004, rc.cz, { s: [w * 0.95, 0.01, d * 0.95], cast: false });
    W.practicals.push({ x: rc.cx, y: H, z: rc.cz, k: 0.35 + Math.min(rc.w, rc.d) * 0.06, r: 1.1 + Math.max(rc.w, rc.d) * 0.25 });
  }
  // storefronts along the north: glass, bright insides, neon names
  const fronts = [['HABULAN MART', '#34e8ff'], ['MILK TEA', '#ff3fd0'], ['SALE 70%', '#ffd23f'], ['PAN DE SAL CO.', '#ff9f43'], ['TSINELAS HUB', '#3fcf6a'], ['LECHON HOUSE', '#ff5a5a']];
  const nz = EDGE.z0 - 2.4, fw = 5.2;
  for (let k = 0; k < 6; k++) {
    const [name, col] = fronts[k], x = -2.5 * fw + k * fw;
    group.add(box(fw - 0.3, 3.2, 0.2, M('#1a1624', { roughness: 0.5 }), { x, y: 1.6, z: nz - 1.4 }));
    group.add(mesh(new THREE.PlaneGeometry(fw - 0.5, 2.4), glowM(T.shade(col, 0.55), 0.5), { x, y: 1.3, z: nz - 1.28, cast: false }));
    for (const sy of [0.55, 1.15, 1.75]) { B.add('gloss', Q.box, '#d8d8e0', x, sy, nz - 1.05, { s: [fw - 0.8, 0.04, 0.45], vary: 0 }); for (let q = 0; q < 9; q++) { const hh = 0.2 + r() * 0.2; B.add('matte', Q.box, pick(C), x - 2 + q * 0.5, sy + 0.02 + hh / 2, nz - 1.05, { s: [0.26, hh, 0.22] }); } }
    if (k % 2 === 0) for (const dx of [-1.6, 1.6]) { const yb = 0; B.add('gloss', Q.cyl, '#d8d8e0', x + dx, yb + 0.02, nz - 0.4, { s: [0.2, 0.04, 0.2] }); B.add('matte', Q.cone, pick(C), x + dx, 0.75, nz - 0.4, { s: [0.28, 0.7, 0.28] }); B.add('matte', Q.cap, pick(C), x + dx, 1.18, nz - 0.4, { s: [0.34, 0.3, 0.24] }); B.add('gloss', Q.ball, '#f2ece4', x + dx, 1.5, nz - 0.4, { s: 0.11 }); }
    group.add(mesh(new THREE.PlaneGeometry(fw - 0.3, 2.6), new THREE.MeshPhysicalMaterial({ color: '#a8c8e8', roughness: 0.02, transparent: true, opacity: 0.18, metalness: 0.2 }), { x, y: 1.3, z: nz, cast: false }));
    const sg = T.neon(name, col, { w: 512, h: 96 });
    group.add(mesh(new THREE.PlaneGeometry(fw - 0.8, 0.8), new THREE.MeshBasicMaterial({ map: sg, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) }), { x, y: 3.1, z: nz + 0.05, cast: false }));
    W.practicals.push({ x, y: 1.5, z: nz + 0.4, k: 1.0, r: 3.2 });
  }
  group.add(box(34, 5, 1, M('#241e2e', { roughness: 0.6 }), { x: 0, y: 2.5, z: nz - 2 }));
  // columns, palms in pots, benches and an escalator along the sides
  const colM = M('#e8e8f0', { roughness: 0.25, metalness: 0.1 });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 5; k++) { const z = EDGE.z0 + 1 + k * 7.5; group.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 6, 20), colM, { x: sx * (EDGE.x1 + 3.2), y: 3, z })); group.add(mesh(new THREE.TorusGeometry(0.47, 0.04, 8, 24), glowM(sx < 0 ? '#34e8ff' : '#ff3fd0', 2.5), { x: sx * (EDGE.x1 + 3.2), y: 0.25, z, rx: Math.PI / 2, cast: false })); }
    for (let k = 0; k < 4; k++) { const z = EDGE.z0 + 4.5 + k * 7.5; inst.add('planter', () => ({ geo: new THREE.CylinderGeometry(0.35, 0.28, 0.6, 16), mat: M('#2a2a34', { roughness: 0.3 }) }), sx * (EDGE.x1 + 1.4), 0.3, z); for (let q = 0; q < 6; q++) inst.add('frond', () => ({ geo: new THREE.SphereGeometry(0.4, 8, 6).scale(1.4, 0.18, 0.5), mat: M('#2a8a3a', { roughness: 0.7 }) }), sx * (EDGE.x1 + 1.4) + Math.cos(q) * 0.3, 0.95 + (q % 2) * 0.12, z + Math.sin(q) * 0.3, { ry: q * 1.05, rz: 0.35 }); }
    // an escalator going up out of sight
    const ex = sx * (EDGE.x1 + 6);
    for (let k = 0; k < 14; k++) group.add(box(1.4, 0.2, 0.4, M('#8a8a94', { roughness: 0.3, metalness: 0.8 }), { x: ex, y: 0.1 + k * 0.28, z: EDGE.z1 - 3 - k * 0.4 }));
    for (const dx of [-0.8, 0.8]) group.add(mesh(new THREE.PlaneGeometry(6.4, 1).rotateY(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#a8d8ff', transparent: true, opacity: 0.2, roughness: 0.02 }), { x: ex + dx, y: 2.3, z: EDGE.z1 - 5.8, rx: 0.61, cast: false }));
  }
  // downlights cutting through the air, and a spotlight sweeping the storefronts for the midnight sale
  for (const [x, z, c] of [[EDGE.x0 - 1.4, -9, '#dfe8ff'], [EDGE.x0 - 1.4, 7, '#dfe8ff'], [EDGE.x1 + 1.4, -3, '#dfe8ff'], [EDGE.x1 + 1.4, 11, '#dfe8ff'], [-0.5, Z(14) + 0.5, '#ffd0f4'], [-7, EDGE.z1 + 1.4, '#dfe8ff'], [7, EDGE.z1 + 1.4, '#dfe8ff']]) {
    const b = coneBeam(c, 0.8, 6.5, 0.12, 1.5); b.rotation.x = Math.PI; b.position.set(x, 6.5, z); group.add(b);
  }
  const sweep = coneBeam('#9ff0ff', 1.1, 14, 0.12, 2.6); sweep.position.set(0, 0.2, EDGE.z0 - 1.2); group.add(sweep);
  W.anim.push((t) => { sweep.rotation.set(-0.5 + Math.sin(t * 0.3) * 0.12, 0, Math.sin(t * 0.45) * 0.7); });
  // SALE banners hanging over the walks
  const saleT = T.sign([['SALE!', 26, 900], ['HANGGANG 70% OFF', 9, 800]], '#e8384f', '#fff4c8', { w: 512, h: 256, grime: false });
  for (const [x, z, ry] of [[EDGE.x0 - 1.4, -6, Math.PI / 2], [EDGE.x1 + 1.4, 6, -Math.PI / 2], [-7, EDGE.z1 + 1.6, 0], [7, EDGE.z1 + 1.6, 0]]) {
    group.add(mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshStandardMaterial({ map: saleT, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: saleT, emissiveIntensity: 0.5 }), { x, y: 2.6, z, ry, cast: false }));
    W.wires.push(x - 0.8, 3.1, z, x - 0.8, 5, z, x + 0.8, 3.1, z, x + 0.8, 5, z);
  }
  W.wireColor = '#8a8a94';
  // downlights: pools of cool light across the floor
  for (let k = 0; k < 9; k++) for (let q = 0; q < 3; q++) W.practicals.push({ x: -12 + q * 12, y: 6, z: EDGE.z0 + 2 + k * 3.6, k: 0.3, r: 2.6 });
  house(W, inst, { fence: 'kiosk', H: 0.4, gate: '#ff3fd0', mat: new THREE.MeshStandardMaterial({ color: '#2a2438', roughness: 0.4 }) });
  group.add(signBoard('INFO', '#34e8ff', X(13.5), 1.35, Z(12) - 0.3));
  tunnels(W, { wall: bodyM, roof: M('#1a1624', { roughness: 0.4 }), h: H });
  // the floor: polished dark granite, mirror-bright
  const gr = T.granite(4);
  const fm = floor(W, maze, { base: { map: gr.map, normalMap: gr.normalMap, roughnessMap: gr.roughnessMap, roughness: 1 }, wet: 0.85, wetRough: 0.06, wetDark: 0.8, reflect: 0.75, poolK: 0.9, pools: poolsFromPracticals(W, 1) });
  fm.map.repeat.set(1 / 1.6, 1 / 1.6); fm.normalMap.repeat.set(1 / 1.6, 1 / 1.6); fm.roughnessMap.repeat.set(1 / 1.6, 1 / 1.6);
  W.dressers.push(async (e) => { const t = await envTex(e, 'granite_tile'); applySurface(fm, t, { tile: 2.4, rough: 0.35, tint: '#8a8a96' }); });
  W.dressers.push(async (e) => {
    const [palm, sign] = await Promise.all([envProp(e, 'potted_plant_02'), envProp(e, 'WetFloorSign_01')]);
    const g = new THREE.Group();
    if (sign) for (const [x, z] of [[EDGE.x0 - 0.9, 3], [EDGE.x1 + 0.9, -9]]) { const o = sign.clone(); o.position.set(x, 0, z); o.rotation.y = x * 0.1; g.add(o); }
    if (palm) for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const o = palm.clone(); o.position.set(sx * (EDGE.x1 + 1.1), 0, EDGE.z0 + 0.8 + k * 7.5); o.scale.setScalar(1.3); g.add(o); }
    W.group.add(g);
  });
  W.points = [{ x: -6, y: 2, z: nz + 1, color: '#34e8ff', k: 5, dist: 9 }, { x: 6, y: 2, z: nz + 1, color: '#ff3fd0', k: 5, dist: 9 }, ...W.practicals.filter((p, i) => i % 5 === 2).slice(0, 8).map((p) => ({ x: p.x, y: 1.2, z: p.z, color: '#dfe8ff', k: 1.4, dist: 4 }))];
  W.sparkle = true;
}
function signBoard(text, col, x, y, z) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(1.4, 0.45), new THREE.MeshBasicMaterial({ map: T.neon(text, col, { w: 256, h: 80 }), toneMapped: false, color: new THREE.Color(2, 2, 2) }), { y: 0, cast: false }));
  g.add(box(1.5, 0.52, 0.06, M('#16121e', { roughness: 0.4 }), { z: -0.04 }));
  g.position.set(x, y, z); g.rotation.x = -0.35;
  return g;
}
