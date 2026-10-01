# Habulan sa Palengke

A classic maze chase, Pinoy style, now in 3D. A hungry bata eats all the pan de sal in the palengke at dawn while four tsismosa titas chase him. Grab **Nanay's tsinelas** and the titas run, so you can chase them back.

**Play:** https://habulan.vercel.app

## How to play

- **Arrow keys / WASD** to run, swipe on a phone (there's a d-pad too), or use a controller (d-pad or left stick; Options pauses). **P** pauses, **M** toggles sound, **C** switches the camera between following you and showing the whole maze; on a phone, the whole maze is seen almost straight down so it fills the screen's width.
- Eat every pan de sal to clear the maze. Touching a tita costs a life.
- **Tsinelas ni Nanay** (the four corner slippers): the titas turn blue and flee. Catch them for 200, 400, 800, then 1,600, and they run home as eyes.
- Fruit appears twice a maze: saging, mangga, lanzones, balut, bibingka and lechon, worth more each level.
- An extra life comes every 10,000 points.
- Difficulty: **Madali** (5 lives, slower titas, longer tsinelas), **Katamtaman**, or **Mahirap**.

## The titas

Each chases in her own way, after the classic four personalities:

| Tita | How she chases |
| --- | --- |
| Tita Baby | Straight for you, and she gets impatient near the end |
| Tita Lorna | Aims four tiles ahead of you, to cut you off |
| Tita Chona | Works with Tita Baby to trap you from the other side |
| Tita Marites | Comes close, then loses interest and wanders off |

They take turns chasing and scattering to their corners. When they switch, they all reverse, which gives you a moment to escape.

## The mazes

Levels 1–2 are the **Palengke**, 3–4 the **Simbahan**, 5–6 the **Mall**, then around again, faster each time. All three are original layouts. Tests check that each has one-tile corridors, no dead ends, and every tile reachable.

## The look

The game is a real-time 3D scene in [three.js](https://threejs.org), bundled in `src/vendor/` so it works offline. The rules are unchanged: `src/game.mjs` is still the pure authority, and the view only reads it.

- **The places** (`src/world3d.mjs`, built on `src/kit3d.mjs`). Each maze is built from its own tile grid, so every aisle has a crisp lip you can read at a glance.
  - **The Palengke at dawn:** stall counters clad in white glazed tiles, with produce heaped the way vendors heap it (tomatoes, onions, eggplants, mangoes, calamansi, hands of bananas, watermelons), fish on ice, stacked egg trays, rice sacks and kakanin. Bulbs hang over the stalls, with shopfronts, tarps and strings of lights around the edge. The low gold sun comes through the haze in shafts of light, and the wet concrete floor mirrors it all.
  - **The Simbahan at night:** coral-stone walls lined with votive candles that flicker, capiz lanterns, parols on the wires, and fireflies over the cobbles. The old church has a two-storey baroque facade with paired pilasters and cornices, a carved arched door standing open, a capiz rose window, a scrolled gable and buttresses. Floodlights wash it, moonlight slants down, and the bells hang in the tower's open arches.
  - **The Mall at night:** glossy kiosks edged in cyan and magenta neon, a polished granite floor, lit storefronts with mannequins and SALE banners, downlight beams and a spotlight sweeping for the midnight sale. The kiosks sell things you can recognise: sneakers on plinths, phones with lit screens, racks of shirts, mannequins, food-court trays and milk tea.
- **The cast** (`src/cast3d.mjs`), modelled and animated in code:
  - **The bata** wears a yellow cap whose brim points the way he runs. He chomps as he eats, squashes into his turns, raises Nanay's tsinelas while it lasts, and gets dizzy with stars circling when he's caught.
  - **Each tita** wears a floral duster that sways, has her own hair, and carries her own prop: Baby's fan, Lorna's cellphone, Chona's bayong, Marites's kape. Her eyes follow the bata. Frightened, she turns blue, throws up her hands and trembles, flashing white as it wears off. Eaten, only her eyes and a faint ghost of her duster hurry home. A glow in her colour on the floor, and arrows at the screen edge, show where each tita is.
- **The food** (`src/food3d.mjs`): pan de sal as little glowing rolls (one instanced mesh), Nanay's tsinelas turning in a column of light, and the fruit runs, from saging and mangga to bibingka and a glossy lechon.
- **The camera** (`src/view3d.mjs`): a three-quarter view that follows you and keeps the maze readable. The **C** key or the settings switch it to the whole maze, and a phone gets a steeper view. Each maze opens with a flyover and its name. A cleared maze gets a crane shot, and getting caught gets a punch-in. When the game ends, the titas gather round you to gossip.
- **The juice:**
  - **Nanay's tsinelas:** a beat of slow motion, a shockwave and a cool wash, the titas' eyes popping in fear, and Nanay herself yelling "ANAAAK!".
  - **Catching titas:** a combo whose "PAK!" grows, and whose slap rises in pitch, with every tita in a row.
  - **Close calls:** a jolt and a sting when a tita brushes past within a tile.
  - **Throughout:** crumbs, sparks, confetti, hit-stop, floating points, speech bubbles and haptics on phones. Shake has a calm option, and `prefers-reduced-motion` is respected.
- **The film look** (`src/post.mjs`, from Tumbang Preso): ambient occlusion, bloom, a grade per place, vignette, grain and SMAA. On the high setting the floor carries a real reflection. The look steps down by itself on slow devices, and `?gfx=0|1|2` pins it.
- **The front end:** the title over the live 3D chase, a loading bar, a restyled HUD (lives, fruit, the tsinelas timer), toasts, pause, results, and a settings screen (camera, shake and flashes, music and effects volume, graphics).
- **Sound** (`src/audio.mjs`): the classic chomp, siren and jingles are synthesized, joined by a light tune and ambience for each place, and Nanay's voice is synthesized from a buzz shaped like an 'a'. Kenney CC0 recordings supply the slap of the tsinelas and the thump of being caught; each recording is levelled to the same loudness as it loads. The music sits under the effects, and everything ends in a limiter.
- **Assets:** the scanned floors and walls, skies and props in `assets/env/` are CC0 from [Poly Haven](https://polyhaven.com), converted with the tools in the Bakbakan repo, and the sounds in `assets/sfx/` are CC0 from [Kenney](https://kenney.nl). They load lazily. Without them, painted stand-ins take their place. If WebGL can't start, the original 2D board (`src/render.mjs`) plays the same game.

Test hooks: `?test=1` with `seed`, `difficulty`, `go=1`, `autoplay=1`, `level=N`, `gfx=0|1|2` and `flat=1` (force the 2D board); `window.__hb` exposes the game.

## Performance

- **The characters:** each is built from simple shapes, then turned into a few GPU-skinned meshes, one per material, with every moving part a bone. The animation code is unchanged, and a tita costs a handful of draws.
- **The food:** the pan de sal, all four tsinelas and every stall's produce and goods are instanced or baked into a few vertex-coloured meshes. The shopfronts and price signs share texture atlases.
- **The budget:** a busy frame at the medium setting is under 200 draw calls and about 300k–470k triangles, including shadows.
- **The reflection:** on high, the floor's reflection runs on desktops only, at reduced resolution, and draws only what reads in a puddle (the cast, the walls, the lights).

## Run locally

```sh
python3 -m http.server 8000
```

Tests (Node 20+): `node --test test/*.test.mjs`. They cover the mazes, the rules (movement, the tunnel, fright and scoring, lives, each tita's targeting, fruit, levels), balance floors from a bot player, and the offline cache.

Made by [Lemmuel Turaya](https://kon2raya.netlify.app). The titas are fictional, and so is their chismis.

## License

MIT. three.js is MIT licensed (`src/vendor/THREE-LICENSE`); the Poly Haven and Kenney assets are CC0.
