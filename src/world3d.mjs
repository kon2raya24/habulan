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
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
const glowM = (color, k = 2) => new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: k, roughness: 1 });
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
  group.traverse((o) => { if (o.isInstancedMesh && !/^(bulb|parol|candle|flame|crate|karton|sako)/.test(o.name)) o.userData.noReflect = true; });
  if (W.wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(W.wires, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: W.wireColor || '#1a1614' })); l.userData.noReflect = false; group.add(l); }
  K.mergeStatic(group);
  W.update = (t, dt, s) => { for (const f of W.anim) f(t, dt, s); };
  W.dress = (e) => Promise.all(W.dressers.map((f) => f(e).catch(() => null)));
  W.dispose = () => group.traverse((o) => {
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
  const s = mesh(sideGeo, side, { cast: true, receive: true }); s.userData.keep = true; W.group.add(s);
  const t = mesh(topGeo, top, { cast: true, receive: true }); t.userData.keep = true; W.group.add(t);
  if (lip) { const l = mesh(K.lipGeometry(grid, h + topH, lipOpt), lip, { cast: true, receive: true }); l.userData.keep = true; W.group.add(l); }
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
  inst.add('bulb', () => ({ geo: new THREE.SphereGeometry(big ? 0.07 : 0.055, 12, 8), mat: glowM(color || W.look.bulb, 3.2) }), x, y, z, { cast: false });
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
  const map = T.toTex(cv), em = T.toTex(cv);
  return { map, em };
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
  // ---------- what each stall sells ----------
  const TYPES = ['gulay', 'prutas', 'isda', 'itlog', 'gulay', 'prutas', 'kakanin', 'bigas'];
  const geos = {
    sphere: new THREE.IcosahedronGeometry(1, 1), ico: new THREE.IcosahedronGeometry(1, 1), capsule: new THREE.CapsuleGeometry(0.5, 1.4, 3, 6),
    egg: new THREE.SphereGeometry(1, 8, 6).scale(0.8, 1, 0.8), cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  };
  const fish = (() => { const g = new THREE.SphereGeometry(1, 12, 8); g.scale(1, 0.35, 0.28); const t = new THREE.ConeGeometry(0.35, 0.5, 4); t.rotateZ(Math.PI / 2); t.translate(-1.15, 0, 0); t.scale(1, 1, 0.3); return K.mergeGeos([g, t]); })();
  const make = (geo, mat) => () => ({ geo, mat });
  const P = {
    kamatis: make(geos.sphere, M('#d8261e', { roughness: 0.3 })), talong: make(geos.capsule, M('#4a1a5a', { roughness: 0.25 })), sibuyas: make(geos.sphere, M('#b8742a', { roughness: 0.5 })),
    repolyo: make(geos.ico, M('#8ac25a', { roughness: 0.7 })), kalabasa: make(geos.sphere, M('#e07a1a', { roughness: 0.6 })), sitaw: make(geos.cyl, M('#3a8a2a', { roughness: 0.6 })),
    mangga: make(geos.egg, M('#ffc21a', { roughness: 0.35 })), saging: make(geos.capsule, M('#ffd23a', { roughness: 0.4 })), kalamansi: make(geos.sphere, M('#5aa02a', { roughness: 0.35 })),
    lanzones: make(geos.sphere, M('#e0c888', { roughness: 0.5 })), pakwan: make(geos.egg, M('#2a6a2a', { roughness: 0.35 })), itlog: make(geos.egg, M('#e8d8c0', { roughness: 0.4 })),
    itlogPula: make(geos.egg, M('#c0503a', { roughness: 0.4 })), isda: make(fish, M('#b8c4cc', { roughness: 0.25, metalness: 0.6 })), yelo: make(new THREE.BoxGeometry(1, 1, 1), M('#e8f4ff', { roughness: 0.15, transparent: true, opacity: 0.85 })),
    tray: make(new THREE.BoxGeometry(1, 1, 1), M('#b8bcc0', { roughness: 0.3, metalness: 0.8 })), karton: make(new THREE.BoxGeometry(1, 1, 1), M('#8a6440', { roughness: 0.9 })),
    sako: make(new THREE.CylinderGeometry(0.85, 1, 1, 12), M('#c8b890', { roughness: 0.95 })), bigas: make(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), M('#f8f6ee', { roughness: 0.9 })),
    puto: make(geos.cyl, M('#fff8f0', { roughness: 0.8 })), putoPink: make(geos.cyl, M('#ff9ab8', { roughness: 0.8 })), kutsinta: make(geos.cyl, M('#8a3a14', { roughness: 0.35 })), dahon: make(new THREE.CylinderGeometry(1, 1, 0.02, 16), M('#3a8a3a', { roughness: 0.5 })),
    bilao: make(new THREE.CylinderGeometry(1, 0.92, 0.12, 20), new THREE.MeshStandardMaterial({ map: T.weave(12, '#8a5a2a').map, roughness: 0.9 })),
  };
  // heap: n items of a kind in a mound of radius rad on the stall top at (x, z)
  const heap = (kind, x, z, rad, n, sz, { flat = false, squash = 1, rot = 0 } = {}) => {
    for (let k = 0; k < n; k++) {
      const a = k * 2.399 + r() * 0.3, d = Math.sqrt((k + 0.5) / n) * rad, hgt = flat ? 0 : (1 - d / rad) * rad * 0.55;
      const s = sz * (0.85 + r() * 0.3), sc = kind === 'talong' || kind === 'saging' ? [s * 0.6, s * 0.6, s * 0.6] : kind === 'sitaw' ? [0.012, 0.28, 0.012] : [s, s * squash, s];
      inst.add(kind, P[kind], x + Math.cos(a) * d, H + 0.07 + hgt + s * 0.6 * squash, z + Math.sin(a) * d, { s: sc, ry: r() * TAU, rx: kind === 'talong' || kind === 'saging' || kind === 'sitaw' ? Math.PI / 2 + (r() - 0.5) * 0.6 : rot, rz: (r() - 0.5) * 0.4 });
    }
  };
  const bilao = (x, z, rad) => inst.add('bilao', P.bilao, x, H + 0.03, z, { s: [rad, 0.5, rad] });
  const signs = ['₱60/KILO', '₱25', 'SARIWA!', '₱120/KL', 'BAGONG HULI', '₱10 ISA', 'PAMPALASA', '₱45'];
  const signMats = signs.map((s, k) => new THREE.MeshStandardMaterial({ map: T.sign([[s, 17, 900]], k % 2 ? '#f4eedc' : '#fff4a8', '#c0182e', { w: 192, h: 96 }), roughness: 0.9 }));
  const priceSign = (x, z, k) => { const g = new THREE.Group(); g.position.set(x, H, z); g.add(mesh(new THREE.PlaneGeometry(0.34, 0.17), signMats[k % signMats.length], { y: 0.36, rx: -0.5 })); g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), postM, { y: 0.15 })); group.add(g); };
  const dress = (rc) => {
    // the usable top: inset from the aisles
    const x0 = X(rc.x0) - 0.5 + m + 0.12, x1 = X(rc.x1) + 0.5 - m - 0.12, z0 = Z(rc.y0) - 0.5 + m + 0.12, z1 = Z(rc.y1) + 0.5 - m - 0.12;
    const w = x1 - x0, d = z1 - z0, type = rc.perimeter ? (rc.y0 === 0 || rc.y1 === ROWS - 1 ? pick(['karton', 'gulay', 'prutas']) : pick(['karton', 'bigas', 'gulay'])) : TYPES[Math.floor(r() * TYPES.length)];
    rc.type = type;
    const nx = Math.max(1, Math.round(w / 0.62)), nz = Math.max(1, Math.round(d / 0.62)), sx = w / nx, sz = d / nz;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + sx * (i + 0.5), z = z0 + sz * (j + 0.5), rad = Math.min(sx, sz) * 0.4;
      if (r() < 0.12) continue;
      if (type === 'gulay') { const k = pick(['kamatis', 'talong', 'sibuyas', 'repolyo', 'kalabasa', 'sitaw', 'kamatis']); bilao(x, z, rad); if (k === 'repolyo' || k === 'kalabasa') heap(k, x, z, rad * 0.6, 4, 0.1, { squash: k === 'kalabasa' ? 0.7 : 1 }); else if (k === 'sitaw') heap('sitaw', x, z, rad * 0.5, 18, 1, { flat: true }); else heap(k, x, z, rad * 0.9, k === 'talong' ? 9 : 15, k === 'talong' ? 0.09 : 0.06); }
      else if (type === 'prutas') { const k = pick(['mangga', 'saging', 'kalamansi', 'lanzones', 'pakwan', 'mangga']); bilao(x, z, rad); if (k === 'pakwan') heap('pakwan', x, z, rad * 0.5, 3, 0.13); else heap(k, x, z, rad * 0.9, k === 'saging' ? 9 : k === 'mangga' ? 9 : 18, k === 'saging' ? 0.1 : k === 'mangga' ? 0.075 : 0.045); }
      else if (type === 'isda') { inst.add('tray', P.tray, x, H + 0.03, z, { s: [sx * 0.92, 0.05, sz * 0.92] }); inst.add('yelo', P.yelo, x, H + 0.06, z, { s: [sx * 0.85, 0.04, sz * 0.85] }); for (let k = 0; k < 5; k++) inst.add('isda', P.isda, x + (r() - 0.5) * sx * 0.6, H + 0.1, z + (k - 2) * sz * 0.16, { s: 0.1 + r() * 0.03, ry: (r() - 0.5) * 0.6, rz: 0.1 }); }
      else if (type === 'itlog') { inst.add('karton', P.karton, x, H + 0.03, z, { s: [sx * 0.9, 0.04, sz * 0.9] }); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { const red = r() < 0.4; inst.add(red ? 'itlogPula' : 'itlog', red ? P.itlogPula : P.itlog, x + (a - 1) * sx * 0.26, H + 0.11, z + (b - 1) * sz * 0.26, { s: 0.055 }); } }
      else if (type === 'bigas') { inst.add('sako', P.sako, x, H + 0.15, z, { s: [rad * 0.9, 0.3, rad * 0.9] }); inst.add('bigas', P.bigas, x, H + 0.3, z, { s: [rad * 0.75, 0.09, rad * 0.75] }); }
      else if (type === 'kakanin') { bilao(x, z, rad); inst.add('dahon', P.dahon, x, H + 0.07, z, { s: [rad * 0.9, 1, rad * 0.9] }); const k = pick(['puto', 'putoPink', 'kutsinta']); for (let q = 0; q < 7; q++) { const a = q * 0.9, dd = q ? rad * 0.5 : 0; inst.add(k, P[k], x + Math.cos(a) * dd, H + 0.1, z + Math.sin(a) * dd, { s: [0.06, 0.05, 0.06] }); } }
      else { inst.add('karton', P.karton, x, H + 0.13, z, { s: [sx * 0.8, 0.24, sz * 0.8], ry: (r() - 0.5) * 0.2 }); if (r() < 0.5) inst.add('karton', P.karton, x, H + 0.34, z, { s: [sx * 0.6, 0.18, sz * 0.6], ry: (r() - 0.5) * 0.4 }); }
    }
    if (!rc.perimeter && type !== 'karton' && r() < 0.7) priceSign(x0 + r() * w, z1 - 0.05, Math.floor(r() * 8));
    // a bulb over most stalls, on a post at its back corner
    if (!rc.perimeter && r() < 0.8) {
      const px = X(rc.x0) - 0.5 + m + 0.04, pz = Z(rc.y0) - 0.5 + m + 0.04, bx = (x0 + x1) / 2, bz = (z0 + z1) / 2, top = 1.25;
      group.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, top - H, 6), postM, { x: px, y: H + (top - H) / 2, z: pz }));
      W.wires.push(px, top, pz, bx, top + 0.02, bz);
      bulb(W, inst, bx, 1.0, bz, { cord: 0.27, shade: null, big: true, r: 1.6 + Math.min(w, d) * 0.4 });
    }
  };
  for (const rc of rects) dress(rc);
  // ---------- around the maze ----------
  // the shops along the north side, their awnings, and the permanent market hall beyond
  const shopNames = [['BIGASAN', 'Mang Juan · bigas at itlog', '#2f6fd6'], ['KARINDERYA', 'ni Aling Nena · almusal na!', '#e8384f'], ['SARI-SARI', 'load · kape · pan de sal', '#3fae5a'], ['ISDAAN', 'sariwang huli araw-araw', '#1f9a82'], ['PRUTAS', 'Tindahan ni Lola Iska', '#ff9f43'], ['PANADERYA', 'mainit na pan de sal!', '#c0182e']];
  const nz = EDGE.z0 - 2.2, sw = 4.6;
  for (let k = 0; k < 7; k++) {
    const [name, sub, col] = shopNames[k % shopNames.length], x = -3.5 * sw / 1 + k * sw + sw / 2 - 0.4;
    const t = shopTex(name, sub, col, r, { w: 4.4, h: 3.2 });
    const face = mesh(new THREE.PlaneGeometry(4.4, 3.2), new THREE.MeshStandardMaterial({ map: t.map, emissive: '#ffffff', emissiveMap: t.em, emissiveIntensity: 0.18, roughness: 0.85 }), { x, y: 1.6, z: nz });
    group.add(face);
    group.add(box(4.5, 1.6, 2.4, M(T.shade(col, 0.9), { roughness: 0.9 }), { x, y: 4.0, z: nz - 1.2 })); // the storey above
    group.add(box(4.6, 0.12, 2.6, M('#6a6a6a', { roughness: 0.6, metalness: 0.5 }), { x, y: 4.85, z: nz - 1.2 }));
    for (let wdw = 0; wdw < 2; wdw++) group.add(mesh(new THREE.PlaneGeometry(1.1, 0.8), wdw === k % 2 ? glowM('#ffcf8a', 0.9) : M('#2a3440', { roughness: 0.2, metalness: 0.4 }), { x: x - 1 + wdw * 2, y: 4.05, z: nz + 0.01 }));
    const aw = K.tarpMesh(4.4, 1.3, new THREE.MeshStandardMaterial({ map: T.stripes(k % 2 ? '#e8384f' : '#2f6fd6', '#f4f1e6', { n: 10 }), roughness: 0.8, side: THREE.DoubleSide }), { sagBy: 0.05, tilt: 0.5 });
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
      for (let q = 0; q < 6; q++) heap(pick(['kamatis', 'mangga', 'kalamansi', 'sibuyas']), cx + (r() - 0.5) * 0.8, z - 1.8 + q * 0.72, 0.28, 14, 0.045);
      const [a, b] = tarpCols[(k + (sx > 0 ? 1 : 0)) % tarpCols.length];
      const tp = K.tarpMesh(3.4, 5.2, new THREE.MeshStandardMaterial({ map: T.stripes(a, b, { n: a === b ? 2 : 8, vertical: false }), roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.96 }), { sagBy: 0.18, tilt: 0 });
      tp.position.set(cx + sx * 0.7, 2.5, z); tp.rotation.z = sx * 0.12; group.add(tp);
      for (const dz of [-2.4, 2.4]) group.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6), postM, { x: cx - sx * 1.0, y: 1.25, z: z + dz }));
      bulb(W, inst, cx - sx * 0.2, 1.9, z, { cord: 0.5, shade: '#2a2a2a', k: 0.9, r: 2.4 });
    }
    group.add(box(0.4, 3, 34, M('#8a8680', { roughness: 0.95 }), { x: sx * (EDGE.x1 + 5.2), y: 1.5, z: 0 }));
  }
  // south: the edge of the street, crates and baskets waiting to be carried in
  for (let k = 0; k < 16; k++) {
    const x = EDGE.x0 + 1 + k * 1.8 + r() * 0.5, z = EDGE.z1 + 1.1 + r() * 0.9;
    if (r() < 0.5) { inst.add('crate', () => ({ geo: new THREE.BoxGeometry(0.5, 0.3, 0.4), mat: M('#3a7ad8', { roughness: 0.6 }) }), x, 0.15, z, { ry: r() * 0.5 }); if (r() < 0.4) inst.add('crate', null, x, 0.45, z, { ry: r() * 0.5 }); }
    else { inst.add('bilaoF', P.bilao, x, 0.06, z, { s: [0.32, 0.5, 0.32] }); heap('kamatis', x, z, 0.2, 10, 0.04); }
  }
  // strings of bulbs over the walkways around the maze
  const ring = [[EDGE.x0 - 1.2, EDGE.z0 - 0.9], [EDGE.x1 + 1.2, EDGE.z0 - 0.9], [EDGE.x1 + 1.2, EDGE.z1 + 0.9], [EDGE.x0 - 1.2, EDGE.z1 + 0.9]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 4], len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 3.2);
    for (let q = 0; q < n; q++) {
      const a = new THREE.Vector3(ax + (bx - ax) * q / n, 2.3, az + (bz - az) * q / n), b = new THREE.Vector3(ax + (bx - ax) * (q + 1) / n, 2.3, az + (bz - az) * (q + 1) / n), pts = K.sag(a, b, 0.35, 6);
      wirePath(W, pts);
      inst.add('pole', () => ({ geo: new THREE.CylinderGeometry(0.04, 0.05, 2.3, 6).translate(0, 1.15, 0), mat: postM }), a.x, 0, a.z);
      for (const p of [pts[2], pts[4]]) { inst.add('bulbS', () => ({ geo: new THREE.SphereGeometry(0.06, 10, 8), mat: glowM('#ffc070', 3) }), p.x, p.y - 0.06, p.z, { cast: false }); W.practicals.push({ x: p.x, y: p.y, z: p.z, k: 0.5, r: 1.6 }); }
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
    const [ban, onion, lime, bas, crate] = await Promise.all(['bananas', 'yellow_onion', 'food_lime_01', 'wicker_basket_02', 'plastic_crate_02'].map((id) => envProp(e, id)));
    const g = new THREE.Group(), d = new THREE.Object3D();
    const place = (tpl, list) => { if (!tpl) return; tpl.updateMatrixWorld(true); tpl.traverse((p) => { if (!p.isMesh) return; const im = new THREE.InstancedMesh(p.geometry, p.material, list.length); list.forEach(([x, y, z, ry, s], i) => { d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.setScalar(s); d.updateMatrix(); im.setMatrixAt(i, d.matrix.clone().multiply(p.matrixWorld)); }); im.castShadow = list.length < 20; im.receiveShadow = true; g.add(im); }); };
    const southBaskets = [], northBananas = [], crates = [];
    for (let k = 0; k < 9; k++) southBaskets.push([EDGE.x0 + 2.5 + k * 3.1, 0, EDGE.z1 + 2.4 + (k % 2) * 0.5, k * 1.3, 1.1]);
    for (let k = 0; k < 7; k++) { const x = -14 + k * 4.6; northBananas.push([x - 0.8, 0.02, nz + 1.3, k, 1]); crates.push([x + 0.9, 0, nz + 1.2, k * 0.7, 1.2], [x + 0.9, 0.3, nz + 1.2, k * 0.7 + 0.3, 1.2]); }
    place(bas, southBaskets); place(ban, northBananas); place(crate, crates);
    const onions = [], limes = [];
    for (const rc of rects) if (!rc.perimeter && (rc.type === 'gulay' || rc.type === 'prutas') && r() < 0.35) { const list = rc.type === 'gulay' ? onions : limes; for (let q = 0; q < 4; q++) list.push([rc.cx + (r() - 0.5) * (rc.w - 0.6), H + 0.05, rc.cz + (r() - 0.5) * (rc.d - 0.6), r() * TAU, 0.9]); }
    place(onion, onions); place(lime, limes);
    W.group.add(g);
  });
  // light: the sun just up, low and gold through the haze; the bulbs still on from the night
  W.points = [...W.practicals].filter((p, i) => i % 3 === 0).slice(0, 10).map((p) => ({ x: p.x, y: p.y - 0.1, z: p.z, color: '#ffae5a', k: 2.2, dist: 4.5 }));
  W.anim.push((t) => { /* the bulbs flash for a cleared maze (the view sets W.celebrate) */ });
  // god rays: long soft shafts of the morning sun slanting across the market
  const rayM = new THREE.MeshBasicMaterial({ map: rayTex(), color: '#ffd8a0', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
  for (let k = 0; k < 5; k++) { const ray = mesh(new THREE.PlaneGeometry(3 + r() * 2, 22), rayM, { x: -6 + k * 3.8, y: 5, z: -2 + k * 1.5, rz: -1.0, ry: 0.3, cast: false, receive: false }); ray.userData.noReflect = true; ray.userData.keep = true; group.add(ray); }
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
  // the old church: its facade and bell tower to the north
  const cz = EDGE.z0 - 4.5, fac = M('#c8b898', { roughness: 0.95 }), trim = M('#e0d4bc', { roughness: 0.9 }), dark = M('#1a120c', { roughness: 0.9 });
  W.dressers.push(async (e) => { const t = await envTex(e, 'coral_stone_wall'); applySurface(fac, t, { tile: 2.2, rough: 1, tint: '#d8c8b0' }); });
  group.add(box(22, 7, 3, fac, { x: 0, y: 3.5, z: cz - 1.5 }));
  group.add(box(14, 3.2, 2.6, fac, { x: 0, y: 8.6, z: cz - 1.4 }));
  const ped = new THREE.Shape(); ped.moveTo(-5, 0); ped.lineTo(5, 0); ped.lineTo(0, 2.6); ped.closePath();
  group.add(mesh(new THREE.ExtrudeGeometry(ped, { depth: 2.4, bevelEnabled: false }), fac, { x: 0, y: 10.2, z: cz - 2.6 }));
  for (let k = -3; k <= 3; k++) group.add(box(0.6, 7, 0.4, trim, { x: k * 3.1, y: 3.5, z: cz + 0.1 }));
  group.add(box(22.4, 0.4, 0.6, trim, { x: 0, y: 7.1, z: cz + 0.05 }));
  // the doors: the middle one open, warm light and the pews inside
  const arch = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0); s.closePath(); return new THREE.ShapeGeometry(s, 16); };
  group.add(mesh(arch(2.2, 3.6), glowM('#ffb860', 1.6), { x: 0, y: 0, z: cz + 0.02, cast: false }));
  for (const sx of [-1, 1]) group.add(mesh(arch(1.5, 2.8), dark, { x: sx * 6.2, y: 0, z: cz + 0.02, cast: false }));
  for (const sx of [-1, 1]) for (const y of [4.6]) group.add(mesh(arch(1.1, 1.6), glowM('#ffa850', 0.9), { x: sx * 3.1 * 1.5, y, z: cz + 0.02, cast: false }));
  // a rose window of capiz and a big parol above the door
  group.add(mesh(new THREE.CircleGeometry(1.1, 32), capizM, { x: 0, y: 9.3, z: cz - 0.08, cast: false }));
  parol(W, inst, 0, 5.4, cz + 0.8, '#ffd23f', 2.4);
  W.practicals.push({ x: 0, y: 1, z: cz + 1.5, k: 1.6, r: 4 }); // the light spilling out of the door
  // the bell tower
  const tx = 12.5;
  for (let k = 0; k < 4; k++) { const w = 3.6 - k * 0.5; group.add(box(w, 3.2, w, fac, { x: tx, y: 1.6 + k * 3.2, z: cz - 1.4 })); group.add(box(w + 0.3, 0.25, w + 0.3, trim, { x: tx, y: 3.2 + k * 3.2, z: cz - 1.4 })); if (k >= 2) group.add(mesh(arch(0.9, 1.7), dark, { x: tx, y: 0.9 + k * 3.2, z: cz - 1.4 + w / 2 + 0.01, cast: false })); }
  group.add(mesh(new THREE.ConeGeometry(1.4, 2.6, 8), M('#6a4a3a', { roughness: 0.8 }), { x: tx, y: 14.1, z: cz - 1.4 }));
  group.add(mesh(new THREE.SphereGeometry(0.55, 14, 10), M('#8a6a2a', { metalness: 0.9, roughness: 0.35 }), { x: tx, y: 8.8, z: cz - 1.4 + 0.2 })); // the bell
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
    if (lant) for (let k = 0; k < 6; k++) { const o = lant.clone(); o.position.set((k % 2 ? 1 : -1) * (EDGE.x1 + 0.9), 0, EDGE.z0 + 3 + Math.floor(k / 2) * 10); o.traverse((q) => { if (q.isMesh) q.castShadow = true; }); g.add(o); }
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
  for (const [set, mat] of [[inner, cyan], [outer, mag]]) { const l = mesh(K.lipGeometry(set, H + 0.005, { w: 0.03, t: 0.035, out: 0.018, round: true }), mat, { cast: false }); l.userData.keep = true; group.add(l); }
  const kick = mesh(K.wallGeometry({ ...grid, tops: [] }, 0.06, { faces: true }), M('#1a1a24', { roughness: 0.3, metalness: 0.5 }), { cast: false }); kick.scale.set(1.002, 1, 1.002); kick.userData.keep = true; group.add(kick);
  // goods under the glass: boxes, bottles, plush toys, shoes, in shop colours
  const C = ['#e8384f', '#ffd23f', '#2f9bff', '#3fcf6a', '#ff7eb6', '#ff9f43', '#9a6aff', '#f4f4f4'];
  for (const rc of rects) {
    const x0 = X(rc.x0) - 0.5 + m + 0.1, x1 = X(rc.x1) + 0.5 - m - 0.1, z0 = Z(rc.y0) - 0.5 + m + 0.1, z1 = Z(rc.y1) + 0.5 - m - 0.1;
    const n = Math.max(2, Math.round((x1 - x0) * (z1 - z0) * 2.4));
    for (let k = 0; k < n; k++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), c = pick(C), kind = r();
      if (kind < 0.5) inst.add('good', () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: M('#ffffff', { roughness: 0.4 }) }), x, H + 0.07, z, { s: [0.14 + r() * 0.1, 0.12 + r() * 0.14, 0.12 + r() * 0.08], ry: r() * TAU, color: c });
      else if (kind < 0.8) inst.add('bottle', () => ({ geo: new THREE.CylinderGeometry(0.03, 0.035, 0.16, 10), mat: M('#ffffff', { roughness: 0.15 }) }), x, H + 0.08, z, { color: c });
      else inst.add('plush', () => ({ geo: new THREE.SphereGeometry(0.07, 12, 10), mat: M('#ffffff', { roughness: 0.95 }) }), x, H + 0.07, z, { color: c });
    }
    // a glowing shelf under the goods
    inst.add('shelf', () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: glowM('#5a6aa0', 0.12) }), rc.cx, H + 0.004, rc.cz, { s: [(x1 - x0) * 0.9, 0.01, (z1 - z0) * 0.9], cast: false });
    W.practicals.push({ x: rc.cx, y: H, z: rc.cz, k: 0.35 + Math.min(rc.w, rc.d) * 0.06, r: 1.1 + Math.max(rc.w, rc.d) * 0.25 });
  }
  // storefronts along the north: glass, bright insides, neon names
  const fronts = [['HABULAN MART', '#34e8ff'], ['MILK TEA', '#ff3fd0'], ['SALE 70%', '#ffd23f'], ['PAN DE SAL CO.', '#ff9f43'], ['TSINELAS HUB', '#3fcf6a'], ['LECHON HOUSE', '#ff5a5a']];
  const nz = EDGE.z0 - 2.4, fw = 5.2;
  for (let k = 0; k < 6; k++) {
    const [name, col] = fronts[k], x = -2.5 * fw + k * fw;
    group.add(box(fw - 0.3, 3.2, 0.2, M('#1a1624', { roughness: 0.5 }), { x, y: 1.6, z: nz - 1.4 }));
    group.add(mesh(new THREE.PlaneGeometry(fw - 0.5, 2.4), glowM(T.shade(col, 0.55).replace('rgb', 'rgb'), 0.5), { x, y: 1.3, z: nz - 1.28, cast: false }));
    for (const sy of [0.55, 1.15, 1.75]) { group.add(box(fw - 0.8, 0.04, 0.45, M('#d8d8e0', { roughness: 0.3 }), { x, y: sy, z: nz - 1.05 })); for (let q = 0; q < 9; q++) group.add(box(0.26, 0.2 + r() * 0.2, 0.22, M(pick(C), { roughness: 0.5 }), { x: x - 2 + q * 0.5, y: sy + 0.14, z: nz - 1.05 })); }
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
