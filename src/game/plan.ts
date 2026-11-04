// Job 4: a plan the learner can see, grade and revise before anyone drives.
import { COLS, LAKE, LAKE_CELLS, RIGGER_CELLS, TEMPLATE, W, cellIndex, cellName, inLake, ptOf } from './site';

export type CellPlan = 'none' | 'shelf' | 'deep';
export type StepId = 'shelf' | 'deep' | 'exit';

export interface Plan {
  /** Planned depth for each new-lake cell, keyed by tile index. */
  cells: Record<number, CellPlan>;
  /** The order the machine works in. */
  order: StepId[];
}

export const STEP_TEXT: Record<StepId, string> = {
  shelf: 'Cut every SHELF cell (blade at shelf depth)',
  deep: 'Cut every DEEP cell (blade at deep depth)',
  exit: 'Lift the blade, drive out, park at the stake',
};

/** The client needs this many deep cells for the lake to hold water through summer. */
export const DEEP_NEEDED = 8;

export interface Issue {
  rule: string;
  text: string;
  cells: number[];
}

export const clonePlan = (p: Plan): Plan => ({ cells: { ...p.cells }, order: [...p.order] });

/** The draft in the work order. It has two real problems. A learner grades it and fixes it. */
export function draftPlan(): Plan {
  const cells: Record<number, CellPlan> = {};
  for (const i of LAKE_CELLS) {
    const n = cellName(i)!;
    const row = Number(n[1]);
    cells[i] = row === 2 || row === 3 ? (n[0] === 'A' ? 'shelf' : 'deep') : 'shelf';
  }
  return { cells, order: ['deep', 'shelf', 'exit'] };
}

/** A plan that grades clean: shelf ring, deep middle B2–E3, shelf first. */
export function goodPlan(): Plan {
  const cells: Record<number, CellPlan> = {};
  for (const i of LAKE_CELLS) {
    const n = cellName(i)!;
    const row = Number(n[1]);
    const inner = (row === 2 || row === 3) && n[0] !== 'A' && n[0] !== 'F';
    cells[i] = inner ? 'deep' : 'shelf';
  }
  return { cells, order: ['shelf', 'deep', 'exit'] };
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Will this neighbour still be at ground level when the plan is done? */
function endsAtGround(plan: Plan, x: number, z: number): boolean {
  const i = z * W + x;
  const k = TEMPLATE.kind[i];
  if (k === 'water' || k === 'rock' || k === 'fence') return false;
  if (!inLake(x, z)) return true;
  return (plan.cells[i] ?? 'none') === 'none';
}

/** Check a plan against the site's rules. Empty list = a plan you can run. */
export function gradePlan(plan: Plan): Issue[] {
  const issues: Issue[] = [];

  const unplanned = LAKE_CELLS.filter((i) => (plan.cells[i] ?? 'none') === 'none');
  if (unplanned.length)
    issues.push({
      rule: 'COVER',
      text: `${unplanned.length} staked cell${unplanned.length > 1 ? 's are' : ' is'} unplanned. The client staked the whole lake, so every cell needs a depth.`,
      cells: unplanned,
    });

  const walls: number[] = [];
  for (const i of LAKE_CELLS) {
    if (plan.cells[i] !== 'deep') continue;
    const { x, z } = ptOf(i);
    if (N4.some(([dx, dz]) => endsAtGround(plan, x + dx, z + dz))) walls.push(i);
  }
  if (walls.length)
    issues.push({
      rule: 'WALL',
      text: `${walls.map((i) => cellName(i)).join(', ')}: deep next to uncut ground leaves a 2-step wall. It caves in, and nothing can climb it. Put a shelf step between them.`,
      cells: walls,
    });

  const deep = LAKE_CELLS.filter((i) => plan.cells[i] === 'deep').length;
  if (deep < DEEP_NEEDED)
    issues.push({
      rule: 'DEPTH',
      text: `Only ${deep} deep cell${deep === 1 ? '' : 's'}. The client needs ${DEEP_NEEDED} so the lake still holds water through summer.`,
      cells: [],
    });

  const at = (s: StepId) => plan.order.indexOf(s);
  if (at('deep') < at('shelf'))
    issues.push({
      rule: 'ORDER',
      text: 'Deep is cut before shelf. Each deep cell would sit beside ground that hasn’t been cut yet, a 2-step wall that caves in. Shelf first.',
      cells: [],
    });
  if (at('exit') !== plan.order.length - 1)
    issues.push({
      rule: 'ORDER',
      text: 'The plan drives out before the cutting is done, so it has to come back in. Exit goes last.',
      cells: [],
    });

  return issues;
}

/** Cells for a step, in a snake so each move is one cell. */
export function stepCells(plan: Plan, step: 'shelf' | 'deep'): number[] {
  const out: number[] = [];
  for (let r = 0; r < LAKE.rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < LAKE.cols; c++) {
      const i = cellIndex(`${COLS[c]}${r + 1}`);
      if (plan.cells[i] === step) row.push(i);
    }
    out.push(...(r % 2 ? row.reverse() : row));
  }
  return out;
}

export const isRiggerCell = (i: number) => RIGGER_CELLS.includes(i);
