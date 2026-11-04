// Progress lives in the browser. No account, no server.
// The key and the `cleared` list are the same as v1, so earlier unlocks carry over.
import { JOB_ORDER, prevJob, type JobId } from './ids';
import { canonicalAfter, packSnap, unpackSnap, type Snapshot, type StoredSnapshot } from './snapshot';

export const STORAGE_KEY = 'agent009-v1';

export interface Progress {
  cleared: JobId[];
  /** The site as each job left it: the next job starts from here. */
  site: Partial<Record<JobId, StoredSnapshot>>;
  /** Best efficiency score per job. */
  best: Partial<Record<JobId, number>>;
}

const empty = (): Progress => ({ cleared: [], site: {}, best: {} });

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<Progress>;
    const cleared = Array.isArray(p.cleared) ? p.cleared.filter((j): j is JobId => JOB_ORDER.includes(j)) : [];
    const site = p.site && typeof p.site === 'object' ? p.site : {};
    const best = p.best && typeof p.best === 'object' ? p.best : {};
    return { cleared, site, best };
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* private mode: play on without saving */
  }
}

export function isUnlocked(p: Progress, job: JobId): boolean {
  const i = JOB_ORDER.indexOf(job);
  return i === 0 || p.cleared.includes(JOB_ORDER[i - 1]);
}

/** Where a job starts: how the previous job left the site, or a careful learner's version of it. */
export function startSnapshot(p: Progress, job: JobId): Snapshot {
  const prev = prevJob(job);
  if (!prev) return canonicalAfter(null);
  const stored = p.site[prev];
  return (stored && unpackSnap(stored)) || canonicalAfter(prev);
}

export function recordClear(p: Progress, job: JobId, snap: Snapshot, score: number): Progress {
  return {
    cleared: p.cleared.includes(job) ? p.cleared : [...p.cleared, job],
    site: { ...p.site, [job]: packSnap(snap) },
    best: { ...p.best, [job]: Math.max(score, p.best[job] ?? 0) },
  };
}
