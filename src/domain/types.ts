export const OWNER = 'initial_mastery_scheduler';
export const REPEAT_MS = 60_000;
export type Score = 0 | 0.5 | 1 | 1.5;
export type Review = { date: number; score: number; isCram?: boolean; pluginData?: Record<string, unknown> };
export type MemoryCard = {
  due: number; stability: number; difficulty: number; elapsed_days: number;
  scheduled_days: number; learning_steps: number; reps: number; lapses: number;
  state: number; last_review?: number;
};
export type PendingCycle = { firstReview: number; intervalMs: number };
export type DurableState = {
  phase: 'mastery' | 'srs'; origin?: 'graduated' | 'existing';
  boundary?: number; fsrs?: MemoryCard; pending?: PendingCycle;
};
export type Receipt = {
  schema: 1; cardId: string; lineage: string; reviewIndex: number;
  attempt: 'mastery' | 'confirmation'; outcome: 'repeat' | 'graduated' | 'confirmed';
  nextDate: number; state: DurableState;
  acceptedEarly?: true;
};
export type SessionAnchor = { reviewKeys: string[]; contentRevision: string };
export type Progress = { mastery: number; confirmation: number };
export type StatusView = {
  cardId: string; stage: 'mastery' | 'srs' | 'unmanaged' | 'error';
  origin?: 'graduated' | 'existing'; mastery: number; confirmation: number;
  correct: number; nextDate?: number; message: string; error?: string;
};
export interface MemoryScheduler {
  review(previous: MemoryCard | undefined, at: number, score: Score): MemoryCard;
}
export class ContractError extends Error {}
export function isRating(score: number): score is Score { return [0, 0.5, 1, 1.5].includes(score); }
export function isSuccess(score: number) { return score === 1 || score === 1.5; }
export function step(value: number, score: number, ceiling: number) {
  return Math.max(0, Math.min(ceiling, value + (isSuccess(score) ? 1 : -1)));
}
