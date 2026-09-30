// Procedural textures for the 3D palengke, painted into canvases at load time: the titas' floral
// dusters, pan de sal crust, glazed stall tiles, concrete, coral stone, cobbles, granite, tarps,
// woven bilao, capiz and signs. Each can carry a normal map made from its own heights. No image files:
// the scanned surfaces in envpack.mjs replace some of these once they load.
import * as THREE from './vendor/three.module.min.js';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export function rng(seed) { let s = (seed >>> 0) % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
export const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const shade = (c, k) => { const [r, g, b] = hex(c); const f = (v) => clamp(Math.round(v * k), 0, 255); return `rgb(${f(r)},${f(g)},${f(b)})`; };

// Smooth value noise on a wrapping lattice, so every texture tiles.
export function noise(w, h, cell, r) {
  const gw = Math.max(1, Math.round(w / cell)), gh = Math.max(1, Math.round(h / cell)), grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const out = new Float32Array(w * h), s = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const gy = (y / h) * gh, y0 = Math.floor(gy) % gh, y1 = (y0 + 1) % gh, fy = s(gy - Math.floor(gy));
    for (let x = 0; x < w; x++) {
      const gx = (x / w) * gw, x0 = Math.floor(gx) % gw, x1 = (x0 + 1) % gw, fx = s(gx - Math.floor(gx));
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x1], c = grid[y1 * gw + x0], d = grid[y1 * gw + x1];
      out[y * w + x] = lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
    }
  }
  return out;
}
export function fbm(w, h, cell, octaves, r) {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) { const n = noise(w, h, Math.max(1, cell / 2 ** o), r); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function toTex(c, { repeat = null, color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// A normal map from a height field: the slope in x and y, packed into RGB.
export function normalMap(hgt, w, h, strength = 2, opts = {}) {
  const c = canvas(w, h), x = c.getContext('2d'), img = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const l = hgt[j * w + ((i - 1 + w) % w)], rr = hgt[j * w + ((i + 1) % w)], u = hgt[((j - 1 + h) % h) * w + i], d = hgt[((j + 1) % h) * w + i];
    let nx = (l - rr) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const p = (j * w + i) * 4;
    img.data[p] = (nx * 0.5 + 0.5) * 255; img.data[p + 1] = (ny * 0.5 + 0.5) * 255; img.data[p + 2] = (nz * 0.5 + 0.5) * 255; img.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return toTex(c, { ...opts, color: false });
}
// Paint pixels from a function of (x, y) giving [r, g, b] (0-255) and optionally a height and a roughness (0-1).
export function paint(w, h, fn, { repeat = null, strength = 0, rough = false } = {}) {
  const c = canvas(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), hgt = strength ? new Float32Array(w * h) : null;
  const rc = rough ? canvas(w, h) : null, rx = rc && rc.getContext('2d'), rimg = rx && rx.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = fn(i, j), p = (j * w + i) * 4;
    img.data[p] = clamp(v[0], 0, 255); img.data[p + 1] = clamp(v[1], 0, 255); img.data[p + 2] = clamp(v[2], 0, 255); img.data[p + 3] = 255;
    if (hgt) hgt[j * w + i] = v[3] ?? 0;
    if (rimg) { const q = clamp((v[4] ?? 0.8) * 255, 0, 255); rimg.data[p] = 255; rimg.data[p + 1] = q; rimg.data[p + 2] = 0; rimg.data[p + 3] = 255; } // roughness in green, as three.js reads it
  }
  x.putImageData(img, 0, 0);
  if (rx) rx.putImageData(rimg, 0, 0);
  return { map: toTex(c, { repeat }), normalMap: hgt ? normalMap(hgt, w, h, strength, { repeat }) : null, roughnessMap: rc ? toTex(rc, { repeat, color: false }) : null, canvas: c };
}

// ---------- the characters ----------
// A duster (the house dress every tita wears to the palengke): a colour, a big floral print, a hem band.
export function floral(color, seed = 1, { size = 256 } = {}) {
  const cv = canvas(size, size), x = cv.getContext('2d'), r = rng(seed), [cr, cg, cb] = hex(color);
  x.fillStyle = color; x.fillRect(0, 0, size, size);
  const light = `rgba(${Math.min(255, cr + 120)},${Math.min(255, cg + 120)},${Math.min(255, cb + 120)},0.95)`, deep = `rgb(${cr * 0.55 | 0},${cg * 0.55 | 0},${cb * 0.55 | 0})`;
  const flower = (fx, fy, s, rot) => {
    for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [-size, 0], [0, -size]]) {
      x.save(); x.translate(fx + ox, fy + oy); x.rotate(rot);
      x.fillStyle = 'rgba(40,120,60,0.8)';
      for (const a of [0.6, 2.4, 4.2]) { x.save(); x.rotate(a); x.beginPath(); x.ellipse(s * 1.3, 0, s * 0.8, s * 0.3, 0, 0, Math.PI * 2); x.fill(); x.restore(); } // leaves
      x.fillStyle = light;
      for (let k = 0; k < 5; k++) { x.save(); x.rotate((k / 5) * Math.PI * 2); x.beginPath(); x.ellipse(s * 0.55, 0, s * 0.55, s * 0.34, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
      x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(0, 0, s * 0.26, 0, Math.PI * 2); x.fill();
      x.fillStyle = deep; x.beginPath(); x.arc(0, 0, s * 0.1, 0, Math.PI * 2); x.fill();
      x.restore();
    }
  };
  for (let k = 0; k < 14; k++) flower(r() * size, r() * size, size * (0.05 + r() * 0.04), r() * 6);
  for (let k = 0; k < 40; k++) { x.fillStyle = light; x.beginPath(); x.arc(r() * size, r() * size, size * 0.008, 0, Math.PI * 2); x.fill(); } // little dots between
  return toTex(cv, { repeat: [2, 1] });
}
// Hair: glossy strands running down.
export function hair(seed = 3, size = 128) {
  const r = rng(seed), clump = noise(size, size, 12, r), strand = new Float32Array(size);
  for (let i = 0; i < size; i++) strand[i] = r();
  return paint(size, size, (x, y) => {
    const s = strand[(x + Math.round(clump[y * size + x] * 6)) % size], v = 150 + s * 90 + (clump[y * size + x] - 0.5) * 50;
    return [v, v, v, s * 0.8];
  }, { repeat: [3, 1], strength: 4 });
}
// Pan de sal: a golden crust rolled in breadcrumbs, darker where it baked against its neighbours.
export function crust(seed = 5, size = 128) {
  const r = rng(seed), crumb = noise(size, size, 2, r), big = noise(size, size, 24, r);
  return paint(size, size, (x, y) => {
    const i = y * size + x, c = crumb[i] > 0.62 ? (crumb[i] - 0.62) * 2.6 : 0, v = 0.82 + (big[i] - 0.5) * 0.3 + c * 0.35;
    return [214 * v, 142 * v, 72 * v, crumb[i] * 0.8 + c, 0.75 - c * 0.2];
  }, { repeat: [2, 1], strength: 3, rough: true });
}

// ---------- surfaces ----------
// Glazed wall tiles with grout, the kind every wet-market counter is clad in.
export function tiles(seed, color = '#e8efe8', { size = 256, n = 8, grout = '#9aa39a' } = {}) {
  const r = rng(seed), [cr, cg, cb] = hex(color), [gr, gg, gb] = hex(grout), dirt = fbm(size, size, 64, 3, r), cell = size / n, tone = new Float32Array(n * n);
  for (let i = 0; i < tone.length; i++) tone[i] = 0.93 + r() * 0.1;
  return paint(size, size, (x, y) => {
    const gx = x % cell, gy = y % cell, g = gx < 2 || gy < 2, d = dirt[y * size + x];
    if (g) return [gr * (0.9 - d * 0.2), gg * (0.9 - d * 0.2), gb * (0.9 - d * 0.2), -1, 0.9];
    const k = tone[((y / cell) | 0) * n + ((x / cell) | 0)] * (1 - Math.max(0, d - 0.55) * 0.5), bev = Math.min(gx - 2, gy - 2, cell - gx, cell - gy) < 3 ? -0.3 : 0;
    return [cr * k, cg * k, cb * k, bev, 0.18 + Math.max(0, d - 0.5) * 0.5];
  }, { repeat: [1, 1], strength: 2, rough: true });
}
export function concrete(seed, color = '#8a8680', { size = 256, repeat = [4, 4] } = {}) {
  const r = rng(seed), [cr, cg, cb] = hex(color), big = fbm(size, size, 96, 4, r), grain = noise(size, size, 2, r), stain = fbm(size, size, 48, 3, r);
  return paint(size, size, (x, y) => {
    const i = y * size + x, s = Math.max(0, stain[i] - 0.52) * 1.6, k = 1 - (big[i] - 0.5) * 0.22 - (grain[i] - 0.5) * 0.08 - s * 0.5;
    return [cr * k, cg * k, cb * k * 0.98, grain[i] * 0.4 + big[i] * 0.3, 0.85 - s * 0.9];
  }, { repeat, strength: 2, rough: true });
}
// Coral stone blocks with mortar, for the old church's walls.
export function stoneBlocks(seed, { size = 256, color = '#b8a88c' } = {}) {
  const r = rng(seed), [cr, cg, cb] = hex(color), n = noise(size, size, 5, r), big = fbm(size, size, 64, 3, r), rows = 5, rh = size / rows;
  const offs = Array.from({ length: rows }, () => r() * size), widths = Array.from({ length: rows }, () => size / (2 + Math.floor(r() * 2)));
  return paint(size, size, (x, y) => {
    const row = (y / rh) | 0, bw = widths[row], lx = (x + offs[row]) % bw, ly = y % rh, edge = Math.min(lx, bw - lx, ly, rh - ly), mortar = edge < 2.5;
    const pit = n[y * size + x] > 0.7 ? (n[y * size + x] - 0.7) * 3 : 0, k = (0.85 + big[y * size + x] * 0.3) * (1 - pit * 0.35);
    if (mortar) return [cr * 0.7, cg * 0.68, cb * 0.62, -1, 0.95];
    return [cr * k, cg * k, cb * k, Math.min(1, edge / 6) - pit, 0.9];
  }, { repeat: [1, 1], strength: 4, rough: true });
}
export function cobbles(seed, { size = 256, color = '#6a6258' } = {}) {
  const r = rng(seed), [cr, cg, cb] = hex(color), n = noise(size, size, 3, r), big = fbm(size, size, 64, 3, r), cell = size / 8, tone = Array.from({ length: 64 }, () => 0.8 + r() * 0.35);
  return paint(size, size, (x, y) => {
    const row = (y / cell) | 0, ox = (row % 2) * cell / 2, cx = (x + ox) % size, lx = cx % cell, ly = y % cell, e = Math.min(lx, cell - lx, ly, cell - ly);
    const k = tone[(row * 8 + ((cx / cell) | 0)) % 64] * (0.9 + (big[y * size + x] - 0.5) * 0.3 + (n[y * size + x] - 0.5) * 0.1);
    if (e < 2) return [30, 28, 26, -1, 0.95];
    return [cr * k, cg * k, cb * k, Math.min(1, e / 7), 0.62 + (n[y * size + x] - 0.5) * 0.3];
  }, { repeat: [1, 1], strength: 3, rough: true });
}
// Polished granite tiles for the mall.
export function granite(seed, { size = 256, color = '#34363c' } = {}) {
  const r = rng(seed), [cr, cg, cb] = hex(color), speck = noise(size, size, 1.5, r), cloud = fbm(size, size, 48, 3, r), cell = size / 2;
  return paint(size, size, (x, y) => {
    const g = x % cell < 1.5 || y % cell < 1.5, s = speck[y * size + x], k = 0.85 + (cloud[y * size + x] - 0.5) * 0.3 + (s > 0.8 ? 0.6 : s < 0.15 ? -0.3 : 0);
    if (g) return [cr * 0.5, cg * 0.5, cb * 0.5, -1, 0.5];
    return [cr * k, cg * k, cb * k, 0, 0.08 + (cloud[y * size + x] - 0.5) * 0.08];
  }, { repeat: [1, 1], strength: 1.5, rough: true });
}
export function planks(seed, { size = 256, color = '#a8743e' } = {}) {
  const r = rng(seed), [cr, cg, cb] = hex(color), grain = fbm(size, size, 64, 3, r), tone = Array.from({ length: 8 }, () => 0.8 + r() * 0.3);
  return paint(size, size, (x, y) => {
    const row = (y / (size / 4)) | 0, seam = y % (size / 4) < 2, i = y * size + x, g = Math.sin((y * 0.9 + grain[i] * 40) * 0.6) * 0.5 + 0.5, k = tone[row] * (0.88 + g * 0.14) * (seam ? 0.5 : 1);
    return [cr * k, cg * k, cb * k, seam ? -1 : g * 0.2, 0.75];
  }, { repeat: [1, 1], strength: 3, rough: true });
}
// A woven bamboo bilao or bayong.
export function weave(seed = 12, color = '#c49658') {
  const r = rng(seed), f = noise(128, 128, 3, r), [cr, cg, cb] = hex(color);
  return paint(128, 128, (x, y) => {
    const over = ((x >> 3) + (y >> 3)) % 2, band = over ? Math.sin(((x % 8) / 8) * Math.PI) : Math.sin(((y % 8) / 8) * Math.PI), k = 0.6 + band * 0.45 + (f[y * 128 + x] - 0.5) * 0.12;
    return [cr * k, cg * k, cb * k, band, 0.8];
  }, { repeat: [3, 3], strength: 4 });
}
// Stripes for a tarp or an awning.
export function stripes(a, b, { n = 6, size = 128, vertical = true } = {}) {
  const cv = canvas(size, size), x = cv.getContext('2d');
  for (let k = 0; k < n; k++) { x.fillStyle = k % 2 ? b : a; if (vertical) x.fillRect((k * size) / n, 0, size / n + 1, size); else x.fillRect(0, (k * size) / n, size, size / n + 1); }
  const r = rng(n * 7), d = noise(64, 64, 8, r);
  x.globalCompositeOperation = 'multiply';
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { const v = 1 - d[j * 64 + i] * 0.18; x.fillStyle = `rgb(${255 * v | 0},${250 * v | 0},${244 * v | 0})`; x.fillRect((i * size) / 64, (j * size) / 64, size / 64 + 1, size / 64 + 1); }
  x.globalCompositeOperation = 'source-over';
  return toTex(cv, { repeat: [1, 1] });
}
// Capiz: little squares of translucent shell in a wooden lattice, glowing from behind.
export function capiz(seed = 9, { size = 128, n = 5 } = {}) {
  const r = rng(seed), cv = canvas(size, size), x = cv.getContext('2d'), c = size / n;
  x.fillStyle = '#5a3a1e'; x.fillRect(0, 0, size, size);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const g = x.createRadialGradient(i * c + c / 2, j * c + c / 2, 1, i * c + c / 2, j * c + c / 2, c * 0.7);
    const w = 225 + r() * 30; g.addColorStop(0, `rgb(${w},${w - 8},${w - 30})`); g.addColorStop(1, `rgb(${w - 40},${w - 55},${w - 90})`);
    x.fillStyle = g; x.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
  }
  return toTex(cv);
}
// Lettering on a board, drawn crisp and a little weathered.
export function sign(lines, bg, fg, { w = 512, h = 128, border = null, font = '"Barlow Condensed", "Baloo 2", system-ui, sans-serif', italic = true, grime = true } = {}) {
  const cv = canvas(w, h), x = cv.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, shade(bg, 1.08)); gr.addColorStop(1, shade(bg, 0.88)); x.fillStyle = gr; x.fillRect(0, 0, w, h);
  if (border) { x.strokeStyle = border; x.lineWidth = h * 0.06; x.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach(([text, size, weight = 800], k) => { x.font = `${italic ? 'italic ' : ''}${weight} ${size * (h / 32)}px ${font}`; x.fillText(text, w / 2, h * (lines.length === 1 ? 0.54 : 0.3 + k * (0.42 / Math.max(1, lines.length - 1)) * (lines.length > 2 ? 1 : 1)), w * 0.92); });
  if (grime) {
    const r = rng(w + h + lines.length), n = noise(64, 16, 4, r);
    x.globalCompositeOperation = 'multiply';
    for (let j = 0; j < 16; j++) for (let i = 0; i < 64; i++) { const v = 1 - n[j * 64 + i] * 0.14; x.fillStyle = `rgb(${255 * v | 0},${250 * v | 0},${240 * v | 0})`; x.fillRect((i * w) / 64, (j * h) / 16, w / 64 + 1, h / 16 + 1); }
    x.globalCompositeOperation = 'source-over';
  }
  return toTex(cv);
}
// Glowing neon letters on black, for the mall (used as an emissive map).
export function neon(text, color, { w = 512, h = 128, font = '"Barlow Condensed", system-ui, sans-serif' } = {}) {
  const cv = canvas(w, h), x = cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `italic 900 ${h * 0.62}px ${font}`;
  x.shadowColor = color; x.shadowBlur = h * 0.18; x.fillStyle = color; x.fillText(text, w / 2, h * 0.54, w * 0.9);
  x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.85; x.font = `italic 900 ${h * 0.6}px ${font}`; x.fillText(text, w / 2, h * 0.54, w * 0.9);
  return toTex(cv);
}
// A soft round glow (for sprites and light pools).
export function glow(inner = 'rgba(255,255,255,1)', { size = 128 } = {}) {
  const cv = canvas(size, size), x = cv.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, inner.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return toTex(cv);
}
// A five-point star, for the dizzy stars and the parol's shape.
export function starShape(r0 = 1, r1 = 0.45) {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? r1 : r0; if (k) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  s.closePath();
  return s;
}
