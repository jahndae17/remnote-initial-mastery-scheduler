import { renderWidget, usePlugin, useTrackerPlugin as useTracker, WidgetLocation } from '@remnote/plugin-sdk';
import { DIAGNOSTICS_KEY, type PanelSnapshot } from '../integration/view';
import { StatusPanel } from '../ui/StatusPanel';
import '../ui/panel.css';
function Diagnostics() {
  const plugin = usePlugin();
  const diagnostic = useTracker(plugin => plugin.storage.getSession(DIAGNOSTICS_KEY));
  const context = useTracker(plugin => plugin.widget.getWidgetContext<WidgetLocation.Popup>());
  const snapshot = context?.contextData as PanelSnapshot | undefined;
  return <main className="im-diagnostics"><button type="button" onClick={() => void plugin.widget.closePopup()}>Close diagnostics</button><h1>Initial Mastery · Development diagnostics</h1>
    <p>This build has not passed live RemNote acceptance testing. Use a disposable knowledge base.</p>
    {snapshot?.view && <StatusPanel view={snapshot.view} mode={snapshot.mode} feedback={snapshot.feedback} />}
    <p>Verify queue mode, callback history and saved pluginData, then native undo, session boundaries and widget placement. These observations do not mark a test as passed automatically.</p>
    <pre>{JSON.stringify(diagnostic ?? { status: 'Waiting for plugin activation' }, null, 2)}</pre>
    <p>No card text, answers or permanent attempt log are collected. These diagnostic counters disappear when the plugin restarts.</p>
  </main>;
}
renderWidget(Diagnostics);
