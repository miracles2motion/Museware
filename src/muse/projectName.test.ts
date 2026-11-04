import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { parseProjectDoc } from '../persist/schema';
import { createSavedProject, readSavedProject, renameSavedProject } from '../persist/save';
import { nameProjectAfterBuild, nameProjectFromBlueprint, extractNameFromBlueprint } from './projectName';

beforeEach(() => {
  const entry = emptyScreen('KOYO Tea Landing', { id: 'tea', entry: true });
  entry.root.children = [
    { id: 'tea_title', type: 'heading', props: { text: 'Tea' }, styles: {}, children: [] },
  ];
  useProject.getState().hydrate({ ...createProject(), screens: [entry] });
});
describe('project naming after a build', () => {
  it('names an untitled project once and preserves an explicit later rename, including Untitled project', () => {
    expect(nameProjectAfterBuild()).toBe(true);
    expect(useProject.getState().doc.name).toBe('KOYO Tea');
    expect(useProject.getState().doc.rail.at(-1)?.text).toBe(
      'Project named "KOYO Tea" — rename anytime in the topbar.',
    );
    useProject.getState().setName('My shop');
    expect(nameProjectAfterBuild()).toBe(false);
    useProject.getState().setName('Untitled project');
    const restored = parseProjectDoc(JSON.parse(JSON.stringify(useProject.getState().doc)));
    useProject.getState().hydrate(restored);
    expect(nameProjectAfterBuild()).toBe(false);
    expect(useProject.getState().doc.name).toBe('Untitled project');
  });
  it('does not name an empty screen, strips generic suffixes and limits names to forty characters', () => {
    const doc = structuredClone(useProject.getState().doc);
    doc.screens[0].root.children = [];
    useProject.getState().hydrate(doc);
    expect(nameProjectAfterBuild()).toBe(false);
    doc.screens[0].root.children = [
      { id: 'tea_title', type: 'heading', props: {}, styles: {}, children: [] },
    ];
    doc.screens[0].name = `${'A'.repeat(50)} Page Screen`;
    useProject.getState().hydrate(doc);
    expect(nameProjectAfterBuild()).toBe(true);
    expect(useProject.getState().doc.name).toBe('A'.repeat(40));
  });
  it('preserves user names through Home and unrelated undo', async () => {
    const id = await createSavedProject(useProject.getState().doc);
    await renameSavedProject(id, 'Untitled project');
    const doc = await readSavedProject(id);
    expect(doc?.projectNameLocked).toBe(true);
    useProject.getState().hydrate(doc!);
    expect(nameProjectAfterBuild()).toBe(false);
    useProject
      .getState()
      .applyBatch([{ op: 'renameScreen', id: 'tea', name: 'Tea Page' }], {
        source: 'user',
      });
    useProject.getState().setName('My custom name');
    useProject.getState().undo();
    expect(useProject.getState().doc.name).toBe('My custom name');
  });

  it('extracts project names cleanly from blueprints and user tasks', () => {
    expect(extractNameFromBlueprint('SCREEN: HyperScale AI\n- hero (hero) Inference')).toBe('HyperScale AI');
    expect(extractNameFromBlueprint('SCREEN: Home\n- hero (hero) Boutique Tea Shop - Best Teas')).toBe('Boutique Tea Shop');
    expect(extractNameFromBlueprint('RULES: Create a SaaS Analytics Platform\nSCREEN: Home')).toBe('SaaS Analytics Platform');
  });

  it('automatically renames untitled projects from blueprint and locks against overwrite', () => {
    useProject.getState().hydrate({ ...createProject(), name: 'Untitled project' });
    expect(nameProjectFromBlueprint('SCREEN: CloudGPU Platform\n- hero (hero) Launch')).toBe(true);
    expect(useProject.getState().doc.name).toBe('CloudGPU Platform');
    expect(useProject.getState().doc.projectNameLocked).toBe(true);

    // Later calls do not overwrite locked name
    expect(nameProjectFromBlueprint('SCREEN: Different Name')).toBe(false);
    expect(useProject.getState().doc.name).toBe('CloudGPU Platform');
  });
});
