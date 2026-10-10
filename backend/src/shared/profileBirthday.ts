// Calendar dates use UTC boundaries on both client and server, independent of device timezone.
// February 29 birthdays reach the next age on March 1 in non-leap years.
export function birthdayAge(birthday: unknown, now = new Date()): number | null {
  if (typeof birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const date = new Date(`${birthday}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== birthday ||
    birthday.slice(0, 4) === '0000'
  )
    return null;
  const today = now.toISOString().slice(0, 10);
  if (birthday > today) return null;
  const age =
    now.getUTCFullYear() - date.getUTCFullYear() - (today.slice(5) < birthday.slice(5) ? 1 : 0);
  return age >= 0 && age <= 130 ? age : null;
}

export const profileGenders = ['Male', 'Female'] as const;
