import { AppEvents, PageType_DUPE_1 as PageType, SchedulerExplanationType, SpecialPluginCallback, type RNPlugin, type SRSScheduleCardParams } from '@remnote/plugin-sdk';
import { SessionCoordinator, type Snapshot } from '../coordinator/session';
import { FsrsAdapter } from '../fsrs/adapter';
import { ContractError } from '../domain/types';
import { latestReceipt } from '../domain/history';
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
  private currentId?: string;
  private events: Record<string, number> = {};
  private callbackShapes: Record<string, number> = {};
  private callbackCalls = { scheduling: 0, queueMode: 0 };
  private lastCallback?: ReturnType<typeof inspectCallbackHistory>;
  private cardErrors = new Map<string, string>();
  private error = '';
  private stopped = false;
  private lastFeedback?: { cardId: string; message: string; expires: number; generation: number };
  private feedbackSeen = new Map<string, string>();
  private clearFeedback() { this.feedbackSeen.clear(); this.lastFeedback = undefined; this.cardErrors.clear(); }
  constructor(private plugin: RNPlugin) {}
  private async snapshot(cardId: string): Promise<Snapshot> {
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
  private async ensureContext() {
    const generation = this.session.generation;
    const kb = await this.plugin.kb.getCurrentKnowledgeBaseData();
    if (!kb?._id || !await this.plugin.window.isOnPage(PageType.Queue)) throw new ContractError('No active knowledge-base review queue.');
    if (this.stopped || generation !== this.session.generation) throw new ContractError('Session changed during context lookup.');
    if (this.session.kb !== kb._id) { this.currentId = undefined; this.clearFeedback(); }
    this.session.begin(kb._id);
    return kb._id;
  }
  private async diagnostics() {
    await this.plugin.storage.setSession(DIAGNOSTICS_KEY, {
      build: '0.1.5-development', liveValidated: false, active: this.session.active,
      mode: this.session.mode, generation: this.session.generation,
      cardsObserved: this.session.size, events: this.events, callbackShapes: this.callbackShapes,
      callbackCalls: this.callbackCalls, lastCallback: this.lastCallback || null,
      lastError: this.error || null,
      contracts: ['Candidate must append exactly one saved review', 'Normal mode must arrive via GetNextCard', 'Saved rating must retain returned pluginData'],
    });
  }
  private async report(error: unknown, cardId = this.currentId || '') {
    this.error = error instanceof Error ? error.message : String(error);
    if (cardId) this.cardErrors.set(cardId, this.error);
    if (this.session.kb && cardId === this.currentId) await this.plugin.storage.setSession(VIEW_KEY, {
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
      const result = this.session.calculate(snapshot, args.history);
      this.cardErrors.delete(snapshot.cardId);
      this.error = [...this.cardErrors.values()].at(-1) || '';
      // Publish saved history, never a hypothetical callback result.
      await this.publish(snapshot); await this.diagnostics();
      return { ...result, explanation: { type: SchedulerExplanationType.NormalRepetition, text: 'Initial Mastery + FSRS · development build' } };
    } catch (error) { await this.report(error, args.cardId); throw error; }
  }
  private async publish(snapshot: Snapshot) {
    const view = this.session.observe(snapshot);
    const error = this.cardErrors.get(snapshot.cardId);
    if (error) {
      if (snapshot.cardId === this.currentId) await this.plugin.storage.setSession(VIEW_KEY, {
        kb: this.session.kb!, generation: this.session.generation, mode: this.session.mode,
        view: { ...view, stage: 'error', error },
      } as PanelSnapshot);
      return;
    }
    const receipt = latestReceipt(snapshot.history, snapshot.cardId);
    const feedbackKey = `${this.session.generation}:${receipt?.lineage}`;
    if (receipt && view.message && this.feedbackSeen.get(snapshot.cardId) !== feedbackKey) {
      this.feedbackSeen.set(snapshot.cardId, feedbackKey);
      this.lastFeedback = { cardId: snapshot.cardId, message: view.message, expires: Date.now() + 4500, generation: this.session.generation };
    }
    const previous = this.lastFeedback;
    const feedback = previous && previous.cardId !== snapshot.cardId && previous.generation === this.session.generation && previous.expires > Date.now()
      ? `Previous card: ${previous.message}` : undefined;
    if (snapshot.cardId === this.currentId) await this.plugin.storage.setSession(VIEW_KEY, {
      kb: this.session.kb!, generation: this.session.generation, mode: this.session.mode, view, feedback,
    } as PanelSnapshot);
  }
  async refresh() {
    if (this.refreshRunning || this.stopped) return;
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
        this.currentId = undefined; await this.plugin.storage.setSession(VIEW_KEY, null); return;
      }
      if (this.session.kb !== kb._id) { this.currentId = undefined; this.clearFeedback(); }
      this.session.begin(kb._id);
      const generation = this.session.generation;
      const previous = this.currentId; this.currentId = current?._id;
      const ids = [...new Set([previous, current?._id].filter((id): id is string => !!id))];
      for (const id of ids) {
        const snapshot = await this.snapshot(id);
        if (generation !== this.session.generation || this.stopped) return;
        await this.publish(snapshot);
      }
      if (!current) await this.plugin.storage.setSession(VIEW_KEY, null);
    } catch (error) { await this.report(error); }
    finally { this.refreshRunning = false; await this.diagnostics(); }
  }
  async start() {
    await this.plugin.storage.setSession(VIEW_KEY, null);
    this.plugin.app.registerCallback<SpecialPluginCallback.SRSScheduleCard>(SpecialPluginCallback.SRSScheduleCard, args => this.calculate(args));
    this.plugin.app.registerCallback<SpecialPluginCallback.GetNextCard>(SpecialPluginCallback.GetNextCard, async args => {
      this.callbackCalls.queueMode++;
      try {
        await this.ensureContext(); this.session.mode = args.mode;
        this.events.GetNextCard = (this.events.GetNextCard || 0) + 1; await this.diagnostics();
      } catch (error) { await this.report(error); }
      return null; // Native RemNote still chooses every queue card.
    });
    for (const event of [AppEvents.QueueEnter, AppEvents.QueueExit, AppEvents.QueueLoadCard, AppEvents.QueueCompleteCard, AppEvents.RevealAnswer, AppEvents.URLChange, AppEvents.GlobalRemChanged]) {
      this.plugin.event.addListener(event, undefined, () => {
        this.events[event] = (this.events[event] || 0) + 1;
        if (event === AppEvents.QueueExit) {
          this.session.end(); this.currentId = undefined;
          this.clearFeedback();
          void this.plugin.storage.setSession(VIEW_KEY, null); void this.diagnostics();
        } else void this.refresh();
      });
    }
    await this.plugin.scheduler.registerCustomScheduler('Initial Mastery + FSRS', []);
    this.timer = setInterval(() => { void this.refresh(); }, 1500);
    await this.refresh();
  }
  async stop() {
    this.stopped = true; clearInterval(this.timer); this.session.end();
    this.clearFeedback();
    await this.plugin.storage.setSession(VIEW_KEY, null); await this.diagnostics();
  }
}
