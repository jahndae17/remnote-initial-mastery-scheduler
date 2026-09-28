# Validation status — development build

## Integration gate, recorded before implementation

On 2026-09-27 the available RemNote browser opened an empty **Guest / Demo mode** knowledge base (`/w/null/notes~`). No signed-in disposable knowledge base is available. The prior guest installation attempt did not finish. This run does not retry that unsupported workflow or change real cards.

Scheduler registration, speculative callback history, returned `pluginData` persistence, native queue lifecycle, native undo, and `QueueBelowTopBar` placement are **unverified live acceptance gates**. They must pass in a signed-in disposable KB before this plugin is considered ready for real cards.

Development proceeds with a pure scheduling engine and an isolated SDK bridge implementing explicit, tested host contracts. A read-only diagnostics view will expose contract observations without storing card content or attempt logs. Passing unit tests does not claim that RemNote satisfies those host contracts.

This is a new project scaffolded from the official RemNote React template. No source or test code is copied from the earlier Initial Mastery prototype.

## Automated and local checks

**0.1.9 SRS and responsiveness checks:** All 78 automated tests pass. New coverage runs three consecutive due SRS cycles with native cram flags: early optional practice is excluded; a due success starts 1/2; a mistake returns to 0/2; two subsequent successes release the first rating's proposed interval. FSRS advances exactly once per cycle, and the actual first-rating timestamp is retained. Existing tests cover pending-cycle restart, individual success counts and undo. These tests simulate timestamps and saved history; they do not establish a full live multi-day SRS cycle.

Four concurrent rating previews now share one in-flight snapshot rather than reading it four times; a later calculation still reads fresh data. Independent card reads run concurrently, and refresh requests arriving during a read are coalesced into a follow-up instead of dropped. Save checks run briefly at 80/240/560/1200 ms, then return to the 1.5-second idle poll. Tests verify saved progress appears before that idle poll. No fixed end-to-end speedup is claimed: native SDK and rendering time remain outside the plugin's control.

Exit tests hold an SDK card read unresolved, exit the queue, and verify session/panel clearing without releasing that read. Follow-up timers stop and the eventual stale callback is rejected. A separate test covers navigation before QueueExit delivery, without publishing a spurious integration error. Successful callbacks no longer await diagnostics writes. In-flight SDK transport calls cannot be cancelled by this SDK; their late results are discarded.

**Live desktop exit check:** On the designated Initial Mastery Test document, the queue strip rendered correctly on the question and answer sides. Clicking the native queue Close control removed the review panel by the first screenshot captured after the click; a subsequent observation showed the document restored and the panel still absent. No rating was submitted during this check. This is one successful exit observation, not a measured latency benchmark or proof that every source of native navigation delay is resolved.

**0.1.8 early-learning correction:** The user's submitted diagnostics showed 76 non-cram previews and 19 cram submissions; owned pluginData was present in saved history. The old blanket exclusion rejected all actual learning answers. At the user's direction, unfinished Initial Mastery now accepts native early/practice-all ratings. Pending confirmation accepts early repeats unless the queue is explicitly practice-all/in-order. Completed SRS cycles continue excluding extra practice. Accepted native cram flags remain unchanged; an `acceptedEarly` receipt field allows saved-history score reconstruction. Previously excluded attempts are not retroactively counted.

All 72 automated tests pass, including true-flag saved ratings reaching 1/5 and 5/5, reset-trimmed callbacks, repeated previews, graduation replay, mistakes, session restart, undo, pending confirmation, historical counts and post-graduation exclusion. The bridge test confirms the widget stays in learning mode and records a saved 1/5 result rather than pausing. `lastSavedResult` is a single anonymous memory-only diagnostic summary, cleared at session boundaries; it is not a permanent counter or attempt log.

**Direct live saved-rating check:** Three controlled correct ratings were submitted on cards in the user's designated test document during debugging. A timing issue was also found: queue navigation can precede visibility of the saved history. The bridge now rechecks at most four recent candidate cards for up to 15 seconds, in addition to current/previous-card reads; abandoned previews expire without adding progress. After the correction, live diagnostics reported one true-flag submission following four false-flag previews, `lastSavedResult: { stage: mastery, mastery: 1, confirmation: 0, correct: 0, acceptedEarly: true, outcome: repeat }`, and null lastError/lastFailure. Thus a real saved early-practice rating now reaches 1/5. Full live graduation at five, confirmation completion and undo remain outstanding; those are covered by automated tests only.

**0.1.7 correction, 2026-09-28:** All 68 automated tests and TypeScript checks pass. The bridge accepts exact reset-trimmed histories, uses explicit non-cram flags per calculation when GetNextCard is absent, and still excludes cram/known practice-all modes. Tests cover graduation, replay, retry and undo across the reset boundary; arbitrary omissions remain blocked. Separate latest shapes by cram flag and a retained last failure prevent later excluded calls from hiding the diagnostic evidence. Global Rem-change refreshes are removed and unchanged diagnostic writes are suppressed.

Direct desktop inspection in the user's designated test document confirmed that the new calculation accepts rating previews after a reset and all four native rating buttons display one-minute intervals. Revealing the answer did not submit a rating. Saved metadata, actual graduation, confirmation and undo remain unverified. The older 128-pixel multiline panel visibly overlapped the card region. Version 0.1.7 replaces it with a 32-pixel single row and a Details popup for full text; see the live follow-up below for the final placement observation.

**Live desktop follow-up:** At the observed dark-theme desktop size, the new queue row fits above the card without overlap and shows five segments, 0/5, the success total, guidance and Details. Details opens the 640×480 popup containing the full captured status and diagnostics. The running build reports `0.1.7-development`, four non-cram rating-preview callbacks, exact post-reset prefix matches, and null lastError/lastFailure. No rating was submitted during this inspection. This verifies this preview case and desktop placement, not saved-review behavior, other sizes/themes or long-running jitter.

**Observed cram contract and sizing correction in 0.1.6:** The user's latest callback has explicit `isCram: true`, a timestamp newer than saved history, and a prefix matching history since the last reset. This establishes exclusion for that attempt, not normal-mode semantics. Cram/known extra-practice exclusion now precedes full-history and normal-mode checks. It returns the existing finite due date and an excluded receipt; it does not reconstruct history, advance scores, or call FSRS. Tests cover pending FSRS preservation, unknown-mode one-entry cram callbacks, retries and unknown due-date rejection. All 61 automated tests passed before the final diagnostic-counter addition; build/type checks validate that addition.

The second recording confirms persistent content clipped in a shallow queue-widget frame, with movement while polling. Automatic height is replaced with a 128-pixel native widget and a scrollable 128-pixel content wrapper. Identical status snapshots are no longer written on every poll; writes are serialized. No automatic collapse is attempted for unmanaged cards in this development build. Native sizing and jitter still need user verification. No normal-practice scheduling gate is marked passed.

**Recording and callback observations in 0.1.5:** The user's 2026-09-28 recording shows a clipped integration-error banner briefly appearing between the queue top bar and card content. The bridge was replacing callback errors with normal/unmanaged status during polling. Errors now remain associated with their card until successful calculation or the session ends; the widget uses a flow-root wrapper so child margins are included in automatic height measurement. Eleven bridge tests pass, including persistence across polling, isolation between cards, and recovery without adding a review. Live layout still needs confirmation.

The user confirmed scheduler assignment and supplied callback shapes `callback:1-saved:6` and `callback:1-saved:10`, with no observed GetNextCard. This fails the original complete-history assumption. Version 0.1.5 records only the latest anonymous shape (field names, types, chronology/matching booleans and metadata counts) and callback entry counts, including callbacks that fail before context lookup completes. It does not silently concatenate unknown histories or assume normal practice. **Scheduling acceptance remains blocked** pending those observations; no mastery/graduation claim is made. Extracted recording frames and decoder dependencies remain local in ignored artifacts and are excluded from source/package publication.

**SDK object correction in 0.1.4:** The user's queue displayed `rem.getEnablePractice is not a function`. Inspection of the installed SDK 0.0.46 implementation confirmed `Card.getRem()` directly returns transport data, whereas `RemNamespace.findOne()` constructs a Rem object with methods. The bridge now loads the card's Rem through `plugin.rem.findOne(card.remId)`. A regression test uses real SDK CardNamespace/RemNamespace objects over a simulated transport, verifies saved-only score updates and edits, and continues rejecting disabled/deleted cards. All nine bridge tests pass. Live queue verification remains outstanding.

**User-assisted live observations, 2026-09-28:** The corrected knowledge-base permission allowed the diagnostics view to display, with no recorded error while idle. The user then reported “Cannot parse window string” containing a widget pane reference when opening diagnostics and starting practice. Version 0.1.3 replaces diagnostics' Pane API with the documented Popup API and a close button. This is a targeted workaround, not proof of a RemNote root cause or successful queue integration. Close the old diagnostics pane before reloading. Popup opening/closing and practice navigation need retesting; no scheduling acceptance gate has passed yet.

**Repository correction in 0.1.2:** RemNote rejected 0.1.0's localhost `repoUrl`, then rejected 0.1.1's template URL with “Repo URL must be your own public GitHub repo, not the template repo.” The prior format-only workaround was insufficient. The user supplied and authorized publishing to [jahndae17/remnote-initial-mastery-scheduler](https://github.com/jahndae17/remnote-initial-mastery-scheduler), which was verified public in GitHub. Version 0.1.2 points to this actual project repository. The validator also rejects template references. Retire the earlier plugin ZIPs; the new package still needs actual uploader and live scheduler acceptance testing.

Tested on Windows, Node 24.4.1, npm 11.4.2, SDK 0.0.46 and ts-fsrs 5.4.2.

| Check | Result |
| --- | --- |
| Engine, FSRS, session/history and SDK-boundary simulation | Passed in automated suite |
| React panel semantic/accessibility assertions | Passed in automated suite |
| TypeScript compilation | Passed |
| Manifest validation using pinned SDK parser | Passed |
| Production webpack build and plugin/source ZIP generation | Passed; standard bundle-size and stale Browserslist warnings |
| Standalone rendered panel in browser | Light, dark and narrow layouts inspected with sample data; text, segments and counters readable |
| Real RemNote acceptance | Signed-in desktop preview inspection is now available; complete saved-review and lifecycle acceptance remains outstanding |

The automated suite covers 4→mistake→3, floors, Easy +1, fifth-point graduation, confirmation progress, first-rating interval freezing, completion-relative release, retained FSRS review timestamp, new cycles, session loss, pending recovery in a fresh coordinator, deterministic FSRS, preview idempotency, failed writes, missing pluginData, native-history undo, corrected replacement ratings, existing-card adoption, skipped/focused cards, KB switches, content edits, disabled/deleted cards, reset lifetimes, administrative/cram/practice-all exclusions, lifetime counts and serialization. A fake SDK host verifies registration, event reactions, completion, late-read cancellation and that no whole-KB scan or direct review write occurs. It does **not** verify RemNote itself.

## Gates to run first in a signed-in disposable knowledge base

1. Install the ZIP and verify the algorithm appears in Settings → Schedulers. Assign it to one disposable test document. Verify no other assignment or existing due date changed.
2. Open diagnostics. `GetNextCard` has not arrived in the observed scheduler-only client. Verify native early ratings count before graduation and during eligible pending confirmation, with an acceptedEarly receipt, while optional extra ratings after a completed SRS cycle remain excluded. Missing flags without a known mode remain blocked.
3. Capture previews and actual ratings. Callback history must append one candidate to full saved history or to the exact suffix after the latest reset. Preview/retry calls must not produce saved score changes. A host that saves first without metadata needs a different bridge protocol.
4. Verify returned namespaced `pluginData` is saved on the exact chosen native review, with history order and timestamp identities preserved. Native history must remain the only commit authority. No extra review should be generated by the plugin.
5. Confirm queue enter/exit/load/complete events, end-screen behavior and KB identification. Verify returning focus never ends a session. Test exit, completion, reload, restart, KB switch and plugin disable independently.
6. Confirm `QueueBelowTopBar` renders on question and answer sides, reactive updates arrive after a save, and the panel neither obscures native controls nor exposes any card answer. Verify RemNote's actual theme propagation and widget height handling.
7. Undo graduation, undo a first SRS rating, undo confirmation completion, and change a rating through native undo/rerate. Verify saved `pluginData` is removed/restored consistently with native history.

## Remaining live acceptance matrix

- Initial Mastery: four successes, mistake, then two successes. Confirm 3/5 after the mistake and graduation on the final answer. Confirm all native attempts remain visible and the displayed SRS total stays zero through graduation.
- SRS: success/success; success/mistake/success/success; mistake/success/success. Inspect proposed interval, persisted FSRS reps, first-rating timestamp and final due time. Later errors must not change the proposal.
- Abandon a cycle after the first rating. Reopen and verify 0/2 with the same proposal. Two new successes release it; lifetime correct counts all eligible successes from both sessions.
- Native schedule reset, new content, deletion, disable, sync/history changes and failed writes. Verify no false graduation or duplicated FSRS event.
- Existing reviewed cards: keep history and current due date until reviewed, adopt directly into SRS and count only successes since adoption.
- Basic/reverse, grouped cloze, lists, multi-step, multiple choice, image occlusion, tables and rich media: verify native rendering/checking, independent native card IDs, edit detection and enabled-state handling.
- Desktop and web, actual light/dark themes, narrow queue panes and a representative large KB. Verify only current/previous-card reads occur and the interface remains responsive.

## Known gaps and conservative behavior

- Unknown mode combined with a missing non-cram flag, missing card IDs, commit-first callbacks without metadata, inconsistent history, and missing saved metadata stop advancement with diagnostics. Saved-review behavior still needs validation. The host's error handling/fallback also needs validation.
- Native suffix undo and rerating are implemented and simulated. Arbitrary in-place changes to older reviews invalidate receipt fingerprints and stop with a diagnostic. Automatic reconciliation of that behavior is not implemented; past volatile session boundaries cannot be recovered reliably.
- Content edit detection currently covers the source Rem, its direct children and ancestor text. Deep nested answers, references, table dependencies and image-occlusion metadata may require more subscriptions. Those formats remain native-rendered but their edit-reset behavior is not yet validated.
- Before the first scheduler callback or owned receipt, the SDK bridge cannot prove a card's assignment, so the panel stays hidden. Reassignment away from the plugin can leave historical badges visible until a new session; scheduling itself is controlled by RemNote's assignment. A reliable effective-assignment signal remains a UI integration check.
- Saved early-learning inclusion relies on an acceptedEarly receipt; old excluded markers remain excluded. When GetNextCard is unavailable, the host's native cram flag does not distinguish deliberate practice-all from an early repeat during pending confirmation. Both count toward that pending pair; after completion both are excluded. Explicit practice-all/in-order modes remain excluded after graduation.
- No real KB, large-KB performance, mobile, concurrent cross-device review or marketplace acceptance was tested. SDK declarations and simulated-host tests are not substitutes for these gates.

## Delivery decision

Deliver as a clearly labelled development build, as authorized by the user. Live acceptance and the listed unsupported host behaviors remain unfinished. The source, reproducible build, plugin ZIP, source ZIP, installation instructions and panel preview are supplied for the next validation pass.
