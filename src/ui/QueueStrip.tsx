import React from 'react';
import type { StatusView } from '../domain/types';
import { Segments } from './StatusPanel';

/** Fit the native queue slot without depending on vertical iframe scrolling. */
export function QueueStrip({ view, mode, feedback, onDetails }: {
  view: StatusView; mode: string; feedback?: string; onDetails: () => void;
}) {
  const paused = ['cram', 'practice-all', 'in-order'].includes(mode);
  if (view.stage === 'unmanaged' && !paused) return null;
  const error = view.stage === 'error';
  const existing = view.origin === 'existing';
  const label = error ? 'Initial Mastery · integration check' : paused ? 'Extra practice · progress paused'
    : view.stage === 'mastery' ? 'Initial Mastery' : existing ? 'SRS · Existing card' : 'SRS · Graduated';
  const message = error ? view.error : paused ? 'Scores do not advance in extra practice.'
    : feedback || view.message || (mode === 'unknown' ? 'Waiting for native review context.' : 'Correct +1 · mistake −1');
  return <aside className="im-strip" aria-label="Initial Mastery and SRS progress" role={error ? 'alert' : undefined}>
    <span className="im-strip-content">
      <strong className="im-strip-stage" title="Development build">{label}</strong>
      {!error && !paused && <>
        {existing ? <span title="Initial Mastery not required">Mastery: Not required</span> : <Segments label="Initial Mastery" value={view.mastery} max={5} />}
        {view.stage === 'srs' && <span className="im-field">Recall <Segments label="Current SRS confirmation" value={view.confirmation} max={2} /></span>}
        <span title={`Correct since ${existing ? 'adoption' : 'graduation'}`} aria-label={`Correct since ${existing ? 'adoption' : 'graduation'}: ${view.correct}`}>Correct: <strong>{view.correct}</strong></span>
      </>}
      <span className="im-strip-message" role="status" title={message}>{message}</span>
    </span>
    <button type="button" onClick={onDetails} aria-label="Open Initial Mastery details">Details</button>
  </aside>;
}
