# Official RemNote documentation review

Reviewed against https://plugins.remnote.com/ and the shipped SDK 0.0.46 declarations for development version 0.1.2. This is a source/API review, not live RemNote certification.

| Area | Official reference | Finding/action |
| --- | --- | --- |
| Project layout | [Project Structure](https://plugins.remnote.com/advanced/project_structure) | `public/manifest.json`, `src/widgets/index.tsx`, separate React widgets, webpack and lockfile follow the documented layout. |
| Repository and manifest | [Manifest](https://plugins.remnote.com/advanced/manifest), [Unlisted Plugins](https://plugins.remnote.com/advanced/unlisted_plugins) | `repoUrl` is the plugin's actual GitHub source repository for code review. The localhost/template workarounds were incorrect. `manifestVersion: 1`, unique ID, sandboxed mode and disabled mobile are retained. `unlisted: true` hides the marketplace listing but uploaded plugins still require RemNote team approval. |
| Local testing | [Quick Start Guide](https://plugins.remnote.com/getting-started/quick_start_guide) | Run `npm run dev`, then Settings → Plugins → Build → Develop from localhost with `http://localhost:8080`. No marketplace approval is needed for this development workflow. README corrected to make this the primary testing route. |
| Widget registration | [Widgets](https://plugins.remnote.com/advanced/widgets) | Found and fixed missing registration of the diagnostics widget at `WidgetLocation.Pane` before `openWidgetInPane`. Status widget registration uses its file basename, automatic height and full width. |
| Reactive UI | [Tracker System](https://plugins.remnote.com/advanced/tracker) | Both widgets use the reactive plugin argument inside tracker callbacks. SDK 0.0.46 exports this hook as `useTrackerPlugin`; it is locally aliased to the documentation's `useTracker` name. |
| Scheduler registration | [SchedulerNamespace](https://plugins.remnote.com/api/classes/SchedulerNamespace) | Uses `registerCustomScheduler(name, parameters)` with the intended algorithm name and no custom parameters. |
| Scheduling result | [SpecialPluginCallbackInfo](https://plugins.remnote.com/api/interfaces/SpecialPluginCallbackInfo) | Returns `nextDate` and namespaced `pluginData` through `SRSScheduleCard`. Does not call native methods that append extra ratings. |
| Queue mode | [SpecialPluginCallbackInfo](https://plugins.remnote.com/api/interfaces/SpecialPluginCallbackInfo) | `GetNextCard` exposes normal/practice-all/in-order and permits null. Returning null leaves selection to the host. Documentation does not prove when the callback runs for this combination of contributions; unknown mode remains blocked. |
| Events and lifecycle | [Event Handling](https://plugins.remnote.com/advanced/events), [Widgets](https://plugins.remnote.com/advanced/widgets) | Global queue events use an undefined event key. The sandbox is destroyed when disabled; the bridge also clears its timer/state in deactivation. There is no focus/inactivity reset. Runtime event ordering remains an acceptance gate. |
| Storage | [StorageNamespace](https://plugins.remnote.com/api/classes/StorageNamespace) | Derived widget state uses session storage. Partial learning state is not written with `setLocal` or `setSynced`; durable scheduling metadata is returned with the native review. |
| Queue widget location | [WidgetLocation](https://plugins.remnote.com/api/enums/WidgetLocation) plus installed SDK | The online enum page does not list `QueueBelowTopBar`, but the pinned SDK explicitly declares it and its card context. Retain the requested location and validate it live; do not treat its presence in types as proof of runtime support. |

## Additional build fixes

- The upstream template's `.nvmrc` specified Node 16.15.1, while the selected ts-fsrs package requires Node >=20. Set `.nvmrc` to the tested Node 24.4.1 and declare Node >=20 in package metadata.
- Include Node configuration, ignore rules and this review in source packaging.
- Do not request a nonexistent index-widget stylesheet. Development uses injected styles; production loads CSS only for the two visual widgets.

## What this review does not establish

The public callback reference describes parameters and results, not the ordering of speculative calls versus saved reviews, precise persistence behavior, undo/correction behavior or guarantees about queue-mode observation. The current bridge checks these contracts conservatively and can stop with a diagnostic when they differ. The full live acceptance matrix remains in [VALIDATION.md](VALIDATION.md), including rich native card formats, edit/reset handling, actual theme integration and large-KB performance.

The uploader's public-repository and template-rejection rules were observed directly in the user's screenshots. Static SDK manifest validation alone is insufficient to certify an upload.
