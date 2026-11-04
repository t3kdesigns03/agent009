export type JobId = 'yoke' | 'survey' | 'rigger' | 'grade' | 'warden' | 'dispatch';
export const JOB_ORDER: JobId[] = ['yoke', 'survey', 'rigger', 'grade', 'warden', 'dispatch'];

export const prevJob = (j: JobId): JobId | null => {
  const i = JOB_ORDER.indexOf(j);
  return i > 0 ? JOB_ORDER[i - 1] : null;
};
export const nextJob = (j: JobId): JobId | null => JOB_ORDER[JOB_ORDER.indexOf(j) + 1] ?? null;
