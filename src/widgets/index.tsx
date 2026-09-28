import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { RemNoteBridge } from '../integration/bridge';
let bridge: RemNoteBridge | undefined;
async function onActivate(plugin: ReactRNPlugin) {
  bridge = new RemNoteBridge(plugin);
  await plugin.app.registerWidget('status', WidgetLocation.QueueBelowTopBar, { dimensions: { height: 128, width: '100%' } });
  // Keep diagnostics out of the persisted pane layout: the live client rejected
  // the widget pane string on both opening diagnostics and entering practice.
  await plugin.app.registerWidget('diagnostics', WidgetLocation.Popup, { dimensions: { height: 480, width: 640 } });
  await plugin.app.registerCommand({ id: 'initial-mastery-diagnostics', name: 'Initial Mastery: Development diagnostics', action: async () => { await plugin.widget.openPopup('diagnostics', undefined, true); } });
  await bridge.start();
}
async function onDeactivate() { await bridge?.stop(); bridge = undefined; }
declareIndexPlugin(onActivate, onDeactivate);
