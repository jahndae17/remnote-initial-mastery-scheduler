import { keys, latestReceipt, receiptAt, resetIndex } from '../domain/history';
import { schedule, status, type ScheduleResult } from '../domain/engine';
import { ContractError, OWNER, type MemoryScheduler, type Review, type SessionAnchor, type StatusView } from '../domain/types';

export type Mode = 'normal' | 'practice-all' | 'in-order' | 'unknown';
export type Snapshot = { cardId: string; history: Review[]; revision: string; enabled: boolean; due?: number };
const same = (a: Review[], b: Review[]) => JSON.stringify(keys(a)) === JSON.stringify(keys(b));
/** All session ownership lives here. Native history, not callback invocations,
 * is the source of progress. No timer or browser-focus event ends a session. */
export class SessionCoordinator {
  kb?: string;
  active = false;
  generation = 0;
  mode: Mode = 'unknown';
  private anchors = new Map<string, SessionAnchor>();
  private adopted = new Set<string>();
  private proposals = new Map<string, Map<string, ScheduleResult>>();
  constructor(private memory: MemoryScheduler) {}
  begin(kb: string) {
    if (this.active && this.kb === kb) return;
    this.end(); this.kb = kb; this.active = true;
  }
  end() {
    this.generation++; this.active = false; this.kb = undefined; this.mode = 'unknown';
    this.anchors.clear(); this.adopted.clear(); this.proposals.clear();
  }
  forget(cardId: string) { this.anchors.delete(cardId); this.adopted.delete(cardId); this.proposals.delete(cardId); }
  observe(snapshot: Snapshot): StatusView {
    const anchor = this.anchor(snapshot);
    const latest = snapshot.history.at(-1);
    // A saved rating that matches a preview must include the scheduler receipt.
    // Otherwise adopting it as an existing SRS card would falsely graduate it.
    const expected = this.proposals.get(snapshot.cardId)?.get(JSON.stringify(keys(snapshot.history)));
    if (expected && !latest?.pluginData?.[OWNER]) throw new ContractError('Saved review omitted pluginData; scheduler integration is blocked.');
    return status(snapshot.history, snapshot.cardId, anchor, this.adopted.has(snapshot.cardId));
  }
  private anchor(s: Snapshot): SessionAnchor {
    if (!this.active) throw new ContractError('No active review session.');
    if (!s.enabled) { this.forget(s.cardId); throw new ContractError('Card is deleted or disabled.'); }
    let anchor = this.anchors.get(s.cardId);
    if (!anchor || anchor.contentRevision !== s.revision) {
      anchor = { reviewKeys: keys(s.history), contentRevision: s.revision };
      this.anchors.set(s.cardId, anchor); this.proposals.delete(s.cardId);
    }
    return anchor;
  }
  calculate(snapshot: Snapshot, callbackHistory: Review[]): ScheduleResult {
    const anchor = this.anchor(snapshot);
    const candidate = callbackHistory.at(-1);
    if (!candidate) throw new ContractError('Scheduler callback has no candidate rating.');
    // Mode belongs to this calculation, not to the session: the host can ask
    // for non-cram button previews and then submit a cram rating for one card.
    const mode = this.mode === 'unknown' && candidate.isCram === false ? 'normal' : this.mode;
    // The live host can provide a one-entry cram history even when native
    // history contains older reviews. Exclusion needs no history reconstruction
    // or normal-mode inference: return the saved due date without learning.
    if (candidate.isCram === true || mode === 'practice-all' || mode === 'in-order') {
      if (snapshot.due === undefined || !Number.isFinite(snapshot.due)) throw new ContractError('Cannot preserve an unknown due date during excluded practice.');
      return { nextDate: snapshot.due, pluginData: { ...candidate.pluginData, [OWNER]: { schema: 1, excluded: true } } };
    }
    // Scheduling ignores entries through the last reset, but native history
    // retains them. Restore that exact prefix only when the remaining history
    // matches in full; arbitrary truncations or omissions are still rejected.
    const reset = resetIndex(snapshot.history);
    const lifetime = snapshot.history.slice(reset + 1);
    if (reset >= 0 && (same(callbackHistory, lifetime) || same(callbackHistory.slice(0, -1), lifetime))) {
      callbackHistory = [...snapshot.history.slice(0, reset + 1), ...callbackHistory];
    }
    // Replay of an already saved call returns its exact prior result.
    if (same(callbackHistory, snapshot.history)) {
      const saved = receiptAt(snapshot.history, snapshot.history.length - 1, snapshot.cardId);
      if (saved) return { nextDate: saved.nextDate, pluginData: snapshot.history.at(-1)!.pluginData! };
      throw new ContractError('Callback arrived after saving without a receipt. This host callback contract needs validation.');
    }
    if (!same(callbackHistory.slice(0, -1), snapshot.history)) throw new ContractError('Callback does not append exactly one rating to saved history.');
    if (mode === 'unknown') throw new ContractError('Queue mode is unknown and the candidate has no explicit non-cram flag.');
    this.observe(snapshot);
    this.adopted.add(snapshot.cardId);
    const cacheKey = JSON.stringify(keys(callbackHistory));
    let cache = this.proposals.get(snapshot.cardId);
    if (!cache) { cache = new Map(); this.proposals.set(snapshot.cardId, cache); }
    // Native UI can ask for the same rating repeatedly. Memoization also avoids
    // duplicate FSRS work; neither a cache hit nor a miss commits progress.
    const cached = cache.get(cacheKey); if (cached) return structuredClone(cached);
    const result = schedule({ cardId: snapshot.cardId, history: [...snapshot.history, candidate], anchor, mode }, this.memory);
    cache.set(cacheKey, structuredClone(result));
    // Only current previews and recent uncertain writes need retaining.
    if (cache.size > 16) cache.delete(cache.keys().next().value!);
    return result;
  }
  get size() { return this.anchors.size; }
}
