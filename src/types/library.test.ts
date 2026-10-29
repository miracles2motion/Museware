import { describe, expect, it } from 'vitest';
import { COMPONENT_SPECS, EVENT_NAMES, EVENT_MAP, eventsFor, spec } from './library';
import { CONTAINER_TYPES, LEAF_TYPES } from './tree';
import { STYLE_BY_KEY } from './styleDict';

const ALL = [...CONTAINER_TYPES, ...LEAF_TYPES] as string[];

/**
 * Two completeness laws. A property sheet is only understandable if every
 * field is grouped and explained; an Events tab is only honest if every block
 * it offers a trigger for actually fires it.
 */
describe('every property explains itself', () => {
  it('has a component spec for every type', () => {
    for (const type of ALL) expect(spec(type), type).toBeDefined();
  });

  it('gives every prop a group and a hint', () => {
    const missing: string[] = [];
    for (const component of COMPONENT_SPECS) {
      for (const def of component.props) {
        if (!def.group) missing.push(`${component.type}.${def.key} has no group`);
        if (!def.hint || def.hint.trim().length < 10) {
          missing.push(`${component.type}.${def.key} has no useful hint`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('never lets two props on one type share a label', () => {
    for (const component of COMPONENT_SPECS) {
      const labels = component.props.map((p) => p.label);
      expect(new Set(labels).size, component.type).toBe(labels.length);
    }
  });

  it('keeps layout out of props — gap/align/justify/wrap/grow are styles', () => {
    const offenders: string[] = [];
    for (const component of COMPONENT_SPECS) {
      for (const def of component.props) {
        if (['gap', 'align', 'justify', 'wrap', 'grow', 'selfAlign', 'padding'].includes(def.key)) {
          offenders.push(`${component.type}.${def.key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('labels a row and a column as the linear layouts they are', () => {
    expect(spec('row')?.label).toMatch(/Row \(horizontal\)/);
    expect(spec('col')?.label).toMatch(/Column \(vertical\)/);
  });
});

describe('the events map is the truth', () => {
  it('says which events every type answers', () => {
    for (const type of ALL) {
      const events = eventsFor(type);
      for (const name of events) expect(EVENT_MAP[name]).toContain(type);
    }
  });

  it('offers no dead editors: a Divider has no events at all', () => {
    expect(eventsFor('divider')).toEqual([]);
    expect(eventsFor('spinner')).toEqual([]);
    expect(eventsFor('progress')).toEqual([]);
  });

  it('wires the field types to change and the form to submit', () => {
    for (const type of [
      'input',
      'textarea',
      'select',
      'checkbox',
      'switch',
      'slider',
      'datepicker',
    ]) {
      expect(eventsFor(type), type).toEqual(['change']);
    }
    expect(eventsFor('form')).toEqual(['submit']);
  });

  it('gives tap to every block that draws a tap target', () => {
    for (const type of ['button', 'iconbutton', 'fab', 'link', 'card', 'list']) {
      expect(eventsFor(type), type).toContain('tap');
    }
  });

  it('never carries an unknown event name', () => {
    for (const name of Object.keys(EVENT_MAP)) {
      expect(EVENT_NAMES).toContain(name);
    }
  });
});

describe('the style dictionary is the single table', () => {
  it('has no duplicate keys', () => {
    const keys = [...STYLE_BY_KEY.keys()];
    const seen = new Set<string>();
    for (const key of keys) {
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('explains every field', () => {
    for (const [key, field] of STYLE_BY_KEY) {
      expect(field.label.length, key).toBeGreaterThan(2);
      expect(field.hint.length, key).toBeGreaterThan(20);
    }
  });

  it('never uses the bare word “Align” for two different jobs', () => {
    const labels = [...STYLE_BY_KEY.values()].map((f) => f.label);
    expect(labels).not.toContain('Align');
    expect(STYLE_BY_KEY.get('align')?.label).toBe('Align children');
    expect(STYLE_BY_KEY.get('selfAlign')?.label).toBe('Align in parent');
  });

  it('offers justify without the invalid stretch option', () => {
    const options = (STYLE_BY_KEY.get('justify')?.options || []).map((o) => o.value);
    expect(options).toContain('space-between');
    expect(options).not.toContain('stretch');
  });
});
