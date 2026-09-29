// A simple player for the title screen and the balance tests. It walks the shortest path to the
// nearest pan de sal, treats tiles near a chasing tita as walls, goes for frightened titas close by,
// and runs for the farthest tile from danger when it's cornered.
import { COLS, ROWS, TUNNEL_ROW } from './maps.mjs';
import { DX, DY, tile, posOf } from './game.mjs';

const open = (g, x, y) => { const c = tile(g, x, y); return c === '.' || c === 'o' || c === ' '; };
const wrapX = (x, y) => (y === TUNNEL_ROW ? ((x % COLS) + COLS) % COLS : x);

function bfs(g, sx, sy, blocked) {
  const dist = new Int16Array(COLS * ROWS).fill(-1), first = new Int8Array(COLS * ROWS).fill(-1);
  const q = [[sx, sy]];
  dist[sy * COLS + sx] = 0;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (let d = 0; d < 4; d++) {
      const nx = wrapX(x + DX[d], y + DY[d]), ny = y + DY[d];
      if (ny < 0 || ny >= ROWS || !open(g, nx, ny)) continue;
      const k = ny * COLS + nx;
      if (dist[k] >= 0 || blocked.has(k)) continue;
      dist[k] = dist[y * COLS + x] + 1;
      first[k] = h === 0 ? d : first[y * COLS + x];
      q.push([nx, ny]);
    }
  }
  return { dist, first };
}

export function bot(g) {
  const pl = g.player;
  // plan from the tile the bata is heading into
  const sx = pl.p > 0 ? wrapX(pl.tx + DX[pl.dir], pl.ty + DY[pl.dir]) : pl.tx, sy = pl.p > 0 ? pl.ty + DY[pl.dir] : pl.ty;
  const chasers = g.ghosts.filter((gh) => gh.mode === 'active' && !gh.fright);
  const blocked = new Set();
  for (const gh of chasers) {
    const q = posOf(gh), gx = Math.round(q.x), gy = Math.round(q.y);
    const near = bfs(g, wrapX(gx, gy), gy, new Set());
    for (let k = 0; k < near.dist.length; k++) if (near.dist[k] >= 0 && near.dist[k] <= 2) blocked.add(k);
  }
  blocked.delete(sy * COLS + sx);
  const { dist, first } = bfs(g, sx, sy, blocked);
  // a frightened tita close by is worth a detour
  let best = -1, bestD = Infinity;
  for (const gh of g.ghosts) {
    if (gh.mode !== 'active' || !gh.fright || g.frightT < 1.5) continue;
    const q = posOf(gh), k = Math.round(q.y) * COLS + wrapX(Math.round(q.x), Math.round(q.y));
    if (dist[k] > 0 && dist[k] < 9 && dist[k] < bestD) { bestD = dist[k]; best = k; }
  }
  if (best < 0) {
    for (let k = 0; k < dist.length; k++) {
      if (dist[k] < 0 || !g.pellets[k]) continue;
      const v = dist[k] - (g.pellets[k] === 2 && chasers.length ? 6 : 0);
      if (v < bestD) { bestD = v; best = k; }
    }
  }
  if (best >= 0 && dist[best] > 0) return first[best];
  if (best >= 0 && dist[best] === 0) return pl.dir;
  // cornered: head for the reachable tile farthest from every chaser
  let far = -1, farD = -1;
  const all = bfs(g, sx, sy, new Set());
  for (let k = 0; k < all.dist.length; k++) {
    if (all.dist[k] <= 0) continue;
    const x = k % COLS, y = (k / COLS) | 0;
    const m = Math.min(...chasers.map((gh) => { const q = posOf(gh); return Math.abs(q.x - x) + Math.abs(q.y - y); }), 99);
    if (m > farD) { farD = m; far = k; }
  }
  return far >= 0 ? all.first[far] : pl.dir;
}
