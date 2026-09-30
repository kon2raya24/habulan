// Sound. The classic feel is synthesized: the two-note chomp for pan de sal, the market-bustle siren that
// rises as the maze empties, a wobble while the titas are frightened, and short original jingles. Real
// recordings (CC0, from Kenney) add the slap of Nanay's tsinelas on a tita, the thump of being caught and
// soft impacts. Around it: a light tune for each place and its ambience (the palengke's murmur, crickets
// in the churchyard, the mall's hum). Music and effects have their own volume. Nothing plays until
// start() runs from a user gesture; the recordings load then.
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
const SAMPLES = { slap: 3, punch_m: 2, soft_m: 2, soft_h: 1 };
// a short loop per place: [root note, scale, tempo]
const TUNES = { palengke: [60, [0, 4, 7, 9, 12, 9, 7, 4], 118], simbahan: [57, [0, 3, 7, 10, 12, 10, 7, 3], 92], mall: [62, [0, 7, 12, 14, 12, 7, 5, 7], 124] };

export function createAudio({ base = 'assets/sfx/' } = {}) {
  let ctx = null, master = null, music = null, sfx = null, siren = null, sirenGain = null, amb = null, ambF = null, noise = null, muted = false, chomp = 0;
  const buf = {}, mix = { music: 0.7, sfx: 1 };
  let place = 'palengke', step = 0, nextAt = 0, playing = false;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = 0; music.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = mix.sfx; sfx.connect(master);
    siren = ctx.createOscillator(); siren.type = 'triangle'; siren.frequency.value = 300;
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 3; depth.gain.value = 40; lfo.connect(depth).connect(siren.frequency); lfo.start();
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    siren.connect(sirenGain).connect(sfx); siren.start();
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    ambF = ctx.createBiquadFilter(); ambF.type = 'bandpass'; ambF.frequency.value = 600; ambF.Q.value = 0.7;
    amb = ctx.createGain(); amb.gain.value = 0; src.connect(ambF).connect(amb).connect(music); src.start();
    setInterval(schedule, 50);
    for (const [k, n] of Object.entries(SAMPLES)) for (let i = 0; i < n; i++) fetch(`${base}${k}${i}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((a) => ctx.decodeAudioData(a)).then((b) => { buf[k + i] = b; }).catch(() => { /* synth only */ });
  }
  function play(name, gain = 1, rate = 1, vary = 0.08) {
    if (!ctx || muted) return false;
    const takes = Array.from({ length: SAMPLES[name] || 0 }, (_, i) => buf[name + i]).filter(Boolean);
    if (!takes.length) return false;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = takes[Math.floor(Math.random() * takes.length)]; s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    g.gain.value = gain; s.connect(g).connect(sfx); s.start();
    return true;
  }
  function tone(freq, dur, type = 'square', gain = 0.06, when = 0, bend = 0, out = sfx) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(dur, freq, gain, when = 0, type = 'bandpass', to = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type; f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // the tune: a marimba-ish pluck over a soft bass, one short loop per place
  function schedule() {
    if (!ctx || !playing || muted) return;
    const [root, scale, bpm] = TUNES[place] || TUNES.palengke, eighth = 30 / bpm;
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
    while (nextAt < ctx.currentTime + 0.2) {
      const when = nextAt - ctx.currentTime, bar = Math.floor(step / 8) % 4, s = step % 8, shift = [0, 5, 7, 0][bar];
      if (s % 2 === 0 || (place === 'mall' && s === 5)) { const n = root + 12 + scale[(s + bar * 2) % scale.length] + (bar === 2 ? 2 : 0); tone(NOTE(n), 0.22, 'sine', 0.022, when, 0, music); tone(NOTE(n) * 4, 0.04, 'sine', 0.006, when, 0, music); }
      if (s === 0 || s === 4) tone(NOTE(root - 12 + shift), eighth * 1.8, 'triangle', 0.045, when, 0, music);
      if (place !== 'simbahan' && s % 4 === 2) hiss(0.03, 7000, 0.012, when, 'highpass');
      if (place === 'simbahan' && s === 0 && bar === 0) tone(NOTE(root + 24), 1.6, 'sine', 0.012, when, 0, music); // a far-off bell
      nextAt += eighth; step++;
    }
  }
  return {
    start,
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; },
    setMix(m) { mix.music = m.music ?? mix.music; mix.sfx = m.sfx ?? mix.sfx; if (sfx) sfx.gain.value = mix.sfx; },
    setPlace(p) {
      place = p;
      if (!ambF) return;
      ambF.frequency.value = p === 'simbahan' ? 4200 : p === 'mall' ? 300 : 650; ambF.Q.value = p === 'simbahan' ? 8 : 0.7;
    },
    // the background: silent between lives, higher as fewer pan de sal remain, a wobble when frightened
    update(g, live) {
      if (!ctx) return;
      const on = live && !g.pause && !g.dying && !g.cleared && !g.over;
      const fright = g.frightT > 0;
      siren.frequency.setTargetAtTime(fright ? 180 : 260 + (1 - g.left / g.total) * 220, ctx.currentTime, 0.1);
      sirenGain.gain.setTargetAtTime(on ? (fright ? 0.028 : 0.014) : 0, ctx.currentTime, 0.05);
      if (live !== playing) { playing = live; if (live) nextAt = ctx.currentTime + 0.05; }
      music.gain.setTargetAtTime(mix.music * (live ? (fright ? 0.5 : 1) : 0.55), ctx.currentTime, 0.4);
      const crickets = place === 'simbahan' ? 0.012 * (0.5 + 0.5 * Math.sin(ctx.currentTime * 9) ** 2) : 0;
      amb.gain.setTargetAtTime(place === 'simbahan' ? crickets : place === 'mall' ? 0.05 : 0.07 + Math.sin(ctx.currentTime * 0.4) * 0.025, ctx.currentTime, 0.3);
    },
    pellet() { chomp ^= 1; tone(chomp ? 520 : 390, 0.05, 'triangle', 0.05); },
    power() { tone(200, 0.4, 'sawtooth', 0.05, 0, 3); hiss(0.4, 800, 0.06, 0, 'bandpass', 4000); play('soft_h', 0.5, 1.4); },
    ghost() { if (!play('slap', 1, 1.1)) hiss(0.08, 1800, 0.1); tone(300, 0.35, 'square', 0.05, 0.05, 4); },
    fruit() { [0, 4, 7, 12].forEach((k, i) => tone(NOTE(76 + k), 0.12, 'triangle', 0.07, i * 0.06)); },
    extra() { [0, 7, 12, 16].forEach((k, i) => tone(NOTE(72 + k), 0.18, 'square', 0.05, i * 0.1)); },
    die() { play('punch_m', 0.8, 0.9); for (let i = 0; i < 10; i++) tone(700 - i * 55, 0.12, 'square', 0.045, 0.1 + i * 0.1, 0.8); },
    ready() { [0, 4, 7, 4, 9, 7, 12].forEach((k, i) => tone(NOTE(67 + k), 0.16, 'square', 0.04, i * 0.14)); },
    clear() { [0, 4, 7, 12, 7, 12, 16].forEach((k, i) => tone(NOTE(72 + k), 0.14, 'triangle', 0.06, i * 0.1)); hiss(1.2, 900, 0.05, 0.1, 'bandpass', 2000); },
    gameOver() { [67, 64, 60, 55].forEach((n, i) => tone(NOTE(n), 0.35, 'triangle', 0.07, i * 0.25)); },
    whoosh() { hiss(0.9, 300, 0.05, 0, 'bandpass', 2400); },
    ui() { tone(880, 0.05, 'triangle', 0.03); },
  };
}
