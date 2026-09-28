import { keys, resetIndex, reviewKey } from '../domain/history';
import { OWNER, type Review } from '../domain/types';

/** One anonymous, volatile observation; no IDs, text, timestamps or review log. */
export function inspectCallbackHistory(callback: Review[], saved: Review[]) {
  const candidate = callback.at(-1);
  const prefix = callback.slice(0, -1);
  const matches = (a: Review[], b: Review[]) => JSON.stringify(keys(a)) === JSON.stringify(keys(b));
  const finiteDates = saved.every(r => Number.isFinite(r.date)) && !!candidate && Number.isFinite(candidate.date);
  return {
    callbackLength: callback.length, savedLength: saved.length,
    candidateFields: candidate ? Object.keys(candidate).sort() : [],
    savedEntryFields: saved.length ? Object.keys(saved[saved.length - 1]).sort() : [],
    candidateDateType: typeof candidate?.date,
    candidateScoreType: typeof candidate?.score,
    candidateIsCram: candidate?.isCram === undefined ? 'missing' : candidate.isCram ? 'true' : 'false',
    candidateMatchesSaved: !!candidate && saved.some(r => reviewKey(r) === reviewKey(candidate)),
    candidateSharesSavedTimestamp: !!candidate && saved.some(r => r.date === candidate.date),
    candidateAfterSaved: finiteDates ? saved.every(r => r.date < candidate!.date) : null,
    prefixMatchesSaved: matches(prefix, saved),
    prefixMatchesSavedSuffix: prefix.length <= saved.length && matches(prefix, saved.slice(saved.length - prefix.length)),
    prefixMatchesSinceReset: matches(prefix, saved.slice(resetIndex(saved) + 1)),
    savedHistoryChronological: saved.every((r, i) => !i || saved[i - 1].date <= r.date),
    savedOwnedMetadataEntries: saved.filter(r => r.pluginData?.[OWNER]).length,
    callbackOwnedMetadataEntries: callback.filter(r => r.pluginData?.[OWNER]).length,
  };
}
