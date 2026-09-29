// The rules: a pure step function. The bata eats pan de sal in a maze while four tsismosa titas
// chase him; Nanay's tsinelas turns the chase around. Returns events (pellet, power, ghost, fruit,
// fruitshow, die, extra, clear, gameover, frightend, mode). Rendering and audio only read the state.
import { rng } from './rng.mjs';
import { COLS, ROWS, START, DOOR, HOUSE, FRUIT, TUNNEL_ROW, mazeFor } from './maps.mjs';

export const UP = 0, LEFT = 1, DOWN = 2, RIGHT = 3;
export const DX = [0, -1, 0, 1], DY = [-1, 0, 1, 0];
const REVERSE = [DOWN, RIGHT, UP, LEFT];

// Each tita chases in her own way (the classic four personalities).
export const TITAS = [
  { id: 'baby', name: 'Tita Baby', color: '#e8384f', corner: { x: 25, y: -3 }, how: 'Sinusundan ka mismo.' },
  { id: 'lorna', name: 'Tita Lorna', color: '#ff7eb6', corner: { x: 2, y: -3 }, how: 'Inaabangan ka sa unahan.' },
  { id: 'chona', name: 'Tita Chona', color: '#3fc6d8', corner: { x: 27, y: ROWS }, how: 'Kasabwat ni Tita Baby.' },
  { id: 'marites', name: 'Tita Marites', color: '#ffa630', corner: { x: 0, y: ROWS }, how: 'Lumalapit, tapos umiiwas.' },
];
export const FRUITS = [
  { id: 'saging', name: 'Saging', points: 100 }, { id: 'mangga', name: 'Mangga', points: 300 },
  { id: 'lanzones', name: 'Lanzones', points: 500 }, { id: 'balut', name: 'Balut', points: 700 },
  { id: 'bibingka', name: 'Bibingka', points: 1000 }, { id: 'lechon', name: 'Lechon', points: 2000 },
];
export const DIFFICULTY = {
  madali: { name: 'Madali', lives: 5, ghost: 0.85, fright: 1.5 },
  katamtaman: { name: 'Katamtaman', lives: 3, ghost: 0.93, fright: 1.15 },
  mahirap: { name: 'Mahirap', lives: 3, ghost: 1.02, fright: 0.7 },
};
export const PELLET = 10, POWER = 50, EXTRA_LIFE = 10000;
const WAVES = [7, 20, 7, 20, 5, 20, 5, Infinity]; // scatter, chase, scatter, ...
const RELEASE = [0, 1, 4, 7]; // seconds before each tita leaves the house
const DEATH_TIME = 1.6, EAT_PAUSE = 0.45, READY_TIME = 1.2;

export function createGame({ seed = 1, level = 1, score = 0, lives, difficulty = 'katamtaman' } = {}) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.katamtaman;
  const maze = mazeFor(level);
  const pellets = new Uint8Array(COLS * ROWS);
  let left = 0;
  maze.rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.' || c === 'o') { pellets[y * COLS + x] = c === 'o' ? 2 : 1; left++; } }));
  const g = {
    seed, rand: rng(seed * 7919 + level), level, maze, difficulty, diff, pellets, left, total: left, eaten: 0,
    score, lives: lives ?? diff.lives, nextExtra: Math.ceil((score + 1) / EXTRA_LIFE) * EXTRA_LIFE,
    t: 0, pause: READY_TIME, ready: true, over: false, cleared: false, frightT: 0, frightMax: 0, chain: 0,
    wave: 0, waveT: WAVES[0], scatter: true, fruit: null, fruitsShown: 0, ghostsEaten: 0, deaths: 0,
    player: null, ghosts: [], dying: 0,
  };
  resetPositions(g);
  return g;
}

export const nextLevel = (g) => createGame({ seed: g.seed, level: g.level + 1, score: g.score, lives: g.lives, difficulty: g.difficulty });

function resetPositions(g) {
  g.player = { tx: START.x, ty: START.y, p: 0, dir: LEFT, next: LEFT, moving: true, mouth: 0 };
  g.ghosts = TITAS.map((t, i) => (i === 0
    ? { ...ghostBase(t, i), tx: DOOR.x, ty: DOOR.y, mode: 'active', dir: LEFT }
    : { ...ghostBase(t, i), hx: HOUSE[i - 1].x, hy: HOUSE[i - 1].y, mode: 'house', release: RELEASE[i] / (1 + (g.level - 1) * 0.15), dir: i === 2 ? DOWN : UP }));
  g.frightT = 0; g.chain = 0;
}
const ghostBase = (t, i) => ({ id: t.id, i, tx: 0, ty: 0, p: 0, hx: 0, hy: 0, fright: false, release: 0 });

// ---------- the maze ----------
const wrap = (x) => ((x % COLS) + COLS) % COLS;
export function tile(g, x, y) {
  if (y === TUNNEL_ROW) x = wrap(x);
  return g.maze.rows[y]?.[x] ?? '#';
}
const openFor = (g, x, y, ghostDoor = false) => { const c = tile(g, x, y); return c === '.' || c === 'o' || c === ' ' || (ghostDoor && c === '-'); };
export const posOf = (e) => ({ x: e.tx + DX[e.dir] * e.p, y: e.ty + DY[e.dir] * e.p });

// ---------- speeds (tiles per second) ----------
function speeds(g) {
  const l = g.level - 1;
  return {
    player: Math.min(9.4, 7.6 + l * 0.22),
    ghost: Math.min(9.6, 7.1 + l * 0.32) * g.diff.ghost,
    fright: 4.6, tunnel: 3.6, eyes: 14, house: 2.5,
  };
}
const frightTime = (g) => Math.max(1.2, 7 - (g.level - 1) * 0.8) * g.diff.fright;

// ---------- the bata ----------
export function steer(g, dir) { g.player.next = dir; }

function movePlayer(g, dt, ev) {
  const pl = g.player;
  let d = speeds(g).player * (g.frightT > 0 ? 1.08 : 1) * dt;
  // reversing is allowed any time
  if (pl.next === REVERSE[pl.dir] && pl.p > 0) {
    pl.tx += DX[pl.dir]; pl.ty += DY[pl.dir]; pl.tx = pl.ty === TUNNEL_ROW ? wrap(pl.tx) : pl.tx;
    pl.p = 1 - pl.p; pl.dir = pl.next;
  }
  while (d > 1e-9) {
    if (pl.p === 0) {
      eat(g, pl.tx, pl.ty, ev);
      if (g.cleared) return;
      if (openFor(g, pl.tx + DX[pl.next], pl.ty + DY[pl.next])) pl.dir = pl.next;
      if (!openFor(g, pl.tx + DX[pl.dir], pl.ty + DY[pl.dir])) { pl.moving = false; return; }
    }
    pl.moving = true;
    const step = Math.min(d, 1 - pl.p);
    pl.p += step; d -= step;
    pl.mouth += step;
    if (pl.p >= 1 - 1e-9) { pl.p = 0; pl.tx += DX[pl.dir]; pl.ty += DY[pl.dir]; if (pl.ty === TUNNEL_ROW) pl.tx = wrap(pl.tx); }
  }
}

function eat(g, x, y, ev) {
  const k = y * COLS + x, v = g.pellets[k];
  if (v) {
    g.pellets[k] = 0; g.left--; g.eaten++;
    if (v === 2) {
      addScore(g, POWER, ev);
      g.frightMax = g.frightT = frightTime(g);
      g.chain = 0;
      for (const gh of g.ghosts) if (gh.mode !== 'eyes') { gh.fright = true; if (gh.mode === 'active') reverse(gh); }
      ev.push({ type: 'power', x, y });
    } else { addScore(g, PELLET, ev); ev.push({ type: 'pellet', x, y }); }
    if (g.eaten === 70 || g.eaten === 170) {
      const f = FRUITS[Math.min(FRUITS.length - 1, g.level - 1 + (g.eaten === 170 ? 1 : 0))];
      g.fruit = { ...f, t: 9.5 };
      g.fruitsShown++;
      ev.push({ type: 'fruitshow', fruit: f.id });
    }
    if (g.left === 0) { g.cleared = true; g.pause = 2.2; ev.push({ type: 'clear', level: g.level }); }
  }
  if (g.fruit && x === FRUIT.x && y === FRUIT.y) {
    addScore(g, g.fruit.points, ev);
    ev.push({ type: 'fruit', fruit: g.fruit.id, points: g.fruit.points, x, y });
    g.fruit = null;
  }
}

function addScore(g, n, ev) {
  g.score += n;
  if (g.score >= g.nextExtra) { g.lives++; g.nextExtra += EXTRA_LIFE; ev.push({ type: 'extra' }); }
}

// ---------- the titas ----------
function reverse(gh) {
  if (gh.p > 0) { gh.tx += DX[gh.dir]; gh.ty += DY[gh.dir]; gh.tx = gh.ty === TUNNEL_ROW ? wrap(gh.tx) : gh.tx; gh.p = 1 - gh.p; }
  gh.dir = REVERSE[gh.dir];
}

export function targetOf(g, gh) {
  const t = TITAS[gh.i], pl = g.player;
  if (gh.mode === 'eyes') return DOOR;
  if (g.scatter) return t.corner;
  const ahead = (n) => ({ x: pl.tx + DX[pl.dir] * n, y: pl.ty + DY[pl.dir] * n });
  switch (t.id) {
    case 'baby': return { x: pl.tx, y: pl.ty };
    case 'lorna': return ahead(4);
    case 'chona': { const a = ahead(2), b = g.ghosts[0]; return { x: 2 * a.x - b.tx, y: 2 * a.y - b.ty }; }
    default: return (pl.tx - gh.tx) ** 2 + (pl.ty - gh.ty) ** 2 > 64 ? { x: pl.tx, y: pl.ty } : t.corner;
  }
}

// At a tile centre: never reverse; frightened titas pick at random; otherwise the exit closest to the target.
function chooseDir(g, gh) {
  const opts = [UP, LEFT, DOWN, RIGHT].filter((d) => d !== REVERSE[gh.dir] && openFor(g, gh.tx + DX[d], gh.ty + DY[d], gh.mode === 'eyes'));
  if (!opts.length) return REVERSE[gh.dir];
  if (gh.fright && gh.mode === 'active') return opts[Math.floor(g.rand() * opts.length)];
  const tg = targetOf(g, gh);
  let best = opts[0], bd = Infinity;
  for (const d of opts) {
    const nx = gh.tx + DX[d], ny = gh.ty + DY[d], dd = (nx - tg.x) ** 2 + (ny - tg.y) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

function moveGhost(g, gh, dt, ev) {
  const sp = speeds(g);
  if (gh.mode === 'house') {
    gh.release -= dt;
    gh.hy = HOUSE[gh.i - 1]?.y ?? 14;
    gh.bob = (gh.bob || 0) + dt;
    if (gh.release <= 0) gh.mode = 'leaving';
    return;
  }
  if (gh.mode === 'leaving' || gh.mode === 'entering') {
    // straight lines inside the house: to the middle, then up through the door (or down into the house)
    const step = sp.house * dt * (gh.mode === 'entering' ? 4 : 1);
    const tx = DOOR.x, homeY = 14;
    if (gh.mode === 'leaving') {
      if (Math.abs(gh.hx - tx) > 1e-6) gh.hx += Math.sign(tx - gh.hx) * Math.min(step, Math.abs(tx - gh.hx));
      else if (gh.hy > DOOR.y) gh.hy = Math.max(DOOR.y, gh.hy - step);
      else { gh.mode = 'active'; gh.tx = DOOR.x; gh.ty = DOOR.y; gh.p = 0; gh.dir = LEFT; }
    } else if (gh.hy < homeY) gh.hy = Math.min(homeY, gh.hy + step);
    else { gh.mode = 'leaving'; gh.fright = false; }
    return;
  }
  const inTunnel = gh.ty === TUNNEL_ROW && (gh.tx <= 5 || gh.tx >= COLS - 6);
  let speed = gh.mode === 'eyes' ? sp.eyes : gh.fright ? sp.fright : inTunnel ? sp.tunnel : sp.ghost;
  if (gh.i === 0 && gh.mode === 'active' && !gh.fright && g.left < 20) speed *= 1.1; // Tita Baby gets impatient
  let d = speed * dt;
  while (d > 1e-9) {
    if (gh.p === 0) {
      if (gh.mode === 'eyes' && gh.tx === DOOR.x && gh.ty === DOOR.y) { gh.mode = 'entering'; gh.hx = DOOR.x; gh.hy = DOOR.y; return; }
      gh.dir = chooseDir(g, gh);
    }
    const step = Math.min(d, 1 - gh.p);
    gh.p += step; d -= step;
    if (gh.p >= 1 - 1e-9) { gh.p = 0; gh.tx += DX[gh.dir]; gh.ty += DY[gh.dir]; if (gh.ty === TUNNEL_ROW) gh.tx = wrap(gh.tx); }
  }
}

// ---------- the step ----------
export function step(g, dt) {
  const ev = [];
  if (g.over) return ev;
  g.t += dt;
  if (g.dying > 0) {
    g.dying -= dt;
    if (g.dying <= 0) {
      if (g.lives <= 0) { g.over = true; g.lives = 0; ev.push({ type: 'gameover', score: g.score }); }
      else { resetPositions(g); g.pause = READY_TIME; g.ready = true; ev.push({ type: 'ready' }); }
    }
    return ev;
  }
  if (g.pause > 0) { g.pause -= dt; if (g.pause <= 0) g.ready = false; return ev; }
  if (g.cleared) return ev;

  // scatter and chase waves; the fright timer holds them
  if (g.frightT > 0) {
    g.frightT -= dt;
    if (g.frightT <= 0) { g.frightT = 0; for (const gh of g.ghosts) gh.fright = false; ev.push({ type: 'frightend' }); }
  } else {
    g.waveT -= dt;
    if (g.waveT <= 0) {
      g.wave = Math.min(WAVES.length - 1, g.wave + 1);
      g.waveT = WAVES[g.wave];
      g.scatter = g.wave % 2 === 0;
      for (const gh of g.ghosts) if (gh.mode === 'active') reverse(gh);
      ev.push({ type: 'mode', scatter: g.scatter });
    }
  }
  if (g.fruit) { g.fruit.t -= dt; if (g.fruit.t <= 0) g.fruit = null; }

  movePlayer(g, dt, ev);
  if (g.cleared) return ev;
  for (const gh of g.ghosts) moveGhost(g, gh, dt, ev);
  collide(g, ev);
  return ev;
}

function collide(g, ev) {
  const p = posOf(g.player);
  for (const gh of g.ghosts) {
    if (gh.mode !== 'active') continue;
    const q = posOf(gh);
    let dx = Math.abs(p.x - q.x);
    if (dx > COLS / 2) dx = COLS - dx; // across the tunnel
    if (dx + Math.abs(p.y - q.y) > 0.75) continue;
    if (gh.fright) {
      g.chain++;
      const points = 200 * 2 ** (g.chain - 1);
      addScore(g, points, ev);
      g.ghostsEaten++;
      gh.mode = 'eyes'; gh.fright = false;
      g.pause = EAT_PAUSE;
      ev.push({ type: 'ghost', id: gh.id, points, x: q.x, y: q.y, chain: g.chain });
    } else {
      g.lives--; g.deaths++;
      g.dying = DEATH_TIME;
      g.fruit = null;
      ev.push({ type: 'die', by: gh.id, x: p.x, y: p.y });
      return;
    }
  }
}
