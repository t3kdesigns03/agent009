import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { JOBS } from './game/content';
import { emptyBoard, type Board } from './game/crew';
import { JOB_ORDER, nextJob, type JobId } from './game/ids';
import { draftPlan, type Plan } from './game/plan';
import { isUnlocked, loadProgress, recordClear, saveProgress, startSnapshot, type Progress } from './game/progress';
import { RIGGER_TARGET } from './game/site';
import type { Snapshot } from './game/snapshot';
import { BLOCK, WHO } from './game/vocab';
import { Play, type RunCfg } from './ui/Play';
import { DispatchBoard, GuardPick, PlanEditor } from './ui/Setup';
import { Glossary, HarnessRing, StackDiagram } from './ui/Stack';

type View =
  | { v: 'title' }
  | { v: 'jobs' }
  | { v: 'brief'; job: JobId }
  | { v: 'play'; job: JobId; cfg: RunCfg; run: number; tour: boolean };

interface Tally {
  retries: number;
  wrongPicks: number;
}

export function Screen() {
  const [view, setView] = useState<View>({ v: 'title' });
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [plans, setPlans] = useState<Partial<Record<JobId, Plan>>>({});
  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const tally = useRef<Partial<Record<JobId, Tally>>>({});
  const toured = useRef<Set<JobId>>(new Set());
  const t = (j: JobId) => (tally.current[j] ??= { retries: 0, wrongPicks: 0 });

  const play = (job: JobId, cfg: RunCfg = {}) => {
    const tour = !toured.current.has(job);
    toured.current.add(job);
    setView({ v: 'play', job, cfg, run: Date.now(), tour });
  };
  const cleared = useCallback((job: JobId, snap: Snapshot, score: number) => {
    setProgress((p) => {
      const next = recordClear(p, job, snap, score);
      saveProgress(next);
      return next;
    });
    tally.current[job] = { retries: 0, wrongPicks: 0 };
  }, []);

  if (view.v === 'title')
    return <Landing progress={progress} onStart={() => setView({ v: 'jobs' })} />;
  if (view.v === 'jobs')
    return (
      <Jobs
        progress={progress}
        onPick={(job) => setView({ v: 'brief', job })}
        onBack={() => setView({ v: 'title' })}
        onReset={() => {
          const next: Progress = { cleared: [], site: {}, best: {} };
          saveProgress(next);
          setProgress(next);
        }}
      />
    );
  if (view.v === 'brief') {
    const job = view.job;
    const snap = startSnapshot(progress, job);
    return (
      <Brief
        job={job}
        snap={snap}
        plan={plans[job] ?? snap.plan ?? draftPlanFor(snap)}
        setPlan={(p) => setPlans((x) => ({ ...x, [job]: p }))}
        board={board}
        setBoard={setBoard}
        onWrong={() => t(job).wrongPicks++}
        onBack={() => setView({ v: 'jobs' })}
        onGo={(cfg) => play(job, cfg)}
      />
    );
  }
  const job = view.job;
  return (
    <Play
      key={view.run}
      job={job}
      snap={startSnapshot(progress, job)}
      cfg={view.cfg}
      tour={view.tour}
      extras={() => ({ retries: t(job).retries, wrongPicks: t(job).wrongPicks, quizWrong: 0 })}
      onFail={() => t(job).retries++}
      onWrong={() => t(job).wrongPicks++}
      onCleared={(s, score) => cleared(job, s, score)}
      onRetry={() => setView({ ...view, run: Date.now(), tour: false })}
      onBrief={() => setView({ v: 'brief', job })}
      onJobs={() => setView({ v: 'jobs' })}
      onNext={() => {
        const n = nextJob(job);
        setView(n ? { v: 'brief', job: n } : { v: 'jobs' });
      }}
    />
  );
}

/** Job 4 starts from the draft, with row 4 marked as already cut. */
function draftPlanFor(_snap: Snapshot): Plan {
  return draftPlan();
}

/* ---------- Landing: what this is, who you are, the stack ---------- */

function Landing({ progress, onStart }: { progress: Progress; onStart: () => void }) {
  const [gloss, setGloss] = useState(false);
  const any = progress.cleared.length > 0;
  return (
    <main className="page landing">
      <header className="hero">
        <h1 className="logo">AGENT009</h1>
        <p className="tagline">“I want a lake over there.”</p>
        <p className="lede">
          A bigger model is a bigger bulldozer. That doesn’t make it a useful one. Useful is the whole stack: the machine, its
          levers, a few facts, the right tool, a plan, and hard stops a polite request can’t talk past.
        </p>
        <button className="btn primary big" onClick={onStart} autoFocus>
          {any ? `CONTINUE · ${progress.cleared.length}/6 CLEAR` : 'START ON SITE'}
        </button>
      </header>

      <section className="who">
        <div>
          <span className="label">YOU</span>
          <p>{WHO.you}</p>
        </div>
        <div>
          <span className="label">THE AGENT</span>
          <p>{WHO.it}</p>
        </div>
        <p className="arc">{WHO.arc}</p>
      </section>

      <section>
        <h2 className="label">THE SYLLABUS · ONE SITE, SIX JOBS, ONE STACK</h2>
        <p className="dim">
          Every job is the same dig, one step further on. What you find, cut and decide carries over. Each block below lights
          up when its job is clear.
        </p>
        <StackDiagram lit={['harness', ...progress.cleared.flatMap((j) => JOBS[j].blocks)]} cleared={progress.cleared} />
      </section>

      <section className="harness-sec">
        <div>
          <h2 className="label">THE HARNESS</h2>
          <p>
            The harness is the loop that runs an agent. It <b>perceives</b> (scans the ground), <b>plans</b> (reads the work
            order), <b>acts</b> through a tool call, <b>observes</b> the result, <b>checks</b> its guardrails, then repeats or
            hands off. Its context and memory, your packet and plan, are carried into every turn.
          </p>
          <p className="dim">
            Every job’s HUD shows this loop, with the stage that’s running lit. Every debrief names the stage you just used. In
            Job 6 you watch four harnesses run at once.
          </p>
        </div>
        <HarnessRing />
      </section>

      <section>
        <button className="btn" onClick={() => setGloss((g) => !g)} aria-expanded={gloss}>
          {gloss ? 'HIDE' : 'SHOW'} THE VOCABULARY · ONE TERM PER THING
        </button>
        {gloss && <Glossary />}
      </section>

      <p className="credit">
        The bulldozer metaphor is Remington Loose’s, from <em>The Art of Network Engineering</em> with Andy Lapteff (“Why
        Network Engineers Are Built for the AI Era”).
      </p>
    </main>
  );
}

/* ---------- Jobs ---------- */

function Jobs({
  progress,
  onPick,
  onBack,
  onReset,
}: {
  progress: Progress;
  onPick: (j: JobId) => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>
          ‹ AGENT009
        </button>
        <span className="label dim">SITE PLAN · JOBS</span>
      </header>
      <ol className="jobs">
        {JOB_ORDER.map((id) => {
          const m = JOBS[id];
          const open = isUnlocked(progress, id);
          const done = progress.cleared.includes(id);
          const best = progress.best[id];
          return (
            <li key={id}>
              <button className="job" disabled={!open} onClick={() => onPick(id)}>
                <span className="job-num">{String(m.num).padStart(2, '0')}</span>
                <span className="job-name">
                  <span className="label">
                    {m.name} {m.role.toUpperCase() !== m.name && <span className="job-role">· {m.role}</span>}
                  </span>
                  <span className="job-teach">
                    {m.blocks
                      .filter((b) => b !== 'harness')
                      .map((b) => (
                        <span key={b} className={`blockchip b-${b}`}>
                          {BLOCK[b].name}
                        </span>
                      ))}{' '}
                    {m.teaches}
                  </span>
                </span>
                <span className={`job-state ${done ? 'done' : ''}`}>
                  {done ? (best !== undefined ? `✓ ${best}` : '✓ CLEAR') : open ? 'OPEN' : '🔒'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="dim small">✓ number = your best efficiency score (100 is a clean run). Replays keep the site where you left it.</p>
      {progress.cleared.length > 0 && (
        <div className="reset">
          {confirm ? (
            <>
              <span className="dim">Lock every job and reset the site?</span>
              <button className="btn small" onClick={() => (onReset(), setConfirm(false))}>
                RESET
              </button>
              <button className="btn ghost small" onClick={() => setConfirm(false)}>
                KEEP
              </button>
            </>
          ) : (
            <button className="btn ghost small" onClick={() => setConfirm(true)}>
              RESET PROGRESS
            </button>
          )}
        </div>
      )}
    </main>
  );
}

/* ---------- Brief ---------- */

function Brief({
  job,
  snap,
  plan,
  setPlan,
  board,
  setBoard,
  onWrong,
  onBack,
  onGo,
}: {
  job: JobId;
  snap: Snapshot;
  plan: Plan;
  setPlan: (p: Plan) => void;
  board: Board;
  setBoard: Dispatch<SetStateAction<Board>>;
  onWrong: () => void;
  onBack: () => void;
  onGo: (cfg: RunCfg) => void;
}) {
  const m = JOBS[job];
  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>
          ‹ JOBS
        </button>
        <span className="label dim">
          JOB {m.num} · {m.name}
        </span>
      </header>
      <section className="brief">
        <h2 className="label">
          {m.name} {m.role.toUpperCase() !== m.name && <span className="dim">· {m.role}</span>}
        </h2>
        <div className="teaches">
          {m.blocks.map((b) => (
            <span key={b} className={`blockchip b-${b}`}>
              {BLOCK[b].name}
            </span>
          ))}
          <span>{m.teaches}</span>
        </div>
        <p>{m.story}</p>
        <p className="objective">
          <span className="label dim">GOAL</span> {m.goal}
        </p>
        <p className="carried">
          <span className="label dim">CARRIED OVER</span> {m.carried}
          {job === 'grade' && snap.tool !== 'blade' && (
            <b> You finished Job 3 with the {snap.tool.toUpperCase()}: the plan will need a swap to the blade at the rack.</b>
          )}
        </p>
        <p className="dim small">
          <span className="label">CONTROLS</span> {m.controls}
          {job !== 'dispatch' && ' · On a phone, point the stick where you want to go.'}
        </p>

        {job === 'grade' && (
          <PlanEditor plan={plan} setPlan={setPlan} depth={snap.depth} onWrong={onWrong} onRun={(p, auto) => onGo({ plan: p, auto })} />
        )}
        {job === 'warden' && <GuardPick onWrong={onWrong} onGo={(g) => onGo({ guard: g })} />}
        {job === 'dispatch' && <DispatchBoard board={board} setBoard={setBoard} onWrong={onWrong} onGo={(b) => onGo({ board: b })} />}
        {(job === 'yoke' || job === 'survey' || job === 'rigger') && (
          <>
            {job === 'rigger' && (
              <p className="note">
                You’ll choose the tool <b>in the scene</b>: drive onto a bay on the rack and press F. Then cut row 4: {RIGGER_TARGET}{' '}
                cells. If driving isn’t the point for you, press <b>AUTO</b> once a tool is mounted. The agent drives your work order,
                and the tool choice stays yours.
              </p>
            )}
            <button className="btn primary big" onClick={() => onGo({})}>
              START JOB {m.num}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
