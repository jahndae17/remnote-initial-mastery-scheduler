import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionWriter } from '../src/integration/session-writer';

test('queued panel writes preserve order, skip duplicates and finish with the exit clear', async () => {
  const saved: unknown[] = [];
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const write = sessionWriter(async value => { await blocked; saved.push(value); });
  const writes = [write({ score: 1 }), write({ score: 1 }), write({ score: 2 }), write(null), write(null)];
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, []);
  release(); await Promise.all(writes);
  assert.deepEqual(saved, [{ score: 1 }, { score: 2 }, null]);
});

test('failed storage writes remain retryable and do not block later values', async () => {
  const saved: unknown[] = [];
  let fail = true;
  const write = sessionWriter(async value => {
    if (fail) { fail = false; throw Error('transport unavailable'); }
    saved.push(value);
  });
  await assert.rejects(write({ score: 1 }), /transport unavailable/);
  await write({ score: 1 }); await write(null);
  assert.deepEqual(saved, [{ score: 1 }, null]);
});

test('diagnostic snapshots cannot mutate while waiting behind another write', async () => {
  const saved: unknown[] = [];
  const write = sessionWriter(async value => { saved.push(value); });
  const value = { events: { reviews: 1 } };
  const pending = write(value);
  value.events.reviews = 2;
  await pending; await write(value);
  assert.deepEqual(saved, [{ events: { reviews: 1 } }, { events: { reviews: 2 } }]);
});

test('panel and diagnostic storage channels do not block each other', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const diagnostics = sessionWriter(async () => { await blocked; });
  let panel: unknown = 'not cleared';
  const view = sessionWriter(async value => { panel = value; });
  const pending = diagnostics({ events: 1 });
  await view(null); assert.equal(panel, null);
  release(); await pending;
});
