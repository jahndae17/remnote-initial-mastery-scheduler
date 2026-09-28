import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionCoordinator, type Snapshot } from '../src/coordinator/session';
import { FsrsAdapter, FSRS_OPTIONS, hydrate, serialize } from '../src/fsrs/adapter';
import { latestReceipt } from '../src/domain/history';
import { OWNER, type Review, type Score, type MemoryCard, type MemoryScheduler } from '../src/domain/types';

const EPOCH = Date.UTC(2026, 0, 1), DAY = 86400000;
class CountingMemory implements MemoryScheduler {
  calls = 0;
  review(previous: MemoryCard | undefined, at: number, score: Score): MemoryCard {
    this.calls++;
    return { due: at + (score >= 1 ? 4 : 1) * DAY, stability: 4, difficulty: 5,
      elapsed_days: 1, scheduled_days: score >= 1 ? 4 : 1, learning_steps: 0,
      reps: (previous?.reps || 0) + 1, lapses: (previous?.lapses || 0) + (score === 0 ? 1 : 0), state: 2, last_review: at };
  }
}
function harness(memory: MemoryScheduler = new CountingMemory()) {
  const coordinator = new SessionCoordinator(memory);
  coordinator.begin('kb'); coordinator.mode = 'normal';
  const card: Snapshot = { cardId: 'a', history: [], revision: 'original', enabled: true, due: EPOCH };
  let date = EPOCH;
  const view = () => coordinator.observe(card);
  view();
  const propose = (score: Score, extra: Partial<Review> = {}) => {
    const review = { date: date += 60000, score, ...extra };
    const history = [...card.history, review];
    return { review, history, result: coordinator.calculate(card, history) };
  };
  const commit = (p: ReturnType<typeof propose>) => {
    card.history.push({ ...p.review, pluginData: p.result.pluginData }); card.due = p.result.nextDate;
    return view();
  };
  const answer = (score: Score) => commit(propose(score));
  const graduate = () => { for (let i = 0; i < 5; i++) answer(1); };
  const restart = () => { coordinator.end(); coordinator.begin('kb'); coordinator.mode = 'normal'; return view(); };
  const receipt = () => latestReceipt(card.history, card.cardId)!;
  return { coordinator, card, view, propose, commit, answer, graduate, restart, receipt, memory };
}

test('five successes graduate only on the fifth; initial answers are excluded', () => {
  const h = harness();
  for (let i = 1; i <= 4; i++) { const v = h.answer(1); assert.equal(v.mastery, i); assert.equal(v.stage, 'mastery'); }
  const v = h.answer(1); assert.equal(v.stage, 'srs'); assert.equal(v.mastery, 5); assert.equal(v.correct, 0);
  assert.equal(v.confirmation, 0); assert.equal(h.receipt().state.pending, undefined);
  assert.equal((h.memory as CountingMemory).calls, 1);
});
test('four successes then mistake is three, not zero', () => {
  const h = harness(); [1,1,1,1,0].forEach(s => h.answer(s as Score)); assert.equal(h.view().mastery, 3);
});
test('hard subtracts one; easy adds only one; floor is zero', () => {
  const h = harness(); [0,.5,0].forEach(s => h.answer(s as Score)); assert.equal(h.view().mastery, 0);
  assert.equal(h.answer(1.5).mastery, 1); assert.equal(h.answer(.5).mastery, 0);
});
test('initial mastery can contain mistakes and still reach five', () => {
  const h = harness(); [1,1,0,1,1,1,1].forEach(s => h.answer(s as Score)); assert.equal(h.view().stage, 'srs');
});
test('unmastered cards request 60-second repeats without FSRS calls', () => {
  const h = harness(); const p = h.propose(1); assert.equal(p.result.nextDate - p.review.date, 60000);
  assert.equal((h.memory as CountingMemory).calls, 0);
});
test('success then success confirms and counts two individual answers', () => {
  const h = harness(); h.graduate(); assert.equal(h.answer(1).confirmation, 1);
  const v = h.answer(1); assert.equal(v.correct, 2); assert.equal(v.confirmation, 0);
  assert.equal(h.receipt().outcome, 'confirmed'); assert.equal((h.memory as CountingMemory).calls, 2);
});
test('success then mistake resets confirmation to zero, preserving proposal', () => {
  const h = harness(); h.graduate(); h.answer(1); const pending = h.receipt().state.pending;
  assert.equal(h.answer(0).confirmation, 0); assert.deepEqual(h.receipt().state.pending, pending);
  assert.equal(h.view().correct, 1); assert.equal((h.memory as CountingMemory).calls, 2);
});
test('later errors do not recalculate FSRS; subsequent easy still advances just one', () => {
  const h = harness(); h.graduate(); h.answer(0); const fsrs = h.receipt().state.fsrs;
  h.answer(.5); assert.equal(h.answer(1.5).confirmation, 1); assert.deepEqual(h.receipt().state.fsrs, fsrs);
  h.answer(1.5); assert.equal(h.receipt().outcome, 'confirmed'); assert.equal((h.memory as CountingMemory).calls, 2);
});
test('released interval starts at confirmation time; actual FSRS event stays first rating', () => {
  const h = harness(); h.graduate(); const p = h.propose(0); h.commit(p);
  h.answer(1); const finish = h.propose(1); h.commit(finish);
  assert.equal(finish.result.nextDate, finish.review.date + DAY);
  assert.equal(h.receipt().state.fsrs?.last_review, p.review.date);
  assert.equal(h.receipt().state.fsrs?.due, finish.result.nextDate);
});
test('new cycle calculates FSRS exactly once again', () => {
  const h = harness(); h.graduate(); [1,1,1,1].forEach(s => h.answer(s as Score));
  assert.equal((h.memory as CountingMemory).calls, 3); assert.equal(h.view().correct, 4);
});
test('restart discards initial score while preserving history', () => {
  const h = harness(); h.answer(1); h.answer(1); assert.equal(h.restart().mastery, 0);
  assert.equal(h.card.history.length, 2); assert.equal(h.answer(1).mastery, 1);
});
test('pending result survives restart but confirmation does not', () => {
  const h = harness(); h.graduate(); h.answer(1); const prior = structuredClone(h.receipt().state);
  assert.equal(h.restart().confirmation, 0); assert.equal(h.view().correct, 1);
  assert.deepEqual(h.receipt().state, prior); assert.equal(h.answer(1).confirmation, 1); h.answer(1);
  assert.equal((h.memory as CountingMemory).calls, 2); assert.equal(h.view().correct, 3);
});
test('entirely new coordinator recovers pending FSRS from serialized metadata', () => {
  const h = harness(); h.graduate(); h.answer(0);
  h.card.history = JSON.parse(JSON.stringify(h.card.history));
  const memory = new CountingMemory(); const c = new SessionCoordinator(memory); c.begin('kb'); c.mode = 'normal'; c.observe(h.card);
  for (let i = 0; i < 2; i++) {
    const r = { date: EPOCH + (20 + i) * 60000, score: 1 };
    const result = c.calculate(h.card, [...h.card.history, r]); h.card.history.push({ ...r, pluginData: result.pluginData });
  }
  assert.equal(memory.calls, 0); assert.equal(c.observe(h.card).correct, 2);
});
test('previews and failed saves leave scores and native history unchanged', () => {
  const h = harness(); const p = h.propose(1); h.coordinator.calculate(h.card, p.history);
  assert.equal(h.view().mastery, 0); assert.equal(h.card.history.length, 0); assert.equal(h.card.due, EPOCH);
});
test('repeated identical FSRS previews reuse result without recalculating', () => {
  const h = harness(); h.graduate(); const p = h.propose(1);
  for (let i = 0; i < 5; i++) assert.deepEqual(h.coordinator.calculate(h.card, p.history), p.result);
  assert.equal((h.memory as CountingMemory).calls, 2); assert.equal(h.view().correct, 0);
});
test('already saved callback is idempotent', () => {
  const h = harness(); const p = h.propose(1); h.commit(p);
  assert.deepEqual(h.coordinator.calculate(h.card, h.card.history), p.result); assert.equal(h.view().mastery, 1);
});
test('uncertain write without receipt raises error rather than false adoption', () => {
  const h = harness(); const p = h.propose(1); h.card.history.push(p.review);
  assert.throws(h.view, /omitted pluginData/);
});
test('unknown callback history contract is blocked', () => {
  const h = harness(); assert.throws(() => h.coordinator.calculate(h.card, [{ date: EPOCH, score: 1 }, { date: EPOCH+1, score: 1 }]), /exactly one/);
});
test('commit-first callback without receipt is blocked', () => {
  const h = harness(); h.card.history.push({ date: EPOCH, score: 1 });
  assert.throws(() => h.coordinator.calculate(h.card, h.card.history), /after saving/);
});
test('unknown mode cannot advance', () => {
  const h = harness(); h.coordinator.mode = 'unknown'; assert.throws(() => h.propose(1), /mode/);
});

test('explicit non-cram candidates work without GetNextCard; previews never establish session mode', () => {
  const h = harness(); h.coordinator.mode = 'unknown';
  const preview = h.propose(1, { isCram: false });
  assert.equal(h.coordinator.mode, 'unknown'); assert.equal(h.view().mastery, 0);
  h.commit(h.propose(1, { isCram: true }));
  assert.equal(h.view().mastery, 1);
  assert.throws(() => h.propose(1), /mode/);
  h.commit(h.propose(1, { isCram: false })); assert.equal(h.view().mastery, 2);
  assert.equal(preview.result.nextDate, preview.review.date + 60000);
});

test('initial mastery counts practice-all ratings before graduation', () => {
  const h = harness(); h.coordinator.mode = 'practice-all';
  const p = h.propose(1, { isCram: true });
  h.commit(p); assert.equal(h.view().mastery, 1);
  assert.equal(h.card.due, p.review.date + 60000);
});

test('exact post-reset callback history supports graduation, retry, replay and undo', () => {
  const h = harness(); h.coordinator.mode = 'unknown';
  h.card.history.push({ date: EPOCH - 120000, score: 1 }, { date: EPOCH - 60000, score: 3 });
  for (let i = 0; i < 5; i++) {
    const review = { date: EPOCH + i * 60000, score: 1, isCram: false };
    const callback = [...h.card.history.slice(2), review];
    const result = h.coordinator.calculate(h.card, callback);
    assert.deepEqual(h.coordinator.calculate(h.card, callback), result);
    assert.equal(h.view().mastery, i);
    h.card.history.push({ ...review, pluginData: result.pluginData });
    assert.deepEqual(h.coordinator.calculate(h.card, h.card.history.slice(2)), result);
  }
  assert.equal(h.view().stage, 'srs'); assert.equal(h.view().correct, 0);
  assert.equal((h.memory as CountingMemory).calls, 1);
  h.card.history.pop(); assert.equal(h.view().mastery, 4); assert.equal(h.view().stage, 'mastery');
});

test('a reset does not permit arbitrary missing reviews in a callback', () => {
  const h = harness();
  h.card.history.push({ date: EPOCH - 60000, score: 3 }, { date: EPOCH, score: 1, isCram: false });
  assert.throws(() => h.coordinator.calculate(h.card, [{ date: EPOCH + 60000, score: 1, isCram: false }]), /exactly one/);
});
test('cram and practice-all preserve due and never affect either score or total', () => {
  const h = harness(); h.graduate(); const due = h.card.due;
  h.commit(h.propose(1, { isCram: true })); assert.equal(h.view().correct, 0); assert.equal(h.card.due, due);
  h.coordinator.mode = 'practice-all'; h.answer(1); assert.equal(h.view().correct, 0); assert.equal(h.view().confirmation, 0);
  h.coordinator.mode = 'normal'; assert.equal(h.answer(1).confirmation, 1);
});
test('administrative history entries do not count successful answers', () => {
  const h = harness(); h.graduate(); [2,4,5,.01].forEach((score,i) => h.card.history.push({ date: EPOCH+(10+i)*60000, score }));
  assert.equal(h.view().correct, 0);
});

test('explicit practice-all remains excluded for a pending SRS cycle', () => {
  const h = harness(); h.graduate(); h.answer(1);
  const prior = structuredClone(h.receipt().state), calls = (h.memory as CountingMemory).calls;
  const due = h.card.due, count = h.view().correct;
  h.coordinator.mode = 'practice-all';
  const review = { date: EPOCH + 20 * 60000, score: 1, isCram: true };
  const result = h.coordinator.calculate(h.card, [review]);
  assert.equal(result.nextDate, due);
  assert.equal((h.memory as CountingMemory).calls, calls);
  h.card.history.push({ ...review, pluginData: result.pluginData });
  assert.equal(h.view().correct, count); assert.equal(h.view().confirmation, 1);
  assert.deepEqual(h.receipt().state, prior);
  assert.equal(h.coordinator.calculate(h.card, [review]).nextDate, due);
});

test('excluded practice cannot invent an unknown due date', () => {
  const h = harness(); h.graduate(); h.coordinator.mode = 'unknown';
  h.card.due = undefined;
  assert.throws(() => h.coordinator.calculate(h.card, [{ date: EPOCH, score: 1, isCram: true }]), /unknown due/);
  h.card.due = NaN;
  assert.throws(() => h.coordinator.calculate(h.card, [{ date: EPOCH, score: 1, isCram: true }]), /unknown due/);
});

test('native early ratings graduate at five, preserve flags and do not count old excluded attempts', () => {
  const h = harness(); h.coordinator.mode = 'unknown';
  h.card.history.push({ date: EPOCH - 120000, score: 3 },
    { date: EPOCH - 60000, score: 1, isCram: true, pluginData: { [OWNER]: { schema: 1, excluded: true } } });
  for (let i = 1; i <= 5; i++) {
    const p = h.propose(1, { isCram: true });
    assert.equal(h.view().mastery, i - 1);
    assert.deepEqual(h.coordinator.calculate(h.card, p.history.slice(1)), p.result);
    const v = h.commit(p); assert.equal(v.mastery, i); assert.equal(v.correct, 0);
    assert.equal(h.card.history.at(-1)?.isCram, true);
    assert.deepEqual(h.coordinator.calculate(h.card, h.card.history.slice(1)), p.result);
  }
  assert.equal(h.view().stage, 'srs'); assert.equal((h.memory as CountingMemory).calls, 1);
  const due = h.card.due;
  h.commit(h.propose(1, { isCram: true })); assert.equal(h.card.due, due); assert.equal(h.view().correct, 0);
});

test('early learning mistakes subtract one and session restart clears only partial progress', () => {
  const h = harness();
  for (const score of [1,1,1,1,0]) h.commit(h.propose(score as Score, { isCram: true }));
  assert.equal(h.view().mastery, 3); h.restart(); assert.equal(h.view().mastery, 0);
  h.commit(h.propose(1, { isCram: true })); assert.equal(h.view().mastery, 1);
  h.card.history.pop(); assert.equal(h.view().mastery, 0);
});

test('pending confirmation accepts early repeats once and preserves first-rating FSRS across restart', () => {
  const h = harness(); h.graduate(); h.answer(1);
  const pending = structuredClone(h.receipt().state.pending);
  h.commit(h.propose(0, { isCram: true })); assert.equal(h.view().confirmation, 0);
  assert.deepEqual(h.receipt().state.pending, pending); h.restart();
  h.commit(h.propose(1, { isCram: true })); assert.equal(h.view().confirmation, 1);
  const p = h.propose(1, { isCram: true }); h.commit(p);
  assert.equal(h.receipt().outcome, 'confirmed'); assert.equal(h.view().correct, 3);
  assert.equal((h.memory as CountingMemory).calls, 2);
  assert.deepEqual(h.coordinator.calculate(h.card, h.card.history), p.result);
  h.card.history.pop(); assert.equal(h.view().confirmation, 1); assert.equal(h.view().correct, 2);
});
test('undo graduation restores mastery, then replacement rating is applied once', () => {
  const h = harness(); h.graduate(); h.card.history.pop();
  assert.equal(h.view().stage, 'mastery'); assert.equal(h.view().mastery, 4);
  assert.equal(h.answer(0).mastery, 3);
});
test('undo confirmation removes its success and restores pending cycle', () => {
  const h = harness(); h.graduate(); h.answer(1); h.answer(1); h.card.history.pop();
  assert.equal(h.view().confirmation, 1); assert.equal(h.view().correct, 1); assert.ok(h.receipt().state.pending);
});
test('undo first SRS rating removes pending result', () => {
  const h = harness(); h.graduate(); h.answer(0); h.card.history.pop();
  assert.equal(h.receipt().state.pending, undefined); assert.equal(h.view().correct, 0);
});
test('in-place external corrections fail closed if their saved receipt is stale', () => {
  const h = harness(); h.answer(1); h.card.history[0].score = 0; assert.throws(h.view, /history changed/);
});
test('edited content resets mastery only', () => {
  const h = harness(); h.answer(1); h.answer(1); h.card.revision = 'edited';
  assert.equal(h.view().mastery, 0); assert.equal(h.card.history.length, 2); assert.equal(h.answer(1).mastery, 1);
});
test('edited SRS content resets confirmation without erasing pending, graduation or count', () => {
  const h = harness(); h.graduate(); h.answer(1); h.card.revision = 'edited';
  const v = h.view(); assert.equal(v.confirmation, 0); assert.equal(v.mastery, 5); assert.equal(v.correct, 1); assert.ok(h.receipt().state.pending);
});
test('native reset starts new initial lifetime and count', () => {
  const h = harness(); h.graduate(); h.answer(1);
  h.card.history.push({ date: EPOCH, score: 3 });
  assert.equal(h.view().stage, 'mastery'); assert.equal(h.view().mastery, 0); assert.equal(h.view().correct, 0);
  assert.equal(h.answer(1).mastery, 1);
});
test('existing card retains old due until rated, then counts since adoption', () => {
  const h = harness(); h.card.history = [{ date: EPOCH - DAY, score: 1 }]; h.card.due = EPOCH + DAY;
  const p = h.propose(1); assert.equal(h.card.due, EPOCH + DAY);
  const v = h.commit(p); assert.equal(v.stage, 'srs'); assert.equal(v.origin, 'existing'); assert.equal(v.correct, 1);
  assert.equal(h.receipt().state.fsrs?.reps, 2);
});
test('forward/backward/cloze IDs keep separate scores', () => {
  const h = harness(); h.answer(1);
  for (const cardId of ['a-back', 'cloze-1', 'cloze-2']) {
    const sibling = { ...h.card, cardId, history: [] };
    assert.equal(h.coordinator.observe(sibling).mastery, 0);
  }
  assert.equal(h.view().mastery, 1);
});
test('skip and focus changes do not end a session', () => {
  const h = harness(); h.answer(1); h.coordinator.begin('kb');
  h.coordinator.observe({ ...h.card, cardId: 'other', history: [] }); assert.equal(h.view().mastery, 1);
});
test('KB change clears scores even if the card ID is identical', () => {
  const h = harness(); h.answer(1); h.coordinator.begin('second-kb'); assert.equal(h.view().mastery, 0);
});
test('disabled and deleted cards cannot advance', () => {
  const h = harness(); h.answer(1); h.card.enabled = false;
  assert.throws(() => h.propose(1), /deleted or disabled/); h.card.enabled = true;
  assert.equal(h.view().mastery, 0); h.coordinator.forget('a'); assert.equal(h.view().mastery, 0);
});
test('session end blocks submissions and clears volatile memory', () => {
  const h = harness(); h.answer(1); h.coordinator.end();
  assert.equal(h.coordinator.size, 0); assert.throws(() => h.propose(1), /No active/);
});
test('malformed and future-version metadata cannot silently graduate a card', () => {
  const h = harness(); h.answer(1); (h.card.history[0].pluginData![OWNER] as any).schema = 99;
  assert.throws(h.view, /invalid/);
});
test('metadata has no session scores, permanent counter or competing attempt log', () => {
  const h = harness(); h.graduate(); h.answer(1);
  const json = JSON.stringify(h.receipt());
  for (const name of ['confirmationScore', 'masteryScore', 'reviewKeys', 'correctCount', 'attemptLog']) assert.ok(!json.includes(name));
});
test('FSRS deterministic, date round-trip and exact policy defaults', () => {
  const f = new FsrsAdapter(); const a = f.review(undefined, EPOCH, 1);
  assert.deepEqual(a, f.review(undefined, EPOCH, 1)); assert.deepEqual(serialize(hydrate(a)), a);
  assert.equal(FSRS_OPTIONS.request_retention, .9); assert.equal(FSRS_OPTIONS.enable_fuzz, false);
  assert.equal(FSRS_OPTIONS.enable_short_term, false); assert.equal(a.learning_steps, 0);
  assert.ok(a.due >= EPOCH + DAY);
});
test('real FSRS is updated on graduation then first rating only', () => {
  const h = harness(new FsrsAdapter()); h.graduate(); h.answer(0);
  const first = structuredClone(h.receipt().state.fsrs); h.answer(1); h.answer(0); h.answer(1); h.answer(1);
  const last = h.receipt().state.fsrs!;
  assert.equal(last.reps, 2); assert.equal(last.last_review, first?.last_review);
  assert.equal(last.stability, first?.stability); assert.equal(last.difficulty, first?.difficulty);
});
