export type IntakeFields = {
  firstName: string;
  lastName: string;
  heightFeet: string;
  heightInches: string;
  age: string;
  weight: string;
  gender: string;
};

export type IntakePayload = {
  firstName: string;
  lastName: string;
  height: { value: number; unit: 'in' };
  age: number;
  weight: { value: number; unit: 'lb' };
  gender: string;
};

export function validateIntake(fields: IntakeFields): { payload: IntakePayload } | { error: string } {
  const firstName = fields.firstName.trim();
  const lastName = fields.lastName.trim();
  const gender = fields.gender.trim();
  if (!firstName || firstName.length > 100) return { error: 'Enter a first name (1–100 characters).' };
  if (!lastName || lastName.length > 100) return { error: 'Enter a last name (1–100 characters).' };
  if (!/^\d+$/.test(fields.heightFeet.trim()) || !/^\d+$/.test(fields.heightInches.trim())) {
    return { error: 'Enter height in whole feet and inches, including 0 inches if needed.' };
  }
  const feet = Number(fields.heightFeet);
  const inches = Number(fields.heightInches);
  const height = feet * 12 + inches;
  if (inches > 11 || height < 1 || height > 120) return { error: 'Enter a height up to 10 feet; inches must be 0–11.' };
  if (!/^\d+$/.test(fields.age.trim()) || Number(fields.age) < 1 || Number(fields.age) > 130) {
    return { error: 'Enter age as a whole number from 1 to 130.' };
  }
  const weight = Number(fields.weight);
  if (!/^\d+(\.\d+)?$/.test(fields.weight.trim()) || !Number.isFinite(weight) || weight <= 0 || weight > 1500) {
    return { error: 'Enter weight in pounds, greater than 0 and up to 1,500.' };
  }
  if (!gender || gender.length > 100) return { error: 'Enter gender (1–100 characters); “Prefer not to say” is accepted.' };
  return { payload: { firstName, lastName, height: { value: height, unit: 'in' },
    age: Number(fields.age), weight: { value: weight, unit: 'lb' }, gender } };
}

type IntakeFetcher = (url: string, options: {
  method: 'POST'; headers: { 'Content-Type': string }; body: string; signal: AbortSignal;
}) => Promise<Pick<Response, 'status' | 'json'>>;

export async function submitIntake(
  apiUrl: string | undefined,
  payload: IntakePayload,
  signal: AbortSignal,
  fetcher: IntakeFetcher = fetch,
): Promise<{ success: true } | { error: string }> {
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
    const response = await fetcher(url.toString(), { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
    if (signal.aborted) throw new Error();
    if (response.status === 400) return { error: 'The backend rejected these fields. Check your entries and try again.' };
    if (response.status === 404) return { error: 'Profile submission is not available on the backend yet. Please try again after it is updated.' };
    if (response.status !== 200) return { error: 'The backend could not accept your data. Please try again.' };
    const body: unknown = await response.json();
    if (signal.aborted) throw new Error();
    if (typeof body !== 'object' || body === null || !('message' in body) || body.message !== 'User Data Saved') {
      return { error: 'The backend returned an unexpected response. Please try again.' };
    }
    return { success: true };
  } catch {
    return { error: signal.aborted ? 'Submission timed out. Please try again.'
      : 'Unable to reach the backend. Check your connection and try again.' };
  }
}
