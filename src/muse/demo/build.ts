import type {
  ComponentNode,
  ComponentType,
  Events,
  MockRow,
  ScreenDoc,
  StyleSet,
} from '../../types/tree';
import type { DesignTokens } from '../../types/tokens';
import { defaultPropsFor, defaultStylesFor } from '../../types/library';
import { placeholderImage } from '../../canvas/placeholder';

interface NodeOpts {
  props?: Record<string, unknown>;
  styles?: StyleSet;
  children?: ComponentNode[];
  events?: Events;
  name?: string;
}

export function n(type: ComponentType, id: string, opts: NodeOpts = {}): ComponentNode {
  return {
    id,
    type,
    name: opts.name,
    props: { ...defaultPropsFor(type), ...(opts.props || {}) },
    styles: { ...defaultStylesFor(type), ...(opts.styles || {}) },
    children: opts.children || [],
    ...(opts.events ? { events: opts.events } : {}),
  };
}

const navigate = (to: string): Events => ({ tap: [{ type: 'navigate', to }] });
const toast = (text: string): Events => ({ tap: [{ type: 'toast', text }] });

function screen(
  id: string,
  name: string,
  root: ComponentNode,
  opts: { entry?: boolean; mockData?: Record<string, MockRow[]> } = {},
): ScreenDoc {
  return {
    id,
    name,
    root,
    ...(opts.entry ? { entry: true } : {}),
    ...(opts.mockData ? { mockData: opts.mockData } : {}),
  };
}

function headingBlock(id: string, title: string, body: string): ComponentNode[] {
  return [
    n('heading', `${id}_title`, { props: { text: title, level: 3 } }),
    n('text', `${id}_body`, { props: { text: body } }),
  ];
}

const HABIT_ROWS: MockRow[] = [
  { title: 'Morning walk', detail: '20 minutes outside', meta: '6,204 steps' },
  { title: 'Deep work', detail: 'One focus block', meta: '2h 40m' },
  { title: 'Read', detail: 'Ten pages minimum', meta: '24 pages' },
  { title: 'Stretch', detail: 'Hips and shoulders', meta: '8 min' },
  { title: 'Water', detail: 'Eight glasses', meta: '1.8 L' },
  { title: 'Lights out', detail: 'Screens off by 22:30', meta: '22:14' },
];

const WEEK: MockRow[] = [
  { label: 'Mon', value: 3 },
  { label: 'Tue', value: 4 },
  { label: 'Wed', value: 2 },
  { label: 'Thu', value: 5 },
  { label: 'Fri', value: 4 },
  { label: 'Sat', value: 5 },
  { label: 'Sun', value: 3 },
];

export interface DemoTemplate {
  id: 'landing' | 'habits' | 'dashboard' | 'shop';
  label: string;
  kind: 'web' | 'app';
  projectName: string;
  blueprint: (tokens: DesignTokens) => string;
  screens: (tokens: DesignTokens) => ScreenDoc[];
}

const LOOK_LINE = (tokens: DesignTokens): string => {
  const m = tokens.openuiTheme.metrics_dp || {};
  const r = tokens.openuiTheme.radii_dp || {};
  return `LOOK: ${m.screen_pad ?? 20}dp outer padding, ${m.section_gap ?? 16}dp between sections, card radius ${r.card ?? 14}, title 24px, body 14px, colours by token name`;
};

function landing(_tokens: DesignTokens): ScreenDoc[] {
  void _tokens;
  const root = n('screen', 'landing_root', {
    props: { title: 'Landing', layout: 'flex-col', scroll: true },
    styles: { padding: '0', gap: '0' },
    children: [
      n('navbar', 'nav_top', {
        props: { brand: 'Lumen', items: ['Home', 'Features', 'Pricing'] },
        events: navigate('landing'),
      }),
      n('col', 'col_page', {
        styles: { padding: 'var(--pad-screen)', gap: 'var(--gap-section)' },
        children: [
          n('hero', 'hero_main', {
            props: {
              title: 'Ship the idea, not the setup',
              subtitle:
                'Lumen gives small teams a calm place to plan the week, keep the streak, and stop losing the thread.',
            },
            children: [
              n('row', 'row_hero_actions', {
                styles: { gap: '12px', align: 'center', marginTop: 'var(--gap-item)' },
                children: [
                  n('button', 'btn_start', {
                    props: { text: 'Start free', variant: 'primary' },
                    styles: {
                      width: 'auto',
                      background: 'var(--openui-fg)',
                      color: 'var(--openui-text-brand)',
                    },
                    events: toast('You are on the list — check your inbox.'),
                  }),
                  n('button', 'btn_tour', {
                    props: { text: 'See it run', variant: 'secondary' },
                    styles: {
                      width: 'auto',
                      background: 'transparent',
                      color: 'var(--openui-text-on-accent)',
                      border: '1px solid rgba(255,255,255,0.45)',
                    },
                    events: toast('Opening the 90-second tour…'),
                  }),
                ],
              }),
            ],
          }),
          n('section', 'sec_features', {
            props: { title: 'Everything the first version needs' },
            children: [
              n('grid', 'grid_feats', {
                props: { columns: 2 },
                styles: {
                  gap: 'var(--gap-item)',
                  responsive: { medium: { columns: 3 }, expanded: { columns: 3 } },
                },
                children: [
                  n('card', 'card_focus', {
                    children: [
                      ...headingBlock(
                        'txt_focus',
                        'Focus by default',
                        'One screen, one week. No dashboards to configure before the work starts.',
                      ),
                    ],
                  }),
                  n('card', 'card_share', {
                    children: [
                      ...headingBlock(
                        'txt_share',
                        'Share a link',
                        'Send the plan as a live page. Everyone edits the same truth.',
                      ),
                    ],
                  }),
                  n('card', 'card_shipped', {
                    children: [
                      ...headingBlock(
                        'txt_shipped',
                        'Ship weekly',
                        'A soft reset every Monday, with the streak carried forward.',
                      ),
                    ],
                  }),
                ],
              }),
            ],
          }),
          n('grid', 'grid_stats', {
            props: { columns: 2 },
            styles: { gap: 'var(--gap-item)', responsive: { medium: { columns: 3 } } },
            children: [
              n('stat', 'stat_teams', {
                props: { label: 'Teams on Lumen', value: '2,184', delta: '+18% MoM' },
              }),
              n('stat', 'stat_hours', {
                props: { label: 'Hours saved / wk', value: '6.4', delta: '+1.2' },
              }),
              n('stat', 'stat_churn', {
                props: { label: 'Weekly churn', value: '0.9%', delta: '−0.3' },
              }),
            ],
          }),
          n('section', 'sec_steps', {
            props: { title: 'How it works' },
            children: [
              n('row', 'row_step1', {
                styles: { align: 'start', gap: '12px' },
                children: [
                  n('badge', 'chip_step1', { props: { text: '01', tone: 'accent' } }),
                  n('text', 'txt_step1', {
                    props: { text: 'Pick the three habits that matter this week.' },
                  }),
                ],
              }),
              n('row', 'row_step2', {
                styles: { align: 'start', gap: '12px' },
                children: [
                  n('badge', 'chip_step2', { props: { text: '02', tone: 'accent' } }),
                  n('text', 'txt_step2', {
                    props: { text: 'Tap once per day. The plan keeps itself honest.' },
                  }),
                ],
              }),
              n('row', 'row_step3', {
                styles: { align: 'start', gap: '12px' },
                children: [
                  n('badge', 'chip_step3', { props: { text: '03', tone: 'accent' } }),
                  n('text', 'txt_step3', {
                    props: { text: 'Sunday review writes the next week for you.' },
                  }),
                ],
              }),
            ],
          }),
          n('card', 'card_cta', {
            styles: {
              background: 'var(--openui-accent)',
              border: '1px solid transparent',
              gap: 'var(--gap-item)',
            },
            children: [
              n('heading', 'txt_cta_title', {
                props: { text: 'Start the week with a plan, not a blank page.', level: 2 },
                styles: { color: 'var(--openui-text-on-accent)' },
              }),
              n('text', 'txt_cta_body', {
                props: {
                  text: 'Free while you are figuring it out. No card, no setup call.',
                },
                styles: { color: 'var(--openui-text-on-accent)', opacity: 0.86 },
              }),
              n('button', 'btn_cta', {
                props: { text: 'Start building', variant: 'primary' },
                styles: {
                  width: 'auto',
                  background: 'var(--openui-fg)',
                  color: 'var(--openui-text-brand)',
                },
                events: toast('Account created — welcome aboard.'),
              }),
            ],
          }),
          n('row', 'row_footer', {
            styles: { align: 'center', gap: '12px', justify: 'space-between' },
            children: [
              n('text', 'txt_copy', { props: { text: '© 2026 Lumen' } }),
              n('link', 'link_top', { props: { text: 'Back to top', to: 'landing' } }),
            ],
          }),
        ],
      }),
    ],
  });
  return [screen('landing', 'Landing', root, { entry: true })];
}

function habits(_tokens: DesignTokens): ScreenDoc[] {
  void _tokens;
  const home = n('screen', 'home_root', {
    props: { title: 'Home' },
    children: [
      n('row', 'row_home_head', {
        styles: { align: 'center', gap: '12px', justify: 'space-between' },
        children: [
          n('col', 'col_greeting', {
            styles: { width: 'auto', gap: '2px' },
            children: [
              n('heading', 'txt_hello', { props: { text: 'Good morning, Mia', level: 1 } }),
              n('text', 'txt_sub', {
                props: { text: 'Two of three habits done. Keep the streak.' },
              }),
            ],
          }),
          n('avatar', 'img_me', {
            props: { initials: 'M', size: 18 },
            styles: { width: '44px', height: '44px' },
          }),
        ],
      }),
      n('card', 'card_today', {
        children: [
          n('row', 'row_today_head', {
            styles: { justify: 'space-between', align: 'center' },
            children: [
              n('text', 'lbl_today', {
                props: { text: 'Today' },
                styles: { fontWeight: 700, color: 'var(--openui-text-primary)' },
              }),
              n('badge', 'chip_streak', {
                props: { text: '🔥 12 day streak', tone: 'success' },
              }),
            ],
          }),
          n('progress', 'bar_today', { props: { value: 66, label: 'Habits done' } }),
          n('text', 'txt_today', {
            props: { text: 'Evening walk is the last one — 20 minutes, no headphones.' },
          }),
        ],
      }),
      n('list', 'list_habits', { props: { dataKey: 'habits' } }),
      n('row', 'row_actions', {
        styles: { gap: '10px' },
        children: [
          n('button', 'btn_add', {
            props: { text: 'Add habit', variant: 'primary' },
            events: toast('New habit added to today.'),
          }),
          n('button', 'btn_stats', {
            props: { text: 'Stats', variant: 'secondary' },
            styles: { width: 'auto', padding: '0 24px' },
            events: navigate('stats'),
          }),
        ],
      }),
      n('bottomnav', 'nav_home', { props: { items: ['Home', 'Stats', 'Settings'] } }),
    ],
  });

  const stats = n('screen', 'stats_root', {
    props: { title: 'Stats' },
    children: [
      n('heading', 'txt_stats_title', { props: { text: 'Your week', level: 1 } }),
      n('text', 'txt_stats_sub', {
        props: { text: 'Small, consistent, visible. That is the whole trick.' },
      }),
      n('grid', 'grid_stats', {
        props: { columns: 2 },
        styles: { gap: 'var(--gap-item)' },
        children: [
          n('stat', 'stat_done', {
            props: { label: 'Completed', value: '26', delta: '+4 vs last week' },
          }),
          n('stat', 'stat_streak', {
            props: { label: 'Best streak', value: '12 days', delta: 'personal best' },
          }),
        ],
      }),
      n('card', 'card_week', {
        props: { title: 'Habits per day' },
        children: [n('chart', 'chart_week', { props: { kind: 'bar', dataKey: 'week' } })],
      }),
      n('section', 'sec_streaks', {
        props: { title: 'Streaks' },
        children: [n('list', 'list_streaks', { props: { dataKey: 'habits' } })],
      }),
      n('link', 'link_back', { props: { text: 'Back to today', to: 'home' } }),
      n('bottomnav', 'nav_stats', { props: { items: ['Home', 'Stats', 'Settings'] } }),
    ],
  });

  const settings = n('screen', 'settings_root', {
    props: { title: 'Settings' },
    children: [
      n('heading', 'txt_set_title', { props: { text: 'Settings', level: 1 } }),
      n('text', 'txt_set_sub', {
        props: { text: 'The app should be quieter than your day.' },
      }),
      n('card', 'card_prefs', {
        props: { title: 'Reminders' },
        children: [
          n('switch', 'sw_morning', {
            props: { label: 'Morning nudge (08:00)', bindKey: 'morning_nudge' },
          }),
          n('switch', 'sw_evening', {
            props: { label: 'Evening wrap-up (21:30)', bindKey: 'evening_wrap' },
          }),
          n('divider', 'div_prefs'),
          n('select', 'sel_sound', {
            props: { options: ['Chime', 'Soft', 'Silent'], bindKey: 'sound' },
          }),
        ],
      }),
      n('card', 'card_look', {
        props: { title: 'Look' },
        children: [
          n('select', 'sel_theme', {
            props: { options: ['System', 'Light', 'Dark'], bindKey: 'theme' },
          }),
        ],
      }),
      n('button', 'btn_save', {
        props: { text: 'Save changes', variant: 'primary' },
        events: toast('Settings saved.'),
      }),
      n('link', 'link_home', { props: { text: 'Back to today', to: 'home' } }),
      n('bottomnav', 'nav_settings', { props: { items: ['Home', 'Stats', 'Settings'] } }),
    ],
  });

  return [
    screen('home', 'Home', home, {
      entry: true,
      mockData: { habits: HABIT_ROWS, week: WEEK },
    }),
    screen('stats', 'Stats', stats, { mockData: { habits: HABIT_ROWS, week: WEEK } }),
    screen('settings', 'Settings', settings, {}),
  ];
}

function dashboard(_tokens: DesignTokens): ScreenDoc[] {
  void _tokens;
  const root = n('screen', 'dashboard_root', {
    props: { title: 'Dashboard' },
    children: [
      n('row', 'row_dash_head', {
        styles: { justify: 'space-between', align: 'center' },
        children: [
          n('col', 'col_dash_title', {
            styles: { width: 'auto', gap: '2px' },
            children: [
              n('heading', 'txt_dash', { props: { text: 'Overview', level: 1 } }),
              n('text', 'txt_dash_sub', {
                props: { text: 'Tuesday, 28 October · all systems calm.' },
              }),
            ],
          }),
          n('iconbutton', 'btn_bell', { props: { icon: 'bell', variant: 'secondary' } }),
        ],
      }),
      n('grid', 'grid_kpis', {
        props: { columns: 2 },
        styles: { gap: 'var(--gap-item)', responsive: { medium: { columns: 4 } } },
        children: [
          n('stat', 'stat_mrr', {
            props: { label: 'MRR', value: '$48.2k', delta: '+8.4%' },
          }),
          n('stat', 'stat_active', {
            props: { label: 'Active', value: '1,284', delta: '+62' },
          }),
          n('stat', 'stat_churn', {
            props: { label: 'Churn', value: '0.7%', delta: '−0.2%' },
          }),
          n('stat', 'stat_nps', { props: { label: 'NPS', value: '61', delta: '+4' } }),
        ],
      }),
      n('card', 'card_revenue', {
        props: { title: 'Revenue, last 12 weeks' },
        children: [
          n('chart', 'chart_revenue', { props: { kind: 'line', dataKey: 'revenue' } }),
        ],
      }),
      n('grid', 'grid_mid', {
        props: { columns: 2 },
        styles: { gap: 'var(--gap-item)', responsive: { medium: { columns: 2 } } },
        children: [
          n('card', 'card_orders', {
            props: { title: 'Recent orders' },
            children: [
              n('table', 'tbl_orders', {
                props: {
                  columns: ['Customer', 'Plan', 'Amount', 'Status'],
                  dataKey: 'orders',
                },
              }),
            ],
          }),
          n('card', 'card_activity', {
            props: { title: 'Activity' },
            children: [n('list', 'list_activity', { props: { dataKey: 'activity' } })],
          }),
        ],
      }),
      n('row', 'row_actions', {
        styles: { gap: '10px' },
        children: [
          n('button', 'btn_export', {
            props: { text: 'Export report', variant: 'primary' },
            events: toast('Export queued — CSV will land in your inbox.'),
          }),
          n('button', 'btn_invite', {
            props: { text: 'Invite', variant: 'secondary' },
            styles: { width: 'auto', padding: '0 24px' },
            events: toast('Invite link copied.'),
          }),
        ],
      }),
    ],
  });
  return [
    screen('dashboard', 'Dashboard', root, {
      entry: true,
      mockData: {
        revenue: [
          { label: 'W1', value: 24 },
          { label: 'W2', value: 28 },
          { label: 'W3', value: 26 },
          { label: 'W4', value: 33 },
          { label: 'W5', value: 31 },
          { label: 'W6', value: 38 },
          { label: 'W7', value: 36 },
          { label: 'W8', value: 42 },
          { label: 'W9', value: 39 },
          { label: 'W10', value: 45 },
          { label: 'W11', value: 43 },
          { label: 'W12', value: 48 },
        ],
        orders: [
          { customer: 'Ana Vidal', plan: 'Studio', amount: '$49.00', status: 'Paid' },
          { customer: 'Kenji Mori', plan: 'Team', amount: '$129.00', status: 'Paid' },
          { customer: 'Sofia Lund', plan: 'Studio', amount: '$49.00', status: 'Pending' },
          { customer: 'Marcus Bell', plan: 'Free', amount: '$0.00', status: 'Trial' },
          { customer: 'Priya Nair', plan: 'Team', amount: '$129.00', status: 'Paid' },
        ],
        activity: [
          { title: 'Ana Vidal upgraded to Studio', detail: '2 minutes ago', meta: '+$49' },
          { title: 'Weekly report sent', detail: 'Today, 08:00', meta: '18 opens' },
          { title: 'Trial started — Marcus Bell', detail: 'Yesterday', meta: '0/7' },
          { title: 'Invoice #4821 paid', detail: 'Yesterday', meta: '$129' },
        ],
      },
    }),
  ];
}

function shop(tokens: DesignTokens): ScreenDoc[] {
  const product = (
    id: string,
    name: string,
    price: string,
    blurb: string,
    seed: string,
  ): ComponentNode =>
    n('card', `card_${id}`, {
      children: [
        n('image', `img_${id}`, {
          props: {
            src: placeholderImage(tokens, { seed, height: 420, variant: 'card' }),
            alt: name,
          },
          styles: { borderRadius: 'var(--radius-tag)' },
        }),
        n('heading', `txt_${id}`, { props: { text: name, level: 3 } }),
        n('text', `desc_${id}`, { props: { text: blurb } }),
        n('row', `row_${id}`, {
          styles: { justify: 'space-between', align: 'center' },
          children: [
            n('badge', `price_${id}`, { props: { text: price, tone: 'neutral' } }),
            n('button', `btn_${id}`, {
              props: { text: 'Add', variant: 'secondary' },
              styles: { width: 'auto', padding: '0 18px' },
              events: toast(`${name} added to the basket.`),
            }),
          ],
        }),
      ],
    });

  const root = n('screen', 'store_root', {
    props: { title: 'Shop' },
    styles: { padding: '0', gap: '0' },
    children: [
      n('navbar', 'nav_store', {
        props: { brand: 'Fern & Fig', items: ['Shop', 'Story', 'Basket'] },
      }),
      n('col', 'col_store', {
        styles: { padding: 'var(--pad-screen)', gap: 'var(--gap-section)' },
        children: [
          n('hero', 'hero_store', {
            props: {
              title: 'Plants that forgive a busy week',
              subtitle:
                'Small-batch greenery, delivered with a care card in plain language.',
            },
            children: [
              n('button', 'btn_shop', {
                props: { text: 'Shop the collection', variant: 'primary' },
                styles: {
                  width: 'auto',
                  background: 'var(--openui-fg)',
                  color: 'var(--openui-text-brand)',
                },
                events: toast('18 plants in stock this week.'),
              }),
            ],
          }),
          n('section', 'sec_shop', {
            props: { title: 'This week’s shelf' },
            children: [
              n('grid', 'grid_shop', {
                props: { columns: 2 },
                styles: {
                  gap: 'var(--gap-item)',
                  responsive: { medium: { columns: 4 }, expanded: { columns: 4 } },
                },
                children: [
                  product(
                    'pothos',
                    'Golden Pothos',
                    '$24',
                    'Trails beautifully, forgives low light.',
                    'pothos',
                  ),
                  product(
                    'fig',
                    'Rubber Fig',
                    '$38',
                    'Big leaves, steady growth, bright room.',
                    'fig',
                  ),
                  product(
                    'snake',
                    'Snake Plant',
                    '$29',
                    'Water it monthly. Genuinely.',
                    'snake',
                  ),
                  product(
                    'fern',
                    'Button Fern',
                    '$22',
                    'Loves a steamy bathroom shelf.',
                    'fern',
                  ),
                ],
              }),
            ],
          }),
          n('card', 'card_promise', {
            children: [
              n('heading', 'txt_promise', {
                props: { text: 'If it wilts, we replace it', level: 2 },
              }),
              n('text', 'txt_promise_body', {
                props: {
                  text: 'Send a photo within 30 days and a new plant leaves the greenhouse the same week. No forms, no interrogation.',
                },
              }),
            ],
          }),
          n('row', 'row_store_footer', {
            styles: { justify: 'space-between', align: 'center' },
            children: [
              n('text', 'txt_store_copy', {
                props: { text: '© 2026 Fern & Fig · Amsterdam' },
              }),
              n('link', 'link_store', { props: { text: 'Back to shop', to: 'store' } }),
            ],
          }),
        ],
      }),
    ],
  });
  return [screen('store', 'Shop', root, { entry: true })];
}

function blueprintHeader(rules: string[]): string {
  return [
    'RULES: ids are lower_snake_case with semantic prefixes (btn_, txt_, card_, row_, col_, input_), ONE shared state namespace, no invented hexes.',
    ...rules,
    '',
  ].join('\n');
}

export const TEMPLATES: DemoTemplate[] = [
  {
    id: 'landing',
    label: 'Landing page',
    kind: 'web',
    projectName: 'Lumen — landing',
    screens: landing,
    blueprint: (tokens) => `${blueprintHeader([
      'Screens: landing only. Desktop-first widths, still compact-first CSS.',
    ])}
SCREEN: Landing
- nav_top (navbar) Lumen — Home, Features, Pricing, menu
- col_page (col) page container
  - hero_main (hero) Ship the idea, not the setup — One calm place to plan the week.
    - row_hero_actions (row)
      - btn_start (button) Start free
      - btn_tour (button) See it run
  - sec_features (section) Everything the first version needs
    - grid_feats (grid) 3 cards, 2 up compact, 3 up ≥600px
      - card_focus (card) Focus by default
      - card_share (card) Share a link
      - card_shipped (card) Ship weekly
  - grid_stats (grid) 3 stats
    - stat_teams (stat) 2,184 teams
    - stat_hours (stat) 6.4 hours saved
    - stat_churn (stat) 0.9% weekly churn
  - sec_steps (section) How it works
    - row_step1 (row) 01 pick three habits
    - row_step2 (row) 02 tap once a day
    - row_step3 (row) 03 Sunday review
  - card_cta (card) Start the week with a plan
    - btn_cta (button) Start building
  - row_footer (row) copyright + back to top
${LOOK_LINE(tokens)}
STATE: email, submitted
WIRING: btn_start → toast; btn_cta → email form submit; nav links stay on landing.`,
  },
  {
    id: 'habits',
    label: 'Habit tracker',
    kind: 'app',
    projectName: 'Mia — habit tracker',
    screens: habits,
    blueprint: (tokens) => `${blueprintHeader([
      'Screens: home (entry), stats, settings. Thumb-reach; bottom nav on every screen.',
    ])}
SCREEN: Home
- row_home_head (row) greeting + avatar
  - txt_hello (heading) Good morning, Mia
  - img_me (avatar) M
- card_today (card) Today card
  - bar_today (progress) 66% done
  - txt_today (text) Evening walk is the last one
- list_habits (list) dataKey habits — six realistic rows
- row_actions (row)
  - btn_add (button) Add habit
  - btn_stats (button) Stats opens Stats
- nav_home (bottomnav) Home, Stats, Settings
${LOOK_LINE(tokens)}
STATE: morning_nudge, evening_wrap, sound, theme
WIRING: bottomnav → each screen; btn_stats → Stats; btn_add → toast.

SCREEN: Stats
- txt_stats_title (heading) Your week
- grid_stats (grid) 2 stat cards
- card_week (card) chart of habits per day
- sec_streaks (section) streaks list
- link_back (link) Back to today opens Home
${LOOK_LINE(tokens)}
STATE: none new
WIRING: link_back → Home.

SCREEN: Settings
- sw_morning (switch) morning nudge
- sw_evening (switch) evening wrap-up
- sel_sound (select) notification sound
- sel_theme (select) System / Light / Dark
- btn_save (button) Save changes → toast
- link_home (link) Back to today opens Home
${LOOK_LINE(tokens)}
STATE: morning_nudge, evening_wrap, sound, theme
WIRING: btn_save → toast; link_home → Home.`,
  },
  {
    id: 'dashboard',
    label: 'Analytics dashboard',
    kind: 'web',
    projectName: 'Northwind — dashboard',
    screens: dashboard,
    blueprint: (tokens) => `${blueprintHeader([
      'One dashboard screen, responsive: 2 KPI columns compact, 4 at ≥600px.',
    ])}
SCREEN: Dashboard
- row_dash_head (row) title + bell
  - txt_dash (heading) Overview
- grid_kpis (grid) 4 KPIs
  - stat_mrr (stat) MRR $48.2k
  - stat_active (stat) 1,284 active
  - stat_churn (stat) 0.7% churn
  - stat_nps (stat) NPS 61
- card_revenue (card) revenue line chart, 12 weeks
- grid_mid (grid) orders table + activity list
- row_actions (row) export + invite
${LOOK_LINE(tokens)}
STATE: none
WIRING: export → toast; invite → toast.`,
  },
  {
    id: 'shop',
    label: 'Storefront',
    kind: 'web',
    projectName: 'Fern & Fig — storefront',
    screens: shop,
    blueprint: (tokens) => `${blueprintHeader([
      'One storefront screen. Product grid 2 up compact, 4 up ≥600px.',
    ])}
SCREEN: Shop
- nav_store (navbar) Fern & Fig — Shop, Story, Basket
- col_store (col) page
  - hero_store (hero) Plants that forgive a busy week
    - btn_shop (button) Shop the collection
  - sec_shop (section) This week's shelf
    - grid_shop (grid) 4 product cards
      - card_pothos (card) Golden Pothos $24
      - card_fig (card) Rubber Fig $38
      - card_snake (card) Snake Plant $29
      - card_fern (card) Button Fern $22
  - card_promise (card) If it wilts, we replace it
  - row_store_footer (row) copyright + back to shop
${LOOK_LINE(tokens)}
STATE: basket_count
WIRING: Add buttons → toast + basket_count; nav stays on shop.`,
  },
];

export function pickTemplate(text: string): DemoTemplate {
  const t = text.toLowerCase();
  if (/habit|routine|streak|daily|tracker/.test(t)) return TEMPLATES[1];
  if (/shop|store|product|coffee|cafe|bakery|boutique|ecommerce/.test(t))
    return TEMPLATES[3];
  if (/dashboard|analytic|admin|metrics|kpi|saas|revenue/.test(t)) return TEMPLATES[2];
  return TEMPLATES[0];
}

export function buildScreensFor(template: DemoTemplate, tokens: DesignTokens): ScreenDoc[] {
  return template.screens(tokens);
}
