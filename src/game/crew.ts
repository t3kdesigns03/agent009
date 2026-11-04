// Job 6. You are the Orchestrator: four agents, one task each, handoffs between them, one outcome.
import { EAST_BAY, PLACES, TEMPLATE, W, idx, type Pt } from './site';
import type { Sim } from './sim';
import type { Stage } from './vocab';

export type AgentId = 'scout' | 'dozer' | 'loader' | 'truck';
export type TaskId = 'survey' | 'cut' | 'load' | 'haul';
export type PacketChoice = 'plan' | 'report' | 'map' | 'job2' | 'none';

export const AGENTS: Record<AgentId, { name: string; tool: string; color: string; speed: number }> = {
  scout: { name: 'SCOUT', tool: 'scanner', color: '#00e5ff', speed: 3 },
  dozer: { name: 'DOZER', tool: 'blade', color: '#ffc400', speed: 2 },
  loader: { name: 'LOADER', tool: 'bucket', color: '#ff6d00', speed: 1.8 },
  truck: { name: 'TRUCK', tool: 'dump bed', color: '#76ff03', speed: 2.6 },
};
export const AGENT_ORDER: AgentId[] = ['scout', 'dozer', 'loader', 'truck'];

export interface Option<T extends string> {
  id: T;
  label: string;
  why: string;
  /** refused: the board won't send it. costly: it runs, and you'll see the cost. */
  verdict: 'right' | 'costly' | 'refused';
}

export interface TaskDef {
  id: TaskId;
  name: string;
  detail: string;
  agents: Option<AgentId>[];
  packets?: Option<PacketChoice>[];
  /** A handoff this task may wait for. */
  waitFor?: { signal: 'map' | 'spoil'; label: string; from: TaskId };
}

export const TASKS: TaskDef[] = [
  {
    id: 'survey',
    name: 'Survey the haul route',
    detail: 'The south-east field the truck must cross. Nobody has scanned it.',
    agents: [
      { id: 'scout', label: 'SCOUT (scanner)', verdict: 'right', why: 'Built for it. It scans as it drives and stays off what it finds.' },
      {
        id: 'dozer',
        label: 'DOZER (blade)',
        verdict: 'costly',
        why: 'It can survey by driving slowly and scanning, but it’s your only blade, so the east bay waits until it’s back. Serial, not parallel.',
      },
      {
        id: 'truck',
        label: 'TRUCK (dump bed)',
        verdict: 'refused',
        why: 'A truck has no scanner. It can only learn the ground by driving onto it, and that’s how trucks get rolled.',
      },
    ],
  },
  {
    id: 'cut',
    name: 'Cut the east bay',
    detail: 'Four cells east of the new lake’s F column, at shelf depth.',
    agents: [
      { id: 'dozer', label: 'DOZER (blade)', verdict: 'right', why: 'A blade pushes. Shaping a cut is pushing.' },
      {
        id: 'loader',
        label: 'LOADER (bucket)',
        verdict: 'costly',
        why: 'A bucket can cut, 3× slower with wear. You saw it in Job 3. And then it isn’t free to load.',
      },
      { id: 'scout', label: 'SCOUT (scanner)', verdict: 'refused', why: 'A scanner perceives. It moves no dirt.' },
    ],
    packets: [
      {
        id: 'plan',
        label: 'Job 4 plan rules: shelf depth here, a shelf step beside any deep cut',
        verdict: 'right',
        why: 'Two lines. Exactly what the cut needs.',
      },
      {
        id: 'report',
        label: 'The full 40-page soils report',
        verdict: 'costly',
        why: 'It has the depth rule somewhere. The dozer re-reads 40 pages before each cell: 1.6× slower.',
      },
      {
        id: 'job2',
        label: 'Your Job 2 survey packet (west field hazards)',
        verdict: 'costly',
        why: 'True facts about the wrong question. Nothing in it says how deep to cut.',
      },
    ],
  },
  {
    id: 'load',
    name: 'Load the spoil heap',
    detail: 'Spoil from Jobs 3–5 is heaped by the stake. The bay adds four more.',
    agents: [
      { id: 'loader', label: 'LOADER (bucket)', verdict: 'right', why: 'A bucket lifts. Loading a truck is lifting.' },
      { id: 'dozer', label: 'DOZER (blade)', verdict: 'refused', why: 'A blade pushes. It can’t lift dirt into a truck bed.' },
      { id: 'truck', label: 'TRUCK (dump bed)', verdict: 'refused', why: 'A truck carries what it’s given. It can’t load itself.' },
    ],
    waitFor: { signal: 'spoil', label: 'DOZER’s “spoil ready”', from: 'cut' },
  },
  {
    id: 'haul',
    name: 'Haul the spoil to the dump',
    detail: 'South-east, past existing water. The route crosses the field the survey covers.',
    agents: [
      { id: 'truck', label: 'TRUCK (dump bed)', verdict: 'right', why: 'Carries a full load per trip.' },
      { id: 'loader', label: 'LOADER (bucket)', verdict: 'costly', why: 'A bucket carries a quarter load: four trips instead of one.' },
      { id: 'dozer', label: 'DOZER (blade)', verdict: 'refused', why: 'A blade can push spoil a few metres, not carry it 15 cells.' },
    ],
    packets: [
      {
        id: 'map',
        label: 'SCOUT’s hazard map of the haul route (a handoff)',
        verdict: 'right',
        why: 'The only packet that covers this field. It doesn’t exist until the survey is done.',
      },
      {
        id: 'job2',
        label: 'Your Job 2 survey packet (west field hazards)',
        verdict: 'costly',
        why: 'A real survey, of a different field: stale context. Nothing in it covers the south-east.',
      },
      { id: 'none', label: 'Nothing. It’s just driving.', verdict: 'costly', why: 'Fewer tokens, and blind.' },
    ],
    waitFor: { signal: 'map', label: 'SCOUT’s hazard map', from: 'survey' },
  },
];

export const TASK: Record<TaskId, TaskDef> = Object.fromEntries(TASKS.map((t) => [t.id, t])) as Record<TaskId, TaskDef>;

export interface Board {
  assign: Record<TaskId, AgentId | null>;
  packet: Partial<Record<TaskId, PacketChoice | null>>;
  wait: Partial<Record<TaskId, boolean>>;
}

export const emptyBoard = (): Board => ({
  assign: { survey: null, cut: null, load: null, haul: null },
  packet: { cut: null, haul: null },
  wait: { load: false, haul: false },
});

export const goodBoard = (): Board => ({
  assign: { survey: 'scout', cut: 'dozer', load: 'loader', haul: 'truck' },
  packet: { cut: 'plan', haul: 'map' },
  wait: { load: true, haul: true },
});

/** Board problems the Orchestrator won't dispatch. Costly choices pass. You'll see their cost. */
export function boardProblems(b: Board): string[] {
  const out: string[] = [];
  for (const t of TASKS) {
    const a = b.assign[t.id];
    if (!a) {
      out.push(`${t.name}: no agent assigned. An unassigned task never happens.`);
      continue;
    }
    const opt = t.agents.find((o) => o.id === a)!;
    if (opt.verdict === 'refused') out.push(`${t.name} → ${AGENTS[a].name}: ${opt.why}`);
    if (t.packets && !b.packet[t.id]) out.push(`${t.name}: pick ${AGENTS[a].name}’s context packet.`);
  }
  return out;
}

/* ---------- The run ---------- */

type Op =
  | { k: 'go'; pts: Pt[]; scan?: boolean; blind?: boolean }
  | { k: 'work'; t: number; label: string; fn?: (c: Crew, s: Sim) => void }
  | { k: 'signal'; name: string; to?: AgentId; label?: string }
  | { k: 'wait'; name: string; label: string }
  | { k: 'log'; text: string }
  | { k: 'cut'; i: number; t: number; deep: boolean }
  | { k: 'cargo'; n: number };

export interface Worker {
  id: AgentId;
  x: number;
  z: number;
  yaw: number;
  ops: Op[];
  i: number;
  t: number;
  busy: number;
  idle: number;
  stage: Stage;
  status: string;
  done: boolean;
  cargo: number;
  scanAcc: number;
  sunk: number;
}

export interface Flyer {
  from: Pt;
  to: AgentId;
  label: string;
  t: number;
}

export interface Crew {
  board: Board;
  workers: Record<AgentId, Worker>;
  signals: Set<string>;
  flyers: Flyer[];
  log: string[];
  handoffs: number;
  phase: 'run' | 'merge' | 'filling' | 'ready' | 'done' | 'fail';
  fill: number;
  time: number;
  dumped: number;
  rounds: number;
}

const START: Record<AgentId, Pt> = {
  scout: { x: 11, z: 13 },
  dozer: PLACES.stake,
  loader: { x: 20, z: 17 },
  truck: { x: 16, z: 19 },
};

const HEAP_LOADER: Pt = { x: 12, z: 14 };
const HEAP_TRUCK: Pt = { x: 14, z: 14 };
const SCOUT_ROUTE: Pt[] = [
  { x: 11, z: 16 },
  { x: 13, z: 18 },
  { x: 14, z: 20 },
  { x: 15, z: 22 },
  { x: 15, z: 25 },
  { x: 17, z: 26 },
  { x: 14, z: 26 },
];
const SAFE_HAUL: Pt[] = [
  { x: 14, z: 26 },
  { x: 19, z: 26 },
  { x: 19, z: 27 },
];
const BLIND_HAUL: Pt[] = [{ x: 19, z: 27 }];
const BACK: Pt[] = [
  { x: 19, z: 26 },
  { x: 14, z: 26 },
  { x: 14, z: 14 },
];

function worker(id: AgentId): Worker {
  const p = START[id];
  return {
    id,
    x: p.x + 0.5,
    z: p.z + 0.5,
    yaw: 0,
    ops: [],
    i: 0,
    t: 0,
    busy: 0,
    idle: 0,
    stage: 'plan',
    status: 'waiting for orders',
    done: false,
    cargo: 0,
    scanAcc: 0,
    sunk: 0,
  };
}

/** Turn the board into each agent's queue. The Orchestrator delegates; it never digs. */
export function createCrew(b: Board, sim: Sim): Crew {
  const w: Record<AgentId, Worker> = {
    scout: worker('scout'),
    dozer: worker('dozer'),
    loader: worker('loader'),
    truck: worker('truck'),
  };
  const log: string[] = [];
  const A = b.assign as Record<TaskId, AgentId>;
  const q = (a: AgentId) => w[a].ops;

  // survey
  const sv = A.survey;
  q(sv).push(
    { k: 'log', text: `ORCHESTRATOR → ${AGENTS[sv].name}: survey the haul route.` },
    { k: 'go', pts: sv === 'scout' ? SCOUT_ROUTE : [{ x: 13, z: 15 }, ...SCOUT_ROUTE.slice(1)], scan: true },
    { k: 'signal', name: 'map', to: A.haul, label: 'HAZARD MAP' },
    { k: 'log', text: `${AGENTS[sv].name} → ${AGENTS[A.haul].name}: hazard map handed off. South-east soft bank marked.` },
  );
  if (sv === 'dozer') q(sv).push({ k: 'go', pts: [{ x: 14, z: 18 }, { x: 13, z: 11 }] });

  // cut
  const ct = A.cut;
  const pk = b.packet.cut ?? 'none';
  const slow = (ct === 'loader' ? 3 : 1) * (pk === 'report' ? 1.6 : 1);
  const deep = pk !== 'plan' && pk !== 'report';
  q(ct).push(
    { k: 'log', text: `ORCHESTRATOR → ${AGENTS[ct].name}: cut the east bay. Packet: ${pk === 'plan' ? 'plan rules' : pk === 'report' ? '40-page report' : 'west-field survey'}.` },
    { k: 'go', pts: ct === 'loader' ? [{ x: 20, z: 11 }, { x: 17, z: 11 }, { x: 16, z: 11 }] : [{ x: 13, z: 11 }, { x: 16, z: 11 }] },
  );
  const bay = [idx(16, 10), idx(17, 10), idx(17, 9), idx(16, 9)];
  for (const i of bay) q(ct).push({ k: 'cut', i, t: 1.2 * slow, deep });
  q(ct).push(
    { k: 'go', pts: [{ x: 18, z: 11 }] },
    { k: 'signal', name: 'spoil', to: A.load, label: 'SPOIL READY' },
    { k: 'log', text: `${AGENTS[ct].name} → ${AGENTS[A.load].name}: spoil ready, 4 more on the heap.` },
  );

  // load + haul
  const ld = A.load;
  const hl = A.haul;
  const hp = b.packet.haul ?? 'none';
  const twoRounds = !b.wait.load;
  const rounds = twoRounds ? 2 : 1;
  const hasMap = hp === 'map';
  const loaderHauls = hl === 'loader';

  if (b.wait.load) q(ld).push({ k: 'wait', name: 'spoil', label: 'waiting for DOZER’s “spoil ready”' });
  q(ld).push({ k: 'go', pts: ld === 'loader' && ct === 'loader' ? [{ x: 18, z: 13 }, { x: 12, z: 13 }, HEAP_LOADER] : [{ x: 20, z: 18 }, { x: 12, z: 18 }, { x: 12, z: 15 }, HEAP_LOADER] });

  if (loaderHauls) {
    // The loader loads itself, a quarter load per trip.
    const trips = 4 * rounds;
    if (b.wait.haul) q(ld).push({ k: 'wait', name: 'map', label: 'waiting for the hazard map' });
    for (let r = 0; r < trips; r++) {
      if (twoRounds && r === 4) q(ld).push({ k: 'wait', name: 'spoil', label: 'waiting for the bay’s spoil' });
      q(ld).push(
        { k: 'work', t: 1, label: 'filling the bucket' },
        { k: 'cargo', n: 1 },
        { k: 'go', pts: b.wait.haul && hasMap ? [{ x: 14, z: 14 }, ...SAFE_HAUL] : BLIND_HAUL, blind: !(b.wait.haul && hasMap) },
        { k: 'work', t: 0.6, label: 'dumping', fn: (c) => (c.dumped += 1) },
        { k: 'cargo', n: 0 },
        { k: 'go', pts: [...BACK.slice(0, 2), HEAP_LOADER] },
      );
    }
    q(ld).push({ k: 'signal', name: 'hauled' });
  } else {
    for (let r = 1; r <= rounds; r++) {
      if (twoRounds && r === 2) q(ld).push({ k: 'wait', name: 'spoil', label: 'waiting for the bay’s spoil' });
      q(ld).push(
        { k: 'wait', name: `truck${r}`, label: 'waiting for the truck' },
        { k: 'work', t: 3, label: 'loading the truck' },
        { k: 'signal', name: `loaded${r}`, to: hl, label: 'LOADED' },
      );
    }
    if (b.wait.haul) q(hl).push({ k: 'wait', name: 'map', label: 'waiting for SCOUT’s hazard map' });
    else if (hp === 'map') q(hl).push({ k: 'log', text: 'TRUCK left before the hazard map existed. Its packet slot is empty.' });
    if (hp === 'job2') q(hl).push({ k: 'log', text: 'TRUCK reads its packet: west-field hazards. Nothing about the south-east. Taking the straight line.' });
    for (let r = 1; r <= rounds; r++) {
      q(hl).push(
        { k: 'go', pts: r === 1 ? [{ x: 14, z: 19 }, HEAP_TRUCK] : BACK },
        { k: 'signal', name: `truck${r}` },
        { k: 'wait', name: `loaded${r}`, label: 'waiting to be loaded' },
        { k: 'cargo', n: 1 },
        { k: 'go', pts: b.wait.haul && hasMap ? SAFE_HAUL : BLIND_HAUL, blind: !(b.wait.haul && hasMap) },
        { k: 'work', t: 1, label: 'dumping', fn: (c) => (c.dumped += 1) },
        { k: 'cargo', n: 0 },
      );
    }
    q(hl).push({ k: 'signal', name: 'hauled' });
  }

  for (const a of AGENT_ORDER) if (!w[a].ops.length) w[a].status = 'not assigned: parked';
  log.push('ORCHESTRATOR: four tasks dispatched. I never dig.');
  sim.revealed = sim.revealed.map((r, i) => r || (TEMPLATE.kind[i] !== 'ground' && TEMPLATE.kind[i] !== 'bank'));
  return {
    board: b,
    workers: w,
    signals: new Set(),
    flyers: [],
    log,
    handoffs: 0,
    phase: 'run',
    fill: 0,
    time: 0,
    dumped: 0,
    rounds,
  };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function crewFail(c: Crew, sim: Sim, reason: string, hint: string, at: number) {
  c.phase = 'fail';
  sim.status = 'fail';
  sim.reason = reason;
  sim.hint = hint;
  sim.failAt = at;
  sim.shake = 0.45;
  c.log.push(`FAIL: ${reason}`);
}

function revealAround(sim: Sim, x: number, z: number) {
  const r = 3.6;
  for (let zz = Math.floor(z - r); zz <= z + r; zz++)
    for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
      if (xx < 0 || zz < 0 || xx >= W || zz >= sim.h) continue;
      if (Math.hypot(xx + 0.5 - x, zz + 0.5 - z) <= r) sim.revealed[idx(xx, zz)] = true;
    }
  sim.pulses.push({ x, z, t: 0 });
}

function stepWorker(c: Crew, sim: Sim, wk: Worker, dt: number) {
  const op = wk.ops[wk.i];
  if (!op) {
    if (!wk.done && wk.ops.length) {
      wk.done = true;
      wk.status = 'done: parked';
      wk.stage = 'handoff';
    }
    return;
  }
  const next = () => {
    wk.i++;
    wk.t = 0;
  };
  wk.t += dt;
  const spec = AGENTS[wk.id];
  switch (op.k) {
    case 'log':
      c.log.push(op.text);
      next();
      return;
    case 'signal':
      c.signals.add(op.name);
      if (op.to && op.label) {
        c.flyers.push({ from: { x: wk.x, z: wk.z }, to: op.to, label: op.label, t: 0 });
        c.handoffs++;
      }
      wk.stage = 'handoff';
      next();
      return;
    case 'wait':
      if (c.signals.has(op.name)) {
        next();
        return;
      }
      wk.idle += dt;
      wk.status = op.label;
      wk.stage = 'plan';
      return;
    case 'cargo':
      wk.cargo = op.n;
      next();
      return;
    case 'work':
      wk.busy += dt;
      wk.status = op.label;
      wk.stage = 'act';
      if (wk.t >= op.t) {
        op.fn?.(c, sim);
        wk.stage = 'observe';
        next();
      }
      return;
    case 'cut': {
      wk.busy += dt;
      const { x, z } = { x: op.i % W, z: Math.floor(op.i / W) };
      const tx = x + 0.5;
      const tz = z + 0.5;
      const d = Math.hypot(tx - wk.x, tz - wk.z);
      if (d > 0.05) {
        wk.t = 0;
        moveToward(wk, tx, tz, spec.speed * 0.6, dt);
        wk.status = 'cutting the east bay';
        wk.stage = 'act';
        return;
      }
      if (wk.t >= op.t) {
        sim.depth[op.i] = op.deep ? 2 : 1;
        sim.spoil++;
        wk.stage = 'observe';
        if (op.deep && EAST_BAY.includes(op.i)) {
          crewFail(
            c,
            sim,
            `${spec.name} cut the bay deep, beside uncut ground, and the wall caved. Its packet said nothing about the shelf rule.`,
            'Give the cutting agent the Job 4 plan rules as its packet.',
            op.i,
          );
          return;
        }
        next();
      }
      return;
    }
    case 'go': {
      wk.busy += dt;
      const p = op.pts[0];
      if (!p) {
        next();
        return;
      }
      const tx = p.x + 0.5;
      const tz = p.z + 0.5;
      wk.status = op.scan ? 'surveying: scanning as it drives' : op.blind ? 'driving the straight line, blind' : `driving${wk.cargo ? ' (loaded)' : ''}`;
      wk.stage = op.scan ? 'perceive' : 'act';
      const sp = spec.speed * (wk.id === 'dozer' && op.scan ? 0.6 : 1) * (wk.cargo ? 0.8 : 1);
      const moved = moveToward(wk, tx, tz, sp, dt);
      if (op.scan) {
        wk.scanAcc += moved;
        if (wk.scanAcc > 1.6) {
          wk.scanAcc = 0;
          revealAround(sim, wk.x, wk.z);
        }
      }
      const i = idx(Math.floor(wk.x), Math.floor(wk.z));
      if (TEMPLATE.kind[i] === 'bank') {
        wk.sunk += dt;
        wk.status = 'SINKING in soft bank';
        if (wk.sunk > 0.8) {
          sim.revealed[i] = true;
          sim.stats.hazards++;
          sim.stats.hazardNotes.push(`${spec.name.toLowerCase()} on the soft bank`);
          crewFail(
            c,
            sim,
            `${spec.name} rolled on the south-east soft bank. Its packet ${c.board.packet.haul === 'job2' ? 'covered the west field, not this one' : 'had no hazard map'}${sim.hook ? '. The hook guards the fence and existing water, not the bank: that one is context' : ''}.`,
            'Wait for SCOUT’s hazard map, and give it to the hauling agent as its packet.',
            i,
          );
        }
        return;
      }
      if (Math.hypot(tx - wk.x, tz - wk.z) < 0.06) {
        op.pts = op.pts.slice(1);
        if (!op.pts.length) next();
      }
      return;
    }
  }
}

function moveToward(wk: Worker, tx: number, tz: number, speed: number, dt: number): number {
  const dx = tx - wk.x;
  const dz = tz - wk.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  const want = Math.atan2(-dx, -dz);
  wk.yaw = wk.yaw + wrap(want - wk.yaw) * Math.min(1, dt * 8);
  const s = Math.min(d, speed * dt);
  wk.x += (dx / d) * s;
  wk.z += (dz / d) * s;
  return s;
}

export function stepCrew(c: Crew, sim: Sim, dt: number) {
  for (const f of c.flyers) f.t += dt;
  c.flyers = c.flyers.filter((f) => f.t < 1.4);
  for (const p of sim.pulses) p.t += dt;
  sim.pulses = sim.pulses.filter((p) => p.t < 1.2);
  if (sim.shake > 0) sim.shake = Math.max(0, sim.shake - dt);
  if (c.phase === 'fail' || c.phase === 'done') return;
  if (c.phase === 'run') {
    // The clock measures the crew's work, not the fill or the wait for LEAVE.
    c.time += dt;
    sim.time = c.time;
    sim.stats.time = c.time;
    for (const a of AGENT_ORDER) {
      stepWorker(c, sim, c.workers[a], dt);
      if (c.phase !== 'run') return;
    }
    const cutDone = EAST_BAY.every((i) => sim.depth[i] >= 1);
    if (c.signals.has('hauled') && c.signals.has('map') && cutDone && AGENT_ORDER.every((a) => c.workers[a].done || !c.workers[a].ops.length)) {
      c.phase = 'merge';
      c.log.push('ORCHESTRATOR: merging results. East bay cut ✓ · spoil hauled ✓ · haul route mapped ✓ · hook held ✓');
      c.log.push('ORCHESTRATOR: all checks pass. Opening the inlet.');
    }
    return;
  }
  if (c.phase === 'merge') {
    c.phase = 'filling';
    return;
  }
  if (c.phase === 'filling') {
    c.fill = Math.min(1, c.fill + dt * 0.35);
    if (c.fill >= 1) {
      c.phase = 'ready';
      sim.filled = true;
      c.log.push('The lake is real. Your call, Orchestrator: press LEAVE.');
    }
  }
}

/** Leave: the Orchestrator's last act. Early is not a fail. */
export function leaveCrew(c: Crew, sim: Sim) {
  if (c.phase === 'ready') {
    c.phase = 'done';
    sim.status = 'win';
    c.log.push('ORCHESTRATOR left the site. CLEAR.');
    return;
  }
  if (c.phase === 'run' || c.phase === 'merge' || c.phase === 'filling') c.log.push('Not a lake yet. The crew keeps working.');
}

/** Run a board headless, for par time and tests. */
export function simulateBoard(b: Board, sim: Sim, maxT = 400): Crew {
  const c = createCrew(b, sim);
  const dt = 1 / 30;
  for (let t = 0; t < maxT && (c.phase === 'run' || c.phase === 'merge' || c.phase === 'filling'); t += dt) stepCrew(c, sim, dt);
  return c;
}

export const crewOf = (sim: Sim) => sim.crew as Crew | null;
