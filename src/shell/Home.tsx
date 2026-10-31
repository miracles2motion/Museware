import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
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

function ProjectPreview({ doc }: { doc: ProjectDoc | null | undefined }) {
  const [body, setBody] = useState<HTMLElement | null>(null);
  const screen = doc?.screens.find((item) => item.entry) || doc?.screens[0];
  if (!doc || !screen)
    return <div className="project-preview project-preview-empty">No screen yet</div>;
  return (
    <div className="project-preview" aria-label={`Preview of ${doc.name}`}>
      <iframe
        title={`Preview of ${doc.name}`}
        tabIndex={-1}
        aria-hidden="true"
        className="project-preview-frame"
        srcDoc="<!doctype html><html><head><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}</style></head><body></body></html>"
        onLoad={(e) => setBody(e.currentTarget.contentDocument?.body || null)}
      />
      {body &&
        createPortal(
          <>
            <CanvasStyle doc={doc} />
            <NodeView doc={doc} screen={screen} mode="edit" />
          </>,
          body,
        )}
    </div>
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
    } catch {
      setError('Could not complete that action. Check device storage and try again.');
    } finally {
      setWorking(false);
    }
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
      <div className="projects-list">
        {shown.map((project) => (
          <article className="projects-card" key={project.id}>
            <ProjectPreview doc={docs[project.id]} />
            <h2>{project.name}</h2>
            <p>
              {relativeUpdated(project.updatedAt)} · {project.screenCount}{' '}
              {project.screenCount === 1 ? 'screen' : 'screens'}{' '}
              <span className="chip chip-static">
                {docs[project.id]?.kind || project.kind || 'web'}
              </span>
            </p>
            <div className="projects-actions">
              <button
                type="button"
                disabled={working || !ready}
                className="btn btn-sm"
                onClick={() => void act(() => open(project.id))}
              >
                Open
              </button>
              <button
                type="button"
                disabled={working || !ready}
                className="btn btn-sm"
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
                className="btn btn-sm"
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
                className="btn btn-sm"
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
