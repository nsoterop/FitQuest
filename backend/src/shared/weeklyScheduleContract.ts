export const weeklyScheduleVersion = 'sunday-21-v1' as const;
export type WeeklySchedule = {
  enabled: boolean;
  revision: number;
  timeZone: string;
  enabledAt: string;
  lastWeek: string | null;
  error: string | null;
  autoEnrolled?: boolean;
};
export function validWeeklySchedule(s: unknown): s is WeeklySchedule {
  const v = s as WeeklySchedule;
  return (
    !!v &&
    typeof v.enabled === 'boolean' &&
    (v.autoEnrolled === undefined || typeof v.autoEnrolled === 'boolean') &&
    Number.isSafeInteger(v.revision) &&
    v.revision > 0 &&
    typeof v.timeZone === 'string' &&
    Number.isFinite(Date.parse(v.enabledAt)) &&
    (v.lastWeek === null || /^\d{4}-\d{2}-\d{2}$/.test(v.lastWeek)) &&
    (v.error === null || typeof v.error === 'string')
  );
}
