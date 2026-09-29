// Every maze must play like Pac-Man: one-tile corridors, no dead ends, everything reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAZES, COLS, ROWS, START, DOOR, HOUSE, FRUIT, TUNNEL_ROW } from '../src/maps.mjs';

const open = (rows, x, y) => { if (y === TUNNEL_ROW) x = (x + COLS) % COLS; const c = rows[y]?.[x]; return c !== undefined && '. o'.includes(c); };
const exits = (rows, x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(rows, x + dx, y + dy)).length;

for (const m of MAZES) {
  test(`${m.name}: size, symmetry, one-tile corridors, no dead ends, all reachable`, () => {
    const R = m.rows;
    assert.equal(R.length, ROWS);
    for (const r of R) { assert.equal(r.length, COLS); assert.equal(r, [...r].reverse().join(''), 'mirrored'); }
    for (let y = 0; y < ROWS - 1; y++) for (let x = 0; x < COLS - 1; x++) {
      assert.ok(!(open(R, x, y) && open(R, x + 1, y) && open(R, x, y + 1) && open(R, x + 1, y + 1)), `2×2 open area at ${x},${y}`);
    }
    let walk = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (open(R, x, y)) { walk++; assert.ok(exits(R, x, y) >= 2, `dead end at ${x},${y}`); }
    const seen = new Set([`${START.x},${START.y}`]), todo = [[START.x, START.y]];
    while (todo.length) {
      const [x, y] = todo.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nx = x + dx; const ny = y + dy;
        if (ny === TUNNEL_ROW) nx = (nx + COLS) % COLS;
        if (open(R, nx, ny) && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); todo.push([nx, ny]); }
      }
    }
    assert.equal(seen.size, walk, 'every open tile is reachable');
    const pellets = R.join('').split('').filter((c) => c === '.').length;
    assert.ok(pellets > 180, `${pellets} pan de sal`);
    assert.equal(R.join('').split('').filter((c) => c === 'o').length, 4, 'four tsinelas');
    for (const p of [START, DOOR, FRUIT]) assert.ok(open(R, p.x, p.y), `${p.x},${p.y} open`);
    for (const h of HOUSE) assert.equal(R[h.y][h.x], '_');
    assert.equal(R[12][13], '-');
    assert.equal(R[TUNNEL_ROW][0], ' ', 'the tunnel is open');
  });
}
