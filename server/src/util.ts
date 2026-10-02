import { randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();

// Даты прогнозов считаются по местному времени сервера (YYYY-MM-DD).
export const localDate = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (n: number, from: Date = new Date()): string => { const d = new Date(from); d.setDate(d.getDate() + n); return localDate(d); };
export const daysBetween = (fromIso: string, to: Date = new Date()): number => (to.getTime() - new Date(fromIso).getTime()) / 864e5;

// «Аружан Касымова» → «Аружан К.»: эксперт видит учеников без полных данных.
export const shortName = (name: string): string => {
  const [first, last] = name.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

export const nextPayoutDate = (days: readonly number[], from: Date = new Date()): string => {
  for (let m = 0; m < 2; m++) {
    for (const day of days) {
      const d = new Date(from.getFullYear(), from.getMonth() + m, day);
      if (localDate(d) > localDate(from)) return localDate(d);
    }
  }
  return localDate(from);
};
