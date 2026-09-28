import React from 'react';
import type { StatusView } from '../domain/types';
export function Segments({ label, value, max }: { label: string; value: number; max: number }) {
  return <span className="im-progress" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span className="im-segments" aria-hidden="true">{Array.from({ length: max }, (_, i) => <span key={i} className={i < value ? 'im-segment filled' : 'im-segment'} />)}</span>
    <strong>{value}/{max}{value === max ? ' ✓' : ''}</strong>
  </span>;
}
export function StatusPanel({ view, mode = 'normal', now = Date.now(), feedback }: { view: StatusView; mode?: string; now?: number; feedback?: string }) {
  if (view.stage !== 'error' && mode === 'cram') return <aside className="im-panel" role="status"><strong>Extra practice · progress paused</strong><p>RemNote marked this attempt as extra practice. Initial Mastery and SRS confirmation do not advance.</p></aside>;
  if (view.stage === 'unmanaged') return null;
  if (view.stage === 'error') return <aside className="im-panel im-error" role="alert"><strong>Initial Mastery · integration check</strong><p>{view.error}</p><small>Development build · open Initial Mastery: Development diagnostics.</small></aside>;
  const existing = view.origin === 'existing';
  const badge = view.stage === 'mastery' ? 'Initial Mastery' : existing ? 'SRS · Existing card' : 'SRS · Graduated';
  const days = view.nextDate ? Math.max(1, Math.round((view.nextDate - now) / 86400000)) : 0;
  const message = view.message.startsWith('Confirmed') && days ? `Confirmed · next review in ${days} ${days === 1 ? 'day' : 'days'}` : view.message;
  return <aside className="im-panel" aria-label="Initial Mastery and SRS progress">
    <div className="im-row"><span className="im-badge">{badge}</span><small className="im-dev">Development</small>
      <span className="im-field"><span>Initial Mastery</span>{existing ? <strong>Not required</strong> : <Segments label="Initial Mastery" value={view.mastery} max={5} />}</span>
      {view.stage === 'srs' && <span className="im-field"><span>Confirmation</span><Segments label="Current SRS confirmation" value={view.confirmation} max={2} /></span>}
      <span className="im-field"><span>Correct since {existing ? 'adoption' : 'graduation'}</span><strong>{view.correct}</strong></span>
    </div>
    <div className="im-message" role="status" aria-live="polite">{mode !== 'normal' ? (mode === 'unknown' ? 'Waiting for native queue mode.' : 'Practice mode · progress paused') : feedback || message || (view.stage === 'mastery' ? 'Correct +1 · mistake −1 · reach 5 this session' : 'Two recalls this session release the next interval')}</div>
  </aside>;
}
