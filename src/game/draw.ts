// The low-res site. Flat colors, olive fog, one yellow machine. No React.
import { PHASES } from './levels';
import type { Sim } from './sim';

export const TILE = 16;
export const LONG_SIDE = 320;

/** Buffer size for a screen of w x h CSS pixels. About 320 on the long side. */
export function bufferSize(w: number, h: number): { bw: number; bh: number } {
  if (w >= h) return { bw: LONG_SIDE, bh: Math.max(120, Math.round((LONG_SIDE * h) / Math.max(1, w))) };
  return { bw: Math.max(120, Math.round((LONG_SIDE * w) / Math.max(1, h))), bh: LONG_SIDE };
}

const C = {
  void: '#1d2417',
  fog: [62, 71, 48] as const,
  rockTop: '#1f241b',
  rockHi: '#2b3226',
  rockSide: '#101410',
  boulder: '#444b3d',
  failA: '#e0694a',
  failB: '#f4f6e8',
  deepPlan: '#4f5a3a',
  ground: '#5b6743',
  ground2: '#56613f',
  road: '#7a7d75',
  roadJoint: '#6a6d66',
  belt: '#25261f',
  beltRib: '#3a3b31',
  beltLive: '#b4482e',
  beltDead: '#4c4a3a',
  water: '#2b433d',
  water2: '#365248',
  bank: '#6a5838',
  bank2: '#584829',
  pad: '#8a8b83',
  padMark: '#e2b33a',
  post: '#c9cabd',
  wire: '#8f9a80',
  hookLight: '#e2b33a',
  flash: '#f4f6e8',
  shelf: '#4a3e28',
  deep: '#2b2418',
  deepRim: '#1c170f',
  stake: '#353d26',
  tick: '#7c8860',
  chevron: '#a4ae8c',
  pole: '#e6ecd4',
  pennant: '#e2b33a',
};

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const D = {
  track: hex('#1b1d16'),
  tread: hex('#34372c'),
  body: hex('#e2b33a'),
  bodyEdge: hex('#b38b26'),
  roof: hex('#f0c654'),
  glass: hex('#28302e'),
  stack: hex('#2a2a24'),
  arm: hex('#55584f'),
  bladeUp: hex('#b3b8aa'),
  bladeShelf: hex('#8c9185'),
  bladeDeep: hex('#676b61'),
  edge: hex('#dfe2d4'),
  scoop: hex('#7b7863'),
  teeth: hex('#c9c6b0'),
  plate: hex('#5b5e54'),
  hood: hex('#c99a2c'),
  grille: hex('#3a3524'),
};

const VESTS = ['#d06a2a', '#cfcf4a', '#5d8fa6', '#d06a2a', '#cfcf4a'];

function hash(x: number, z: number) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Cam {
  x: number;
  z: number;
  ready: boolean;
}

export interface View {
  bw: number;
  bh: number;
  reducedMotion: boolean;
  t: number; // seconds, for small animation
  cam: Cam;
}

export const newCam = (): Cam => ({ x: 0, z: 0, ready: false });

/**
 * Camera: look a little ahead of the machine, but never show more rock than it must.
 * A site narrower than the screen is centered on that axis.
 */
export function updateCam(cam: Cam, sim: Sim, bw: number, bh: number, dt: number) {
  const lead = Math.min(1, Math.abs(sim.speed) / 2) * 1.3;
  let tx = sim.x - Math.sin(sim.yaw) * lead;
  let tz = sim.z - Math.cos(sim.yaw) * lead;
  const halfW = bw / 2 / TILE;
  const halfH = bh / 2 / TILE;
  const fit = (t: number, half: number, size: number) =>
    size + 1 <= half * 2 ? size / 2 : Math.max(half - 0.5, Math.min(size - half + 0.5, t));
  tx = fit(tx, halfW, sim.w);
  tz = fit(tz, halfH, sim.h);
  if (!cam.ready) {
    cam.x = tx;
    cam.z = tz;
    cam.ready = true;
    return;
  }
  const k = Math.min(1, dt * 5);
  cam.x += (tx - cam.x) * k;
  cam.z += (tz - cam.z) * k;
}

export function draw(ctx: CanvasRenderingContext2D, sim: Sim, v: View) {
  const { bw, bh } = v;
  let sx = 0,
    sy = 0;
  if (sim.shake > 0 && !v.reducedMotion) {
    sx = Math.round((Math.random() - 0.5) * 5);
    sy = Math.round((Math.random() - 0.5) * 5);
  }
  const camX = Math.round(bw / 2 - v.cam.x * TILE) + sx;
  const camY = Math.round(bh / 2 - v.cam.z * TILE) + sy;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, bw, bh);

  const x0 = Math.floor(-camX / TILE) - 1;
  const x1 = Math.ceil((bw - camX) / TILE) + 1;
  const z0 = Math.floor(-camY / TILE) - 1;
  const z1 = Math.ceil((bh - camY) / TILE) + 2;
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < sim.w && z < sim.h;

  const T = TILE;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const i = z * sim.w + x;
      const px = camX + x * T;
      const py = camY + z * T;
      let k: Sim['kind'][number] = inside(x, z) ? sim.kind[i] : 'rock';
      const hidden = !sim.surveyed && !sim.revealed && (k === 'water' || k === 'bank');
      if (hidden) k = 'ground';
      const hsh = hash(x, z);

      switch (k) {
        case 'rock':
          ctx.fillStyle = C.rockSide;
          ctx.fillRect(px, py, T, T);
          break;
        case 'road':
        case 'belt':
          ctx.fillStyle = k === 'road' ? C.road : C.belt;
          ctx.fillRect(px, py, T, T);
          if (k === 'road') {
            ctx.fillStyle = C.roadJoint;
            ctx.fillRect(px, py + T - 1, T, 1);
            if (hsh % 3 === 0) ctx.fillRect(px + (hsh % 9) + 1, py + 4, 1, 1);
          } else {
            ctx.fillStyle = C.beltRib;
            for (let r = 1; r < T; r += 3) ctx.fillRect(px, py + r, T, 1);
            const live = !sim.beltTripped && Math.floor(v.t * 3) % 2 === 0;
            ctx.fillStyle = sim.beltTripped ? C.beltDead : live ? C.beltLive : C.beltRib;
            ctx.fillRect(px + 3, py + 7, 2, 2);
            ctx.fillRect(px + 11, py + 7, 2, 2);
          }
          break;
        case 'water': {
          ctx.fillStyle = C.water;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = C.water2;
          const ph = Math.floor(v.t * 1.5 + (hsh % 7)) % 4;
          ctx.fillRect(px + 2 + ph, py + 3 + (hsh % 5), 3, 1);
          ctx.fillRect(px + 6 - ph, py + 8, 2, 1);
          break;
        }
        case 'bank':
          ctx.fillStyle = C.bank;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = C.bank2;
          ctx.fillRect(px + (hsh % 8) + 1, py + ((hsh >> 4) % 8) + 1, 2, 1);
          ctx.fillRect(px + ((hsh >> 8) % 8) + 1, py + ((hsh >> 12) % 8) + 2, 1, 1);
          break;
        case 'pad':
          ctx.fillStyle = C.pad;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = C.padMark;
          ctx.fillRect(px + 1, py + 1, 3, 1);
          ctx.fillRect(px + 1, py + 1, 1, 3);
          ctx.fillRect(px + T - 4, py + T - 2, 3, 1);
          ctx.fillRect(px + T - 2, py + T - 4, 1, 3);
          break;
        default: {
          // ground, flag, fence, crew: ground underneath, with depth
          const d = sim.depth[i];
          const t = sim.target[i];
          ctx.fillStyle =
            d >= 2 ? C.deep : d === 1 ? C.shelf : t === 'deep' ? C.deepPlan : hsh % 2 ? C.ground : C.ground2;
          ctx.fillRect(px, py, T, T);
          if (d >= 2) {
            ctx.fillStyle = C.deepRim;
            ctx.fillRect(px, py, T, 2);
          }
          if (d === 0 && k === 'ground' && hsh % 5 === 0) {
            ctx.fillStyle = C.ground2;
            ctx.fillRect(px + (hsh % 9) + 1, py + ((hsh >> 5) % 9) + 1, 2, 1);
          }
          // Plan marks, drawn only where the site has a plan.
          if (t === 'deep' && d < 2) {
            ctx.fillStyle = C.stake;
            ctx.fillRect(px + 2, py + 2, 2, 2);
            ctx.fillRect(px + T - 4, py + T - 4, 2, 2);
            ctx.fillRect(px + T - 4, py + 2, 2, 2);
            ctx.fillRect(px + 2, py + T - 4, 2, 2);
          } else if (t === 'shelf' && d === 0) {
            // dashed outline: cut me to shelf depth
            ctx.fillStyle = C.tick;
            for (let q = 1; q < T - 1; q += 4) {
              ctx.fillRect(px + q, py + 1, 2, 1);
              ctx.fillRect(px + q, py + T - 2, 2, 1);
              ctx.fillRect(px + 1, py + q, 1, 2);
              ctx.fillRect(px + T - 2, py + q, 1, 2);
            }
          } else if (t === 'ramp') {
            ctx.fillStyle = d > 0 ? C.deepRim : C.chevron;
            for (const oy of [3, 9]) {
              ctx.fillRect(px + 7, py + oy, 2, 1);
              ctx.fillRect(px + 5, py + oy + 1, 2, 1);
              ctx.fillRect(px + 9, py + oy + 1, 2, 1);
              ctx.fillRect(px + 3, py + oy + 2, 2, 1);
              ctx.fillRect(px + 11, py + oy + 2, 2, 1);
            }
          }
        }
      }
    }
  }

  // Raised things, back to front, so they overlap the row above.
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const i = z * sim.w + x;
      const px = camX + x * T;
      const py = camY + z * T;
      const k = inside(x, z) ? sim.kind[i] : 'rock';
      if (k === 'rock') {
        const hsh = hash(x, z);
        const lift = 4 + (hsh % 3);
        ctx.fillStyle = hsh % 7 === 0 ? C.rockHi : C.rockTop;
        ctx.fillRect(px, py - lift, T, T);
        ctx.fillStyle = C.rockHi;
        ctx.fillRect(px + (hsh % 6), py - lift, 6, 1);
        if (hsh % 3 === 0) {
          // a boulder
          const bx = px + 2 + (hsh % 7);
          const by = py - lift + 3 + ((hsh >> 3) % 6);
          ctx.fillStyle = C.boulder;
          ctx.fillRect(bx, by, 5, 3);
          ctx.fillRect(bx + 1, by - 1, 3, 1);
          ctx.fillStyle = C.rockSide;
          ctx.fillRect(bx, by + 3, 5, 1);
        }
      } else if (k === 'fence') {
        const flashing = sim.flash && sim.flash.i === i;
        ctx.fillStyle = flashing ? C.flash : C.wire;
        ctx.fillRect(px, py + 4, T, 1);
        ctx.fillRect(px, py + 8, T, 1);
        ctx.fillStyle = C.post;
        ctx.fillRect(px + 2, py - 2, 2, 12);
        ctx.fillRect(px + 10, py - 2, 2, 12);
        ctx.fillStyle = C.rockSide;
        ctx.fillRect(px + 2, py + 10, 3, 1);
        ctx.fillRect(px + 10, py + 10, 3, 1);
        if (sim.hook) {
          ctx.fillStyle = C.hookLight;
          ctx.fillRect(px + 2, py - 3, 2, 2);
          ctx.fillRect(px + 10, py - 3, 2, 2);
        }
      } else if (k === 'flag') {
        ctx.fillStyle = C.pole;
        ctx.fillRect(px + 5, py - 8, 1, 20);
        ctx.fillStyle = C.pennant;
        const wv = Math.floor(v.t * 4) % 2;
        ctx.fillRect(px + 6, py - 8, 7, 3);
        ctx.fillRect(px + 6, py - 5, 4 + wv, 2);
        ctx.fillStyle = C.rockSide;
        ctx.fillRect(px + 4, py + 12, 4, 1);
      }
    }
  }

  // What went wrong, marked on the ground.
  if (sim.failAt >= 0) {
    const fx = sim.failAt % sim.w;
    const fz = Math.floor(sim.failAt / sim.w);
    const px = camX + fx * T;
    const py = camY + fz * T;
    ctx.fillStyle = Math.floor(v.t * 4) % 2 ? C.failA : C.failB;
    ctx.fillRect(px, py, T, 2);
    ctx.fillRect(px, py + T - 2, T, 2);
    ctx.fillRect(px, py, 2, T);
    ctx.fillRect(px + T - 2, py, 2, T);
  }

  // Crew by the flag, finale only. One figure per agent; the one working waves.
  if (sim.level.id === 'dispatch') {
    const spots: number[] = [];
    for (let i = 0; i < sim.kind.length; i++) if (sim.kind[i] === 'crew') spots.push(i);
    let n = 0;
    for (const i of spots) {
      const tx = i % sim.w;
      const tz = Math.floor(i / sim.w);
      const per = n === 0 ? 2 : spots.length > 2 && n === spots.length - 1 ? 2 : 1;
      for (let j = 0; j < per && n < 5; j++, n++) {
        const px = camX + tx * T + (per === 2 ? 2 + j * 8 : 6);
        const py = camY + tz * T + 3 + ((n * 3) % 2);
        const working = sim.auto?.phase === PHASES[n];
        crewFigure(ctx, px, py, VESTS[n], working ? Math.floor(v.t * 4) % 2 === 0 : Math.floor(v.t * 2 + n) % 9 === 0);
      }
    }
  }

  const img = ctx.getImageData(0, 0, bw, bh);
  const dx = camX + sim.x * TILE;
  const dy = camY + sim.z * TILE;
  dozer(img, sim, dx, dy);
  fog(img, (bw / 2 + dx) / 2, (bh / 2 + dy) / 2);
  ctx.putImageData(img, 0, 0);
}

function crewFigure(ctx: CanvasRenderingContext2D, x: number, y: number, vest: string, wave: boolean) {
  ctx.fillStyle = '#1b1f15';
  ctx.fillRect(x, y + 10, 4, 1); // shadow
  ctx.fillStyle = '#e2b33a';
  ctx.fillRect(x, y, 4, 1); // hat brim
  ctx.fillRect(x + 1, y - 1, 2, 1); // hat crown
  ctx.fillStyle = '#c39a72';
  ctx.fillRect(x + 1, y + 1, 2, 2); // face
  ctx.fillStyle = vest;
  ctx.fillRect(x, y + 3, 4, 4); // vest
  ctx.fillStyle = '#e6ecd4';
  ctx.fillRect(x + 1, y + 4, 2, 1); // reflective stripe
  ctx.fillStyle = '#2b3025';
  ctx.fillRect(x, y + 7, 1, 3);
  ctx.fillRect(x + 3, y + 7, 1, 3);
  if (wave) {
    ctx.fillStyle = vest;
    ctx.fillRect(x + 4, y + 1, 1, 2);
  }
}

function dozer(img: ImageData, sim: Sim, cx: number, cy: number) {
  const { width: bw, height: bh, data } = img;
  const fx = -Math.sin(sim.yaw);
  const fz = -Math.cos(sim.yaw);
  const rx = Math.cos(sim.yaw);
  const rz = -Math.sin(sim.yaw);
  const R = Math.ceil(TILE * 0.8);
  const lowered = sim.mode !== 'up';
  const tread = sim.odo * 10;

  for (let py = Math.floor(cy - R); py <= cy + R; py++) {
    if (py < 0 || py >= bh) continue;
    for (let px = Math.floor(cx - R); px <= cx + R; px++) {
      if (px < 0 || px >= bw) continue;
      const wx = (px + 0.5 - cx) / TILE;
      const wz = (py + 0.5 - cy) / TILE;
      const v = wx * fx + wz * fz; // forward
      const u = wx * rx + wz * rz; // right
      const au = Math.abs(u);
      let c: RGB | null = null;

      // Tool first (front).
      if (sim.tool === 'blade') {
        if (v > 0.38 && v < 0.52 && au < 0.5) {
          c = v > 0.48 ? D.edge : lowered ? (sim.mode === 'deep' ? D.bladeDeep : D.bladeShelf) : D.bladeUp;
        } else if (v >= 0.28 && v <= 0.38 && au > 0.15 && au < 0.24) c = D.arm;
      } else if (sim.tool === 'scoop') {
        if (v > 0.36 && v < 0.62 && au < 0.38) {
          c = v > 0.56 ? (Math.floor((u + 1) * 12) % 2 ? D.teeth : D.scoop) : D.scoop;
        } else if (v >= 0.28 && v <= 0.36 && au > 0.12 && au < 0.22) c = D.arm;
      } else if (v > 0.3 && v < 0.36 && au < 0.22) c = D.plate;

      if (!c) {
        if (au > 0.27 && au < 0.45 && v > -0.46 && v < 0.34) {
          c = Math.floor(v * 8 - tread) & 1 ? D.track : D.tread;
        } else if (au <= 0.27 && v > -0.43 && v < 0.29) {
          if (au < 0.22 && v > -0.37 && v < -0.02) {
            c = au < 0.16 && v > -0.32 && v < -0.07 ? D.roof : D.glass;
          } else if (au < 0.16 && v >= 0.02 && v < 0.27) {
            c = Math.abs(u - 0.08) < 0.05 && Math.abs(v - 0.2) < 0.05 ? D.stack : D.hood;
          } else if (v < -0.38) c = Math.floor(u * 10) & 1 ? D.grille : D.bodyEdge;
          else c = au > 0.23 ? D.bodyEdge : D.body;
        }
      }
      if (c) {
        const o = (py * bw + px) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
      }
    }
  }
}

function fog(img: ImageData, cx: number, cy: number) {
  const { width: bw, height: bh, data } = img;
  const [fr, fg, fb] = C.fog;
  const hx = bw / 2;
  const hy = bh / 2;
  for (let y = 0; y < bh; y++) {
    const dy = (y + 0.5 - cy) / hy;
    for (let x = 0; x < bw; x++) {
      const dx = (x + 0.5 - cx) / hx;
      const r = Math.sqrt(dx * dx * 0.85 + dy * dy);
      let f = (r - 0.62) / 0.5;
      if (f <= 0) continue;
      if (f > 1) f = 1;
      f = Math.ceil(f * 5) / 5; // banded, flat
      f *= 0.86;
      const o = (y * bw + x) * 4;
      data[o] += (fr - data[o]) * f;
      data[o + 1] += (fg - data[o + 1]) * f;
      data[o + 2] += (fb - data[o + 2]) * f;
    }
  }
}
