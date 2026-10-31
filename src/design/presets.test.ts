import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { COLOR_KEYS } from '../types/tokens';
import { MAC_PRESET, PRESETS, WINDOWS_PRESET } from './presets';

describe('design packs', () => {
  it('offers exactly the two named packs, each with complete day and night colours', () => {
    expect(PRESETS.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'glasshouse', name: 'Glasshouse' },
      { id: 'prism', name: 'Prism' },
    ]);
    for (const { tokens } of PRESETS) {
      expect(Object.keys(tokens.openuiTheme.light_colors).sort()).toEqual(
        [...COLOR_KEYS].sort(),
      );
      expect(Object.keys(tokens.openuiTheme.dark_colors).sort()).toEqual(
        [...COLOR_KEYS].sort(),
      );
      expect(tokens.openuiTheme.light_colors).toBeTruthy();
      expect(tokens.openuiTheme.dark_colors).toBeTruthy();
      expect(tokens.openuiTheme).not.toHaveProperty('foundations');
    }
  });
  it('preserves the supplied Glasshouse theme values without its source title', () => {
    expect(MAC_PRESET.title).toBe('Glasshouse — desktop precision');
    expect(MAC_PRESET.openuiTheme).not.toHaveProperty('title');
    const digest = createHash('sha256')
      .update(JSON.stringify(MAC_PRESET.openuiTheme))
      .digest('hex');
    expect(digest).toBe('90bf4e4edb621995bcf19920c40b8c9a7955ed8154e4330797282c83bfbd8e7d');
  });
  it('uses the supplied Prism geometry', () => {
    expect(WINDOWS_PRESET.title).toBe('Prism — desktop, squared');
    const hash = (data: object) =>
      createHash('sha256').update(JSON.stringify(data)).digest('hex');
    expect(hash(WINDOWS_PRESET.openuiTheme.light_colors)).toBe(
      '454f3118742ac3541fab860d1705365880384a31ef562978afcb754839b7ff49',
    );
    expect(hash(WINDOWS_PRESET.openuiTheme.dark_colors)).toBe(
      '8b9fbf69993daf848f96bda0ce77215f242f030a7be32534d672a14a46533c2e',
    );
    expect(WINDOWS_PRESET.openuiTheme.radii_dp).toEqual({
      card: 8,
      button: 4,
      input: 4,
      chip: 4,
      tag: 4,
      callout: 4,
    });
    expect(WINDOWS_PRESET.openuiTheme.metrics_dp).toEqual({
      screen_pad: 24,
      section_gap: 16,
      card_pad: 16,
      button_height: 32,
      input_height: 32,
      chip_height: 28,
      row_height: 68,
    });
  });
});
