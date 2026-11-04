// Yoke is the wheel. The model is strong. Without the wheel it is inert.

export interface Drive {
  /** -1 reverse .. 1 forward */
  throttle: number;
  /** positive turns left (yaw increases), negative turns right */
  steer: number;
}

export interface Intent extends Drive {
  /** F / Use button, edge-triggered */
  use?: boolean;
  /** K / Cut button, edge-triggered: drops Yoke */
  cut?: boolean;
  /** Leave button (finale only), edge-triggered */
  leave?: boolean;
}

const clamp = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

/** Unbound intent becomes { throttle: 0, steer: 0 }. */
export function yoke(bound: boolean, intent: Drive): Drive {
  if (!bound) return { throttle: 0, steer: 0 };
  return { throttle: clamp(intent.throttle), steer: clamp(intent.steer) };
}

export interface Keys {
  w?: boolean;
  a?: boolean;
  s?: boolean;
  d?: boolean;
}

/** WASD to intent. A turns left (yaw up). D turns right (yaw down). */
export function keysToDrive(k: Keys): Drive {
  return {
    throttle: (k.w ? 1 : 0) - (k.s ? 1 : 0),
    steer: (k.a ? 1 : 0) - (k.d ? 1 : 0),
  };
}

/** Thumb stick to intent. x right positive, y down positive (screen). Left turns left. */
export function stickToDrive(x: number, y: number, dead = 0.18): Drive {
  const dz = (v: number) => (Math.abs(v) < dead ? 0 : (v - Math.sign(v) * dead) / (1 - dead));
  return { throttle: clamp(-dz(y)), steer: clamp(-dz(x)) };
}
