import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusPanel } from '../src/ui/StatusPanel';
import type { StatusView } from '../src/domain/types';
const base: StatusView = { cardId: 'a', stage: 'mastery', mastery: 3, confirmation: 0, correct: 0, message: '−1 · Initial Mastery 3/5' };
const render = (view: StatusView, mode?: string) => renderToStaticMarkup(React.createElement(StatusPanel, { view, mode, now: 0 }));
test('initial panel contains five accessible segments, score and zero total', () => {
  const html = render(base); assert.match(html, /aria-valuenow="3"/); assert.match(html, /aria-valuemax="5"/);
  assert.match(html, /3\/5/); assert.match(html, /Correct since graduation/); assert.doesNotMatch(html, /Current SRS confirmation/);
  assert.equal((html.match(/class="im-segment[ "]/g) || []).length, 5);
});
test('SRS panel exposes graduation, 1/2 confirmation and individual successes', () => {
  const html = render({ ...base, stage: 'srs', origin: 'graduated', mastery: 5, confirmation: 1, correct: 17 });
  assert.match(html, /SRS · Graduated/); assert.match(html, /5\/5 ✓/); assert.match(html, /1\/2/); assert.match(html, /<strong>17<\/strong>/);
});
test('existing card uses adoption language and no fictional mastery score', () => {
  const html = render({ ...base, stage: 'srs', origin: 'existing', message: '' });
  assert.match(html, /SRS · Existing card/); assert.match(html, /Not required/); assert.match(html, /Correct since adoption/); assert.doesNotMatch(html, /3\/5/);
});
test('excluded and unknown modes communicate paused advancement', () => {
  assert.match(render(base, 'practice-all'), /progress paused/); assert.match(render(base, 'unknown'), /Waiting for native queue mode/);
});
test('unmanaged cards have no panel and diagnostics have accessible alert', () => {
  assert.equal(render({ ...base, stage: 'unmanaged' }), '');
  assert.match(render({ ...base, stage: 'error', error: 'Missing native context' }), /role="alert"/);
});
test('saved confirmation message includes released interval', () => {
  assert.match(render({ ...base, stage: 'srs', message: 'Confirmed', nextDate: 4 * 86400000 }), /next review in 4 days/);
});
