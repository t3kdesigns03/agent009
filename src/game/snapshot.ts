// What the site looks like between jobs. It persists, so every job is the same dig, next step.
import type { JobId } from './ids';
import { goodPlan, type Plan } from './plan';
import { CHANNEL_CELLS, LAKE_CELLS, RIGGER_CELLS, TEMPLATE, W, idx, initialRevealed, type Tool } from './site';

export type FactId = 'water' | 'bank' | 'route' | 'report' | 'weather';

export interface Fact {
  id: FactId;
  text: string;
  slots: number;
  /** The fact can only be packed after the learner perceived it with a scan. */
  needs?: 'water' | 'bank';
  /** Why you'd pick it, and what it costs. Shown when the packet is graded. */
  cost: string;
}

export const PACKET_SLOTS = 3;

export const FACTS: Record<FactId, Fact> = {
  water: {
    id: 'water',
    text: 'Existing water west and north of the field. Never enter it.',
    slots: 1,
    needs: 'water',
    cost: 'One slot. Every later job needs it.',
  },
  bank: {
    id: 'bank',
    text: 'Soft bank: waterlogged ground in front of the existing water, out to the middle of the field. It looks firm and rolls a machine.',
    slots: 1,
    needs: 'bank',
    cost: 'One slot. It’s the hazard you can’t see from above, and the reason the survey exists.',
  },
  route: {
    id: 'route',
    text: 'The route you drove today: east along the south edge, then north to the stake.',
    slots: 1,
    cost: 'One slot. True for this trip only. The next machine goes somewhere else, so it goes stale and costs a slot.',
  },
  report: {
    id: 'report',
    text: 'The full 40-page soils report.',
    slots: 3,
    cost: 'Three slots: the whole packet. It does mention the bank, on page 31. Every later step pays to read all 40 pages to find it.',
  },
  weather: {
    id: 'weather',
    text: 'Weather: dry all week.',
    slots: 1,
    cost: 'One slot. True, but it doesn’t change where it’s safe to drive. A dry week doesn’t firm up a soft bank.',
  },
};

export const FACT_ORDER: FactId[] = ['water', 'bank', 'route', 'report', 'weather'];

export interface Snapshot {
  depth: number[];
  revealed: boolean[];
  ripped: boolean[];
  tool: Tool;
  hook: boolean;
  packet: FactId[];
  plan: Plan | null;
  spoil: number;
  wear: number;
  filled: boolean;
}

export function freshSnapshot(): Snapshot {
  return {
    depth: TEMPLATE.kind.map(() => 0),
    revealed: initialRevealed(),
    ripped: TEMPLATE.kind.map(() => false),
    tool: 'none',
    hook: false,
    packet: [],
    plan: null,
    spoil: 0,
    wear: 0,
    filled: false,
  };
}

export const cloneSnap = (s: Snapshot): Snapshot => ({
  ...s,
  depth: [...s.depth],
  revealed: [...s.revealed],
  ripped: [...s.ripped],
  packet: [...s.packet],
  plan: s.plan ? { cells: { ...s.plan.cells }, order: [...s.plan.order] } : null,
});

/** The site as a careful learner would leave it after `job`. Used when no saved snapshot exists. */
export function canonicalAfter(job: JobId | null): Snapshot {
  const s = freshSnapshot();
  if (!job || job === 'yoke') return s;
  // Survey: the west field scanned, both hazards packed.
  for (let z = 6; z <= 18; z++)
    for (let x = 1; x <= 12; x++) s.revealed[idx(x, z)] = true;
  s.packet = ['water', 'bank'];
  if (job === 'survey') return s;
  for (const i of RIGGER_CELLS) s.depth[i] = 1;
  s.tool = 'blade';
  s.spoil = RIGGER_CELLS.length;
  if (job === 'rigger') return s;
  const plan = goodPlan();
  s.plan = plan;
  for (const i of LAKE_CELLS) s.depth[i] = plan.cells[i] === 'deep' ? 2 : 1;
  s.spoil = LAKE_CELLS.length + 8;
  if (job === 'grade') return s;
  for (const i of CHANNEL_CELLS) s.depth[i] = 1;
  s.hook = true;
  s.spoil += CHANNEL_CELLS.length;
  return s;
}

/* Compact storage: one char per tile. */
export interface StoredSnapshot extends Omit<Snapshot, 'depth' | 'revealed' | 'ripped'> {
  depth: string;
  revealed: string;
  ripped: string;
}

export function packSnap(s: Snapshot): StoredSnapshot {
  return {
    ...s,
    depth: s.depth.join(''),
    revealed: s.revealed.map((b) => (b ? '1' : '0')).join(''),
    ripped: s.ripped.map((b) => (b ? '1' : '0')).join(''),
  };
}

export function unpackSnap(p: StoredSnapshot): Snapshot | null {
  const n = TEMPLATE.kind.length;
  if (typeof p.depth !== 'string' || p.depth.length !== n || p.revealed?.length !== n) return null;
  return {
    ...freshSnapshot(),
    ...p,
    depth: [...p.depth].map(Number),
    revealed: [...p.revealed].map((c) => c === '1'),
    ripped: typeof p.ripped === 'string' && p.ripped.length === n ? [...p.ripped].map((c) => c === '1') : TEMPLATE.kind.map(() => false),
    packet: Array.isArray(p.packet) ? p.packet.filter((f) => f in FACTS) : [],
  };
}

export const tileCount = W;
