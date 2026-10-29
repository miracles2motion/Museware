import {
  ChevronLeft,
  Layers,
  LayoutGrid,
  Play,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
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
  const leftTab = useUi((s) => s.leftTab);
  const leftFlyout = useUi((s) => s.leftFlyout);
  const propertiesOpen = useUi((s) => s.propertiesOpen);
  const inspectorWide = useUi((s) => s.inspectorWide);
  const restoreInspector = useUi((s) => s.restoreInspector);
  const mobileRailOpen = useUi((s) => s.mobileRailOpen);

  // Three states for the one panel: docked, docked wide, or out of the way.
  const panelState = propertiesOpen ? (inspectorWide ? 'wide' : 'open') : 'closed';
  const inspectable = Boolean(screens.length);

  return (
    <div className="app-shell">
      <Topbar />
      <div
        className="workspace"
        data-rail={railCollapsed ? 'collapsed' : 'open'}
        data-inspector={panelState}
      >
        <LeftPanel />
        <Canvas />
        <Inspector />
        {/* A minimized panel leaves a tab on the edge, never a dead end. */}
        {!propertiesOpen && inspectable && (
          <button
            type="button"
            className="inspector-peek"
            aria-label="Restore the panel"
            title="Restore the panel (⌘/Ctrl + I)"
            onClick={restoreInspector}
          >
            <ChevronLeft size={13} />
            <span className="eyebrow">inspect</span>
          </button>
        )}
        <AgentRail />
      </div>
      <nav className="mobile-bottom-bar" aria-label="Workspace">
        <button
          type="button"
          data-active={leftFlyout && leftTab === 'insert'}
          onClick={() => {
            setLeftTab('insert');
            setLeftFlyout(true);
          }}
        >
          <LayoutGrid size={18} />
          <span>Insert</span>
        </button>
        <button
          type="button"
          data-active={leftFlyout && leftTab === 'layers'}
          onClick={() => {
            setLeftTab('layers');
            setLeftFlyout(true);
          }}
        >
          <Layers size={18} />
          <span>Layers</span>
        </button>
        <button
          type="button"
          data-active={propertiesOpen}
          onClick={() => useUi.getState().setPropertiesOpen(!propertiesOpen)}
        >
          <SlidersHorizontal size={18} />
          <span>Inspect</span>
        </button>
        <button
          type="button"
          data-active={mobileRailOpen}
          onClick={() => setMobileRail(!mobileRailOpen)}
        >
          {mobileRailOpen ? <X size={18} /> : <Sparkles size={18} />}
          <span>muse</span>
        </button>
        <button
          type="button"
          onClick={() =>
            screens.length
              ? setRunMode(true, activeScreenId || screens[0].id)
              : startPrompt('Design me a small app to start from.')
          }
        >
          <Play size={18} />
          <span>Run</span>
        </button>
      </nav>
      <Statusbar />
    </div>
  );
}
