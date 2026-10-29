/**
 * Colour data that is *content*, not chrome: the direction palettes the local
 * engine offers, the quick swatches in the colour card, and the demo
 * "colour word → hex" table. Chrome itself never hardcodes a colour.
 */
export interface DirectionPalette {
  id: string;
  label: string;
  note: string;
  hexes: [string, string, string, string];
}

export const DIRECTION_PALETTES: DirectionPalette[] = [
  {
    id: 'sunny',
    label: 'Sunny studio',
    note: 'warm, optimistic',
    hexes: ['#F97316', '#EA580C', '#FFF7ED', '#1C1917'],
  },
  {
    id: 'focus',
    label: 'Deep focus',
    note: 'calm, technical',
    hexes: ['#6366F1', '#8B5CF6', '#EEF2FF', '#0F172A'],
  },
  {
    id: 'garden',
    label: 'Quiet garden',
    note: 'natural, soft',
    hexes: ['#059669', '#0D9488', '#ECFDF5', '#052E16'],
  },
  {
    id: 'paper',
    label: 'Paper & ink',
    note: 'editorial, mono',
    hexes: ['#111827', '#6B7280', '#F9FAFB', '#0B0B0F'],
  },
];

/** Six quick taps in the colour card, plus a native picker for anything else. */
export const QUICK_SWATCHES = [
  '#6D5CFF',
  '#0EA5E9',
  '#F97316',
  '#059669',
  '#DC2626',
  '#111827',
];
