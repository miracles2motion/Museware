import { describe, expect, it } from 'vitest';
import { MUSEWARE_DEFAULT_THEME } from '../design/starter';
import { emptyScreen } from '../ops/screenOps';
import { defaultLook, parseLook } from './blueprintParse';
import { lintScreen } from './qualityLint';

const parse = (text: string) => parseLook(text, MUSEWARE_DEFAULT_THEME);
describe('LOOK measurements cannot crush a viewport', () => {
  it('never uses the compact viewport width as padding when no LOOK padding exists', () => {
    const plan =
      'RULES: Compact-first 390px, expanded 1280px.\nSCREEN: Tea Landing\n- hero_tea (hero) Tea\nLOOK: warm artisan palette; modern editorial styling\nSTATE: menu_open';
    expect(parse(plan).pad).toBe(defaultLook(MUSEWARE_DEFAULT_THEME).pad);
    expect(parse(plan).pad).toBeLessThanOrEqual(64);
  });
  it('reads key-first and value-first values only inside the LOOK block', () => {
    const plan =
      'RULES: padding 390px, gap 250px, title 100px\nLOOK: pad 24, gap: 16, card radius 14, title 30px, body 15px\nSCREEN 1 - Home:\n- hero (hero) Welcome';
    expect(parse(plan)).toEqual({ pad: 24, gap: 16, cardRadius: 14, title: 30, body: 15 });
    const canonical =
      'LOOK: 20dp outer padding, 16dp between sections, card radius 14, title 24px, body 14px.\nSTATE: active_tab';
    expect(parse(canonical)).toEqual({
      pad: 20,
      gap: 16,
      cardRadius: 14,
      title: 24,
      body: 14,
    });
  });
  it('clamps all five LOOK values, including negative and very large numbers', () => {
    expect(parse('LOOK: pad 9999, gap 390, radius 500, title 900, body 70')).toEqual({
      pad: 64,
      gap: 64,
      cardRadius: 40,
      title: 80,
      body: 32,
    });
    expect(parse('LOOK: pad -8, gap -3, radius -10, title 2, body 1')).toEqual({
      pad: 0,
      gap: 0,
      cardRadius: 0,
      title: 12,
      body: 10,
    });
  });
  it('blocks oversized padding, gaps and margins, including shorthand and responsive styles', () => {
    const screen = emptyScreen('Tea', { id: 'tea' });
    screen.root.styles = {
      padding: '390px',
      gap: 97,
      margin: { top: 98 },
      responsive: { medium: { padding: '12px 400px' } },
    };
    const findings = lintScreen(screen).filter((finding) => finding.code === 'spacing');
    expect(findings).toHaveLength(4);
    expect(findings.every((finding) => finding.severity === 'block')).toBe(true);
  });
  it('leaves sane values, token references, and percentages alone', () => {
    const screen = emptyScreen('Tea', { id: 'tea' });
    screen.root.styles = {
      padding: '24px 16px',
      gap: 'var(--gap-section)',
      margin: '0 100%',
      responsive: { expanded: { padding: 96 } },
    };
    expect(lintScreen(screen).filter((finding) => finding.code === 'spacing')).toEqual([]);
  });
});
