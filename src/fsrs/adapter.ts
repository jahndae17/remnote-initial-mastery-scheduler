import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import type { MemoryCard, MemoryScheduler, Score } from '../domain/types';

export const FSRS_OPTIONS = Object.freeze({ request_retention: 0.9, enable_fuzz: false,
  enable_short_term: false, learning_steps: [] as const, relearning_steps: [] as const });
const ratings: Record<Score, Grade> = { 0: Rating.Again, 0.5: Rating.Hard, 1: Rating.Good, 1.5: Rating.Easy };
export function serialize(card: Card): MemoryCard {
  return { ...card, due: card.due.getTime(), last_review: card.last_review?.getTime() };
}
export function hydrate(card: MemoryCard): Card {
  return { ...card, due: new Date(card.due), last_review: card.last_review === undefined ? undefined : new Date(card.last_review) };
}
export class FsrsAdapter implements MemoryScheduler {
  private algorithm = fsrs(FSRS_OPTIONS);
  review(previous: MemoryCard | undefined, at: number, score: Score): MemoryCard {
    const card = previous ? hydrate(previous) : createEmptyCard(new Date(at));
    return serialize(this.algorithm.next(card, new Date(at), ratings[score]).card);
  }
}
