# Initial Mastery + FSRS

**0.1.3 development build — live RemNote integration is not validated.** Use a signed-in disposable knowledge base for the acceptance checklist in [VALIDATION.md](VALIDATION.md). Unknown callback contracts stop advancement and are shown in diagnostics; this is not yet a release-ready scheduler.

This is a fresh TypeScript/React project from the [official RemNote React template](https://github.com/remnoteio/remnote-plugin-template-react). Its ID is `initial_mastery_scheduler`. It shares no session engine, grading, adapters, tests or packages with the earlier Initial Mastery prototype. Installation does not assign or change any card's scheduler.

**Source repository:** [jahndae17/remnote-initial-mastery-scheduler](https://github.com/jahndae17/remnote-initial-mastery-scheduler). Version 0.1.2 uses this plugin's own public repository in its manifest. RemNote rejected the localhost URL in 0.1.0 and the template reference in 0.1.1; use the new package instead. The build validator rejects those earlier references. Actual upload acceptance still needs verification. Source publication is separate from marketplace publication.

## Behavior

RemNote provides its native card display, answer checking, rating buttons and review history. The plugin calculates scheduling results and displays a compact progress panel below the queue top bar.

| Stage | Success: Recalled with effort / Easily recalled | Mistake: Forgot / Partially recalled |
| --- | --- | --- |
| Initial Mastery | +1, to a maximum of 5 | −1, to a minimum of 0 |
| SRS confirmation | +1, to a maximum of 2 | −1, to a minimum of 0 |

Initial Mastery is a five-point score, not a streak. Until 5/5 the plugin requests another review after one minute; RemNote chooses queue order and may show it earlier. The fifth point graduates the card and initializes FSRS with that rating. Graduation immediately schedules the first interval without another confirmation pair.

After graduation, the first rating of each cycle updates FSRS once. That result stays fixed, even if later confirmation attempts are wrong. Until confirmation reaches 2/2, the plugin requests one-minute repeats. It then schedules the proposed interval from confirmation completion. The first rating's time remains the actual FSRS review timestamp.

The panel shows stage, Initial Mastery score, current SRS confirmation and **individual successful answers since graduation**. Initial learning and the graduating rating do not count. Successful answers from unfinished SRS cycles do count. Existing reviewed cards show **SRS · Existing card**, **Not required**, and successes **since adoption**. Adoption occurs on the first saved review using this scheduler; older eligible native reviews are replayed into FSRS without rewriting history or inventing a graduation date.

Partial scores disappear on queue exit/completion, reload, app restart, knowledge-base switch or plugin disable. Focus changes and skipping do not reset them. Graduation, pending FSRS proposals and saved reviews survive. Content edits reset partial scores. Native schedule reset starts a new Initial Mastery lifetime. Cram/practice-all do not advance scores; native controls remain in charge of those sessions.

FSRS uses `ts-fsrs` **5.4.2**, desired retention **90%**, default weights, fuzz disabled, short-term scheduling disabled and empty learning/relearning steps. There is no optimizer, no native scheduler delegation, and later failures never return a graduated card to Initial Mastery.

## Build

Use Node.js 20 or newer (tested with 24.4.1) and npm. From this directory:

```sh
npm ci
npm test
npm run build
```

The SDK is pinned to **0.0.46**. The lockfile pins the full dependency tree. Build output:

- `artifacts/InitialMasteryScheduler-development.zip`: plugin manifest and bundled widgets at the archive root.
- `artifacts/InitialMasteryScheduler-source.zip`: source, tests, lockfile and documentation, without node_modules.
- `dist/`: unpacked plugin build.

## Install and assign in a disposable knowledge base

1. Sign in to RemNote desktop or web and open a disposable knowledge base.
2. From this project directory, run `npm run dev` and keep the process running. On the same computer, open **Settings → Plugins → Build → Develop from localhost** and enter **`http://localhost:8080`**. This is the [official local testing workflow](https://plugins.remnote.com/getting-started/quick_start_guide); it does not require marketplace approval. The development server and plugin manifest have been checked at that address; installation inside a signed-in RemNote client remains a live acceptance check.
3. In **Settings → Schedulers**, create a scheduler using the algorithm **Initial Mastery + FSRS**. If it does not appear, open the plugin diagnostics and stop the acceptance run.
4. Assign that scheduler to a test document using **Customize Spaced Repetition Scheduler** from its `/` menu or omnibar, or the scheduler's **Add Documents or Folders** action. Keep the global default unchanged while validating.
5. Start ordinary spaced-repetition practice for that document. Open **Initial Mastery: Development diagnostics** from the command palette and complete the integration gates before continuing through the acceptance matrix.

**Upload Plugin is a separate submission workflow.** Uploaded plugins still require RemNote team approval even with `unlisted: true`, as explained in [Unlisted Plugins](https://plugins.remnote.com/advanced/unlisted_plugins). Use localhost for immediate development testing; the ZIP is a build artifact, not an approval-free installation route.

The plugin requests read-only `All` and `KnowledgeBaseInfo` permissions. If an older local installation reports that `kb.getCurrentKnowledgeBaseData` lacks Read permission, remove that development installation and add it again through **Develop from localhost** so RemNote can load the corrected manifest and permission request.

Version 0.1.3 opens diagnostics in a dismissible popup instead of a document pane, to avoid the live client's “Cannot parse window string” error. Close any old diagnostics pane, reload RemNote, then use **Ctrl+K → Initial Mastery: Development diagnostics**. Confirm the popup reports `0.1.3-development`. Popup behavior and practice navigation still require live verification.

Scheduler assignment follows [RemNote's documented settings workflow](https://help.remnote.com/en/articles/6958056-custom-schedulers). Previously reviewed assigned cards keep their native history and existing due date until the next review. Cards never assigned to this algorithm keep their native scheduling behavior.

To stop testing, assign the test document back to a built-in scheduler before disabling this plugin. No migration to or from the older prototype is performed. No real cards were modified in development.

## Boundaries

The official RemNote documentation was checked for the 0.1.2 build; see [DOCS_REVIEW.md](DOCS_REVIEW.md) for references, fixes and unresolved runtime assumptions.

Read [VALIDATION.md](VALIDATION.md) before installation: the queue-mode callback, saved metadata, callback timing, widget location, undo semantics and lifecycle behavior remain live acceptance gates. In-place rewriting of old ratings currently stops with a diagnostic rather than silently reconstructing an unknowable past session. Ordinary native undo followed by rerating is supported by the tested engine.

Native queue ordering and controls apply. This plugin does not enforce a separate practice mode or suppress other schedulers. Mobile, simultaneous reviews of one card on multiple devices and marketplace publication are outside version one's validated scope. Normal operation reads the current/previous card and their immediate content context; it does not scan the whole knowledge base. No analytics, remote service or permanent plugin-owned attempt log is used.
