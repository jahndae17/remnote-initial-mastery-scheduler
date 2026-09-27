import { renderWidget, useTrackerPlugin as useTracker } from '@remnote/plugin-sdk';
import { DIAGNOSTICS_KEY } from '../integration/view';
import '../ui/panel.css';
function Diagnostics() {
  const diagnostic = useTracker(plugin => plugin.storage.getSession(DIAGNOSTICS_KEY));
  return <main className="im-diagnostics"><h1>Initial Mastery · Development diagnostics</h1>
    <p>This build has not passed live RemNote acceptance testing. Use a disposable knowledge base.</p>
    <p>Verify queue mode, callback history and saved pluginData, then native undo, session boundaries and widget placement. These observations do not mark a test as passed automatically.</p>
    <pre>{JSON.stringify(diagnostic ?? { status: 'Waiting for plugin activation' }, null, 2)}</pre>
    <p>No card text, answers or permanent attempt log are collected. These diagnostic counters disappear when the plugin restarts.</p>
  </main>;
}
renderWidget(Diagnostics);

