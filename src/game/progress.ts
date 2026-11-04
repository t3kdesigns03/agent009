import { JOB_ORDER, type JobId } from './levels';

export const STORAGE_KEY = 'agent009-v1';

export interface Progress {
  cleared: JobId[];
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cleared: [] };
    const p = JSON.parse(raw) as Partial<Progress>;
    const cleared = Array.isArray(p.cleared) ? p.cleared.filter((j): j is JobId => JOB_ORDER.includes(j)) : [];
    return { cleared };
  } catch {
    return { cleared: [] };
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
