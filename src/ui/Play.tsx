import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { JOBS, debrief, questions, type Question } from '../game/content';
import { AGENTS, AGENT_ORDER, createCrew, crewOf, leaveCrew, stepCrew, type Board } from '../game/crew';
import { draw, newCam, tileSize, updateCam } from '../game/draw';
import type { JobId } from '../game/ids';
import type { Plan } from '../game/plan';
import { LAKE_CELLS, RIGGER_TARGET, cellName, regionName } from '../game/site';
import { FACTS, FACT_ORDER, PACKET_SLOTS, type FactId, type Snapshot } from '../game/snapshot';
import {
  answerAsk,
  commitPacket,
  createSim,
  gradeAutoOps,
  guardLine,
  leavePacket,
  packetProblems,
  riggerAutoOps,
  riggerCut,
  snapshotOf,
  startAuto,
  step,
  useLabel,
  workOrder,
  type Guard,
  type LogLine,
  type Sim,
  type WorkItem,
} from '../game/sim';
import { dashboard, failSummary, type Extras } from '../game/stats';
import { STAGE_NAME, type Stage } from '../game/vocab';
import { keysToDrive, stickToHeading, type Intent, type Keys } from '../game/yoke';
import { Glossary, HarnessStrip } from './Stack';

export interface RunCfg {
  plan?: Plan;
  guard?: Guard;
  board?: Board;
  auto?: boolean;
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Hud {
  status: Sim['status'];
  reason: string;
  hint: string;
  yoke: Sim['yoke'];
  tool: string;
  use: { action: string; result: string };
  wo: WorkItem[];
  log: LogLine[];
  stage: Stage;
  heading: number;
  region: string;
  packet: number;
  guard: Guard | null;
  hook: boolean;
  ask: Sim['ask'];
  radio: Sim['radio'];
  auto: boolean;
  canAuto: boolean;
  crew: null | {
    phase: string;
    agents: { id: string; name: string; color: string; status: string; stage: string; done: boolean; busy: number; idle: number }[];
    log: string[];
  };
}

function hudOf(sim: Sim): Hud {
  const c = crewOf(sim);
  const toolText =
    sim.tool === 'none'
      ? 'NO TOOL'
      : `${sim.tool.toUpperCase()} · ${sim.mode === 'up' ? '▲ RAISED' : sim.mode === 'shelf' ? '▼ SHELF' : '▼ DEEP'}`;
  return {
    status: sim.status,
    reason: sim.reason,
    hint: sim.hint,
    yoke: sim.yoke,
    tool: sim.mounting ? `MOUNTING ${sim.mounting.tool.toUpperCase()}…` : toolText,
    use: useLabel(sim),
    wo: workOrder(sim),
    log: sim.log.slice(-4),
    stage: sim.stage.id,
    heading: Math.round((sim.yaw * 180) / Math.PI / 5) * 5,
    region: regionName(Math.floor(sim.x), Math.floor(sim.z)),
    packet: sim.packet.reduce((n, id) => n + FACTS[id].slots, 0),
    guard: sim.guard,
    hook: sim.hook,
    ask: sim.ask,
    radio: sim.radio && sim.time - sim.radio.t < 9 ? sim.radio : null,
    auto: !!sim.auto,
    canAuto: sim.job === 'rigger' ? sim.tool !== 'none' && !sim.auto && riggerCut(sim) < RIGGER_TARGET : sim.job === 'grade' && !sim.auto && !!sim.plan && sim.status === 'play',
    crew: c
      ? {
          phase: c.phase,
          agents: AGENT_ORDER.map((id) => {
            const w = c.workers[id];
            return {
              id,
              name: AGENTS[id].name,
              color: AGENTS[id].color,
              status: w.status,
              stage: w.ops.length ? (w.done ? 'DONE' : STAGE_NAME[w.stage].toUpperCase()) : '—',
              done: w.done,
              busy: Math.round(w.busy),
              idle: Math.round(w.idle),
            };
          }),
          log: c.log.slice(-4),
        }
      : null,
  };
}

const keyOf = (h: Hud) => JSON.stringify(h);
const RATES = [1, 2, 4];

export function Play({
  job,
  snap,
  cfg,
  tour,
  extras,
  onFail,
  onCleared,
  onWrong,
  onRetry,
  onBrief,
  onJobs,
  onNext,
}: {
  job: JobId;
  snap: Snapshot;
  cfg: RunCfg;
  tour: boolean;
  extras: () => Extras;
  onFail: () => void;
  onCleared: (s: Snapshot, score: number) => void;
  onWrong: () => void;
  onRetry: () => void;
  onBrief: () => void;
  onJobs: () => void;
  onNext: () => void;
}) {
  const meta = JOBS[job];
  const simRef = useRef<Sim>(null as unknown as Sim);
  if (!simRef.current) {
    const s = createSim(job, snap, { guard: cfg.guard, plan: cfg.plan });
    if (job === 'dispatch' && cfg.board) s.crew = createCrew(cfg.board, s);
    simRef.current = s;
  }
  if (import.meta.env.DEV) (window as unknown as { __sim: Sim }).__sim = simRef.current;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);
  const keys = useRef<Keys>({});
  const stick = useRef<{ heading: number; mag: number } | null>(null);
  const events = useRef<{ use?: boolean; cut?: boolean }>({});
  const [hud, setHud] = useState<Hud>(() => hudOf(simRef.current));
  const [rate, setRate] = useState(job === 'dispatch' || (job === 'grade' && cfg.auto) ? 2 : 1);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const [tourI, setTourI] = useState<number | null>(tour && meta.tour.length ? 0 : null);
  const tourRef = useRef(tourI);
  tourRef.current = tourI;
  const [woOpen, setWoOpen] = useState(() => typeof window === 'undefined' || window.innerHeight >= 900 || window.innerWidth >= 900);
  const [gloss, setGloss] = useState(false);
  const status = useRef(hud.status);
  status.current = hud.status;
  const actions = useRef({ onRetry, onJobs });
  actions.current = { onRetry, onJobs };
  const failed = useRef(false);
  const autoStarted = useRef(false);

  const endTour = useCallback(() => {
    setTourI(null);
    const sim = simRef.current;
    if (job === 'grade' && cfg.auto && cfg.plan && !autoStarted.current) {
      autoStarted.current = true;
      startAuto(sim, gradeAutoOps(sim, cfg.plan));
    }
  }, [job, cfg]);
  useEffect(() => {
    if (tourI === null && job === 'grade' && cfg.auto && cfg.plan && !autoStarted.current) endTour();
  }, [tourI, job, cfg, endTour]);

  // keyboard
  useEffect(() => {
    const map: Record<string, keyof Keys> = {
      KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
      ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd',
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.panel')) {
        if (e.code === 'Escape') actions.current.onJobs();
        return;
      }
      if (map[e.code]) {
        keys.current[map[e.code]] = true;
        e.preventDefault();
        return;
      }
      if (e.repeat) return;
      if (e.code === 'Escape') return actions.current.onJobs();
      if (tourRef.current !== null) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          const n = tourRef.current + 1;
          if (n >= meta.tour.length) endTour();
          else setTourI(n);
        }
        return;
      }
      if (status.current === 'win' || status.current === 'packet' || status.current === 'ask') return;
      if (e.code === 'KeyR' || (e.code === 'Enter' && status.current === 'fail')) {
        e.preventDefault();
        return actions.current.onRetry();
      }
      if (e.code === 'KeyF' || e.code === 'Space') {
        e.preventDefault();
        events.current.use = true;
      } else if (e.code === 'KeyK') events.current.cut = true;
      else if (e.code === 'KeyL' && job === 'dispatch') leave();
    };
    const up = (e: KeyboardEvent) => {
      if (map[e.code]) keys.current[map[e.code]] = false;
    };
    const blur = () => (keys.current = {});
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, endTour]);

  // loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const rm = reducedMotion();
    const cam = newCam();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastKey = '';
    const size = { w: 1, h: 1, dpr: 1, top: 0, bottom: 0 };
    const fit = () => {
      const r = wrapRef.current!.getBoundingClientRect();
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      size.w = r.width;
      size.h = r.height;
      size.dpr = dpr;
      size.top = topRef.current ? topRef.current.getBoundingClientRect().bottom - r.top : 0;
      size.bottom = botRef.current ? r.bottom - botRef.current.getBoundingClientRect().top : 0;
      const bw = Math.round(r.width * dpr);
      const bh = Math.round(r.height * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        cam.ready = false;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrapRef.current!);
    if (topRef.current) ro.observe(topRef.current);
    if (botRef.current) ro.observe(botRef.current);
    const DT = 1 / 60;
    const frame = (now: number) => {
      const sim = simRef.current;
      const real = Math.min((now - last) / 1000, 0.25);
      last = now;
      const touring = tourRef.current !== null;
      cam.focus = touring ? meta.tour[tourRef.current!]?.at ?? null : null;
      if (!touring) {
        acc = Math.min(acc + real * rateRef.current, 0.25 * rateRef.current);
        while (acc >= DT) {
          const crew = crewOf(sim);
          if (crew) stepCrew(crew, sim, DT);
          else {
            const k = keysToDrive(keys.current);
            const intent: Intent = { ...k, ...events.current };
            if (stick.current) {
              intent.heading = stick.current.heading;
              intent.mag = stick.current.mag;
            }
            events.current = {};
            step(sim, intent, DT);
          }
          acc -= DT;
        }
      }
      if (size.top === 0) fit();
      const v = { w: size.w, h: size.h, dpr: size.dpr, t: now / 1000, reducedMotion: rm, cam, top: size.top, bottom: size.bottom };
      updateCam(cam, sim, v, real);
      draw(ctx, sim, v);
      const h = hudOf(sim);
      const key = keyOf(h);
      if (key !== lastKey) {
        lastKey = key;
        setHud(h);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hud.status === 'fail' && !failed.current) {
      failed.current = true;
      onFail();
    }
  }, [hud.status, onFail]);

  const press = (e: 'use' | 'cut') => () => {
    events.current[e] = true;
  };
  const leave = () => {
    const sim = simRef.current;
    const c = crewOf(sim);
    if (c) leaveCrew(c, sim);
  };
  const auto = () => {
    const sim = simRef.current;
    if (sim.job === 'rigger') startAuto(sim, riggerAutoOps(sim));
    if (sim.job === 'grade' && sim.plan) startAuto(sim, gradeAutoOps(sim, sim.plan));
  };
  const finale = job === 'dispatch';
  const tourStop = tourI !== null ? meta.tour[tourI] : null;
  const doneN = hud.wo.filter((w) => w.done).length;
  const nowItem = hud.wo.find((w) => !w.done);

  return (
    <main className="play">
      <div className="screen" ref={wrapRef}>
        <canvas ref={canvasRef} className="site" aria-label={`Job ${meta.num}: ${meta.goal}`} />
        <div className="hud-top" ref={topRef}>
          <div className="topbar">
            <span className="label watch">
              {meta.num} · {meta.name}
            </span>
            {!finale && <Compass deg={hud.heading} />}
            <span className="topbtns">
              <button className="btn ghost small" onClick={() => setGloss(true)} aria-label="Vocabulary">
                ?
              </button>
              <button className="btn ghost small" onClick={onRetry} aria-label="Restart job (R)">
                ↻
              </button>
              <button className="btn ghost small" onClick={onJobs} aria-label="Back to jobs (Esc)">
                ✕
              </button>
            </span>
          </div>
          {finale ? (
            <div className="agents">
              {hud.crew?.agents.map((a) => (
                <div key={a.id} className={`agent-card ${a.done ? 'done' : ''}`} style={{ borderColor: a.color }}>
                  <span className="label" style={{ color: a.color }}>
                    {a.name}
                  </span>
                  <span className="agent-stage label">{a.stage}</span>
                  <span className="agent-status">{a.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={`wo ${woOpen ? 'open' : ''}`}>
              <button className="wo-head label" onClick={() => setWoOpen((o) => !o)} aria-expanded={woOpen}>
                WORK ORDER {doneN}/{hud.wo.length} {woOpen ? '▾' : '▸'}
                {!woOpen && nowItem && <span className="wo-now"> · {nowItem.text}</span>}
              </button>
              {woOpen && (
                <ol>
                  {hud.wo.map((w, i) => (
                    <li key={i} className={w.done ? 'done' : w === nowItem ? 'now' : ''}>
                      <span className="wo-mark">{w.done ? '✓' : w === nowItem ? '▶' : '·'}</span>
                      <span>
                        {w.text}
                        {w.detail && <b> {w.detail}</b>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {!finale && (
            <div className="chips">
              <span className={`chip ${hud.yoke === 'bound' ? 'ok' : 'bad'}`}>
                YOKE {hud.yoke === 'bound' ? 'BOUND' : hud.yoke === 'off' ? 'NOT BOUND' : hud.yoke === 'cut' ? 'CUT BY YOU' : 'DROPPED'}
              </span>
              {job !== 'yoke' && job !== 'survey' && <span className="chip">{hud.tool}</span>}
              {job !== 'yoke' && <span className="chip">PACKET {hud.packet}/{PACKET_SLOTS}</span>}
              {(job === 'warden' || hud.hook) && (
                <span className={`chip ${hud.hook ? 'rule' : 'warn'}`}>{hud.hook ? 'HOOK W1 ARMED' : guardLine(hud.guard).split(':')[0]}</span>
              )}
              <span className="chip dim">{hud.region}</span>
            </div>
          )}
          {hud.radio && (hud.status === 'play' || hud.status === 'ask') && (
            <div className="radio" role="status">
              <span className="label">📻 RADIO · {hud.radio.from}</span>
              <span>{hud.radio.text}</span>
            </div>
          )}
        </div>

        <div className="hud-bottom" ref={botRef}>
          <HarnessStrip now={hud.stage} />
          <div className="log" aria-live="polite">
            {(finale ? hud.crew?.log.map((t, i) => ({ t: i, text: t, tone: 'info' as const })) ?? [] : hud.log).map((l, i, all) => (
              <div key={`${i}-${l.text}`} className={`t-${l.tone} ${i === all.length - 1 ? 'new' : ''}`}>
                {l.text}
              </div>
            ))}
          </div>
          <div className="controls">
            {finale ? (
              <div className="handsoff label">HANDS OFF · THE CREW DRIVES</div>
            ) : (
              <Stick onMove={(v) => (stick.current = v)} />
            )}
            <div className="buttons">
              {finale ? (
                <>
                  <button className="btn pad" onClick={() => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length])}>
                    CREW ×{rate}
                  </button>
                  <button className={`btn pad primary ${hud.crew?.phase === 'ready' ? 'pulse' : ''}`} onClick={leave}>
                    LEAVE
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`btn pad use ${hud.yoke !== 'bound' ? 'pulse' : ''}`}
                    onPointerDown={press('use')}
                    disabled={!hud.use.action || hud.auto}
                    aria-label={`F: ${hud.use.action || 'nothing to do'}`}
                  >
                    <span className="use-key">F</span>
                    <span className="use-act">{hud.use.action || '—'}</span>
                    <span className="use-res">{hud.use.result}</span>
                  </button>
                  <div className="btnrow">
                    <button className="btn pad small" onPointerDown={press('cut')} aria-label="K: cut the yoke (kill switch)">
                      K · CUT
                    </button>
                    {hud.canAuto && (
                      <button className="btn pad small auto" onClick={auto}>
                        AUTO
                      </button>
                    )}
                    {hud.auto && (
                      <button className="btn pad small auto" onClick={() => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length])} aria-label="Agent speed">
                        AGENT ×{rate}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="keys label">{finale ? 'L LEAVE · R RESTART · ESC JOBS' : 'WASD DRIVE · F USE · K CUT · R RESTART · ESC JOBS'}</div>
        </div>

        {tourStop && (
          <div className="tour" role="dialog" aria-label="Site tour">
            <p className="label dim">
              LOOK FIRST · {tourI! + 1}/{meta.tour.length}
            </p>
            <p className="tour-text">{tourStop.text}</p>
            <div className="row">
              <button className="btn" onClick={endTour}>
                SKIP
              </button>
              <button
                className="btn primary"
                autoFocus
                onClick={() => (tourI! + 1 >= meta.tour.length ? endTour() : setTourI(tourI! + 1))}
              >
                {tourI! + 1 >= meta.tour.length ? 'START' : 'NEXT'}
              </button>
            </div>
          </div>
        )}

        {hud.status === 'packet' && <PacketPanel sim={simRef.current} onWrong={onWrong} />}
        {hud.status === 'ask' && hud.ask && (
          <div className="overlay">
            <div className="panel" role="dialog" aria-label="Approval">
              <div className="label warn big-label">{hud.ask.title}</div>
              <p className="why">{hud.ask.text}</p>
              <div className="row">
                <button className="btn" onClick={() => answerAsk(simRef.current, true)}>
                  {hud.ask.yes}
                </button>
                <button className="btn primary" onClick={() => answerAsk(simRef.current, false)} autoFocus>
                  {hud.ask.no}
                </button>
              </div>
            </div>
          </div>
        )}
        {hud.status === 'fail' && (
          <div className="overlay sheet">
            <div className="panel">
              <div className="label bad big-label">{hud.reason.startsWith('It held') ? '✕ NOT CLEARED' : '✕ FAILED'}</div>
              <p className="why">{hud.reason}</p>
              {hud.hint && (
                <p className="hint">
                  <span className="label">NEXT TIME</span> {hud.hint}
                </p>
              )}
              <div className="minidash">
                {failSummary(simRef.current).map((r) => (
                  <span key={r.label}>
                    <b>{r.value}</b> {r.label.toLowerCase()}
                  </span>
                ))}
              </div>
              <div className="row">
                <button className="btn primary" onClick={onRetry} autoFocus>
                  RETRY
                </button>
                {(job === 'grade' || job === 'warden' || job === 'dispatch') && (
                  <button className="btn" onClick={onBrief}>
                    CHANGE SETUP
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {hud.status === 'win' && <Result sim={simRef.current} extras={extras} onCleared={onCleared} onNext={onNext} />}
        {gloss && (
          <div className="overlay" onClick={() => setGloss(false)}>
            <div className="panel wide" onClick={(e) => e.stopPropagation()}>
              <div className="row spread">
                <span className="label big-label">ONE VOCABULARY</span>
                <button className="btn ghost small" onClick={() => setGloss(false)} autoFocus>
                  CLOSE
                </button>
              </div>
              <Glossary />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ---------- Survey: write the context packet ---------- */

function PacketPanel({ sim, onWrong }: { sim: Sim; onWrong: () => void }) {
  const [pick, setPick] = useState<FactId[]>([]);
  const [problems, setProblems] = useState<string[] | null>(null);
  const locked = !!problems;
  const slots = pick.reduce((n, id) => n + FACTS[id].slots, 0);
  const toggle = (id: FactId) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="overlay">
      <div className="panel" role="dialog" aria-label="Context packet">
        <div className="label big-label">WRITE THE CONTEXT PACKET</div>
        <p className="dim">What does the next machine need to know? You can only pack what you perceived. Three slots.</p>
        <div className={`slots ${slots > PACKET_SLOTS ? 'over' : ''}`} aria-label={`${slots} of ${PACKET_SLOTS} slots`}>
          {Array.from({ length: Math.max(PACKET_SLOTS, slots) }, (_, i) => (
            <i key={i} className={i < slots ? (i >= PACKET_SLOTS ? 'over' : 'on') : ''} />
          ))}
          <span className="label">
            {slots}/{PACKET_SLOTS}
          </span>
        </div>
        <div className="cards">
          {FACT_ORDER.map((id) => {
            const f = FACTS[id];
            const known = !f.needs || sim.found.has(f.needs);
            return (
              <button key={id} className={`card ${pick.includes(id) ? 'on' : ''}`} disabled={!known || locked} onClick={() => toggle(id)} aria-pressed={pick.includes(id)}>
                <span className="card-box">{pick.includes(id) ? '■' : '□'}</span>
                <span>
                  {known ? f.text : `??? Never scanned: ${f.needs === 'bank' ? 'whatever is under the hatched ground' : 'the water’s edge'}. Go back and scan.`}
                  <span className="slotcost label">
                    {f.slots} SLOT{f.slots > 1 ? 'S' : ''}
                  </span>
                  {pick.includes(id) && <span className="why">{f.cost}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {problems && (
          <div className="grade bad" role="alert">
            <div className="label">✕ NOT A PACKET THE NEXT JOB CAN USE · COUNTED</div>
            {problems.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <button className="btn" onClick={() => setProblems(null)}>
              REVISE
            </button>
          </div>
        )}
        <div className="row">
          <button className="btn" onClick={() => leavePacket(sim)} disabled={locked}>
            BACK TO SCANNING
          </button>
          <button
            className="btn primary"
            disabled={locked || pick.length === 0}
            onClick={() => {
              const p = packetProblems(sim, pick);
              if (p.length) {
                onWrong();
                setProblems(p);
              } else commitPacket(sim, pick);
            }}
          >
            WRITE PACKET
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- After a clear: dashboard, debrief, check ---------- */

function Result({
  sim,
  extras,
  onCleared,
  onNext,
}: {
  sim: Sim;
  extras: () => Extras;
  onCleared: (s: Snapshot, score: number) => void;
  onNext: () => void;
}) {
  const qs = useMemo<Question[]>(() => questions(sim), [sim]);
  const db = useMemo(() => debrief(sim), [sim]);
  const [qi, setQi] = useState(0);
  const [tried, setTried] = useState<number[]>([]);
  const [wrongOpen, setWrongOpen] = useState<number | null>(null);
  const [quizWrong, setQuizWrong] = useState(0);
  const [done, setDone] = useState(false);
  const [base] = useState(() => extras());
  const dash = dashboard(sim, { ...base, quizWrong });
  const q = qs[qi];
  const solved = tried.some((i) => q.choices[i].right);
  const saved = useRef(false);

  const pick = (i: number) => {
    if (solved || wrongOpen !== null || tried.includes(i)) return;
    setTried((t) => [...t, i]);
    if (!q.choices[i].right) {
      setWrongOpen(i);
      setQuizWrong((n) => n + 1);
    }
  };
  const nextQ = () => {
    if (qi + 1 < qs.length) {
      setQi(qi + 1);
      setTried([]);
      setWrongOpen(null);
    } else setDone(true);
  };
  useEffect(() => {
    if (done && !saved.current) {
      saved.current = true;
      onCleared(snapshotOf(sim), dash.score);
    }
  }, [done, dash.score, onCleared, sim]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (n >= 0) pick(n);
      else if (e.code === 'Enter' && done) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });
  const last = sim.job === 'dispatch';
  return (
    <div className="overlay">
      <div className="panel result" role="dialog" aria-label="Job cleared">
        <div className="result-head">
          <span className="label ok big-label">✓ CLEAR</span>
          <span className={`score ${dash.score >= 90 ? 'top' : dash.score >= 60 ? 'mid' : 'low'}`}>
            <b>{dash.score}</b>
            <small className="label">EFFICIENCY</small>
          </span>
        </div>
        <p className="waste">{dash.waste}</p>
        <div className="dash">
          {dash.rows.map((r) => (
            <div key={r.label} className={`drow ${r.bad ? 'bad' : ''}`}>
              <span className="dlabel">{r.label}</span>
              <span className="dval">{r.value}</span>
              {r.note && <span className="dnote">{r.note}</span>}
            </div>
          ))}
        </div>
        {dash.penalties.length > 0 && (
          <details className="pen">
            <summary className="label dim">WHERE THE POINTS WENT</summary>
            {dash.penalties.map((p, i) => (
              <p key={i}>
                −{p.pts} · {p.why}
              </p>
            ))}
          </details>
        )}

        {sim.job === 'grade' && sim.plan && <BeforeAfter sim={sim} />}
        <section className="debrief">
          <h3 className="label">1 · WHAT HAPPENED</h3>
          <p>{db.world}</p>
          <h3 className="label">2 · WHAT THAT IS IN AN AGENT</h3>
          <p>{db.agent}</p>
          <h3 className="label">3 · NEXT TIME</h3>
          <p className="rulebox">{db.rule}</p>
          <h3 className="label">4 · WHAT COMES NEXT</h3>
          <p>{db.next}</p>
          <h3 className="label">THE SAME IDEA, NO BULLDOZER</h3>
          <p className="example">{db.example}</p>
        </section>

        {!done ? (
          <section className="check">
            <p className="label dim">
              CHECK {qi + 1}/{qs.length}
            </p>
            <p className="ask">{q.ask}</p>
            <div className="choices">
              {q.choices.map((c, i) => {
                const t = tried.includes(i);
                return (
                  <button
                    key={i}
                    className={`choice ${t ? (c.right ? 'right' : 'wrong') : ''}`}
                    onClick={() => pick(i)}
                    disabled={(solved && !c.right) || (wrongOpen !== null && wrongOpen !== i) || (t && !c.right)}
                  >
                    <span className="choice-text">
                      <span className="choice-key">{i + 1}</span>
                      {t ? (c.right ? '✓ ' : '✕ ') : ''}
                      {c.text}
                    </span>
                    {t && <span className="choice-why">{c.why}</span>}
                  </button>
                );
              })}
            </div>
            {wrongOpen !== null && (
              <button className="btn" onClick={() => setWrongOpen(null)}>
                GOT IT · PICK AGAIN
              </button>
            )}
            {solved && (
              <button className="btn primary big" onClick={nextQ} autoFocus>
                {qi + 1 < qs.length ? 'NEXT QUESTION' : 'FINISH'}
              </button>
            )}
          </section>
        ) : (
          <button className="btn primary big" onClick={onNext} autoFocus>
            {last ? 'BACK TO THE SITE PLAN' : `NEXT · JOB ${JOBS[sim.job].num + 1}`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Job 4: before, plan, after ---------- */

function BeforeAfter({ sim }: { sim: Sim }) {
  const plan = sim.plan!;
  const grid = (title: string, val: (i: number) => number, mark?: (i: number) => boolean) => (
    <div className="ba">
      <span className="label dim">{title}</span>
      <div className="ba-grid">
        {LAKE_CELLS.map((i) => {
          const v = val(i);
          return <i key={i} className={`d${v} ${mark?.(i) ? 'miss' : ''}`} title={cellName(i) ?? ''} />;
        })}
      </div>
    </div>
  );
  const want = (i: number) => (plan.cells[i] === 'deep' ? 2 : plan.cells[i] === 'shelf' ? 1 : 0);
  const miss = LAKE_CELLS.filter((i) => sim.depth[i] !== want(i)).length;
  return (
    <div className="beforeafter">
      {grid('BEFORE', (i) => sim.depth0[i])}
      {grid('PLAN', want)}
      {grid('AFTER', (i) => sim.depth[i], (i) => sim.depth[i] !== want(i))}
      <p className="dim small">
        Sand = not cut, light brown = shelf (1 step), dark = deep (2 steps). {miss ? `${miss} cell${miss > 1 ? 's' : ''} differ from the plan.` : 'Result matches the plan, cell for cell.'}
      </p>
    </div>
  );
}

/* ---------- Compass: heading, always readable ---------- */

function Compass({ deg }: { deg: number }) {
  // yaw 0 = north (up the screen). Positive yaw turns left (counter-clockwise).
  const bearing = ((-deg % 360) + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const name = names[Math.round(bearing / 45) % 8];
  return (
    <span className="compass" aria-label={`Heading ${name}`}>
      <svg viewBox="-12 -12 24 24" width="26" height="26" aria-hidden>
        <circle r="11" fill="none" stroke="currentColor" strokeOpacity="0.5" />
        <g transform={`rotate(${bearing})`}>
          <path d="M0,-9 L4,3 L0,0 L-4,3 Z" fill="#facc15" />
        </g>
      </svg>
      <span className="label">{name}</span>
    </span>
  );
}

/* ---------- Thumb stick: point where you want to go ---------- */

function Stick({ onMove }: { onMove: (v: { heading: number; mag: number } | null) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const move = (e: RPointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R;
    let y = (e.clientY - (r.top + R)) / R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    setKnob({ x, y });
    onMove(stickToHeading(x, y));
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(null);
  };
  return (
    <div
      ref={base}
      className="stick"
      role="application"
      aria-label="Thumb stick: point where the machine should drive"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety; the stick still works without it */
        }
        move(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className="stick-n label">N</span>
      <div className="knob" style={{ transform: `translate(${knob.x * 40}px, ${knob.y * 40}px)` }} />
    </div>
  );
}

export const _tileSize = tileSize;
