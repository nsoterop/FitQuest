import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleAnswerOffset } from './conversationViewport.ts';
test('keyboard shrink and multiline growth keep composer above keyboard and question visible when they fit', () => {
  assert.equal(visibleAnswerOffset(0, 700, 450, 48, 350), 0);
  const keyboard = visibleAnswerOffset(0, 350, 450, 48, 350);
  assert.equal(keyboard, 160);
  assert.ok(450 + 48 - keyboard < 350);
  assert.ok(350 - keyboard >= 0);
  const multiline = visibleAnswerOffset(keyboard, 350, 450, 150, 350);
  assert.equal(multiline, 262);
  assert.ok(450 + 150 - multiline < 350);
  assert.equal(visibleAnswerOffset(multiline, 350, 450, 150, 350), multiline);
});
test('long replies stay scrollable; an already-visible composer does not jump on unchanged layouts', () => {
  const long = visibleAnswerOffset(0, 350, 900, 48, 350);
  assert.equal(long, 610);
  assert.equal(visibleAnswerOffset(610, 350, 900, 48, 350), 610);
  assert.equal(visibleAnswerOffset(610, 700, 900, 48, 350), 338);
});
