import assert from 'node:assert/strict';
import test from 'node:test';
import { birthdayAge } from '../../shared/profileBirthday.js';

test('birthday validation uses real calendar dates and UTC birthday boundaries', () => {
  for (const value of [
    null,
    29,
    '',
    '0000-01-01',
    '2026-02-30',
    '2025-02-29',
    '2001-13-01',
    '1997-1-1',
    '9999-01-01',
    '1800-01-01',
  ])
    assert.equal(birthdayAge(value, new Date('2026-10-10T12:00:00Z')), null);
  assert.equal(birthdayAge('2008-10-11', new Date('2026-10-10T23:59:59Z')), 17);
  assert.equal(birthdayAge('2008-10-11', new Date('2026-10-11T00:00:00Z')), 18);
  assert.equal(birthdayAge('2000-02-29', new Date('2025-02-28T12:00:00Z')), 24);
  assert.equal(birthdayAge('2000-02-29', new Date('2025-03-01T00:00:00Z')), 25);
  assert.equal(birthdayAge('2026-10-10', new Date('2026-10-10T12:00:00Z')), 0);
});
