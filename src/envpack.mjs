// Real surfaces for the three places: CC0 scans from Poly Haven (converted with the Bakbakan tools).
// - photographed skies that light and reflect everything (and are seen behind the intro shots)
// - scanned floors and walls: a wet-market concrete floor, glazed counter tiles, coral stone, cobbles,
//   polished granite, worn planks
// - real props: baskets, crates, fruit and vegetables on the stalls, lanterns, plants
// Each loads on its own; until it does (or if it never does) the painted stand-in stays.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-mocap.min.js';
import { HDRLoader } from './vendor/three-fx.min.js';

export async function loadEnv(base = 'assets/env/') {
  const res = await fetch(base + 'env.json');
  if (!res.ok) throw new Error('no env');
  return { base, index: await res.json(), props: new Map(), tex: new Map(), sky: new Map(), back: new Map() };
}

const gltf = new GLTFLoader(), texLoader = new THREE.TextureLoader();
export function envProp(env, id) {
  if (!env || !env.index.props[id]) return Promise.resolve(null);
  if (!env.props.has(id)) env.props.set(id, gltf.loadAsync(env.base + 'props/' + id + '.glb').then((g) => g.scene).catch(() => null));
  return env.props.get(id);
}
export function envTex(env, id) {
  const t = env && env.index.tex[id];
  if (!t) return Promise.resolve(null);
  if (!env.tex.has(id)) env.tex.set(id, Promise.all(['diff', 'nor', 'arm'].map((k) => (t[k] ? texLoader.loadAsync(env.base + t[k]).catch(() => null) : null))).then(([diff, nor, arm]) => {
    if (!diff) return null;
    diff.colorSpace = THREE.SRGBColorSpace;
    for (const x of [diff, nor, arm]) if (x) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; }
    return { diff, nor, arm };
  }));
  return env.tex.get(id);
}
export function envSky(env, id, pmrem) {
  if (!env || !env.index.sky[id]) return Promise.resolve(null);
  if (!env.sky.has(id)) env.sky.set(id, new HDRLoader().loadAsync(env.base + env.index.sky[id]).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; const rt = pmrem.fromEquirectangular(t); t.dispose(); return rt.texture; }).catch(() => null));
  return env.sky.get(id);
}
export function envBackdrop(env, id) {
  if (!env || !env.index.backdrop || !env.index.backdrop[id]) return Promise.resolve(null);
  if (!env.back.has(id)) env.back.set(id, texLoader.loadAsync(env.base + env.index.backdrop[id]).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }).catch(() => null));
  return env.back.get(id);
}
// Put a scanned surface on a material, tiling every `tile` metres (world-space UVs, as the kit makes them).
export function applySurface(m, t, { tile = 2, rough = 1, tint = '#ffffff', normal = 1, keepColor = false } = {}) {
  if (!t || !t.diff) return;
  const rep = 1 / tile, use = (x) => { if (!x) return null; const c = x.clone(); c.repeat.set(rep, rep); c.needsUpdate = true; return c; };
  m.map = use(t.diff); m.normalMap = use(t.nor); if (m.normalMap) m.normalScale = new THREE.Vector2(normal, normal);
  if (t.arm) { m.roughnessMap = use(t.arm); m.aoMap = null; m.metalnessMap = null; }
  m.roughness = rough; if (!keepColor) m.color.set(tint);
  m.needsUpdate = true;
}
