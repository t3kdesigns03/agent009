// ONE site for all six jobs. Same dig, next step. No React here.
//
// The client: "I want a lake over there."
// North is existing water behind a fence. The new lake is staked out south of it.
// West, a soft bank hides in front of the existing water. South is the haul road and the gate.

export type Kind =
  | 'rock'
  | 'ground'
  | 'road'
  | 'belt'
  | 'water'
  | 'bank'
  | 'fence'
  | 'pad'
  | 'bay'
  | 'drain'
  | 'dump';

export type Tool = 'none' | 'blade' | 'bucket' | 'ripper';
export type Mode = 'up' | 'shelf' | 'deep';

/*
 Legend
  #  rock            .  ground            =  haul road        b  dead belt
  ~  existing water  s  soft bank         x  fence            P  rigging pad
  1  blade bay       2  bucket bay        3  ripper bay       D  drain
  U  dump            G  gate (start)      Y  survey point (road)
  L  new-lake cell   c  overflow channel  E  east bay (ground cells with a purpose)
*/
export const MAP: string[] = [
  '######################', // 0
  '#~~~~~~~~~~~~~~~~~~~~#', // 1
  '#~~~~~~~~~~~~~~~~~~~~#', // 2
  '#~~~~~~~~~~~~~~~~~~~~#', // 3
  '#~~~~~~~~~~~~~~~~~~~~#', // 4
  '#~~~~~~sxxxxxxxxxxxx.#', // 5  fence x8-19
  '#~~~~~~s.............#', // 6
  '#~~~~~~s..LLLLLLcccD.#', // 7  new lake row 1 · channel · drain
  '#~~~~~~s..LLLLLL.....#', // 8  row 2
  '#~~~~~~s..LLLLLLEE...#', // 9  row 3 · east bay
  '#~~~~~~s..LLLLLLEE...#', // 10 row 4 · east bay
  '#~~~~~ss.............#', // 11
  '#~~~~ssss............#', // 12 lake stake at x12
  '#sssssssss...........#', // 13
  '#....sssss...........#', // 14 spoil heap at x13
  '#.....sss.....PPPPPPP#', // 15
  '#.............P1P2P3P#', // 16 tool rack
  '#.............PPPPPPP#', // 17
  '#.=Y=................#', // 18 survey point
  '#.===................#', // 19
  '#.===................#', // 20
  '#.===...........sssss#', // 21
  '#.bbb...........s~~~~#', // 22 dead belt · SE existing water
  '#.===...........s~~~~#', // 23
  '#.===...........sssss#', // 24
  '#.===................#', // 25
  '#.===................#', // 26
  '#.===..............U.#', // 27 dump
  '#.=G=................#', // 28 gate
  '######################', // 29
];

export const W = MAP[0].length;
export const H = MAP.length;

export interface Pt {
  x: number;
  z: number;
}

export interface Template {
  w: number;
  h: number;
  kind: Kind[];
  bayTool: (Tool | null)[];
}

export const idx = (x: number, z: number) => z * W + x;
export const ptOf = (i: number): Pt => ({ x: i % W, z: Math.floor(i / W) });

function parse(): Template {
  const kind: Kind[] = [];
  const bayTool: (Tool | null)[] = [];
  for (let z = 0; z < H; z++) {
    const row = MAP[z];
    if (row.length !== W) throw new Error(`Map row ${z} is ${row.length} wide, expected ${W}`);
    for (const c of row) {
      let k: Kind = 'ground';
      let t: Tool | null = null;
      switch (c) {
        case '#': k = 'rock'; break;
        case '=': case 'Y': case 'G': k = 'road'; break;
        case 'b': k = 'belt'; break;
        case '~': k = 'water'; break;
        case 's': k = 'bank'; break;
        case 'x': k = 'fence'; break;
        case 'P': k = 'pad'; break;
        case '1': k = 'bay'; t = 'blade'; break;
        case '2': k = 'bay'; t = 'bucket'; break;
        case '3': k = 'bay'; t = 'ripper'; break;
        case 'D': k = 'drain'; break;
        case 'U': k = 'dump'; break;
        case '.': case 'L': case 'c': case 'E': break;
        default: throw new Error(`Unknown map char '${c}'`);
      }
      kind.push(k);
      bayTool.push(t);
    }
  }
  return { w: W, h: H, kind, bayTool };
}

export const TEMPLATE = parse();

function find(ch: string): Pt[] {
  const out: Pt[] = [];
  MAP.forEach((row, z) => [...row].forEach((c, x) => c === ch && out.push({ x, z })));
  return out;
}

/** Named places. Every job's goal is one of these. */
export const PLACES = {
  gate: find('G')[0],
  surveyPoint: find('Y')[0],
  stake: { x: 12, z: 12 },
  heap: { x: 13, z: 14 },
  dump: find('U')[0],
  drain: find('D')[0],
};

export const BAYS: Record<Exclude<Tool, 'none'>, Pt> = {
  blade: find('1')[0],
  bucket: find('2')[0],
  ripper: find('3')[0],
};

/** The new lake: 6 columns (A–F) by 4 rows (1–4). */
export const LAKE = { x0: 10, z0: 7, cols: 6, rows: 4 };
export const LAKE_CELLS: number[] = find('L').map((p) => idx(p.x, p.z));
export const COLS = 'ABCDEF';

export function inLake(x: number, z: number) {
  return x >= LAKE.x0 && x < LAKE.x0 + LAKE.cols && z >= LAKE.z0 && z < LAKE.z0 + LAKE.rows;
}

/** "B4" for a new-lake cell, or null. */
export function cellName(i: number): string | null {
  const { x, z } = ptOf(i);
  if (!inLake(x, z)) return null;
  return `${COLS[x - LAKE.x0]}${z - LAKE.z0 + 1}`;
}

export function cellIndex(name: string): number {
  const c = COLS.indexOf(name[0]);
  const r = Number(name.slice(1)) - 1;
  return idx(LAKE.x0 + c, LAKE.z0 + r);
}

/** Job 3's work order: shelf row 4, A4–F4. Six cells. The one number, used everywhere. */
export const RIGGER_CELLS: number[] = [...COLS].map((c) => cellIndex(`${c}4`));
export const RIGGER_TARGET = RIGGER_CELLS.length; // 6

/** Job 5's overflow channel: three cells east from F1 to the drain. */
export const CHANNEL_CELLS: number[] = find('c').map((p) => idx(p.x, p.z));

/** Job 6's east bay: four cells beside the new lake. */
export const EAST_BAY: number[] = find('E').map((p) => idx(p.x, p.z));

/** Tiles everyone can see from the gate: the road, its verges, the pad, the stakes. */
export function initialRevealed(): boolean[] {
  const r = TEMPLATE.kind.map(() => false);
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const k = TEMPLATE.kind[idx(x, z)];
      // Existing water is plain to see. What's hidden is how far the soft bank reaches.
      if (k !== 'ground' && k !== 'bank') r[idx(x, z)] = true;
      if (x <= 5 && z >= 17) r[idx(x, z)] = true; // road corridor
      if (x >= 9 && x <= 19 && z >= 6 && z <= 11) r[idx(x, z)] = true; // the staked lake and its rim: the client surveyed it
    }
  return r;
}

export function passableKind(k: Kind) {
  return k !== 'rock' && k !== 'water' && k !== 'fence';
}

/** Shortest 4-way path length between two tiles over safe ground (no bank, water, fence, rock). */
export function safeDistance(from: Pt, to: Pt, avoidBank = true): number {
  const start = idx(from.x, from.z);
  const goal = idx(to.x, to.z);
  const dist = new Map<number, number>([[start, 0]]);
  const q = [start];
  while (q.length) {
    const i = q.shift()!;
    if (i === goal) return dist.get(i)!;
    const { x, z } = ptOf(i);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = idx(nx, nz);
      const k = TEMPLATE.kind[j];
      if (!passableKind(k) || (avoidBank && k === 'bank') || dist.has(j)) continue;
      dist.set(j, dist.get(i)! + 1);
      q.push(j);
    }
  }
  return Infinity;
}

/** Region name for the HUD, so the learner always knows where they are. */
export function regionName(x: number, z: number): string {
  const i = idx(x, z);
  const n = cellName(i);
  if (n) return `NEW LAKE · ${n}`;
  const k = TEMPLATE.kind[i];
  if (k === 'road' || k === 'belt') return 'HAUL ROAD';
  if (k === 'pad' || k === 'bay') return 'RIGGING PAD';
  if (CHANNEL_CELLS.includes(i)) return 'OVERFLOW CHANNEL';
  if (EAST_BAY.includes(i)) return 'EAST BAY';
  if (z <= 6) return 'FENCE LINE';
  if (z >= 19 && x >= 12) return 'SOUTH-EAST FIELD';
  return 'FIELD';
}
