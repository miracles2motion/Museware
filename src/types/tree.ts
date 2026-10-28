/** The whole editor is one JSON tree. These types are that tree. */

export type NodeId = string;

export const CONTAINER_TYPES = [
  'screen',
  'row',
  'col',
  'grid',
  'card',
  'hero',
  'tabs',
  'section',
  'form',
] as const;

export const LEAF_TYPES = [
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
] as const;

export type ContainerType = (typeof CONTAINER_TYPES)[number];
export type LeafType = (typeof LEAF_TYPES)[number];
export type ComponentType = ContainerType | LeafType;

export type Align = 'start' | 'center' | 'end' | 'stretch';

export type StyleValue = string | number;

export interface StyleSet {
  padding?: StyleValue;
  margin?: StyleValue;
  gap?: StyleValue;
  background?: StyleValue;
  color?: StyleValue;
  border?: StyleValue;
  fontSize?: StyleValue;
  fontWeight?: StyleValue;
  fontFamily?: StyleValue;
  lineHeight?: StyleValue;
  letterSpacing?: StyleValue;
  borderRadius?: StyleValue;
  boxShadow?: StyleValue;
  width?: StyleValue;
  height?: StyleValue;
  minWidth?: StyleValue;
  maxWidth?: StyleValue;
  align?: Align;
  justify?: Align;
  columns?: number;
  opacity?: StyleValue;
  textAlign?: string;
  responsive?: ResponsiveStyles;
  [k: string]: unknown;
}

export interface ResponsiveStyles {
  medium?: StyleSet;
  expanded?: StyleSet;
}

export type Action =
  | { type: 'navigate'; to: string }
  | { type: 'setState'; key: string; value: unknown }
  | { type: 'toggle'; key: string }
  | { type: 'toast'; text: string }
  | { type: 'openUrl'; url: string }
  | { type: 'when'; key: string; equals?: unknown; then: Action[] };

export type EventName = 'tap' | 'change' | 'submit';

export type Events = Partial<Record<EventName, Action[]>>;

export interface ComponentNode {
  id: NodeId;
  /** Human layer name (rename op). Falls back to the type label. */
  name?: string;
  type: ComponentType;
  props: Record<string, unknown>;
  styles: StyleSet;
  children: ComponentNode[];
  events?: Events;
  visibleWhen?: { key: string; equals?: string | number | boolean };
}

export interface MockRow {
  [k: string]: string | number | boolean;
}

export interface ScreenDoc {
  id: string;
  name: string;
  root: ComponentNode;
  entry?: boolean;
  mockData?: Record<string, MockRow[]>;
}

export interface DesignTokensSection {
  [k: string]: unknown;
}

export interface CustomComponent {
  name: string;
  description: string;
  root: ComponentNode;
  preview?: string;
}

export interface RailCardData {
  [k: string]: unknown;
}

export interface RailEntry {
  id: string;
  at: number;
  role: 'user' | 'agent' | 'system' | 'card';
  text: string;
  card?: {
    kind: 'build_choice' | 'blueprint' | 'choice' | 'color' | 'progress' | 'error' | 'key';
    state: 'pending' | 'answered' | 'cancelled' | 'expired';
    data: RailCardData;
  };
}

export type Op =
  | { op: 'add'; parentId: NodeId; index?: number; node: ComponentNode }
  | { op: 'remove'; id: NodeId }
  | { op: 'move'; id: NodeId; parentId: NodeId; index?: number }
  | { op: 'setProps'; id: NodeId; props: Record<string, unknown> }
  | { op: 'setStyles'; id: NodeId; styles: StyleSet }
  | { op: 'setText'; id: NodeId; text: string }
  | { op: 'rename'; id: NodeId; name: string }
  | { op: 'addScreen'; screen: ScreenDoc }
  | { op: 'removeScreen'; id: string }
  | { op: 'renameScreen'; id: string; name: string }
  | { op: 'setEntry'; id: string }
  | { op: 'setTokens'; patch: Partial<ProjectDoc['tokens']> }
  | { op: 'saveComponent'; name: string; description: string; root: ComponentNode }
  | { op: 'placeComponent'; name: string; parentId: NodeId; index?: number };

export interface OpEntry {
  at: number;
  source: 'agent' | 'user';
  batch: Op[];
  summary: string;
}

export interface ProjectDoc {
  format: 'museware/1';
  name: string;
  screens: ScreenDoc[];
  tokens: import('./tokens').DesignTokens;
  opLog: OpEntry[];
  rail: RailEntry[];
  kind: 'web' | 'app';
  customComponents: CustomComponent[];
  blueprint?: { text: string; decided: boolean; updatedAt: number };
  /** Set when any model call used the contributor tier (§6.1 legal guard). */
  builtWithContributor?: boolean;
  updatedAt: number;
}

export const ERROR_CODES = [
  'E_BAD_OP',
  'E_NO_PARENT',
  'E_NOT_CONTAINER',
  'E_NAME_TAKEN',
  'E_SCREEN_MISSING',
  'E_TOKEN_UNKNOWN',
  'E_DEPTH',
  'E_COUNT',
  'E_BAD_ARGS',
  'E_BUILD_CARD',
  'E_RATE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface OpError {
  code: ErrorCode;
  message: string;
  opIndex?: number;
  guidance?: string;
}
