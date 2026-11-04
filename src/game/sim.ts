// The site. One step(sim, intent, dt). Collision, cut, stuck, win, fail. No React.
import { CARDS, type CardId } from './cards';
import type { Step } from './dispatch';
import {
  LEVEL,
  parseMap,
  parked,
  shape,
  tileAt,
  type AutoOp,
  type JobId,
  type Phase,
  type LevelDef,
  type Mode,
  type Target,
  type TileKind,
  type Tool,
} from './levels';
import { yoke, type Drive, type Intent } from './yoke';

export const MAX_SPEED = 2.4; // tiles per second
export const REVERSE_SPEED = 1.3;
export const ACCEL = 5;
export const DECEL = 9;
export const TURN_RATE = 2.6; // radians per second

export const MODE_DEPTH: Record<Mode, number> = { up: 0, shelf: 1, deep: 2 };
const MODE_CYCLE: Mode[] = ['up', 'shelf', 'deep'];

export interface LogLine {
  t: number;
  text: string;
}

interface AutoState {
  ops: AutoOp[];
  i: number;
  t: number;
  bumpsAt: number;
  rebound: boolean;
  rebindT: number;
  done: boolean;
  phase: Phase | null;
  /** Phases finished, in order */
  passed: Phase[];
}

export interface Sim {
  level: LevelDef;
  w: number;
  h: number;
  kind: TileKind[];
  target: Target[];
  depth: number[];
  x: number;
  z: number;
  yaw: number;
  speed: number;
  yokeBound: boolean;
  beltTripped: boolean;
  tool: Tool;
  mode: Mode;
  modes: Mode[];
  hook: boolean;
  surveyed: boolean;
  cards: CardId[];
  bumps: number;
  bumpCooldown: number;
  flash: { i: number; t: number } | null;
  status: 'play' | 'win' | 'fail';
  reason: string;
  log: LogLine[];
  time: number;
  shake: number;
  /** distance driven, for track treads */
  odo: number;
  /** Tile that caused the fail, or -1 */
  failAt: number;
  /** After a fail, hidden ground is drawn as it really was */
  revealed: boolean;
  /** Tile the ramp warning was last given from, or -1 */
  rampWarned: number;
  auto: AutoState | null;
}

export function createSim(job: JobId, cards: CardId[] = [], steps: Step[] = []): Sim {
  const level = LEVEL[job];
  const p = parseMap(level.map);
  const modes = level.modes(cards);
  const sim: Sim = {
    level,
    w: p.w,
    h: p.h,
    kind: p.kind,
    target: p.target,
    depth: p.kind.map(() => 0),
    x: p.start.x,
    z: p.start.z,
    yaw: 0,
    speed: 0,
    yokeBound: true,
    beltTripped: false,
    tool: level.startTool,
    mode: modes.includes('up') ? 'up' : modes[0],
    modes,
    hook: cards.includes('warden.hook'),
    // Only Survey's own job hides the ground. Elsewhere the water is plain to see.
    surveyed: job === 'survey' ? cards.includes('survey.bank') : true,
    cards: [...cards],
    bumps: 0,
    bumpCooldown: 0,
    flash: null,
    status: 'play',
    reason: '',
    log: [],
    time: 0,
    shake: 0,
    odo: 0,
    failAt: -1,
    revealed: false,
    rampWarned: -1,
    auto: level.auto
      ? { ops: level.auto, i: 0, t: 0, bumpsAt: 0, rebound: false, rebindT: 0, done: false, phase: null, passed: [] }
      : null,
  };
  for (const s of steps) say(sim, s.log);
  for (const id of cards) if (job !== 'dispatch') say(sim, `LOADED: ${CARDS[id].text}`);
  if (level.startTool === 'blade') say(sim, `Blade mounted. ${modeLabel(sim)}`);
  return sim;
}

export function say(sim: Sim, text: string) {
  sim.log.push({ t: sim.time, text });
  if (sim.log.length > 40) sim.log.splice(0, sim.log.length - 40);
}

export function modeLabel(sim: Sim): string {
  if (sim.tool === 'none') return 'No tool.';
  const locked = sim.modes.length === 1 ? ' Locked.' : '';
  const oneDepth = sim.mode === 'deep' && !sim.modes.includes('shelf') ? ' One depth only.' : '';
  return `${sim.tool === 'blade' ? 'Blade' : 'Scoop'} ${sim.mode.toUpperCase()}.${locked}${oneDepth}`;
}

/** What F does next, for the HUD. */
export function nextUse(sim: Sim): string {
  if (!sim.yokeBound) return 'BIND YOKE';
  if (sim.level.id === 'dispatch' || sim.tool === 'none' || sim.modes.length < 2) return '';
  let i = MODE_CYCLE.indexOf(sim.mode);
  for (let n = 0; n < 3; n++) {
    i = (i + 1) % 3;
    if (sim.modes.includes(MODE_CYCLE[i])) break;
  }
  const m = MODE_CYCLE[i];
  return m === 'up' ? 'LIFT' : `LOWER ${m.toUpperCase()}`;
}

export function fail(sim: Sim, reason: string, at = -1) {
  if (sim.status !== 'play') return;
  sim.status = 'fail';
  sim.reason = reason;
  sim.failAt = at >= 0 ? at : tileAt(sim, sim.x, sim.z);
  sim.revealed = true;
  sim.speed = 0;
  sim.shake = 0.45;
  say(sim, `FAIL: ${reason}`);
}

function win(sim: Sim) {
  if (sim.status !== 'play') return;
  sim.status = 'win';
  sim.speed = 0;
  say(sim, 'CLEAR.');
}

export function bindYoke(sim: Sim) {
  if (sim.yokeBound) return;
  sim.yokeBound = true;
  say(sim, 'Yoke bound. The wheel is on.');
}

export function dropYoke(sim: Sim, why = 'Yoke cut. The model sits.') {
  if (!sim.yokeBound) return;
  sim.yokeBound = false;
  sim.speed = 0;
  say(sim, why);
}

/** Ask for a blade mode. If the fact is missing the blade only knows deep. */
export function setMode(sim: Sim, wanted: Mode) {
  if (sim.tool === 'none') return;
  let m: Mode = wanted;
  if (!sim.modes.includes(m)) {
    if (m === 'up' || !sim.modes.includes('deep')) m = sim.modes[0];
    else m = 'deep';
  }
  if (m !== sim.mode) {
    sim.mode = m;
    say(sim, modeLabel(sim));
  }
}

export function cycleMode(sim: Sim) {
  if (sim.tool === 'none') {
    say(sim, 'Nothing on the front to lower.');
    return;
  }
  if (sim.modes.length === 1) {
    say(sim, modeLabel(sim));
    return;
  }
  let i = MODE_CYCLE.indexOf(sim.mode);
  for (let n = 0; n < 3; n++) {
    i = (i + 1) % 3;
    if (sim.modes.includes(MODE_CYCLE[i])) break;
  }
  sim.mode = MODE_CYCLE[i];
  say(sim, modeLabel(sim));
}

/** F / Use. Dead Yoke: bind it. Live Yoke: cycle the blade. */
export function use(sim: Sim) {
  if (!sim.yokeBound) bindYoke(sim);
  else if (sim.level.id !== 'dispatch') cycleMode(sim);
}

/** Leave (finale). Checks the lake. Early is not a fail. */
export function leave(sim: Sim) {
  if (sim.status !== 'play' || sim.level.id !== 'dispatch') return;
  if (!sim.yokeBound) return fail(sim, 'Dead yoke at the end. Nobody can drive it home.');
  if (sim.tool === 'scoop') return fail(sim, 'A scoop on the front. It cannot push this cut.');
  const s = shape(sim);
  const done = sim.tool === 'blade' && sim.bumps >= 1 && s.deepOK && s.shelfOK && s.rampIntact && parked(sim);
  if (done) return win(sim);
  say(sim, 'Not a lake yet. The crew keeps working.');
}

const cuttable = (k: TileKind) => k === 'ground';

type Enter = 'ok' | 'wall' | 'hook' | 'fail';

function bump(sim: Sim, i: number, what: 'fence' | 'water') {
  sim.flash = { i, t: 0.35 };
  if (sim.bumpCooldown <= 0) {
    if (sim.bumps === 0 || what === 'water') say(sim, `WARDEN refused the ${what}.`);
    sim.bumps++;
  }
  sim.bumpCooldown = 0.5;
}

/** A move from tile `from` into tile `to`. Applies cuts and hazards. */
export function enter(sim: Sim, from: number, to: number): Enter {
  if (to < 0) return 'wall';
  const k = sim.kind[to];
  if (k === 'rock' || k === 'crew') return 'wall';
  if (k === 'fence') {
    if (sim.hook) {
      bump(sim, to, 'fence');
      return 'hook';
    }
    fail(sim, 'Through the fence. It was only a request.', to);
    return 'fail';
  }
  if (k === 'water') {
    if (sim.hook) {
      bump(sim, to, 'water');
      return 'hook';
    }
    fail(sim, 'You charged a lake that was already there.', to);
    return 'fail';
  }
  if (k === 'bank') {
    fail(sim, sim.surveyed ? 'Soft bank. The machine rolled.' : 'The ground gave way. Survey never had the bank.', to);
    return 'fail';
  }

  const lowered = sim.tool !== 'none' && sim.mode !== 'up';
  const t = sim.target[to];

  // The iron hits the tile first.
  if (lowered && sim.tool === 'scoop' && (t === 'shelf' || t === 'deep')) {
    fail(sim, 'The scoop cannot push this cut.', to);
    return 'fail';
  }
  if (lowered && sim.tool === 'blade' && cuttable(k)) {
    if (t === 'ramp') {
      fail(sim, 'You cut the ramp with the blade down. Now the hole has no way out.', to);
      return 'fail';
    }
    if (t === 'shelf' && sim.mode === 'deep') {
      fail(
        sim,
        sim.modes.includes('shelf')
          ? 'Deep blade on the shelf. The edge caved in.'
          : 'Deep blade on the shelf. The edge caved in. Grade only knew one depth.',
        to,
      );
      return 'fail';
    }
  }

  // Climbing: one step up at a time, unless a ramp carries you.
  const cutTo = lowered && sim.tool === 'blade' && cuttable(k) ? MODE_DEPTH[sim.mode] : 0;
  const fromD = from >= 0 ? sim.depth[from] : 0;
  const toD = Math.max(sim.depth[to], cutTo);
  const viaRamp = sim.target[to] === 'ramp' || (from >= 0 && sim.target[from] === 'ramp');
  if (fromD - toD > 1 && !viaRamp) {
    const msg = 'Too steep to climb. Cut a shelf step, or take the ramp.';
    const last = sim.log[sim.log.length - 1];
    if (!last || last.text !== msg) say(sim, msg);
    return 'wall';
  }

  if (cutTo > 0) {
    sim.depth[to] = Math.max(sim.depth[to], cutTo);
    if (t === 'none' && sim.depth[to] >= 2) {
      fail(sim, 'Deep cut off the plan. You sat in a hole you dug, and it has no way out.', to);
      return 'fail';
    }
  }

  if (k === 'belt' && !sim.beltTripped) {
    sim.beltTripped = true;
    dropYoke(sim, 'Dead belt. Yoke unbound. Speed zero. Press F / USE to bind it.');
  }

  if (k === 'pad' && sim.level.hasPad && sim.tool === 'none') {
    const blade = sim.cards.includes('rigger.blade');
    const scoop = sim.cards.includes('rigger.scoop');
    if (blade || scoop) {
      sim.tool = blade ? 'blade' : 'scoop';
      sim.mode = sim.modes.includes('up') ? 'up' : sim.modes[0];
      say(sim, `${sim.level.id === 'dispatch' ? 'RIGGER: ' : ''}Pad mounted a ${sim.tool}. ${modeLabel(sim)}`);
    } else {
      const last = sim.log[sim.log.length - 1];
      const msg = 'Pad: Rigger has no tool fact. Nothing mounts.';
      if (!last || last.text !== msg) say(sim, msg);
    }
  }
  return 'ok';
}

function tryMove(sim: Sim, dx: number, dz: number) {
  const from = tileAt(sim, sim.x, sim.z);
  const nx = sim.x + dx;
  const nz = sim.z + dz;
  const to = tileAt(sim, nx, nz);
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
  if (r === 'fail' || r === 'hook') {
    sim.speed = 0;
    return;
  }
  // Wall: slide along one axis.
  const tx = tileAt(sim, nx, sim.z);
  if (tx === from || (tx !== to && enter(sim, from, tx) === 'ok')) {
    sim.x = nx;
    return;
  }
  if (sim.status !== 'play') return;
  const tz = tileAt(sim, sim.x, nz);
  if (tz === from || (tz !== to && enter(sim, from, tz) === 'ok')) {
    sim.z = nz;
    return;
  }
  sim.speed *= 0.3;
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Finale: the crew drives. Dispatch only hands out work. */
function autopilot(sim: Sim, dt: number): Drive {
  const a = sim.auto!;
  const idle = { throttle: 0, steer: 0 };

  // Operator rebinds Yoke once after the dead belt.
  if (sim.beltTripped && !sim.yokeBound && !a.rebound) {
    a.rebindT += dt;
    if (a.rebindT > 0.8) {
      a.rebound = true;
      sim.yokeBound = true;
      say(sim, 'OPERATOR: Yoke bound again.');
    }
    return idle;
  }
  if (!sim.yokeBound || a.done) return idle;

  const op = a.ops[a.i];
  if (!op) {
    a.done = true;
    return idle;
  }
  const next = () => {
    a.i++;
    a.t = 0;
  };
  a.t += dt;

  switch (op.kind) {
    case 'log':
      say(sim, op.text);
      next();
      return idle;
    case 'phase':
      if (a.phase) a.passed.push(a.phase);
      a.phase = op.agent;
      next();
      return idle;
    case 'mode':
      setMode(sim, op.mode);
      next();
      return idle;
    case 'park':
      if (Math.abs(sim.speed) < 0.02) {
        say(sim, 'CREW: parked at the flag. Your call, Dispatch. Press LEAVE.');
        if (a.phase) a.passed.push(a.phase);
        a.phase = null;
        a.done = true;
        next();
      }
      return idle;
    case 'bump': {
      if (a.t < dt * 1.5) a.bumpsAt = sim.bumps;
      if (sim.bumps > a.bumpsAt || a.t > 3) {
        if (Math.abs(sim.speed) < 0.02) next();
        return idle;
      }
      return steerTo(sim, sim.x, sim.z - 2, 1);
    }
    case 'go': {
      const tx = op.x + 0.5;
      const tz = op.z + 0.5;
      const dist = Math.hypot(tx - sim.x, tz - sim.z);
      if (dist < 0.06) {
        if (Math.abs(sim.speed) < 0.02) next();
        return idle;
      }
      return steerTo(sim, tx, tz, dist);
    }
  }
}

function steerTo(sim: Sim, tx: number, tz: number, dist: number): Drive {
  const want = Math.atan2(-(tx - sim.x), -(tz - sim.z));
  const diff = wrap(want - sim.yaw);
  const steer = Math.max(-1, Math.min(1, diff * 4));
  if (Math.abs(diff) > 0.12) return { throttle: 0, steer };
  return { throttle: Math.max(0.08, Math.min(1, dist * 1.4)), steer };
}

/** The extra Grade fact earns its place: it warns before the ramp. */
function rampWarning(sim: Sim) {
  if (!sim.cards.includes('grade.lift')) return;
  const here = tileAt(sim, sim.x, sim.z);
  const ahead = tileAt(sim, sim.x - Math.sin(sim.yaw) * 0.9, sim.z - Math.cos(sim.yaw) * 0.9);
  const facingRamp = ahead >= 0 && ahead !== here && sim.target[ahead] === 'ramp' && sim.target[here] !== 'ramp';
  const danger = facingRamp && sim.tool === 'blade' && sim.mode !== 'up';
  if (danger && sim.rampWarned !== here) {
    sim.rampWarned = here;
    say(sim, 'GRADE: lift the blade before you drive the ramp. Press F.');
  }
}

/** Advance the site by dt seconds. */
export function step(sim: Sim, intent: Intent, dt: number) {
  if (sim.shake > 0) sim.shake = Math.max(0, sim.shake - dt);
  if (sim.flash) {
    sim.flash.t -= dt;
    if (sim.flash.t <= 0) sim.flash = null;
  }
  if (sim.status !== 'play') return;
  sim.time += dt;
  sim.bumpCooldown = Math.max(0, sim.bumpCooldown - dt);

  if (intent.cut) dropYoke(sim);
  if (intent.use) use(sim);
  if (intent.leave) leave(sim);
  if (sim.status !== 'play') return;

  const wanted: Drive = sim.auto ? autopilot(sim, dt) : intent;
  const d = yoke(sim.yokeBound, wanted);

  sim.yaw = wrap(sim.yaw + d.steer * TURN_RATE * dt);
  const target = d.throttle >= 0 ? d.throttle * MAX_SPEED : d.throttle * REVERSE_SPEED;
  const speeding = Math.sign(target) === Math.sign(sim.speed) && Math.abs(target) > Math.abs(sim.speed);
  const rate = speeding || sim.speed === 0 ? ACCEL : DECEL;
  if (sim.speed < target) sim.speed = Math.min(target, sim.speed + rate * dt);
  else if (sim.speed > target) sim.speed = Math.max(target, sim.speed - rate * dt);
  if (!sim.yokeBound) sim.speed = 0;

  // Sub-step so no tile is skipped.
  const dist = sim.speed * dt;
  const n = Math.max(1, Math.ceil(Math.abs(dist) / 0.2));
  const fx = -Math.sin(sim.yaw);
  const fz = -Math.cos(sim.yaw);
  const x0 = sim.x;
  const z0 = sim.z;
  for (let s = 0; s < n && sim.status === 'play' && sim.speed !== 0; s++) {
    tryMove(sim, (fx * dist) / n, (fz * dist) / n);
  }
  sim.odo += Math.hypot(sim.x - x0, sim.z - z0) * Math.sign(sim.speed || 1) + Math.abs(d.steer) * dt * 0.3;
  if (sim.status !== 'play') return;
  rampWarning(sim);

  const out = sim.level.check(sim);
  if (out?.status === 'win') win(sim);
  else if (out?.status === 'fail') fail(sim, out.reason);
}
