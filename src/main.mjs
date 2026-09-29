// The page: screens, difficulty, input (keys, swipes, d-pad), the loop, sound, the best score and
// hints. Rules live in game.mjs.
import { createGame, step, steer, nextLevel, DIFFICULTY, TITAS, UP, LEFT, DOWN, RIGHT } from './game.mjs';
import { mazeFor } from './maps.mjs';
import { bot } from './bot.mjs';
import { createRenderer } from './render.mjs';
import { createAudio } from './audio.mjs';

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
const data = { best: Number(saved.best) || 0, muted: !!saved.muted, difficulty: DIFFICULTY[saved.difficulty] ? saved.difficulty : 'madali', hints: Array.isArray(saved.hints) ? saved.hints : [] };
const persist = () => store.set(data);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const seed = () => (TEST && Q.get('seed') ? Number(Q.get('seed')) : Math.floor(Math.random() * 1e9));
const buzz = (p) => { try { if (navigator.vibrate && touch) navigator.vibrate(p); } catch { /* no haptics */ } };

const $ = (id) => document.getElementById(id);
const R = createRenderer($('board'));
const A = createAudio();
A.setMuted(data.muted);

let mode = 'title', game = null, demo = createGame({ seed: seed(), difficulty: 'madali' }), levelT = 0;
const SCREENS = ['title', 'pause', 'level', 'over'];
function show(name) {
  for (const id of SCREENS) $(id).hidden = id !== name;
  $('pause-btn').hidden = name !== null;
  document.body.classList.toggle('playing', name === null);
  const first = name && ($(name).querySelector('button.primary') || $(name).querySelector('button'));
  if (first) first.focus({ preventScroll: true });
}

function start() {
  A.start();
  game = createGame({ seed: seed(), difficulty: data.difficulty });
  R.reset(); mode = 'play'; show(null); A.ready();
  hint('move', touch ? 'Swipe, or use the d-pad, to run.' : 'Run with the arrow keys or WASD.');
}

function levelUp() {
  mode = 'level';
  const next = mazeFor(game.level + 1);
  $('level-title').textContent = `Busog! Level ${game.level} tapos na.`;
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
  $('over-stats').textContent = `Level ${game.level} · ${game.maze.name} · ${game.ghostsEaten} tita ang nahuli`;
  show('over');
  A.gameOver();
}

// ---------- hints ----------
const toasts = [];
let toastBusy = false;
function toast(text, ms = 3000) { toasts.push([text, ms]); if (!toastBusy) nextToast(); }
function nextToast() {
  const el = $('toast'), item = toasts.shift();
  toastBusy = !!item;
  if (!item) { el.hidden = true; return; }
  el.textContent = item[0]; el.hidden = false;
  setTimeout(nextToast, item[1]);
}
function hint(id, text) { if (AUTOPLAY || data.hints.includes(id)) return; data.hints.push(id); persist(); toast(text); }

function onEvent(e) {
  R.event(e, game);
  switch (e.type) {
    case 'pellet': A.pellet(); break;
    case 'power': A.power(); buzz(30); hint('power', 'Tsinelas ni Nanay! Habulin mo ang mga tita habang takot sila.'); break;
    case 'ghost': A.ghost(); buzz(20); break;
    case 'fruitshow': hint('fruit', 'May prutas sa gitna! Kunin bago mawala.'); break;
    case 'fruit': A.fruit(); break;
    case 'extra': A.extra(); break;
    case 'die': A.die(); buzz([80, 40, 120]); break;
    case 'ready': A.ready(); break;
    case 'clear': A.clear(); setTimeout(() => { if (game && game.cleared) levelUp(); }, 1800); break;
    case 'gameover': setTimeout(gameOver, 600); break;
    default: break;
  }
}

function pause() { if (mode === 'play') { mode = 'pause'; show('pause'); } }
function resume() { if (mode === 'pause') { mode = 'play'; show(null); } }
function toMenu() { mode = 'title'; game = null; updateTitle(); show('title'); }

// ---------- input ----------
const KEYS = { ArrowUp: UP, w: UP, W: UP, ArrowDown: DOWN, s: DOWN, S: DOWN, ArrowLeft: LEFT, a: LEFT, A: LEFT, ArrowRight: RIGHT, d: RIGHT, D: RIGHT };
document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k in KEYS) { e.preventDefault(); if (mode === 'play' && game) steer(game, KEYS[k]); return; }
  if ((k === ' ' || k === 'Enter') && (mode === 'title' || mode === 'over') && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); start(); return; }
  if (k === 'p' || k === 'P' || k === 'Escape') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); }
  if (k === 'm' || k === 'M') toggleSound();
});
let sw = null;
const stage = $('stage');
stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sw = { x: e.clientX, y: e.clientY }; });
stage.addEventListener('pointermove', (e) => {
  if (!sw || !game || mode !== 'play') return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (Math.hypot(dx, dy) < 18) return;
  steer(game, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP));
  sw = { x: e.clientX, y: e.clientY };
});
for (const ev of ['pointerup', 'pointercancel']) stage.addEventListener(ev, () => { sw = null; });
for (const b of document.querySelectorAll('[data-dir]')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (game && mode === 'play') steer(game, Number(b.dataset.dir)); });

function toggleSound() { A.start(); data.muted = !data.muted; A.setMuted(data.muted); persist(); labels(); }
function labels() {
  for (const b of document.querySelectorAll('.sound')) { b.textContent = data.muted ? '🔇' : '🔊'; b.setAttribute('aria-label', data.muted ? 'Sound off, turn it on' : 'Sound on, turn it off'); }
  for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === data.difficulty));
  $('diff-note').textContent = { madali: 'Madali: slower titas, longer tsinelas, 5 lives.', katamtaman: 'Katamtaman: the classic chase, 3 lives.', mahirap: 'Mahirap: fast titas, short tsinelas. Para sa mga lodi.' }[data.difficulty];
}
labels();
for (const b of document.querySelectorAll('.sound')) b.onclick = toggleSound;
for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { data.difficulty = b.dataset.diff; persist(); labels(); };
$('play').onclick = start;
$('retry').onclick = start;
$('resume').onclick = resume;
$('pause-btn').onclick = pause;
for (const b of document.querySelectorAll('.menu')) b.onclick = toMenu;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function updateTitle() { $('title-best').textContent = data.best ? `Best: ${data.best}` : ''; }
updateTitle();
const cast = $('cast');
cast.replaceChildren(...TITAS.map((t) => { const li = document.createElement('li'); li.style.setProperty('--c', t.color); li.innerHTML = '<b></b> <span></span>'; li.querySelector('b').textContent = t.name; li.querySelector('span').textContent = t.how; return li; }));

// ---------- loop ----------
let last = performance.now(), t = 0, demoWait = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; t += dt;
  if (game && mode === 'play') {
    if (AUTOPLAY) steer(game, bot(game));
    for (const e of step(game, dt)) onEvent(e);
  } else if (game && mode === 'level') {
    levelT -= dt;
    if (levelT <= 0) { game = nextLevel(game); R.reset(); mode = 'play'; show(null); A.ready(); }
  } else if (!game) {
    if (!demo.over && !demo.cleared) { steer(demo, bot(demo)); for (const e of step(demo, dt)) R.event(e, demo); }
    else if ((demoWait += dt) > 2) { demoWait = 0; demo = createGame({ seed: seed(), difficulty: 'madali' }); }
  }
  const view = game || demo;
  R.draw(view, t, { reduced: reduced(), best: data.best, hudOn: true });
  A.update(view, !!game && mode === 'play');
  requestAnimationFrame(frame);
}
window.addEventListener('resize', R.resize);
R.resize();
show('title');
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && !TEST) navigator.serviceWorker.register('sw.js').catch(() => { /* online-only then */ });

if (TEST) {
  window.__hb = { get game() { return game; }, get mode() { return mode; }, start };
  if (Q.get('difficulty')) data.difficulty = Q.get('difficulty');
  if (Q.get('go') === '1') start();
}
