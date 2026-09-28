import test from 'node:test';
import assert from 'node:assert/strict';
import type { RNPlugin } from '@remnote/plugin-sdk';
import type { Review } from '../src/domain/types';

async function host(sdkObjects = false) {
  // The SDK UMD bundle names the global self even for non-DOM API imports.
  (globalThis as any).self = globalThis;
  const { RemNoteBridge, VIEW_KEY, DIAGNOSTICS_KEY } = await import('../src/integration/bridge');
  const callbacks = new Map<string, Function>(), events = new Map<string, Function>(), storage = new Map<string, any>();
  const writes = new Map<string, number>();
  let kb = 'kb', queue = true, remaining = 3, current = 'a', enabled = true, deleted = false;
  let readBarrier: Promise<void> | undefined;
  let cardReads = 0;
  const history: Review[] = [];
  const rem = { _id: 'rem-a', text: ['front'], backText: ['answer'], children: [], parent: null, type: 1,
    getEnablePractice: async () => enabled, getPracticeDirection: async () => 'both', getChildrenRem: async () => [] };
  const card = { _id: 'a', remId: 'rem-a', type: 'forward', repetitionHistory: history, nextRepetitionTime: 0, getRem: async () => rem };
  const plugin = {
    card: { findOne: async () => { cardReads++; await readBarrier; return deleted ? undefined : card; }, getAll: () => { throw Error('Whole KB scan prohibited'); } },
    rem: { findOne: async () => rem },
    kb: { getCurrentKnowledgeBaseData: async () => ({ _id: kb }) },
    window: { isOnPage: async () => queue },
    queue: { getNumRemainingCards: async () => remaining, getCurrentCard: async () => current ? { ...card, _id: current } : undefined },
    storage: { setSession: async (k: string, value: unknown) => { storage.set(k, value); writes.set(k, (writes.get(k) || 0) + 1); } },
    app: { registerCallback: (k: string, fn: Function) => { callbacks.set(k, fn); } },
    event: { addListener: (k: string, _id: unknown, fn: Function) => { events.set(k, fn); } },
    scheduler: { registerCustomScheduler: async (name: string, params: unknown[]) => { assert.equal(name, 'Initial Mastery + FSRS'); assert.deepEqual(params, []); } },
  } as unknown as RNPlugin;
  if (sdkObjects) {
    const { CardNamespace, RemNamespace } = await import('@remnote/plugin-sdk');
    // Simulate only the serialized host transport; let the pinned SDK construct
    // real objects. In particular, Card.getRem must not be mocked as a rich Rem.
    const call = async (method: string, _args: Record<string, any>, namespace?: string | string[]) => {
      if (namespace === 'card' && method === 'findOne') {
        await readBarrier;
        return deleted ? undefined : { _id: 'a', remId: 'rem-a', cardType: 'f', history, nextTime: 0, createdAt: 0 };
      }
      if (namespace === 'rem') {
        if (method === 'findOne') return deleted ? undefined : {
          _id: rem._id, text: rem.text, backText: rem.backText, children: [], parent: null, type: 1, createdAt: 0, u: 0, o: 0,
        };
        if (method === 'getEnablePractice') return enabled;
        if (method === 'getPracticeDirection') return 'both';
        if (method === 'getChildrenRem') return [];
      }
      throw new Error(`Unexpected SDK transport call: ${namespace}.${method}`);
    };
    plugin.card = new CardNamespace(call);
    plugin.rem = new RemNamespace(call);
  }
  const bridge = new RemNoteBridge(plugin); await bridge.start();
  const mode = async (value = 'normal') => callbacks.get('GetNextCard')!({ mode: value, cardsPracticed: 0, numCardsRemaining: remaining });
  const calculate = async (score = 1) => callbacks.get('SRSScheduleCard')!({ cardId: 'a', remId: 'rem-a', schedulerParameters: {}, history: [...history, { date: 1767225600000 + history.length * 60000, score }] });
  const answer = async (score = 1) => {
    const result = await calculate(score);
    history.push({ date: 1767225600000 + history.length * 60000, score, pluginData: result.pluginData });
    await bridge.refresh(); return result;
  };
  return { bridge, history, callbacks, events, rem, mode, calculate, answer,
    reads: () => cardReads,
    view: () => storage.get(VIEW_KEY), diagnostic: () => storage.get(DIAGNOSTICS_KEY),
    viewWrites: () => writes.get(VIEW_KEY) || 0,
    diagnosticWrites: () => writes.get(DIAGNOSTICS_KEY) || 0,
    set: (s: { kb?: string; queue?: boolean; remaining?: number; current?: string; enabled?: boolean; deleted?: boolean; barrier?: Promise<void> }) => {
      kb = s.kb ?? kb; queue = s.queue ?? queue; remaining = s.remaining ?? remaining;
      current = s.current ?? current; enabled = s.enabled ?? enabled; deleted = s.deleted ?? deleted; readBarrier = s.barrier;
    } };
}

test('four concurrent rating previews share one snapshot and later reviews read fresh data', async () => {
  const h = await host(); let release!: () => void;
  try {
    await h.mode(); const before = h.reads();
    h.set({ barrier: new Promise<void>(resolve => { release = resolve; }) });
    const previews = Promise.all([0, .5, 1, 1.5].map(score => h.calculate(score)));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.reads() - before, 1);
    release(); await previews;
    assert.equal(h.view().view.mastery, 0);
    const after = h.reads(); await h.calculate(); assert.equal(h.reads(), after + 1);
    assert.ok(h.diagnostic().sharedSnapshotReads >= 3);
  } finally { release?.(); await h.bridge.stop(); }
});

test('queue exit is immediate during a blocked read, cancels fast retries and rejects late callbacks', async () => {
  const h = await host(); let release!: () => void;
  try {
    await h.mode(); await h.calculate();
    h.set({ barrier: new Promise<void>(resolve => { release = resolve; }) });
    const pending = h.calculate();
    await new Promise(resolve => setImmediate(resolve));
    h.events.get('queue.exit')!(); h.set({ queue: false });
    assert.equal(h.bridge.session.active, false);
    const reads = h.reads();
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(h.reads(), reads); assert.equal(h.view(), null);
    release(); await assert.rejects(pending, /Session ended/);
    assert.equal(h.view(), null); assert.equal(h.diagnostic().lastError, null);
  } finally { release?.(); await h.bridge.stop(); }
});

test('a callback after navigation closes the session even if QueueExit has not arrived', async () => {
  const h = await host(); try {
    await h.mode(); await h.calculate(); h.set({ queue: false });
    await assert.rejects(h.calculate(), /No active/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.bridge.session.active, false); assert.equal(h.view(), null);
    assert.equal(h.diagnostic().lastError, null);
  } finally { await h.bridge.stop(); }
});

test('saved progress appears during a short follow-up check without waiting for the idle poll', async () => {
  const h = await host(); try {
    await h.mode(); const result = await h.calculate();
    h.history.push({ date: 1767225600000, score: 1, pluginData: result.pluginData });
    h.events.get('queue.complete-card')!();
    const deadline = Date.now() + 1000;
    while (h.diagnostic().lastSavedResult?.mastery !== 1 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(h.diagnostic().lastSavedResult.mastery, 1);
  } finally { await h.bridge.stop(); }
});

test('polling does not rewrite unchanged diagnostics or subscribe to its own global Rem changes', async () => {
  const h = await host(); try {
    assert.equal(h.events.has('global.rem.changed'), false);
    const writes = h.diagnosticWrites();
    await h.bridge.refresh(); await h.bridge.refresh();
    assert.equal(h.diagnosticWrites(), writes);
  } finally { await h.bridge.stop(); }
});

test('reset-trimmed non-cram previews and cram commits retain separate diagnostics', async () => {
  const h = await host(); try {
    await assert.rejects(h.calculate(), /Queue mode/);
    h.history.push({ date: 1767225500000, score: 3 });
    const args = { cardId: 'a', remId: 'rem-a', schedulerParameters: {}, history: [{ date: 1767225600000, score: 1, isCram: false }] };
    const preview = await h.callbacks.get('SRSScheduleCard')!(args);
    assert.equal(preview.nextDate, 1767225660000); assert.equal(h.view().mode, 'normal');
    assert.equal(h.view().view.mastery, 0);
    const review = { ...args.history[0], isCram: true };
    const committed = await h.callbacks.get('SRSScheduleCard')!({ ...args, history: [review] });
    assert.equal(h.view().mode, 'normal'); assert.equal(h.view().view.mastery, 0);
    h.history.push({ ...review, pluginData: committed.pluginData }); await h.bridge.refresh();
    assert.equal(h.view().view.mastery, 1); assert.equal(h.view().mode, 'normal');
    assert.deepEqual(h.diagnostic().lastSavedResult, { stage: 'mastery', mastery: 1, confirmation: 0, correct: 0, acceptedEarly: true, outcome: 'repeat' });
    assert.equal(h.diagnostic().lastCallbackByCramFlag.false.prefixMatchesSinceReset, true);
    assert.equal(h.diagnostic().lastCallbackByCramFlag.true.candidateIsCram, 'true');
    assert.match(h.diagnostic().lastFailure.message, /Queue mode/);
    assert.equal(h.diagnostic().lastError, null);
  } finally { await h.bridge.stop(); }
});

test('bridge registers scheduler, observes mode, and only saved ratings advance widget', async () => {
  const h = await host(); try {
    assert.equal(await h.mode(), null); await h.calculate(); assert.equal(h.view().view.mastery, 0);
    await h.answer(); assert.equal(h.view().view.mastery, 1); assert.equal(h.diagnostic().mode, 'normal');
  } finally { await h.bridge.stop(); }
});

test('a delayed save after queue navigation is still reconciled without a whole-KB scan', async () => {
  const h = await host(); try {
    await h.mode(); const result = await h.calculate();
    h.set({ current: '' }); await h.bridge.refresh();
    assert.equal(h.diagnostic().lastSavedResult, null);
    h.history.push({ date: 1767225600000, score: 1, pluginData: result.pluginData });
    await h.bridge.refresh();
    assert.equal(h.diagnostic().lastSavedResult.mastery, 1);
    h.events.get('queue.exit')!(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.diagnostic().lastSavedResult, null);
  } finally { await h.bridge.stop(); }
});

test('actual SDK wrappers supply Rem methods and preserve saved-only advancement', async () => {
  const h = await host(true); try {
    assert.equal(h.diagnostic().lastError, null);
    assert.equal(h.view().view.mastery, 0);
    await h.mode(); await h.calculate(); assert.equal(h.view().view.mastery, 0);
    await h.answer(); assert.equal(h.view().view.mastery, 1);
    h.rem.text = ['edited']; await h.bridge.refresh(); assert.equal(h.view().view.mastery, 0);
    h.set({ enabled: false }); await assert.rejects(h.calculate(), /disabled/);
    h.set({ deleted: true }); await assert.rejects(h.calculate(), /deleted/);
  } finally { await h.bridge.stop(); }
});
test('native queue exit clears view and all score anchors', async () => {
  const h = await host(); try {
    await h.mode(); await h.answer(); h.events.get('queue.exit')!();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.bridge.session.active, false); assert.equal(h.bridge.session.size, 0); assert.equal(h.view(), null);
  } finally { await h.bridge.stop(); }
});

test('live one-entry early learning callback requests a repeat without queue-mode delivery', async () => {
  const h = await host(); try {
    for (let i = 0; i < 10; i++) h.history.push({ date: 1767225600000 + i * 60000, score: i === 9 ? 3 : 1 });
    const result = await h.callbacks.get('SRSScheduleCard')!({ cardId: 'a', remId: 'rem-a', schedulerParameters: {},
      history: [{ date: 1767226300000, score: 1, isCram: true }] });
    assert.equal(result.nextDate, 1767226360000); assert.equal(h.history.length, 10);
    assert.equal(h.view().mode, 'normal'); assert.equal(h.view().view.mastery, 0);
    assert.equal(h.diagnostic().lastError, null); assert.equal(h.diagnostic().mode, 'unknown');
    const writes = h.viewWrites();
    await h.bridge.refresh(); await h.bridge.refresh();
    assert.equal(h.viewWrites(), writes); assert.equal(h.view().mode, 'normal');
  } finally { await h.bridge.stop(); }
});

test('identical error and normal views are not rewritten on every poll', async () => {
  const h = await host(); try {
    await assert.rejects(h.calculate(), /Queue mode/);
    await h.bridge.refresh();
    const errorWrites = h.viewWrites();
    await h.bridge.refresh(); await h.bridge.refresh(); assert.equal(h.viewWrites(), errorWrites);
    await h.mode(); await h.calculate();
    const normalWrites = h.viewWrites();
    await h.bridge.refresh(); await h.bridge.refresh(); assert.equal(h.viewWrites(), normalWrites);
  } finally { await h.bridge.stop(); }
});
test('empty completed queue ends session; focused queue refresh preserves scores', async () => {
  const h = await host(); try {
    await h.mode(); await h.answer(); await h.bridge.refresh(); assert.equal(h.view().view.mastery, 1);
    h.set({ remaining: 0, current: '' }); await h.bridge.refresh(); assert.equal(h.bridge.session.active, false);
  } finally { await h.bridge.stop(); }
});
test('KB switch clears progress and requires a fresh mode observation', async () => {
  const h = await host(); try {
    await h.mode(); await h.answer(); h.set({ kb: 'kb2' }); await h.bridge.refresh();
    assert.equal(h.view().view.mastery, 0); assert.equal(h.bridge.session.mode, 'unknown');
  } finally { await h.bridge.stop(); }
});
test('disable clears view and late card reads cannot return a schedule', async () => {
  const h = await host(); let release!: () => void;
  try {
    await h.mode(); h.set({ barrier: new Promise<void>(resolve => { release = resolve; }) });
    const calculation = h.calculate();
    // Flush promise continuations to reach the outstanding card read.
    await new Promise(resolve => setImmediate(resolve));
    await h.bridge.stop(); release();
    await assert.rejects(calculation, /Session ended/); assert.equal(h.view(), null);
  } finally { release?.(); await h.bridge.stop(); }
});
test('deleted/disabled card callback is rejected, never written directly', async () => {
  const h = await host(); try {
    await h.mode(); h.set({ enabled: false }); await assert.rejects(h.calculate(), /disabled/);
    h.set({ deleted: true }); await assert.rejects(h.calculate(), /deleted/); assert.equal(h.history.length, 0);
  } finally { await h.bridge.stop(); }
});
test('source content edit clears partial score on next observation', async () => {
  const h = await host(); try {
    await h.mode(); await h.answer(); h.rem.text = ['edited']; await h.bridge.refresh();
    assert.equal(h.view().view.mastery, 0);
  } finally { await h.bridge.stop(); }
});
test('normal review never invokes getAll and missing mode reports explicit integration error', async () => {
  const h = await host(); try {
    await assert.rejects(h.calculate(), /Queue mode/); assert.match(h.diagnostic().lastError, /Queue mode/);
    await h.mode(); await h.answer(); assert.equal(h.history.length, 1);
  } finally { await h.bridge.stop(); }
});

test('callback error stays visible across refreshes and clears only after successful calculation', async () => {
  const h = await host(); try {
    await assert.rejects(h.calculate(), /Queue mode/);
    for (let i = 0; i < 3; i++) {
      await h.bridge.refresh();
      assert.equal(h.view().view.stage, 'error');
      assert.match(h.view().view.error, /Queue mode/);
    }
    h.set({ current: 'b' }); await h.bridge.refresh();
    assert.notEqual(h.view().view.stage, 'error');
    h.set({ current: 'a' }); await h.bridge.refresh(); assert.equal(h.view().view.stage, 'error');
    await h.mode(); await h.calculate();
    assert.equal(h.view().view.stage, 'mastery'); assert.equal(h.view().view.mastery, 0);
    assert.equal(h.history.length, 0); assert.equal(h.diagnostic().lastError, null);
    assert.deepEqual(h.diagnostic().callbackCalls, { scheduling: 2, queueMode: 1 });
  } finally { await h.bridge.stop(); }
});

test('truncated history diagnostics describe relationships without recording review data', async () => {
  const h = await host(); try {
    const savedDate = 1767225600000;
    for (let i = 0; i < 6; i++) h.history.push({ date: savedDate + i * 60000, score: 1 });
    await h.mode();
    await assert.rejects(h.callbacks.get('SRSScheduleCard')!({ cardId: 'a', remId: 'rem-a', schedulerParameters: {},
      history: [{ date: savedDate + 6 * 60000, score: 1 }] }), /exactly one/);
    const shape = h.diagnostic().lastCallback;
    assert.equal(shape.callbackLength, 1); assert.equal(shape.savedLength, 6);
    assert.equal(shape.candidateAfterSaved, true); assert.equal(shape.candidateMatchesSaved, false);
    assert.equal(shape.prefixMatchesSaved, false); assert.equal(shape.candidateIsCram, 'missing');
    assert.equal(shape.savedOwnedMetadataEntries, 0);
    assert.doesNotMatch(JSON.stringify(shape), /176722|rem-a|front|answer/);
    await h.bridge.refresh(); assert.equal(h.view().view.stage, 'error');
    h.events.get('queue.exit')!(); await h.bridge.refresh();
    assert.notEqual(h.view().view.stage, 'error');
  } finally { await h.bridge.stop(); }
});
