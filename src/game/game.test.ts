import { describe, expect, it } from 'vitest';
import { AGENT_ORDER, type CardId } from './cards';
import { assignAgent, orchestrate } from './dispatch';
import { JOB_ORDER, LEVEL, parseMap, shape, tileAt } from './levels';
import { createSim, step, type Sim } from './sim';
import { keysToDrive, stickToDrive, yoke } from './yoke';

const DT = 1 / 60;

function hold(sim: Sim, keys: Parameters<typeof keysToDrive>[0], seconds: number) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) step(sim, keysToDrive(keys), DT);
}

/** Put the dozer at a tile center, facing a direction (0 = up the screen). */
function place(sim: Sim, x: number, z: number, yaw = 0) {
  sim.x = x + 0.5;
  sim.z = z + 0.5;
  sim.yaw = yaw;
  sim.speed = 0;
}

describe('Yoke', () => {
  it('unbound: holding W for half a second leaves speed at 0', () => {
    const sim = createSim('yoke');
    sim.yokeBound = false;
    hold(sim, { w: true }, 0.5);
    expect(sim.speed).toBe(0);
    expect(yoke(false, { throttle: 1, steer: 1 })).toEqual({ throttle: 0, steer: 0 });
  });

  it('bound: W increases speed', () => {
    const sim = createSim('yoke');
    hold(sim, { w: true }, 0.2);
    expect(sim.speed).toBeGreaterThan(0);
  });

  it('bound: A increases yaw, D decreases yaw', () => {
    const a = createSim('yoke');
    hold(a, { a: true }, 0.2);
    expect(a.yaw).toBeGreaterThan(0);
    const d = createSim('yoke');
    hold(d, { d: true }, 0.2);
    expect(d.yaw).toBeLessThan(0);
  });

  it('stick left turns left, stick up drives forward', () => {
    expect(stickToDrive(-1, 0).steer).toBeGreaterThan(0);
    expect(stickToDrive(1, 0).steer).toBeLessThan(0);
    expect(stickToDrive(0, -1).throttle).toBeGreaterThan(0);
  });

  it('W drives the way the blade points: yaw 0 is up the screen', () => {
    const sim = createSim('yoke');
    const z0 = sim.z;
    hold(sim, { w: true }, 0.3);
    expect(sim.z).toBeLessThan(z0);
  });

  it('job 1 clears: belt kills Yoke, F binds it, flag wins', () => {
    const sim = createSim('yoke');
    hold(sim, { w: true }, 3);
    expect(sim.beltTripped).toBe(true);
    expect(sim.yokeBound).toBe(false);
    expect(sim.status).toBe('play');
    step(sim, { throttle: 0, steer: 0, use: true }, DT);
    expect(sim.yokeBound).toBe(true);
    hold(sim, { w: true }, 4);
    expect(sim.status).toBe('win');
  });
});

describe('Packets', () => {
  it('two facts is legal', () => {
    expect(assignAgent('grade', ['grade.shape', 'grade.lift']).ok).toBe(true);
  });

  it('three facts on one agent is refused', () => {
    const r = assignAgent('grade', ['grade.shape', 'grade.lift', 'grade.shape']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Too much context.');
  });

  it('a noise card is refused', () => {
    expect(assignAgent('survey', ['noise.novel']).ok).toBe(false);
    expect(assignAgent('rigger', ['rigger.blade', 'noise.letter']).ok).toBe(false);
  });

  const full: Record<string, CardId[]> = {
    survey: ['survey.bank'],
    operator: ['operator.yoke'],
    rigger: ['rigger.blade'],
    grade: ['grade.shape'],
    warden: ['warden.hook'],
  };

  it('finale accepts five facts in order', () => {
    const r = orchestrate(full);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.steps.map((s) => s.agent)).toEqual(AGENT_ORDER);
    expect(AGENT_ORDER).toEqual(['survey', 'operator', 'rigger', 'grade', 'warden']);
  });

  it('finale without the warden card is refused, and the reason names Warden', () => {
    const { warden: _w, ...rest } = full;
    const r = orchestrate(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('Warden');
  });

  it('finale refuses a novel', () => {
    const r = orchestrate({ ...full, grade: ['noise.novel'] });
    expect(r.ok).toBe(false);
  });
});

describe('Warden', () => {
  it('hook on: a move into the fence does not change the tile', () => {
    const sim = createSim('warden', ['warden.hook']);
    place(sim, 9, 4); // ground just below the fence row
    const before = tileAt(sim, sim.x, sim.z);
    hold(sim, { w: true }, 1);
    expect(tileAt(sim, sim.x, sim.z)).toBe(before);
    expect(sim.status).toBe('play');
    expect(sim.bumps).toBeGreaterThanOrEqual(1);
    expect(sim.log.some((l) => l.text === 'WARDEN refused the fence.')).toBe(true);
  });

  it('hook off: a move into the fence fails', () => {
    const sim = createSim('warden', []);
    place(sim, 9, 4);
    hold(sim, { w: true }, 1);
    expect(sim.status).toBe('fail');
  });
});

describe('Tools and grade', () => {
  it('scoop on a shelf tile fails', () => {
    const sim = createSim('rigger', ['rigger.scoop']);
    sim.tool = 'scoop';
    sim.mode = 'shelf';
    place(sim, 4, 5); // below shelf row 4
    hold(sim, { w: true }, 1);
    expect(sim.status).toBe('fail');
    expect(sim.reason).toBe('The scoop cannot push this cut.');
  });

  it('deep blade on a shelf tile fails', () => {
    const sim = createSim('grade', ['grade.shape']);
    sim.mode = 'deep';
    place(sim, 6, 2); // above shelf row 3
    sim.yaw = Math.PI; // face down the screen
    hold(sim, { w: true }, 1);
    expect(sim.status).toBe('fail');
    expect(sim.reason).toContain('shelf');
  });

  it('blade down on a ramp tile fails', () => {
    const sim = createSim('grade', ['grade.shape']);
    sim.mode = 'shelf';
    place(sim, 6, 9); // below ramp (6,8)
    hold(sim, { w: true }, 1);
    expect(sim.status).toBe('fail');
    expect(sim.reason).toContain('ramp');
  });

  it('grade without the shape card is locked deep', () => {
    const sim = createSim('grade', ['grade.lift']);
    expect(sim.modes).toEqual(['deep']);
  });

  it('rigger with the blade card mounts a blade at the pad', () => {
    const sim = createSim('rigger', ['rigger.blade', 'rigger.scoop']);
    hold(sim, { w: true }, 1.2);
    expect(sim.tool).toBe('blade');
  });

  it('survey blind reaches the flag and fails', () => {
    const sim = createSim('survey', []);
    place(sim, 1, 1);
    sim.yaw = -Math.PI / 2; // face right
    hold(sim, { w: true }, 2.5);
    expect(sim.status).toBe('fail');
    expect(sim.reason).toContain('blind');
  });
});

describe('Maps', () => {
  it('every map parses', () => {
    for (const id of JOB_ORDER) expect(() => parseMap(LEVEL[id].map)).not.toThrow();
  });
});

describe('Dispatch finale', () => {
  const run = (packet: Record<string, CardId[]>, leaveEarly = false) => {
    const r = orchestrate(packet);
    if (!r.ok) throw new Error(r.reason);
    const cards = r.steps.map((s) => s.card);
    const sim = createSim('dispatch', cards, r.steps);
    let pressedEarly = false;
    for (let i = 0; i < 60 * 240 && sim.status === 'play' && !sim.auto!.done; i++) {
      const early = leaveEarly && !pressedEarly && sim.time > 5;
      if (early) pressedEarly = true;
      step(sim, { throttle: 0, steer: 0, leave: early }, DT);
    }
    return sim;
  };

  const good = {
    survey: ['survey.bank'],
    operator: ['operator.yoke'],
    rigger: ['rigger.blade'],
    grade: ['grade.shape'],
    warden: ['warden.hook'],
  } as Record<string, CardId[]>;

  it('the crew finishes the lake, and Leave wins', () => {
    const sim = run(good, true);
    expect(sim.status).toBe('play');
    expect(sim.log.some((l) => l.text.startsWith('Not a lake yet'))).toBe(true);
    const s = shape(sim);
    expect(s.deepOK && s.shelfOK && s.rampIntact).toBe(true);
    expect(sim.bumps).toBeGreaterThanOrEqual(1);
    step(sim, { throttle: 0, steer: 0, leave: true }, DT);
    expect(sim.status).toBe('win');
  });

  it('a scoop fails', () => {
    expect(run({ ...good, rigger: ['rigger.scoop'] }).status).toBe('fail');
  });
  it('no shape card cuts the shelf deep and fails', () => {
    const sim = run({ ...good, grade: ['grade.lift'] });
    expect(sim.status).toBe('fail');
    expect(sim.reason).toContain('shelf');
  });
  it('no hook fails at the fence', () => {
    const sim = run({ ...good, warden: ['warden.request'] });
    expect(sim.status).toBe('fail');
    expect(sim.reason).toContain('fence');
  });
  it('a dead yoke at Leave fails', () => {
    const sim = run(good);
    step(sim, { throttle: 0, steer: 0, cut: true }, DT);
    step(sim, { throttle: 0, steer: 0, leave: true }, DT);
    expect(sim.status).toBe('fail');
  });
});

/* Jobs 2–5 can be cleared by the right packet, driving like a player would. */
type PlanItem = [number, number] | 'F' | 'bumpUp';
function drive(sim: Sim, plan: PlanItem[]) {
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const item of plan) {
    if (item === 'F') {
      step(sim, { throttle: 0, steer: 0, use: true }, DT);
      continue;
    }
    if (item === 'bumpUp') {
      const b = sim.bumps;
      for (let i = 0; i < 600 && sim.bumps === b && sim.status === 'play'; i++) {
        const diff = wrap(0 - sim.yaw);
        step(sim, { throttle: Math.abs(diff) < 0.1 ? 1 : 0, steer: Math.max(-1, Math.min(1, diff * 4)) }, DT);
      }
      for (let i = 0; i < 30; i++) step(sim, { throttle: 0, steer: 0 }, DT);
      continue;
    }
    const tx = item[0] + 0.5;
    const tz = item[1] + 0.5;
    for (let i = 0; i < 60 * 20 && sim.status === 'play'; i++) {
      const dist = Math.hypot(tx - sim.x, tz - sim.z);
      if (dist < 0.06 && Math.abs(sim.speed) < 0.02) break;
      const want = Math.atan2(-(tx - sim.x), -(tz - sim.z));
      const diff = wrap(want - sim.yaw);
      const steer = Math.max(-1, Math.min(1, diff * 4));
      const throttle = dist < 0.06 || Math.abs(diff) > 0.12 ? 0 : Math.max(0.08, Math.min(1, dist * 1.4));
      step(sim, { throttle, steer }, DT);
    }
    if (sim.status !== 'play') return;
  }
  for (let i = 0; i < 60; i++) step(sim, { throttle: 0, steer: 0 }, DT);
}

describe('Jobs 2–5 clear with the right packet', () => {
  it('survey', () => {
    const sim = createSim('survey', ['survey.bank']);
    drive(sim, [[1, 10], [1, 1], [5, 1]]);
    expect(sim.status).toBe('win');
  });
  it('rigger', () => {
    const sim = createSim('rigger', ['rigger.blade']);
    drive(sim, [[5, 7], [5, 5], [3, 5], 'F', [3, 3], [4, 3], [4, 4], [5, 4], [5, 3], [6, 3], [6, 4], 'F', [6, 1], [5, 1]]);
    expect(sim.tool).toBe('blade');
    expect(sim.status).toBe('win');
  });
  it('rigger with the scoop only fails on the cut', () => {
    const sim = createSim('rigger', ['rigger.scoop']);
    drive(sim, [[5, 7], [5, 5], [3, 5], 'F', [3, 3]]);
    expect(sim.status).toBe('fail');
  });
  it('grade', () => {
    const sim = createSim('grade', ['grade.shape', 'grade.lift']);
    drive(sim, [
      [4, 2], 'F', [4, 7], [5, 7], [5, 3], [8, 3], [8, 7], [7, 7],
      'F', [7, 4], [6, 4], [5, 4], [5, 6], [6, 6], [6, 5],
      'F', [6, 6], [6, 10],
    ]);
    expect(sim.status).toBe('win');
  });
  it('grade without the shape card fails', () => {
    const sim = createSim('grade', ['grade.lift']);
    drive(sim, [[4, 2]]);
    expect(sim.status).toBe('fail');
  });
  it('warden', () => {
    const sim = createSim('warden', ['warden.hook']);
    drive(sim, [[4, 6], 'F', [4, 4], 'bumpUp', [5, 4], [5, 5], [6, 5], [6, 4], [7, 4], [7, 5], 'F', [10, 5], [10, 7]]);
    expect(sim.status).toBe('win');
  });
  it('warden without the hook fails when parked', () => {
    const sim = createSim('warden', ['warden.request']);
    drive(sim, [[10, 9], [10, 7]]);
    expect(sim.status).toBe('fail');
    expect(sim.reason).toBe('No hook. The fence was only a request.');
  });
});
