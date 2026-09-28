# Architecture and host contracts

## Components

- `src/domain/`: pure Initial Mastery and confirmation transitions, receipt validation, native-history counts and reset boundaries.
- `src/fsrs/`: one deterministic FSRS adapter with JSON-safe date serialization. Only graduation and the first rating of a new SRS cycle call it.
- `src/coordinator/`: memory-only session anchors and preview cache. Reconstructs progress from saved receipts after each observation; callbacks never increment counters.
- `src/integration/`: SDK adapter, queue lifecycle, mode observer and ephemeral view publication.
- `src/ui/` and `src/widgets/`: read-only React panel and development diagnostics. No card content or answer input is rendered by the plugin.

## Persisted contract

Each accepted scheduling result returns a namespaced `pluginData.initial_mastery_scheduler` receipt. RemNote must attach that receipt to the corresponding native review. Schema 1 includes the native card ID, review index, history fingerprint, attempt kind, scheduling outcome, next date and durable state. Durable state includes a graduation/adoption boundary, serialized FSRS memory and optionally the pending cycle's first-review index and proposed interval. It contains no partial score or permanent correct-answer counter. No extra review is appended by the plugin.

Session anchors are arrays of history identity keys held only in the index plugin's memory. They establish the session boundary and are discarded on end. Content revisions are also memory-only. Ephemeral SDK session storage publishes a read-only derived view to the widget and aggregate diagnostic counts; it is cleared on activation and session end. No `setLocal` or `setSynced` calls store learning state.

The lifetime count is computed from native GOOD/EASY reviews after the graduation boundary, or from the adoption boundary inclusive. Administrative scores, isCram reviews and plugin-marked excluded practice are omitted. This depends on the host reliably distinguishing excluded practice in saved history.

## Speculation and commit protocol

The bridge accepts full saved history plus one candidate, or the exact history after the latest native reset plus one candidate. The latter is normalized by restoring the retained reset prefix; arbitrary truncations remain errors. Receipts always use full-history indices. Preview calculations are memoized by complete review identities, within a card and content revision. A repeated callback whose history is already saved returns its original receipt result. Rereading saved history confirms progress. A matching saved rating without returned metadata is an integration error. Different preview ratings can each calculate a possible FSRS result; only the result that is actually saved becomes the one logical FSRS update for the cycle.

Commit-first callbacks without metadata, missing native card IDs, unknown queue modes, inconsistent history and invalid receipts stop with a diagnostic. This is intentional pending live validation; no guessed scheduling result advances progress. RemNote's behavior when a callback throws also needs live validation.

Undo that removes the history suffix naturally restores the preceding durable snapshot, count and session score. Undo then rerating applies a replacement once. If RemNote mutates an old saved rating in place, the fingerprint detects inconsistent metadata and stops; an adapter for that host behavior cannot be verified without live observations. Session boundaries from past sessions are intentionally not persisted, so arbitrary historic changes cannot always be replayed faithfully.

## Lifecycle and content

The bridge observes queue enter/exit/load/complete/reveal and URL changes. A 1.5-second reconciliation poll checks queue state, KB, current history and content; it is not an inactivity timeout. Global Rem-change subscriptions are avoided because plugin-state writes can generate those notifications. View and diagnostics writes are serialized and unchanged values are suppressed. Session generation guards discard stale asynchronous reads. `GetNextCard`, when supplied, observes native mode and returns null. The live scheduler-only host has not supplied it. Explicit candidate `isCram: false` permits only that calculation; it never sets session mode. Explicit cram or known excluded mode takes precedence. Saved-review flag semantics remain a live gate.

Content signatures cover the source Rem's rich text, back text, type, children, direct child text and ancestor text. Deep nested answer dependencies, image-occlusion metadata and referenced/table-generated dependencies may need additional SDK subscriptions after native format testing. No format adapters are implemented: native RemNote renders all cards. Card-enable checks use the source Rem's enabled state and practice direction; grouped-card edge cases remain live checks.

## Sources

- [SDK callback contract](https://plugins.remnote.com/api/interfaces/SpecialPluginCallbackInfo)
- [Scheduler API](https://plugins.remnote.com/api/classes/SchedulerNamespace)
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- [Official template](https://github.com/remnoteio/remnote-plugin-template-react)

The shipped SDK declarations are the compile-time authority. Public declarations do not establish undocumented runtime callback timing or persistence behavior.
