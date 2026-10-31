import { createProject, useProject } from '../store/useProject';
import { useUi, type Route } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { createSavedProject, openProject } from '../persist/save';
import { runAgentTurn } from '../muse/loop';

async function waitForConnection(): Promise<void> {
  const known = () => {
    const state = useAgent.getState();
    return Boolean(
      state.models || state.statusError || state.configured || state.houseKey !== 'absent',
    );
  };
  if (known()) return;
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = useAgent.subscribe(() => {
      if (known()) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
    const timer = window.setTimeout(() => {
      unsubscribe();
      reject(new Error('Connection is not ready. Try again shortly.'));
    }, 15000);
  });
}

/** Both front doors use the same create, draft, hydrate and first-turn path. */
export async function startPromptProject(text: string, source: Route): Promise<void> {
  const prompt = text.trim();
  if (!prompt) return;
  if (useAgent.getState().busy) {
    useUi
      .getState()
      .toast('Muse is already working — stop the current turn first.', 'warn');
    return;
  }
  await waitForConnection();
  if (useUi.getState().route !== source) return;
  if (useAgent.getState().busy) {
    useUi
      .getState()
      .toast('Muse is already working — stop the current turn first.', 'warn');
    return;
  }
  const id = await createSavedProject(createProject());
  useUi.getState().setDraft(prompt);
  const doc = await openProject(id);
  if (!doc) throw new Error('Project not found');
  useProject.getState().hydrate(doc, id);
  const screen = doc.screens.find((s) => s.entry) || doc.screens[0];
  if (screen) useUi.getState().setActiveScreen(screen.id);
  useUi.getState().setRoute('editor', id);
  useUi.getState().setDraft('');
  useProject.getState().addRail({ role: 'user', text: prompt });
  void runAgentTurn(prompt);
}
