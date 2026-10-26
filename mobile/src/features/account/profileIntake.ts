import { convertWeight, weightNumber, type WeightUnit } from './weightUnits.ts';
import { birthdayAge, profileGenders } from '../../../../backend/src/shared/profileBirthday.ts';
export type IntakeFields = {
  firstName: string;
  lastName: string;
  heightFeet: string;
  heightInches: string;
  birthday: string;
  weight: string;
  gender: string;
};

export type IntakePayload = {
  firstName: string;
  lastName: string;
  height: { value: number; unit: 'in' };
  birthday: string;
  weight: { value: number; unit: 'lb' };
  gender: string;
};

export function validateIntake(
  fields: IntakeFields,
  unit: WeightUnit = 'lb',
): { payload: IntakePayload } | { error: string } {
  const firstName = fields.firstName.trim();
  const lastName = fields.lastName.trim();
  const gender = fields.gender.trim();
  if (!firstName || firstName.length > 100)
    return { error: 'Enter a first name (1–100 characters).' };
  if (!lastName || lastName.length > 100) return { error: 'Enter a last name (1–100 characters).' };
  if (!/^\d+$/.test(fields.heightFeet.trim()) || !/^\d+$/.test(fields.heightInches.trim())) {
    return { error: 'Enter height in whole feet and inches, including 0 inches if needed.' };
  }
  const feet = Number(fields.heightFeet);
  const inches = Number(fields.heightInches);
  const height = feet * 12 + inches;
  if (inches > 11 || height < 1 || height > 120)
    return { error: 'Enter a height up to 10 feet; inches must be 0–11.' };
  const birthday = fields.birthday.trim();
  if (birthdayAge(birthday) === null)
    return { error: 'Choose a valid birthday, not in the future (up to age 130).' };
  const weight = convertWeight(Number(fields.weight), unit, 'lb');
  if (
    !/^\d+(\.\d+)?$/.test(fields.weight.trim()) ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 1500
  ) {
    return {
      error: `Enter weight greater than 0 and up to ${weightNumber(1500, 'lb', unit)} ${unit}.`,
    };
  }
  if (!profileGenders.some((option) => option === gender))
    return { error: 'Select Male or Female.' };
  return {
    payload: {
      firstName,
      lastName,
      height: { value: height, unit: 'in' },
      birthday,
      weight: { value: weight, unit: 'lb' },
      gender,
    },
  };
}

type IntakeFetcher = (
  url: string,
  options: {
    method: 'POST';
    headers: { 'Content-Type': string; Authorization: string };
    body: string;
    signal: AbortSignal;
  },
) => Promise<Pick<Response, 'status' | 'json'>>;

export async function submitIntake(
  apiUrl: string | undefined,
  payload: IntakePayload,
  signal: AbortSignal,
  token: string,
  fetcher: IntakeFetcher = fetch,
): Promise<{ success: true } | { error: string; sessionEnded?: true }> {
  let url: URL;
  try {
    if (!apiUrl) throw new Error();
    url = new URL(apiUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    url.pathname = `${url.pathname.replace(/\/$/, '')}/profile-intake`;
    url.search = '';
    url.hash = '';
  } catch {
    return { error: 'The backend URL is not configured correctly.' };
  }
  try {
    if (signal.aborted) throw new Error();
    if (!token) return { error: 'Sign in to save your profile.' };
    const response = await fetcher(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal,
    });
    if (signal.aborted) throw new Error();
    if (response.status === 401)
      return { error: 'Your session ended. Please sign in again.', sessionEnded: true };
    if (response.status === 400)
      return { error: 'The backend rejected these fields. Check your entries and try again.' };
    if (response.status === 404)
      return {
        error:
          'Profile submission is not available on the backend yet. Please try again after it is updated.',
      };
    if (response.status !== 200)
      return { error: 'The backend could not accept your data. Please try again.' };
    const body: unknown = await response.json();
    if (signal.aborted) throw new Error();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('message' in body) ||
      body.message !== 'User Data Saved'
    ) {
      return { error: 'The backend returned an unexpected response. Please try again.' };
    }
    return { success: true };
  } catch {
    return {
      error: signal.aborted
        ? 'Submission timed out. Please try again.'
        : 'Unable to reach the backend. Check your connection and try again.',
    };
  }
}

export type SavedProfile = Omit<IntakePayload, 'birthday'> & {
  age: number;
  birthday?: string | null;
  ageCapturedAt: string;
  updatedAt: string;
};
export function profileFields(profile: SavedProfile, unit: WeightUnit = 'lb'): IntakeFields {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    heightFeet: String(Math.floor(profile.height.value / 12)),
    heightInches: String(profile.height.value % 12),
    birthday: profile.birthday ?? '',
    weight: weightNumber(profile.weight.value, 'lb', unit),
    gender: profile.gender,
  };
}
export async function loadProfile(
  apiUrl: string | undefined,
  signal: AbortSignal,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<{ profile: SavedProfile | null } | { error: string; sessionEnded?: true }> {
  try {
    if (!apiUrl) throw new Error();
    const url = new URL(apiUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    url.pathname = `${url.pathname.replace(/\/$/, '')}/profile`;
    url.search = '';
    url.hash = '';
    if (!token || signal.aborted) throw new Error();
    const response = await fetcher(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (signal.aborted) throw new Error();
    if (response.status === 401)
      return { error: 'Your session ended. Please sign in again.', sessionEnded: true };
    if (response.status !== 200 || signal.aborted) throw new Error();
    const body: unknown = await response.json();
    if (signal.aborted || typeof body !== 'object' || body === null || !('profile' in body))
      throw new Error();
    if (body.profile === null) return { profile: null };
    const p = body.profile as SavedProfile;
    if (
      typeof p !== 'object' ||
      !p ||
      typeof p.firstName !== 'string' ||
      typeof p.lastName !== 'string' ||
      typeof p.gender !== 'string' ||
      !Number.isInteger(p.age) ||
      p.age < 0 ||
      p.age > 130 ||
      (p.birthday != null && birthdayAge(p.birthday) === null) ||
      !Number.isInteger(p.height?.value) ||
      p.height?.unit !== 'in' ||
      p.weight?.unit !== 'lb' ||
      typeof p.weight.value !== 'number' ||
      typeof p.ageCapturedAt !== 'string' ||
      typeof p.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(p.ageCapturedAt)) ||
      !Number.isFinite(Date.parse(p.updatedAt)) ||
      !p.firstName.trim() ||
      p.firstName.length > 100 ||
      !p.lastName.trim() ||
      p.lastName.length > 100 ||
      !p.gender.trim() ||
      p.gender.length > 100 ||
      p.height.value < 1 ||
      p.height.value > 120 ||
      p.weight.value <= 0 ||
      p.weight.value > 1500
    )
      throw new Error();
    return { profile: p };
  } catch {
    return {
      error: signal.aborted
        ? 'Profile loading timed out. Please retry.'
        : 'Unable to load your profile. Please retry.',
    };
  }
}
