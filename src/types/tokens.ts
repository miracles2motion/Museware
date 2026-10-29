/**
 * The openui-1.0 token format — imported as-is, saved without stripping
 * anything the engine does not model. Foundations ride along.
 */

export interface OpenUiRadii {
  card?: number;
  button?: number;
  input?: number;
  chip?: number;
  tag?: number;
  callout?: number;
  [k: string]: number | undefined;
}

export interface OpenUiMetrics {
  screen_pad?: number;
  section_gap?: number;
  card_pad?: number;
  button_height?: number;
  input_height?: number;
  chip_height?: number;
  row_height?: number;
  [k: string]: number | undefined;
}

export type ColorMap = Record<string, string>;

export interface OpenUiTheme {
  brand_color: string;
  secondary_color: string;
  neutral_scale?: string;
  corner_profile?: string;
  density?: string;
  theme_mode?: string;
  radii_dp?: OpenUiRadii;
  metrics_dp?: OpenUiMetrics;
  light_colors: ColorMap;
  dark_colors: ColorMap;
  font_heading?: string;
  font_body?: string;
  foundations?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ThemeComponentToken {
  key: string;
  label?: string;
  kind?: string;
  props?: Record<string, string | number>;
  [k: string]: unknown;
}

export interface DesignTokens {
  title: string;
  specVersion: string;
  openuiTheme: OpenUiTheme;
  tokens: ThemeComponentToken[];
  /** Unknown top-level sections (motion, materials, …) survive round-trips. */
  [k: string]: unknown;
}

/** The 30 openui colour keys, in canonical order. */
export const COLOR_KEYS = [
  'openui_bg',
  'openui_fg',
  'openui_sunk',
  'openui_elevated',
  'openui_highlight',
  'openui_accent',
  'openui_accent_pressed',
  'openui_accent_subtle',
  'openui_text_on_accent',
  'openui_secondary',
  'openui_text_on_secondary',
  'openui_text_primary',
  'openui_text_secondary',
  'openui_text_tertiary',
  'openui_text_brand',
  'openui_border_default',
  'openui_border_interactive',
  'openui_border_accent',
  'openui_info_bg',
  'openui_info_text',
  'openui_info_border',
  'openui_success_bg',
  'openui_success_text',
  'openui_success_border',
  'openui_alert_bg',
  'openui_alert_text',
  'openui_alert_border',
  'openui_danger_bg',
  'openui_danger_text',
  'openui_danger_border',
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

export const CORE_COMPONENT_TOKENS = [
  'screen',
  'card',
  'sunk_card',
  'primary_button',
  'secondary_button',
  'input',
  'chip',
  'list_row',
  'title',
  'body',
  'nav_bar',
  'tab_bar',
  'fab',
  'dialog',
] as const;
