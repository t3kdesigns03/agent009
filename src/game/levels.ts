// Six jobs. Maps are built in code from strings. No React here.
import type { AgentId, CardId } from './cards';
import { BRIEF_CARDS } from './cards';
import type { Sim } from './sim';

export type JobId = 'yoke' | 'survey' | 'rigger' | 'grade' | 'warden' | 'dispatch';
export const JOB_ORDER: JobId[] = ['yoke', 'survey', 'rigger', 'grade', 'warden', 'dispatch'];

export type TileKind =
  | 'rock'
  | 'ground'
  | 'road'
  | 'belt'
  | 'water'
  | 'bank'
  | 'pad'
  | 'flag'
  | 'fence'
  | 'crew';
export type Target = 'none' | 'deep' | 'shelf' | 'ramp';

export type Mode = 'up' | 'shelf' | 'deep';
export type Tool = 'none' | 'blade' | 'scoop';

export type Outcome = { status: 'win' } | { status: 'fail'; reason: string };

export type AutoOp =
  | { kind: 'go'; x: number; z: number }
  | { kind: 'mode'; mode: Mode }
  | { kind: 'bump' }
  | { kind: 'park' }
  | { kind: 'log'; text: string }
  | { kind: 'phase'; agent: Phase };

/** Finale handoffs, in order. 'crew' is the crew parking after Warden. */
export type Phase = AgentId | 'crew';
export const PHASES: Phase[] = ['survey', 'operator', 'rigger', 'grade', 'warden', 'crew'];

export interface LevelDef {
  id: JobId;
  num: number;
  name: string; // job name on the watch
  agent: AgentId | null; // null for Dispatch
  role: string;
  objective: string;
  brief: string;
  map: string[];
  /** Brief cards (null = no card form) */
  cards: CardId[] | null;
  startTool: Tool;
  hasPad: boolean;
  modes: (cards: CardId[]) => Mode[];
  check: (sim: Sim) => Outcome | null;
  auto?: AutoOp[];
}

/*
 Legend
  #  rock (blocked)       .  ground          =  road (concrete)
  b  dead belt (road)     S  start, ground   @  start, road
  F  flag                 ~  existing water  s  soft bank
  P  rigging pad          d  deep target     h  shelf target
  r  ramp                 x  fence           c  crew (finale)
*/

export const THRESHOLD = 0.75;

const has = (cards: CardId[], id: CardId) => cards.includes(id);

export function needed(n: number): number {
  return Math.ceil(n * THRESHOLD);
}

export interface Shape {
  deepN: number;
  deepHit: number;
  shelfN: number;
  shelfHit: number;
  rampIntact: boolean;
  deepOK: boolean;
  shelfOK: boolean;
}

export function shape(sim: Sim): Shape {
  let deepN = 0,
    deepHit = 0,
    shelfN = 0,
    shelfHit = 0,
    rampIntact = true;
  for (let i = 0; i < sim.target.length; i++) {
    const t = sim.target[i];
    const d = sim.depth[i];
    if (t === 'deep') {
      deepN++;
      if (d >= 2) deepHit++;
    } else if (t === 'shelf') {
      shelfN++;
      if (d === 1) shelfHit++;
    } else if (t === 'ramp' && d > 0) rampIntact = false;
  }
  return {
    deepN,
    deepHit,
    shelfN,
    shelfHit,
    rampIntact,
    deepOK: deepHit >= needed(deepN),
    shelfOK: shelfHit >= needed(shelfN),
  };
}

export function tileAt(sim: Sim, x: number, z: number): number {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= sim.w || tz >= sim.h) return -1;
  return tz * sim.w + tx;
}

export const onFlag = (sim: Sim) => {
  const i = tileAt(sim, sim.x, sim.z);
  return i >= 0 && sim.kind[i] === 'flag';
};
export const parked = (sim: Sim) => onFlag(sim) && Math.abs(sim.speed) < 0.05;

function notice(sim: Sim, text: string) {
  const last = sim.log[sim.log.length - 1];
  if (!last || last.text !== text) sim.log.push({ t: sim.time, text });
}

const LEVELS: LevelDef[] = [
  {
    id: 'yoke',
    num: 1,
    name: 'YOKE',
    agent: 'operator',
    role: 'Operator',
    objective: 'Drive the road to the flag.',
    brief: 'No card form. Yoke starts bound. The machine is strong. Get it to the flag.',
    map: [
      '#######',
      '##.F.##',
      '##===##',
      '##===##',
      '##===##',
      '##===##',
      '##bbb##',
      '##===##',
      '##===##',
      '##===##',
      '##=@=##',
      '#######',
    ],
    cards: null,
    startTool: 'none',
    hasPad: false,
    modes: () => ['up'],
    check: (sim) => {
      if (onFlag(sim) && sim.beltTripped && sim.yokeBound) return { status: 'win' };
      return null;
    },
  },
  {
    id: 'survey',
    num: 2,
    name: 'SURVEY',
    agent: 'survey',
    role: 'Survey',
    objective: 'Reach the flag. Do not charge a lake.',
    brief: 'Survey looks before anyone digs. Load what it needs to know about this ground.',
    map: [
      '###########',
      '#....F....#',
      '#.........#',
      '#..~~~~~..#',
      '#..~~~~~..#',
      '#..~~~~~..#',
      '#..sssss..#',
      '#..sssss..#',
      '#.........#',
      '#.........#',
      '#....S....#',
      '###########',
    ],
    cards: BRIEF_CARDS.survey,
    startTool: 'none',
    hasPad: false,
    modes: () => ['up'],
    check: (sim) => {
      if (!onFlag(sim)) return null;
      if (!sim.surveyed) return { status: 'fail', reason: 'You got there blind. Survey never had the bank.' };
      return { status: 'win' };
    },
  },
  {
    id: 'rigger',
    num: 3,
    name: 'RIGGER',
    agent: 'rigger',
    role: 'Rigger',
    objective: 'Mount at the pad. F lowers it. Cut the shelf. Flag.',
    brief: 'Rigger puts iron on the front at the pad. Tell it what this cut needs.',
    map: [
      '###########',
      '#....F....#',
      '#.........#',
      '#..hhhh...#',
      '#..hhhh...#',
      '#.........#',
      '#.........#',
      '#....P....#',
      '#.........#',
      '#....S....#',
      '###########',
    ],
    cards: BRIEF_CARDS.rigger,
    startTool: 'none',
    hasPad: true,
    modes: () => ['up', 'shelf'],
    check: (sim) => {
      if (!onFlag(sim)) return null;
      if (sim.tool === 'none') return { status: 'fail', reason: 'Bare front. Rigger never mounted the blade.' };
      if (sim.tool === 'scoop') return { status: 'fail', reason: 'A scoop on the front. It cannot push this cut.' };
      const s = shape(sim);
      if (s.shelfOK) return { status: 'win' };
      notice(sim, `Flag. Shelf ${s.shelfHit}/${needed(s.shelfN)}. Cut more of the shelf.`);
      return null;
    },
  },
  {
    id: 'grade',
    num: 4,
    name: 'GRADE',
    agent: 'grade',
    role: 'Grade',
    objective: 'Deep middle. Shelf edge. Ramp intact. Park.',
    brief: 'The blade is already on. Grade knows the shape of the hole, or it does not.',
    map: [
      '#############',
      '#.....S.....#',
      '#...........#',
      '#...hhhhh...#',
      '#...hdddh...#',
      '#...hdddh...#',
      '#...hdddh...#',
      '#...hhrhh...#',
      '#.....r.....#',
      '#...........#',
      '#.....F.....#',
      '#...........#',
      '#############',
    ],
    cards: BRIEF_CARDS.grade,
    startTool: 'blade',
    hasPad: false,
    // Without the shape fact the blade still lifts, but only knows one depth when lowered: deep.
    modes: (cards) => (has(cards, 'grade.shape') ? ['up', 'shelf', 'deep'] : ['up', 'deep']),
    check: (sim) => {
      if (!parked(sim)) return null;
      const s = shape(sim);
      if (sim.tool === 'blade' && s.deepOK && s.shelfOK && s.rampIntact) return { status: 'win' };
      notice(sim, `Parked. Deep ${s.deepHit}/${needed(s.deepN)}, shelf ${s.shelfHit}/${needed(s.shelfN)}.`);
      return null;
    },
  },
  {
    id: 'warden',
    num: 5,
    name: 'WARDEN',
    agent: 'warden',
    role: 'Warden',
    objective: 'Cut the shelf. Lean on the fence. Park.',
    brief: 'Past the fence is a lake that is already there. Warden decides if the fence is a lock.',
    map: [
      '#############',
      '#~~~~~~~~~~~#',
      '#~~~~~~~~~~~#',
      '#xxxxxxxxxxx#',
      '#...hhhh....#',
      '#...hhhh....#',
      '#...........#',
      '#.........F.#',
      '#...........#',
      '#.....S.....#',
      '#############',
    ],
    cards: BRIEF_CARDS.warden,
    startTool: 'blade',
    hasPad: false,
    modes: () => ['up', 'shelf'],
    check: (sim) => {
      if (!parked(sim)) return null;
      if (!sim.hook) return { status: 'fail', reason: 'No hook. The fence was only a request.' };
      const s = shape(sim);
      if (sim.bumps >= 1 && s.shelfOK) return { status: 'win' };
      notice(
        sim,
        sim.bumps < 1 ? 'Parked. Nobody has tested the fence.' : `Parked. Shelf ${s.shelfHit}/${needed(s.shelfN)}.`,
      );
      return null;
    },
  },
  {
    id: 'dispatch',
    num: 6,
    name: 'DISPATCH',
    agent: null,
    role: 'Orchestrator',
    objective: 'I want a lake over there.',
    brief: 'One fact per agent. Five agents. Dispatch hands out the work and never digs.',
    map: [
      '###############',
      '#~~~~~~~~~~~~~#',
      '#xxxxxxxxxxxxx#',
      '#.............#',
      '#..hhhhh......#',
      '#..hdddh..~~~.#',
      '#..hdddh..~~~.#',
      '#..hdddh..sss.#',
      '#..hhrhh......#',
      '#....r........#',
      '#..........F..#',
      '#.....P...ccc.#',
      '#.............#',
      '#=============#',
      '#bbbbbbbbbbbbb#',
      '#=============#',
      '#......S......#',
      '###############',
    ],
    cards: null,
    startTool: 'none',
    hasPad: true,
    // Without the shape fact the blade travels up but only knows one depth: deep.
    modes: (cards) => (has(cards, 'grade.shape') ? ['up', 'shelf', 'deep'] : ['up', 'deep']),
    check: () => null, // Leave decides.
    auto: [
      { kind: 'phase', agent: 'survey' },
      { kind: 'log', text: 'SURVEY: the bank and the existing water are marked.' },
      { kind: 'phase', agent: 'operator' },
      { kind: 'go', x: 7, z: 12 },
      { kind: 'phase', agent: 'rigger' },
      { kind: 'go', x: 6, z: 12 },
      { kind: 'go', x: 6, z: 11 },
      { kind: 'go', x: 8, z: 11 },
      { kind: 'phase', agent: 'grade' },
      { kind: 'go', x: 8, z: 8 },
      { kind: 'log', text: 'GRADE: shelf first.' },
      { kind: 'mode', mode: 'shelf' },
      { kind: 'go', x: 6, z: 8 },
      { kind: 'go', x: 7, z: 8 },
      { kind: 'go', x: 7, z: 4 },
      { kind: 'go', x: 3, z: 4 },
      { kind: 'go', x: 3, z: 8 },
      { kind: 'go', x: 4, z: 8 },
      { kind: 'log', text: 'GRADE: deep middle.' },
      { kind: 'mode', mode: 'deep' },
      { kind: 'go', x: 4, z: 5 },
      { kind: 'go', x: 6, z: 5 },
      { kind: 'go', x: 6, z: 6 },
      { kind: 'go', x: 5, z: 6 },
      { kind: 'go', x: 5, z: 7 },
      { kind: 'go', x: 6, z: 7 },
      { kind: 'go', x: 5, z: 7 },
      { kind: 'log', text: 'GRADE: blade up. Ramp out.' },
      { kind: 'mode', mode: 'up' },
      { kind: 'go', x: 5, z: 10 },
      { kind: 'go', x: 9, z: 10 },
      { kind: 'phase', agent: 'warden' },
      { kind: 'go', x: 9, z: 3 },
      { kind: 'log', text: 'WARDEN: testing the fence.' },
      { kind: 'bump' },
      { kind: 'phase', agent: 'crew' },
      { kind: 'go', x: 9, z: 10 },
      { kind: 'go', x: 11, z: 10 },
      { kind: 'park' },
    ],
  },
];

export const LEVEL: Record<JobId, LevelDef> = Object.fromEntries(LEVELS.map((l) => [l.id, l])) as Record<
  JobId,
  LevelDef
>;

export interface Parsed {
  w: number;
  h: number;
  kind: TileKind[];
  target: Target[];
  start: { x: number; z: number };
}

export function parseMap(map: string[]): Parsed {
  const h = map.length;
  const w = map[0].length;
  const kind: TileKind[] = [];
  const target: Target[] = [];
  let start = { x: 1.5, z: 1.5 };
  for (let z = 0; z < h; z++) {
    const row = map[z];
    if (row.length !== w) throw new Error(`Map row ${z} is ${row.length} wide, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const c = row[x];
      let k: TileKind = 'ground';
      let t: Target = 'none';
      switch (c) {
        case '#': k = 'rock'; break;
        case '=': k = 'road'; break;
        case 'b': k = 'belt'; break;
        case '@': k = 'road'; start = { x: x + 0.5, z: z + 0.5 }; break;
        case 'S': start = { x: x + 0.5, z: z + 0.5 }; break;
        case 'F': k = 'flag'; break;
        case '~': k = 'water'; break;
        case 's': k = 'bank'; break;
        case 'P': k = 'pad'; break;
        case 'd': t = 'deep'; break;
        case 'h': t = 'shelf'; break;
        case 'r': t = 'ramp'; break;
        case 'x': k = 'fence'; break;
        case 'c': k = 'crew'; break;
        case '.': break;
        default: throw new Error(`Unknown map char '${c}'`);
      }
      kind.push(k);
      target.push(t);
    }
  }
  return { w, h, kind, target, start };
}
