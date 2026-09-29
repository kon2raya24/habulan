// Draws the maze, the bata, the four titas, food and the juice (popups, sparkles, the death spin).
// Reads the game state only; never changes it.
import { COLS, ROWS, FRUIT } from './maps.mjs';
import { posOf, TITAS, FRUITS, DX, DY } from './game.mjs';

export const T = 16, TOP = 44, W = COLS * T, H = TOP + ROWS * T + 34;
const px = (x) => x * T + T / 2, py = (y) => TOP + y * T + T / 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TAUNTS = ['Hoy, bata!', 'Saan ka pupunta?!', 'Isusumbong kita!', 'Chismis ko \'to!', 'Ang takaw mo!'];
const SCARED = ['Ay, si Nanay!', 'Takbo!', 'Ay, tsinelas!'];
const OUCH = ['Aray ko!', 'Nahuli!', 'Ay!'];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const mazes = new Map();
  const parts = [], popups = [], bubbles = [];
  let lastT = null, flash = 0, reducedNow = false, tauntT = 3;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  }

  // ---------- the maze, painted once per maze ----------
  function paintMaze(maze) {
    const c = document.createElement('canvas');
    c.width = COLS * T; c.height = ROWS * T;
    const m = c.getContext('2d');
    const { wall, edge, floor } = maze.colors;
    m.fillStyle = floor; m.fillRect(0, 0, c.width, c.height);
    const isWall = (x, y) => (maze.rows[y]?.[x] ?? '#') === '#' ;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!isWall(x, y)) continue;
      const X = x * T, Y = y * T;
      m.fillStyle = wall; m.fillRect(X, Y, T, T);
      // a little texture by maze: crate slats, stone blocks, floor tiles
      m.fillStyle = 'rgba(0,0,0,0.12)';
      if (maze.name === 'Palengke') { if (y % 2 === 0) m.fillRect(X, Y + 7, T, 2); }
      else if (maze.name === 'Simbahan') { if ((x + y) % 2) m.fillRect(X + 1, Y + 1, T - 2, T - 2); }
      else { m.fillRect(X + 7, Y, 2, T); }
      // bright edges where a wall meets the floor
      m.fillStyle = edge;
      if (!isWall(x, y - 1)) m.fillRect(X, Y, T, 2);
      if (!isWall(x, y + 1)) m.fillRect(X, Y + T - 2, T, 2);
      if (!isWall(x - 1, y)) m.fillRect(X, Y, 2, T);
      if (!isWall(x + 1, y)) m.fillRect(X + T - 2, Y, 2, T);
    }
    // palengke awnings: striped tops on the long stall rows
    if (maze.name === 'Palengke') {
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        if (isWall(x, y) && !isWall(x, y - 1) && isWall(x, y + 1)) { for (let k = 0; k < 4; k++) { m.fillStyle = k % 2 ? '#f4f1e8' : '#e8384f'; m.fillRect(x * T + k * 4, y * T + 2, 4, 3); } }
      }
    }
    // the door of the house
    m.fillStyle = '#ffd2e6'; m.fillRect(13 * T, 12 * T + 6, 2 * T, 4);
    return c;
  }

  // ---------- juice ----------
  const emit = (p) => { if (parts.length < 400) parts.push({ g: 0, ...p, max: p.life }); };
  const popup = (text, x, y, color, size = 14) => popups.push({ text, x, y, color, size, life: 1.1, max: 1.1 });
  const bubble = (text, x, y, color) => { if (bubbles.length < 2) bubbles.push({ text, x, y, color, life: 1.4 }); };

  function event(e, g) {
    switch (e.type) {
      case 'power':
        for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2; emit({ kind: 'spark', x: px(e.x), y: py(e.y), vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.5, color: pick(['#4dd0e1', '#fff', '#ffd166']) }); }
        for (const gh of g.ghosts) if (gh.mode === 'active' && Math.random() < 0.5) { const q = posOf(gh); bubble(pick(SCARED), px(q.x), py(q.y) - 14, '#9ad7ff'); }
        flash = 0.25;
        break;
      case 'ghost':
        popup(String(e.points), px(e.x), py(e.y), '#4dd0e1', 14);
        for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2; emit({ kind: 'spark', x: px(e.x), y: py(e.y), vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, life: 0.45, color: TITAS.find((t) => t.id === e.id).color }); }
        break;
      case 'fruit':
        popup(`+${e.points}`, px(e.x), py(e.y), '#ffd166', 14);
        break;
      case 'die':
        popup(pick(OUCH), px(e.x), py(e.y) - 14, '#ff6b6b', 15);
        break;
      case 'clear':
        popup('BUSOG!', W / 2, py(17), '#ffd166', 26);
        break;
      case 'extra':
        popup('EXTRA BUHAY!', W / 2, py(17), '#8bd5a0', 20);
        break;
      default: break;
    }
  }

  function updateFx(dt, g) {
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; }
    for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.life -= dt; p.y -= 18 * dt; if (p.life <= 0) popups.splice(i, 1); }
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.life -= dt; if (b.life <= 0) bubbles.splice(i, 1); }
    flash = Math.max(0, flash - dt);
    // now and then a chasing tita calls out
    tauntT -= dt;
    if (tauntT <= 0 && g && !g.pause && !g.dying) {
      tauntT = 6 + Math.random() * 6;
      const chasers = g.ghosts.filter((gh) => gh.mode === 'active' && !gh.fright);
      if (chasers.length) { const gh = pick(chasers), q = posOf(gh); bubble(pick(TAUNTS), px(q.x), py(q.y) - 14, TITAS[gh.i].color); }
    }
  }

  // ---------- food ----------
  function pandesal(x, y) {
    ctx.fillStyle = '#b8742c'; ctx.beginPath(); ctx.ellipse(x, y, 3.2, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6b061'; ctx.beginPath(); ctx.ellipse(x - 0.6, y - 0.8, 2, 1.1, 0, 0, Math.PI * 2); ctx.fill();
  }
  function tsinelas(x, y, t, reduced) {
    const s = reduced ? 1 : 1 + 0.15 * Math.sin(t * 8);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5); ctx.scale(s, s);
    const gl = ctx.createRadialGradient(0, 0, 1, 0, 0, 11); gl.addColorStop(0, 'rgba(77,208,225,0.55)'); gl.addColorStop(1, 'rgba(77,208,225,0)');
    ctx.fillStyle = gl; ctx.fillRect(-11, -11, 22, 22);
    ctx.fillStyle = '#1e88e5'; ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 6.6, 0, 0, Math.PI * 2); ctx.fill(); // rubber sole
    ctx.fillStyle = '#bbdefb'; ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 5.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3, 1); ctx.lineTo(0, -3); ctx.lineTo(3, 1); ctx.stroke(); // strap
    ctx.restore();
  }
  function fruit(id, x, y, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    switch (id) {
      case 'saging': ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(1, -4, 7, 0.5, 2.5); ctx.stroke(); ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-6, -1); ctx.stroke(); break;
      case 'mangga': ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.ellipse(0, 1, 5, 6.5, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffe082'; ctx.beginPath(); ctx.ellipse(-1.5, -1, 1.8, 3, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#43a047'; ctx.fillRect(2, -6, 3, 2); break;
      case 'lanzones': for (const [a, b] of [[-3, 2], [3, 2], [0, -2], [-2, -5], [2, -5], [0, 5]]) { ctx.fillStyle = '#d7b77a'; ctx.beginPath(); ctx.arc(a, b, 2.8, 0, Math.PI * 2); ctx.fill(); } ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, -9); ctx.stroke(); break;
      case 'balut': ctx.fillStyle = '#f6ecd6'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = 1; ctx.stroke(); break;
      case 'bibingka': ctx.fillStyle = '#8d6e63'; ctx.beginPath(); ctx.ellipse(0, 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffcc80'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff3e0'; ctx.beginPath(); ctx.arc(0, -0.5, 1.8, 0, Math.PI * 2); ctx.fill(); break;
      default: ctx.fillStyle = '#b5561c'; ctx.beginPath(); ctx.ellipse(-1, 1, 6.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(5, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(7.5, 0, 1.4, 0, Math.PI * 2); ctx.fill(); break; // lechon
    }
    ctx.restore();
  }

  // ---------- the bata: a round face whose mouth chomps the way he's going ----------
  function bata(g, t, reduced) {
    const pl = g.player, q = posOf(pl), x = px(q.x), y = py(q.y);
    const ang = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][pl.dir];
    let open = pl.moving && !reduced ? 0.12 + Math.abs(Math.sin(pl.mouth * Math.PI)) * 0.8 : 0.35;
    let r = 9.6, spin = 0;
    if (g.dying > 0) { const k = 1 - g.dying / 1.6; open = Math.min(Math.PI, 0.3 + k * 3.2); spin = reduced ? 0 : k * 4; r = 9.6 * (1 - k * 0.6); }
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 7, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0a36b';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, ang + open / 2, ang + Math.PI * 2 - open / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1024'; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(0, -r * 0.35); ctx.fill(); // hair
    if (g.dying <= 0) {
      const ex = Math.cos(ang) * 3.2, ey = Math.sin(ang) * 2 - 3.4;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1024'; ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * 0.9, ey + Math.sin(ang) * 0.7, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- the titas: house dresses, hair curlers, eyes that follow where they're going ----------
  function tita(g, gh, t, reduced) {
    let x, y;
    if (gh.mode === 'house' || gh.mode === 'leaving' || gh.mode === 'entering') { x = px(gh.hx); y = py(gh.hy) + (gh.mode === 'house' && !reduced ? Math.sin(t * 6 + gh.i) * 2 : 0); }
    else { const q = posOf(gh); x = px(q.x); y = py(q.y); }
    const base = TITAS[gh.i].color;
    const end = g.frightT > 0 && g.frightT < 2 && Math.floor(t * 8) % 2 === 0;
    const scared = gh.fright && gh.mode !== 'eyes';
    const dir = gh.mode === 'house' ? 2 : gh.dir;
    ctx.save(); ctx.translate(x, y); ctx.scale(1.3, 1.3);
    if (gh.mode !== 'eyes') {
      const body = scared ? (end ? '#f4f1e8' : '#3a4fd8') : base;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 8, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
      // the duster dress, with a hem that swishes
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(-7.5, 7); ctx.lineTo(-7.5, -1); ctx.arc(0, -1, 7.5, Math.PI, 0); ctx.lineTo(7.5, 7);
      const w = reduced ? 0 : Math.sin(t * 14 + gh.i) * 1.2;
      for (let k = 0; k < 4; k++) { const hx = 7.5 - (k + 1) * 3.75; ctx.lineTo(hx + 1.9, 5 + (k % 2 ? w : -w)); ctx.lineTo(hx, 7.5); }
      ctx.closePath(); ctx.fill();
      if (!scared) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (const [a, b] of [[-3, 3], [3, 1], [0, 5]]) { ctx.beginPath(); ctx.arc(a, b, 1.1, 0, Math.PI * 2); ctx.fill(); } } // flower print
      // curlers in her hair
      if (!scared) for (let k = -1; k <= 1; k++) { ctx.fillStyle = ['#ff80ab', '#80d8ff', '#ffff8d'][k + 1]; ctx.fillRect(k * 4 - 1.8, -9.5, 3.6, 2.6); }
    }
    // eyes: looking where she's going; wide and worried when scared
    if (scared) {
      ctx.fillStyle = end ? '#e8384f' : '#fff';
      ctx.fillRect(-4, -3, 2.4, 2.4); ctx.fillRect(1.6, -3, 2.4, 2.4);
      ctx.strokeStyle = end ? '#e8384f' : '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4.5, 3); for (let k = 0; k < 5; k++) ctx.lineTo(-4.5 + (k + 1) * 1.8, k % 2 ? 3 : 1.6); ctx.stroke(); // a wobbly mouth
    } else {
      const ox = DX[dir] * 1.4, oy = DY[dir] * 1.4;
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(s * 3 + ox * 0.4, -2 + oy * 0.4, 2.3, 2.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1b3a8a'; ctx.beginPath(); ctx.arc(s * 3 + ox, -2 + oy, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      if (gh.mode !== 'eyes') { ctx.fillStyle = '#c2185b'; ctx.fillRect(-2, 2.5, 4, 1.2); } // lipstick
    }
    ctx.restore();
  }

  function hud(g, best) {
    ctx.fillStyle = '#0d0a12'; ctx.fillRect(0, 0, W, TOP);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff8e1'; ctx.font = '800 11px "Baloo 2", system-ui, sans-serif';
    ctx.fillText('PUNTOS', 10, 16); ctx.fillText('BEST', W / 2 - 18, 16);
    ctx.textAlign = 'right'; ctx.fillText(`LEVEL ${g.level}`, W - 10, 16);
    ctx.font = '800 18px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffd166'; ctx.fillText(String(g.score), 10, 36);
    ctx.fillStyle = '#f4d9ff'; ctx.fillText(String(Math.max(best, g.score)), W / 2 - 18, 36);
    ctx.textAlign = 'right'; ctx.fillStyle = g.maze.colors.edge; ctx.fillText(g.maze.name, W - 10, 36);
    // bottom: spare lives and the fruits of the level
    const by = TOP + ROWS * T + 17;
    for (let k = 0; k < Math.min(6, g.lives - 1); k++) { ctx.save(); ctx.translate(16 + k * 20, by); ctx.fillStyle = '#e0a36b'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 7, Math.PI + 0.4, Math.PI * 3 - 0.4); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#1b1024'; ctx.beginPath(); ctx.arc(0, 0, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.lineTo(0, -2); ctx.fill(); ctx.restore(); }
    for (let k = 0; k < Math.min(g.level, 6); k++) fruit(FRUITS[Math.min(FRUITS.length - 1, g.level - 1 - k)].id, W - 16 - k * 20, by, 0.9);
    ctx.textAlign = 'left';
  }

  function draw(g, t, { reduced = false, best = 0, hudOn = true } = {}) {
    reducedNow = reduced;
    const dt = lastT === null ? 0 : clamp(t - lastT, 0, 0.1);
    lastT = t;
    updateFx(dt, g);
    const k = canvas.width / W;
    ctx.setTransform(k, 0, 0, canvas.height / H, 0, 0);
    ctx.fillStyle = '#0d0a12'; ctx.fillRect(0, 0, W, H);
    if (!mazes.has(g.maze.name)) mazes.set(g.maze.name, paintMaze(g.maze));
    ctx.drawImage(mazes.get(g.maze.name), 0, TOP);
    // the maze flashes when it's cleared
    if (g.cleared && !reduced && Math.floor(t * 6) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, TOP, W, ROWS * T); }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = g.pellets[y * COLS + x];
      if (v === 1) pandesal(px(x), py(y)); else if (v === 2) tsinelas(px(x), py(y), t, reduced);
    }
    if (g.fruit) fruit(g.fruit.id, px(FRUIT.x), py(FRUIT.y), 1 + (reduced ? 0 : 0.08 * Math.sin(t * 6)));
    if (!g.cleared && !(g.dying > 0 && g.dying < 1.2)) for (const gh of g.ghosts) tita(g, gh, t, reduced);
    if (!g.over) bata(g, t, reduced);
    for (const p of parts) { ctx.fillStyle = p.color; ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1); ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (flash > 0) { ctx.fillStyle = `rgba(77,208,225,${flash * 0.5})`; ctx.fillRect(0, TOP, W, ROWS * T); }
    // speech bubbles
    ctx.font = '700 10px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const b of bubbles) {
      const w = ctx.measureText(b.text).width + 10, a = clamp(b.life * 3, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.roundRect(clamp(b.x - w / 2, 2, W - w - 2), b.y - 20, w, 15, 6); ctx.fill();
      ctx.strokeStyle = b.color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#1b1024'; ctx.fillText(b.text, clamp(b.x, w / 2 + 2, W - w / 2 - 2), b.y - 9);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      const a = clamp(p.life / p.max * 2, 0, 1);
      ctx.font = `900 ${p.size}px "Baloo 2", system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(10,6,16,${a})`; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color; ctx.globalAlpha = a; ctx.fillText(p.text, p.x, p.y); ctx.globalAlpha = 1;
    }
    if (g.ready) {
      ctx.font = '900 18px "Baloo 2", system-ui, sans-serif'; ctx.fillStyle = '#ffd166';
      ctx.fillText('HANDA NA!', W / 2, py(17) + 6);
    }
    ctx.textAlign = 'left';
    if (hudOn) hud(g, best);
  }

  function reset() { parts.length = 0; popups.length = 0; bubbles.length = 0; }
  return { draw, resize, event, reset };
}
