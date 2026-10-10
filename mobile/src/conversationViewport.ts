// Keep the latest question and composer together when they fit. For long questions,
// keep the composer reachable and let the single outer scroll view expose the rest.
export function visibleAnswerOffset(
  current: number,
  viewport: number,
  composerTop: number,
  composerHeight: number,
  questionTop: number,
) {
  const gap = 12;
  const minimum = Math.max(0, composerTop + composerHeight + gap - viewport);
  const maximum = Math.max(minimum, questionTop - gap);
  return Math.max(minimum, Math.min(current, maximum));
}
