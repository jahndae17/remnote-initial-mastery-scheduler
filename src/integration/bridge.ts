import { AppEvents, PageType_DUPE_1 as PageType, SchedulerExplanationType, SpecialPluginCallback, type RNPlugin, type SRSScheduleCardParams } from '@remnote/plugin-sdk';
import { SessionCoordinator, type Snapshot } from '../coordinator/session';
import { FsrsAdapter } from '../fsrs/adapter';
import { ContractError, OWNER } from '../domain/types';
import { latestReceipt, reviewKey } from '../domain/history';
import { inspectCallbackHistory } from './callback-shape';
import { VIEW_KEY, DIAGNOSTICS_KEY, type PanelSnapshot } from './view';
export { VIEW_KEY, DIAGNOSTICS_KEY } from './view';
import type { RemObject } from '@remnote/plugin-sdk/dist/name_spaces/rem';

const content = (rem: RemObject) => [rem._id, rem.text, rem.backText, rem.parent, rem.children, rem.type];

/** SDK boundary. No card writes or whole-knowledge-base enumeration. */
export class RemNoteBridge {
  readonly session = new SessionCoordinator(new FsrsAdapter());
  private timer?: ReturnType<typeof setInterval>;
  private refreshRunning = false;
  private refreshRequested = false;
  private fastTimers = new Set<ReturnType<typeof setTimeout>>();
  private snapshotReads = new Map<string, Promise<Snapshot>>();
  private contextRead?: Promise<string>;
  private sharedSnapshotReads = 0;
  private currentId?: string;
  private events: Record<string, number> = {};
  private callbackShapes: Record<string, number> = {};
  private callbackCalls = { scheduling: 0, queueMode: 0 };
  private callbackCramFlags = { true: 0, false: 0, missing: 0 };
  private lastCallback?: ReturnType<typeof inspectCallbackHistory>;
  private lastCallbackByCramFlag: Partial<Record<'true' | 'false' | 'missing', ReturnType<typeof inspectCallbackHistory>>> = {};
  private lastFailure?: { message: string; callback: ReturnType<typeof inspectCallbackHistory> | null };
  private lastSavedResult?: { stage: string; mastery: number; confirmation: number; correct: number; acceptedEarly: boolean; outcome: string };
  private cardErrors = new Map<string, string>();
  private pausedCards = new Set<string>();
  private normalCards = new Set<string>();
  private awaitingSave = new Map<string, { key: string; expires: number }>();
  private viewWrites: Promise<void> = Promise.resolve();
  private lastView?: string;
  private lastDiagnostics?: string;
  private diagnosticWrites: Promise<void> = Promise.resolve();
  private error = '';
  private stopped = false;
  private lastFeedback?: { cardId: string; message: string; expires: number; generation: number };
  private feedbackSeen = new Map<string, string>();
  private clearFeedback() { this.cancelFastRefresh(); this.snapshotReads.clear(); this.contextRead = undefined; this.awaitingSave.clear(); this.lastSavedResult = undefined; this.feedbackSeen.clear(); this.lastFeedback = undefined; this.cardErrors.clear(); this.pausedCards.clear(); this.normalCards.clear(); }
  private cancelFastRefresh() { for (const timer of this.fastTimers) clearTimeout(timer); this.fastTimers.clear(); this.refreshRequested = false; }
  private fastRefresh() {
    if (this.stopped || !this.session.active || this.fastTimers.size) return;
    const generation = this.session.generation;
    for (const delay of [80, 240, 560, 1200]) {
      const timer = setTimeout(() => {
        this.fastTimers.delete(timer);
        if (!this.stopped && generation === this.session.generation) void this.refresh();
      }, delay);
      this.fastTimers.add(timer);
    }
  }
  private writeView(value: PanelSnapshot): Promise<void> {
    const serialized = JSON.stringify(value);
    const write = this.viewWrites.then(async () => {
      if (serialized === this.lastView) return;
      await this.plugin.storage.setSession(VIEW_KEY, value);
      this.lastView = serialized;
    });
    this.viewWrites = write.catch(() => {});
    return write;
  }
  constructor(private plugin: RNPlugin) {}
  private snapshot(cardId: string): Promise<Snapshot> {
    const key = `${this.session.generation}:${cardId}`;
    const existing = this.snapshotReads.get(key);
    if (existing) { this.sharedSnapshotReads++; return existing; }
    const read = this.readSnapshot(cardId).finally(() => {
      if (this.snapshotReads.get(key) === read) this.snapshotReads.delete(key);
    });
    this.snapshotReads.set(key, read);
    return read;
  }
  private async readSnapshot(cardId: string): Promise<Snapshot> {
    const card = await this.plugin.card.findOne(cardId);
    // SDK 0.0.46 Card.getRem returns unwrapped transport data at runtime.
    // RemNamespace.findOne constructs the Rem object with practice/content methods.
    const rem = card ? await this.plugin.rem.findOne(card.remId) : undefined;
    if (!card || !rem) { this.session.forget(cardId); throw new ContractError('Card was deleted.'); }
    const [enabled, direction, children] = await Promise.all([
      rem.getEnablePractice(), rem.getPracticeDirection(), rem.getChildrenRem(),
    ]);
    const ancestry: unknown[] = []; let parentId = rem.parent; const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      if (seen.size >= 64) throw new ContractError('Card context exceeds the validated depth.');
      seen.add(parentId); const parent = await this.plugin.rem.findOne(parentId);
      if (!parent) break;
      ancestry.push([parent._id, parent.text, parent.backText]); parentId = parent.parent;
    }
    const directionEnabled = typeof card.type !== 'string' || direction === 'both' || direction === card.type;
    return { cardId, history: card.repetitionHistory || [], due: card.nextRepetitionTime,
      enabled: enabled && directionEnabled,
      revision: JSON.stringify([card.type, content(rem), children.map(content), ancestry]) };
  }
  private ensureContext(): Promise<string> {
    if (this.contextRead) return this.contextRead;
    const read = this.readContext().finally(() => { if (this.contextRead === read) this.contextRead = undefined; });
    this.contextRead = read;
    return read;
  }
  private async readContext() {
    const generation = this.session.generation;
    const [kb, onQueue] = await Promise.all([this.plugin.kb.getCurrentKnowledgeBaseData(), this.plugin.window.isOnPage(PageType.Queue)]);
    if (!kb?._id || !onQueue) {
      if (!this.stopped && generation === this.session.generation) {
        this.session.end(); this.currentId = undefined; this.clearFeedback();
        void this.writeView(null);
      }
      throw new ContractError('No active knowledge-base review queue.');
    }
    if (this.stopped || generation !== this.session.generation) throw new ContractError('Session changed during context lookup.');
    if (this.session.kb !== kb._id) { this.currentId = undefined; this.clearFeedback(); }
    this.session.begin(kb._id);
    return kb._id;
  }
  private async diagnostics() {
    const value = {
      build: '0.1.9-development', liveValidated: false, active: this.session.active,
      sharedSnapshotReads: this.sharedSnapshotReads,
      mode: this.session.mode, generation: this.session.generation,
      cardsObserved: this.session.size, events: this.events, callbackShapes: this.callbackShapes,
      callbackCalls: this.callbackCalls, lastCallback: this.lastCallback || null,
      callbackCramFlags: this.callbackCramFlags,
      lastCallbackByCramFlag: this.lastCallbackByCramFlag, lastFailure: this.lastFailure || null,
      lastSavedResult: this.lastSavedResult || null,
      lastError: this.error || null,
      contracts: ['Callback must match full history or history after the latest reset, plus one candidate', 'Initial Mastery accepts early ratings; completed SRS cycles exclude extra practice', 'Saved rating must retain returned pluginData'],
    };
    const serialized = JSON.stringify(value);
    const write = this.diagnosticWrites.then(async () => {
      if (serialized === this.lastDiagnostics) return;
      await this.plugin.storage.setSession(DIAGNOSTICS_KEY, JSON.parse(serialized));
      this.lastDiagnostics = serialized;
    });
    this.diagnosticWrites = write.catch(() => {});
    await write;
  }
  private async report(error: unknown, cardId = this.currentId || '') {
    this.error = error instanceof Error ? error.message : String(error);
    this.lastFailure = { message: this.error, callback: this.lastCallback || null };
    if (cardId) this.cardErrors.set(cardId, this.error);
    if (this.session.kb && cardId === this.currentId) await this.writeView({
      kb: this.session.kb, generation: this.session.generation, mode: this.session.mode,
      view: { cardId, stage: 'error', mastery: 0, confirmation: 0, correct: 0, message: '', error: this.error },
    } as PanelSnapshot);
    await this.diagnostics();
  }
  async calculate(args: SRSScheduleCardParams) {
    this.callbackCalls.scheduling++;
    try {
      await this.ensureContext();
      const generation = this.session.generation;
      if (!args.cardId) throw new ContractError('Scheduler did not provide a native card ID.');
      const snapshot = await this.snapshot(args.cardId);
      if (generation !== this.session.generation || this.stopped) throw new ContractError('Session ended during callback.');
      const shape = `callback:${args.history.length}-saved:${snapshot.history.length}`;
      this.callbackShapes[shape] = (this.callbackShapes[shape] || 0) + 1;
      this.lastCallback = inspectCallbackHistory(args.history, snapshot.history);
      this.callbackCramFlags[this.lastCallback.candidateIsCram as keyof typeof this.callbackCramFlags]++;
      this.lastCallbackByCramFlag[this.lastCallback.candidateIsCram as keyof typeof this.callbackCramFlags] = this.lastCallback;
      const result = this.session.calculate(snapshot, args.history);
      // Queue navigation can precede the history save. Keep a small bounded
      // set of recent candidates under observation rather than losing the old
      // card after the first (too-early) load-card refresh. Previews expire.
      this.awaitingSave.delete(snapshot.cardId);
      this.awaitingSave.set(snapshot.cardId, { key: reviewKey(args.history.at(-1)!), expires: Date.now() + 15000 });
      if (this.awaitingSave.size > 4) this.awaitingSave.delete(this.awaitingSave.keys().next().value!);
      const excluded = (result.pluginData[OWNER] as { excluded?: boolean })?.excluded === true;
      if (excluded) { this.pausedCards.add(snapshot.cardId); this.normalCards.delete(snapshot.cardId); }
      else { this.pausedCards.delete(snapshot.cardId); this.normalCards.add(snapshot.cardId); }
      this.cardErrors.delete(snapshot.cardId);
      this.error = [...this.cardErrors.values()].at(-1) || '';
      // Publish saved history, never a hypothetical callback result.
      await this.publish(snapshot);
      if (generation !== this.session.generation || this.stopped) throw new ContractError('Session ended during callback.');
      // Diagnostics are not needed for the host to commit its rating.
      void this.diagnostics().catch(() => {});
      this.fastRefresh();
      return { ...result, explanation: { type: SchedulerExplanationType.NormalRepetition, text: 'Initial Mastery + FSRS · development build' } };
    } catch (error) {
      // Closing the queue must not wait for a diagnostics write from stale work.
      if (this.session.active && !this.stopped) await this.report(error, args.cardId);
      throw error;
    }
  }
  private async publish(snapshot: Snapshot) {
    const view = this.session.observe(snapshot);
    const error = this.cardErrors.get(snapshot.cardId);
    if (error) {
      if (snapshot.cardId === this.currentId) await this.writeView({
        kb: this.session.kb!, generation: this.session.generation, mode: this.session.mode,
        view: { ...view, stage: 'error', error },
      } as PanelSnapshot);
      return;
    }
    const receipt = latestReceipt(snapshot.history, snapshot.cardId);
    const feedbackKey = `${this.session.generation}:${receipt?.lineage}`;
    if (receipt && view.message && this.feedbackSeen.get(snapshot.cardId) !== feedbackKey) {
      this.lastSavedResult = { stage: view.stage, mastery: view.mastery, confirmation: view.confirmation,
        correct: view.correct, acceptedEarly: receipt.acceptedEarly === true, outcome: receipt.outcome };
      this.feedbackSeen.set(snapshot.cardId, feedbackKey);
      this.lastFeedback = { cardId: snapshot.cardId, message: view.message, expires: Date.now() + 4500, generation: this.session.generation };
    }
    const previous = this.lastFeedback;
    const feedback = previous && previous.cardId !== snapshot.cardId && previous.generation === this.session.generation && previous.expires > Date.now()
      ? `Previous card: ${previous.message}` : undefined;
    if (snapshot.cardId === this.currentId) await this.writeView({
      kb: this.session.kb!, generation: this.session.generation, mode: this.pausedCards.has(snapshot.cardId) ? 'cram' : this.normalCards.has(snapshot.cardId) ? 'normal' : this.session.mode, view, feedback,
    } as PanelSnapshot);
  }
  async refresh() {
    if (this.stopped) return;
    if (this.refreshRunning) { this.refreshRequested = true; return; }
    this.refreshRunning = true;
    const started = this.session.generation;
    try {
      const [kb, onQueue, remaining, current] = await Promise.all([
        this.plugin.kb.getCurrentKnowledgeBaseData(), this.plugin.window.isOnPage(PageType.Queue),
        this.plugin.queue.getNumRemainingCards(), this.plugin.queue.getCurrentCard(),
      ]);
      if (this.stopped || started !== this.session.generation) return;
      if (!onQueue || !kb?._id || remaining === undefined || (remaining === 0 && !current)) {
        if (this.session.active) this.session.end();
        this.clearFeedback();
        this.currentId = undefined; await this.writeView(null); return;
      }
      if (this.session.kb !== kb._id) { this.currentId = undefined; this.clearFeedback(); }
      this.session.begin(kb._id);
      const generation = this.session.generation;
      const previous = this.currentId; this.currentId = current?._id;
      for (const [id, waiting] of this.awaitingSave) if (waiting.expires < Date.now()) this.awaitingSave.delete(id);
      const ids = [...new Set([previous, ...this.awaitingSave.keys()].filter((id): id is string => !!id && id !== current?._id))];
      if (current) ids.push(current._id);
      // Fetch independent cards together, then publish the current card last so
      // feedback from a just-saved previous card appears in the same refresh.
      const snapshots = await Promise.allSettled(ids.map(id => this.snapshot(id)));
      for (let i = 0; i < ids.length; i++) {
        if (generation !== this.session.generation || this.stopped) return;
        const id = ids[i], result = snapshots[i];
        if (result.status === 'rejected') { await this.report(result.reason, id); continue; }
        const snapshot = result.value;
        await this.publish(snapshot);
        if (snapshot.history.some(r => reviewKey(r) === this.awaitingSave.get(id)?.key)) this.awaitingSave.delete(id);
      }
      if (!current) await this.writeView(null);
    } catch (error) { await this.report(error); }
    finally {
      this.refreshRunning = false;
      void this.diagnostics().catch(() => {});
      if (this.refreshRequested && !this.stopped) { this.refreshRequested = false; void this.refresh(); }
    }
  }
  async start() {
    await this.writeView(null);
    this.plugin.app.registerCallback<SpecialPluginCallback.SRSScheduleCard>(SpecialPluginCallback.SRSScheduleCard, args => this.calculate(args));
    this.plugin.app.registerCallback<SpecialPluginCallback.GetNextCard>(SpecialPluginCallback.GetNextCard, async args => {
      this.callbackCalls.queueMode++;
      try {
        await this.ensureContext(); this.session.mode = args.mode;
        this.events.GetNextCard = (this.events.GetNextCard || 0) + 1; await this.diagnostics();
      } catch (error) { await this.report(error); }
      return null; // Native RemNote still chooses every queue card.
    });
    // Content edits are detected by the bounded polling snapshot. Global Rem
    // notifications can include plugin-state writes and cause a refresh loop.
    for (const event of [AppEvents.QueueEnter, AppEvents.QueueExit, AppEvents.QueueLoadCard, AppEvents.QueueCompleteCard, AppEvents.RevealAnswer, AppEvents.URLChange]) {
      this.plugin.event.addListener(event, undefined, () => {
        this.events[event] = (this.events[event] || 0) + 1;
        if (event === AppEvents.QueueExit) {
          this.session.end(); this.currentId = undefined;
          this.clearFeedback();
          void this.writeView(null); void this.diagnostics();
        } else { void this.refresh(); if (event === AppEvents.QueueCompleteCard || event === AppEvents.QueueLoadCard) this.fastRefresh(); }
      });
    }
    await this.plugin.scheduler.registerCustomScheduler('Initial Mastery + FSRS', []);
    this.timer = setInterval(() => { void this.refresh(); }, 1500);
    await this.refresh();
  }
  async stop() {
    this.stopped = true; clearInterval(this.timer); this.session.end();
    this.clearFeedback();
    await this.writeView(null); await this.diagnostics();
  }
}
