export interface TypedOption {
  label: string;
  hexes: string[];
}

export interface TypedOptionsResult {
  question: string;
  options: TypedOption[];
}

const WORD_COLORS: Record<string, string> = {
  pink: '#EC4899',
  pastel: '#F9A8D4',
  rose: '#F43F5E',
  red: '#EF4444',
  coral: '#FB7185',
  orange: '#F97316',
  amber: '#F59E0B',
  yellow: '#EAB308',
  gold: '#D4AF37',
  lime: '#84CC16',
  green: '#22C55E',
  mint: '#34D399',
  emerald: '#10B981',
  forest: '#166534',
  teal: '#14B8A6',
  cyan: '#06B6D4',
  sky: '#0EA5E9',
  blue: '#3B82F6',
  navy: '#1E3A8A',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  purple: '#A855F7',
  lavender: '#C4B5FD',
  magenta: '#D946EF',
  brown: '#92400E',
  sand: '#E7D3B3',
  cream: '#FEF3C7',
  slate: '#64748B',
  grey: '#6B7280',
  gray: '#6B7280',
  mono: '#111827',
  charcoal: '#1F2937',
  black: '#0B0B0F',
  white: '#FFFFFF',
  sunset: '#FB923C',
  ocean: '#0EA5E9',
};

export function stripHexes(label: string): string {
  return label
    .replace(/#[0-9A-Fa-f]{6}\b/g, '')
    .replace(/#[0-9A-Fa-f]{3}\b/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[-–—:·]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function wordColor(text: string): string | null {
  const words = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  for (const w of words) {
    if (WORD_COLORS[w]) return WORD_COLORS[w];
  }
  return null;
}

const OPTION_LINE = /^\s*(?:[-*•]|\d+[.)]|[A-Fa-f][.)])\s+(.{2,120})$/;

/**
 * The defence for law 1: if the model types its colour options instead of
 * calling ask_choice, we still give the user tappable cards (§8.6 fallback).
 */
export function parseTypedOptions(text: string): TypedOptionsResult | null {
  const lines = text.split('\n');
  const options: TypedOption[] = [];
  let firstIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(OPTION_LINE);
    if (!m) continue;
    const raw = m[1].trim();
    const hexes = Array.from(raw.matchAll(/#([0-9A-Fa-f]{6})\b/g)).map(
      (h) => `#${h[1].toUpperCase()}`,
    );
    const label = stripHexes(raw).slice(0, 90);
    if (!label) continue;
    let palette = hexes.slice(0, 4);
    if (!palette.length) {
      const wc = wordColor(label);
      if (wc) palette = [wc];
    }
    if (firstIndex < 0) firstIndex = i;
    options.push({ label, hexes: palette });
    if (options.length >= 6) break;
  }
  if (options.length < 2) return null;
  if (options.filter((o) => o.hexes.length).length < 2) return null;
  const before = lines.slice(0, firstIndex).join(' ').trim();
  const sentence =
    before
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .pop() || 'Which direction?';
  const question = sentence.replace(/^#+\s*/, '').slice(0, 160);
  return { question, options };
}
