import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { startPromptProject } from './promptProject';
import { CanvasStyle, NodeView } from '../canvas/NodeView';
import { emptyScreen } from '../ops/screenOps';
import { n, TEMPLATES, buildScreensFor } from '../muse/demo/build';
import type { ProjectDoc } from '../types/tree';
import {
  createSavedProject,
  deleteSavedProject,
  duplicateSavedProject,
  listProjects,
  openProject,
  readSavedProject,
  renameSavedProject,
  type ProjectMeta,
} from '../persist/save';

export function relativeUpdated(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return 'Updated just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export function previewScale(cardWidth: number): number {
  return cardWidth > 0 ? cardWidth / 390 : 1;
}

function ProjectPreview({
  doc,
  name,
  onOpen,
  disabled,
}: {
  doc: ProjectDoc | null | undefined;
  name: string;
  onOpen: () => void;
  disabled: boolean;
}) {
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(390);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth) setWidth(element.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const screen = doc?.screens.find((item) => item.entry) || doc?.screens[0];
  return (
    <button
      type="button"
      className="project-preview"
      ref={ref}
      disabled={disabled}
      aria-label={`Open ${name}`}
      onClick={onOpen}
    >
      <iframe
        title={`Preview of ${name}`}
        tabIndex={-1}
        aria-hidden="true"
        className="project-preview-frame"
        srcDoc="<!doctype html><html><head><style>:root{--mw-project-viewport-width:390px}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}</style></head><body></body></html>"
        onLoad={(e) => setBody(e.currentTarget.contentDocument?.body || null)}
      />
      {doc &&
        screen &&
        body &&
        createPortal(
          <div
            style={{
              width: 'var(--mw-project-viewport-width)',
              transform: `scale(${previewScale(width)})`,
              transformOrigin: 'top left',
            }}
          >
            <CanvasStyle doc={doc} />
            <NodeView doc={doc} screen={screen} mode="edit" />
          </div>,
          body,
        )}
      {!screen && <span className="project-preview-empty">No screen yet</span>}
    </button>
  );
}

function starter(kind: 'tea' | 'habits'): ProjectDoc {
  if (kind === 'habits') {
    const template = TEMPLATES.find((item) => item.id === 'habits')!;
    const doc = { ...createProject('Habit tracker'), kind: 'app' as const };
    return { ...doc, screens: buildScreensFor(template, doc.tokens) };
  }
  const doc = createProject('Tea landing');
  const screen = emptyScreen('Tea landing', { id: 'tea_landing', entry: true });
  screen.root.props.scroll = true;
  screen.root.children = [
    n('navbar', 'tea_nav', { props: { brand: 'Tea House', items: ['Tea', 'Our story'] } }),
    n('hero', 'tea_hero', {
      props: {
        title: 'A quieter cup of tea',
        subtitle: 'Thoughtful leaves for everyday rituals.',
        badge: 'WELCOME TO TEA HOUSE',
      },
    }),
    n('section', 'tea_section', {
      props: {
        title: 'Find your daily ritual',
        subtitle: 'Explore our selection of whole-leaf teas.',
      },
      children: [
        n('card', 'tea_green', {
          props: { title: 'Green tea', subtitle: 'Fresh and bright' },
        }),
        n('card', 'tea_black', {
          props: { title: 'Black tea', subtitle: 'Rich and comforting' },
        }),
      ],
    }),
  ];
  return { ...doc, kind: 'web', screens: [screen] };
}

export function Home() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<Record<string, ProjectDoc | null>>({});
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [idea, setIdea] = useState('');
  const [example, setExample] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setExample((value) => (value + 1) % 2), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const ready = useProject((s) => s.ready);
  const refresh = async () => {
    const items = await listProjects();
    const loaded = await Promise.all(
      items.map(async (item) => [item.id, await readSavedProject(item.id)] as const),
    );
    setProjects(items);
    setDocs(Object.fromEntries(loaded));
    setLoading(false);
  };
  useEffect(() => {
    void refresh().catch(() => {
      setLoading(false);
      setError('Could not read projects on this device.');
    });
  }, []);
  const open = async (id: string) => {
    const doc = await openProject(id);
    if (!doc) throw new Error('Project not found');
    useProject.getState().hydrate(doc, id);
    const screen = doc.screens.find((s) => s.entry) || doc.screens[0];
    if (screen) useUi.getState().setActiveScreen(screen.id);
    useUi.getState().setRoute('editor', id);
  };
  const act = async (fn: () => Promise<void>) => {
    try {
      setWorking(true);
      setError('');
      await fn();
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error &&
          err.message === 'Connection is not ready. Try again shortly.'
          ? err.message
          : 'Could not complete that action. Check device storage and try again.',
      );
    } finally {
      setWorking(false);
    }
  };
  const makeProject = () => {
    const text = idea.trim();
    if (!text || working || !ready) return;
    if (useAgent.getState().busy) {
      useUi
        .getState()
        .toast('Muse is already working — stop the current turn first.', 'warn');
      return;
    }
    void act(async () => {
      await startPromptProject(text, 'projects');
    });
  };
  const shown = projects
    .filter((item) => item.name.toLowerCase().includes(query.toLowerCase().trim()))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt,
    );
  return (
    <main className="projects-home">
      <button
        type="button"
        className="brand projects-brand"
        onClick={() => useUi.getState().setRoute('landing')}
      >
        <Sparkles size={16} /> museware
      </button>
      <header className="projects-heading">
        <div>
          <h1>Projects</h1>
          <p>Your projects are saved on this device.</p>
        </div>
        <button
          type="button"
          disabled={working || !ready}
          className="btn btn-primary"
          onClick={() =>
            void act(async () => {
              const id = await createSavedProject(createProject());
              await open(id);
            })
          }
        >
          New project
        </button>
      </header>
      <form
        className="project-prompt"
        onSubmit={(event) => {
          event.preventDefault();
          makeProject();
        }}
      >
        <div>
          <span className="project-prompt-eyebrow">MAKE SOMETHING REAL</span>
          <h2>
            {!loading && projects.length === 0
              ? 'Describe your first project — muse does the rest'
              : 'Describe your idea and watch it build.'}
          </h2>
          <p>Start with an idea. Approve the plan. Get a working site.</p>
        </div>
        <div className="project-prompt-controls">
          <input
            aria-label="Describe your idea"
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={
              example === 0
                ? 'A tea shop with a calm online storefront'
                : 'A habit tracker for a healthier week'
            }
          />
          <button
            type="submit"
            className="btn btn-accent"
            disabled={!idea.trim() || working || !ready}
          >
            Make a project →
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading projects…</p>}
      {projects.length > 0 && (
        <div className="projects-filters">
          <label>
            Search{' '}
            <input
              aria-label="Search projects"
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
            />
          </label>
          <label>
            Sort{' '}
            <select
              aria-label="Sort projects"
              className="select"
              value={sort}
              onChange={(e) => setSort(e.target.value === 'name' ? 'name' : 'recent')}
            >
              <option value="recent">Recently updated</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      )}
      {!loading && projects.length === 0 && !error && (
        <div className="projects-empty">
          <h2>No projects yet</h2>
          <p>Start with a blank project or choose a starting point.</p>
          <div className="projects-starters">
            {(
              [
                { id: 'tea', label: 'Tea landing' },
                { id: 'habits', label: 'Habit tracker' },
              ] as const
            ).map((item) => (
              <button
                type="button"
                className="projects-starter"
                disabled={working || !ready}
                key={item.id}
                onClick={() =>
                  void act(async () => {
                    const id = await createSavedProject(starter(item.id));
                    await open(id);
                  })
                }
              >
                <strong>{item.label}</strong>
                <span>Create and open →</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="link-btn"
            onClick={() => useUi.getState().setRoute('landing')}
          >
            Explore the landing tour
          </button>
        </div>
      )}
      {projects.length > 0 && !shown.length && <p>No projects match your search.</p>}
      <div className="project-grid">
        {shown.map((project) => (
          <article className="projects-card" key={project.id}>
            <ProjectPreview
              key={`${project.id}:${project.updatedAt}`}
              doc={docs[project.id]}
              name={project.name}
              disabled={working || !ready}
              onOpen={() => void act(() => open(project.id))}
            />
            <div className="project-meta">
              <h2>{project.name}</h2>
              <p>{relativeUpdated(project.updatedAt)}</p>
              <div className="project-chips">
                <span className="chip chip-static">
                  {project.screenCount} {project.screenCount === 1 ? 'screen' : 'screens'}
                </span>
                <span className="chip chip-static">
                  {docs[project.id]?.kind || project.kind || 'web'}
                </span>
              </div>
            </div>
            <div className="projects-actions">
              <button
                type="button"
                disabled={working || !ready}
                className="btn btn-sm btn-accent"
                onClick={() => void act(() => open(project.id))}
              >
                Open
              </button>
              <button
                type="button"
                disabled={working || !ready}
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  const name = window.prompt('Project name', project.name);
                  if (name?.trim()) void act(() => renameSavedProject(project.id, name));
                }}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={working || !ready}
                className="btn btn-sm btn-ghost"
                onClick={() =>
                  void act(async () => {
                    const id = await duplicateSavedProject(project.id);
                    await open(id);
                  })
                }
              >
                Duplicate
              </button>
              <button
                type="button"
                disabled={working || !ready}
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  if (window.confirm(`Delete “${project.name}”? This cannot be undone.`))
                    void act(() => deleteSavedProject(project.id));
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
