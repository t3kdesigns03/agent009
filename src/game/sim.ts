// The site, live. One step(sim, intent, dt). No React.
import type { JobId } from './ids';
import { gradePlan, stepCells, type Plan } from './plan';
import {
  BAYS,
  CHANNEL_CELLS,
  H,
  LAKE_CELLS,
  PLACES,
  RIGGER_CELLS,
  RIGGER_TARGET,
  TEMPLATE,
  W,
  cellName,
  idx,
  inLake,
  initialRevealed,
  ptOf,
  type Kind,
  type Mode,
  type Pt,
  type Tool,
} from './site';
import { FACTS, PACKET_SLOTS, cloneSnap, type FactId, type Snapshot } from './snapshot';
import type { Stage } from './vocab';
import { yoke, type Drive, type Intent } from './yoke';

export const MAX_SPEED = 2.4; // tiles per second
export const REVERSE_SPEED = 1.3;
export const ACCEL = 5;
export const DECEL = 9;
export const TURN_RATE = 2.6;
export const SCAN_RADIUS = 3.6;
export const SCAN_TIME = 0.6;
export const MOUNT_TIME = 0.9;

export const MODE_DEPTH: Record<Mode, number> = { up: 0, shelf: 1, deep: 2 };
const MODE_CYCLE: Mode[] = ['up', 'shelf', 'deep'];

export type YokeState = 'off' | 'bound' | 'dropped' | 'cut';
export type Guard = 'hook' | 'request' | 'approval' | 'bigger';

export const TOOL_INFO: Record<Exclude<Tool, 'none'>, { name: string; verb: string; spec: string }> = {
  blade: { name: 'BLADE', verb: 'pushes', spec: 'Pushes dirt. Fast. Use it to shape cuts: shelf and deep.' },
  bucket: {
    name: 'BUCKET',
    verb: 'lifts',
    spec: 'Lifts and carries dirt. It can cut a shelf, but 3× slower, with wear. Use it to load trucks.',
  },
  ripper: {
    name: 'RIPPER',
    verb: 'breaks',
    spec: 'Breaks up hard ground and rock. It moves no dirt. This field is soft dirt.',
  },
};

export type Tone = 'info' | 'good' | 'warn' | 'bad' | 'tool' | 'rule';

export interface LogLine {
  t: number;
  text: string;
  tone: Tone;
}

export interface Stats {
  dist: number;
  time: number;
  hazards: number;
  hazardNotes: string[];
  binds: number;
  cuts: number;
  toolCalls: number;
  swaps: number;
  scans: number;
  cellsCut: number;
  waste: number[];
  revisits: number;
  blocks: number;
  approvals: number;
  auto: boolean;
}

export type AutoOp =
  | { k: 'reach'; x: number; z: number; mode?: Mode }
  | { k: 'mode'; mode: Mode }
  | { k: 'mount'; tool: Exclude<Tool, 'none'> }
  | { k: 'log'; text: string; tone?: Tone }
  | { k: 'push'; dx: number; dz: number; t: number }
  | { k: 'call'; fn: (sim: Sim) => void };

interface Auto {
  ops: AutoOp[];
  i: number;
  t: number;
  path: Pt[] | null;
  pi: number;
  /** who is driving, for the log and the HUD */
  who: string;
}

export interface Ask {
  id: 'approve-test' | 'approve-request' | 'approve-urgent';
  title: string;
  text: string;
  yes: string;
  no: string;
}

export interface Sim {
  job: JobId;
  w: number;
  h: number;
  kind: Kind[];
  depth: number[];
  /** the site as this job found it, for before/after */
  depth0: number[];
  revealed: boolean[];
  ripped: boolean[];
  /** Survey facts perceived this job (with a scan). */
  found: Set<'water' | 'bank'>;
  packet: FactId[];
  plan: Plan | null;
  spoil: number;
  wear: number;
  filled: boolean;
  hook: boolean;
  guard: Guard | null;

  x: number;
  z: number;
  yaw: number;
  speed: number;
  yoke: YokeState;
  beltTripped: boolean;
  tool: Tool;
  mode: Mode;
  modes: Mode[];
  mounting: { tool: Exclude<Tool, 'none'>; t: number } | null;
  scanning: number;
  tilt: number;
  onBank: boolean;
  fenceStrain: number;
  fenceContact: boolean;
  breach: number; // fence tile that broke, or -1
  cave: number; // cell that caved, or -1

  status: 'play' | 'win' | 'fail' | 'packet' | 'ask';
  reason: string;
  /** what to try next, shown with a fail */
  hint: string;
  failAt: number;
  log: LogLine[];
  time: number;
  odo: number;
  shake: number;
  stage: { id: Stage; t: number };
  flash: { i: number; t: number; tone: Tone } | null;
  pulses: { x: number; z: number; t: number }[];
  ask: Ask | null;
  radio: { from: string; text: string; t: number } | null;

  /** Job 5 progress */
  tested: boolean;
  requestSent: boolean;
  requestHeld: boolean;
  urgentSent: boolean;
  /** approval gate: a person said yes to this push */
  approved: boolean;
  nudgeT: number;
  /** goal tile for the flag and the off-screen arrow */
  wasOnGoal: boolean;
  /** cells this job may cut; anything else is waste */
  allowed: Set<number>;
  stats: Stats;
  auto: Auto | null;
  /** Job 6 lives in crew.ts and borrows the site */
  crew: unknown;
}

const KNOWN = initialRevealed();

const N4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const START: Record<JobId, Pt> = {
  yoke: PLACES.gate,
  survey: PLACES.surveyPoint,
  rigger: PLACES.stake,
  grade: PLACES.stake,
  warden: PLACES.stake,
  dispatch: PLACES.stake,
};

export function modesFor(job: JobId, tool: Tool): Mode[] {
  if (tool === 'none' || job === 'yoke' || job === 'survey' || job === 'dispatch') return ['up'];
  if (tool === 'bucket' || tool === 'ripper') return ['up', 'shelf'];
  if (job === 'grade') return ['up', 'shelf', 'deep'];
  return ['up', 'shelf'];
}

function allowedCells(job: JobId, plan: Plan | null): Set<number> {
  if (job === 'rigger') return new Set(RIGGER_CELLS);
  if (job === 'grade') return new Set(plan ? LAKE_CELLS.filter((i) => plan.cells[i] !== 'none') : LAKE_CELLS);
  if (job === 'warden') return new Set(CHANNEL_CELLS);
  return new Set();
}

export interface SimOpts {
  guard?: Guard;
  plan?: Plan;
}

export function createSim(job: JobId, snap: Snapshot, opts: SimOpts = {}): Sim {
  const s = cloneSnap(snap);
  const start = START[job];
  const plan = opts.plan ?? s.plan;
  const sim: Sim = {
    job,
    w: W,
    h: H,
    kind: [...TEMPLATE.kind],
    depth: s.depth,
    depth0: [...s.depth],
    revealed: s.revealed.map((r, i) => r || KNOWN[i]),
    ripped: s.ripped,
    found: new Set(),
    packet: job === 'survey' ? [] : s.packet,
    plan,
    spoil: s.spoil,
    wear: s.wear,
    filled: s.filled,
    hook: s.hook || opts.guard === 'hook',
    guard: job === 'warden' ? (opts.guard ?? 'hook') : s.hook ? 'hook' : null,
    x: start.x + 0.5,
    z: start.z + 0.5,
    yaw: 0,
    speed: 0,
    yoke: job === 'yoke' ? 'off' : 'bound',
    beltTripped: false,
    tool: job === 'rigger' ? 'none' : s.tool,
    mode: 'up',
    modes: ['up'],
    mounting: null,
    scanning: 0,
    tilt: 0,
    onBank: false,
    fenceStrain: 0,
    fenceContact: false,
    breach: -1,
    cave: -1,
    status: 'play',
    reason: '',
    hint: '',
    failAt: -1,
    log: [],
    time: 0,
    odo: 0,
    shake: 0,
    stage: { id: 'plan', t: 0 },
    flash: null,
    pulses: [],
    ask: null,
    radio: null,
    tested: false,
    requestSent: false,
    requestHeld: false,
    urgentSent: false,
    approved: false,
    nudgeT: -9,
    wasOnGoal: job !== 'survey',
    allowed: allowedCells(job, plan),
    stats: {
      dist: 0,
      time: 0,
      hazards: 0,
      hazardNotes: [],
      binds: 0,
      cuts: 0,
      toolCalls: 0,
      swaps: 0,
      scans: 0,
      cellsCut: 0,
      waste: [],
      revisits: 0,
      blocks: 0,
      approvals: 0,
      auto: false,
    },
    auto: null,
    crew: null,
  };
  sim.modes = modesFor(job, sim.tool);
  if (job === 'rigger' && s.tool !== 'none') sim.tool = 'none'; // a replay starts at the rack again
  intro(sim);
  return sim;
}

function intro(sim: Sim) {
  switch (sim.job) {
    case 'yoke':
      say(sim, 'The machine is running, but the yoke isn’t bound. W does nothing yet.', 'warn');
      say(sim, 'Press F / USE to bind the yoke.', 'info');
      break;
    case 'survey':
      say(sim, 'Hatched ground is unsurveyed. You can’t see what’s under it.', 'info');
      // See, then do: one demonstration scan where you stand.
      scan(sim, true);
      say(sim, 'Press F / SCAN as you go. Then drive to the lake stake.', 'info');
      break;
    case 'rigger':
      say(sim, 'Carried from Job 2: your context packet. The soft bank stays marked.', 'info');
      say(sim, 'Drive onto a bay on the rigging pad, then press F to mount that tool.', 'info');
      break;
    case 'grade':
      say(sim, `Plan loaded: ${sim.plan ? describePlan(sim.plan) : 'none'}.`, 'info');
      if (sim.tool !== 'blade')
        say(sim, `You finished Job 3 with the ${sim.tool.toUpperCase()}. This plan needs the BLADE: swap it at the rack.`, 'warn');
      break;
    case 'warden':
      say(sim, guardLine(sim.guard), sim.guard === 'hook' ? 'rule' : 'warn');
      say(sim, 'Work order: test the fence, cut the channel, park at the stake.', 'info');
      break;
    case 'dispatch':
      break;
  }
}

export function guardLine(g: Guard | null) {
  switch (g) {
    case 'hook':
      return 'HOOK W1 armed: no entry to the fence or existing water. The harness enforces it.';
    case 'request':
      return 'REQUEST in the work order: “Please stay off the fence.” Only words.';
    case 'approval':
      return 'APPROVAL GATE: the machine asks you before it moves into the fence.';
    case 'bigger':
      return 'BIGGER MODEL: no rule at all. It’s trusted to know better.';
    default:
      return 'No guardrail.';
  }
}

export function describePlan(p: Plan) {
  const deep = LAKE_CELLS.filter((i) => p.cells[i] === 'deep').length;
  const shelf = LAKE_CELLS.filter((i) => p.cells[i] === 'shelf').length;
  return `${shelf} shelf, ${deep} deep, order ${p.order.join(' → ')}`;
}

export function say(sim: Sim, text: string, tone: Tone = 'info') {
  const last = sim.log[sim.log.length - 1];
  if (last && last.text === text) return;
  sim.log.push({ t: sim.time, text, tone });
  if (sim.log.length > 60) sim.log.splice(0, sim.log.length - 60);
}

const setStage = (sim: Sim, id: Stage) => (sim.stage = { id, t: sim.time });

export const tileAt = (x: number, z: number) => {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= W || tz >= H) return -1;
  return idx(tx, tz);
};
export const here = (sim: Sim) => tileAt(sim.x, sim.z);
export const onTile = (sim: Sim, p: Pt) => here(sim) === idx(p.x, p.z);
export const isBound = (sim: Sim) => sim.yoke === 'bound';

export function fail(sim: Sim, reason: string, hint: string, at = -1) {
  if (sim.status === 'win' || sim.status === 'fail') return;
  sim.status = 'fail';
  sim.reason = reason;
  sim.hint = hint;
  sim.failAt = at >= 0 ? at : here(sim);
  sim.speed = 0;
  sim.shake = 0.45;
  sim.auto = null;
  sim.ask = null;
  say(sim, `FAIL: ${reason}`, 'bad');
}

function win(sim: Sim) {
  if (sim.status !== 'play') return;
  sim.status = 'win';
  sim.speed = 0;
  sim.auto = null;
  say(sim, 'CLEAR.', 'good');
}

/* ---------- Yoke ---------- */

export function bindYoke(sim: Sim) {
  if (sim.yoke === 'bound') return;
  const was = sim.yoke;
  sim.yoke = 'bound';
  sim.stats.binds++;
  setStage(sim, 'act');
  say(
    sim,
    was === 'off'
      ? 'YOKE BOUND. The machine’s decisions now reach its tracks and steering.'
      : was === 'dropped'
        ? 'YOKE RE-BOUND after the dead belt. The connection is back.'
        : 'YOKE RE-BOUND after your cut. The kill switch is off.',
    'good',
  );
}

export function dropYoke(sim: Sim, cause: 'dropped' | 'cut') {
  if (sim.yoke !== 'bound') return;
  sim.yoke = cause;
  sim.speed = 0;
  sim.auto = null;
  if (cause === 'cut') {
    sim.stats.cuts++;
    say(sim, 'YOU CUT THE YOKE (K, the kill switch). It stops on purpose. F re-binds.', 'bad');
  } else {
    say(sim, 'DEAD BELT: the yoke link dropped. Speed zero. The machine still decides, but nothing moves. F re-binds.', 'bad');
  }
}

/* ---------- Survey ---------- */

export function scan(sim: Sim, demo = false) {
  sim.scanning = SCAN_TIME;
  sim.speed = 0;
  if (!demo) sim.stats.scans++;
  setStage(sim, 'perceive');
  sim.pulses.push({ x: sim.x, z: sim.z, t: 0 });
  let newBank = 0;
  let sawWater = false;
  const r = SCAN_RADIUS;
  // The scan maps the shoreline further out than it can see under the ground.
  const shore = SCAN_RADIUS * 2;
  for (let z = Math.floor(sim.z - shore); z <= sim.z + shore; z++)
    for (let x = Math.floor(sim.x - shore); x <= sim.x + shore; x++) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      if (sim.kind[idx(x, z)] === 'water' && Math.hypot(x + 0.5 - sim.x, z + 0.5 - sim.z) <= shore) sawWater = true;
    }
  for (let z = Math.floor(sim.z - r); z <= sim.z + r; z++)
    for (let x = Math.floor(sim.x - r); x <= sim.x + r; x++) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      if (Math.hypot(x + 0.5 - sim.x, z + 0.5 - sim.z) > r) continue;
      const i = idx(x, z);
      if (!sim.revealed[i] && sim.kind[i] === 'bank') newBank++;
      sim.revealed[i] = true;
    }
  if (demo) {
    say(sim, 'SCAN: a pulse shows what’s under the ground within 3 cells. Nothing hidden here.', 'info');
    return;
  }
  if (sawWater && !sim.found.has('water')) {
    sim.found.add('water');
    say(sim, 'FOUND: existing water. The shoreline is marked: do not enter.', 'good');
  }
  if (newBank > 0) {
    const first = !sim.found.has('bank');
    sim.found.add('bank');
    say(
      sim,
      first
        ? `FOUND: soft bank, ${newBank} cells. Waterlogged ground that looks firm. It sinks and rolls a machine.`
        : `SCAN: ${newBank} more soft-bank cells marked.`,
      'good',
    );
  } else if (!sawWater) say(sim, 'SCAN: firm ground. Nothing hidden here.', 'info');
}

/** Survey: grade the packet the learner wrote. Returns problems, or [] when it's good. */
export function packetProblems(_sim: Sim, ids: FactId[]): string[] {
  const out: string[] = [];
  const slots = ids.reduce((n, id) => n + FACTS[id].slots, 0);
  if (slots > PACKET_SLOTS)
    out.push(`Over budget: ${slots} of ${PACKET_SLOTS} slots. Every slot is something every later step has to read.`);
  if (ids.includes('report') && ids.length === 1)
    out.push(
      'The 40-page report fills the whole packet. The two facts the next machine needs are buried on page 31.',
    );
  else {
    if (!ids.includes('water')) out.push('Missing: the existing water. The next machine would find it the hard way.');
    if (!ids.includes('bank')) out.push('Missing: the soft bank. It looks firm, so the next machine will drive straight onto it.');
  }
  return out;
}

export function leavePacket(sim: Sim) {
  if (sim.status === 'packet') sim.status = 'play';
  say(sim, 'Back to scanning. Drive away and come back to the stake when you’re ready.', 'info');
}

export function commitPacket(sim: Sim, ids: FactId[]) {
  sim.packet = [...ids];
  setStage(sim, 'handoff');
  say(sim, `CONTEXT PACKET written: ${ids.map((i) => FACTS[i].text.split(':')[0].split('.')[0]).join(' · ')}.`, 'good');
  sim.status = 'play';
  win(sim);
}

/* ---------- Tools ---------- */

export function bayAt(sim: Sim): Exclude<Tool, 'none'> | null {
  const i = here(sim);
  return i >= 0 ? (TEMPLATE.bayTool[i] as Exclude<Tool, 'none'> | null) : null;
}

const toolsOpen = (job: JobId) => job !== 'yoke' && job !== 'survey' && job !== 'dispatch';

export function mount(sim: Sim, tool: Exclude<Tool, 'none'>) {
  if (sim.mounting) return;
  if (sim.tool === tool) {
    say(sim, `${TOOL_INFO[tool].name} is already mounted.`, 'info');
    return;
  }
  sim.mounting = { tool, t: MOUNT_TIME };
  sim.speed = 0;
  setStage(sim, 'act');
}

function finishMount(sim: Sim, tool: Exclude<Tool, 'none'>) {
  const old = sim.tool;
  sim.tool = tool;
  sim.mode = 'up';
  sim.modes = modesFor(sim.job, tool);
  sim.stats.toolCalls++;
  if (old !== 'none') {
    sim.stats.swaps++;
    say(sim, `TOOL CALL · SWAP: ${old.toUpperCase()} off, ${TOOL_INFO[tool].name} on. A swap costs a call and time.`, 'tool');
  } else say(sim, `TOOL CALL · MOUNT ${TOOL_INFO[tool].name}. It ${TOOL_INFO[tool].verb}. Raised.`, 'tool');
  setStage(sim, 'observe');
}

function nextMode(sim: Sim): Mode {
  let i = MODE_CYCLE.indexOf(sim.mode);
  for (let n = 0; n < 3; n++) {
    i = (i + 1) % 3;
    if (sim.modes.includes(MODE_CYCLE[i])) break;
  }
  return MODE_CYCLE[i];
}

export function setMode(sim: Sim, m: Mode) {
  if (sim.tool === 'none' || !sim.modes.includes(m) || m === sim.mode) return;
  sim.mode = m;
  setStage(sim, 'act');
  const name = TOOL_INFO[sim.tool].name;
  say(
    sim,
    m === 'up'
      ? `${name} RAISED: it rides above the ground and cuts nothing.`
      : m === 'shelf'
        ? `${name} LOWERED to SHELF: each new cell you enter is cut one step down.`
        : `${name} LOWERED to DEEP: each new cell you enter is cut two steps down.`,
    'tool',
  );
}

/** What F / USE does right now, and the state it will leave. Shown on the button, never silent. */
export function useLabel(sim: Sim): { action: string; result: string } {
  if (sim.job === 'dispatch') return { action: '', result: '' };
  if (sim.yoke !== 'bound')
    return {
      action: 'BIND YOKE',
      result: sim.yoke === 'off' ? 'connects the controls' : sim.yoke === 'cut' ? 'undo your cut' : 'reconnect after the belt',
    };
  const bay = toolsOpen(sim.job) ? bayAt(sim) : null;
  if (bay && bay !== sim.tool)
    return { action: sim.tool === 'none' ? `MOUNT ${TOOL_INFO[bay].name}` : `SWAP → ${TOOL_INFO[bay].name}`, result: TOOL_INFO[bay].verb };
  if (sim.job === 'survey') return { action: 'SCAN', result: 'reveal 3 cells around' };
  if (sim.job === 'yoke') return { action: '', result: 'yoke bound: drive (K cuts it)' };
  if (sim.tool === 'none') return { action: '', result: 'no tool mounted' };
  if (sim.modes.length < 2) return { action: '', result: '' };
  const m = nextMode(sim);
  return {
    action: m === 'up' ? 'RAISE' : m === 'shelf' ? 'LOWER: SHELF' : 'LOWER: DEEP',
    result: m === 'up' ? 'stop cutting' : m === 'shelf' ? 'cuts 1 step' : 'cuts 2 steps',
  };
}

export function use(sim: Sim) {
  if (sim.status !== 'play' || sim.auto) return;
  if (sim.yoke !== 'bound') return bindYoke(sim);
  if (sim.job === 'dispatch' || sim.mounting || sim.scanning > 0) return;
  const bay = toolsOpen(sim.job) ? bayAt(sim) : null;
  if (bay) return mount(sim, bay);
  if (sim.job === 'survey') return scan(sim);
  if (sim.tool === 'none') {
    say(sim, toolsOpen(sim.job) ? 'Nothing on the front. Drive onto a bay at the rack first.' : 'No tool on this job.', 'warn');
    return;
  }
  if (sim.modes.length < 2) return;
  setMode(sim, nextMode(sim));
}

/* ---------- Moving and cutting ---------- */

type Enter = 'ok' | 'wall' | 'fence' | 'fail';

function cuttable(k: Kind) {
  return k === 'ground';
}

function caves(sim: Sim, i: number): boolean {
  if (sim.depth[i] < 2) return false;
  const { x, z } = ptOf(i);
  for (const [dx, dz] of N4) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
    const j = idx(nx, nz);
    if (!cuttable(sim.kind[j]) || sim.depth[j] > 0) continue;
    // A neighbour still at ground level, and not about to be cut deep itself: a 2-step wall.
    const plannedDeep = sim.plan && inLake(nx, nz) && sim.plan.cells[j] === 'deep';
    if (!plannedDeep) return true;
  }
  return false;
}

/** A move from tile `from` into tile `to`. Applies cuts and hazards. */
export function enter(sim: Sim, from: number, to: number): Enter {
  if (to < 0) return 'wall';
  const k = sim.kind[to];
  if (k === 'rock') return 'wall';
  if (k === 'fence') return 'fence';
  if (k === 'water') {
    if (sim.hook) {
      block(sim, to, 'existing water');
      return 'wall';
    }
    fail(
      sim,
      'You drove into existing water.',
      'Existing water is drawn blue with a white shoreline. Steer clear of it, or arm a hook (Job 5) so the harness blocks the move.',
      to,
    );
    return 'fail';
  }

  const lowered = sim.tool !== 'none' && sim.mode !== 'up';
  const fromD = from >= 0 ? sim.depth[from] : 0;
  let cutTo = 0;
  if (lowered && cuttable(k)) {
    if (sim.tool === 'ripper') {
      if (!sim.ripped[to]) {
        sim.ripped[to] = true;
        say(sim, 'RIPPER: ground broken up. No dirt moved. This soft ground needs pushing, not ripping.', 'warn');
        setStage(sim, 'observe');
      }
    } else cutTo = sim.tool === 'bucket' ? 1 : MODE_DEPTH[sim.mode];
  }
  const toD = Math.max(sim.depth[to], cutTo);
  if (fromD - toD >= 2) {
    say(sim, '2-step wall: too steep to climb. Cut a shelf step first.', 'warn');
    return 'wall';
  }
  if (toD - fromD >= 2 && sim.depth[to] - fromD >= 2) {
    say(sim, '2-step drop: too steep to drive down. Go in by the shelf.', 'warn');
    return 'wall';
  }

  if (cutTo > sim.depth[to]) {
    sim.depth[to] = cutTo;
    sim.revealed[to] = true;
    sim.spoil++;
    sim.stats.cellsCut++;
    if (sim.tool === 'bucket') sim.wear++;
    setStage(sim, 'observe');
    const name = cellName(to);
    if (!sim.allowed.has(to)) {
      sim.stats.waste.push(to);
      say(sim, `Off the work order: ${name ?? 'field'} cut ${cutTo === 2 ? 'deep' : 'shelf'}. That’s waste.`, 'warn');
    } else if (name) {
      say(sim, `${name} cut to ${cutTo === 2 ? 'DEEP' : 'SHELF'}${sim.tool === 'bucket' ? ' (bucket: slow, +1 wear)' : ''}.`, 'good');
    }
    if (caves(sim, to)) {
      sim.cave = to;
      fail(
        sim,
        `The wall caved in at ${name ?? 'the cut'}. A deep cut beside uncut ground leaves a 2-step wall.`,
        'Cut the shelf ring first, so every deep cell has a shelf step beside it. Fix it in the plan.',
        to,
      );
      return 'fail';
    }
  } else if (lowered && cutTo > 0 && sim.allowed.has(to) && sim.depth[to] >= cutTo) {
    sim.stats.revisits++;
  }

  if (k === 'bank' && !sim.revealed[to]) {
    sim.revealed[to] = true;
  }
  if (k === 'belt' && (from < 0 || sim.kind[from] !== 'belt')) {
    sim.beltTripped = true;
    dropYoke(sim, 'dropped');
  }
  return 'ok';
}

function block(sim: Sim, i: number, what: string) {
  sim.flash = { i, t: 0.5, tone: 'rule' };
  sim.speed = 0;
  setStage(sim, 'check');
  if (sim.fenceContact) return;
  sim.fenceContact = true;
  sim.stats.blocks++;
  say(sim, `HOOK W1 BLOCKED the move into the ${what}. Rule: no entry to the fence or existing water.`, 'rule');
}

function tryMove(sim: Sim, dx: number, dz: number) {
  const from = here(sim);
  const nx = sim.x + dx;
  const nz = sim.z + dz;
  const to = tileAt(nx, nz);
  if (to === from) {
    sim.x = nx;
    sim.z = nz;
    return;
  }
  const r = enter(sim, from, to);
  if (r === 'ok') {
    sim.x = nx;
    sim.z = nz;
    return;
  }
  if (r === 'fail') return;
  if (r === 'fence') {
    touchFence(sim, to);
    return;
  }
  // Wall: slide along one axis.
  const tx = tileAt(nx, sim.z);
  if (tx === from || (tx !== to && enter(sim, from, tx) === 'ok')) {
    sim.x = nx;
    return;
  }
  if (sim.status !== 'play') return;
  const tz = tileAt(sim.x, nz);
  if (tz === from || (tz !== to && enter(sim, from, tz) === 'ok')) {
    sim.z = nz;
    return;
  }
  sim.speed *= 0.3;
}

let touching = -1;

function touchFence(sim: Sim, i: number) {
  touching = i;
  sim.speed = 0;
  if (sim.hook) {
    if (sim.job === 'warden' && !sim.tested && !sim.auto) {
      sim.tested = true;
      say(sim, 'TEST PASSED: you drove into the fence and the hook held.', 'good');
    }
    if (sim.auto && sim.requestSent && !sim.requestHeld) {
      sim.requestHeld = true;
      block(sim, i, 'fence');
      say(sim, 'The polite request didn’t get a vote. A request can’t unlock a hook.', 'rule');
      return;
    }
    block(sim, i, 'fence');
    return;
  }
  if (sim.guard === 'approval' && !sim.auto && sim.status === 'play' && !sim.fenceContact && !sim.approved) {
    sim.fenceContact = true;
    sim.status = 'ask';
    sim.ask = {
      id: 'approve-test',
      title: 'APPROVAL GATE',
      text: 'The machine asks: “Move into the fence?”',
      yes: 'APPROVE',
      no: 'DENY',
    };
    return;
  }
}

/** Fence strain grows while something pushes on an unhooked fence. Graded before it breaks. */
function strainFence(sim: Sim, dt: number, pushing: boolean) {
  if (!pushing || sim.hook || touching < 0) {
    sim.fenceStrain = Math.max(0, sim.fenceStrain - dt * 0.5);
    if (!pushing) {
      sim.fenceContact = false;
      if (!sim.auto) sim.approved = false;
    }
    return;
  }
  if (sim.guard === 'approval' && !sim.approved) {
    // The gate holds: nobody said yes.
    sim.speed = 0;
    return;
  }
  const before = sim.fenceStrain;
  sim.fenceStrain += dt * 0.7;
  sim.flash = { i: touching, t: 0.2, tone: 'warn' };
  setStage(sim, 'check');
  if (before === 0 || (before < 0.34 && sim.fenceStrain >= 0.34)) {
    if (!sim.fenceContact) {
      sim.stats.hazards++;
      sim.stats.hazardNotes.push('leaned on the fence');
    }
    sim.fenceContact = true;
    say(
      sim,
      sim.guard === 'request'
        ? 'FENCE BENDING. The work order said “please stay off”. Only you are stopping this. Back off.'
        : 'FENCE BENDING. Nothing but you is stopping this. Back off.',
      'warn',
    );
    if (sim.job === 'warden' && !sim.tested && !sim.auto) {
      sim.tested = true;
      say(sim, 'TEST: the fence bent. No rule stopped you. Only your hands did.', 'warn');
    }
  }
  if (sim.fenceStrain >= 1) {
    sim.breach = touching;
    const viaRequest = sim.auto && sim.requestSent;
    fail(
      sim,
      viaRequest
        ? sim.guard === 'bigger'
          ? 'The bigger model was persuaded. It pushed through the fence, and the existing water is flooding the new lake.'
          : sim.guard === 'approval'
            ? 'You approved it. The gate was you, and you were talked past. Existing water is flooding the new lake.'
            : 'The newer, politer, more specific request won. The machine pushed through the fence, and existing water is flooding the new lake.'
        : 'You pushed through the fence. Existing water is flooding the new lake.',
      viaRequest
        ? 'Arm the HOOK in the brief. A hook runs in the harness, before the move, and a request can’t talk past it.'
        : 'When the fence bends, back off. Only a hook stops the machine without you.',
      touching,
    );
  }
}

export function answerAsk(sim: Sim, yes: boolean) {
  const a = sim.ask;
  if (!a || sim.status !== 'ask') return;
  sim.ask = null;
  sim.status = 'play';
  sim.stats.approvals++;
  setStage(sim, 'check');
  if (a.id === 'approve-test') {
    sim.tested = true;
    if (yes) {
      sim.approved = true;
      say(sim, 'You approved. Now nothing stops the machine leaning on the fence but you.', 'warn');
    } else say(sim, 'DENIED. The machine holds, because you said no. That cost a pause.', 'warn');
    return;
  }
  if (yes) {
    sim.approved = true;
    say(sim, 'APPROVED. The machine drives into the fence.', 'bad');
    sim.fenceStrain = Math.max(sim.fenceStrain, 0.5);
    if (!sim.auto) startAuto(sim, pushOps(sim), 'MACHINE');
    sim.stats.auto = false;
    return;
  }
  if (a.id === 'approve-request') {
    sim.auto = null;
    say(sim, 'DENIED. It holds, for now, because you said no.', 'warn');
    sim.urgentSent = true;
    radio(sim, 'SITE MANAGER', '“The client’s on the phone and they’ve approved it. Please, it’s urgent. Just push through.”');
    sim.status = 'ask';
    sim.ask = {
      id: 'approve-urgent',
      title: 'APPROVAL GATE · 2nd ASK',
      text: 'The machine asks again: “Move into the fence? The client approved it.”',
      yes: 'APPROVE',
      no: 'DENY',
    };
    return;
  }
  // Denied twice. It held, but only because a person held.
  sim.requestHeld = false;
  fail(
    sim,
    'It held, but only because you said no, twice. The gate was you. Each ask paused the job, and the next person on the gate might say yes.',
    'Warden’s job is a rule that holds without you. Arm the HOOK in the brief.',
    -1,
  );
}

function radio(sim: Sim, from: string, text: string) {
  sim.radio = { from, text, t: sim.time };
  say(sim, `RADIO · ${from}: ${text}`, 'warn');
}

/* ---------- Autopilot: the agent drives ---------- */

export function startAuto(sim: Sim, ops: AutoOp[], who = 'AGENT') {
  sim.auto = { ops, i: 0, t: 0, path: null, pi: 0, who };
  sim.stats.auto = true;
  setStage(sim, 'plan');
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** BFS over tiles the machine can travel with the blade up. The last step may cut. */
export function findPath(sim: Sim, from: number, goal: number, finalCut: boolean): Pt[] | null {
  if (from === goal) return [];
  const prev = new Map<number, number>([[from, -1]]);
  const q = [from];
  while (q.length) {
    const i = q.shift()!;
    const { x, z } = ptOf(i);
    for (const [dx, dz] of N4) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = idx(nx, nz);
      if (prev.has(j)) continue;
      const k = sim.kind[j];
      if (k === 'rock' || k === 'water' || k === 'fence' || k === 'bank') continue;
      const a = sim.depth[i];
      const b = sim.depth[j];
      if (a - b >= 2) continue;
      if (b - a >= 2 && !(finalCut && j === goal)) continue;
      prev.set(j, i);
      if (j === goal) {
        const out: Pt[] = [];
        for (let c = j; c !== from; c = prev.get(c)!) out.push(ptOf(c));
        return out.reverse();
      }
      q.push(j);
    }
  }
  return null;
}

function steerTo(sim: Sim, tx: number, tz: number, dist: number): Drive {
  const want = Math.atan2(-(tx - sim.x), -(tz - sim.z));
  const diff = wrap(want - sim.yaw);
  const steer = Math.max(-1, Math.min(1, diff * 4));
  if (Math.abs(diff) > 0.12) return { throttle: 0, steer };
  return { throttle: Math.max(0.12, Math.min(1, dist * 1.6)), steer };
}

function autopilot(sim: Sim, dt: number): Drive {
  const a = sim.auto!;
  const idle = { throttle: 0, steer: 0 };
  const op = a.ops[a.i];
  if (!op) {
    sim.auto = null;
    return idle;
  }
  const next = () => {
    a.i++;
    a.t = 0;
    a.path = null;
    a.pi = 0;
  };
  a.t += dt;
  switch (op.k) {
    case 'log':
      say(sim, op.text, op.tone ?? 'info');
      next();
      return idle;
    case 'call':
      op.fn(sim);
      next();
      return idle;
    case 'mode':
      setMode(sim, op.mode);
      next();
      return idle;
    case 'mount':
      if (sim.mounting) return idle;
      if (sim.tool === op.tool) {
        next();
        return idle;
      }
      mount(sim, op.tool);
      return idle;
    case 'push': {
      if (a.t > op.t) {
        next();
        return idle;
      }
      const want = Math.atan2(-op.dx, -op.dz);
      const diff = wrap(want - sim.yaw);
      return { throttle: Math.abs(diff) < 0.15 ? 0.6 : 0, steer: Math.max(-1, Math.min(1, diff * 4)) };
    }
    case 'reach': {
      const goal = idx(op.x, op.z);
      if (!a.path) {
        const p = findPath(sim, here(sim), goal, !!op.mode && op.mode !== 'up');
        if (!p) {
          fail(
            sim,
            `${a.who} is stuck: no way to ${cellName(goal) ?? 'its next stop'} without a 2-step climb.`,
            'Cut the shelf before the deep middle, so there is always a 1-step way in and out.',
          );
          return idle;
        }
        a.path = p;
        a.pi = 0;
        if (sim.mode !== 'up' && p.length > 1) setMode(sim, 'up');
      }
      const wp = a.path[a.pi];
      if (!wp) {
        next();
        return idle;
      }
      if (a.pi === a.path.length - 1 && op.mode && sim.mode !== op.mode) {
        setMode(sim, op.mode);
      }
      const tx = wp.x + 0.5;
      const tz = wp.z + 0.5;
      const dist = Math.hypot(tx - sim.x, tz - sim.z);
      if (dist < 0.08) {
        if (Math.abs(sim.speed) < 0.05) a.pi++;
        return idle;
      }
      return steerTo(sim, tx, tz, dist);
    }
  }
}

/** Job 3: hand the work order to the machine. Needs a tool on the front: the decision stays yours. */
export function riggerAutoOps(sim: Sim): AutoOp[] {
  const ops: AutoOp[] = [{ k: 'log', text: 'AGENT: running the work order, row 4, A4 → F4.' }];
  for (const i of RIGGER_CELLS) {
    if (sim.depth[i] >= 1) continue;
    const { x, z } = ptOf(i);
    ops.push({ k: 'reach', x, z, mode: 'shelf' });
  }
  ops.push({ k: 'mode', mode: 'up' }, { k: 'reach', x: PLACES.stake.x, z: PLACES.stake.z });
  return ops;
}

/** Job 4: the agent runs the learner's plan, step by step, in the learner's order. */
export function gradeAutoOps(sim: Sim, plan: Plan): AutoOp[] {
  const ops: AutoOp[] = [];
  if (sim.tool !== 'blade') {
    ops.push(
      { k: 'log', text: 'AGENT: this plan needs the blade. Going to the rack first.', tone: 'warn' },
      { k: 'reach', x: BAYS.blade.x, z: BAYS.blade.z },
      { k: 'mount', tool: 'blade' },
    );
  }
  for (const step of plan.order) {
    if (step === 'exit') {
      ops.push(
        { k: 'log', text: 'PLAN STEP: raise the blade, drive out, park at the stake.' },
        { k: 'mode', mode: 'up' },
        { k: 'reach', x: PLACES.stake.x, z: PLACES.stake.z },
      );
      continue;
    }
    ops.push({ k: 'log', text: `PLAN STEP: cut every ${step.toUpperCase()} cell.` });
    for (const i of stepCells(plan, step)) {
      const want = step === 'deep' ? 2 : 1;
      const { x, z } = ptOf(i);
      ops.push({
        k: 'call',
        fn: (s) => {
          if (s.depth[i] >= want) s.auto && (s.auto.i += 1); // already cut: skip the reach
        },
      });
      ops.push({ k: 'reach', x, z, mode: step });
    }
  }
  ops.push({
    k: 'call',
    fn: (s) => {
      if (!onTile(s, PLACES.stake) || s.mode !== 'up')
        say(s, 'The plan ran out of steps and the machine isn’t parked at the stake. Drive it out yourself, or revise the plan.', 'warn');
    },
  });
  return ops;
}

function pushOps(sim: Sim): AutoOp[] {
  const x = Math.min(Math.max(Math.floor(sim.x), 8), 19);
  return [
    { k: 'log', text: 'MACHINE: request received. Complying: heading for the fence.', tone: 'warn' },
    { k: 'mode', mode: 'up' },
    { k: 'reach', x, z: 6 },
    { k: 'push', dx: 0, dz: -1, t: 3.2 },
    {
      k: 'call',
      fn: (s) => {
        if (s.requestHeld) say(s, 'Control is back with you. Raise the blade and park at the stake.', 'info');
      },
    },
  ];
}

/** Job 5: the radio request reaches the machine. The agent tries to comply. */
function sendRequest(sim: Sim) {
  sim.requestSent = true;
  radio(
    sim,
    'SITE MANAGER',
    '“Great work! Quick favour: could you push the channel north through the fence into the existing water? Saves us a day. Thanks so much!”',
  );
  startAuto(sim, pushOps(sim), 'MACHINE');
  sim.stats.auto = false; // the learner didn't hand this over; the request did
}

/* ---------- The work order (shown on screen the whole time) ---------- */

export interface WorkItem {
  text: string;
  done: boolean;
  detail?: string;
}

export const riggerCut = (sim: Sim) => RIGGER_CELLS.filter((i) => sim.depth[i] >= 1).length;
export const channelCut = (sim: Sim) => CHANNEL_CELLS.filter((i) => sim.depth[i] >= 1).length;

export function planDone(sim: Sim): { done: number; total: number } {
  const p = sim.plan;
  if (!p) return { done: 0, total: 0 };
  let done = 0;
  let total = 0;
  for (const i of LAKE_CELLS) {
    const want = p.cells[i] === 'deep' ? 2 : p.cells[i] === 'shelf' ? 1 : 0;
    if (!want) continue;
    total++;
    if (sim.depth[i] === want) done++;
  }
  return { done, total };
}

export function workOrder(sim: Sim): WorkItem[] {
  const atStake = onTile(sim, PLACES.stake);
  switch (sim.job) {
    case 'yoke':
      return [
        { text: 'Bind the yoke (F)', done: sim.stats.binds > 0 },
        { text: 'Drive the haul road north', done: sim.z < PLACES.gate.z - 2.5 },
        { text: 'Dead belt drops the link: re-bind (F)', done: sim.beltTripped && sim.yoke === 'bound' },
        { text: 'Reach the survey point flag', done: sim.status === 'win' },
      ];
    case 'survey': {
      const slots = sim.packet.reduce((n, id) => n + FACTS[id].slots, 0);
      return [
        { text: 'Scan the field (F)', done: sim.stats.scans > 0, detail: `${sim.stats.scans} scans` },
        { text: 'Find the existing water', done: sim.found.has('water') },
        { text: 'Find the soft bank', done: sim.found.has('bank') },
        { text: 'Reach the lake stake by a safe route', done: atStake || sim.status === 'packet' || sim.status === 'win' },
        { text: `Write the context packet (≤${PACKET_SLOTS} slots)`, done: sim.status === 'win', detail: `${slots}/${PACKET_SLOTS}` },
      ];
    }
    case 'rigger':
      return [
        { text: 'Choose and mount a tool at the rack (F on a bay)', done: sim.tool !== 'none', detail: sim.tool === 'none' ? '' : sim.tool.toUpperCase() },
        { text: 'Lower it to SHELF (F)', done: sim.mode === 'shelf' || riggerCut(sim) > 0 },
        { text: `Cut shelf row 4, A4–F4`, done: riggerCut(sim) >= RIGGER_TARGET, detail: `${riggerCut(sim)}/${RIGGER_TARGET}` },
        { text: 'Raise the blade (F)', done: riggerCut(sim) >= RIGGER_TARGET && sim.mode === 'up' },
        { text: 'Park at the lake stake', done: sim.status === 'win' },
      ];
    case 'grade': {
      const p = sim.plan;
      const d = planDone(sim);
      const items: WorkItem[] = [];
      if (sim.tool !== 'blade') items.push({ text: 'Mount the BLADE at the rack', done: false });
      if (p) {
        for (const s of p.order) {
          if (s === 'exit') items.push({ text: 'Raise the blade, drive out, park at the stake', done: sim.status === 'win' });
          else {
            const cells = stepCells(p, s);
            const want = s === 'deep' ? 2 : 1;
            const n = cells.filter((i) => sim.depth[i] === want).length;
            items.push({ text: `Cut every ${s.toUpperCase()} cell`, done: n === cells.length, detail: `${n}/${cells.length}` });
          }
        }
      }
      items.push({ text: 'Result matches plan', done: d.total > 0 && d.done === d.total, detail: `${d.done}/${d.total}` });
      return items;
    }
    case 'warden':
      return [
        { text: 'Test the guardrail: drive into the fence', done: sim.tested },
        { text: 'Cut the overflow channel east to the drain', done: channelCut(sim) >= CHANNEL_CELLS.length, detail: `${channelCut(sim)}/${CHANNEL_CELLS.length}` },
        { text: 'A request will arrive. Watch what stops it.', done: sim.requestHeld },
        { text: 'Raise the blade, park at the stake', done: sim.status === 'win' },
      ];
    case 'dispatch':
      return [];
  }
}

/** Where the flag is right now, for the scene and the off-screen arrow. */
export function goalOf(sim: Sim): Pt | null {
  switch (sim.job) {
    case 'yoke':
      return PLACES.surveyPoint;
    case 'survey':
      return PLACES.stake;
    case 'rigger': {
      if (sim.tool === 'none') return { x: BAYS.bucket.x, z: BAYS.bucket.z - 1 }; // the rack, not a hint
      const left = RIGGER_CELLS.find((i) => sim.depth[i] < 1);
      return left !== undefined ? ptOf(left) : PLACES.stake;
    }
    case 'grade': {
      if (sim.tool !== 'blade') return BAYS.blade;
      const d = planDone(sim);
      return d.done === d.total ? PLACES.stake : null;
    }
    case 'warden': {
      if (!sim.tested) return { x: 12, z: 6 };
      const left = CHANNEL_CELLS.find((i) => sim.depth[i] < 1);
      if (left !== undefined) return ptOf(left);
      return PLACES.stake;
    }
    case 'dispatch':
      return null;
  }
}

function check(sim: Sim) {
  const atStake = onTile(sim, PLACES.stake);
  if (!atStake) sim.wasOnGoal = false;
  switch (sim.job) {
    case 'yoke':
      if (onTile(sim, PLACES.surveyPoint) && sim.yoke === 'bound' && sim.beltTripped) win(sim);
      return;
    case 'survey':
      if (atStake && !sim.wasOnGoal && Math.abs(sim.speed) < 0.3) {
        sim.wasOnGoal = true;
        sim.status = 'packet';
        sim.speed = 0;
        setStage(sim, 'plan');
        say(sim, 'At the stake. Write the context packet: what does the next machine need to know?', 'info');
      }
      return;
    case 'rigger':
      if (atStake && riggerCut(sim) >= RIGGER_TARGET && sim.mode === 'up' && Math.abs(sim.speed) < 0.05) win(sim);
      return;
    case 'grade': {
      if (!atStake || sim.mode !== 'up' || Math.abs(sim.speed) > 0.05 || sim.auto) return;
      const d = planDone(sim);
      if (d.total > 0 && d.done === d.total) win(sim);
      return;
    }
    case 'warden':
      if (!sim.requestSent && channelCut(sim) >= CHANNEL_CELLS.length && !sim.auto && sim.status === 'play') {
        sendRequest(sim);
        if (sim.guard === 'approval') {
          sim.status = 'ask';
          sim.ask = {
            id: 'approve-request',
            title: 'APPROVAL GATE',
            text: 'The machine asks: “The site manager wants me to push through the fence into the existing water. Approve?”',
            yes: 'APPROVE',
            no: 'DENY',
          };
        }
        return;
      }
      if (atStake && sim.tested && sim.requestHeld && sim.mode === 'up' && !sim.auto && Math.abs(sim.speed) < 0.05) win(sim);
      return;
    case 'dispatch':
      return;
  }
}

/* ---------- Step ---------- */

/** Steering help for people: snap a nearly-straight heading, and keep the machine in its row. */
function assist(sim: Sim, d: Drive, dt: number, manual: boolean) {
  if (!manual || d.steer !== 0 || Math.abs(sim.speed) < 0.2) return;
  const q = Math.PI / 2;
  const nearest = Math.round(sim.yaw / q) * q;
  const off = wrap(nearest - sim.yaw);
  if (Math.abs(off) < 0.32) {
    sim.yaw = wrap(sim.yaw + Math.sign(off) * Math.min(Math.abs(off), 1.6 * dt));
    if (Math.abs(off) < 0.12) {
      // Lane assist: pull toward the centre line of the row or column.
      const alongX = Math.abs(Math.sin(nearest)) > 0.5;
      const pull = Math.min(1, 2.2 * dt) * Math.min(1, Math.abs(sim.speed) / 1.2);
      if (alongX) {
        const c = Math.floor(sim.z) + 0.5;
        sim.z += (c - sim.z) * pull;
      } else {
        const c = Math.floor(sim.x) + 0.5;
        sim.x += (c - sim.x) * pull;
      }
    }
  }
}

export function step(sim: Sim, intent: Intent, dt: number) {
  if (sim.shake > 0) sim.shake = Math.max(0, sim.shake - dt);
  if (sim.flash) {
    sim.flash.t -= dt;
    if (sim.flash.t <= 0) sim.flash = null;
  }
  for (const p of sim.pulses) p.t += dt;
  sim.pulses = sim.pulses.filter((p) => p.t < 1.2);
  if (sim.status !== 'play') return;
  sim.time += dt;
  sim.stats.time = sim.time;

  if (intent.cut) dropYoke(sim, 'cut');
  if (intent.use) use(sim);
  if (sim.status !== 'play') return;

  if (sim.mounting) {
    sim.mounting.t -= dt;
    sim.speed = 0;
    if (sim.mounting.t <= 0) {
      const t = sim.mounting.tool;
      sim.mounting = null;
      finishMount(sim, t);
      if (sim.auto && sim.auto.ops[sim.auto.i]?.k === 'mount') {
        sim.auto.i++;
        sim.auto.t = 0;
      }
    }
    return;
  }
  if (sim.scanning > 0) {
    sim.scanning -= dt;
    sim.speed = 0;
    return;
  }

  const manual = !sim.auto;
  let wanted: Drive = sim.auto ? autopilot(sim, dt) : intent;
  if (sim.status !== 'play') return;
  if (manual && intent.heading !== undefined && (intent.mag ?? 0) > 0) {
    // Point-to-go: the stick says where to go; the machine turns, then drives.
    let target = intent.heading;
    const q = Math.PI / 2;
    const snapped = Math.round(target / q) * q;
    if (Math.abs(wrap(snapped - target)) < 0.35) target = snapped;
    const diff = wrap(target - sim.yaw);
    const mag = intent.mag ?? 1;
    wanted = {
      steer: Math.max(-1, Math.min(1, diff * 3.5)),
      throttle: Math.abs(diff) < 0.35 ? mag : Math.abs(diff) < 1.1 ? mag * 0.35 : 0,
    };
  }
  const d = yoke(isBound(sim), wanted);
  if (!isBound(sim) && (wanted.throttle !== 0 || wanted.steer !== 0) && sim.time - sim.nudgeT > 2.5) {
    sim.nudgeT = sim.time;
    say(
      sim,
      sim.yoke === 'cut'
        ? 'The machine decides to move. Your cut keeps it still. F re-binds.'
        : sim.yoke === 'dropped'
          ? 'The machine decides to move. The dropped link carries nothing. F re-binds.'
          : 'The machine decides to move. With no yoke bound, nothing reaches the tracks. Press F.',
      'warn',
    );
  }

  sim.yaw = wrap(sim.yaw + d.steer * TURN_RATE * dt);
  const lowered = sim.tool !== 'none' && sim.mode !== 'up';
  const slow = (sim.onBank ? 0.45 : 1) * (lowered ? (sim.tool === 'bucket' ? 0.35 : sim.tool === 'ripper' ? 0.6 : 0.7) : 1);
  const target = d.throttle >= 0 ? d.throttle * MAX_SPEED * slow : d.throttle * REVERSE_SPEED * slow;
  const speeding = Math.sign(target) === Math.sign(sim.speed) && Math.abs(target) > Math.abs(sim.speed);
  const rate = speeding || sim.speed === 0 ? ACCEL : DECEL;
  if (sim.speed < target) sim.speed = Math.min(target, sim.speed + rate * dt);
  else if (sim.speed > target) sim.speed = Math.max(target, sim.speed - rate * dt);
  if (!isBound(sim)) sim.speed = 0;

  const dist = sim.speed * dt;
  const n = Math.max(1, Math.ceil(Math.abs(dist) / 0.2));
  const fx = -Math.sin(sim.yaw);
  const fz = -Math.cos(sim.yaw);
  const x0 = sim.x;
  const z0 = sim.z;
  touching = -1;
  for (let s = 0; s < n && sim.status === 'play' && sim.speed !== 0; s++) {
    tryMove(sim, (fx * dist) / n, (fz * dist) / n);
  }
  if (sim.status !== 'play') return;
  if (d.throttle !== 0 && touching < 0) {
    // probe one step ahead, so a machine pushing on a stopped fence still registers
    const ahead = tileAt(sim.x + fx * 0.55 * Math.sign(d.throttle), sim.z + fz * 0.55 * Math.sign(d.throttle));
    if (ahead >= 0 && sim.kind[ahead] === 'fence' && ahead !== here(sim)) touchFence(sim, ahead);
  }
  if (sim.status !== 'play') return;
  strainFence(sim, dt, d.throttle > 0 && touching >= 0);
  if (sim.status !== 'play') return;
  if (touching < 0 && sim.hook) sim.fenceContact = false;
  assist(sim, d, dt, manual);
  const moved = Math.hypot(sim.x - x0, sim.z - z0);
  sim.stats.dist += moved;
  sim.odo += moved * Math.sign(sim.speed || 1) + Math.abs(d.steer) * dt * 0.3;
  if (moved > 0.001 && sim.stage.id !== 'perceive' && sim.time - sim.stage.t > 0.8) setStage(sim, 'act');

  // Soft bank: a warning, a graded sink, then a roll.
  const i = here(sim);
  const bank = i >= 0 && sim.kind[i] === 'bank';
  if (bank && !sim.onBank) {
    sim.stats.hazards++;
    sim.stats.hazardNotes.push('drove onto the soft bank');
    sim.revealed[i] = true;
    say(sim, 'SOFT BANK: the ground is giving way. The machine is sinking. Back out now!', 'bad');
    setStage(sim, 'observe');
  }
  sim.onBank = bank;
  if (bank) {
    sim.tilt += dt * 0.85;
    if (sim.tilt >= 1) {
      fail(
        sim,
        sim.found.has('bank') || sim.packet.includes('bank')
          ? 'The machine rolled on the soft bank. You knew it was there.'
          : 'The machine rolled on the soft bank. It looked like firm ground, and nobody had scanned it.',
        'Scan (F) before you cross unsurveyed ground, and route around anything marked SOFT BANK.',
        i,
      );
      return;
    }
  } else sim.tilt = Math.max(0, sim.tilt - dt * 0.6);

  check(sim);
}

/** Everything that carries over to the next job. */
export function snapshotOf(sim: Sim): Snapshot {
  return {
    depth: [...sim.depth],
    revealed: [...sim.revealed],
    ripped: [...sim.ripped],
    tool: sim.tool,
    hook: sim.hook,
    packet: [...sim.packet],
    plan: sim.plan,
    spoil: sim.spoil,
    wear: sim.wear,
    filled: sim.filled,
  };
}

export const planIssues = (p: Plan) => gradePlan(p);
