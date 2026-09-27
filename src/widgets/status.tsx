import { renderWidget, useTrackerPlugin as useTracker, WidgetLocation } from '@remnote/plugin-sdk';
import { VIEW_KEY, type PanelSnapshot } from '../integration/view';
import { StatusPanel } from '../ui/StatusPanel';
import '../ui/panel.css';
function Widget() {
  const snapshot = useTracker(plugin => plugin.storage.getSession<PanelSnapshot>(VIEW_KEY));
  const context = useTracker(plugin => plugin.widget.getWidgetContext<WidgetLocation.QueueBelowTopBar>());
  const kb = useTracker(plugin => plugin.kb.getCurrentKnowledgeBaseData());
  if (!snapshot || kb?._id !== snapshot.kb || (context?.cardId && context.cardId !== snapshot.view.cardId)) return null;
  return <StatusPanel view={snapshot.view} mode={snapshot.mode} feedback={snapshot.feedback} />;
}
renderWidget(Widget);
