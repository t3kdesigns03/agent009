// The post-job dashboard. Efficiency is a number, so a perfect run and a wasteful one never look the same.
import { crewOf, goodBoard, simulateBoard, type Crew } from './crew';
import type { JobId } from './ids';
import { goodPlan } from './plan';
import { BAYS, PLACES, RIGGER_CELLS, RIGGER_TARGET, cellName, safeDistance } from './site';
import { canonicalAfter, FACTS } from './snapshot';
import { createSim, gradeAutoOps, riggerAutoOps, startAuto, step, type Sim } from './sim';

export interface Extras {
  /** failed runs of this job before this one */
  retries: number;
  /** wrong picks in briefs, packets, plans and boards (each one was explained) */
  wrongPicks: number;
  /** wrong quiz answers (each one was explained) */
  quizWrong: number;
}

export interface Row {
  label: string;
  value: string;
  note?: string;
  bad?: boolean;
}

export interface Dashboard {
  score: number;
  rows: Row[];
  waste: string;
  penalties: { why: string; pts: number }[];
}

interface Par {
  dist: number;
  time: number;
  calls: number;
}

const parCache: Partial<Record<JobId, Par>> = {};

function runToEnd(sim: Sim, max = 60 * 240) {
  for (let i = 0; i < max && sim.status === 'play' && sim.auto; i++) step(sim, { throttle: 0, steer: 0 }, 1 / 60);
  for (let i = 0; i < 120 && sim.status === 'play'; i++) step(sim, { throttle: 0, steer: 0 }, 1 / 60);
}

/** Par: what a clean run costs. Measured by driving the ideal plan, not guessed. */
export function par(job: JobId): Par {
  const hit = parCache[job];
  if (hit) return hit;
  let p: Par;
  switch (job) {
    case 'yoke':
      p = { dist: PLACES.gate.z - PLACES.surveyPoint.z, time: 9, calls: 2 };
      break;
    case 'survey':
      p = { dist: safeDistance(PLACES.surveyPoint, PLACES.stake), time: 16, calls: 3 };
      break;
    case 'rigger': {
      const sim = createSim('rigger', canonicalAfter('survey'));
      startAuto(sim, [{ k: 'reach', x: BAYS.blade.x, z: BAYS.blade.z }, { k: 'mount', tool: 'blade' }, ...riggerAutoOps(sim)]);
      runToEnd(sim);
      p = { dist: sim.stats.dist, time: sim.stats.time, calls: 1 };
      break;
    }
    case 'grade': {
      const plan = goodPlan();
      const sim = createSim('grade', canonicalAfter('rigger'), { plan });
      startAuto(sim, gradeAutoOps(sim, plan));
      runToEnd(sim);
      p = { dist: sim.stats.dist, time: sim.stats.time, calls: 0 };
      break;
    }
    case 'warden':
      p = { dist: 22, time: 30, calls: 0 };
      break;
    case 'dispatch': {
      const sim = createSim('dispatch', canonicalAfter('warden'));
      const c = simulateBoard(goodBoard(), sim);
      p = { dist: 0, time: c.time, calls: 0 };
      break;
    }
  }
  parCache[job] = p;
  return p;
}

const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtD = (d: number) => `${d.toFixed(1)} cells`;

export function dashboard(sim: Sim, x: Extras): Dashboard {
  const st = sim.stats;
  const pr = par(sim.job);
  const pen: { why: string; pts: number }[] = [];
  const add = (pts: number, why: string) => pts > 0 && pen.push({ why, pts: Math.round(pts) });
  const rows: Row[] = [];
  const crew = crewOf(sim);

  if (sim.job !== 'dispatch') {
    const over = st.dist - pr.dist * 1.15;
    rows.push({
      label: 'Distance',
      value: fmtD(st.dist),
      note: `par ${fmtD(pr.dist)}`,
      bad: over > 0.5,
    });
    if (over > 0.5) add(Math.min(20, over * 1.5), `${(st.dist - pr.dist).toFixed(1)} cells longer than the ${sim.job === 'survey' ? 'surveyed route' : 'clean run'} (${fmtD(pr.dist)})`);
  }
  const tOver = st.time - pr.time * 1.25;
  rows.push({ label: 'Time', value: fmtT(st.time), note: `par ${fmtT(pr.time)}`, bad: tOver > 2 });
  if (tOver > 2) add(Math.min(20, tOver / 3), `${Math.round(st.time - pr.time)}s over par`);

  rows.push({ label: 'Retries', value: String(x.retries), bad: x.retries > 0 });
  add(Math.min(20, x.retries * 5), `${x.retries} failed run${x.retries === 1 ? '' : 's'} before this one`);

  rows.push({
    label: 'Hazards hit',
    value: String(st.hazards),
    note: st.hazardNotes.length ? [...new Set(st.hazardNotes)].join(', ') : 'none',
    bad: st.hazards > 0,
  });
  add(st.hazards * 8, `hit ${st.hazards} hazard${st.hazards === 1 ? '' : 's'} (${[...new Set(st.hazardNotes)].join(', ')})`);

  switch (sim.job) {
    case 'yoke': {
      rows.push({ label: 'Yoke binds', value: String(st.binds), note: 'par 2 (start + after the belt)' });
      rows.push({ label: 'Your cuts (K)', value: String(st.cuts), bad: st.cuts > 0 });
      add(st.cuts * 4, `you cut the yoke ${st.cuts}× with K. Each cut cost a re-bind`);
      break;
    }
    case 'survey': {
      rows.push({ label: 'Scans', value: String(st.scans), note: `par ${pr.calls}`, bad: st.scans > pr.calls + 3 });
      if (st.scans > pr.calls + 3) add((st.scans - pr.calls - 3) * 2, `${st.scans} scans where about ${pr.calls} cover the route`);
      const slots = sim.packet.reduce((n, id) => n + FACTS[id].slots, 0);
      rows.push({ label: 'Context items', value: `${sim.packet.length} (${slots}/3 slots)`, note: sim.packet.join(', ') });
      const extra = sim.packet.filter((f) => f !== 'water' && f !== 'bank');
      if (extra.length) add(extra.length * 5, `packed ${extra.map((f) => `“${FACTS[f].text.split(':')[0].split('.')[0]}”`).join(' and ')}, which the next jobs don’t need`);
      break;
    }
    case 'rigger':
    case 'grade':
    case 'warden': {
      rows.push({ label: 'Tool calls', value: String(st.toolCalls), note: st.swaps ? `${st.swaps} swap${st.swaps > 1 ? 's' : ''}` : undefined, bad: st.swaps > 0 });
      add(st.swaps * 4, `${st.swaps} tool swap${st.swaps > 1 ? 's' : ''}: the first pick wasn’t the right one`);
      rows.push({ label: 'Cells cut', value: String(st.cellsCut) });
      rows.push({
        label: 'Waste (off-plan)',
        value: String(st.waste.length),
        note: st.waste.length ? st.waste.map((i) => cellName(i) ?? 'field').slice(0, 6).join(' ') : undefined,
        bad: st.waste.length > 0,
      });
      if (sim.job === 'rigger' && st.waste.length)
        add(st.waste.length * 5, `you cut ${st.cellsCut} cells when ${RIGGER_TARGET} were needed`);
      else add(st.waste.length * 5, `${st.waste.length} cell${st.waste.length > 1 ? 's' : ''} cut that weren’t in the work order`);
      rows.push({ label: 'Cells revisited', value: String(st.revisits), bad: st.revisits > 2 });
      add(Math.max(0, st.revisits - 2) * 1, `${st.revisits} passes over cells already cut`);
      if (sim.wear > 0 && sim.job === 'rigger') {
        rows.push({ label: 'Bucket wear', value: String(sim.wear), bad: true });
        add(sim.wear * 2, `the bucket lifted ${sim.wear} cells a blade would have pushed (3× slower, with wear)`);
      }
      if (sim.job === 'warden') {
        rows.push({ label: 'Guardrail blocks', value: String(st.blocks), note: 'times the hook stopped a move' });
        rows.push({ label: 'Approvals asked', value: String(st.approvals), bad: st.approvals > 0 });
      }
      rows.push({ label: 'Driving', value: st.auto ? 'agent (auto)' : 'you, by hand' });
      break;
    }
    case 'dispatch': {
      if (crew) dispatchRows(crew, rows, add);
      break;
    }
  }
  rows.push({ label: 'Wrong picks', value: String(x.wrongPicks + x.quizWrong), note: `${x.wrongPicks} in setup, ${x.quizWrong} in the check`, bad: x.wrongPicks + x.quizWrong > 0 });
  add((x.wrongPicks + x.quizWrong) * 4, `${x.wrongPicks + x.quizWrong} wrong pick${x.wrongPicks + x.quizWrong === 1 ? '' : 's'} (each one was explained, and counted)`);

  const score = Math.max(0, Math.min(100, 100 - pen.reduce((n, p) => n + p.pts, 0)));
  pen.sort((a, b) => b.pts - a.pts);
  const waste = pen.length
    ? `Most wasteful: ${pen[0].why}.`
    : sim.job === 'survey'
      ? 'Nothing wasted. You scanned, routed around the bank, and packed just the two hazards.'
      : 'Nothing wasted. That’s the clean run.';
  return { score, rows, waste, penalties: pen };
}

function dispatchRows(c: Crew, rows: Row[], add: (pts: number, why: string) => void) {
  const ws = Object.values(c.workers);
  const busy = ws.reduce((n, w) => n + w.busy, 0);
  const idle = ws.reduce((n, w) => n + w.idle, 0);
  rows.push({ label: 'Handoffs', value: String(c.handoffs), note: 'results passed agent → agent' });
  rows.push({ label: 'Agent busy time', value: fmtT(busy), note: 'all four agents, summed' });
  rows.push({ label: 'Agent idle time', value: fmtT(idle), note: 'waiting on a handoff' });
  rows.push({
    label: 'Parallel saved',
    value: fmtT(Math.max(0, busy - c.time)),
    note: 'busy time minus wall-clock time',
  });
  rows.push({ label: 'Haul rounds', value: String(c.rounds), note: c.rounds > 1 ? 'loaded before the bay’s spoil was ready' : 'one round' });
  const loaderCut = c.board.assign.cut === 'loader';
  const loaderHaul = c.board.assign.haul === 'loader';
  if (loaderCut) add(8, 'the loader’s bucket cut the bay, 3× slower than the dozer’s blade');
  if (loaderHaul) add(8, 'the loader hauled a quarter load per trip instead of the truck');
  if (c.board.assign.survey === 'dozer') add(6, 'the dozer surveyed, so the bay waited: serial work that could have run in parallel');
  if (c.board.packet.cut === 'report') add(5, 'the dozer re-read a 40-page report before every cell');
}

/** For the fail panel: a short summary with real numbers. */
export function failSummary(sim: Sim): Row[] {
  const st = sim.stats;
  const out: Row[] = [
    { label: 'Time', value: fmtT(st.time) },
    { label: 'Hazards hit', value: String(st.hazards) },
  ];
  if (sim.job !== 'dispatch') out.unshift({ label: 'Distance', value: fmtD(st.dist) });
  if (sim.job === 'survey') out.push({ label: 'Scans', value: String(st.scans) });
  if (sim.job === 'rigger' || sim.job === 'grade' || sim.job === 'warden')
    out.push({ label: 'Cells cut', value: String(st.cellsCut) }, { label: 'Tool calls', value: String(st.toolCalls) });
  return out;
}

export const RIGGER_LIST = RIGGER_CELLS.map((i) => cellName(i)).join(' ');
