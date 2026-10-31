import type { Action, ComponentNode, ScreenDoc, StyleSet } from '../types/tree';
import type { DesignTokens } from '../types/tokens';
import { defaultPropsFor, defaultStylesFor, isContainerType } from '../types/library';
import { ID_PATTERN, collectIds, generateId, slugify } from '../ops/ids';
import { hydrateNode } from '../ops/validate';
import { derivedScales } from '../design/materialize';

export interface LookNumbers {
  pad: number;
  gap: number;
  cardRadius: number;
  title: number;
  body: number;
}

export interface ParsedBlueprint {
  screens: ScreenDoc[];
  stateKeys: string[];
  look: LookNumbers;
  rules: string;
  wiring: string[];
  text: string;
}

const TYPE_ALIASES: Record<string, string> = {
  textfield: 'input',
  field: 'input',
  textinput: 'input',
  toggle: 'switch',
  onoff: 'switch',
  cta: 'button',
  btn: 'button',
  picture: 'image',
  photo: 'image',
  logo: 'image',
  avatarimage: 'avatar',
  paragraph: 'text',
  body: 'text',
  title: 'heading',
  header: 'heading',
  h1: 'heading',
  h2: 'heading',
  navigation: 'navbar',
  nav: 'navbar',
  bottomnavigation: 'bottomnav',
  tabbar: 'tabs',
  footer: 'section',
  statcard: 'stat',
  kpi: 'stat',
  graph: 'chart',
  rows: 'list',
  menu: 'navbar',
};

export function defaultLook(tokens: DesignTokens): LookNumbers {
  const s = derivedScales(tokens);
  return {
    pad: s.padScreen,
    gap: s.gapSection,
    cardRadius: s.radiusCard,
    title: 24,
    body: 14,
  };
}

export function parseLook(text: string, tokens: DesignTokens): LookNumbers {
  const fallback = defaultLook(tokens);
  const grab = (re: RegExp): number | null => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    pad:
      grab(/(\d{1,3})\s*(?:dp|px)?\s*(?:outer\s*)?padding/i) ??
      grab(/(\d{1,3})\s*(?:dp|px)/) ??
      fallback.pad,
    gap: grab(/(\d{1,3})\s*(?:dp|px)?\s*(?:between|gap)/i) ?? fallback.gap,
    cardRadius:
      grab(/radius\s*(\d{1,3})/i) ??
      grab(/card radius\s*(\d{1,3})/i) ??
      fallback.cardRadius,
    title: grab(/title\s*(\d{1,3})/i) ?? fallback.title,
    body: grab(/body\s*(\d{1,3})/i) ?? fallback.body,
  };
}

function navTarget(rest: string): string | null {
  const m =
    rest.match(/\bopens\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _-]{1,30})/i) ||
    rest.match(/\blinks?\s+to\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _-]{1,30})/i) ||
    rest.match(/→\s*([A-Za-z][A-Za-z0-9 _-]{1,30})/);
  if (!m) return null;
  return slugify(m[1].trim());
}

function cleanText(rest: string): string {
  return rest
    .replace(/\b(?:opens|links? to|navigates? to)\s+.*$/i, '')
    .replace(/→.*$/, '')
    .replace(/^[:\-–—]\s*/, '')
    .trim();
}

function normalizeType(raw: string): string {
  const t = raw.toLowerCase().replace(/[\s_-]/g, '');
  return TYPE_ALIASES[t] || t;
}

function applyLook(node: ComponentNode, look: LookNumbers): void {
  if (node.type === 'heading') {
    const level = Number(node.props.level) || 2;
    const size =
      level === 1
        ? look.title + 8
        : level === 2
          ? look.title
          : level === 3
            ? look.title - 4
            : look.body + 2;
    node.styles = { ...node.styles, fontSize: `${Math.max(12, size)}px` };
  }
  if (node.type === 'text' || node.type === 'label') {
    node.styles = { ...node.styles, fontSize: `${look.body}px` };
  }
  if (node.type === 'card') {
    node.styles = { ...node.styles, borderRadius: `${look.cardRadius}px` };
  }
  for (const child of node.children) applyLook(child, look);
}

// The architect sometimes puts the screen name before the colon.
export const SCREEN_HEAD = /^\s*(?:#{1,6}\s*)?SCREEN\s*\d*\b[^\n:]*:/i;

/** Return each original section in parser order; fallback keeps the whole plan. */
export function blueprintScreenSections(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const starts = lines.flatMap((line, index) => (SCREEN_HEAD.test(line) ? [index] : []));
  return starts.map((start, index) =>
    lines.slice(start, starts[index + 1] ?? lines.length).join('\n'),
  );
}

interface Frame {
  indent: number;
  node: ComponentNode;
}

export function parseBlueprint(text: string, tokens: DesignTokens): ParsedBlueprint {
  const look = parseLook(text, tokens);
  const lines = text.split(/\r?\n/);
  const screenStarts: number[] = [];
  lines.forEach((l, i) => {
    if (SCREEN_HEAD.test(l)) screenStarts.push(i);
  });
  const rulesEnd = screenStarts.length ? screenStarts[0] : lines.length;
  const rules = lines
    .slice(0, rulesEnd)
    .filter((l) => !/^\s*$/.test(l))
    .join('\n')
    .replace(/^RULES:\s*/i, '')
    .slice(0, 900);

  const stateKeys = new Set<string>();
  const stateLine = text.match(/^\s*STATE:\s*(.+)$/im)?.[1] || '';
  stateLine
    .split(/[,·]/)
    .map((s) => s.trim().replace(/[.;].*$/, ''))
    .filter((s) => /^[a-z][a-z0-9_]{0,30}$/.test(s))
    .forEach((k) => stateKeys.add(k));

  const wiring: string[] = [];
  const wiringBlock = text.match(
    /^\s*WIRING:\s*([\s\S]*?)(?=\n\s*(?:SCREEN|STATE|LOOK|RULES):|$)/im,
  );
  if (wiringBlock) {
    wiringBlock[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 12)
      .forEach((l) => wiring.push(l));
  }

  const usedIds = new Set<string>();
  const usedScreenSlugs = new Set<string>();
  const screens: ScreenDoc[] = [];

  for (let s = 0; s < screenStarts.length; s += 1) {
    const start = screenStarts[s];
    const end = s + 1 < screenStarts.length ? screenStarts[s + 1] : lines.length;
    const header = lines[start].replace(/[#*`]/g, '').trim();
    const canonical = header.match(/^SCREEN\s*\d*\s*:\s*(.+)$/i);
    const between = header.match(/^SCREEN\s*\d*\s*[-–—.]?\s*([^:]+):\s*$/i)?.[1] || '';
    const name =
      (
        canonical?.[1] ||
        between.replace(/^\d*\s*[-–—.:]?\s*/, '').trim() ||
        `Screen ${s + 1}`
      )
        .replace(/[#*`]/g, '')
        .trim()
        .slice(0, 40) || `Screen ${s + 1}`;
    // Root IDs add "_root" and must remain at most 31 characters.
    const baseSlug = slugify(name).slice(0, 26);
    let slug = baseSlug;
    let suffix = 2;
    while (usedScreenSlugs.has(slug)) {
      const ending = `_${suffix++}`;
      slug = `${baseSlug.slice(0, 26 - ending.length)}${ending}`;
    }
    usedScreenSlugs.add(slug);

    const root: ComponentNode = {
      id: `${slug}_root`,
      type: 'screen',
      props: { title: name, layout: 'flex-col', scroll: true },
      styles: {
        ...defaultStylesFor('screen'),
        padding: `${look.pad}px`,
        gap: `${look.gap}px`,
      },
      children: [],
    };
    usedIds.add(root.id);
    const stack: Frame[] = [{ indent: -1, node: root }];

    for (let i = start + 1; i < end; i += 1) {
      const rawLine = lines[i];
      if (!rawLine || /^\s*(LOOK|STATE|WIRING|RULES):/i.test(rawLine)) continue;
      const bullet = rawLine.match(/^(\s*)[-*]\s+(.*)$/);
      if (!bullet) continue;
      const indent = bullet[1].replace(/\t/g, '  ').length;
      const body = bullet[2].trim();
      const typed = body.match(/^([a-z][a-z0-9_]{2,30})\s*\(([A-Za-z][\w-]*)\)\s*(.*)$/);
      const untyped = body.match(/^\(([A-Za-z][\w-]*)\)\s*(.*)$/);
      const bare = body.match(/^([A-Za-z][\w-]*)\s*[:–-]\s*(.*)$/);

      const typeRaw =
        typed?.[2] ||
        untyped?.[1] ||
        (bare && !isContainerType(normalizeType(bare[1])) ? bare[1] : 'text');
      const nodeTypeRaw = normalizeType(typeRaw);
      const rest = (typed?.[3] || untyped?.[2] || bare?.[2] || body).trim();
      const container = isContainerType(nodeTypeRaw);
      const explicitId = typed?.[1];
      const finalType = (
        [
          'screen',
          'row',
          'col',
          'grid',
          'card',
          'hero',
          'tabs',
          'section',
          'form',
          'heading',
          'text',
          'label',
          'badge',
          'divider',
          'icon',
          'image',
          'avatar',
          'progress',
          'spinner',
          'button',
          'iconbutton',
          'input',
          'textarea',
          'select',
          'checkbox',
          'switch',
          'slider',
          'datepicker',
          'navbar',
          'bottomnav',
          'link',
          'fab',
          'list',
          'table',
          'stat',
          'chart',
        ].includes(nodeTypeRaw)
          ? nodeTypeRaw
          : 'text'
      ) as ComponentNode['type'];

      let id = explicitId && ID_PATTERN.test(explicitId) ? explicitId : '';
      if (!id) {
        const base =
          finalType === 'button'
            ? 'btn'
            : finalType === 'text'
              ? 'txt'
              : finalType === 'heading'
                ? 'txt'
                : finalType;
        id = generateId(base as ComponentNode['type'], usedIds);
      }
      if (usedIds.has(id)) id = `${slug}_${id}`.slice(0, 31);
      while (usedIds.has(id)) id = generateId(finalType, usedIds);
      usedIds.add(id);

      const props: Record<string, unknown> = { ...defaultPropsFor(finalType) };
      const textValue = cleanText(rest);
      if (['heading', 'text', 'label', 'badge', 'button', 'link'].includes(finalType)) {
        props.text = textValue || (finalType === 'button' ? 'Continue' : 'Text');
      }
      if (finalType === 'heading') {
        const levelMatch =
          rest.match(/\bh([1-4])\b/i) || rest.match(/\blevel\s*([1-4])\b/i);
        props.level = levelMatch ? Number(levelMatch[1]) : 2;
      }
      if (container && textValue && ['card', 'section', 'hero'].includes(finalType)) {
        props.title = textValue.replace(/^title[:\s]+/i, '').slice(0, 80);
      }
      if (finalType === 'hero' && textValue) {
        const [title, ...sub] = textValue.split(/[—–|]/);
        props.title = title.trim();
        if (sub.length) props.subtitle = sub.join(' ').trim();
      }

      const node: ComponentNode = {
        id,
        type: finalType,
        props,
        styles: defaultStylesFor(finalType) as StyleSet,
        children: [],
      };
      const target = navTarget(rest);
      if (target && ['button', 'link', 'fab', 'iconbutton'].includes(finalType)) {
        node.events = { tap: [{ type: 'navigate', to: target } as Action] };
      }
      if (container) {
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
        stack[stack.length - 1].node.children.push(node);
        stack.push({ indent, node });
      } else {
        // A leaf at the same indent as an open container is its sibling,
        // not a child: pop the container first.
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
        stack[stack.length - 1].node.children.push(node);
      }
    }

    applyLook(root, look);
    screens.push({ id: slug, name, root, ...(s === 0 ? { entry: true } : {}) });
  }

  // Blueprint ids live across screens: a duplicate is renamed with its screen slug.
  const seen = new Set<string>();
  for (const screen of screens) {
    for (const id of collectIds(screen.root)) {
      if (seen.has(id)) {
        const renamed = `${screen.id}_${id}`.slice(0, 31);
        const walkRename = (n: ComponentNode) => {
          if (n.id === id) n.id = renamed;
          n.children.forEach(walkRename);
        };
        walkRename(screen.root);
      }
      seen.add(id);
    }
  }

  return { screens, stateKeys: Array.from(stateKeys), look, rules, wiring, text };
}

/** Provisional tree → a normal doc so the approval card can render thumbnails. */
export function blueprintToDoc(
  parsed: ParsedBlueprint,
  base: import('../types/tree').ProjectDoc,
): import('../types/tree').ProjectDoc {
  return {
    ...base,
    screens: parsed.screens.map((s) => ({
      ...s,
      root: hydrateNode(s.root, new Set(), { forceId: s.root.id }),
    })),
    updatedAt: Date.now(),
  };
}
