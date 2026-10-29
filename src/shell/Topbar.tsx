import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Download,
  Laptop,
  Play,
  LayoutGrid,
  Monitor,
  Moon,
  MoreHorizontal,
  Plus,
  Redo2,
  Smartphone,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi, BREAKPOINT_WIDTHS, type Breakpoint } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { IconButton, Menu } from '../components/ui';
import {
  addScreenBatch,
  deleteScreenBatch,
  duplicateScreenBatch,
  renameScreenBatch,
} from '../ops/screenOps';
import { stopAgent } from '../muse/loop';
import { downloadProjectFile, readProjectFile } from '../persist/save';
import { parseProjectDoc } from '../persist/schema';

const BPS: Array<{ value: Breakpoint; label: string; icon: typeof Smartphone }> = [
  { value: 'compact', label: 'Compact 390', icon: Smartphone },
  { value: 'medium', label: 'Medium 768', icon: Laptop },
  { value: 'expanded', label: 'Expanded 1280', icon: Monitor },
];

export function Topbar() {
  const doc = useProject((s) => s.doc);
  const applyBatch = useProject((s) => s.applyBatch);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const undoDepth = useProject((s) => s.undoStack.length);
  const redoDepth = useProject((s) => s.redoStack.length);
  const setName = useProject((s) => s.setName);
  const replaceDoc = useProject((s) => s.replaceDoc);
  const busy = useAgent((s) => s.busy);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const setActiveScreen = useUi((s) => s.setActiveScreen);
  const select = useUi((s) => s.select);
  const breakpoint = useUi((s) => s.breakpoint);
  const setBreakpoint = useUi((s) => s.setBreakpoint);
  const leftCollapsed = useUi((s) => s.leftCollapsed);
  const toggleLeft = useUi((s) => s.toggleLeft);
  const setRunMode = useUi((s) => s.setRunMode);
  const setLeftTab = useUi((s) => s.setLeftTab);
  const setLeftFlyout = useUi((s) => s.setLeftFlyout);
  const setMobileRail = useUi((s) => s.setMobileRail);
  const setModal = useUi((s) => s.setModal);
  const setRoute = useUi((s) => s.setRoute);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const toast = useUi((s) => s.toast);
  const [menu, setMenu] = useState<'file' | 'theme' | 'screen' | 'more' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const [savedAt, setSavedAt] = useState<number>(doc.updatedAt);

  useEffect(() => {
    setSavedAt(Date.now());
  }, [doc.updatedAt]);

  const run = (ops: unknown[], ok?: string) => {
    const res = applyBatch(ops, { source: 'user' });
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return false;
    }
    if (ok) toast(ok);
    return true;
  };

  const addScreen = () => {
    const name = `Screen ${doc.screens.length + 1}`;
    if (!run(addScreenBatch(doc, name), 'Screen added')) return;
    const created = useProject.getState().doc.screens.slice(-1)[0];
    if (created) {
      setActiveScreen(created.id);
      select(null);
    }
  };

  const cycleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark');
  };

  return (
    <header className="topbar">
      <button
        type="button"
        className="brand"
        aria-label="Museware — back to the start page"
        title="Back to the start page"
        onClick={() => setRoute('landing')}
      >
        <Sparkles size={18} className="brand-mark" strokeWidth={1.8} />
        <span className="brand-word">
          {'museware'}
          <em>.</em>
        </span>
      </button>

      <span className="topbar-desktop">
        <IconButton
          label={leftCollapsed ? 'Show panels' : 'Hide panels'}
          size="sm"
          onClick={toggleLeft}
        >
          <LayoutGrid size={15} />
        </IconButton>
      </span>

      <div className="project-name topbar-desktop" style={{ position: 'relative' }}>
        <input
          value={doc.name}
          aria-label="Project name"
          onChange={(e) => setName(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'inherit',
            font: 'inherit',
            width: `${Math.min(30, Math.max(8, doc.name.length + 2))}ch`,
          }}
        />
        <span
          className="faint mono"
          style={{ fontSize: 9 }}
          title="Autosaved to this browser"
        >
          {Date.now() - savedAt < 1400 ? 'saving…' : 'saved'}
        </span>
      </div>

      <div className="screen-tabs">
        {doc.screens.map((screen) => (
          <button
            type="button"
            key={screen.id}
            className="screen-tab"
            data-active={screen.id === (activeScreenId || doc.screens[0]?.id)}
            title={`${screen.name} · ${screen.id}${screen.entry ? ' · entry' : ''}`}
            onClick={() => {
              setActiveScreen(screen.id);
              select(null);
            }}
            onDoubleClick={() => {
              setRenaming(screen.id);
              setRenameValue(screen.name);
            }}
          >
            {screen.entry && <span className="badge-dot" data-tone="ok" />}
            {renaming === screen.id ? (
              <input
                className="input"
                style={{ height: 20, fontSize: 11, width: 110, padding: '0 4px' }}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => {
                  const next = renameValue.trim();
                  setRenaming(null);
                  if (next && next !== screen.name)
                    run(renameScreenBatch(doc, screen.id, next));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              screen.name
            )}
          </button>
        ))}
        <span className="topbar-desktop" style={{ display: 'contents' }}>
          <IconButton label="Add screen" size="sm" onClick={addScreen}>
            <Plus size={14} />
          </IconButton>
        </span>
        <div className="topbar-desktop" style={{ position: 'relative' }}>
          <IconButton
            label="Screen actions"
            size="sm"
            active={menu === 'screen'}
            onClick={() => setMenu(menu === 'screen' ? null : 'screen')}
          >
            <LayoutGrid size={14} />
          </IconButton>
          <Menu open={menu === 'screen'} onClose={() => setMenu(null)}>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                addScreen();
              }}
            >
              <Plus size={13} /> Add screen
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                const current = doc.screens.find(
                  (s) => s.id === (activeScreenId || doc.screens[0]?.id),
                );
                if (!current) return;
                if (run(duplicateScreenBatch(doc, current.id), 'Screen duplicated')) {
                  const created = useProject.getState().doc.screens.slice(-1)[0];
                  if (created) setActiveScreen(created.id);
                }
              }}
            >
              <Copy size={13} /> Duplicate current
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                const current = doc.screens.find(
                  (s) => s.id === (activeScreenId || doc.screens[0]?.id),
                );
                if (current) {
                  setRenaming(current.id);
                  setRenameValue(current.name);
                }
              }}
            >
              <Sparkles size={13} /> Rename current
            </button>
            <hr />
            <button
              type="button"
              className="danger"
              onClick={() => {
                setMenu(null);
                const current = doc.screens.find(
                  (s) => s.id === (activeScreenId || doc.screens[0]?.id),
                );
                if (!current) return;
                if (doc.screens.length === 1) {
                  toast('The last screen cannot be removed.', 'warn');
                  return;
                }
                if (
                  run(deleteScreenBatch(doc, current.id), 'Screen removed — ⌘Z restores it')
                ) {
                  const next = useProject.getState().doc.screens[0];
                  if (next) setActiveScreen(next.id);
                }
              }}
            >
              <Trash2 size={13} /> Delete current
            </button>
          </Menu>
        </div>
      </div>

      <span className="topbar-spacer" />

      <div className="segmented topbar-desktop" role="group" aria-label="Breakpoint">
        {BPS.map((bp) => {
          const Icon = bp.icon;
          return (
            <button
              type="button"
              key={bp.value}
              aria-pressed={breakpoint === bp.value}
              title={`${bp.label} — editing this width`}
              onClick={() => setBreakpoint(bp.value)}
            >
              <Icon size={14} />
              <span className="bp-label">{BREAKPOINT_WIDTHS[bp.value]}</span>
            </button>
          );
        })}
      </div>

      <span className="topbar-desktop" style={{ display: 'contents' }}>
        <IconButton
          label={`Undo${undoDepth ? ` (${undoDepth})` : ''}`}
          size="sm"
          disabled={!undoDepth}
          onClick={() => undo()}
        >
          <Undo2 size={15} />
        </IconButton>
        <IconButton
          label={`Redo${redoDepth ? ` (${redoDepth})` : ''}`}
          size="sm"
          disabled={!redoDepth}
          onClick={() => redo()}
        >
          <Redo2 size={15} />
        </IconButton>
      </span>

      <div className="topbar-right">
        {busy && (
          <button
            type="button"
            className="stop-btn"
            onClick={() => stopAgent()}
            title="Stop the agent"
          >
            <Square size={12} /> Stop
          </button>
        )}
        <button
          type="button"
          className="run-btn"
          onClick={() =>
            doc.screens.length
              ? setRunMode(true, activeScreenId || doc.screens[0].id)
              : setModal('onboardingOpen', true)
          }
          title={doc.screens.length ? 'Run the app (⌘⏎)' : 'Start with a prompt'}
          aria-label={doc.screens.length ? 'Run the app' : 'Start with a prompt'}
        >
          <Play size={13} fill="currentColor" strokeWidth={0} />
          <span className="run-label">Run</span>
        </button>
        <div className="topbar-desktop" style={{ position: 'relative' }}>
          <IconButton
            label="Theme"
            size="sm"
            active={menu === 'theme'}
            onClick={() => setMenu(menu === 'theme' ? null : 'theme')}
          >
            {theme === 'dark' ? (
              <Moon size={15} />
            ) : theme === 'light' ? (
              <Sun size={15} />
            ) : (
              <Monitor size={15} />
            )}
          </IconButton>
          <Menu open={menu === 'theme'} onClose={() => setMenu(null)}>
            <button
              type="button"
              onClick={() => {
                setTheme('dark');
                setMenu(null);
              }}
            >
              <Moon size={13} /> Dark chrome
            </button>
            <button
              type="button"
              onClick={() => {
                setTheme('light');
                setMenu(null);
              }}
            >
              <Sun size={13} /> Light chrome
            </button>
            <button
              type="button"
              onClick={() => {
                setTheme('auto');
                setMenu(null);
              }}
            >
              <Monitor size={13} /> Follow the system
            </button>
            <hr />
            <button
              type="button"
              onClick={() => {
                cycleTheme();
                setMenu(null);
              }}
            >
              Cycle theme
            </button>
          </Menu>
        </div>
        <span className="topbar-desktop" style={{ display: 'contents' }}>
          <IconButton
            label="Settings & models"
            size="sm"
            onClick={() => setModal('settingsOpen', true)}
          >
            <Sparkles size={15} />
          </IconButton>
        </span>
        <div className="topbar-desktop" style={{ position: 'relative' }}>
          <IconButton
            label="Project file"
            size="sm"
            active={menu === 'file'}
            onClick={() => setMenu(menu === 'file' ? null : 'file')}
          >
            <Download size={15} />
          </IconButton>
          <Menu open={menu === 'file'} onClose={() => setMenu(null)}>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('exportOpen', true);
              }}
            >
              <Download size={13} /> Export the app…
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                downloadProjectFile(doc);
              }}
            >
              <Download size={13} /> Download project .json
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                importRef.current?.click();
              }}
            >
              <Upload size={13} /> Import project .json
            </button>
            <hr />
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('receiptsOpen', true);
              }}
            >
              <Sparkles size={13} /> Receipts
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('shortcutsOpen', true);
              }}
            >
              <X size={13} /> Keyboard shortcuts
            </button>
          </Menu>
        </div>
        {/* Phones: everything the desktop bar shows, in one 44px target. */}
        <div className="topbar-mobile" style={{ position: 'relative' }}>
          <IconButton
            label="More actions"
            size="sm"
            active={menu === 'more'}
            onClick={() => setMenu(menu === 'more' ? null : 'more')}
          >
            <MoreHorizontal size={16} />
          </IconButton>
          <Menu open={menu === 'more'} onClose={() => setMenu(null)}>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setLeftTab('insert');
                setLeftFlyout(true);
              }}
            >
              <Plus size={13} /> Insert components
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setLeftTab('layers');
                setLeftFlyout(true);
              }}
            >
              <LayoutGrid size={13} /> Layers
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                addScreen();
              }}
            >
              <Plus size={13} /> Add screen
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setMobileRail(true);
              }}
            >
              <Sparkles size={13} /> Open muse
            </button>
            <hr />
            {BPS.map((bp) => {
              const Icon = bp.icon;
              return (
                <button
                  type="button"
                  key={bp.value}
                  onClick={() => {
                    setBreakpoint(bp.value);
                    setMenu(null);
                  }}
                >
                  <Icon size={13} /> {bp.label}
                  {breakpoint === bp.value ? ' ✓' : ''}
                </button>
              );
            })}
            <hr />
            <button
              type="button"
              disabled={!undoDepth}
              onClick={() => {
                undo();
                setMenu(null);
              }}
            >
              <Undo2 size={13} /> Undo
            </button>
            <button
              type="button"
              disabled={!redoDepth}
              onClick={() => {
                redo();
                setMenu(null);
              }}
            >
              <Redo2 size={13} /> Redo
            </button>
            <hr />
            <button
              type="button"
              onClick={() => {
                cycleTheme();
                setMenu(null);
              }}
            >
              {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />} Theme: {theme}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('settingsOpen', true);
              }}
            >
              <Sparkles size={13} /> Settings &amp; models
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('exportOpen', true);
              }}
            >
              <Download size={13} /> Export the app…
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                downloadProjectFile(doc);
              }}
            >
              <Download size={13} /> Download .json
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                importRef.current?.click();
              }}
            >
              <Upload size={13} /> Import .json
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('receiptsOpen', true);
              }}
            >
              <Sparkles size={13} /> Receipts
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('onboardingOpen', true);
              }}
            >
              <X size={13} /> About Museware
            </button>
          </Menu>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const incoming = await readProjectFile(file);
              const parsed = parseProjectDoc(incoming);
              replaceDoc(parsed);
              const first = parsed.screens.find((s) => s.entry) || parsed.screens[0];
              if (first) setActiveScreen(first.id);
              toast('Project imported', 'ok');
            } catch (err) {
              toast(
                err instanceof Error ? err.message : 'Could not read that file',
                'danger',
              );
            }
          }}
        />
      </div>
    </header>
  );
}
