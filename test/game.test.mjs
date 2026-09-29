import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, steer, nextLevel, posOf, targetOf, UP, LEFT, DOWN, RIGHT, PELLET, POWER, EXTRA_LIFE, DIFFICULTY } from '../src/game.mjs';
import { START, DOOR, COLS, TUNNEL_ROW } from '../src/maps.mjs';

const run = (g, s) => { const ev = []; for (let t = 0; t < s; t += 1 / 60) ev.push(...step(g, 1 / 60)); return ev; };
// a game with the titas parked in the house, so tests control what happens
const quiet = (over = {}) => { const g = createGame({ seed: 1, ...over }); g.pause = 0; for (const gh of g.ghosts) { gh.mode = 'house'; gh.release = 1e9; gh.hx = 13; gh.hy = 14; } return g; };

test('the bata starts under the house, heads left, and eats pan de sal as he goes', () => {
  const g = quiet();
  assert.deepEqual([g.player.tx, g.player.ty], [START.x, START.y]);
  const ev = run(g, 1);
  assert.ok(g.player.tx < START.x);
  assert.ok(ev.filter((e) => e.type === 'pellet').length >= 5);
  assert.equal(g.score, ev.filter((e) => e.type === 'pellet').length * PELLET);
});

test('walls stop him; a queued turn happens at the next open junction; reversing is instant', () => {
  const g = quiet();
  steer(g, UP); // no opening straight up from the start row until a junction
  run(g, 3);
  assert.equal(g.player.dir, UP, 'turned at the first junction');
  assert.ok(g.player.ty < START.y);
  const y = posOf(g.player).y;
  steer(g, DOWN);
  step(g, 1 / 60);
  assert.equal(g.player.dir, DOWN);
  assert.ok(Math.abs(posOf(g.player).y - y) < 0.2, 'reversed on the spot');
  const w = quiet();
  w.player.tx = 1; w.player.ty = 1; w.player.dir = UP; w.player.next = UP;
  run(w, 1);
  assert.equal(w.player.moving, false, 'the wall stops him');
  assert.deepEqual([w.player.tx, w.player.ty], [1, 1]);
});

test('the tunnel wraps around', () => {
  const g = quiet();
  g.player.tx = 1; g.player.ty = TUNNEL_ROW; g.player.dir = LEFT; g.player.next = LEFT;
  run(g, 0.5);
  assert.ok(g.player.tx > COLS / 2, `came out on the right at ${g.player.tx}`);
});

test('Nanay\'s tsinelas frightens the titas; eating them doubles up 200, 400, 800, 1600', () => {
  const g = quiet();
  g.pellets[3 * COLS + 1] = 2; g.pellets[4 * COLS + 1] = 0;
  g.player.tx = 1; g.player.ty = 4; g.player.dir = UP; g.player.next = UP;
  for (const gh of g.ghosts) { gh.mode = 'active'; gh.tx = 1; gh.ty = 8; gh.p = 0; gh.dir = UP; }
  const ev = run(g, 0.2);
  assert.ok(ev.some((e) => e.type === 'power'));
  assert.ok(g.frightT > 0 && g.ghosts.every((gh) => gh.fright));
  assert.equal(g.score, POWER);
  // put each frightened tita on top of the bata, one after another
  const values = [];
  for (const gh of g.ghosts) {
    gh.tx = g.player.tx; gh.ty = g.player.ty; gh.p = g.player.p; gh.dir = g.player.dir;
    const e = run(g, 0.6).find((x) => x.type === 'ghost');
    values.push(e.points);
    assert.equal(gh.mode === 'eyes' || gh.mode === 'entering' || gh.mode === 'leaving', true);
  }
  assert.deepEqual(values, [200, 400, 800, 1600]);
});

test('eaten titas go home as eyes and come back out', () => {
  const g = quiet();
  const gh = g.ghosts[0];
  gh.mode = 'eyes'; gh.tx = 1; gh.ty = 1; gh.p = 0; gh.dir = RIGHT;
  g.player.tx = 26; g.player.ty = 29; g.player.dir = LEFT; g.player.next = LEFT;
  let back = false;
  for (let i = 0; i < 60 * 12 && !back; i++) { step(g, 1 / 60); back = gh.mode === 'active' && !gh.fright; }
  assert.ok(back, `tita is ${gh.mode}`);
});

test('a tita catching the bata costs a life; the last life ends the game', () => {
  const g = quiet({ difficulty: 'mahirap' });
  assert.equal(g.lives, DIFFICULTY.mahirap.lives);
  for (let k = 0; k < DIFFICULTY.mahirap.lives; k++) {
    const gh = g.ghosts[0];
    gh.mode = 'active'; gh.fright = false; gh.tx = g.player.tx; gh.ty = g.player.ty; gh.p = g.player.p; gh.dir = g.player.dir;
    const ev = run(g, 3.2);
    assert.ok(ev.some((e) => e.type === 'die'));
    if (k < DIFFICULTY.mahirap.lives - 1) { assert.equal(g.over, false); for (const t of g.ghosts) { t.mode = 'house'; t.release = 1e9; } }
  }
  assert.equal(g.over, true);
});

test('each tita targets in her own way', () => {
  const g = quiet();
  g.scatter = false;
  g.player.tx = 10; g.player.ty = 20; g.player.dir = UP;
  const [baby, lorna, chona, marites] = g.ghosts;
  baby.tx = 20; baby.ty = 20;
  assert.deepEqual(targetOf(g, baby), { x: 10, y: 20 });
  assert.deepEqual(targetOf(g, lorna), { x: 10, y: 16 }, 'four ahead of him');
  assert.deepEqual(targetOf(g, chona), { x: 0, y: 16 }, 'double the vector from Tita Baby to two ahead');
  marites.tx = 11; marites.ty = 21;
  assert.deepEqual(targetOf(g, marites), { x: 0, y: 31 }, 'close up, she heads for her corner');
  marites.tx = 26; marites.ty = 1;
  assert.deepEqual(targetOf(g, marites), { x: 10, y: 20 }, 'far away, she chases');
  g.scatter = true;
  assert.deepEqual(targetOf(g, baby), { x: 25, y: -3 });
});

test('fruit appears after 70 pan de sal, and an extra life comes at 10,000', () => {
  const g = quiet();
  g.eaten = 69;
  const ev = run(g, 0.4);
  assert.ok(ev.some((e) => e.type === 'fruitshow'));
  assert.equal(g.fruit.id, 'saging');
  const h = quiet();
  const lives = h.lives;
  h.score = EXTRA_LIFE - 5;
  run(h, 0.3);
  assert.equal(h.lives, lives + 1);
});

test('clearing the maze ends the level; the next keeps score and lives and changes the maze every two levels', () => {
  const g = quiet();
  g.pellets.fill(0); g.left = 1;
  g.pellets[23 * COLS + 12] = 1;
  const ev = run(g, 0.5);
  assert.ok(ev.some((e) => e.type === 'clear'));
  const n = nextLevel(g);
  assert.equal(n.level, 2); assert.equal(n.score, g.score); assert.equal(n.lives, g.lives);
  assert.equal(n.maze.name, 'Palengke');
  assert.equal(nextLevel(n).maze.name, 'Simbahan');
});

test('the titas leave the house one by one', () => {
  const g = createGame({ seed: 2 });
  g.pause = 0;
  const out = [];
  for (let i = 0; i < 60 * 10; i++) { step(g, 1 / 60); for (const gh of g.ghosts) if (gh.mode === 'active' && !out.includes(gh.id)) out.push(gh.id); if (g.dying) break; }
  assert.deepEqual(out.slice(0, 4), ['baby', 'lorna', 'chona', 'marites']);
});

test('the same seed plays out the same way', () => {
  const a = createGame({ seed: 5 }), b = createGame({ seed: 5 });
  run(a, 8); run(b, 8);
  assert.deepEqual(a.ghosts.map((x) => [x.tx, x.ty, x.mode]), b.ghosts.map((x) => [x.tx, x.ty, x.mode]));
});
