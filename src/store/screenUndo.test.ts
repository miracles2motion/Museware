import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, useProject } from './useProject';
import { emptyScreen } from '../ops/screenOps';

beforeEach(() => useProject.getState().replaceDoc(createProject()));

describe('screen-specific build undo', () => {
  it('reverts one new screen without reverting a later edit on another screen', () => {
    const a = emptyScreen('Alpha', { id: 'alpha', entry: true });
    const b = emptyScreen('Beta', { id: 'beta' });
    useProject.getState().applyBatch([{ op: 'addScreen', screen: a }], { source: 'user' });
    useProject.getState().applyBatch([{ op: 'addScreen', screen: b }], { source: 'agent' });
    useProject.getState().rememberScreenBuild('card', 'beta', null);
    useProject
      .getState()
      .applyBatch([{ op: 'renameScreen', id: 'alpha', name: 'Updated Alpha' }], {
        source: 'user',
      });
    expect(useProject.getState().undoScreenBuild('card', 'beta')).toBe('');
    expect(useProject.getState().doc.screens.map((s) => s.name)).toEqual(['Updated Alpha']);
    useProject.getState().undo();
    expect(useProject.getState().doc.screens.map((s) => s.name)).toEqual([
      'Updated Alpha',
      'Beta',
    ]);
  });
  it('refuses to overwrite a newer edit on the same screen', () => {
    const a = emptyScreen('Alpha', { id: 'alpha', entry: true });
    useProject.getState().applyBatch([{ op: 'addScreen', screen: a }], { source: 'agent' });
    useProject.getState().rememberScreenBuild('card', 'alpha', null);
    useProject
      .getState()
      .applyBatch([{ op: 'renameScreen', id: 'alpha', name: 'My edit' }], {
        source: 'user',
      });
    expect(useProject.getState().undoScreenBuild('card', 'alpha')).toMatch(/changed after/);
    expect(useProject.getState().doc.screens[0].name).toBe('My edit');
  });
});
