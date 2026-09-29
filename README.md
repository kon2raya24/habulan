# Habulan sa Palengke

A classic maze chase, Pinoy style. A hungry bata eats all the pan de sal in the palengke while four tsismosa titas chase him. Grab **Nanay's tsinelas** and the titas run, so you can chase them back.

**Play:** https://habulan.vercel.app

## How to play

- **Arrow keys / WASD** to run, or swipe on a phone (there's a d-pad too). **P** pauses, **M** toggles sound.
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

## Run locally

```sh
python3 -m http.server 8000
```

Tests (Node 20+): `node --test test/*.test.mjs`. They cover the mazes, the rules (movement, the tunnel, fright and scoring, lives, each tita's targeting, fruit, levels), and balance floors from a bot player.

Made by [Lemmuel Turaya](https://kon2raya.netlify.app). The titas are fictional, and so is their chismis.

## License

MIT
