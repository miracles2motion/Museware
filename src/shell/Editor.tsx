import { Layers, LayoutGrid, Play, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { Topbar } from './Topbar';
import { LeftPanel } from './LeftPanel';
import { Statusbar } from './Statusbar';
import { Canvas } from '../canvas/Canvas';
import { Inspector } from '../inspector/Inspector';
import { AgentRail } from '../rail/AgentRail';

export function Editor() {
  const setLeftTab = useUi((s) => s.setLeftTab);
  const setLeftFlyout = useUi((s) => s.setLeftFlyout);
  const setMobileRail = useUi((s) => s.setMobileRail);
  const setRunMode = useUi((s) => s.setRunMode);
  const startPrompt = useUi((s) => s.startPrompt);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const screens = useProject((s) => s.doc.screens);
  const railCollapsed = useUi((s) => s.railCollapsed);

  return (
    <div className="app-shell">
      <Topbar />
      <div className="workspace" data-rail={railCollapsed ? 'collapsed' : 'open'}>
        <LeftPanel />
        <Canvas />
        <Inspector />
        <AgentRail />
      </div>
      <div className="mobile-bottom-bar">
        <button
          type="button"
          onClick={() => {
            setLeftTab('insert');
            setLeftFlyout(true);
          }}
        >
          <LayoutGrid size={14} /> Insert
        </button>
        <button
          type="button"
          onClick={() => {
            setLeftTab('layers');
            setLeftFlyout(true);
          }}
        >
          <Layers size={14} /> Layers
        </button>
        <button type="button" onClick={() => useUi.getState().setPropertiesOpen(true)}>
          <SlidersHorizontal size={14} /> Inspect
        </button>
        <button type="button" onClick={() => setMobileRail(true)}>
          <Sparkles size={14} /> muse
        </button>
        <button
          type="button"
          onClick={() =>
            screens.length
              ? setRunMode(true, activeScreenId || screens[0].id)
              : startPrompt('Design me a small app to start from.')
          }
        >
          <Play size={14} /> Run
        </button>
      </div>
      <Statusbar />
    </div>
  );
}
