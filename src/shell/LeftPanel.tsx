import { Layers as LayersIcon, PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { Palette } from '../palette/Palette';
import { Layers } from '../layers/Layers';
import { IconButton } from '../components/ui';

export function LeftPanel() {
  const leftTab = useUi((s) => s.leftTab);
  const setLeftTab = useUi((s) => s.setLeftTab);
  const collapsed = useUi((s) => s.leftCollapsed);
  const toggleLeft = useUi((s) => s.toggleLeft);
  const flyout = useUi((s) => s.leftFlyout);
  const setFlyout = useUi((s) => s.setLeftFlyout);
  const startPrompt = useUi((s) => s.startPrompt);
  const screens = useProject((s) => s.doc.screens);

  if (collapsed) {
    return (
      <aside className="left-panel" data-collapsed="true">
        <div className="left-collapse">
          <IconButton label="Show panels" size="sm" onClick={toggleLeft}>
            <PanelLeftOpen size={15} />
          </IconButton>
          <IconButton
            label="Insert"
            size="sm"
            active={leftTab === 'insert'}
            onClick={() => {
              setLeftTab('insert');
              toggleLeft();
            }}
          >
            <Plus size={15} />
          </IconButton>
          <IconButton
            label="Layers"
            size="sm"
            active={leftTab === 'layers'}
            onClick={() => {
              setLeftTab('layers');
              toggleLeft();
            }}
          >
            <LayersIcon size={15} />
          </IconButton>
        </div>
      </aside>
    );
  }

  return (
    <aside className="left-panel" data-flyout={flyout}>
      <div className="panel-tabs">
        <button
          type="button"
          className="panel-tab"
          data-active={leftTab === 'insert'}
          onClick={() => {
            setLeftTab('insert');
            setFlyout(true);
          }}
        >
          Insert
        </button>
        <button
          type="button"
          className="panel-tab"
          data-active={leftTab === 'layers'}
          onClick={() => {
            setLeftTab('layers');
            setFlyout(true);
          }}
        >
          Layers
        </button>
        <IconButton
          label={flyout ? 'Close panel' : 'Hide panels'}
          size="sm"
          onClick={() => (flyout ? setFlyout(false) : toggleLeft())}
        >
          {flyout ? <X size={14} /> : <PanelLeftClose size={14} />}
        </IconButton>
      </div>
      {leftTab === 'insert' ? <Palette /> : <Layers />}
      {screens.length === 0 && (
        <button
          type="button"
          className="btn btn-sm btn-ghost left-ask"
          onClick={() => {
            startPrompt('Design me a small web app for keeping notes.');
            setFlyout(false);
          }}
        >
          Ask muse instead →
        </button>
      )}
    </aside>
  );
}
