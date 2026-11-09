export const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Epley estimate; only trusted up to 12 reps. */
export function e1rm(weightKg?: number | null, reps?: number | null): number | null {
  if (!weightKg || !reps || reps < 1 || reps > 12) return null;
  return reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 100) / 100;
}

export function ageYears(birthDate?: Date | null, at = new Date()): number | null {
  if (!birthDate) return null;
  let a = at.getFullYear() - birthDate.getFullYear();
  const m = at.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birthDate.getDate())) a--;
  return a;
}

export const ageBand = (age: number | null) =>
  age === null ? 'ANY' : age < 18 ? 'U18' : age <= 35 ? '18-35' : age <= 49 ? '36-49' : '50+';

export const cohortKey = (p: { level: string; sex: string | null; weightClass: string | null }, age: number | null) =>
  [p.level, p.sex ?? 'ANY', (p.weightClass ?? 'ANY').toUpperCase(), ageBand(age)].join('|');

export const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
