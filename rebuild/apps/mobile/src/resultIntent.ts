import type { Result } from '@fitquest-rebuild/contracts';
import { EditorCoordinator, type EditorStamp, type EditorState } from './editor';

export type ResultIntent<Form> = { form: Form; result: Result; operationId: string; sessionId: string; activityId: string };

/** A retry of the same visible input carries the original fact and operation identity. */
export function chooseResultIntent<Form>(prior: ResultIntent<Form> | null, form: Form, result: Result, operationId: string, sessionId: string, activityId: string): ResultIntent<Form> {
  return prior && prior.sessionId === sessionId && prior.activityId === activityId && JSON.stringify(prior.form) === JSON.stringify(form)
    ? prior : { form, result, operationId, sessionId, activityId };
}

/** UI submission boundary: persist identity first, then commit, then let the caller read back. */
export async function submitResultIntent<Form>(editor: EditorCoordinator, intent: ResultIntent<Form>, writeDraft: (key: string, raw: string, sequence: number) => Promise<number>, feedback: (state: EditorState, stamp: EditorStamp, error?: unknown) => void, commitAndRead: (intent: ResultIntent<Form>, stamp: EditorStamp) => Promise<void>): Promise<EditorStamp> {
  const stamp = await editor.persist(JSON.stringify(intent), writeDraft, feedback);
  await commitAndRead(intent, stamp);
  return stamp;
}
