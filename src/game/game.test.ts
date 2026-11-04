import { describe, expect, it } from 'vitest';
import { boardProblems, emptyBoard, goodBoard, leaveCrew, simulateBoard, type Board } from './crew';
import { draftPlan, goodPlan, gradePlan } from './plan';
import { BAYS, CHANNEL_CELLS, H, MAP, PLACES, RIGGER_CELLS, RIGGER_TARGET, W, cellIndex, idx, safeDistance } from './site';
import { canonicalAfter, freshSnapshot, packSnap, unpackSnap } from './snapshot';
import {
  answerAsk,
  commitPacket,
  createSim,
  gradeAutoOps,
  packetProblems,
  riggerAutoOps,
  riggerCut,
  snapshotOf,
  startAuto,
  step,
  workOrder,
  type Sim,
} from './sim';
import { dashboard } from './stats';
import { keysToDrive, stickToDrive, stickToHeading, yoke } from './yoke';
import { JOBS, questions } from './content';
import { JOB_ORDER } from './ids';

const DT = 1 / 60;
const idle = { throttle: 0, steer: 0 };

function hold(sim: Sim, keys: Parameters<typeof keysToDrive>[0], seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(sim, keysToDrive(keys), DT);
}
const tap = (sim: Sim, e: 'use' | 'cut') => step(sim, { ...idle, [e]: true }, DT);
const wait = (sim: Sim, s: number) => {
  for (let i = 0; i < Math.round(s / DT); i++) step(sim, idle, DT);
};

/** Drive tile to tile like a player with tank controls. 'F' presses USE. */
type PlanItem = [number, number] | 'F';
function drive(sim: Sim, plan: PlanItem[]) {
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const item of plan) {
    if (item === 'F') {
      tap(sim, 'use');
      wait(sim, 1.1);
      continue;
    }
    const tx = item[0] + 0.5;
    const tz = item[1] + 0.5;
    for (let i = 0; i < 60 * 25 && sim.status === 'play'; i++) {
      const dist = Math.hypot(tx - sim.x, tz - sim.z);
      if (dist < 0.08 && Math.abs(sim.speed) < 0.03) break;
      const want = Math.atan2(-(tx - sim.x), -(tz - sim.z));
      const diff = wrap(want - sim.yaw);
      const steer = Math.max(-1, Math.min(1, diff * 4));
      const throttle = dist < 0.08 || Math.abs(diff) > 0.12 ? 0 : Math.max(0.1, Math.min(1, dist * 1.4));
      step(sim, { throttle, steer }, DT);
    }
    if (sim.status !== 'play') return;
  }
  wait(sim, 0.5);
}
function runAuto(sim: Sim, max = 120) {
  for (let i = 0; i < 60 * max && sim.status === 'play' && sim.auto; i++) step(sim, idle, DT);
  wait(sim, 1);
}

describe('One site', () => {
  it('the map is rectangular and every job starts on it', () => {
    for (const row of MAP) expect(row.length).toBe(W);
    expect(MAP.length).toBe(H);
    for (const j of JOB_ORDER) expect(() => createSim(j, canonicalAfter(null))).not.toThrow();
  });
  it('RIGGER’s target is one number everywhere: 6', () => {
    expect(RIGGER_TARGET).toBe(6);
    expect(RIGGER_CELLS).toHaveLength(6);
    expect(JOBS.rigger.goal).toContain('6 cells');
    const sim = createSim('rigger', canonicalAfter('survey'));
    expect(workOrder(sim).find((w) => w.text.includes('row 4'))!.detail).toBe('0/6');
  });
  it('the straight line from the survey point to the stake crosses the soft bank; a safe route exists', () => {
    const a = { x: PLACES.surveyPoint.x + 0.5, z: PLACES.surveyPoint.z + 0.5 };
    const b = { x: PLACES.stake.x + 0.5, z: PLACES.stake.z + 0.5 };
    let crosses = false;
    for (let t = 0; t <= 1; t += 0.01) {
      const x = Math.floor(a.x + (b.x - a.x) * t);
      const z = Math.floor(a.z + (b.z - a.z) * t);
      if (MAP[z][x] === 's') crosses = true;
    }
    expect(crosses).toBe(true);
    expect(Number.isFinite(safeDistance(PLACES.surveyPoint, PLACES.stake, true))).toBe(true);
  });
  it('a snapshot survives storage', () => {
    const s = canonicalAfter('grade');
    const back = unpackSnap(JSON.parse(JSON.stringify(packSnap(s))))!;
    expect(back.depth).toEqual(s.depth);
    expect(back.revealed).toEqual(s.revealed);
    expect(back.packet).toEqual(['water', 'bank']);
    expect(back.plan).toEqual(s.plan);
  });
});

describe('Job 1 · YOKE', () => {
  it('starts unbound: W does nothing', () => {
    const sim = createSim('yoke', freshSnapshot());
    expect(sim.yoke).toBe('off');
    hold(sim, { w: true }, 0.5);
    expect(sim.speed).toBe(0);
    expect(yoke(false, { throttle: 1, steer: 1 })).toEqual({ throttle: 0, steer: 0 });
  });
  it('controls: A turns left, stick up drives, point-to-go points', () => {
    const a = createSim('yoke', freshSnapshot());
    tap(a, 'use');
    hold(a, { a: true }, 0.2);
    expect(a.yaw).toBeGreaterThan(0);
    expect(stickToDrive(0, -1).throttle).toBeGreaterThan(0);
    expect(stickToHeading(0, -1)!.heading).toBeCloseTo(0);
    expect(stickToHeading(-1, 0)!.heading).toBeCloseTo(Math.PI / 2); // left on screen = yaw +90°
  });
  it('the belt drops the yoke and K cuts it: two different states', () => {
    const sim = createSim('yoke', freshSnapshot());
    tap(sim, 'use');
    expect(sim.yoke).toBe('bound');
    tap(sim, 'cut');
    expect(sim.yoke).toBe('cut');
    expect(sim.log.at(-1)!.text).toContain('YOU CUT');
    tap(sim, 'use');
    hold(sim, { w: true }, 4);
    expect(sim.beltTripped).toBe(true);
    expect(sim.yoke).toBe('dropped');
    expect(sim.log.some((l) => l.text.startsWith('DEAD BELT'))).toBe(true);
  });
  it('clears: bind, belt, re-bind, flag', () => {
    const sim = createSim('yoke', freshSnapshot());
    tap(sim, 'use');
    hold(sim, { w: true }, 4);
    tap(sim, 'use');
    hold(sim, { w: true }, 4);
    expect(sim.status).toBe('win');
    expect(sim.stats.binds).toBe(2);
    const d = dashboard(sim, { retries: 0, wrongPicks: 0, quizWrong: 0 });
    expect(d.score).toBe(100);
  });
  it('the check asks about the cause the learner hit', () => {
    const a = createSim('yoke', freshSnapshot());
    expect(questions(a)[1].ask).toContain('dead belt');
    a.stats.cuts = 1;
    expect(questions(a)[1].ask).toContain('pressed K');
  });
});

describe('Job 2 · SURVEY', () => {
  const start = () => createSim('survey', canonicalAfter('yoke'));
  it('the straight line, blind, sinks on the soft bank with a warning, then rolls', () => {
    const sim = start();
    drive(sim, [[12, 12]]);
    expect(sim.status).toBe('fail');
    expect(sim.stats.hazards).toBeGreaterThan(0);
    expect(sim.log.some((l) => l.text.startsWith('SOFT BANK'))).toBe(true);
    expect(sim.reason).toContain('soft bank');
  });
  it('scans reveal the bank; the safe route reaches the stake; the packet is graded', () => {
    const sim = start();
    drive(sim, [[6, 18], 'F', [6, 16], 'F', [11, 18], 'F', [11, 12], [12, 12]]);
    expect(sim.found.has('bank')).toBe(true);
    expect(sim.found.has('water')).toBe(true);
    expect(sim.status).toBe('packet');
    expect(packetProblems(sim, ['report']).join(' ')).toContain('40-page');
    expect(packetProblems(sim, ['water', 'weather']).join(' ')).toContain('soft bank');
    expect(packetProblems(sim, ['water', 'bank', 'report']).join(' ')).toContain('Over budget');
    expect(packetProblems(sim, ['water', 'bank'])).toEqual([]);
    commitPacket(sim, ['water', 'bank']);
    expect(sim.status).toBe('win');
    expect(snapshotOf(sim).packet).toEqual(['water', 'bank']);
  });
});

describe('Job 3 · RIGGER', () => {
  const start = () => createSim('rigger', canonicalAfter('survey'));
  it('the tool is chosen in the scene, with a visible mount, not auto-mounted', () => {
    const sim = start();
    expect(sim.tool).toBe('none');
    drive(sim, [[12, 16], [BAYS.blade.x, BAYS.blade.z]]);
    expect(sim.tool).toBe('none');
    tap(sim, 'use');
    expect(sim.mounting?.tool).toBe('blade');
    wait(sim, 1);
    expect(sim.tool).toBe('blade');
    expect(sim.stats.toolCalls).toBe(1);
  });
  it('clears by hand: lower, cut row 4, raise, park', () => {
    const sim = start();
    drive(sim, [[12, 16], [BAYS.blade.x, BAYS.blade.z], 'F', [15, 16], [9, 11], [9, 10], 'F', [15, 10], 'F', [12, 11], [12, 12]]);
    expect(riggerCut(sim)).toBe(6);
    expect(sim.status).toBe('win');
    expect(sim.stats.waste).toEqual([]);
  });
  it('AUTO drives the work order once you have chosen a tool', () => {
    const sim = start();
    startAuto(sim, [{ k: 'reach', x: BAYS.blade.x, z: BAYS.blade.z }, { k: 'mount', tool: 'blade' }, ...riggerAutoOps(sim)]);
    runAuto(sim);
    expect(sim.status).toBe('win');
  });
  it('the bucket works, slower, with wear; the ripper moves no dirt', () => {
    const b = start();
    startAuto(b, [{ k: 'reach', x: BAYS.bucket.x, z: BAYS.bucket.z }, { k: 'mount', tool: 'bucket' }, ...riggerAutoOps(b)]);
    runAuto(b);
    expect(b.status).toBe('win');
    expect(b.wear).toBe(6);
    const blade = start();
    startAuto(blade, [{ k: 'reach', x: BAYS.blade.x, z: BAYS.blade.z }, { k: 'mount', tool: 'blade' }, ...riggerAutoOps(blade)]);
    runAuto(blade);
    expect(b.stats.time).toBeGreaterThan(blade.stats.time);
    const r = start();
    startAuto(r, [{ k: 'reach', x: BAYS.ripper.x, z: BAYS.ripper.z }, { k: 'mount', tool: 'ripper' }, ...riggerAutoOps(r)]);
    runAuto(r);
    expect(riggerCut(r)).toBe(0);
    expect(r.ripped.some(Boolean)).toBe(true);
    expect(r.status).toBe('play');
  });
});

describe('Job 4 · GRADE', () => {
  it('the draft plan has two real problems; the fixed plan passes', () => {
    const rules = gradePlan(draftPlan()).map((i) => i.rule);
    expect(rules).toContain('WALL');
    expect(rules).toContain('ORDER');
    expect(gradePlan(goodPlan())).toEqual([]);
  });
  it('running the draft caves a wall', () => {
    const plan = draftPlan();
    const sim = createSim('grade', canonicalAfter('rigger'), { plan });
    startAuto(sim, gradeAutoOps(sim, plan));
    runAuto(sim);
    expect(sim.status).toBe('fail');
    expect(sim.reason).toContain('caved');
  });
  it('running the graded plan clears, result matches plan', () => {
    const plan = goodPlan();
    const sim = createSim('grade', canonicalAfter('rigger'), { plan });
    startAuto(sim, gradeAutoOps(sim, plan));
    runAuto(sim, 200);
    expect(sim.status).toBe('win');
    expect(sim.depth[cellIndex('C2')]).toBe(2);
    expect(sim.depth[cellIndex('A2')]).toBe(1);
  });
  it('carry-over: finishing Job 3 with the bucket means the plan swaps to the blade first', () => {
    const snap = canonicalAfter('rigger');
    snap.tool = 'bucket';
    const plan = goodPlan();
    const sim = createSim('grade', snap, { plan });
    startAuto(sim, gradeAutoOps(sim, plan));
    runAuto(sim, 240);
    expect(sim.status).toBe('win');
    expect(sim.stats.swaps).toBe(1);
  });
});

describe('Job 5 · WARDEN', () => {
  const run = (guard: 'hook' | 'request' | 'approval' | 'bigger') => {
    const sim = createSim('warden', canonicalAfter('grade'), { guard });
    drive(sim, [[12, 11], [16, 11], [16, 6]]);
    hold(sim, { w: true }, 0.6); // lean on the fence
    if (sim.status === 'ask') answerAsk(sim, false);
    wait(sim, 0.4);
    drive(sim, [[15, 6], [15, 7], 'F', [18, 7]]); // the third channel cell triggers the radio request
    runAuto(sim);
    return sim;
  };
  it('hook: the fence blocks you, the polite request is blocked, park clears', () => {
    const sim = run('hook');
    expect(sim.tested).toBe(true);
    expect(sim.requestSent).toBe(true);
    expect(sim.requestHeld).toBe(true);
    expect(sim.stats.blocks).toBeGreaterThanOrEqual(1);
    expect(sim.mode).toBe('up');
    drive(sim, [[18, 8], [18, 11], [12, 11], [12, 12]]);
    expect(sim.status).toBe('win');
    expect(snapshotOf(sim).hook).toBe(true);
    expect(CHANNEL_CELLS.every((i) => sim.depth[i] === 1)).toBe(true);
  });
  it('request only: the newer, politer request wins and the fence goes', () => {
    const sim = run('request');
    expect(sim.status).toBe('fail');
    expect(sim.breach).toBeGreaterThanOrEqual(0);
  });
  it('bigger model: persuaded', () => {
    expect(run('bigger').reason).toContain('bigger model');
  });
  it('approval gate: holds only while you say no, and never clears', () => {
    const sim = run('approval');
    expect(sim.status).toBe('ask');
    answerAsk(sim, false);
    expect(sim.status).toBe('ask');
    answerAsk(sim, false);
    expect(sim.status).toBe('fail');
    expect(sim.reason).toContain('only because you said no');
  });
});

describe('Job 6 · DISPATCH', () => {
  const sim = () => createSim('dispatch', canonicalAfter('warden'));
  it('the board refuses impossible assignments and explains why', () => {
    expect(boardProblems(emptyBoard()).length).toBeGreaterThan(0);
    const b: Board = { ...goodBoard(), assign: { ...goodBoard().assign, load: 'dozer' } };
    expect(boardProblems(b).join(' ')).toContain('can’t lift');
    expect(boardProblems(goodBoard())).toEqual([]);
  });
  it('four agents, handoffs, merge, fill, then LEAVE clears', () => {
    const s = sim();
    const c = simulateBoard(goodBoard(), s);
    s.crew = c;
    expect(c.phase).toBe('ready');
    expect(c.handoffs).toBeGreaterThanOrEqual(3);
    expect(Object.values(c.workers).every((w) => w.done)).toBe(true);
    leaveCrew(c, s);
    expect(s.status).toBe('win');
  });
  it('a truck that doesn’t wait for the hazard map rolls on the soft bank', () => {
    const s = sim();
    const c = simulateBoard({ ...goodBoard(), wait: { load: true, haul: false } }, s);
    expect(c.phase).toBe('fail');
    expect(s.reason).toContain('soft bank');
  });
  it('a stale packet (Job 2’s west-field survey) is just as blind', () => {
    const s = sim();
    const c = simulateBoard({ ...goodBoard(), packet: { cut: 'plan', haul: 'job2' } }, s);
    expect(c.phase).toBe('fail');
  });
  it('costly picks run, but slower', () => {
    const fast = simulateBoard(goodBoard(), sim());
    const slow = simulateBoard({ ...goodBoard(), assign: { ...goodBoard().assign, cut: 'loader' } }, sim());
    expect(slow.phase).toBe('ready');
    expect(slow.time).toBeGreaterThan(fast.time);
  });
});

describe('Efficiency is a number', () => {
  it('a wasteful clear scores lower than a clean one', () => {
    const clean = createSim('rigger', canonicalAfter('survey'));
    startAuto(clean, [{ k: 'reach', x: BAYS.blade.x, z: BAYS.blade.z }, { k: 'mount', tool: 'blade' }, ...riggerAutoOps(clean)]);
    runAuto(clean);
    const messy = createSim('rigger', canonicalAfter('survey'));
    startAuto(messy, [{ k: 'reach', x: BAYS.bucket.x, z: BAYS.bucket.z }, { k: 'mount', tool: 'bucket' }, ...riggerAutoOps(messy)]);
    runAuto(messy);
    const a = dashboard(clean, { retries: 0, wrongPicks: 0, quizWrong: 0 });
    const b = dashboard(messy, { retries: 1, wrongPicks: 1, quizWrong: 2 });
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.waste).toMatch(/Most wasteful/);
  });
  it('the tile index helper is consistent', () => {
    expect(idx(PLACES.stake.x, PLACES.stake.z)).toBe(PLACES.stake.z * W + PLACES.stake.x);
  });
});
