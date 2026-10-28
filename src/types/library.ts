import type { ComponentType, StyleSet } from './tree';

/** The ONLY valid icon names. Enforced by validate.ts and the inspector picker. */
export const ICON_NAMES = [
  'home',
  'search',
  'settings',
  'user',
  'users',
  'heart',
  'star',
  'bell',
  'calendar',
  'clock',
  'check',
  'check-circle',
  'plus',
  'minus',
  'x',
  'chevron-right',
  'chevron-left',
  'chevron-down',
  'arrow-right',
  'arrow-left',
  'trash',
  'edit',
  'share',
  'download',
  'upload',
  'image',
  'camera',
  'play',
  'pause',
  'refresh-cw',
  'filter',
  'list',
  'grid',
  'menu',
  'more-horizontal',
  'map-pin',
  'mail',
  'phone',
  'shopping-cart',
  'tag',
  'gift',
  'trophy',
  'flame',
  'moon',
  'sun',
  'droplet',
  'book',
  'music',
  'wifi',
  'lock',
  'eye',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export type PropKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'select'
  | 'toggle'
  | 'icon'
  | 'screen'
  | 'tone'
  | 'actions'
  | 'data'
  | 'bind';

export interface PropDef {
  key: string;
  label: string;
  kind: PropKind;
  hint?: string;
  options?: string[];
  min?: number;
  max?: number;
  defaultValue?: unknown;
  required?: boolean;
}

export type Group = 'Layout' | 'Text' | 'Input' | 'Navigation' | 'Data';

export interface ComponentSpec {
  type: ComponentType;
  label: string;
  group: Group;
  container: boolean;
  icon: IconName;
  hint: string;
  defaultProps: Record<string, unknown>;
  styles?: StyleSet;
  props: PropDef[];
}

const styleDefs = (over: StyleSet): StyleSet => over;

export const COMPONENT_SPECS: ComponentSpec[] = [
  {
    type: 'screen',
    label: 'Screen',
    group: 'Layout',
    container: true,
    icon: 'grid',
    hint: 'Full-page column. One per screen.',
    defaultProps: { title: 'Screen', layout: 'flex-col', scroll: true },
    styles: styleDefs({
      padding: 'var(--pad-screen)',
      background: 'var(--openui-bg)',
      gap: 'var(--gap-section)',
      width: '100%',
    }),
    props: [
      { key: 'title', label: 'Title', kind: 'text', hint: 'Screen title' },
      { key: 'layout', label: 'Layout', kind: 'select', options: ['flex-col', 'flex-row'] },
      { key: 'scroll', label: 'Scrolls', kind: 'toggle' },
    ],
  },
  {
    type: 'row',
    label: 'Row',
    group: 'Layout',
    container: true,
    icon: 'chevron-right',
    hint: 'Lays children out horizontally. Wraps by default.',
    defaultProps: { gap: 'var(--gap-item)', align: 'center', wrap: true },
    styles: { width: '100%' },
    props: [
      { key: 'gap', label: 'Gap', kind: 'text' },
      {
        key: 'align',
        label: 'Align',
        kind: 'select',
        options: ['start', 'center', 'end', 'stretch'],
      },
      { key: 'wrap', label: 'Wrap', kind: 'toggle' },
    ],
  },
  {
    type: 'col',
    label: 'Column',
    group: 'Layout',
    container: true,
    icon: 'list',
    hint: 'Stacks children vertically.',
    defaultProps: { gap: 'var(--gap-item)', align: 'stretch' },
    styles: { width: '100%' },
    props: [
      { key: 'gap', label: 'Gap', kind: 'text' },
      {
        key: 'align',
        label: 'Align',
        kind: 'select',
        options: ['start', 'center', 'end', 'stretch'],
      },
    ],
  },
  {
    type: 'grid',
    label: 'Grid',
    group: 'Layout',
    container: true,
    icon: 'grid',
    hint: 'Responsive card grid. Override columns per breakpoint.',
    defaultProps: { columns: 2, gap: 'var(--gap-item)' },
    styles: { width: '100%', columns: 2 },
    props: [
      { key: 'columns', label: 'Columns', kind: 'number', min: 2, max: 6 },
      { key: 'gap', label: 'Gap', kind: 'text' },
    ],
  },
  {
    type: 'card',
    label: 'Card',
    group: 'Layout',
    container: true,
    icon: 'tag',
    hint: 'Elevated rounded surface.',
    defaultProps: { title: '', pad: 'var(--pad-card)' },
    props: [
      { key: 'title', label: 'Title', kind: 'text' },
      { key: 'pad', label: 'Padding', kind: 'text' },
    ],
  },
  {
    type: 'hero',
    label: 'Hero',
    group: 'Layout',
    container: true,
    icon: 'image',
    hint: 'Full-width banner. Splits side-by-side when expanded.',
    defaultProps: {
      title: 'A hero headline',
      subtitle: 'One line about why this exists.',
    },
    styles: {
      background: 'linear-gradient(135deg, var(--openui-accent), var(--openui-secondary))',
      color: 'var(--openui-text-on-accent)',
      padding: 'var(--pad-card)',
      borderRadius: 'var(--radius-card)',
      minWidth: '0',
    },
    props: [
      { key: 'title', label: 'Title', kind: 'text' },
      { key: 'subtitle', label: 'Subtitle', kind: 'text' },
      { key: 'image', label: 'Image', kind: 'data', hint: 'https: or data: URL' },
    ],
  },
  {
    type: 'section',
    label: 'Section',
    group: 'Layout',
    container: true,
    icon: 'list',
    hint: 'Titled grouping.',
    defaultProps: { title: 'Section' },
    props: [{ key: 'title', label: 'Title', kind: 'text' }],
  },
  {
    type: 'form',
    label: 'Form',
    group: 'Layout',
    container: true,
    icon: 'edit',
    hint: 'Inputs that submit together.',
    defaultProps: { submitLabel: 'Submit' },
    styles: { gap: 'var(--gap-item)' },
    props: [{ key: 'submitLabel', label: 'Submit label', kind: 'text' }],
  },
  {
    type: 'tabs',
    label: 'Tabs',
    group: 'Layout',
    container: true,
    icon: 'grid',
    hint: 'Tab strip. Children show as panels.',
    defaultProps: { items: ['One', 'Two'] },
    props: [{ key: 'items', label: 'Tabs', kind: 'data', hint: 'comma separated' }],
  },
  {
    type: 'heading',
    label: 'Heading',
    group: 'Text',
    container: false,
    icon: 'list',
    hint: 'Levels 1–4, sizes from tokens.',
    defaultProps: { text: 'Heading', level: 2 },
    props: [
      { key: 'text', label: 'Text', kind: 'text', required: true },
      { key: 'level', label: 'Level', kind: 'select', options: ['1', '2', '3', '4'] },
    ],
  },
  {
    type: 'text',
    label: 'Text',
    group: 'Text',
    container: false,
    icon: 'edit',
    hint: 'Body copy.',
    defaultProps: { text: 'Body text that says something useful.' },
    props: [{ key: 'text', label: 'Text', kind: 'longtext', required: true }],
  },
  {
    type: 'label',
    label: 'Label',
    group: 'Text',
    container: false,
    icon: 'tag',
    hint: 'Small field label.',
    defaultProps: { text: 'Label' },
    props: [{ key: 'text', label: 'Text', kind: 'text' }],
  },
  {
    type: 'badge',
    label: 'Badge',
    group: 'Text',
    container: false,
    icon: 'tag',
    hint: 'Status chip.',
    defaultProps: { text: 'New', tone: 'accent' },
    props: [
      { key: 'text', label: 'Text', kind: 'text' },
      {
        key: 'tone',
        label: 'Tone',
        kind: 'tone',
        options: ['accent', 'success', 'danger', 'neutral'],
      },
    ],
  },
  {
    type: 'divider',
    label: 'Divider',
    group: 'Text',
    container: false,
    icon: 'minus',
    hint: 'A hairline.',
    defaultProps: {},
    styles: { width: '100%', height: '1px', background: 'var(--openui-border-default)' },
    props: [],
  },
  {
    type: 'icon',
    label: 'Icon',
    group: 'Text',
    container: false,
    icon: 'star',
    hint: 'From the fixed Lucide set.',
    defaultProps: { name: 'star', size: 20 },
    props: [
      { key: 'name', label: 'Icon', kind: 'icon' },
      { key: 'size', label: 'Size', kind: 'number', min: 12, max: 48 },
    ],
  },
  {
    type: 'image',
    label: 'Image',
    group: 'Text',
    container: false,
    icon: 'image',
    hint: 'https: or data: only. Placeholder otherwise.',
    defaultProps: { src: '', alt: 'Image', fit: 'cover' },
    styles: { width: '100%', borderRadius: 'var(--radius-card)' },
    props: [
      { key: 'src', label: 'Source', kind: 'data', hint: 'https: or data: data-URI' },
      { key: 'alt', label: 'Alt text', kind: 'text' },
      { key: 'fit', label: 'Fit', kind: 'select', options: ['cover', 'contain'] },
    ],
  },
  {
    type: 'avatar',
    label: 'Avatar',
    group: 'Text',
    container: false,
    icon: 'user',
    hint: 'Round portrait or initials.',
    defaultProps: { src: '', initials: 'MA', size: 44 },
    props: [
      { key: 'src', label: 'Source', kind: 'data' },
      { key: 'initials', label: 'Initials', kind: 'text' },
      { key: 'size', label: 'Size', kind: 'number', min: 24, max: 96 },
    ],
  },
  {
    type: 'progress',
    label: 'Progress',
    group: 'Text',
    container: false,
    icon: 'check-circle',
    hint: '0–100 bar.',
    defaultProps: { value: 60, label: '' },
    props: [
      { key: 'value', label: 'Value', kind: 'number', min: 0, max: 100 },
      { key: 'label', label: 'Label', kind: 'text' },
    ],
  },
  {
    type: 'spinner',
    label: 'Spinner',
    group: 'Text',
    container: false,
    icon: 'refresh-cw',
    hint: 'Loading arc.',
    defaultProps: {},
    props: [],
  },
  {
    type: 'button',
    label: 'Button',
    group: 'Input',
    container: false,
    icon: 'plus',
    hint: 'Tap target with an action.',
    defaultProps: { text: 'Button', variant: 'primary' },
    props: [
      { key: 'text', label: 'Text', kind: 'text', required: true },
      {
        key: 'variant',
        label: 'Variant',
        kind: 'select',
        options: ['primary', 'secondary', 'ghost', 'danger'],
      },
    ],
  },
  {
    type: 'iconbutton',
    label: 'Icon button',
    group: 'Input',
    container: false,
    icon: 'plus',
    hint: 'Square icon target.',
    defaultProps: { icon: 'settings', variant: 'secondary' },
    props: [
      { key: 'icon', label: 'Icon', kind: 'icon' },
      {
        key: 'variant',
        label: 'Variant',
        kind: 'select',
        options: ['primary', 'secondary', 'ghost'],
      },
    ],
  },
  {
    type: 'input',
    label: 'Input',
    group: 'Input',
    container: false,
    icon: 'edit',
    hint: 'Text field bound to a state key.',
    defaultProps: { placeholder: 'Type here', bindKey: 'text' },
    props: [
      { key: 'placeholder', label: 'Placeholder', kind: 'text' },
      { key: 'bindKey', label: 'State key', kind: 'bind' },
    ],
  },
  {
    type: 'textarea',
    label: 'Textarea',
    group: 'Input',
    container: false,
    icon: 'edit',
    hint: 'Multi-line field.',
    defaultProps: { placeholder: 'Say more', bindKey: 'notes', rows: 4 },
    props: [
      { key: 'placeholder', label: 'Placeholder', kind: 'text' },
      { key: 'bindKey', label: 'State key', kind: 'bind' },
      { key: 'rows', label: 'Rows', kind: 'number', min: 2, max: 10 },
    ],
  },
  {
    type: 'select',
    label: 'Select',
    group: 'Input',
    container: false,
    icon: 'chevron-down',
    hint: 'Dropdown with fixed options.',
    defaultProps: { options: ['One', 'Two', 'Three'], bindKey: 'choice' },
    props: [
      { key: 'options', label: 'Options', kind: 'data', hint: 'comma separated' },
      { key: 'bindKey', label: 'State key', kind: 'bind' },
    ],
  },
  {
    type: 'checkbox',
    label: 'Checkbox',
    group: 'Input',
    container: false,
    icon: 'check',
    hint: 'Boolean bound to a state key.',
    defaultProps: { label: 'Remember me', bindKey: 'remember' },
    props: [
      { key: 'label', label: 'Label', kind: 'text' },
      { key: 'bindKey', label: 'State key', kind: 'bind' },
    ],
  },
  {
    type: 'switch',
    label: 'Switch',
    group: 'Input',
    container: false,
    icon: 'check',
    hint: 'On/off bound to a state key.',
    defaultProps: { label: 'Notifications', bindKey: 'notifications' },
    props: [
      { key: 'label', label: 'Label', kind: 'text' },
      { key: 'bindKey', label: 'State key', kind: 'bind' },
    ],
  },
  {
    type: 'slider',
    label: 'Slider',
    group: 'Input',
    container: false,
    icon: 'minus',
    hint: 'Numeric range.',
    defaultProps: { min: 0, max: 100, step: 1, bindKey: 'amount' },
    props: [
      { key: 'min', label: 'Min', kind: 'number' },
      { key: 'max', label: 'Max', kind: 'number' },
      { key: 'step', label: 'Step', kind: 'number' },
      { key: 'bindKey', label: 'State key', kind: 'bind' },
    ],
  },
  {
    type: 'datepicker',
    label: 'Date',
    group: 'Input',
    container: false,
    icon: 'calendar',
    hint: 'Date field.',
    defaultProps: { bindKey: 'date' },
    props: [{ key: 'bindKey', label: 'State key', kind: 'bind' }],
  },
  {
    type: 'navbar',
    label: 'Nav bar',
    group: 'Navigation',
    container: false,
    icon: 'menu',
    hint: 'Top app bar.',
    defaultProps: { items: ['Home', 'Features', 'Pricing'], brand: 'Museware' },
    props: [
      { key: 'items', label: 'Items', kind: 'data', hint: 'comma separated' },
      { key: 'brand', label: 'Brand', kind: 'text' },
    ],
  },
  {
    type: 'bottomnav',
    label: 'Bottom nav',
    group: 'Navigation',
    container: false,
    icon: 'grid',
    hint: 'Thumb-reach navigation.',
    defaultProps: { items: ['Home', 'Stats', 'Settings'] },
    props: [{ key: 'items', label: 'Items', kind: 'data', hint: 'comma separated' }],
  },
  {
    type: 'link',
    label: 'Link',
    group: 'Navigation',
    container: false,
    icon: 'arrow-right',
    hint: 'Text that navigates to a screen.',
    defaultProps: { text: 'See more', to: '' },
    props: [
      { key: 'text', label: 'Text', kind: 'text' },
      { key: 'to', label: 'Screen', kind: 'screen' },
    ],
  },
  {
    type: 'fab',
    label: 'FAB',
    group: 'Navigation',
    container: false,
    icon: 'plus',
    hint: 'Floating action button.',
    defaultProps: { icon: 'plus' },
    props: [{ key: 'icon', label: 'Icon', kind: 'icon' }],
  },
  {
    type: 'list',
    label: 'List',
    group: 'Data',
    container: false,
    icon: 'list',
    hint: 'Repeats an item template over mock rows.',
    defaultProps: { dataKey: '', itemTemplate: null },
    props: [{ key: 'dataKey', label: 'Data key', kind: 'data' }],
  },
  {
    type: 'table',
    label: 'Table',
    group: 'Data',
    container: false,
    icon: 'grid',
    hint: 'Columns and rows from mock data.',
    defaultProps: { columns: ['Name', 'Value'], dataKey: '' },
    props: [
      { key: 'columns', label: 'Columns', kind: 'data', hint: 'comma separated' },
      { key: 'dataKey', label: 'Data key', kind: 'data' },
    ],
  },
  {
    type: 'stat',
    label: 'Stat',
    group: 'Data',
    container: false,
    icon: 'trophy',
    hint: 'Big number with a delta.',
    defaultProps: { label: 'Total', value: '1,284', delta: '+12%' },
    props: [
      { key: 'label', label: 'Label', kind: 'text' },
      { key: 'value', label: 'Value', kind: 'text' },
      { key: 'delta', label: 'Delta', kind: 'text' },
    ],
  },
  {
    type: 'chart',
    label: 'Chart',
    group: 'Data',
    container: false,
    icon: 'trophy',
    hint: 'Bar/line/spark from ≤12 points.',
    defaultProps: { kind: 'bar', dataKey: '' },
    props: [
      { key: 'kind', label: 'Kind', kind: 'select', options: ['bar', 'line', 'spark'] },
      { key: 'dataKey', label: 'Data key', kind: 'data' },
    ],
  },
];

const BY_TYPE = new Map(COMPONENT_SPECS.map((s) => [s.type as string, s]));

export function spec(type: ComponentType | string): ComponentSpec | undefined {
  return BY_TYPE.get(type);
}

export function isContainerType(type: string): boolean {
  return Boolean(BY_TYPE.get(type)?.container);
}

export function defaultPropsFor(type: ComponentType): Record<string, unknown> {
  const s = BY_TYPE.get(type);
  return s ? (JSON.parse(JSON.stringify(s.defaultProps)) as Record<string, unknown>) : {};
}

export function defaultStylesFor(type: ComponentType): StyleSet {
  const s = BY_TYPE.get(type);
  return s?.styles ? (JSON.parse(JSON.stringify(s.styles)) as StyleSet) : {};
}

export const PALETTE_GROUPS: Group[] = ['Layout', 'Text', 'Input', 'Navigation', 'Data'];
