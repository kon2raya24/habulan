// Offline play: the game's own files (three.js and the sounds included) are cached on install and served
// cache-first; the webfonts and the optional scanned surfaces in assets/env are cached the first time they load. Bump VERSION whenever a file changes so players get the update.
const VERSION = 'habulan-v2';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'assets/env/env.json',
  'src/audio.mjs', 'src/bot.mjs', 'src/cast3d.mjs', 'src/envpack.mjs', 'src/food3d.mjs', 'src/game.mjs', 'src/kit3d.mjs', 'src/main.mjs',
  'src/maps.mjs', 'src/post.mjs', 'src/render.mjs', 'src/rng.mjs', 'src/tex.mjs', 'src/view3d.mjs', 'src/world3d.mjs', 'src/vendor/three-fx.min.js',
  'src/vendor/three-mocap.min.js', 'src/vendor/three.module.min.js', 'assets/sfx/punch_m0.mp3', 'assets/sfx/punch_m1.mp3', 'assets/sfx/slap0.mp3',
  'assets/sfx/slap1.mp3', 'assets/sfx/slap2.mp3', 'assets/sfx/soft_h0.mp3', 'assets/sfx/soft_m0.mp3', 'assets/sfx/soft_m1.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: url.origin === location.origin });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match('index.html')) || Response.error();
    }
  }));
});
