// The bot is cruder than a person, so these are floors: Madali must stay easy, and the difficulties
// must stay in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, steer } from '../src/game.mjs';
import { bot } from '../src/bot.mjs';

function clears(difficulty, seeds = 10) {
  let n = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const g = createGame({ seed, difficulty });
    for (let i = 0; i < 60 * 300 && !g.over && !g.cleared; i++) { steer(g, bot(g)); step(g, 1 / 60); }
    if (g.cleared) n++;
  }
  return n;
}

test('Madali: the bot clears the first maze most of the time', () => {
  const n = clears('madali');
  assert.ok(n >= 7, `cleared ${n}/10`);
});

test('the difficulties are in order', () => {
  const easy = clears('madali', 6), mid = clears('katamtaman', 6), hard = clears('mahirap', 6);
  assert.ok(easy >= mid && mid >= hard && easy > hard, `madali ${easy}, katamtaman ${mid}, mahirap ${hard}`);
});
