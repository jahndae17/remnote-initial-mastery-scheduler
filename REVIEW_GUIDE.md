# Reviewer guide — Initial Mastery + FSRS

Version **0.1.10-development**, checked 2026-09-29. This is an unlisted personal-use submission candidate, not an approved or fully live-validated release. No submission is performed by the build scripts.

## What the plugin adds

The native review queue uses a five-point Initial Mastery target, then a two-point confirmation target for later SRS cycles. Success adds one; a mistake subtracts one, floored at zero. Session scores are volatile. Graduation and a pending FSRS proposal survive through native review metadata. Only the first rating in an SRS cycle updates FSRS; confirmation releases that proposed interval. Native rendering, grading and queue ordering stay with RemNote. See [README](README.md) for early-practice exceptions and existing-card adoption.

## Suggested reading order

| Source | Responsibility |
| --- | --- |
| `src/widgets/index.tsx` | Registers one scheduler, the queue strip and diagnostics popup. |
| `src/domain/engine.ts`, `types.ts` | Pure scheduling transitions and metadata types. |
| `src/domain/history.ts` | Validates receipts; reconstructs scores/counts from saved history; handles resets and undo. |
| `src/fsrs/adapter.ts` | Pinned ts-fsrs adapter, fixed settings and date serialization. |
| `src/coordinator/session.ts` | Session boundaries, eligibility, speculative callbacks and retry deduplication. |
| `src/integration/bridge.ts`, `session-writer.ts` | SDK reads/events, confirmed-only panel updates and serialized session-storage writes. |
| `src/integration/callback-shape.ts` | Anonymous callback-contract diagnostics. |
| `src/ui/`, `src/widgets/status.tsx`, `diagnostics.tsx` | Native-queue status strip and details/diagnostics UI. |

The bridge never appends a native review directly. It returns `nextDate` and namespaced `pluginData` to RemNote's scheduling callback. Preview calls do not commit scores. Source is readable TypeScript; production JavaScript is bundled/minified for loading, not intended as the primary review source.

## Permissions and data

- `requestNative: false`: sandboxed plugin; mobile remains disabled.
- `All: Read`: reads the active/recent cards, their source Rem, children and ancestry to check history, availability and content changes anywhere the scheduler is assigned. There is no whole-KB scan or direct Rem/card mutation API call.
- `KnowledgeBaseInfo: Read`: identifies KB switches and scopes the session. Both scopes are read-only; the scheduler callback still determines the next native review date.
- Card content and history are processed in memory. The session-storage panel contains card/KB identifiers, derived scores and scheduling status; diagnostics contain counters/shape summaries, not card text or full histories. They are not sent to an external analytics service.
- Durable FSRS state, graduation/adoption boundaries and pending-cycle metadata are returned in native review `pluginData`. RemNote may sync its own data under the user's normal settings. This is not a separate plugin database or counter.
- Application source adds no third-party network service, API key, telemetry or account. FSRS runs locally. SDK transport communicates with the RemNote host. Development hot reload connects to localhost; the production build does not use that development server.

## Submission requirements audit

| Requirement and source | Finding |
| --- | --- |
| Public source repository for JavaScript review — [Submitting Plugins](https://plugins.remnote.com/advanced/submitting_plugins) | Manifest points to the user's own repository. Anonymous GitHub API check on 2026-09-29 returned `private: false`, default branch `main`, Issues enabled. Publish the matching source before uploading its ZIP. |
| Required fields, valid version and short description — [Manifest](https://plugins.remnote.com/advanced/manifest) | Build validates using SDK 0.0.46, additionally rejects invalid/template repository URLs, mismatched package/manifest versions and descriptions of 200+ characters. Global ID availability and final uploader acceptance can only be checked by RemNote. |
| Personal-use uploads still require approval — [Unlisted Plugins](https://plugins.remnote.com/advanced/unlisted_plugins) | `unlisted: true` retained. This hides the public listing; it does not make the repository private or bypass review. |
| Minimal scopes and sandboxing — [Permissions](https://plugins.remnote.com/advanced/permissions) | Two read scopes justified above. No native-mode request, write scope or dynamic permission escalation. |
| Disclose third-party data transmission — [Submitting Plugins](https://plugins.remnote.com/advanced/submitting_plugins) | Explicit privacy section added to README; no plugin-added external service. |
| Do not duplicate Pro offerings — [Submitting Plugins](https://plugins.remnote.com/advanced/submitting_plugins) | Native card formats, answer checking and assignment controls remain subject to RemNote's access rules. The addition is the mastery/confirmation policy; no paid-feature unlocking code. RemNote explicitly documents [additional scheduler plugins](https://help.remnote.com/en/articles/6958056-custom-schedulers), but only its team can decide approval under this policy. |
| Build and upload a plugin ZIP — [Submitting Plugins](https://plugins.remnote.com/advanced/submitting_plugins) | Upload the development/plugin ZIP, not the source ZIP. Manifest, entry HTML and bundles are at its root. |

`supportUrl` now links to GitHub Issues; the official manifest docs make this optional. License notices, this guide and the validation report are included to aid review, not presented as additional RemNote-mandated fields. No mandatory icon, screenshots or changelog field was found in the cited submission/manifest pages; follow any additional requirements the live uploader presents.

## Reproduce checks and inspect the package

Use Node >=20 (tested with 24.4.1): `npm ci`, then `npm run verify`. That runs all tests, TypeScript, manifest checks, production compilation and ZIP packaging. Runtime dependencies remain pinned by the lockfile; SDK is 0.0.46 and ts-fsrs is 5.4.2. Full licenses are described in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).

The 0.1.10 refactor consolidates duplicate storage writers and panel construction, replaces mutually exclusive mode sets with one map, and removes two unused template CSS files. Scheduling/FSRS rules, receipt format, UI components and previous regression tests are unchanged. Four new tests cover storage ordering/deduplication, retry after failure, immutable queued snapshots, and independence of panel/diagnostic writes.

## Outstanding acceptance work

See [VALIDATION](VALIDATION.md). Automated tests do not establish host behavior. Full live graduation, a complete subsequent SRS cycle, native undo/corrections, every lifecycle boundary/card format, web, light theme and large-KB behavior remain incompletely validated. Prior live checks established saved 1/5 early learning, preview behavior, desktop strip placement and one queue exit. Do not describe this build as production-ready or claim RemNote approval based on the static audit.
