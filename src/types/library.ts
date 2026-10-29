import type { ComponentType, EventName, StyleSet } from './tree';

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

/**
 * Every prop belongs to a group, and every prop explains itself. The
 * completeness test fails the build if either is missing — a field the user
 * cannot understand is a field that should not be on screen.
 */
export type PropGroup = 'Content' | 'Behavior' | 'Advanced';

export interface PropDef {
  key: string;
  label: string;
  kind: PropKind;
  group: PropGroup;
  hint: string;
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

const p = (
  key: string,
  label: string,
  kind: PropKind,
  group: PropGroup,
  hint: string,
  extra: Partial<PropDef> = {},
): PropDef => ({ key, label, kind, group, hint, ...extra });

export const COMPONENT_SPECS: ComponentSpec[] = [
  {
    type: 'screen',
    label: 'Screen',
    group: 'Layout',
    container: true,
    icon: 'grid',
    hint: 'The page itself. Its children stack top-to-bottom unless Layout says otherwise.',
    defaultProps: { layout: 'flex-col' },
    styles: {
      padding: 'var(--pad-screen)',
      background: 'var(--openui-bg)',
      gap: 'var(--gap-section)',
      width: '100%',
    },
    props: [
      p(
        'layout',
        'Layout',
        'select',
        'Content',
        'Vertical stacks like a Column; horizontal lays its sections out in a Row.',
        { options: ['flex-col', 'flex-row'] },
      ),
    ],
  },
  {
    type: 'row',
    label: 'Row (horizontal)',
    group: 'Layout',
    container: true,
    icon: 'chevron-right',
    hint: 'Linear layout, left to right. Children stack with gap; set grow on a child to let it soak up leftover width.',
    defaultProps: {},
    styles: { width: '100%', gap: 'var(--gap-item)', align: 'center', wrap: true },
    props: [],
  },
  {
    type: 'col',
    label: 'Column (vertical)',
    group: 'Layout',
    container: true,
    icon: 'list',
    hint: 'Linear layout, top to bottom. Children stack with gap; set grow on a child to let it soak up leftover height.',
    defaultProps: {},
    styles: { width: '100%', gap: 'var(--gap-item)', align: 'stretch' },
    props: [],
  },
  {
    type: 'grid',
    label: 'Grid',
    group: 'Layout',
    container: true,
    icon: 'grid',
    hint: 'Even columns. Cells share the width; override the column count per breakpoint.',
    defaultProps: { columns: 2 },
    styles: { width: '100%', columns: 2, gap: 'var(--gap-item)' },
    props: [
      p('columns', 'Columns', 'number', 'Content', 'How many even columns the grid lays out.', {
        min: 2,
        max: 6,
      }),
    ],
  },
  {
    type: 'card',
    label: 'Card',
    group: 'Layout',
    container: true,
    icon: 'tag',
    hint: 'A rounded surface that groups what is inside it.',
    defaultProps: { title: '' },
    styles: {
      padding: 'var(--pad-card)',
      background: 'var(--openui-elevated)',
      border: '1px solid var(--openui-border-default)',
      borderRadius: 'var(--radius-card)',
      gap: 'var(--gap-item)',
    },
    props: [
      p(
        'title',
        'Title',
        'text',
        'Content',
        'Optional heading rendered above the children. Leave blank for a plain surface.',
      ),
    ],
  },
  {
    type: 'hero',
    label: 'Hero',
    group: 'Layout',
    container: true,
    icon: 'image',
    hint: 'Full-width banner. Splits side-by-side when the screen is expanded.',
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
      p('title', 'Title', 'text', 'Content', 'The big line. Keep it under eight words.'),
      p('subtitle', 'Subtitle', 'text', 'Content', 'One sentence under the title.'),
      p(
        'image',
        'Image',
        'data',
        'Advanced',
        'https: or data: URL. Blank keeps the gradient.',
      ),
    ],
  },
  {
    type: 'section',
    label: 'Section',
    group: 'Layout',
    container: true,
    icon: 'list',
    hint: 'A titled group of blocks, with more space around it than inside.',
    defaultProps: { title: 'Section' },
    styles: { gap: 'var(--gap-item)' },
    props: [
      p('title', 'Title', 'text', 'Content', 'Optional label above the group.'),
    ],
  },
  {
    type: 'form',
    label: 'Form',
    group: 'Layout',
    container: true,
    icon: 'edit',
    hint: 'Children submit together; the submit button appears in Run mode.',
    defaultProps: { submitLabel: 'Submit' },
    styles: { gap: 'var(--gap-item)' },
    props: [
      p(
        'submitLabel',
        'Submit label',
        'text',
        'Content',
        'The word on the button that submits this form.',
      ),
    ],
  },
  {
    type: 'tabs',
    label: 'Tabs',
    group: 'Layout',
    container: true,
    icon: 'grid',
    hint: 'One child per tab panel. Click a tab on the canvas to switch panels.',
    defaultProps: { items: ['One', 'Two'] },
    props: [
      p('items', 'Tabs', 'data', 'Content', 'Tab labels, comma separated. One child per label.'),
    ],
  },
  {
    type: 'heading',
    label: 'Heading',
    group: 'Text',
    container: false,
    icon: 'list',
    hint: 'Levels 1–4, sizes from tokens. Double-click on the canvas to edit the text.',
    defaultProps: { text: 'Heading', level: 2 },
    props: [
      p('text', 'Text', 'text', 'Content', 'What the heading says.', { required: true }),
      p('level', 'Level', 'select', 'Content', '1 is the page title, 4 the smallest.', {
        options: ['1', '2', '3', '4'],
      }),
    ],
  },
  {
    type: 'text',
    label: 'Text',
    group: 'Text',
    container: false,
    icon: 'edit',
    hint: 'Body copy. Line breaks are kept.',
    defaultProps: { text: 'Body text that says something useful.' },
    props: [
      p('text', 'Text', 'longtext', 'Content', 'The paragraph.', { required: true }),
    ],
  },
  {
    type: 'label',
    label: 'Label',
    group: 'Text',
    container: false,
    icon: 'tag',
    hint: 'Small field label, sits right above an input.',
    defaultProps: { text: 'Label' },
    props: [p('text', 'Text', 'text', 'Content', 'What the label says.')],
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
      p('text', 'Text', 'text', 'Content', 'The word inside the chip.'),
      p('tone', 'Tone', 'tone', 'Content', 'Colour meaning: accent, success, danger or neutral.', {
        options: ['accent', 'success', 'danger', 'neutral'],
      }),
    ],
  },
  {
    type: 'divider',
    label: 'Divider',
    group: 'Text',
    container: false,
    icon: 'minus',
    hint: 'A hairline. Use it to separate two groups inside a card.',
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
    hint: 'From the fixed icon set — no other glyphs are allowed.',
    defaultProps: { name: 'star', size: 20 },
    props: [
      p('name', 'Icon', 'icon', 'Content', 'Which icon to draw.'),
      p('size', 'Size', 'number', 'Content', 'Pixels, 12 to 48.', { min: 12, max: 48 }),
    ],
  },
  {
    type: 'image',
    label: 'Image',
    group: 'Text',
    container: false,
    icon: 'image',
    hint: 'https: or data: only. Height comes from the Size section of the Style tab.',
    defaultProps: { src: '', alt: 'Image', fit: 'cover' },
    styles: { width: '100%', borderRadius: 'var(--radius-card)' },
    props: [
      p('src', 'Source', 'data', 'Content', 'A picture URL. Blank shows typographic art.'),
      p('alt', 'Alt text', 'text', 'Advanced', 'Read out by screen readers, and shown if the image fails.'),
      p('fit', 'Fit', 'select', 'Content', 'Cover crops to fill; contain shows the whole picture.', {
        options: ['cover', 'contain'],
      }),
    ],
  },
  {
    type: 'avatar',
    label: 'Avatar',
    group: 'Text',
    container: false,
    icon: 'user',
    hint: 'Round portrait, or initials when there is no picture.',
    defaultProps: { src: '', initials: 'MA', size: 44 },
    props: [
      p('src', 'Source', 'data', 'Content', 'A picture URL. Blank shows the initials.'),
      p('initials', 'Initials', 'text', 'Content', 'One or two letters.', { required: true }),
      p('size', 'Size', 'number', 'Content', 'Pixels, 16 to 96.', { min: 16, max: 96 }),
    ],
  },
  {
    type: 'progress',
    label: 'Progress',
    group: 'Text',
    container: false,
    icon: 'check-circle',
    hint: 'A bar between 0 and 100.',
    defaultProps: { value: 60, label: '' },
    props: [
      p('value', 'Value', 'number', 'Content', 'How full the bar is, 0 to 100.', {
        min: 0,
        max: 100,
      }),
      p('label', 'Label', 'text', 'Content', 'Optional caption above the bar.'),
    ],
  },
  {
    type: 'spinner',
    label: 'Spinner',
    group: 'Text',
    container: false,
    icon: 'refresh-cw',
    hint: 'A loading arc. Animate nothing else — it is the only motion this app has.',
    defaultProps: {},
    props: [],
  },
  {
    type: 'button',
    label: 'Button',
    group: 'Input',
    container: false,
    icon: 'plus',
    hint: 'A tap target. Wire what it does in the Events tab.',
    defaultProps: { text: 'Button', variant: 'primary', icon: '', disabled: false },
    props: [
      p('text', 'Text', 'text', 'Content', 'The word on the button.', { required: true }),
      p('variant', 'Variant', 'select', 'Content', 'How loud the button is.', {
        options: ['primary', 'secondary', 'ghost', 'danger'],
      }),
      p('icon', 'Icon', 'icon', 'Content', 'Optional icon drawn before the text.', {
        defaultValue: '',
      }),
      p(
        'disabled',
        'Disabled',
        'toggle',
        'Behavior',
        'Greyed out and untappable — but still selectable on the canvas.',
      ),
    ],
  },
  {
    type: 'iconbutton',
    label: 'Icon button',
    group: 'Input',
    container: false,
    icon: 'plus',
    hint: 'A square tap target holding one icon.',
    defaultProps: { icon: 'settings', variant: 'secondary' },
    props: [
      p('icon', 'Icon', 'icon', 'Content', 'Which icon the button shows.'),
      p('variant', 'Variant', 'select', 'Content', 'How loud the button is.', {
        options: ['primary', 'secondary', 'ghost'],
      }),
    ],
  },
  {
    type: 'input',
    label: 'Input',
    group: 'Input',
    container: false,
    icon: 'edit',
    hint: 'One-line text field, bound to a state key.',
    defaultProps: { placeholder: 'Type here', bindKey: 'text', inputType: 'text' },
    props: [
      p('placeholder', 'Placeholder', 'text', 'Content', 'Grey text shown while the field is empty.'),
      p('bindKey', 'State key', 'bind', 'Behavior', 'Reads and writes this run-mode value. No code.'),
      p('inputType', 'Input type', 'select', 'Behavior', 'What the field accepts and how it masks it.', {
        options: ['text', 'number', 'password', 'phone'],
      }),
    ],
  },
  {
    type: 'textarea',
    label: 'Textarea',
    group: 'Input',
    container: false,
    icon: 'edit',
    hint: 'Multi-line field for longer answers.',
    defaultProps: { placeholder: 'Say more', bindKey: 'notes', rows: 4 },
    props: [
      p('placeholder', 'Placeholder', 'text', 'Content', 'Grey text shown while the field is empty.'),
      p('bindKey', 'State key', 'bind', 'Behavior', 'Reads and writes this run-mode value.'),
      p('rows', 'Rows', 'number', 'Content', 'How tall the box starts, in lines.', {
        min: 2,
        max: 10,
      }),
    ],
  },
  {
    type: 'select',
    label: 'Select',
    group: 'Input',
    container: false,
    icon: 'chevron-down',
    hint: 'Dropdown with a fixed list of options.',
    defaultProps: { options: ['One', 'Two', 'Three'], bindKey: 'choice' },
    props: [
      p('options', 'Options', 'data', 'Content', 'The choices, comma separated.', {
        required: true,
      }),
      p('bindKey', 'State key', 'bind', 'Behavior', 'Reads and writes this run-mode value.'),
    ],
  },
  {
    type: 'checkbox',
    label: 'Checkbox',
    group: 'Input',
    container: false,
    icon: 'check',
    hint: 'A yes/no box bound to a state key.',
    defaultProps: { label: 'Remember me', bindKey: 'remember' },
    props: [
      p('label', 'Label', 'text', 'Content', 'The text beside the box.'),
      p('bindKey', 'State key', 'bind', 'Behavior', 'Reads and writes this run-mode value.'),
    ],
  },
  {
    type: 'switch',
    label: 'Switch',
    group: 'Input',
    container: false,
    icon: 'check',
    hint: 'An on/off switch bound to a state key.',
    defaultProps: { label: 'Notifications', bindKey: 'notifications' },
    props: [
      p('label', 'Label', 'text', 'Content', 'The text beside the switch.'),
      p('bindKey', 'State key', 'bind', 'Behavior', 'Reads and writes this run-mode value.'),
    ],
  },
  {
    type: 'slider',
    label: 'Slider',
    group: 'Input',
    container: false,
    icon: 'minus',
    hint: 'A number you drag between a minimum and a maximum.',
    defaultProps: { min: 0, max: 100, step: 1, bindKey: 'amount', label: '' },
    props: [
      p('label', 'Label', 'text', 'Content', 'Optional caption above the track.'),
      p('min', 'Min', 'number', 'Behavior', 'The lowest value.'),
      p('max', 'Max', 'number', 'Behavior', 'The highest value.'),
      p('step', 'Step', 'number', 'Behavior', 'How far one drag moves the value.'),
      p('bindKey', 'State key', 'bind', 'Behavior', 'Reads and writes this run-mode value.'),
    ],
  },
  {
    type: 'datepicker',
    label: 'Date',
    group: 'Input',
    container: false,
    icon: 'calendar',
    hint: 'A date field bound to a state key.',
    defaultProps: { bindKey: 'date' },
    props: [
      p('bindKey', 'State key', 'bind', 'Behavior', 'Reads and writes this date.'),
    ],
  },
  {
    type: 'navbar',
    label: 'Nav bar',
    group: 'Navigation',
    container: false,
    icon: 'menu',
    hint: 'Top bar. Each item jumps to a screen with a matching name.',
    defaultProps: { items: ['Home', 'Features', 'Pricing'], brand: 'Museware' },
    props: [
      p(
        'items',
        'Items',
        'data',
        'Content',
        'Links, comma separated. Each should match a screen name.',
      ),
      p('brand', 'Brand', 'text', 'Content', 'The wordmark on the left.'),
    ],
  },
  {
    type: 'bottomnav',
    label: 'Bottom nav',
    group: 'Navigation',
    container: false,
    icon: 'grid',
    hint: 'Thumb-reach navigation. Each item jumps to a screen with a matching name.',
    defaultProps: { items: ['Home', 'Stats', 'Settings'] },
    props: [
      p(
        'items',
        'Items',
        'data',
        'Content',
        'Tabs, comma separated. Each should match a screen name.',
      ),
    ],
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
      p('text', 'Text', 'text', 'Content', 'The link’s words.'),
      p('to', 'Screen', 'screen', 'Behavior', 'Where the link goes when tapped.'),
    ],
  },
  {
    type: 'fab',
    label: 'FAB',
    group: 'Navigation',
    container: false,
    icon: 'plus',
    hint: 'Floating action button — one primary action per screen.',
    defaultProps: { icon: 'plus' },
    props: [p('icon', 'Icon', 'icon', 'Content', 'Which icon the button shows.')],
  },
  {
    type: 'list',
    label: 'List',
    group: 'Data',
    container: false,
    icon: 'list',
    hint: 'Repeats one row template over mock rows. You select the list, not its rows.',
    defaultProps: { dataKey: '', itemTemplate: null, divider: false },
    props: [
      p('dataKey', 'Data key', 'data', 'Content', 'Which mock dataset fills the rows.'),
      p(
        'divider',
        'Hairlines between rows',
        'toggle',
        'Content',
        'Draw a thin rule between rows instead of separate cards.',
      ),
    ],
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
      p('columns', 'Columns', 'data', 'Content', 'Header names, comma separated.', {
        required: true,
      }),
      p('dataKey', 'Data key', 'data', 'Content', 'Which mock dataset fills the rows.'),
    ],
  },
  {
    type: 'stat',
    label: 'Stat',
    group: 'Data',
    container: false,
    icon: 'trophy',
    hint: 'A big number with a label and a change.',
    defaultProps: { label: 'Total', value: '1,284', delta: '+12%' },
    props: [
      p('label', 'Label', 'text', 'Content', 'What the number counts.'),
      p('value', 'Value', 'text', 'Content', 'The number itself.', { required: true }),
      p('delta', 'Delta', 'text', 'Content', 'The change, e.g. +12%.'),
    ],
  },
  {
    type: 'chart',
    label: 'Chart',
    group: 'Data',
    container: false,
    icon: 'trophy',
    hint: 'Bars, a line or a sparkline from up to 12 points.',
    defaultProps: { kind: 'bar', dataKey: '' },
    props: [
      p('kind', 'Kind', 'select', 'Content', 'Bars for comparison, line for a trend.', {
        options: ['bar', 'line', 'spark'],
      }),
      p('dataKey', 'Data key', 'data', 'Content', 'Which mock dataset feeds the chart.'),
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

/* ------------------------------------------------------------------ *
 * EVENTS — which block can answer which trigger
 * ------------------------------------------------------------------ */

/**
 * The Events tab used to show tap/change/submit to every block, so a Divider
 * offered three dead editors. This map is the truth the inspector renders
 * from, and NodeBody fires exactly what it lists: every type below has a real
 * handler in run mode.
 */
export const EVENT_MAP: Record<EventName, ComponentType[]> = {
  tap: [
    'heading',
    'text',
    'label',
    'card',
    'hero',
    'section',
    'image',
    'avatar',
    'button',
    'iconbutton',
    'fab',
    'link',
    'list',
    'table',
    'stat',
    'chart',
    'navbar',
    'bottomnav',
  ],
  change: [
    'input',
    'textarea',
    'select',
    'checkbox',
    'switch',
    'slider',
    'datepicker',
    'tabs',
  ],
  submit: ['form'],
};

/**
 * Types that carry text a Style tab can style. One list, used by the inspector
 * to decide whether to show the Type section at all.
 */
export const TEXT_TYPES: ComponentType[] = [
  'heading',
  'text',
  'label',
  'badge',
  'button',
  'link',
  'stat',
];

export function isTextType(type: ComponentType | string): boolean {
  return TEXT_TYPES.includes(type as ComponentType);
}

export const EVENT_NAMES: EventName[] = ['tap', 'change', 'submit'];

export function eventsFor(type: ComponentType | string): EventName[] {
  return EVENT_NAMES.filter((name) => EVENT_MAP[name].includes(type as ComponentType));
}

export function hasEvents(type: ComponentType | string): boolean {
  return eventsFor(type).length > 0;
}
