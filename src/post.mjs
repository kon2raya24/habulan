// The film look, adapted from Tumbang Preso. The frame is rendered in HDR, then:
// - ambient occlusion grounds the stalls, the titas and the corners
// - bloom makes the bulbs, candles, neon, pan de sal and tsinelas glow
// - a filmic tone map
// - a grade per maze (contrast, saturation, a tint), with a vignette and fine grain
// - a cool wash while Nanay's tsinelas are out, a grey beat when you're caught
// - a colour split on the biggest moments
// - SMAA for clean edges
// Three levels (2 all, 1 without occlusion, 0 plain). It steps down by itself when frames run slow.
import * as THREE from './vendor/three.module.min.js';
import { EffectComposer, RenderPass, UnrealBloomPass, GTAOPass, OutputPass, SMAAPass, ShaderPass } from './vendor/three-fx.min.js';

// [contrast, saturation, tint, vignette, bloom strength, bloom threshold]
export const GRADE = {
  palengke: [1.1, 1.12, [1.04, 1.0, 0.95], 0.42, 0.42, 0.95],
  simbahan: [1.12, 1.05, [0.95, 0.98, 1.08], 0.5, 0.6, 0.8],
  mall: [1.12, 1.12, [1.0, 0.97, 1.06], 0.45, 0.42, 1.05],
};

const Grade = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, contrast: { value: 1 }, sat: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) }, vig: { value: 0.4 }, grain: { value: 0.03 }, split: { value: 0 }, flash: { value: 0 }, cool: { value: 0 }, grey: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, contrast, sat, vig, grain, split, flash, cool, grey; uniform vec3 tint; varying vec2 vUv;
    float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (split > 0.001) { vec2 o = d * split * 0.02; c.r = texture2D(tDiffuse, vUv + o).r; c.b = texture2D(tDiffuse, vUv - o).b; }
      c = (c - 0.5) * contrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat * (1.0 - grey * 0.75)) * tint;
      c = mix(c, c * vec3(0.82, 0.95, 1.22) + vec3(0.0, 0.01, 0.03), cool);
      c *= mix(1.0, smoothstep(0.95, 0.2, length(d * vec2(1.25, 1.0))), vig + cool * 0.15 + grey * 0.2);
      c += (rnd(vUv * 731.0 + fract(time) * 17.0) - 0.5) * grain;
      c = mix(c, vec3(1.0), flash * 0.55);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, { level = 2, auto: auto0 = true } = {}) {
  let auto = auto0;
  let composer = null, gtao = null, bloom = null, grade = null, smaa = null, lvl = level;
  const size = new THREE.Vector2();
  const listeners = [];
  function build() {
    if (composer) composer.dispose();
    composer = null; gtao = bloom = grade = smaa = null;
    for (const f of listeners) f(lvl);
    if (lvl <= 0) return;
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pr); composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(scene, camera));
    if (lvl >= 2) {
      gtao = new GTAOPass(scene, camera, size.x, size.y, undefined, { radius: 0.35, distanceExponent: 1.4, thickness: 0.8, scale: 1.1, samples: 16, distanceFallOff: 1 }, { radius: 8, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
    }
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.5, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    grade = new ShaderPass(Grade);
    composer.addPass(grade);
    smaa = new SMAAPass();
    composer.addPass(smaa);
    setStage(stageId);
  }
  let stageId = 'palengke';
  function setStage(id) {
    stageId = id; grace = Math.max(grace, 4);
    const G = GRADE[id] || GRADE.palengke;
    if (grade) { const u = grade.uniforms; u.contrast.value = G[0]; u.sat.value = G[1]; u.tint.value.set(...G[2]); u.vig.value = G[3]; }
    if (bloom) { bloom.strength = G[4]; bloom.threshold = G[5]; }
  }
  // slow frames: step down once the average stays under ~40 fps for a few seconds
  let avg = 1 / 60, slowT = 0, last = 0, grace = 6; // loading and shader compiles hitch at first: give it a few seconds
  function render(dt, { split = 0, bloomBoost = 0, flash = 0, cool = 0, grey = 0 } = {}) {
    // real time between frames (the game's dt is capped, so it can't tell how slow things are)
    const t = performance.now() / 1000, real = last ? Math.min(1, t - last) : 1 / 60; last = t;
    avg = avg * 0.9 + real * 0.1;
    if (grace > 0) grace -= real; else slowT = avg > 1 / 40 ? slowT + real : Math.max(0, slowT - real);
    if (auto && slowT > 4 && lvl > 0) { lvl--; slowT = 0; grace = 3; build(); }
    if (!composer) { renderer.render(scene, camera); return; }
    const u = grade.uniforms;
    u.time.value = t; u.split.value = split; u.flash.value = flash; u.cool.value = cool; u.grey.value = grey;
    const G = GRADE[stageId] || GRADE.palengke;
    bloom.strength = G[4] + bloomBoost;
    composer.render(dt);
  }
  function setAuto(b) { auto = b; }
  function resize() { if (!composer) return; renderer.getSize(size); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(size.x, size.y); }
  build();
  return { render, resize, setStage, setAuto, onLevel(f) { listeners.push(f); f(lvl); }, get level() { return lvl; }, setLevel(n) { lvl = n; build(); } };
}
