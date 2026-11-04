import { JOBS } from '../game/content';
import { JOB_ORDER, type JobId } from '../game/ids';
import { BLOCKS, GLOSSARY, HARNESS, type BlockId, type Stage } from '../game/vocab';

/** The agent stack, with the blocks a job teaches lit up. */
export function StackDiagram({ lit, cleared = [] }: { lit?: BlockId[]; cleared?: JobId[] }) {
  const jobsFor = (b: BlockId) => JOB_ORDER.filter((j) => JOBS[j].blocks.includes(b) && b !== 'harness');
  const stack = BLOCKS.filter((b) => b.id !== 'harness').slice().reverse();
  return (
    <div className="stack" aria-label="The agent stack">
      <div className={`stack-harness ${lit?.includes('harness') ? 'lit' : ''}`}>
        <span className="label">HARNESS</span>
        <span className="stack-sub">runs every block below, in a loop</span>
      </div>
      {stack.map((b) => {
        const on = lit ? lit.includes(b.id) : false;
        return (
          <div key={b.id} className={`stack-block b-${b.id} ${on ? 'lit' : ''} ${lit && !on ? 'dim' : ''}`}>
            <div className="stack-head">
              <span className="label">{b.name}</span>
              <span className="stack-jobs">
                {jobsFor(b.id).map((j) => (
                  <span key={j} className={`jobchip ${cleared.includes(j) ? 'done' : ''}`}>
                    {JOBS[j].num} {JOBS[j].name}
                  </span>
                ))}
              </span>
            </div>
            <div className="stack-scene">{b.scene}</div>
            <div className="stack-agent">{b.agent}</div>
          </div>
        );
      })}
    </div>
  );
}

/** The harness loop as a ring. `now` lights the stage that's running. */
export function HarnessRing({ now, size = 260 }: { now?: Stage; size?: number }) {
  const r = size * 0.36;
  const c = size / 2;
  return (
    <svg className="ring" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Harness loop: perceive, plan, act, observe, check, repeat or hand off">
      <defs>
        <marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="4 5" />
      {HARNESS.map((s, i) => {
        const a = (i / HARNESS.length) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        const on = now === s.id;
        return (
          <g key={s.id} className={on ? 'on' : ''}>
            <circle cx={x} cy={y} r={size * 0.1} className="ring-node" />
            <text x={x} y={y + 1} className="ring-text" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.048}>
              {s.name.split(' ')[0].toUpperCase()}
            </text>
          </g>
        );
      })}
      <text x={c} y={c - 8} textAnchor="middle" className="ring-core" fontSize={size * 0.06}>
        HARNESS
      </text>
      <text x={c} y={c + 10} textAnchor="middle" className="ring-sub" fontSize={size * 0.042}>
        context + memory
      </text>
      <text x={c} y={c + 24} textAnchor="middle" className="ring-sub" fontSize={size * 0.042}>
        carried every turn
      </text>
    </svg>
  );
}

/** A thin strip version for the HUD. */
export function HarnessStrip({ now }: { now: Stage }) {
  return (
    <ol className="hstrip label" aria-label={`Harness loop, now: ${now}`}>
      {HARNESS.map((s) => (
        <li key={s.id} className={now === s.id ? 'on' : ''}>
          {s.id === 'handoff' ? 'REPEAT' : s.name.toUpperCase()}
        </li>
      ))}
    </ol>
  );
}

export function Glossary() {
  return (
    <dl className="gloss">
      {GLOSSARY.map((g) => (
        <div key={g.term} className="gloss-row">
          <dt className="label">{g.term}</dt>
          <dd>
            <span className="gloss-scene">{g.scene}</span>
            <span className="gloss-agent">→ {g.agent}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
