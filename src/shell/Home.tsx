import { useEffect, useState } from 'react';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import {
  createSavedProject,
  deleteSavedProject,
  duplicateSavedProject,
  listProjects,
  openProject,
  renameSavedProject,
  type ProjectMeta,
} from '../persist/save';

export function Home() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const ready = useProject((s) => s.ready);
  const refresh = async () => setProjects(await listProjects());
  useEffect(() => {
    void refresh().catch(() => setError('Could not read projects on this device.'));
  }, []);
  const open = async (id: string) => {
    const doc = await openProject(id);
    if (!doc) throw new Error('Project not found');
    useProject.getState().replaceDoc(doc);
    const screen = doc.screens.find((s) => s.entry) || doc.screens[0];
    if (screen) useUi.getState().setActiveScreen(screen.id);
    useUi.getState().setRoute('editor');
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
  return (
    <main className="projects-home">
      <header>
        <h1>Projects</h1>
        <p>Your projects are saved on this device.</p>
      </header>
      {error && <p role="alert">{error}</p>}
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
      <div className="projects-list">
        {projects.map((project) => (
          <article className="projects-card" key={project.id}>
            <h2>{project.name}</h2>
            <p>
              {project.screenCount} {project.screenCount === 1 ? 'screen' : 'screens'} ·
              Updated {new Date(project.updatedAt).toLocaleString()}
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
                    await duplicateSavedProject(project.id);
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
