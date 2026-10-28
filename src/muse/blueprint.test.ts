import { describe, expect, it } from 'vitest';
import { parseBlueprint } from './blueprintParse';
import { MUSEWARE_DEFAULT_THEME } from '../design/starter';
import { applyOps } from '../ops/apply';
import { createProject } from '../store/useProject';
import { buildScreensFor, pickTemplate, TEMPLATES } from './demo/build';

const BLUEPRINT = `RULES
A quiet habit tracker for one person. Phone-first.

LOOK: 20dp outer padding, 16dp between sections, card radius 14, title 24px, body 14px.

STATE: active_tab, push_on

SCREEN: Home
- home_top (row) avatar + greeting
  - txt_greet (heading) Good morning, Mia
  - txt_sub (text) Three habits left today
- card_today (card) Today
  - prog_day (progress) 60
  - list_habits (list) habits
- row_actions (row)
  - btn_stats (button) See stats
  - btn_add (button) Add habit
- nav_home (bottomnav) Home Stats Settings

SCREEN: Stats
- txt_stats (heading) Your week
- chart_week (chart) bar
- btn_back (button) Back home

WIRING:
- btn_stats → navigate Stats
- btn_back → navigate Home
- nav_home → tabs switch screens
`;

describe('blueprint parsing', () => {
  it('reads screens, the look line, state keys and wiring', () => {
    const parsed = parseBlueprint(BLUEPRINT, MUSEWARE_DEFAULT_THEME);
    expect(parsed.screens.map((s) => s.id)).toEqual(['home', 'stats']);
    expect(parsed.stateKeys).toContain('active_tab');
    expect(parsed.stateKeys).toContain('push_on');
    expect(parsed.look.pad).toBe(20);
    expect(parsed.look.gap).toBe(16);
    expect(parsed.wiring.length).toBeGreaterThan(0);
  });

  it('provisional trees are valid ops on an empty project', () => {
    const parsed = parseBlueprint(BLUEPRINT, MUSEWARE_DEFAULT_THEME);
    let doc = createProject('Habits');
    for (let i = 0; i < parsed.screens.length; i += 1) {
      const screen = parsed.screens[i];
      const res = applyOps(
        [{ op: 'addScreen', screen: { ...screen, ...(i === 0 ? { entry: true } : {}) } }],
        doc,
        { source: 'user' },
      );
      expect(res.errors).toHaveLength(0);
      doc = res.doc;
    }
    expect(doc.screens).toHaveLength(2);
    expect(doc.screens[0].root.children.length).toBeGreaterThan(0);
  });

  it('builder nodes carry real types and ids that satisfy the vocabulary', () => {
    const parsed = parseBlueprint(BLUEPRINT, MUSEWARE_DEFAULT_THEME);
    const home = parsed.screens[0];
    const types = home.root.children.map((c) => c.type);
    expect(types).toContain('row');
    expect(types).toContain('bottomnav');
    expect(home.root.id).toMatch(/^[a-z][a-z0-9_]{2,30}$/);
  });
});

describe('demo templates', () => {
  it('every template builds screens that apply cleanly', () => {
    for (const template of TEMPLATES) {
      const screens = buildScreensFor(template, MUSEWARE_DEFAULT_THEME);
      expect(screens.length).toBeGreaterThan(0);
      let doc = createProject(template.projectName);
      for (let i = 0; i < screens.length; i += 1) {
        const res = applyOps(
          [
            {
              op: 'addScreen',
              screen: { ...screens[i], ...(i === 0 ? { entry: true } : {}) },
            },
          ],
          doc,
          { source: 'user' },
        );
        if (res.errors.length) {
          throw new Error(`${template.id}/${screens[i].id}: ${res.errors[0].message}`);
        }
        doc = res.doc;
      }
      expect(doc.screens).toHaveLength(screens.length);
    }
  });

  it('picks the template that matches the prompt', () => {
    expect(pickTemplate('make a habit tracker for my daughter').id).toBe('habits');
    expect(pickTemplate('a landing page for a coffee roaster').id).toBe('shop');
    expect(pickTemplate('a revenue dashboard for our team').id).toBe('dashboard');
    expect(pickTemplate('design me a landing page website').id).toBe('landing');
  });
});
