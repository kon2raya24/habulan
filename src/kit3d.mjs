// The building kit for the three places: the maze's walls made from its tile grid (counters, stone walls
// or kiosks, with a readable lip along every aisle), the rectangles they break into for dressing, a floor
// that knows where the walls, the puddles and the pools of light are, instanced props, merged statics,
// and small things every place uses (poles, wires with bulbs, signs, tarps).
import * as THREE from './vendor/three.module.min.js';
import { COLS, ROWS } from './maps.mjs';
import * as T from './tex.mjs';

export const TAU = Math.PI * 2;
export const X = (x) => x - (COLS - 1) / 2, Z = (y) => y - (ROWS - 1) / 2; // tile centre to world
export const HOUSE_BOX = { x0: 10, x1: 17, y0: 12, y1: 16 }; // the titas' house walls, built by each place itself

export function isWallTile(maze, x, y) { return (maze.rows[y]?.[x] ?? ' ') === '#'; }
export function isHouse(x, y) { return x >= HOUSE_BOX.x0 && x <= HOUSE_BOX.x1 && y >= HOUSE_BOX.y0 && y <= HOUSE_BOX.y1; }

export function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (s !== null) { if (Array.isArray(s)) m.scale.set(...s); else m.scale.setScalar(s); }
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
export const box = (w, h, d, mat, o = {}) => mesh(new THREE.BoxGeometry(w, h, d), mat, o);

// ---------- the walls ----------
// Each wall tile is split 3 × 3: the middle is always solid, the edge bands only where the neighbour is a
// wall too, so every aisle is inset by `m` on both sides and inner corners come out clean.
export function wallGrid(maze, m, { skip = isHouse } = {}) {
  const kw = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && isWallTile(maze, x, y) && !skip(x, y);
  const GX = COLS * 3, GY = ROWS * 3, solid = new Uint8Array(GX * GY);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!kw(x, y)) continue;
    const n = [kw(x - 1, y), kw(x + 1, y), kw(x, y - 1), kw(x, y + 1)];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      let on = true;
      if (i === 0 && !n[0]) on = false; if (i === 2 && !n[1]) on = false; if (j === 0 && !n[2]) on = false; if (j === 2 && !n[3]) on = false;
      if (i !== 1 && j !== 1 && on) on = kw(x + (i ? 1 : -1), y + (j ? 1 : -1));
      solid[(y * 3 + j) * GX + x * 3 + i] = on ? 1 : 0;
    }
  }
  // the world edges of sub-cell k along an axis (tile k/3, band k%3)
  const edge = (k, off) => { const t = Math.floor(k / 3), b = k % 3; return (b === 0 ? 0 : b === 1 ? m : 1 - m) + t - off; };
  const ex = (k) => edge(k, (COLS - 1) / 2 + 0.5), ez = (k) => edge(k, (ROWS - 1) / 2 + 0.5);
  const S = (gx, gy) => gx >= 0 && gy >= 0 && gx < GX && gy < GY && solid[gy * GX + gx] === 1;
  // runs of exposed edges: [axis, from, to, at, outward]
  const runs = [];
  for (let gy = 0; gy < GY; gy++) for (const dy of [-1, 1]) {
    let a = -1;
    for (let gx = 0; gx <= GX; gx++) {
      const on = gx < GX && S(gx, gy) && !S(gx, gy + dy);
      if (on && a < 0) a = gx;
      if (!on && a >= 0) { runs.push({ ax: 'x', a: ex(a), b: ex(gx), at: dy < 0 ? ez(gy) : ez(gy + 1), n: dy }); a = -1; }
    }
  }
  for (let gx = 0; gx < GX; gx++) for (const dx of [-1, 1]) {
    let a = -1;
    for (let gy = 0; gy <= GY; gy++) {
      const on = gy < GY && S(gx, gy) && !S(gx + dx, gy);
      if (on && a < 0) a = gy;
      if (!on && a >= 0) { runs.push({ ax: 'z', a: ez(a), b: ez(gy), at: dx < 0 ? ex(gx) : ex(gx + 1), n: dx }); a = -1; }
    }
  }
  // the top: runs of solid sub-cells along x
  const tops = [];
  for (let gy = 0; gy < GY; gy++) { let a = -1; for (let gx = 0; gx <= GX; gx++) { const on = gx < GX && S(gx, gy); if (on && a < 0) a = gx; if (!on && a >= 0) { tops.push([ex(a), ex(gx), ez(gy), ez(gy + 1)]); a = -1; } } }
  // convex corners (for posts and caps): where an x run and a z run end at the same point
  const corners = [];
  const key = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`, ends = new Map();
  for (const r of runs) for (const p of r.ax === 'x' ? [[r.a, r.at], [r.b, r.at]] : [[r.at, r.a], [r.at, r.b]]) { const k = key(p[0], p[1]); ends.set(k, (ends.get(k) || 0) + 1); }
  for (const [k, n] of ends) if (n >= 2) { const [x, z] = k.split(',').map(Number); corners.push({ x, z }); }
  return { runs, tops, corners, kw };
}

// The solid walls as one geometry: tops at height h, and faces down to the floor along every exposed run.
export function wallGeometry(grid, h, { uvScale = 1, faces = true, tops = true } = {}) {
  const pos = [], nor = [], uv = [];
  const quad = (a, b, c, d, n, ua, ub, uc, ud) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let k = 0; k < 6; k++) nor.push(...n); uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud); };
  if (tops) for (const [x0, x1, z0, z1] of grid.tops) quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], [0, 1, 0], [x0 * uvScale, -z0 * uvScale], [x0 * uvScale, -z1 * uvScale], [x1 * uvScale, -z1 * uvScale], [x1 * uvScale, -z0 * uvScale]);
  if (faces) for (const r of grid.runs) {
    const u0 = r.a * uvScale, u1 = r.b * uvScale, v0 = 0, v1 = h * uvScale;
    if (r.ax === 'x') { const z = r.at, n = [0, 0, r.n]; if (r.n > 0) quad([r.a, 0, z], [r.b, 0, z], [r.b, h, z], [r.a, h, z], n, [u0, v0], [u1, v0], [u1, v1], [u0, v1]); else quad([r.b, 0, z], [r.a, 0, z], [r.a, h, z], [r.b, h, z], n, [u1, v0], [u0, v0], [u0, v1], [u1, v1]); }
    else { const x = r.at, n = [r.n, 0, 0]; if (r.n > 0) quad([x, 0, r.b], [x, 0, r.a], [x, h, r.a], [x, h, r.b], n, [u1, v0], [u0, v0], [u0, v1], [u1, v1]); else quad([x, 0, r.a], [x, 0, r.b], [x, h, r.b], [x, h, r.a], n, [u0, v0], [u1, v0], [u1, v1], [u0, v1]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// A lip along the top of every exposed run: boxes that overlap at the corners (w wide, t thick, standing out by `out`).
export function lipGeometry(grid, h, { w = 0.07, t = 0.05, out = 0.02, round = false } = {}) {
  const parts = [];
  for (const r of grid.runs) {
    const len = r.b - r.a + w, c = (r.a + r.b) / 2, off = r.n * (out - w / 2 + w / 2);
    let g;
    if (round) { g = new THREE.CylinderGeometry(t / 2, t / 2, len, 8, 1); g.rotateZ(Math.PI / 2); } else g = new THREE.BoxGeometry(len, t, w);
    if (r.ax === 'z') g.rotateY(Math.PI / 2);
    g.translate(r.ax === 'x' ? c : r.at + off, h + (round ? 0 : t / 2 - 0.01), r.ax === 'x' ? r.at + off : c);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  return mergeGeos(parts);
}

// Greedy rectangles over the wall tiles, for dressing: { x0, y0, x1, y1 } inclusive, in tiles, and in the world.
export function wallRects(maze, skip = isHouse) {
  const used = new Uint8Array(COLS * ROWS), out = [];
  const ok = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && isWallTile(maze, x, y) && !skip(x, y) && !used[y * COLS + x];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!ok(x, y)) continue;
    let x1 = x; while (ok(x1 + 1, y)) x1++;
    let y1 = y; while ([...Array(x1 - x + 1).keys()].every((k) => ok(x + k, y1 + 1))) y1++;
    for (let j = y; j <= y1; j++) for (let i = x; i <= x1; i++) used[j * COLS + i] = 1;
    const perimeter = y === 0 || y1 === ROWS - 1 || x === 0 || x1 === COLS - 1;
    out.push({ x0: x, y0: y, x1, y1, w: x1 - x + 1, d: y1 - y + 1, cx: (X(x) + X(x1)) / 2, cz: (Z(y) + Z(y1)) / 2, perimeter });
  }
  return out;
}

export function mergeGeos(list0) {
  const list = list0.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let at = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, at * 2);
    at += c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// Merge every static mesh under root that shares a material into one, so a whole place costs a few dozen draws.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.userData.keep) return;
    const key = `${o.material.uuid}:${o.castShadow}:${o.receiveShadow}:${!!o.userData.noReflect}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geo = mergeGeos(list.map((m) => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld)));
    const merged = new THREE.Mesh(geo, list[0].material);
    merged.castShadow = list[0].castShadow; merged.receiveShadow = list[0].receiveShadow; merged.userData.noReflect = list[0].userData.noReflect;
    for (const m of list) m.parent.remove(m);
    root.add(merged);
  }
}

// ---------- instancing: many copies of one thing, one draw ----------
// only the bigger things cast shadows; produce, candles and goods are grounded by the occlusion pass
const CASTS = /^(crate|karton|sako|pole|lamppost|bench|planter|pot|tray)/;
export function instancer() {
  const sets = new Map(), d = new THREE.Object3D();
  return {
    add(key, make, x, y, z, { ry = 0, rx = 0, rz = 0, s = 1, color = null } = {}) {
      if (!sets.has(key)) sets.set(key, { make, list: [] });
      sets.get(key).list.push([x, y, z, rx, ry, rz, s, color]);
    },
    build(group, { cast = true } = {}) {
      for (const [key, { make, list }] of sets) {
        const { geo, mat } = make();
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, y, z, rx, ry, rz, s, color], i) => {
          d.position.set(x, y, z); d.rotation.set(rx, ry, rz); if (Array.isArray(s)) d.scale.set(...s); else d.scale.setScalar(s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
          if (color) im.setColorAt(i, new THREE.Color(color));
        });
        im.castShadow = cast && CASTS.test(key); im.receiveShadow = true; im.name = key;
        group.add(im);
      }
    },
  };
}

// ---------- the floor ----------
// One big plane. A mask painted in maze space says where the walls stand (a soft contact shadow), where
// it's wet (glossier, darker, reflecting) and where the practical lights pool; the material reads it.
export function floorMask(maze, { pad = 10, px = 16, wet = 0.5, seed = 1, pools = [], dryNearWalls = false } = {}) {
  const W = (COLS + pad * 2) * px, H = (ROWS + pad * 2) * px, cv = T.canvas(W, H), x = cv.getContext('2d');
  const r = T.rng(seed), n = T.fbm(128, 128, 22, 4, r), n2 = T.noise(128, 128, 6, r);
  const img = x.createImageData(W, H), d = img.data;
  // wall occupancy, blurred, for the contact shadow
  const occ = new Float32Array(W * H);
  for (let y = 0; y < ROWS; y++) for (let xx = 0; xx < COLS; xx++) if (isWallTile(maze, xx, y)) for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) occ[((y + pad) * px + j) * W + (xx + pad) * px + i] = 1;
  const blur = (src, rad) => { const out = new Float32Array(src.length), tmp = new Float32Array(src.length); for (let j = 0; j < H; j++) { let s = 0; for (let i = -rad; i < W + rad; i++) { if (i + rad < W) s += src[j * W + i + rad] || 0; if (i - rad - 1 >= 0) s -= src[j * W + i - rad - 1]; if (i >= 0 && i < W) tmp[j * W + i] = s / (rad * 2 + 1); } } for (let i = 0; i < W; i++) { let s = 0; for (let j = -rad; j < H + rad; j++) { if (j + rad < H) s += tmp[(j + rad) * W + i] || 0; if (j - rad - 1 >= 0) s -= tmp[(j - rad - 1) * W + i]; if (j >= 0 && j < H) out[j * W + i] = s / (rad * 2 + 1); } } return out; };
  const ao = blur(blur(occ, Math.round(px * 0.3)), Math.round(px * 0.2));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = (j * W + i) * 4, u = ((i / W) * 128) | 0, v = ((j / H) * 128) | 0;
    const a = ao[j * W + i] * (1 - occ[j * W + i]);
    let w = T.clamp((n[v * 128 + u] - (1 - wet)) * 3.2 + (n2[v * 128 + u] - 0.5) * 0.4, 0, 1);
    if (dryNearWalls) w *= 1 - a;
    d[p] = 255 * (1 - T.clamp(a * 1.3, 0, 0.75)); d[p + 1] = 255 * w; d[p + 2] = 0; d[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // pools of light, painted into blue
  x.globalCompositeOperation = 'lighter';
  for (const q of pools) {
    const cx = (q.x + (COLS - 1) / 2 + 0.5 + pad) * px, cz = (q.z + (ROWS - 1) / 2 + 0.5 + pad) * px, rr = (q.r || 2.2) * px, g = x.createRadialGradient(cx, cz, 0, cx, cz, rr);
    const k = q.k ?? 1; g.addColorStop(0, `rgba(0,0,${200 * k | 0},1)`); g.addColorStop(0.4, `rgba(0,0,${90 * k | 0},1)`); g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g; x.fillRect(cx - rr, cz - rr, rr * 2, rr * 2);
  }
  x.globalCompositeOperation = 'source-over';
  const t = T.toTex(cv, { color: false }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4;
  return { tex: t, x0: X(0) - 0.5 - pad, z0: Z(0) - 0.5 - pad, w: COLS + pad * 2, h: ROWS + pad * 2 };
}

// The floor's material: a scanned (or painted) surface, darkened at the foot of the walls, glossy and
// mirror-bright where wet, with pools of light where the bulbs hang. `mirror` is filled in by the view.
export function floorMaterial(base, mask, { wetRough = 0.12, wetDark = 0.72, poolColor = '#ffb060', poolK = 1, reflect = 0.8 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, ...base });
  const U = {
    maskMap: { value: mask.tex }, maskBox: { value: new THREE.Vector4(mask.x0, mask.z0, mask.w, mask.h) },
    wetRough: { value: wetRough }, wetDark: { value: wetDark }, poolColor: { value: new THREE.Color(poolColor).multiplyScalar(poolK) },
    mirrorMap: { value: null }, mirrorMatrix: { value: new THREE.Matrix4() }, mirrorOn: { value: 0 }, reflectK: { value: reflect }, poolPulse: { value: 1 },
  };
  m.userData.floorU = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform mat4 mirrorMatrix; varying vec3 vWorldP; varying vec4 vMirror;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vec4 wpF = modelMatrix * vec4(transformed, 1.0); vWorldP = wpF.xyz; vMirror = mirrorMatrix * wpF;');
    sh.fragmentShader = 'uniform sampler2D maskMap, mirrorMap; uniform vec4 maskBox; uniform float wetRough, wetDark, mirrorOn, reflectK, poolPulse; uniform vec3 poolColor; varying vec3 vWorldP; varying vec4 vMirror;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  vec3 fMask = texture2D(maskMap, (vWorldP.xz - maskBox.xy) / maskBox.zw).rgb;\n  diffuseColor.rgb *= fMask.r * mix(1.0, wetDark, fMask.g);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, wetRough, fMask.g);')
      .replace('#include <opaque_fragment>', `
  if (mirrorOn > 0.5) {
    vec2 wob = normal.xy * 0.035;
    vec4 mp = vMirror; mp.xy += wob * mp.w;
    vec3 refl = texture2DProj(mirrorMap, mp).rgb * 0.5 + texture2DProj(mirrorMap, mp + vec4(0.006 * mp.w, 0.0, 0.0, 0.0)).rgb * 0.25 + texture2DProj(mirrorMap, mp - vec4(0.006 * mp.w, 0.0, 0.0, 0.0)).rgb * 0.25;
    float fres = 0.35 + 0.65 * pow(1.0 - max(dot(normalize(vViewPosition), normal), 0.0), 3.0);
    float k = reflectK * mix(0.18, 1.0, fMask.g) * (1.0 - roughnessFactor * 0.6) * fres * fMask.r;
    outgoingLight = mix(outgoingLight, refl, clamp(k, 0.0, 0.85));
  }
  outgoingLight += poolColor * fMask.b * poolPulse * mix(0.6, 1.2, fMask.g) * diffuseColor.rgb * 1.6;
  #include <opaque_fragment>`);
  };
  return m;
}

// ---------- small things ----------
// a catenary between two points, as points along it
export function sag(a, b, drop, n = 12) {
  const out = [];
  for (let k = 0; k <= n; k++) { const f = k / n; out.push(new THREE.Vector3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * drop, a.z + (b.z - a.z) * f)); }
  return out;
}
// a painted board with lettering
export function signMesh(lines, bg, fg, w, h, o = {}) {
  const tex = T.sign(lines, bg, fg, { w: Math.round(w * 256), h: Math.round(h * 256), border: o.border || null });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, emissive: o.glow ? '#ffffff' : '#000000', emissiveMap: o.glow ? tex : null, emissiveIntensity: o.glow || 0 });
  return mesh(new THREE.PlaneGeometry(w, h), m, o);
}
// a tarp: a sagging sheet between four corners at height h, sloping by `tilt` along its depth
export function tarpMesh(w, d, mat, { sagBy = 0.12, tilt = 0 } = {}) {
  const g = new THREE.PlaneGeometry(w, d, 10, 6); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / w + 0.5, z = p.getZ(i) / d + 0.5; p.setY(i, -Math.sin(x * Math.PI) * sagBy * (0.4 + Math.sin(z * Math.PI) * 0.6) - z * tilt); }
  g.computeVertexNormals();
  const m = mesh(g, mat, { cast: true, receive: true });
  return m;
}
