// The site, drawn crisp and bright. Every hazard and tool state gets a label in the scene. No React.
import { AGENTS, crewOf, type AgentId, type Crew, type Worker } from './crew';
import {
  BAYS,
  CHANNEL_CELLS,
  COLS,
  EAST_BAY,
  LAKE,
  LAKE_CELLS,
  PLACES,
  RIGGER_CELLS,
  TEMPLATE,
  idx,
  inLake,
  ptOf,
  type Pt,
} from './site';
import { goalOf, here, planDone, type Sim } from './sim';

export interface Cam {
  x: number;
  z: number;
  ready: boolean;
  /** tour / focus override */
  focus: Pt | null;
}

export interface View {
  w: number; // CSS px
  h: number;
  dpr: number;
  t: number;
  reducedMotion: boolean;
  cam: Cam;
  /** screen space kept clear by the HUD */
  top: number;
  bottom: number;
}

export const newCam = (): Cam => ({ x: 0, z: 0, ready: false, focus: null });

export function tileSize(w: number, h: number) {
  return Math.max(34, Math.min(60, Math.min(w, h * 0.92) / 8.5));
}

export const C = {
  bg: '#162032',
  rock: '#334155',
  rockTop: '#475569',
  rockHi: '#64748b',
  ground: '#e7c886',
  ground2: '#dfbf7b',
  speck: '#c9a462',
  unsurveyed: '#c9b48c',
  hatch: 'rgba(90, 72, 40, 0.28)',
  road: '#4b5563',
  roadLine: '#f8fafc',
  beltA: '#111827',
  beltB: '#facc15',
  water: '#1e88e5',
  water2: '#64b5f6',
  shore: '#ffffff',
  bank: '#6d4c2d',
  bankDot: '#38bdf8',
  bankEdge: '#fb923c',
  fence: '#f8fafc',
  wire: '#ef4444',
  hook: '#22d3ee',
  caution: 'rgba(250, 204, 21, 0.38)',
  pad: '#a3b1c2',
  padLine: '#facc15',
  shelf: '#b9824a',
  deep: '#7a4a24',
  deepRim: '#4a2b12',
  plan: '#0d9488',
  planDeep: '#1e3a8a',
  work: '#facc15',
  good: '#22c55e',
  bad: '#ef4444',
  rule: '#22d3ee',
  newWater: '#38bdf8',
  heap: '#8b5a2b',
  heapTop: '#a8743f',
  stake: '#f97316',
  pennant: '#ef4444',
  body: '#ffc107',
  bodyEdge: '#c79100',
  track: '#111827',
  cab: '#1f2937',
  glass: '#93c5fd',
  steel: '#e2e8f0',
  dirt: '#8b5a2b',
  ink: '#0f172a',
  link: '#22d3ee',
};

export const TOOL_COLOR = { blade: '#2563eb', bucket: '#ea580c', ripper: '#9333ea' } as const;

function hash(x: number, z: number) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Camera: follow the machine, keep it in the clear middle of the screen, never show more void than needed. */
export function updateCam(cam: Cam, sim: Sim, v: View, dt: number) {
  const T = tileSize(v.w, v.h);
  const lead = Math.min(1, Math.abs(sim.speed) / 2) * 1.2;
  let tx: number;
  let tz: number;
  const crew = crewOf(sim);
  if (cam.focus) {
    tx = cam.focus.x + 0.5;
    tz = cam.focus.z + 0.5;
  } else if (crew && crew.phase !== 'run') {
    tx = 13.5;
    tz = 9;
  } else if (crew) {
    const ws = Object.values(crew.workers).filter((w) => w.ops.length);
    const busy = ws.filter((w) => !w.done);
    const pick = busy.length ? busy : ws;
    tx = pick.reduce((n, w) => n + w.x, 0) / Math.max(1, pick.length);
    tz = pick.reduce((n, w) => n + w.z, 0) / Math.max(1, pick.length);
  } else {
    tx = sim.x - Math.sin(sim.yaw) * lead;
    tz = sim.z - Math.cos(sim.yaw) * lead;
  }
  const visW = v.w / T;
  const visH = (v.h - v.top - v.bottom) / T;
  const fit = (t: number, vis: number, size: number) =>
    size + 1 <= vis ? size / 2 : Math.max(vis / 2 - 0.5, Math.min(size - vis / 2 + 0.5, t));
  tx = fit(tx, visW, sim.w);
  tz = fit(tz, visH, sim.h);
  if (!cam.ready) {
    cam.x = tx;
    cam.z = tz;
    cam.ready = true;
    return;
  }
  const k = Math.min(1, dt * (cam.focus ? 3 : 5));
  cam.x += (tx - cam.x) * k;
  cam.z += (tz - cam.z) * k;
}

interface Ctx {
  ctx: CanvasRenderingContext2D;
  T: number;
  ox: number;
  oy: number;
  v: View;
  labels: Label[];
}

interface Label {
  x: number;
  y: number;
  text: string;
  bg: string;
  fg: string;
  pri: number;
  icon?: string;
}

const sx = (c: Ctx, x: number) => c.ox + x * c.T;
const sy = (c: Ctx, z: number) => c.oy + z * c.T;

function label(c: Ctx, x: number, z: number, text: string, bg: string, fg = '#ffffff', pri = 1, icon?: string) {
  c.labels.push({ x: sx(c, x), y: sy(c, z), text, bg, fg, pri, icon });
}

export function draw(ctx: CanvasRenderingContext2D, sim: Sim, v: View) {
  const T = tileSize(v.w, v.h);
  let shx = 0;
  let shy = 0;
  if (sim.shake > 0 && !v.reducedMotion) {
    shx = (Math.random() - 0.5) * 6;
    shy = (Math.random() - 0.5) * 6;
  }
  const midY = v.top + (v.h - v.top - v.bottom) / 2;
  const c: Ctx = {
    ctx,
    T,
    ox: Math.round(v.w / 2 - v.cam.x * T + shx),
    oy: Math.round(midY - v.cam.z * T + shy),
    v,
    labels: [],
  };
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, v.w, v.h);

  const x0 = Math.max(0, Math.floor(-c.ox / T) - 1);
  const x1 = Math.min(sim.w - 1, Math.ceil((v.w - c.ox) / T) + 1);
  const z0 = Math.max(0, Math.floor(-c.oy / T) - 1);
  const z1 = Math.min(sim.h - 1, Math.ceil((v.h - c.oy) / T) + 1);

  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) tile(c, sim, x, z);
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) edges(c, sim, x, z);
  lakeOverlay(c, sim);
  objects(c, sim);
  effects(c, sim);
  const crew = crewOf(sim);
  if (crew) drawCrew(c, sim, crew);
  else machine(c, sim);
  sceneLabels(c, sim);
  flushLabels(c);
  goalArrow(c, sim);
}

/* ---------- Tiles ---------- */

function tile(c: Ctx, sim: Sim, x: number, z: number) {
  const { ctx, T } = c;
  const i = idx(x, z);
  const px = sx(c, x);
  const py = sy(c, z);
  const k = sim.kind[i];
  const h = hash(x, z);
  const hidden = !sim.revealed[i] && (k === 'ground' || k === 'bank');
  const t = c.v.t;

  if (hidden) {
    ctx.fillStyle = C.unsurveyed;
    ctx.fillRect(px, py, T + 0.5, T + 0.5);
    ctx.strokeStyle = C.hatch;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let q = -T; q < T; q += 7) {
      ctx.moveTo(px + q, py + T);
      ctx.lineTo(px + q + T, py);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, T, T);
    ctx.clip();
    ctx.beginPath();
    for (let q = -T; q < T; q += 7) {
      ctx.moveTo(px + q, py + T);
      ctx.lineTo(px + q + T, py);
    }
    ctx.stroke();
    ctx.restore();
    if (h % 11 === 0) {
      ctx.fillStyle = 'rgba(90,72,40,0.55)';
      ctx.font = `700 ${Math.round(T * 0.38)}px Rajdhani, system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', px + T / 2, py + T / 2);
    }
    return;
  }

  switch (k) {
    case 'rock': {
      ctx.fillStyle = C.rock;
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      ctx.fillStyle = C.rockTop;
      ctx.fillRect(px + 2, py + 2, T - 4, T * 0.55);
      if (h % 3 === 0) {
        ctx.fillStyle = C.rockHi;
        ctx.beginPath();
        ctx.ellipse(px + T * (0.3 + (h % 5) * 0.1), py + T * 0.35, T * 0.16, T * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case 'road':
      ctx.fillStyle = C.road;
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      if (x === 3) {
        ctx.fillStyle = C.roadLine;
        ctx.fillRect(px + T / 2 - 1.5, py + T * 0.2, 3, T * 0.45);
      }
      return;
    case 'belt': {
      ctx.fillStyle = C.beltA;
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, T, T);
      ctx.clip();
      ctx.fillStyle = sim.beltTripped ? '#a16207' : C.beltB;
      for (let q = -T; q < T * 2; q += T / 2.5) {
        ctx.beginPath();
        ctx.moveTo(px + q, py);
        ctx.lineTo(px + q + T / 5, py);
        ctx.lineTo(px + q + T / 5 - T, py + T);
        ctx.lineTo(px + q - T, py + T);
        ctx.fill();
      }
      ctx.restore();
      // lightning bolt
      ctx.fillStyle = '#ffffff';
      bolt(ctx, px + T / 2, py + T / 2, T * 0.32);
      return;
    }
    case 'water': {
      ctx.fillStyle = C.water;
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      ctx.strokeStyle = C.water2;
      ctx.lineWidth = 2;
      const ph = c.v.reducedMotion ? 0 : Math.sin(t * 1.6 + (h % 7)) * T * 0.08;
      ctx.beginPath();
      ctx.moveTo(px + T * 0.18 + ph, py + T * 0.35);
      ctx.quadraticCurveTo(px + T * 0.32 + ph, py + T * 0.25, px + T * 0.46 + ph, py + T * 0.35);
      ctx.moveTo(px + T * 0.52 - ph, py + T * 0.7);
      ctx.quadraticCurveTo(px + T * 0.66 - ph, py + T * 0.6, px + T * 0.8 - ph, py + T * 0.7);
      ctx.stroke();
      return;
    }
    case 'bank': {
      ctx.fillStyle = C.bank;
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      ctx.fillStyle = C.bankDot;
      for (let n = 0; n < 3; n++) {
        const hx = ((h >> (n * 5)) % 10) / 10;
        const hz = ((h >> (n * 5 + 3)) % 10) / 10;
        ctx.beginPath();
        ctx.ellipse(px + T * (0.15 + hx * 0.7), py + T * (0.15 + hz * 0.7), T * 0.1, T * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case 'pad':
    case 'bay':
    case 'dump':
      ctx.fillStyle = k === 'dump' ? '#64748b' : C.pad;
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      ctx.strokeStyle = 'rgba(15,23,42,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      if (k === 'bay') {
        const tool = TEMPLATE.bayTool[i]!;
        const col = TOOL_COLOR[tool as keyof typeof TOOL_COLOR];
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.strokeRect(px + 3, py + 3, T - 6, T - 6);
        ctx.save();
        ctx.translate(px + T / 2, py + T / 2);
        toolIcon(ctx, tool as 'blade' | 'bucket' | 'ripper', T * 0.62, col);
        ctx.restore();
      }
      if (k === 'dump') {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `700 ${Math.round(T * 0.28)}px Rajdhani, system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DUMP', px + T / 2, py + T / 2);
      }
      return;
    case 'drain':
      ctx.fillStyle = C.ground;
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      ctx.fillStyle = '#334155';
      ctx.fillRect(px + T * 0.2, py + T * 0.2, T * 0.6, T * 0.6);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      for (let q = 0.3; q < 0.8; q += 0.15) {
        ctx.beginPath();
        ctx.moveTo(px + T * q, py + T * 0.22);
        ctx.lineTo(px + T * q, py + T * 0.78);
        ctx.stroke();
      }
      return;
    case 'fence':
    case 'ground': {
      const d = sim.depth[i];
      ctx.fillStyle = d >= 2 ? C.deep : d === 1 ? C.shelf : h % 2 ? C.ground : C.ground2;
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      if (d === 0 && h % 4 === 0) {
        ctx.fillStyle = C.speck;
        ctx.fillRect(px + (h % 9) * T * 0.09 + 3, py + ((h >> 5) % 9) * T * 0.09 + 3, 3, 2);
      }
      if (d >= 1) {
        // terrace edge: a darker lip toward shallower neighbours
        ctx.fillStyle = d >= 2 ? C.deepRim : '#8a5a2e';
        const nb = (dx: number, dz: number) => {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= sim.w || nz >= sim.h) return true;
          return sim.depth[idx(nx, nz)] < d;
        };
        const e = Math.max(2, T * 0.08);
        if (nb(0, -1)) ctx.fillRect(px, py, T, e);
        if (nb(-1, 0)) ctx.fillRect(px, py, e, T);
        if (nb(1, 0)) ctx.fillRect(px + T - e / 2, py, e / 2, T);
      }
      if (sim.ripped[i] && d === 0) {
        ctx.strokeStyle = '#7c5a2c';
        ctx.lineWidth = 2;
        for (let q = 0.25; q < 0.9; q += 0.25) {
          ctx.beginPath();
          ctx.moveTo(px + T * q, py + T * 0.15);
          ctx.lineTo(px + T * (q - 0.08), py + T * 0.85);
          ctx.stroke();
        }
      }
      if (sim.cave === i) {
        ctx.fillStyle = '#5b3a1a';
        for (let n = 0; n < 6; n++) {
          ctx.beginPath();
          ctx.arc(px + T * (0.2 + ((h >> n) % 6) * 0.12), py + T * (0.25 + ((h >> (n + 4)) % 5) * 0.12), T * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
  }
}

function bolt(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x + s * 0.15, y - s);
  ctx.lineTo(x - s * 0.45, y + s * 0.1);
  ctx.lineTo(x - s * 0.02, y + s * 0.1);
  ctx.lineTo(x - s * 0.2, y + s);
  ctx.lineTo(x + s * 0.45, y - s * 0.15);
  ctx.lineTo(x + s * 0.02, y - s * 0.15);
  ctx.closePath();
  ctx.fill();
}

export function toolIcon(ctx: CanvasRenderingContext2D, tool: 'blade' | 'bucket' | 'ripper', s: number, col: string) {
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, s * 0.1);
  if (tool === 'blade') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.48, -s * 0.12);
    ctx.quadraticCurveTo(0, -s * 0.32, s * 0.48, -s * 0.12);
    ctx.lineTo(s * 0.48, s * 0.12);
    ctx.quadraticCurveTo(0, -s * 0.06, -s * 0.48, s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-s * 0.06, s * 0.05, s * 0.12, s * 0.38);
  } else if (tool === 'bucket') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, -s * 0.3);
    ctx.lineTo(s * 0.4, -s * 0.3);
    ctx.lineTo(s * 0.3, s * 0.25);
    ctx.lineTo(-s * 0.3, s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    for (let q = -0.3; q <= 0.31; q += 0.15) ctx.fillRect(s * q - s * 0.03, -s * 0.42, s * 0.06, s * 0.12);
  } else {
    for (const q of [-0.25, 0, 0.25]) {
      ctx.beginPath();
      ctx.moveTo(s * q - s * 0.07, -s * 0.38);
      ctx.lineTo(s * q + s * 0.07, -s * 0.38);
      ctx.lineTo(s * q + s * 0.02, s * 0.38);
      ctx.lineTo(s * q - s * 0.02, s * 0.38);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(-s * 0.36, -s * 0.42, s * 0.72, s * 0.1);
  }
}

/** Shorelines on existing water, the soft-bank edge, and the caution band along the fence. */
function edges(c: Ctx, sim: Sim, x: number, z: number) {
  const { ctx, T } = c;
  const i = idx(x, z);
  const k = sim.kind[i];
  const px = sx(c, x);
  const py = sy(c, z);
  const nk = (dx: number, dz: number) => {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= sim.w || nz >= sim.h) return 'rock';
    return sim.kind[idx(nx, nz)];
  };
  const shown = (dx: number, dz: number) => {
    const nx = x + dx;
    const nz = z + dz;
    return nx >= 0 && nz >= 0 && nx < sim.w && nz < sim.h && sim.revealed[idx(nx, nz)];
  };
  if (k === 'water') {
    ctx.strokeStyle = C.shore;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([T * 0.22, T * 0.12]);
    ctx.beginPath();
    for (const [dx, dz, ax, ay, bx, by] of [
      [0, -1, 0, 0, 1, 0],
      [0, 1, 0, 1, 1, 1],
      [-1, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 1, 1],
    ] as const) {
      const n = nk(dx, dz);
      if (n !== 'water' && n !== 'rock') {
        ctx.moveTo(px + ax * T, py + ay * T);
        ctx.lineTo(px + bx * T, py + by * T);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (k === 'bank' && sim.revealed[i]) {
    ctx.strokeStyle = C.bankEdge;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const [dx, dz, ax, ay, bx, by] of [
      [0, -1, 0, 0, 1, 0],
      [0, 1, 0, 1, 1, 1],
      [-1, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 1, 1],
    ] as const) {
      const n = nk(dx, dz);
      if (n !== 'bank' && n !== 'water' && n !== 'rock' && shown(dx, dz)) {
        ctx.moveTo(px + ax * T, py + ay * T);
        ctx.lineTo(px + bx * T, py + by * T);
      }
    }
    ctx.stroke();
  }
  // Caution band: one cell in front of the fence. A warning zone before the hazard.
  if ((k === 'ground' || k === 'drain') && nk(0, -1) === 'fence') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, T, T);
    ctx.clip();
    ctx.fillStyle = C.caution;
    for (let q = -T; q < T * 2; q += T / 2) {
      ctx.beginPath();
      ctx.moveTo(px + q, py);
      ctx.lineTo(px + q + T / 4, py);
      ctx.lineTo(px + q + T / 4 - T, py + T);
      ctx.lineTo(px + q - T, py + T);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------- The new lake: grid, coordinates, plan, work order ---------- */

function lakeOverlay(c: Ctx, sim: Sim) {
  const { ctx, T } = c;
  const t = c.v.t;
  const pulse = c.v.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(t * 5);
  const L = LAKE;
  const lx = sx(c, L.x0);
  const ly = sy(c, L.z0);
  const me = here(sim);
  const mp = me >= 0 ? ptOf(me) : { x: -1, z: -1 };
  const inside = inLake(mp.x, mp.z);
  const crew = crewOf(sim);

  // row + column highlight while you're in (or right next to) the lake
  if (!crew && mp.x >= L.x0 - 1 && mp.x <= L.x0 + L.cols && mp.z >= L.z0 - 1 && mp.z <= L.z0 + L.rows) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    if (mp.z >= L.z0 && mp.z < L.z0 + L.rows) ctx.fillRect(lx, sy(c, mp.z), L.cols * T, T);
    if (mp.x >= L.x0 && mp.x < L.x0 + L.cols) ctx.fillRect(sx(c, mp.x), ly, T, L.rows * T);
  }

  // grid lines
  ctx.strokeStyle = 'rgba(15,23,42,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let q = 0; q <= L.cols; q++) {
    ctx.moveTo(lx + q * T, ly);
    ctx.lineTo(lx + q * T, ly + L.rows * T);
  }
  for (let q = 0; q <= L.rows; q++) {
    ctx.moveTo(lx, ly + q * T);
    ctx.lineTo(lx + L.cols * T, ly + q * T);
  }
  ctx.stroke();

  // plan marks
  const plan = sim.plan;
  for (const i of LAKE_CELLS) {
    const { x, z } = ptOf(i);
    const px = sx(c, x);
    const py = sy(c, z);
    const d = sim.depth[i];
    let want = 0;
    if (sim.job === 'rigger') want = RIGGER_CELLS.includes(i) ? 1 : 0;
    else if (plan && (sim.job === 'grade' || sim.job === 'warden' || sim.job === 'dispatch'))
      want = plan.cells[i] === 'deep' ? 2 : plan.cells[i] === 'shelf' ? 1 : 0;
    if (!want) continue;
    if (d === want) {
      if (sim.job === 'rigger' || sim.job === 'grade') {
        ctx.fillStyle = C.good;
        check(ctx, px + T * 0.78, py + T * 0.22, T * 0.13);
      }
      continue;
    }
    const col = want === 2 ? C.planDeep : C.plan;
    ctx.strokeStyle = sim.job === 'rigger' ? C.work : col;
    ctx.globalAlpha = sim.job === 'rigger' ? pulse : 1;
    ctx.lineWidth = sim.job === 'rigger' ? 3.5 : 2.5;
    ctx.setLineDash([T * 0.16, T * 0.1]);
    ctx.strokeRect(px + 3, py + 3, T - 6, T - 6);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = sim.job === 'rigger' ? '#854d0e' : col;
    ctx.font = `700 ${Math.round(T * 0.26)}px Rajdhani, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d > want ? 'TOO DEEP' : want === 2 ? 'DEEP' : 'SHELF', px + T / 2, py + T / 2);
  }

  // current cell
  if (inside && !crew) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx(c, mp.x) + 1.5, sy(c, mp.z) + 1.5, T - 3, T - 3);
  }

  // stakes at the corners
  for (const [x, z] of [
    [L.x0, L.z0],
    [L.x0 + L.cols, L.z0],
    [L.x0, L.z0 + L.rows],
    [L.x0 + L.cols, L.z0 + L.rows],
  ]) {
    ctx.fillStyle = C.stake;
    ctx.fillRect(sx(c, x) - 3, sy(c, z) - 3, 6, 6);
  }

  // coordinates
  ctx.font = `700 ${Math.round(Math.max(12, T * 0.3))}px Rajdhani, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let q = 0; q < L.cols; q++) {
    const hot = inside && mp.x === L.x0 + q;
    pillText(ctx, COLS[q], lx + q * T + T / 2, ly - T * 0.28, hot ? '#ffffff' : 'rgba(15,23,42,0.75)', hot ? C.ink : '#ffffff');
  }
  for (let q = 0; q < L.rows; q++) {
    const hot = inside && mp.z === L.z0 + q;
    pillText(ctx, String(q + 1), lx - T * 0.28, ly + q * T + T / 2, hot ? '#ffffff' : 'rgba(15,23,42,0.75)', hot ? C.ink : '#ffffff');
  }

  // channel + east bay work cells
  const work =
    sim.job === 'warden' ? CHANNEL_CELLS : sim.job === 'dispatch' ? EAST_BAY : [];
  for (const i of work) {
    if (sim.depth[i] >= 1) continue;
    const { x, z } = ptOf(i);
    ctx.strokeStyle = C.work;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([T * 0.16, T * 0.1]);
    ctx.strokeRect(sx(c, x) + 3, sy(c, z) + 3, T - 6, T - 6);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // the lake fills when it's real
  const fill = crew ? crew.fill : sim.filled ? 1 : 0;
  const flood = sim.breach >= 0 ? 0.75 : 0;
  const a = Math.max(fill, flood);
  if (a > 0) {
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = sim.breach >= 0 ? C.water : C.newWater;
    for (const i of [...LAKE_CELLS, ...EAST_BAY, ...CHANNEL_CELLS]) {
      if (sim.depth[i] < 1 && sim.breach < 0) continue;
      const { x, z } = ptOf(i);
      ctx.fillRect(sx(c, x), sy(c, z), T + 0.5, T + 0.5);
    }
    ctx.globalAlpha = 1;
  }
}

function pillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string) {
  const w = Math.max(16, ctx.measureText(text).width + 8);
  const h = 16;
  ctx.fillStyle = bg;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(text, x, y + 1);
}

function check(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.arc(x, y, s * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y);
  ctx.lineTo(x - s * 0.1, y + s * 0.5);
  ctx.lineTo(x + s * 0.7, y - s * 0.5);
  ctx.stroke();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- Things on the ground ---------- */

function objects(c: Ctx, sim: Sim) {
  const { ctx, T } = c;
  const t = c.v.t;
  // fence posts and wire, with the hook drawn on them
  for (let i = 0; i < sim.kind.length; i++) {
    if (sim.kind[i] !== 'fence') continue;
    const { x, z } = ptOf(i);
    const px = sx(c, x);
    const py = sy(c, z);
    if (px < -T || px > c.v.w + T || py < -T || py > c.v.h + T) continue;
    const broken = sim.breach === i;
    const flashing = sim.flash && sim.flash.i === i;
    if (sim.hook) {
      ctx.fillStyle = `rgba(34,211,238,${flashing ? 0.55 : 0.2})`;
      ctx.fillRect(px, py + T * 0.15, T, T * 0.7);
    }
    ctx.strokeStyle = flashing && sim.flash!.tone === 'warn' ? '#facc15' : C.wire;
    ctx.lineWidth = 3;
    if (!broken) {
      ctx.beginPath();
      ctx.moveTo(px, py + T * 0.38);
      ctx.lineTo(px + T, py + T * 0.38);
      ctx.moveTo(px, py + T * 0.62);
      ctx.lineTo(px + T, py + T * 0.62);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(px, py + T * 0.38);
      ctx.lineTo(px + T * 0.3, py + T * 0.7);
      ctx.moveTo(px + T, py + T * 0.38);
      ctx.lineTo(px + T * 0.7, py + T * 0.8);
      ctx.stroke();
    }
    ctx.fillStyle = C.fence;
    ctx.fillRect(px + T * 0.1, py + T * 0.15, T * 0.1, T * 0.7);
    if (!broken) ctx.fillRect(px + T * 0.8, py + T * 0.15, T * 0.1, T * 0.7);
    if (sim.hook && x % 3 === 0) {
      shield(ctx, px + T / 2, py + T / 2, T * 0.3, flashing ? '#ffffff' : C.hook);
    }
  }

  // spoil heap grows with every cut
  if (sim.spoil > 0) {
    const h = PLACES.heap;
    const r = Math.min(0.62, 0.22 + sim.spoil * 0.012) * T;
    ctx.fillStyle = C.heap;
    ctx.beginPath();
    ctx.ellipse(sx(c, h.x + 0.5), sy(c, h.z + 0.55), r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.heapTop;
    ctx.beginPath();
    ctx.ellipse(sx(c, h.x + 0.45), sy(c, h.z + 0.45), r * 0.6, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // the lake stake
  const st = PLACES.stake;
  ctx.fillStyle = C.stake;
  ctx.fillRect(sx(c, st.x + 0.47), sy(c, st.z + 0.2), 4, T * 0.6);
  ctx.fillRect(sx(c, st.x + 0.47), sy(c, st.z + 0.2), T * 0.26, T * 0.12);

  // the goal flag for this job
  const g = goalOf(sim);
  if (g && sim.status !== 'win') {
    const gx = sx(c, g.x + 0.5);
    const gy = sy(c, g.z + 0.5);
    const r = (0.42 + (c.v.reducedMotion ? 0 : 0.08 * Math.sin(t * 4))) * T;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(gx - 1.5, gy - T * 0.75, 3, T * 0.75);
    ctx.fillStyle = C.pennant;
    ctx.beginPath();
    ctx.moveTo(gx + 1.5, gy - T * 0.75);
    ctx.lineTo(gx + T * 0.45, gy - T * 0.6);
    ctx.lineTo(gx + 1.5, gy - T * 0.45);
    ctx.closePath();
    ctx.fill();
  }
}

function shield(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.85, y - s * 0.6);
  ctx.lineTo(x + s * 0.7, y + s * 0.4);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s * 0.7, y + s * 0.4);
  ctx.lineTo(x - s * 0.85, y - s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.font = `700 ${Math.round(s * 0.9)}px Rajdhani, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('W1', x, y + 1);
}

function effects(c: Ctx, sim: Sim) {
  const { ctx, T } = c;
  for (const p of sim.pulses) {
    const r = (p.t / 1.2) * 3.6 * T;
    ctx.strokeStyle = `rgba(34,211,238,${1 - p.t / 1.2})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sx(c, p.x), sy(c, p.z), r, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (sim.failAt >= 0) {
    const { x, z } = ptOf(sim.failAt);
    const on = c.v.reducedMotion || Math.floor(c.v.t * 4) % 2 === 0;
    ctx.strokeStyle = on ? C.bad : '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(sx(c, x) + 2, sy(c, z) + 2, T - 4, T - 4);
    ctx.beginPath();
    ctx.moveTo(sx(c, x) + T * 0.25, sy(c, z) + T * 0.25);
    ctx.lineTo(sx(c, x) + T * 0.75, sy(c, z) + T * 0.75);
    ctx.moveTo(sx(c, x) + T * 0.75, sy(c, z) + T * 0.25);
    ctx.lineTo(sx(c, x) + T * 0.25, sy(c, z) + T * 0.75);
    ctx.stroke();
  }
}

/* ---------- Machines ---------- */

interface MachineOpts {
  kind: 'dozer' | AgentId;
  tool: 'none' | 'blade' | 'bucket' | 'ripper' | 'scanner' | 'bed';
  lowered: boolean;
  deep: boolean;
  yoke: 'off' | 'bound' | 'dropped' | 'cut' | 'none';
  tilt: number;
  cargo: number;
  accent?: string;
  mounting?: number;
}

function drawMachine(c: Ctx, cx: number, cy: number, yaw: number, o: MachineOpts) {
  const { ctx } = c;
  const T = c.T;
  const s = T * (o.kind === 'scout' ? 0.78 : o.kind === 'truck' ? 1.05 : 1.0);
  ctx.save();
  ctx.translate(cx, cy);
  // shadow
  ctx.fillStyle = 'rgba(15,23,42,0.35)';
  ctx.beginPath();
  ctx.ellipse(T * 0.06, T * 0.08, s * 0.5, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const wob = o.tilt > 0 ? Math.sin(c.v.t * 18) * o.tilt * 0.12 : 0;
  ctx.rotate(-yaw + wob);
  if (o.tilt > 0) ctx.scale(1 - o.tilt * 0.12, 1);

  const body = o.kind === 'dozer' ? C.body : AGENTS[o.kind as AgentId].color;
  const half = s / 2;

  // tracks or wheels
  ctx.fillStyle = C.track;
  roundRect(ctx, -half, -half * 0.8, half * 0.32, half * 1.7, 3);
  ctx.fill();
  roundRect(ctx, half * 0.68, -half * 0.8, half * 0.32, half * 1.7, 3);
  ctx.fill();
  ctx.fillStyle = '#374151';
  for (let q = -0.7; q < 0.85; q += 0.28) {
    ctx.fillRect(-half, half * q, half * 0.32, 2);
    ctx.fillRect(half * 0.68, half * q, half * 0.32, 2);
  }

  // body
  ctx.fillStyle = body;
  roundRect(ctx, -half * 0.66, -half * 0.72, half * 1.32, half * 1.5, 4);
  ctx.fill();
  ctx.strokeStyle = o.kind === 'dozer' ? C.bodyEdge : 'rgba(15,23,42,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (o.kind === 'truck') {
    ctx.fillStyle = '#4b5563';
    roundRect(ctx, -half * 0.6, -half * 0.05, half * 1.2, half * 0.8, 3);
    ctx.fill();
    if (o.cargo) {
      ctx.fillStyle = C.heap;
      ctx.beginPath();
      ctx.ellipse(0, half * 0.35, half * 0.5, half * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // cab
  ctx.fillStyle = C.cab;
  roundRect(ctx, -half * 0.42, (o.kind === 'truck' ? -half * 0.65 : -half * 0.05), half * 0.84, half * 0.62, 3);
  ctx.fill();
  ctx.fillStyle = C.glass;
  ctx.fillRect(-half * 0.32, (o.kind === 'truck' ? -half * 0.6 : 0), half * 0.64, half * 0.18);

  // front chevron: which way is forward, always
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -half * 0.68);
  ctx.lineTo(half * 0.26, -half * 0.32);
  ctx.lineTo(0, -half * 0.42);
  ctx.lineTo(-half * 0.26, -half * 0.32);
  ctx.closePath();
  ctx.fill();

  if (o.kind === 'scout') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, half * 0.35, half * 0.28, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }

  // the iron on the front
  const bladeY = -half * 0.95;
  if (o.tool === 'blade' || o.tool === 'bucket' || o.tool === 'ripper') {
    const col = TOOL_COLOR[o.tool];
    const reach = o.mounting !== undefined ? 1 - o.mounting : 1;
    ctx.globalAlpha = o.mounting !== undefined ? 0.4 + 0.6 * reach : 1;
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(-half * 0.45, -half * 0.78, half * 0.12, half * 0.2);
    ctx.fillRect(half * 0.33, -half * 0.78, half * 0.12, half * 0.2);
    if (o.lowered) {
      // dirt rolling in front of a lowered tool
      ctx.fillStyle = C.dirt;
      ctx.beginPath();
      ctx.ellipse(0, bladeY - half * 0.28, half * 0.8, half * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(0, bladeY - (o.lowered ? 0 : half * 0.06) - (1 - reach) * half * 0.5);
    const w = half * (o.tool === 'blade' ? 2.1 : 1.5);
    ctx.fillStyle = o.lowered ? (o.deep ? '#1e3a8a' : col) : C.steel;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    if (o.tool === 'blade') {
      roundRect(ctx, -w / 2, -half * 0.14, w, half * (o.lowered ? 0.3 : 0.2), 3);
      ctx.fill();
      ctx.stroke();
    } else if (o.tool === 'bucket') {
      roundRect(ctx, -w / 2, -half * 0.22, w, half * 0.42, 3);
      ctx.fill();
      ctx.stroke();
    } else {
      for (const q of [-0.5, 0, 0.5]) {
        ctx.fillRect(q * w * 0.6 - 3, -half * 0.3, 6, half * 0.42);
      }
      ctx.fillRect(-w / 2, -half * 0.02, w, 5);
    }
    // raised/lowered arrow on the tool itself
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (o.lowered) {
      ctx.moveTo(-5, -half * 0.06);
      ctx.lineTo(5, -half * 0.06);
      ctx.lineTo(0, half * 0.1);
    } else {
      ctx.moveTo(-5, half * 0.06);
      ctx.lineTo(5, half * 0.06);
      ctx.lineTo(0, -half * 0.1);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  } else if (o.kind === 'dozer') {
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(-half * 0.4, -half * 0.86, half * 0.8, half * 0.12);
  }

  // the yoke: a visible link from the cab to each track
  if (o.yoke !== 'none') {
    const cyb = half * 0.25;
    const links: [number, number][] = [
      [-half * 0.84, cyb],
      [half * 0.84, cyb],
    ];
    for (const [lx, ly] of links) {
      if (o.yoke === 'bound') {
        ctx.strokeStyle = C.link;
        ctx.lineWidth = 3.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, cyb);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.fillStyle = C.link;
        ctx.beginPath();
        ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.yoke === 'cut') {
        ctx.strokeStyle = C.bad;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, cyb);
        ctx.lineTo(lx * 0.42, ly);
        ctx.moveTo(lx * 0.68, ly);
        ctx.lineTo(lx, ly);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(0, cyb);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (o.yoke === 'dropped' && Math.floor(c.v.t * 6) % 2 === 0) {
      ctx.fillStyle = '#fde047';
      bolt(ctx, half * 0.5, cyb - 4, half * 0.28);
    }
    ctx.fillStyle = o.yoke === 'bound' ? C.link : o.yoke === 'cut' ? C.bad : '#9ca3af';
    ctx.beginPath();
    ctx.arc(0, cyb, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function machine(c: Ctx, sim: Sim) {
  const cx = sx(c, sim.x);
  const cy = sy(c, sim.z);
  drawMachine(c, cx, cy, sim.yaw, {
    kind: 'dozer',
    tool: sim.mounting ? sim.mounting.tool : sim.tool,
    lowered: sim.tool !== 'none' && sim.mode !== 'up',
    deep: sim.mode === 'deep',
    yoke: sim.yoke,
    tilt: sim.tilt,
    cargo: 0,
    mounting: sim.mounting ? sim.mounting.t / 0.9 : undefined,
  });
  // status badge over the machine: never only in the log
  let text = '';
  let bg = C.bad;
  if (sim.yoke === 'off') text = 'YOKE NOT BOUND · F';
  else if (sim.yoke === 'dropped') text = 'LINK DROPPED · F';
  else if (sim.yoke === 'cut') text = 'YOU CUT THE YOKE · F';
  else if (sim.mounting) {
    text = `MOUNTING ${sim.mounting.tool.toUpperCase()}…`;
    bg = TOOL_COLOR[sim.mounting.tool];
  } else if (sim.scanning > 0) {
    text = 'SCANNING';
    bg = '#0891b2';
  } else if (sim.onBank) text = `SINKING ${Math.round(sim.tilt * 100)}% · BACK OUT`;
  else if (sim.fenceStrain > 0.05 && !sim.hook) text = `FENCE BENDING ${Math.round(sim.fenceStrain * 100)}%`;
  else if (sim.flash && sim.flash.tone === 'rule') {
    text = 'HOOK W1 BLOCKED';
    bg = '#0891b2';
  } else if (sim.auto) {
    text = `${sim.auto.who} DRIVING`;
    bg = '#7c3aed';
  } else if (sim.tool !== 'none') {
    text = `${sim.tool.toUpperCase()} ${sim.mode === 'up' ? '▲ RAISED' : sim.mode === 'shelf' ? '▼ SHELF' : '▼ DEEP'}`;
    bg = sim.mode === 'up' ? '#334155' : TOOL_COLOR[sim.tool];
  }
  if (text) c.labels.push({ x: cx, y: cy - c.T * 0.95, text, bg, fg: '#ffffff', pri: 10 });
}

function drawCrew(c: Ctx, _sim: Sim, crew: Crew) {
  const tools: Record<AgentId, MachineOpts['tool']> = { scout: 'scanner', dozer: 'blade', loader: 'bucket', truck: 'bed' };
  for (const id of ['truck', 'loader', 'dozer', 'scout'] as AgentId[]) {
    const w = crew.workers[id];
    const cx = sx(c, w.x);
    const cy = sy(c, w.z);
    const working = w.ops.length && !w.done && (w.ops[w.i]?.k === 'cut' || w.ops[w.i]?.k === 'work');
    drawMachine(c, cx, cy, w.yaw, {
      kind: id,
      tool: tools[id],
      lowered: !!working && (id === 'dozer' || id === 'loader'),
      deep: false,
      yoke: 'bound',
      tilt: w.sunk,
      cargo: w.cargo,
    });
    c.labels.push({ x: cx, y: cy - c.T * 0.85, text: `${AGENTS[id].name} · ${stageShort(w)}`, bg: AGENTS[id].color, fg: C.ink, pri: 9 });
  }
  for (const f of crew.flyers) {
    const to = crew.workers[f.to];
    const k = Math.min(1, f.t / 1.1);
    const x = f.from.x + (to.x - f.from.x) * k;
    const z = f.from.z + (to.z - f.from.z) * k - Math.sin(k * Math.PI) * 1.5;
    c.labels.push({ x: sx(c, x), y: sy(c, z), text: `✉ ${f.label}`, bg: '#ffffff', fg: C.ink, pri: 11 });
  }
}

function stageShort(w: Worker) {
  if (!w.ops.length) return 'idle';
  if (w.done) return 'DONE';
  return w.stage.toUpperCase();
}

/* ---------- Labels in the scene ---------- */

function sceneLabels(c: Ctx, sim: Sim) {
  const anyRevealed = (from: Pt, to: Pt) => {
    for (let z = from.z; z <= to.z; z++)
      for (let x = from.x; x <= to.x; x++) {
        const i = idx(x, z);
        if (sim.kind[i] === 'bank' && sim.revealed[i]) return true;
      }
    return false;
  };
  label(c, 13, 2.3, 'EXISTING WATER · DO NOT ENTER', '#1565c0', '#fff', 3, '≈');
  label(c, 3.5, 8.5, 'EXISTING WATER · DO NOT ENTER', '#1565c0', '#fff', 3, '≈');
  label(c, 19, 23, 'EXISTING WATER', '#1565c0', '#fff', 3, '≈');
  if (anyRevealed({ x: 1, z: 11 }, { x: 9, z: 15 })) label(c, 6, 14.1, 'SOFT BANK · SINKS A MACHINE', '#9a3412', '#fff', 4, '⚠');
  if (anyRevealed({ x: 6, z: 5 }, { x: 7, z: 12 })) label(c, 7.5, 9, 'SOFT BANK', '#9a3412', '#fff', 2, '⚠');
  if (anyRevealed({ x: 16, z: 21 }, { x: 20, z: 24 })) label(c, 18.5, 20.9, 'SOFT BANK', '#9a3412', '#fff', 4, '⚠');
  label(c, 3.5, 22.5, sim.beltTripped ? 'DEAD BELT · DROPPED YOUR YOKE' : 'DEAD BELT · DROPS THE YOKE', '#111827', '#facc15', 5, '⚡');
  label(c, 13, 5.5, sim.hook ? 'FENCE · HOOK W1: HARD STOP' : sim.guard === 'request' ? 'FENCE · “PLEASE STAY OFF”' : sim.guard === 'approval' ? 'FENCE · ASK FIRST' : 'FENCE', sim.hook ? '#0e7490' : '#b91c1c', '#fff', 4, sim.hook ? '⛨' : undefined);
  label(c, 13, 6.85, 'CAUTION · 1 CELL TO FENCE', '#a16207', '#fff', 1);
  label(c, LAKE.x0 + 3, LAKE.z0 + LAKE.rows + 0.45, sim.filled ? 'THE NEW LAKE' : 'NEW LAKE · STAKED', '#c2410c', '#fff', 2);
  label(c, PLACES.stake.x + 0.5, PLACES.stake.z + 1.05, 'LAKE STAKE', '#c2410c', '#fff', 3);
  label(c, PLACES.surveyPoint.x + 0.5, PLACES.surveyPoint.z - 0.15, 'SURVEY POINT', '#334155', '#fff', 2);
  label(c, PLACES.gate.x + 0.5, PLACES.gate.z + 0.85, 'GATE', '#334155', '#fff', 1);
  label(c, 17.5, 14.6, 'TOOL RACK', '#334155', '#fff', 2);
  for (const [tool, p] of Object.entries(BAYS)) label(c, p.x + 0.5, p.z + 1.25, tool.toUpperCase(), TOOL_COLOR[tool as keyof typeof TOOL_COLOR], '#fff', 3);
  if (sim.spoil > 0) label(c, PLACES.heap.x + 0.5, PLACES.heap.z + 1.05, `SPOIL HEAP · ${sim.spoil}`, '#78350f', '#fff', 1);
  label(c, PLACES.drain.x + 0.5, PLACES.drain.z + 1.05, 'DRAIN', '#334155', '#fff', 1);
  if (sim.job === 'warden') label(c, 17.5, 7.95, 'OVERFLOW CHANNEL', '#a16207', '#fff', 3);
  if (sim.job === 'dispatch') label(c, 17, 11.1, 'EAST BAY', '#a16207', '#fff', 3);
  // unsurveyed ground gets a label too, near the middle of the screen
  let ux = -1;
  let uz = -1;
  const cxT = Math.floor((c.v.w / 2 - c.ox) / c.T);
  const czT = Math.floor((c.v.h / 2 - c.oy) / c.T);
  for (let r = 0; r < 6 && ux < 0; r++)
    for (let dz = -r; dz <= r && ux < 0; dz++)
      for (let dx = -r; dx <= r && ux < 0; dx++) {
        const x = cxT + dx;
        const z = czT + dz;
        if (x < 1 || z < 1 || x >= sim.w - 1 || z >= sim.h - 1) continue;
        const i = idx(x, z);
        if (!sim.revealed[i] && (sim.kind[i] === 'ground' || sim.kind[i] === 'bank')) {
          ux = x;
          uz = z;
        }
      }
  if (ux >= 0) label(c, ux + 0.5, uz + 0.5, 'UNSURVEYED · SCAN TO SEE', '#57534e', '#fff', 0);
}

function flushLabels(c: Ctx) {
  const { ctx } = c;
  const fs = Math.round(Math.max(12, Math.min(15, c.T * 0.32)));
  ctx.font = `700 ${fs}px Rajdhani, system-ui`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const sorted = [...c.labels].sort((a, b) => b.pri - a.pri);
  for (const l of sorted) {
    const text = l.icon ? `${l.icon} ${l.text}` : l.text;
    const w = ctx.measureText(text).width + 12;
    const h = fs + 8;
    if (l.x < -w / 2 || l.x > c.v.w + w / 2) continue;
    const x = Math.max(4 + w / 2, Math.min(c.v.w - 4 - w / 2, l.x));
    const y = l.y;
    if (y < c.v.top - h || y > c.v.h - c.v.bottom + h) continue;
    if (x + w / 2 < 0 || x - w / 2 > c.v.w) continue;
    const box = { x: x - w / 2, y: y - h / 2, w, h };
    if (l.pri < 9 && placed.some((p) => box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y)) continue;
    placed.push(box);
    ctx.fillStyle = 'rgba(15,23,42,0.35)';
    roundRect(ctx, box.x + 1, box.y + 2, w, h, 5);
    ctx.fill();
    ctx.fillStyle = l.bg;
    roundRect(ctx, box.x, box.y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = l.fg;
    ctx.fillText(text, x, y + 1);
  }
}

function goalArrow(c: Ctx, sim: Sim) {
  const g = goalOf(sim);
  if (!g || sim.status === 'win' || crewOf(sim)) return;
  const gx = sx(c, g.x + 0.5);
  const gy = sy(c, g.z + 0.5);
  const top = c.v.top + 10;
  const bot = c.v.h - c.v.bottom - 10;
  if (gx > 20 && gx < c.v.w - 20 && gy > top && gy < bot) return;
  const cx = c.v.w / 2;
  const cy = (top + bot) / 2;
  const ang = Math.atan2(gy - cy, gx - cx);
  const hw = c.v.w / 2 - 28;
  const hh = (bot - top) / 2 - 18;
  const k = Math.min(hw / Math.abs(Math.cos(ang) || 1e-6), hh / Math.abs(Math.sin(ang) || 1e-6));
  const ax = cx + Math.cos(ang) * k;
  const ay = cy + Math.sin(ang) * k;
  const { ctx } = c;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.fillStyle = C.pennant;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -12);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const dist = Math.round(Math.hypot(g.x + 0.5 - sim.x, g.z + 0.5 - sim.z));
  c.labels.length = 0;
  c.labels.push({ x: ax - Math.cos(ang) * 34, y: ay - Math.sin(ang) * 24, text: `GOAL ${dist}`, bg: C.pennant, fg: '#fff', pri: 12 });
  flushLabels(c);
}

export { planDone };
