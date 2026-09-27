import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { RemNoteBridge } from '../integration/bridge';
let bridge: RemNoteBridge | undefined;
async function onActivate(plugin: ReactRNPlugin) {
  bridge = new RemNoteBridge(plugin);
  await plugin.app.registerWidget('status', WidgetLocation.QueueBelowTopBar, { dimensions: { height: 'auto', width: '100%' } });
  await plugin.app.registerWidget('diagnostics', WidgetLocation.Pane, { dimensions: { height: 'auto', width: '100%' } });
  await plugin.app.registerCommand({ id: 'initial-mastery-diagnostics', name: 'Initial Mastery: Development diagnostics', action: async () => { await plugin.window.openWidgetInPane('diagnostics'); } });
  await bridge.start();
}
async function onDeactivate() { await bridge?.stop(); bridge = undefined; }
declareIndexPlugin(onActivate, onDeactivate);
