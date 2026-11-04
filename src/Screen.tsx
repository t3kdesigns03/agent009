import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { AGENT_NAME, AGENT_ORDER, CARDS, FINALE_CHOICES, type AgentId, type CardId } from './game/cards';
import { CHECKS } from './game/checks';
import { assignAgent, orchestrate, type Packet, type Step } from './game/dispatch';
import { draw, bufferSize } from './game/draw';
import { JOB_ORDER, LEVEL, needed, shape, type JobId } from './game/levels';
import { isUnlocked, loadProgress, saveProgress, type Progress } from './game/progress';
import { createSim, modeLabel, step, type Sim } from './game/sim';
import { keysToDrive, stickToDrive, type Intent, type Keys } from './game/yoke';

type View =
  | { v: 'title' }
  | { v: 'jobs' }
  | { v: 'brief'; job: JobId }
  | { v: 'play'; job: JobId; cards: CardId[]; steps: Step[]; run: number };

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Screen() {
  const [view, setView] = useState<View>({ v: 'title' });
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  // Packets remembered per job so Retry/Brief keep the last choice.
  const [packets, setPackets] = useState<Partial<Record<JobId, CardId[]>>>({});
  const [finale, setFinale] = useState<Partial<Record<AgentId, CardId | null>>>({});

  const clear = useCallback((job: JobId) => {
    setProgress((p) => {
      if (p.cleared.includes(job)) return p;
      const next = { cleared: [...p.cleared, job] };
      saveProgress(next);
      return next;
    });
  }, []);

  if (view.v === 'title') return <Title onStart={() => setView({ v: 'jobs' })} />;
  if (view.v === 'jobs')
    return (
      <Jobs
        progress={progress}
        onPick={(job) => setView({ v: 'brief', job })}
        onBack={() => setView({ v: 'title' })}
      />
    );
  if (view.v === 'brief') {
    if (view.job === 'dispatch')
      return (
        <FinaleBrief
          picks={finale}
          setPicks={setFinale}
          onBack={() => setView({ v: 'jobs' })}
          onGo={(steps) => setView({ v: 'play', job: 'dispatch', cards: steps.map((s) => s.card), steps, run: Date.now() })}
        />
      );
    return (
      <Brief
        job={view.job}
        picked={packets[view.job] ?? []}
        setPicked={(c) => setPackets((p) => ({ ...p, [view.job]: c }))}
        onBack={() => setView({ v: 'jobs' })}
        onGo={(cards) => setView({ v: 'play', job: view.job, cards, steps: [], run: Date.now() })}
      />
    );
  }
  return (
    <Play
      key={view.run}
      job={view.job}
      cards={view.cards}
      steps={view.steps}
      onRetry={() => setView({ ...view, run: Date.now() })}
      onBrief={() => setView({ v: 'brief', job: view.job })}
      onJobs={() => setView({ v: 'jobs' })}
      onCleared={() => clear(view.job)}
      onNext={() => {
        const i = JOB_ORDER.indexOf(view.job);
        const next = JOB_ORDER[i + 1];
        setView(next ? { v: 'brief', job: next } : { v: 'jobs' });
      }}
    />
  );
}

/* ---------- Title ---------- */

function Title({ onStart }: { onStart: () => void }) {
  return (
    <main className="page title">
      <div className="title-block">
        <h1 className="logo">AGENT009</h1>
        <p className="tagline">&ldquo;I want a lake over there.&rdquo;</p>
      </div>
      <div className="intro">
        <p>A bigger model is a bigger bulldozer. That is not a useful one.</p>
        <p>
          Useful is the whole site: the machine, the levers, a few facts, the right tool, the skill to use it, one
          goal, and hard stops a polite request cannot talk past.
        </p>
        <p>An agent is not the bulldozer. An agent is that stack, handed an outcome.</p>
      </div>
      <button className="btn primary big" onClick={onStart} autoFocus>
        START
      </button>
      <p className="credit">
        The bulldozer metaphor is Remington Loose&rsquo;s, from <em>The Art of Network Engineering</em> with Andy
        Lapteff (&ldquo;Why Network Engineers Are Built for the AI Era&rdquo;).
      </p>
    </main>
  );
}

/* ---------- Jobs ---------- */

function Jobs({ progress, onPick, onBack }: { progress: Progress; onPick: (j: JobId) => void; onBack: () => void }) {
  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>
          ‹ AGENT009
        </button>
        <span className="label dim">JOBS</span>
      </header>
      <ol className="jobs">
        {JOB_ORDER.map((id) => {
          const l = LEVEL[id];
          const open = isUnlocked(progress, id);
          const done = progress.cleared.includes(id);
          return (
            <li key={id}>
              <button className="job" disabled={!open} onClick={() => onPick(id)}>
                <span className="job-num">{String(l.num).padStart(2, '0')}</span>
                <span className="job-name">
                  <span className="label">{l.name}</span>
                  <span className="job-role">{l.role}</span>
                </span>
                <span className={`job-state ${done ? 'done' : ''}`}>{done ? '✓ CLEAR' : open ? 'OPEN' : 'LOCKED'}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

/* ---------- Brief (jobs 1–5) ---------- */

function Brief({
  job,
  picked,
  setPicked,
  onBack,
  onGo,
}: {
  job: JobId;
  picked: CardId[];
  setPicked: (c: CardId[]) => void;
  onBack: () => void;
  onGo: (cards: CardId[]) => void;
}) {
  const l = LEVEL[job];
  const [reason, setReason] = useState('');
  const toggle = (id: CardId) => {
    setReason('');
    setPicked(picked.includes(id) ? picked.filter((c) => c !== id) : [...picked, id]);
  };
  const go = () => {
    if (!l.cards || !l.agent) return onGo([]);
    const a = assignAgent(l.agent, picked);
    if (!a.ok) return setReason(a.reason);
    onGo(a.cards);
  };
  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>
          ‹ JOBS
        </button>
        <span className="label dim">
          JOB {l.num} · {l.name}
        </span>
      </header>
      <section className="brief">
        <h2 className="label">{l.role.toUpperCase()}</h2>
        <p>{l.brief}</p>
        <p className="objective">
          <span className="label dim">GOAL</span> {l.objective}
        </p>
        {l.cards ? (
          <>
            <p className="label dim rule">PACKET · TWO FACTS AT MOST</p>
            <div className="cards">
              {l.cards.map((id) => (
                <button
                  key={id}
                  className={`card ${picked.includes(id) ? 'on' : ''}`}
                  onClick={() => toggle(id)}
                  aria-pressed={picked.includes(id)}
                >
                  <span className="card-box">{picked.includes(id) ? '■' : '□'}</span>
                  <span>{CARDS[id].text}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="label dim rule">NO CARD FORM</p>
        )}
        {reason && (
          <p className="reason" role="alert">
            REFUSED · {reason}
          </p>
        )}
        <button className="btn primary big" onClick={go}>
          RUN JOB
        </button>
      </section>
    </main>
  );
}

/* ---------- Finale brief ---------- */

function FinaleBrief({
  picks,
  setPicks,
  onBack,
  onGo,
}: {
  picks: Partial<Record<AgentId, CardId | null>>;
  setPicks: (p: Partial<Record<AgentId, CardId | null>>) => void;
  onBack: () => void;
  onGo: (steps: Step[]) => void;
}) {
  const [reason, setReason] = useState('');
  const go = () => {
    const packet: Packet = {};
    for (const a of AGENT_ORDER) {
      const c = picks[a];
      if (c) packet[a] = [c];
    }
    const r = orchestrate(packet);
    if (!r.ok) return setReason(r.reason);
    onGo(r.steps);
  };
  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>
          ‹ JOBS
        </button>
        <span className="label dim">JOB 6 · DISPATCH</span>
      </header>
      <section className="brief">
        <h2 className="label">DISPATCH</h2>
        <p className="goal">&ldquo;I want a lake over there.&rdquo;</p>
        <p>{LEVEL.dispatch.brief}</p>
        {AGENT_ORDER.map((a, n) => (
          <fieldset key={a} className="agent">
            <legend className="label">
              {n + 1}. {AGENT_NAME[a].toUpperCase()}
            </legend>
            {FINALE_CHOICES[a].map((id) => (
              <button
                key={id}
                className={`card ${picks[a] === id ? 'on' : ''}`}
                aria-pressed={picks[a] === id}
                onClick={() => {
                  setReason('');
                  setPicks({ ...picks, [a]: picks[a] === id ? null : id });
                }}
              >
                <span className="card-box">{picks[a] === id ? '●' : '○'}</span>
                <span>{CARDS[id].text}</span>
              </button>
            ))}
          </fieldset>
        ))}
        {reason && (
          <p className="reason" role="alert">
            REFUSED · {reason}
          </p>
        )}
        <button className="btn primary big" onClick={go}>
          DISPATCH
        </button>
      </section>
    </main>
  );
}

/* ---------- Play ---------- */

interface Hud {
  status: Sim['status'];
  reason: string;
  yoke: boolean;
  tool: string;
  hook: boolean;
  log: string[];
  progress: string;
}

function hudOf(sim: Sim): Hud {
  const s = shape(sim);
  const part = (name: string, hit: number, n: number) =>
    `${name} ${hit}/${n}${hit >= needed(n) ? ' ✓' : ` · NEED ${needed(n)}`}`;
  let progress = '';
  const id = sim.level.id;
  if (id === 'rigger' || id === 'warden') progress = part('SHELF', s.shelfHit, s.shelfN);
  if (id === 'warden') progress += ` · BUMPS ${sim.bumps}`;
  if (id === 'grade' || id === 'dispatch')
    progress = `${part('DEEP', s.deepHit, s.deepN)} · ${part('SHELF', s.shelfHit, s.shelfN)} · RAMP ${s.rampIntact ? 'OK' : 'CUT'}`;
  return {
    status: sim.status,
    reason: sim.reason,
    yoke: sim.yokeBound,
    tool: sim.tool === 'none' ? 'NO TOOL' : modeLabel(sim).replace(/\.$/, '').replace('. Locked', ' · LOCKED').toUpperCase(),
    hook: sim.hook,
    log: sim.log.slice(-3).map((l) => l.text),
    progress,
  };
}

const sameHud = (a: Hud, b: Hud) =>
  a.status === b.status &&
  a.yoke === b.yoke &&
  a.tool === b.tool &&
  a.progress === b.progress &&
  a.log.join('|') === b.log.join('|');

function Play({
  job,
  cards,
  steps,
  onRetry,
  onBrief,
  onJobs,
  onCleared,
  onNext,
}: {
  job: JobId;
  cards: CardId[];
  steps: Step[];
  onRetry: () => void;
  onBrief: () => void;
  onJobs: () => void;
  onCleared: () => void;
  onNext: () => void;
}) {
  const level = LEVEL[job];
  const simRef = useRef<Sim>(null as unknown as Sim);
  if (!simRef.current) simRef.current = createSim(job, cards, steps);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const keys = useRef<Keys>({});
  const stick = useRef({ x: 0, y: 0 });
  const events = useRef<{ use?: boolean; cut?: boolean; leave?: boolean }>({});
  const [hud, setHud] = useState<Hud>(() => hudOf(simRef.current));
  const finale = job === 'dispatch';

  // Keyboard
  useEffect(() => {
    const map: Record<string, keyof Keys> = {
      KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
      ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd',
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat && !map[e.code]) return;
      if (map[e.code]) {
        keys.current[map[e.code]] = true;
        e.preventDefault();
      } else if (e.code === 'KeyF') events.current.use = true;
      else if (e.code === 'KeyK') events.current.cut = true;
      else if (e.code === 'KeyL' && finale) events.current.leave = true;
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
  }, [finale]);

  // Loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rm = reducedMotion();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHud = hudOf(simRef.current);
    const fit = () => {
      const r = wrapRef.current!.getBoundingClientRect();
      const { bw, bh } = bufferSize(r.width, r.height);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrapRef.current!);
    const DT = 1 / 60;
    const frame = (now: number) => {
      const sim = simRef.current;
      acc = Math.min(acc + (now - last) / 1000, 0.25);
      last = now;
      while (acc >= DT) {
        const k = keysToDrive(keys.current);
        const s = stickToDrive(stick.current.x, stick.current.y);
        const intent: Intent = {
          throttle: Math.max(-1, Math.min(1, k.throttle + s.throttle)),
          steer: Math.max(-1, Math.min(1, k.steer + s.steer)),
          ...events.current,
        };
        events.current = {};
        step(sim, intent, DT);
        acc -= DT;
      }
      draw(ctx, sim, { bw: canvas.width, bh: canvas.height, reducedMotion: rm, t: now / 1000 });
      const h = hudOf(sim);
      if (!sameHud(h, lastHud)) {
        lastHud = h;
        setHud(h);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const press = (e: 'use' | 'cut' | 'leave') => () => {
    events.current[e] = true;
  };

  return (
    <main className="play">
      <div className="screen" ref={wrapRef}>
        <canvas ref={canvasRef} className="site" aria-label={`Job ${level.num}: ${level.objective}`} />
        <div className="ticks" aria-hidden>
          <i className="tl" />
          <i className="tr" />
          <i className="bl" />
          <i className="br" />
        </div>
        <div className="hud top">
          <div className="hud-left">
            <div className="label watch">
              JOB {level.num} · {level.name}
            </div>
            <div className="obj">{level.objective}</div>
            {hud.progress && <div className="label prog">{hud.progress}</div>}
          </div>
          <div className="hud-right">
            <button className="btn ghost small" onClick={onJobs} aria-label="Back to jobs">
              JOBS
            </button>
            <span className={`chip ${hud.yoke ? 'ok' : 'bad'}`}>YOKE {hud.yoke ? 'LIVE' : 'DEAD'}</span>
            <span className="chip">{hud.tool}</span>
            {(job === 'warden' || finale) && (
              <span className={`chip ${hud.hook ? 'ok' : ''}`}>HOOK {hud.hook ? 'ARMED' : 'NONE'}</span>
            )}
          </div>
        </div>
        <div className="log" aria-live="polite">
          {hud.log.map((t, i) => (
            <div key={`${i}-${t}`} className={i === hud.log.length - 1 ? 'new' : ''}>
              {t}
            </div>
          ))}
        </div>
        <div className="hud bottom">
          {finale ? (
            <div className="handsoff label">HANDS OFF · THE CREW DRIVES</div>
          ) : (
            <Stick onMove={(x, y) => (stick.current = { x, y })} />
          )}
          <div className="keys label">{finale ? 'F USE · K CUT · L LEAVE' : 'WASD MOVE · F USE'}</div>
          <div className="buttons">
            <button className="btn pad" onPointerDown={press('use')}>
              USE
            </button>
            <button className="btn pad" onPointerDown={press('cut')}>
              CUT
            </button>
            {finale && (
              <button className="btn pad primary" onPointerDown={press('leave')}>
                LEAVE
              </button>
            )}
          </div>
        </div>
        {hud.status === 'fail' && (
          <div className="overlay">
            <div className="panel">
              <div className="label bad big-label">✕ FAILED</div>
              <p className="why">{hud.reason}</p>
              <div className="row">
                <button className="btn primary" onClick={onRetry} autoFocus>
                  RETRY
                </button>
                <button className="btn" onClick={onBrief}>
                  {level.cards || finale ? 'CHANGE PACKET' : 'BRIEF'}
                </button>
              </div>
            </div>
          </div>
        )}
        {hud.status === 'win' && <CheckPanel job={job} onRight={onCleared} onNext={onNext} />}
      </div>
    </main>
  );
}

/* ---------- The check ---------- */

function CheckPanel({ job, onRight, onNext }: { job: JobId; onRight: () => void; onNext: () => void }) {
  const check = CHECKS[job];
  const [tried, setTried] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const solved = useMemo(() => tried.some((i) => check.choices[i].right), [tried, check]);
  const pick = (i: number) => {
    if (solved) return;
    setLast(i);
    setTried((t) => (t.includes(i) ? t : [...t, i]));
    if (check.choices[i].right) onRight();
  };
  const isLast = job === 'dispatch';
  return (
    <div className="overlay">
      <div className="panel check" role="dialog" aria-label="Check">
        <div className="label ok big-label">✓ CLEAR</div>
        <p className="ask">{check.ask}</p>
        <div className="choices">
          {check.choices.map((c, i) => {
            const t = tried.includes(i);
            return (
              <button
                key={i}
                className={`choice ${t ? (c.right ? 'right' : 'wrong') : ''}`}
                onClick={() => pick(i)}
                disabled={solved && !c.right}
              >
                <span className="choice-text">
                  {t ? (c.right ? '✓ ' : '✕ ') : ''}
                  {c.text}
                </span>
                {t && <span className="choice-why">{c.why}</span>}
              </button>
            );
          })}
        </div>
        {!solved && last !== null && <p className="label dim">PICK AGAIN</p>}
        {solved && (
          <button className="btn primary big" onClick={onNext} autoFocus>
            {isLast ? 'JOBS' : 'NEXT'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Thumb stick ---------- */

function Stick({ onMove }: { onMove: (x: number, y: number) => void }) {
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
    onMove(x, y);
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={base}
      className="stick"
      role="application"
      aria-label="Thumb stick: up drives, left turns left"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div className="knob" style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
    </div>
  );
}
