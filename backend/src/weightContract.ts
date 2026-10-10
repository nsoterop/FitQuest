import { foodDate, foodId, foodToday } from './foodContract.ts';
import { journalKeys, journalZone } from './journalContract.ts';
export type WeightMeasurement = {
  value: number;
  unit: 'lb' | 'kg';
  date: string;
  timeZone: string;
};
export type WeightEntry = {
  id: string;
  revision: number;
  measurement: WeightMeasurement | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type WeightList = { items: WeightEntry[]; nextOffset: number | null };
export type WeightCommand =
  | {
      operationId: string;
      kind: 'save';
      entryId: string | null;
      expectedRevision: number | null;
      measurement: WeightMeasurement;
    }
  | { operationId: string; kind: 'delete'; entryId: string; expectedRevision: number };
export type WeightReceipt = { id: string; entryId: string; revision: number };
const revision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export function validWeightMeasurement(v: unknown): v is WeightMeasurement {
  const m = v as WeightMeasurement;
  return (
    journalKeys(m, ['value', 'unit', 'date', 'timeZone']) &&
    typeof m.value === 'number' &&
    Number.isFinite(m.value) &&
    m.value > 0 &&
    m.value <= 10000 &&
    ['lb', 'kg'].includes(m.unit) &&
    foodDate(m.date) &&
    journalZone(m.timeZone)
  );
}
export function validWeightCommand(v: unknown): v is WeightCommand {
  const c = v as WeightCommand;
  if (!c || !foodId(c.operationId)) return false;
  if (c.kind === 'delete')
    return (
      journalKeys(c, ['operationId', 'kind', 'entryId', 'expectedRevision']) &&
      foodId(c.entryId) &&
      revision(c.expectedRevision)
    );
  return (
    c.kind === 'save' &&
    journalKeys(c, ['operationId', 'kind', 'entryId', 'expectedRevision', 'measurement']) &&
    ((c.entryId === null && c.expectedRevision === null) ||
      (foodId(c.entryId) && revision(c.expectedRevision))) &&
    validWeightMeasurement(c.measurement)
  );
}
export function validWeightEntry(v: unknown): v is WeightEntry {
  const e = v as WeightEntry;
  return (
    journalKeys(e, ['id', 'revision', 'measurement', 'createdAt', 'updatedAt', 'deletedAt']) &&
    foodId(e.id) &&
    revision(e.revision) &&
    Number.isFinite(Date.parse(e.createdAt)) &&
    Number.isFinite(Date.parse(e.updatedAt)) &&
    (e.deletedAt === null
      ? validWeightMeasurement(e.measurement)
      : e.measurement === null && Number.isFinite(Date.parse(e.deletedAt)))
  );
}
export function validWeightList(v: unknown): v is WeightList {
  const l = v as WeightList;
  return (
    journalKeys(l, ['items', 'nextOffset']) &&
    Array.isArray(l.items) &&
    l.items.length <= 50 &&
    l.items.every((e) => validWeightEntry(e) && e.deletedAt === null) &&
    (l.nextOffset === null || (Number.isSafeInteger(l.nextOffset) && l.nextOffset > 0))
  );
}
export function validWeightReceipt(v: unknown): v is WeightReceipt {
  const r = v as WeightReceipt;
  return (
    journalKeys(r, ['id', 'entryId', 'revision']) &&
    foodId(r.id) &&
    foodId(r.entryId) &&
    revision(r.revision)
  );
}
export const weightToday = foodToday;
