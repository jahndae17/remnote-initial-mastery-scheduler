import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { StatusPanel } from '../src/ui/StatusPanel';
import type { StatusView } from '../src/domain/types';
const base: StatusView = { cardId: 'preview', stage: 'mastery', mastery: 3, confirmation: 0, correct: 0, message: '−1 · Initial Mastery 3/5' };
const cases: StatusView[] = [base,
  { ...base, stage: 'srs', origin: 'graduated', mastery: 5, confirmation: 1, correct: 17, message: '+1 · SRS confirmation 1/2' },
  { ...base, stage: 'srs', origin: 'existing', mastery: 0, confirmation: 0, correct: 8, message: 'Confirmed', nextDate: 4 * 86400000 },
];
const panels = cases.map(view => renderToStaticMarkup(React.createElement(StatusPanel, { view, now: 0 }))).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Initial Mastery — panel preview</title><style>${readFileSync('src/ui/panel.css', 'utf8')}
body{background:#e9eef4;padding:24px;font-family:system-ui;color:#243247}main{max-width:1040px;margin:auto}h1{font-size:23px}h2{font-size:16px;margin:22px 8px 8px}.sample{padding:12px 8px;border-radius:12px;background:white}.dark{background:#131c29}.narrow{max-width:430px}p{font-size:14px;line-height:1.6}</style></head><body><main><h1>Initial Mastery + FSRS</h1><p>Standalone component preview · sample data · not a live RemNote queue</p><h2>Light</h2><section class="sample light">${panels}</section><h2>Dark</h2><section class="sample dark">${panels}</section><h2>Narrow queue pane</h2><section class="sample narrow light">${panels}</section></main></body></html>`;
mkdirSync('artifacts', { recursive: true }); writeFileSync('artifacts/panel-preview.html', html);
if (process.argv.includes('--serve')) createServer((req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
}).listen(8391, '127.0.0.1', () => console.log('Panel preview: http://127.0.0.1:8391/'));

