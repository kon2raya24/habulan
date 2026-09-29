// The mazes, built from a lattice of one-tile aisles with some aisle segments closed off, mirrored
// left to right. Original layouts: palengke stalls, a simbahan, a mall. Tiles:
//   #  wall     .  pan de sal     o  Nanay's tsinelas     (space)  open, nothing to eat
//   -  the ghost-house door (titas only)     _  inside the house
export const COLS = 28, ROWS = 31;
export const START = { x: 13, y: 23 }; // the bata
export const DOOR = { x: 13, y: 11 }; // the tile just above the door, where titas enter and leave
export const HOUSE = [{ x: 11, y: 14 }, { x: 13, y: 14 }, { x: 15, y: 14 }]; // Lorna, Chona, Marites
export const FRUIT = { x: 13, y: 17 };
export const TUNNEL_ROW = 14;

// removals: ['h', row, fromCol, toCol] closes the aisle on `row` between two aisle columns;
// ['v', col, fromRow, toRow] closes the aisle on `col` between two aisle rows. Left half only;
// each is mirrored.
function build({ xs, ys, remove = [] }) {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill('#'));
  const mirror = (x) => COLS - 1 - x;
  const cols = [...new Set([...xs, ...xs.map(mirror)])];
  for (const y of ys) for (let x = 1; x < COLS - 1; x++) g[y][x] = '.';
  for (const x of cols) for (let y = 1; y < ROWS - 1; y++) g[y][x] = '.';
  for (const [kind, at, a, b] of remove) {
    for (let k = a + 1; k < b; k++) {
      if (kind === 'h') { g[at][k] = '#'; g[at][mirror(k)] = '#'; }
      else { g[k][at] = '#'; g[k][mirror(at)] = '#'; }
    }
  }
  // the house, with an open ring of aisle around it
  for (let y = 11; y <= 17; y++) for (let x = 9; x <= 18; x++) g[y][x] = (y === 11 || y === 17 || x === 9 || x === 18) ? ' ' : '#';
  for (let y = 13; y <= 15; y++) for (let x = 11; x <= 16; x++) g[y][x] = '_';
  g[12][13] = '-'; g[12][14] = '-';
  // the tunnel, with no pan de sal near the ends
  g[TUNNEL_ROW][0] = ' '; g[TUNNEL_ROW][COLS - 1] = ' ';
  for (let x = 1; x <= 5; x++) { if (g[TUNNEL_ROW][x] === '.') g[TUNNEL_ROW][x] = ' '; if (g[TUNNEL_ROW][mirror(x)] === '.') g[TUNNEL_ROW][mirror(x)] = ' '; }
  // no pan de sal in the middle band around the house
  for (let y = 10; y <= 18; y++) for (let x = 7; x <= 20; x++) if (g[y][x] === '.') g[y][x] = ' ';
  for (const [x, y] of [[1, 3], [COLS - 2, 3], [1, 23], [COLS - 2, 23]]) if (g[y][x] === '.') g[y][x] = 'o';
  g[START.y][START.x] = ' '; g[START.y][mirror(START.x)] = ' ';
  return g.map((r) => r.join(''));
}

const XS = [1, 6, 9, 12];
const YS = [1, 5, 8, 11, 14, 17, 20, 23, 26, 29];

export const MAZES = [
  {
    name: 'Palengke', blurb: 'Mga pwesto ng isda, gulay at karne.',
    colors: { wall: '#2f7d6d', edge: '#8ee0c8', floor: '#1b2a26' },
    rows: build({ xs: XS, ys: YS, remove: [['v', 9, 1, 5], ['h', 8, 1, 6], ['v', 12, 20, 23], ['h', 26, 9, 12], ['v', 6, 26, 29], ['h', 20, 1, 6]] }),
  },
  {
    name: 'Simbahan', blurb: 'Tahimik sana, pero may habulan.',
    colors: { wall: '#7a4a9e', edge: '#e0c2ff', floor: '#211a2b' },
    rows: build({ xs: XS, ys: YS, remove: [['v', 12, 1, 5], ['h', 5, 6, 9], ['v', 1, 8, 11], ['h', 23, 6, 9], ['v', 9, 23, 26], ['h', 29, 6, 9]] }),
  },
  {
    name: 'Mall', blurb: 'Sale! Pero bawal tumakbo sa mall.',
    colors: { wall: '#b5541c', edge: '#ffd2a8', floor: '#2b1f19' },
    rows: build({ xs: [1, 4, 9, 12], ys: YS, remove: [['h', 1, 4, 9], ['v', 4, 5, 8], ['h', 20, 9, 12], ['v', 12, 26, 29], ['h', 26, 1, 4], ['v', 9, 20, 23]] }),
  },
];

// Levels 1-2 are the palengke, 3-4 the simbahan, 5-6 the mall, and then around again.
export const mazeFor = (level) => MAZES[Math.floor((level - 1) / 2) % MAZES.length];
