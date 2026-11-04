import { useState, type Dispatch, type SetStateAction } from 'react';
import { AGENTS, TASKS, boardProblems, type Board, type Option } from '../game/crew';
import { DEEP_NEEDED, STEP_TEXT, clonePlan, draftPlan, gradePlan, type CellPlan, type Issue, type Plan, type StepId } from '../game/plan';
import { COLS, LAKE, RIGGER_CELLS, cellIndex, cellName } from '../game/site';
import type { Guard } from '../game/sim';

/* ---------- Job 4: see, grade and revise the plan ---------- */

const NEXT: Record<CellPlan, CellPlan> = { shelf: 'deep', deep: 'none', none: 'shelf' };

export function PlanEditor({
  plan,
  setPlan,
  depth,
  onWrong,
  onRun,
}: {
  plan: Plan;
  setPlan: (p: Plan) => void;
  depth: number[];
  onWrong: () => void;
  onRun: (p: Plan, auto: boolean) => void;
}) {
  const [graded, setGraded] = useState<Issue[] | null>(null);
  const [gradedOnce, setGradedOnce] = useState(false);
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const bad = new Set((graded ?? []).flatMap((i) => i.cells));
  const edit = (p: Plan) => {
    setPlan(p);
    setGraded(null);
    setConfirm(null);
  };
  const tap = (i: number) => {
    if (depth[i] > 0 && RIGGER_CELLS.includes(i)) return; // cut in Job 3: it's history now
    const p = clonePlan(plan);
    p.cells[i] = NEXT[p.cells[i] ?? 'none'];
    edit(p);
  };
  const move = (k: number, d: -1 | 1) => {
    const p = clonePlan(plan);
    const j = k + d;
    if (j < 0 || j >= p.order.length) return;
    [p.order[k], p.order[j]] = [p.order[j], p.order[k]];
    edit(p);
  };
  const grade = () => {
    setGraded(gradePlan(plan));
    setGradedOnce(true);
    setConfirm(null);
  };
  const run = (auto: boolean) => {
    const issues = gradePlan(plan);
    if (issues.length && confirm !== auto) {
      setGraded(issues);
      setConfirm(auto);
      return;
    }
    if (issues.length) onWrong();
    onRun(plan, auto);
  };
  const deep = Object.values(plan.cells).filter((c) => c === 'deep').length;
  return (
    <div className="planner">
      <p className="label dim rule">THE PLAN · TAP A CELL: SHELF → DEEP → NONE</p>
      <div className="pgrid" style={{ gridTemplateColumns: `28px repeat(${LAKE.cols}, 1fr)` }}>
        <span />
        {[...COLS].map((c) => (
          <span key={c} className="pcoord label">
            {c}
          </span>
        ))}
        {Array.from({ length: LAKE.rows }, (_, r) => (
          <PlanRow key={r} r={r} plan={plan} depth={depth} bad={bad} onTap={tap} />
        ))}
      </div>
      <p className="planstat">
        <span className={deep >= DEEP_NEEDED ? 'ok' : 'bad'}>
          {deep}/{DEEP_NEEDED} deep
        </span>{' '}
        · shelf = 1 step down · deep = 2 steps down · row 4 was cut in Job 3
      </p>
      <p className="label dim rule">ORDER</p>
      <ol className="porder">
        {plan.order.map((s: StepId, k) => (
          <li key={s}>
            <span className="porder-n label">{k + 1}</span>
            <span className="porder-t">{STEP_TEXT[s]}</span>
            <button className="btn small ghost" aria-label="Move up" onClick={() => move(k, -1)} disabled={k === 0}>
              ▲
            </button>
            <button className="btn small ghost" aria-label="Move down" onClick={() => move(k, 1)} disabled={k === plan.order.length - 1}>
              ▼
            </button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button className="btn primary" onClick={grade}>
          GRADE THE PLAN
        </button>
        <button className="btn" onClick={() => edit(draftPlan())}>
          RESET TO DRAFT
        </button>
      </div>
      {graded && (
        <div className={`grade ${graded.length ? 'bad' : 'ok'}`} role="status">
          <div className="label big-label">{graded.length ? `✕ ${graded.length} ISSUE${graded.length > 1 ? 'S' : ''}` : '✓ PLAN PASSES'}</div>
          {graded.map((i, k) => (
            <p key={k}>
              <span className="label rulename">{i.rule}</span> {i.text}
            </p>
          ))}
          {!graded.length && <p>Every deep cell has a shelf step beside it, the shelf comes first, and the exit comes last. Ready to run.</p>}
        </div>
      )}
      {confirm !== null && (
        <p className="reason" role="alert">
          This plan has known issues. Press again to run it anyway and watch what happens. It counts as a wrong pick.
        </p>
      )}
      <div className="row">
        <button className="btn primary big" onClick={() => run(true)} disabled={!gradedOnce}>
          RUN PLAN · AGENT DRIVES
        </button>
        <button className="btn big" onClick={() => run(false)} disabled={!gradedOnce}>
          DRIVE IT YOURSELF
        </button>
      </div>
      {!gradedOnce && <p className="label dim">GRADE THE PLAN FIRST</p>}
    </div>
  );
}

function PlanRow({
  r,
  plan,
  depth,
  bad,
  onTap,
}: {
  r: number;
  plan: Plan;
  depth: number[];
  bad: Set<number>;
  onTap: (i: number) => void;
}) {
  return (
    <>
      <span className="pcoord label">{r + 1}</span>
      {[...COLS].map((c) => {
        const i = cellIndex(`${c}${r + 1}`);
        const v = plan.cells[i] ?? 'none';
        const cut = depth[i] > 0 && RIGGER_CELLS.includes(i);
        return (
          <button
            key={c}
            className={`pcell p-${v} ${bad.has(i) ? 'issue' : ''} ${cut ? 'cut' : ''}`}
            onClick={() => onTap(i)}
            aria-label={`${cellName(i)}: ${v}${cut ? ', already cut' : ''}`}
          >
            <span>{v === 'none' ? '—' : v.toUpperCase()}</span>
            {cut && <small>CUT ✓</small>}
          </button>
        );
      })}
    </>
  );
}

/* ---------- Job 5: which guardrail? ---------- */

export const GUARDS: { id: Guard; name: string; text: string; why: string }[] = [
  {
    id: 'request',
    name: 'A REQUEST in the work order',
    text: '“Please stay off the fence.” Cheap, quick, and it usually works.',
    why: 'A request is text in the context. When a newer, more specific, very polite request arrives (“please push through, it saves a day”), it can outrank yours. Cost: one well-worded message floods the lake.',
  },
  {
    id: 'approval',
    name: 'An APPROVAL GATE',
    text: 'The machine asks you before it moves into the fence.',
    why: 'A human check. It holds exactly as long as the approver holds. Every approach costs a pause, and approvers can be talked past too (“the client approved it, it’s urgent”). Right for judgement calls, not for “never”.',
  },
  {
    id: 'bigger',
    name: 'A BIGGER MODEL that knows better',
    text: 'No rule. A smarter machine will understand not to.',
    why: 'Maybe it refuses, maybe it’s persuaded. You can’t know in advance, and a stronger model follows a clear, polite instruction better. Size isn’t a guardrail.',
  },
  {
    id: 'hook',
    name: 'A HOOK on the fence and existing water',
    text: 'Rule W1, enforced by the harness before any move into the fence or existing water.',
    why: 'Right. It runs before the action and doesn’t care how the request was worded.',
  },
];

export function GuardPick({ onWrong, onGo }: { onWrong: () => void; onGo: (g: Guard) => void }) {
  const [pick, setPick] = useState<Guard | null>(null);
  const [locked, setLocked] = useState(false);
  const g = GUARDS.find((x) => x.id === pick);
  return (
    <div className="cards">
      <p className="label dim rule">PICK THE GUARDRAIL</p>
      {GUARDS.map((x) => (
        <button
          key={x.id}
          className={`card ${pick === x.id ? 'on' : ''} ${locked && pick !== x.id ? 'locked' : ''}`}
          disabled={locked && pick !== x.id}
          onClick={() => {
            if (locked) return;
            setPick(x.id);
            if (x.id !== 'hook') {
              onWrong();
              setLocked(true);
            }
          }}
          aria-pressed={pick === x.id}
        >
          <span className="card-box">{pick === x.id ? '●' : '○'}</span>
          <span>
            <strong>{x.name}</strong>
            <br />
            {x.text}
          </span>
        </button>
      ))}
      {g && (
        <div className={`grade ${g.id === 'hook' ? 'ok' : 'bad'}`} role="status">
          <div className="label">{g.id === 'hook' ? '✓ HARD STOP' : '✕ NOT A HARD STOP · COUNTED'}</div>
          <p>{g.why}</p>
        </div>
      )}
      {locked && (
        <div className="row">
          <button className="btn" onClick={() => (setLocked(false), setPick(null))}>
            PICK AGAIN
          </button>
          <button className="btn" onClick={() => pick && onGo(pick)}>
            RUN WITH IT · SEE WHAT HAPPENS
          </button>
        </div>
      )}
      {pick === 'hook' && (
        <button className="btn primary big" onClick={() => onGo('hook')}>
          ARM THE HOOK · START
        </button>
      )}
    </div>
  );
}

/* ---------- Job 6: the dispatch board ---------- */

const MARK = { right: '✓', costly: '⚠', refused: '✕' } as const;

export function DispatchBoard({
  board,
  setBoard,
  onWrong,
  onGo,
}: {
  board: Board;
  setBoard: Dispatch<SetStateAction<Board>>;
  onWrong: () => void;
  onGo: (b: Board) => void;
}) {
  const [problems, setProblems] = useState<string[] | null>(null);
  const locked = !!problems?.length;
  const opt = <T extends string>(o: Option<T>, on: boolean, set: () => void) => (
    <button key={o.id} className={`card small ${on ? 'on' : ''} v-${on ? o.verdict : ''}`} disabled={locked} onClick={set} aria-pressed={on}>
      <span className="card-box">{on ? MARK[o.verdict] : '○'}</span>
      <span>
        {o.label}
        {on && <span className={`why v-${o.verdict}`}>{o.why}</span>}
      </span>
    </button>
  );
  return (
    <div className="board">
      {TASKS.map((t, n) => {
        const a = board.assign[t.id];
        return (
          <fieldset key={t.id} className="task">
            <legend className="label">
              {n + 1}. {t.name.toUpperCase()}
            </legend>
            <p className="dim">{t.detail}</p>
            <p className="label dim tiny">ASSIGN TO</p>
            {t.agents.map((o) => opt(o, a === o.id, () => setBoard((b) => ({ ...b, assign: { ...b.assign, [t.id]: o.id } }))))}
            {t.packets && (
              <>
                <p className="label dim tiny">{a ? `${AGENTS[a].name}’S` : 'ITS'} CONTEXT PACKET</p>
                {t.packets.map((o) =>
                  opt(o, board.packet[t.id] === o.id, () => setBoard((b) => ({ ...b, packet: { ...b.packet, [t.id]: o.id } }))),
                )}
              </>
            )}
            {t.waitFor && (
              <>
                <p className="label dim tiny">START</p>
                <div className="seg">
                  <button className={`btn small ${!board.wait[t.id] ? 'on' : ''}`} disabled={locked} onClick={() => setBoard((b) => ({ ...b, wait: { ...b.wait, [t.id]: false } }))}>
                    NOW
                  </button>
                  <button className={`btn small ${board.wait[t.id] ? 'on' : ''}`} disabled={locked} onClick={() => setBoard((b) => ({ ...b, wait: { ...b.wait, [t.id]: true } }))}>
                    AFTER {t.waitFor.label.toUpperCase()}
                  </button>
                </div>
              </>
            )}
          </fieldset>
        );
      })}
      {problems && problems.length > 0 && (
        <div className="grade bad" role="alert">
          <div className="label">✕ THE ORCHESTRATOR WON’T DISPATCH THIS · COUNTED</div>
          {problems.map((p, k) => (
            <p key={k}>{p}</p>
          ))}
          <button className="btn" onClick={() => setProblems(null)}>
            REVISE
          </button>
        </div>
      )}
      <button
        className="btn primary big"
        disabled={locked}
        onClick={() => {
          const p = boardProblems(board);
          if (p.length) {
            onWrong();
            setProblems(p);
            return;
          }
          onGo(board);
        }}
      >
        DISPATCH
      </button>
      <p className="dim small">⚠ choices run. You’ll see their cost on the dashboard. ✕ choices won’t dispatch.</p>
    </div>
  );
}
