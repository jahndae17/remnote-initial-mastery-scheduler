import { ContractError, OWNER, isRating, isSuccess, step, type DurableState, type Receipt, type Review, type SessionAnchor, type Progress } from './types';

export function reviewKey(review: Review) { return JSON.stringify([review.date, review.score, !!review.isCram]); }
export function keys(history: Review[]) { return history.map(reviewKey); }
export function ordinary(review: Review) {
  const metadata = review.pluginData?.[OWNER] as { excluded?: boolean; acceptedEarly?: boolean } | undefined;
  return (!review.isCram || metadata?.acceptedEarly === true) && !metadata?.excluded && isRating(review.score);
}
/** Native early-practice flags must not prevent completing a learning target. */
export function learningTarget(history: Review[], cardId: string): 'mastery' | 'confirmation' | undefined {
  const receipt = latestReceipt(history, cardId);
  if (receipt) return receipt.state.phase === 'mastery' ? 'mastery' : receipt.state.pending ? 'confirmation' : undefined;
  return history.slice(resetIndex(history) + 1).some(ordinary) ? undefined : 'mastery';
}
export function resetIndex(history: Review[]) {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].score === 3) return i;
  return -1;
}
// Change detection, not a security primitive. Two independent accumulators keep
// receipts compact without embedding a complete copy of every prior review.
export function lineage(history: Review[]): string {
  let a = 2166136261, b = 5381;
  for (const ch of JSON.stringify(keys(history))) {
    a = Math.imul(a ^ ch.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ ch.charCodeAt(0);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${history.length}`;
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function validState(value: unknown): value is DurableState {
  if (!value || typeof value !== 'object') return false;
  const s = value as DurableState;
  if (s.phase === 'mastery') return !s.fsrs && !s.pending && s.boundary === undefined;
  if (s.phase !== 'srs' || !['graduated', 'existing'].includes(s.origin || '') || !Number.isInteger(s.boundary) || s.boundary! < 0 || !s.fsrs) return false;
  const c = s.fsrs;
  if (!['due','stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses','state'].every(k => finite(c[k as keyof typeof c]))) return false;
  if (c.stability < 0 || c.difficulty < 0 || c.difficulty > 10 || c.reps < 0 || ![0,1,2,3].includes(c.state)) return false;
  if (c.last_review !== undefined && !finite(c.last_review)) return false;
  return !s.pending || (Number.isInteger(s.pending.firstReview) && s.pending.firstReview >= 0 && finite(s.pending.intervalMs) && s.pending.intervalMs > 0);
}
export function receiptAt(history: Review[], index: number, cardId: string): Receipt | undefined {
  const raw = history[index]?.pluginData?.[OWNER];
  if (raw === undefined) return;
  const r = raw as Receipt;
  if ((raw as { excluded?: boolean })?.excluded === true) return;
  if (!r || r.schema !== 1 || r.cardId !== cardId || r.reviewIndex !== index ||
      !['mastery','confirmation'].includes(r.attempt) || !['repeat','graduated','confirmed'].includes(r.outcome) ||
      (r.acceptedEarly !== undefined && r.acceptedEarly !== true) ||
      !finite(r.nextDate) || !validState(r.state) || r.lineage !== lineage(history.slice(0, index + 1))) {
    throw new ContractError('Saved scheduler metadata is invalid or its review history changed. Inspect this card before continuing.');
  }
  if (r.state.boundary !== undefined && (r.state.boundary > index || r.state.boundary <= resetIndex(history.slice(0, index + 1)))) throw new ContractError('Invalid graduation/adoption boundary.');
  if (r.state.pending && (r.state.pending.firstReview > index || r.state.pending.firstReview < r.state.boundary!)) throw new ContractError('Invalid pending review cycle.');
  return r;
}
export function latestReceipt(history: Review[], cardId: string): Receipt | undefined {
  const reset = resetIndex(history);
  for (let i = history.length - 1; i > reset; i--) {
    if (!ordinary(history[i])) continue;
    const receipt = receiptAt(history, i, cardId); if (receipt) return receipt;
  }
}
export function sessionStart(history: Review[], anchor: SessionAnchor): number {
  const current = keys(history); let same = 0;
  while (same < anchor.reviewKeys.length && same < current.length && anchor.reviewKeys[same] === current[same]) same++;
  return Math.max(same, resetIndex(history) + 1);
}
export function progressFromHistory(history: Review[], cardId: string, anchor: SessionAnchor, state?: DurableState): Progress {
  const progress = { mastery: 0, confirmation: 0 };
  const start = sessionStart(history, anchor);
  for (let i = start; i < history.length; i++) {
    const review = history[i]; if (!ordinary(review)) continue;
    const receipt = receiptAt(history, i, cardId); if (!receipt) continue;
    if (receipt.attempt === 'mastery') progress.mastery = step(progress.mastery, review.score, 5);
    else if (state?.pending && i >= state.pending.firstReview) progress.confirmation = step(progress.confirmation, review.score, 2);
  }
  return progress;
}
export function correctAfterBoundary(history: Review[], state: DurableState): number {
  if (state.phase !== 'srs' || state.boundary === undefined) return 0;
  const start = state.boundary + (state.origin === 'graduated' ? 1 : 0);
  return history.slice(start).filter(r => ordinary(r) && isSuccess(r.score)).length;
}
