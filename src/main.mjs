// The page: screens, difficulty, settings, input (keys, swipes, the d-pad, a controller), the loop,
// sound, the best score and hints. The rules live in game.mjs; the 3D palengke in view3d.mjs. If WebGL
// can't start, the old 2D board (render.mjs) plays the same game.
import { createGame, step, steer, nextLevel, DIFFICULTY, TITAS, FRUITS, UP, LEFT, DOWN, RIGHT } from './game.mjs';
import { mazeFor } from './maps.mjs';
import { bot } from './bot.mjs';
import { createRenderer } from './render.mjs';
import { createAudio } from './audio.mjs';
import { THEME_OF } from './world3d.mjs';

const Q = new URLSearchParams(location.search);
const TEST = Q.get('test') === '1';
const AUTOPLAY = TEST && Q.get('autoplay') === '1';
const KEY = 'habulan.v1';
const store = {
  get() { if (TEST) return null; try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(v) { if (TEST) return; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable: play on */ } },
};
const touch = matchMedia('(pointer: coarse)').matches;
const saved = store.get() || {};
// the v1 save (best, muted, difficulty, hints) carries over; the settings are new
const data = {
  best: Number(saved.best) || 0, muted: !!saved.muted, difficulty: DIFFICULTY[saved.difficulty] ? saved.difficulty : 'madali', hints: Array.isArray(saved.hints) ? saved.hints : [],
  opt: { music: 0.7, sfx: 1, cam: 'follow', calm: false, gfx: 'auto', ...(saved.opt || {}) },
};
const persist = () => store.set(data);
const reduced = () => data.opt.calm || matchMedia('(prefers-reduced-motion: reduce)').matches;
const seed = () => (TEST && Q.get('seed') ? Number(Q.get('seed')) : Math.floor(Math.random() * 1e9));
const buzz = (p) => { try { if (navigator.vibrate && touch) navigator.vibrate(p); } catch { /* no haptics */ } };
const $ = (id) => document.getElementById(id);
const FRUIT_ICON = { saging: '🍌', mangga: '🥭', lanzones: '🍇', balut: '🥚', bibingka: '🥮', lechon: '🐖' };

const A = createAudio();
A.setMuted(data.muted); A.setMix(data.opt);
let V = null, flat = false; // the view: 3D, or the 2D board

let eatenAll = 0, mode = 'title', game = null, demo = createGame({ seed: seed(), difficulty: 'madali' }), levelT = 0, introT = 0, introDur = 3;
const SCREENS = ['title', 'pause', 'level', 'over', 'settings'];
function show(name) {
  for (const id of SCREENS) $(id).hidden = id !== name;
  const playing = name === null;
  document.body.classList.toggle('playing', playing);
  $('hud').hidden = !(playing || name === 'pause' || name === 'level');
  $('pause-wrap').hidden = !playing;
  if (name) { $('toast').hidden = true; toastT = 0; }
  const first = name && ($(name).querySelector('button.primary') || $(name).querySelector('button'));
  if (first) first.focus({ preventScroll: true });
}

function start() {
  A.start();
  eatenAll = 0;
  game = createGame({ seed: seed(), difficulty: data.difficulty, level: TEST && Q.get('level') ? Number(Q.get('level')) : 1 });
  if (V.reset) V.reset();
  beginLevel(true);
  hint('move', touch ? 'Swipe, or use the d-pad, to run.' : 'Run with the arrow keys or WASD.');
}
// each maze opens on a flyover while its name slides in (tap or any key skips it)
function beginLevel(first = false) {
  A.setPlace(THEME_OF[game.maze.name]);
  show(null);
  if (flat) { mode = 'play'; A.ready(); return; }
  mode = 'intro'; introT = 0; introDur = first ? 3.2 : 2.6;
  const card = $('intro-card');
  card.querySelector('small').textContent = `LEVEL ${game.level}`;
  card.querySelector('b').textContent = game.maze.name;
  card.querySelector('span').textContent = game.maze.blurb;
  card.hidden = false; card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
  A.whoosh();
}
function endIntro() {
  if (mode !== 'intro') return;
  $('intro-card').hidden = true;
  mode = 'play'; A.ready();
  toast('Handa na!', '', 1100);
}

function levelUp() {
  mode = 'level';
  const next = mazeFor(game.level + 1);
  $('level-title').textContent = `LEVEL ${game.level} · TAPOS NA`;
  $('level-next').textContent = `Susunod: Level ${game.level + 1} · ${next.name}`;
  $('level-blurb').textContent = next.blurb;
  show('level');
  levelT = 2.4;
}

function gameOver() {
  mode = 'over';
  const isBest = game.score > data.best;
  data.best = Math.max(data.best, game.score); persist();
  $('over-score').textContent = game.score;
  $('over-best').textContent = isBest && game.score ? 'Bagong best! New best!' : `Best: ${data.best}`;
  $('over-best').classList.toggle('new', isBest && game.score > 0);
  const st = [[game.level, 'Level'], [game.maze.name, 'Huling lugar'], [game.ghostsEaten, 'Titang nahuli'], [eatenAll, 'Pan de sal']];
  $('over-stats').replaceChildren(...st.map(([v, l]) => { const d = document.createElement('div'); d.innerHTML = '<b></b><small></small>'; d.querySelector('b').textContent = v; d.querySelector('small').textContent = l; return d; }));
  show('over');
  A.gameOver();
}

// ---------- toasts and hints ----------
let toastT = 0;
const tips = [];
function toast(big, small = '', ms = 1500, tip = false) {
  const el = $('toast');
  el.innerHTML = '<b></b><span></span>';
  el.querySelector('b').textContent = big; el.querySelector('span').textContent = small;
  el.classList.toggle('tip', tip);
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  toastT = ms / 1000;
}
function hint(id, text) { if (AUTOPLAY || data.hints.includes(id)) return; data.hints.push(id); persist(); tips.push(text); }

function onEvent(e) {
  V.event(e, game);
  switch (e.type) {
    case 'pellet': A.pellet(); eatenAll++; break;
    case 'power': A.power(); buzz(30); hint('power', 'Tsinelas ni Nanay! Habulin mo ang mga tita habang takot sila.'); break;
    case 'ghost': A.ghost(); buzz(20); if (e.chain >= 4) toast('Lahat sila!', `+${e.points}`, 1200); break;
    case 'fruitshow': hint('fruit', 'May prutas sa gitna! Kunin bago mawala.'); break;
    case 'fruit': A.fruit(); toast(FRUITS.find((f) => f.id === e.fruit).name + '!', `+${e.points}`, 1000); break;
    case 'extra': A.extra(); toast('Extra buhay!', 'Dagdag na buhay', 1400); break;
    case 'die': A.die(); buzz([80, 40, 120]); break;
    case 'ready': A.ready(); toast('Handa na!', '', 1000); break;
    case 'clear': A.clear(); toast('Busog!', `Level ${game.level} tapos na`, 1700); setTimeout(() => { if (game && game.cleared && mode === 'play') levelUp(); }, 1800); break;
    case 'gameover': setTimeout(gameOver, 900); break;
    default: break;
  }
}

function pause() { if (mode === 'play' || mode === 'intro') { if (mode === 'intro') endIntro(); mode = 'pause'; show('pause'); } }
function resume() { if (mode === 'pause') { mode = 'play'; show(null); } }
function toMenu() { mode = 'title'; game = null; updateTitle(); show('title'); }

// ---------- input ----------
const KEYS = { ArrowUp: UP, w: UP, W: UP, ArrowDown: DOWN, s: DOWN, S: DOWN, ArrowLeft: LEFT, a: LEFT, A: LEFT, ArrowRight: RIGHT, d: RIGHT, D: RIGHT };
document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (mode === 'intro' && !e.repeat) endIntro();
  if (k in KEYS) { e.preventDefault(); if (mode === 'play' && game) steer(game, KEYS[k]); return; }
  if ((k === ' ' || k === 'Enter') && (mode === 'title' || mode === 'over') && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); start(); return; }
  if (k === 'p' || k === 'P' || k === 'Escape') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); else if (mode === 'settings') $('settings-ok').click(); }
  if (k === 'm' || k === 'M') toggleSound();
  if ((k === 'c' || k === 'C') && !flat) { data.opt.cam = data.opt.cam === 'full' ? 'follow' : 'full'; persist(); if (mode === 'play') toast(data.opt.cam === 'full' ? 'Buong maze' : 'Sundan', 'Camera', 800); }
});
let sw = null;
const stage = $('stage');
stage.addEventListener('pointerdown', (e) => { if (mode === 'intro' && !e.target.closest('button')) endIntro(); if (e.pointerType !== 'mouse') sw = { x: e.clientX, y: e.clientY }; });
stage.addEventListener('pointermove', (e) => {
  if (!sw || !game || mode !== 'play') return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (Math.hypot(dx, dy) < 18) return;
  steer(game, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP));
  sw = { x: e.clientX, y: e.clientY };
});
for (const ev of ['pointerup', 'pointercancel']) stage.addEventListener(ev, () => { sw = null; });
for (const b of document.querySelectorAll('[data-dir]')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'intro') endIntro(); if (game && mode === 'play') steer(game, Number(b.dataset.dir)); });
// a controller: the d-pad or left stick runs, Options pauses, ✕ starts; in menus the d-pad moves between buttons
const padHeld = {};
function readPad(dt) {
  const p = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (!p) return;
  const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed), ax = p.axes || [];
  const edge = (k, on) => { const was = padHeld[k]; padHeld[k] = on; return on && !was; };
  const dir = b(12) || ax[1] < -0.5 ? UP : b(13) || ax[1] > 0.5 ? DOWN : b(14) || ax[0] < -0.5 ? LEFT : b(15) || ax[0] > 0.5 ? RIGHT : -1;
  if (mode === 'intro' && (edge('x', b(0)) || dir >= 0)) endIntro();
  if (mode === 'play' && game && dir >= 0) steer(game, dir);
  if (edge('opt', b(9))) { if (mode === 'play') pause(); else if (mode === 'pause') resume(); }
  const screen = SCREENS.find((id) => !$(id).hidden);
  if (!screen || mode === 'play') { padHeld.x = b(0); return; }
  padHeld.rep = (padHeld.rep || 0) - dt;
  if (dir >= 0 && (edge('dir' + dir, true) || padHeld.rep <= 0)) {
    padHeld.rep = 0.22;
    const items = [...$(screen).querySelectorAll('button, input[type=range]')].filter((el) => el.offsetParent !== null), at = items.indexOf(document.activeElement);
    const a = document.activeElement;
    if (a && a.type === 'range' && (dir === LEFT || dir === RIGHT)) { a.value = String(+a.value + (dir === RIGHT ? 1 : -1) * +a.step); a.dispatchEvent(new Event('input')); }
    else if (items.length) items[(at + (dir === UP || dir === LEFT ? -1 : 1) + items.length) % items.length].focus();
  }
  for (const d of [0, 1, 2, 3]) if (d !== dir) padHeld['dir' + d] = false;
  if (edge('x', b(0)) && document.activeElement && $(screen).contains(document.activeElement)) document.activeElement.click();
  if (edge('o', b(1))) { if (screen === 'settings') $('settings-ok').click(); else if (screen === 'pause') resume(); }
}
window.addEventListener('gamepadconnected', () => toast('🎮 Controller', 'D-pad o stick: takbo · ✕: laro · Options: hinto', 2600, true));

function toggleSound() { A.start(); data.muted = !data.muted; A.setMuted(data.muted); persist(); labels(); }
function labels() {
  for (const b of document.querySelectorAll('.sound')) { b.textContent = data.muted ? '🔇' : '🔊'; b.setAttribute('aria-label', data.muted ? 'Sound off, turn it on' : 'Sound on, turn it off'); }
  for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === data.difficulty));
  $('diff-note').textContent = { madali: 'Madali: slower titas, longer tsinelas, 5 lives.', katamtaman: 'Katamtaman: the classic chase, 3 lives.', mahirap: 'Mahirap: fast titas, short tsinelas. Para sa mga lodi.' }[data.difficulty];
}
labels();
for (const b of document.querySelectorAll('.sound')) b.onclick = toggleSound;
for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { data.difficulty = b.dataset.diff; persist(); labels(); A.ui(); };
$('play').onclick = start;
$('retry').onclick = start;
$('resume').onclick = resume;
$('pause-btn').onclick = pause;
for (const b of document.querySelectorAll('.menu')) b.onclick = toMenu;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function updateTitle() { $('title-best').textContent = data.best ? `Best: ${data.best}` : ''; }
updateTitle();
$('cast').replaceChildren(...TITAS.map((t) => { const li = document.createElement('li'); li.style.setProperty('--c', t.color); li.innerHTML = '<b></b> <span></span>'; li.querySelector('b').textContent = t.name; li.querySelector('span').textContent = t.how; return li; }));

// ---------- settings ----------
let settingsFrom = 'title';
function openSettings(from) {
  settingsFrom = from; mode = 'settings';
  const o = data.opt, f = document.activeElement, again = f && f.dataset && f.dataset.k ? `[data-k="${f.dataset.k}"]${f.dataset.v !== undefined ? `[data-v="${f.dataset.v}"]` : ''}` : null;
  const seg = (key, list) => `<div class="modes">${list.map(([v, label]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${String(o[key]) === String(v)}">${label}</button>`).join('')}</div>`;
  const slider = (key, label) => `<label class="slide">${label} <input type="range" min="0" max="1" step="0.05" value="${o[key]}" data-k="${key}"></label>`;
  $('settings-body').innerHTML = `
    <div class="grp"><h3>Camera</h3>
    <p class="muted">Tanaw · View</p>${seg('cam', [['follow', 'Sundan · Follow'], ['full', 'Buong maze · Whole']])}
    <p class="muted">Yanig at kislap · Shake and flashes</p>${seg('calm', [[false, 'Buo · Full'], [true, 'Kalmado · Calm']])}
    </div><div class="grp"><h3>Tunog · Sound</h3>
    ${slider('music', 'Musika · Music')}${slider('sfx', 'Tunog · Effects')}
    </div><div class="grp"><h3>Itsura · Graphics</h3>
    ${seg('gfx', [['auto', 'Auto'], [2, 'Mataas'], [1, 'Katamtaman'], [0, 'Mababa']])}
    <p class="muted">Auto steps down by itself on a slow device.</p></div>`;
  for (const b of $('settings-body').querySelectorAll('button')) b.onclick = () => {
    const k = b.dataset.k, raw = b.dataset.v, v = raw === 'true' ? true : raw === 'false' ? false : isNaN(+raw) ? raw : +raw;
    o[k] = v;
    if (k === 'gfx' && V && V.post) { V.post.setAuto(v === 'auto'); V.post.setLevel(v === 'auto' ? (touch ? 1 : 2) : v); }
    A.ui(); persist(); openSettings(settingsFrom);
  };
  for (const r of $('settings-body').querySelectorAll('input[type=range]')) r.oninput = () => { o[r.dataset.k] = +r.value; A.start(); A.setMix(o); persist(); };
  show('settings');
  const back = again && $('settings-body').querySelector(again);
  if (back) back.focus({ preventScroll: true });
}
$('settings-ok').onclick = () => { if (settingsFrom === 'pause') { mode = 'pause'; show('pause'); } else { mode = 'title'; show('title'); } };
for (const b of document.querySelectorAll('.settings-btn')) b.onclick = () => openSettings(mode === 'pause' ? 'pause' : 'title');

// ---------- the HUD ----------
const hudLast = {};
function hud(g) {
  const set = (k, v, f) => { if (hudLast[k] !== v) { hudLast[k] = v; f(v); } };
  set('score', g.score, (v) => { $('score').textContent = v; });
  set('best', Math.max(data.best, g.score), (v) => { $('best').textContent = v; });
  set('lvl', g.level, (v) => { $('lvl').textContent = `LEVEL ${v}`; });
  set('place', g.maze.name, (v) => { $('place').textContent = v.toUpperCase(); });
  set('lives', g.lives, (v) => { $('lives').replaceChildren(...Array.from({ length: Math.max(0, Math.min(6, v - 1)) }, () => document.createElement('i'))); });
  set('fruits', g.level, (v) => { $('fruits').replaceChildren(...Array.from({ length: Math.min(v, 6) }, (_, k) => { const s = document.createElement('span'); s.textContent = FRUIT_ICON[FRUITS[Math.min(FRUITS.length - 1, v - 1 - k)].id]; return s; })); });
  const fr = g.frightT > 0 && mode === 'play';
  $('fright').hidden = !fr || flat; $('fright-label').hidden = !fr || flat;
  if (fr) { $('fright').querySelector('i').style.transform = `scaleX(${(g.frightT / Math.max(0.01, g.frightMax)).toFixed(3)})`; $('fright').classList.toggle('ending', g.frightT < 2); }
}

// ---------- loop ----------
let last = performance.now(), t = 0, demoWait = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; t += dt;
  readPad(dt);
  if (game && mode === 'play') {
    if (AUTOPLAY) steer(game, bot(game));
    for (const e of step(game, dt)) onEvent(e);
  } else if (game && mode === 'intro') {
    introT += dt;
    if (introT >= introDur) endIntro();
  } else if (game && mode === 'level') {
    levelT -= dt;
    if (levelT <= 0) { game = nextLevel(game); if (V.reset) V.reset(); beginLevel(); }
  } else if (!game) {
    if (!demo.over && !demo.cleared) { steer(demo, bot(demo)); for (const e of step(demo, dt)) V.event(e, demo); }
    else if ((demoWait += dt) > 2) { demoWait = 0; demo = createGame({ seed: seed(), difficulty: 'madali' }); }
  }
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').hidden = true;
  if (toastT <= 0 && tips.length && mode === 'play') toast('Tip', tips.shift(), 3000, true);
  const view = game || demo;
  if (game) hud(game);
  V.frame(view, dt, { mode: !game ? 'title' : mode === 'settings' ? 'pause' : mode, introK: introT / introDur, reduced: reduced(), calm: data.opt.calm, camMode: data.opt.cam, touch, best: data.best, t });
  A.update(view, !!game && mode === 'play');
  requestAnimationFrame(frame);
}

// the 2D board, as it always was, when there's no WebGL
function flatView() {
  flat = true;
  document.body.classList.add('flat');
  $('view').hidden = true; $('board').hidden = false;
  const R = createRenderer($('board'));
  window.addEventListener('resize', R.resize); R.resize();
  let tt = 0;
  return { flat: true, event: R.event, reset: R.reset, frame(g, dt, o) { tt += dt; R.draw(g, tt, { reduced: o.reduced, best: data.best, hudOn: true }); } };
}

async function boot() {
  // the canvas lettering needs the webfonts
  try { await Promise.race([Promise.all([document.fonts.load('900 italic 40px "Barlow Condensed"'), document.fonts.load('800 20px "Baloo 2"')]), new Promise((r) => setTimeout(r, 1500))]); } catch { /* system fonts, then */ }
  const want = Q.get('gfx') ?? (data.opt.gfx === 'auto' ? null : String(data.opt.gfx));
  try {
    if (Q.get('flat') === '1') throw new Error('flat');
    const { createView } = await import('./view3d.mjs');
    V = createView($('view'), { low: touch, gfx: want });
    V.frame(demo, 0, { mode: 'title', reduced: reduced() });
    window.addEventListener('resize', () => V.resize());
    new ResizeObserver(() => V.resize()).observe($('view'));
    // the scanned surfaces, skies and props load in the background; a bar shows how far along
    const bar = $('loading'), pct = $('load-pct');
    const { loadEnv } = await import('./envpack.mjs');
    const THREE = await import('./vendor/three.module.min.js');
    const shown = (f) => { bar.hidden = false; pct.textContent = `${Math.round(f * 100)}%`; bar.style.setProperty('--p', `${Math.round(f * 100)}%`); };
    const done = () => { bar.classList.add('done'); setTimeout(() => { bar.hidden = true; }, 700); };
    THREE.DefaultLoadingManager.onProgress = (url, n, total) => shown(Math.min(0.99, n / Math.max(total, 1)));
    loadEnv(Q.get('env') || 'assets/env/').then((e) => { shown(0.05); return V.setEnv(e); }).then(done).catch(done);
  } catch (err) {
    if (TEST && String(err && err.message) !== 'flat') console.warn('3D view failed, using the 2D board:', err);
    V = flatView();
  }
  $('curtain').classList.add('off');
  show('title');
  requestAnimationFrame(frame);
  if (TEST) {
    window.__hb = { get game() { return game; }, get mode() { return mode; }, start, view: V, skip: endIntro, opt: data.opt };
    if (Q.get('difficulty')) data.difficulty = Q.get('difficulty');
    if (Q.get('go') === '1') start();
  }
}
boot();
if ('serviceWorker' in navigator && !TEST) navigator.serviceWorker.register('sw.js').catch(() => { /* online-only then */ });
