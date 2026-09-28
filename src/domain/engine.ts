import { correctAfterBoundary, latestReceipt, learningTarget, lineage, ordinary, progressFromHistory, resetIndex, sessionStart } from './history';
import { ContractError, OWNER, REPEAT_MS, isRating, isSuccess, step, type DurableState, type MemoryScheduler, type Receipt, type Review, type SessionAnchor, type StatusView } from './types';

export type ScheduleRequest = {
  cardId: string; history: Review[]; anchor: SessionAnchor; mode: 'normal' | 'practice-all' | 'in-order' | 'unknown'; due?: number;
};
export type ScheduleResult = { nextDate: number; pluginData: Record<string, unknown> };
function initialState(history: Review[], cardId: string, memory: MemoryScheduler): DurableState {
  const latest = latestReceipt(history, cardId);
  if (latest) return structuredClone(latest.state);
  const prior = history.slice(resetIndex(history) + 1).filter(ordinary);
  if (!prior.length) return { phase: 'mastery' };
  let fsrsState: DurableState['fsrs'];
  for (const r of prior) if (isRating(r.score)) fsrsState = memory.review(fsrsState, r.date, r.score);
  return { phase: 'srs', origin: 'existing', boundary: history.length, fsrs: fsrsState };
}
/** Pure speculation: the caller supplies a history whose last entry is the
 * proposed rating. This function never commits counters or writes a card. */
export function schedule(request: ScheduleRequest, memory: MemoryScheduler): ScheduleResult {
  const { cardId, history, anchor, mode } = request;
  const candidate = history.at(-1);
  if (!candidate || !isRating(candidate.score) || mode !== 'normal') throw new ContractError('Only eligible learning or normal-practice context can advance this scheduler.');
  if (!Number.isFinite(candidate.date)) throw new ContractError('Invalid review timestamp.');
  const prefix = history.slice(0, -1);
  const due = request.due !== undefined && Number.isFinite(request.due) && candidate.date >= request.due;
  if (candidate.isCram && !learningTarget(prefix, cardId) && !due) throw new ContractError('Extra practice after a completed learning target cannot advance this scheduler.');
  if (prefix.some(r => r.date > candidate.date)) throw new ContractError('Review history must be chronological.');
  const state = initialState(prefix, cardId, memory);
  const progress = progressFromHistory(prefix, cardId, anchor, state);
  const index = history.length - 1;
  let attempt: Receipt['attempt'] = state.phase === 'mastery' ? 'mastery' : 'confirmation';
  let outcome: Receipt['outcome'] = 'repeat';
  let nextDate = candidate.date + REPEAT_MS;
  if (state.phase === 'mastery') {
    if (step(progress.mastery, candidate.score, 5) === 5) {
      state.phase = 'srs'; state.origin = 'graduated'; state.boundary = index;
      state.fsrs = memory.review(undefined, candidate.date, candidate.score);
      nextDate = state.fsrs.due; outcome = 'graduated';
    }
  } else {
    if (!state.pending) {
      state.fsrs = memory.review(state.fsrs, candidate.date, candidate.score);
      state.pending = { firstReview: index, intervalMs: state.fsrs.due - candidate.date };
    }
    if (step(progress.confirmation, candidate.score, 2) === 2) {
      nextDate = candidate.date + state.pending.intervalMs;
      state.fsrs!.due = nextDate; // Preserve last_review: only the first rating informs FSRS.
      state.pending = undefined; outcome = 'confirmed';
    }
  }
  if (!Number.isFinite(nextDate) || nextDate <= candidate.date) throw new ContractError('FSRS did not return a future interval.');
  const receipt: Receipt = { schema: 1, cardId, reviewIndex: index, lineage: lineage(history), attempt, outcome, nextDate, state };
  if (candidate.isCram) receipt.acceptedEarly = true;
  return { nextDate, pluginData: { ...candidate.pluginData, [OWNER]: receipt } };
}
export function status(history: Review[], cardId: string, anchor: SessionAnchor, adopted = false): StatusView {
  const receipt = latestReceipt(history, cardId);
  if (!receipt && !adopted) return { cardId, stage: 'unmanaged', mastery: 0, confirmation: 0, correct: 0, message: 'This card has not yet used Initial Mastery + FSRS.' };
  const prior = history.slice(resetIndex(history) + 1).some(ordinary);
  const state: DurableState = receipt?.state || (prior ? { phase: 'srs', origin: 'existing', boundary: history.length } : { phase: 'mastery' });
  const progress = progressFromHistory(history, cardId, anchor, state);
  let message = '';
  if (receipt && receipt.reviewIndex >= sessionStart(history, anchor)) {
    const success = isSuccess(history[receipt.reviewIndex].score);
    if (receipt.outcome === 'graduated') message = 'Graduated · next SRS review scheduled';
    else if (receipt.outcome === 'confirmed') message = 'Confirmed · next SRS interval released';
    else message = `${success ? '+1' : '−1'} · ${state.phase === 'mastery' ? `Initial Mastery ${progress.mastery}/5` : `SRS confirmation ${progress.confirmation}/2`}`;
  }
  return { cardId, stage: state.phase, origin: state.origin,
    mastery: state.phase === 'srs' && state.origin === 'graduated' ? 5 : progress.mastery,
    confirmation: progress.confirmation, correct: correctAfterBoundary(history, state),
    nextDate: receipt?.nextDate, message };
}
