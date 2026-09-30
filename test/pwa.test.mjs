// The offline cache must list every file the game needs to run, or it breaks without a connection. The
// scanned surfaces, skies and props in assets/env are optional (the game paints stand-ins without them),
// so they load lazily and are cached as they arrive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const assets = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

test('every source module, the bundled three.js, the sounds and every icon are precached, and every precached file exists', () => {
  for (const f of readdirSync(new URL('../src', import.meta.url))) if (f.endsWith('.mjs')) assert.ok(assets.includes(`src/${f}`), `src/${f} missing from sw.js`);
  for (const f of readdirSync(new URL('../src/vendor', import.meta.url))) if (f.endsWith('.js')) assert.ok(assets.includes(`src/vendor/${f}`), `src/vendor/${f} missing from sw.js`);
  for (const f of readdirSync(new URL('../assets/sfx', import.meta.url))) if (f.endsWith('.mp3')) assert.ok(assets.includes(`assets/sfx/${f}`), `assets/sfx/${f} missing from sw.js`);
  const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  for (const i of manifest.icons) assert.ok(assets.includes(i.src), `${i.src} missing from sw.js`);
  for (const a of assets.filter((x) => x !== './')) assert.ok(existsSync(new URL(`../${a}`, import.meta.url)), `${a} does not exist`);
});

test('the optional environment pack indexes only files that exist', () => {
  const env = JSON.parse(readFileSync(new URL('../assets/env/env.json', import.meta.url), 'utf8'));
  for (const id of Object.keys(env.props)) assert.ok(existsSync(new URL(`../assets/env/props/${id}.glb`, import.meta.url)), id);
  for (const t of Object.values(env.tex)) for (const f of Object.values(t)) assert.ok(existsSync(new URL(`../assets/env/${f}`, import.meta.url)), f);
  for (const f of [...Object.values(env.sky), ...Object.values(env.backdrop || {})]) assert.ok(existsSync(new URL(`../assets/env/${f}`, import.meta.url)), f);
});
