// Synthesized sound: a two-note chomp for pan de sal, a market-bustle siren that rises as the maze
// empties, a wobble while the titas are frightened, and short original jingles. Nothing plays until
// start() runs from a user gesture.
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

export function createAudio() {
  let ctx = null, master = null, siren = null, sirenGain = null, muted = false, chomp = 0;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
    siren = ctx.createOscillator(); siren.type = 'triangle'; siren.frequency.value = 300;
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 3; depth.gain.value = 40; lfo.connect(depth).connect(siren.frequency); lfo.start();
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    siren.connect(sirenGain).connect(master); siren.start();
  }

  function tone(freq, dur, type = 'square', gain = 0.06, when = 0, bend = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    start,
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; },
    // the background: silent between lives, higher as fewer pan de sal remain, a wobble when frightened
    update(g, playing) {
      if (!ctx) return;
      const on = playing && !g.pause && !g.dying && !g.cleared && !g.over;
      const fright = g.frightT > 0;
      const base = fright ? 180 : 260 + (1 - g.left / g.total) * 220;
      siren.frequency.setTargetAtTime(base, ctx.currentTime, 0.1);
      sirenGain.gain.setTargetAtTime(on ? (fright ? 0.03 : 0.018) : 0, ctx.currentTime, 0.05);
    },
    pellet() { chomp ^= 1; tone(chomp ? 520 : 390, 0.05, 'triangle', 0.05); },
    power() { tone(200, 0.4, 'sawtooth', 0.06, 0, 3); },
    ghost() { tone(300, 0.35, 'square', 0.06, 0, 4); },
    fruit() { [0, 4, 7, 12].forEach((k, i) => tone(NOTE(76 + k), 0.12, 'triangle', 0.07, i * 0.06)); },
    extra() { [0, 7, 12, 16].forEach((k, i) => tone(NOTE(72 + k), 0.18, 'square', 0.05, i * 0.1)); },
    die() { for (let i = 0; i < 10; i++) tone(700 - i * 55, 0.12, 'square', 0.05, i * 0.1, 0.8); },
    // an original little tune for the start of each life and each clear
    ready() { [0, 4, 7, 4, 9, 7, 12].forEach((k, i) => tone(NOTE(67 + k), 0.16, 'square', 0.045, i * 0.14)); },
    clear() { [0, 4, 7, 12, 7, 12, 16].forEach((k, i) => tone(NOTE(72 + k), 0.14, 'triangle', 0.06, i * 0.1)); },
    gameOver() { [67, 64, 60, 55].forEach((n, i) => tone(NOTE(n), 0.35, 'triangle', 0.07, i * 0.25)); },
  };
}
