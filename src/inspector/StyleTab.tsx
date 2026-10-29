import type { DesignTokens } from '../types/tokens';
import type { ComponentNode } from '../types/tree';
import {
  isContainerType,
  isTextType,
  spec,
} from '../types/library';
import {
  styleSectionsFor,
  type StyleFieldDef,
  type StyleGroup,
} from '../types/styleDict';
import { Segmented } from '../components/ui';
import {
  ColorField,
  NumberField,
  SelectField,
  SpacingField,
  TextField,
  ToggleField,
} from './Fields';

/**
 * The Style tab, rendered from the dictionary.
 *
 * The old tab was one flat list of fourteen fields shown to every widget: a
 * Divider offered Gap, a Heading offered "Align" twice with two different
 * meanings, and width accepted 'match' in the CSS engine while the field only
 * ever took a raw string. Here the fields are the ones that mean something for
 * the selected node, they are grouped, they are named after what they do, and
 * every one of them says what it does.
 */

export type StyleWriters = {
  valueOf: (key: string) => string;
  writeStyle: (key: string, value: string | number | boolean) => void;
  clearStyle: (key: string) => void;
  isOverridden: (key: string) => boolean;
};

interface Props extends StyleWriters {
  node: ComponentNode;
  tokens: DesignTokens;
  isRoot: boolean;
  /** 'compact' is the base; wider widths can override the grid's columns. */
  breakpoint: 'compact' | 'medium' | 'expanded';
}

/** 'match' / '100%' are the same idea; so are 'hug' / 'fit-content'. */
export function sizeMode(value: string): 'match' | 'hug' | 'fixed' {
  if (value === 'match' || value === '100%') return 'match';
  if (value === 'hug' || value === 'fit-content') return 'hug';
  if (value) return 'fixed';
  return 'match';
}

function SizeField({
  field,
  value,
  onCommit,
}: {
  field: StyleFieldDef;
  value: string;
  onCommit: (v: string) => void;
}) {
  const mode = sizeMode(value);
  const axis = field.key === 'height' ? '120px' : '320px';
  return (
    <div className="field">
      <span className="field-label">{field.label}</span>
      <Segmented<'match' | 'hug' | 'fixed'>
        label={`${field.label} mode`}
        value={mode}
        onChange={(next) => {
          if (next === 'match') onCommit('match');
          else if (next === 'hug') onCommit('hug');
          else onCommit(mode === 'fixed' ? value : axis);
        }}
        options={[
          { value: 'match', label: 'Match', title: 'Match — fill the parent' },
          { value: 'hug', label: 'Hug', title: 'Hug — fit the content' },
          { value: 'fixed', label: 'Fixed', title: 'Fixed — an exact length' },
        ]}
      />
      {mode === 'fixed' && (
        <TextField
          label={`${field.label} length`}
          value={value}
          placeholder={axis}
          hint="Any CSS length: 320px, 12rem, 50%."
          onCommit={(next) => onCommit(next.trim() || 'match')}
        />
      )}
      <span className="field-hint">{field.hint}</span>
    </div>
  );
}

function Field({
  field,
  tokens,
  writers,
}: {
  field: StyleFieldDef;
  tokens: DesignTokens;
  writers: StyleWriters;
}) {
  const value = writers.valueOf(field.key);
  const overridden = writers.isOverridden(field.key);
  const write = (next: string) => writers.writeStyle(field.key, next);

  if (field.kind === 'size') {
    return <SizeField field={field} value={value} onCommit={write} />;
  }

  if (field.kind === 'color') {
    return (
      <ColorField
        label={field.label}
        value={value}
        tokens={tokens}
        allowTransparent={field.key === 'background'}
        overridden={overridden}
        onClearOverride={overridden ? () => writers.clearStyle(field.key) : undefined}
        onCommit={write}
      />
    );
  }

  if (field.kind === 'choice') {
    const options = field.options || [];
    const current = value || options[0]?.value || '';
    const withCustom = options.some((o) => o.value === value)
      ? options
      : [{ value: current, label: `${current || 'unset'} (custom)` }, ...options];
    return (
      <div className="field">
        <SelectField
          label={field.label}
          value={current}
          options={withCustom}
          onChange={write}
        />
        <span className="field-hint">{field.hint}</span>
      </div>
    );
  }

  if (field.kind === 'toggle') {
    const on = field.key === 'grow' ? Number(value) > 0 : value === 'true';
    return (
      <div className="field">
        <ToggleField
          label={field.label}
          checked={on}
          onChange={() => {
            // Always write an explicit value: clearing the key would fall back
            // to the base (a Row wraps by default, so “off” must say nowrap).
            if (field.key === 'grow') writers.writeStyle(field.key, on ? 0 : 1);
            else writers.writeStyle(field.key, !on);
          }}
        />
        <span className="field-hint">{field.hint}</span>
      </div>
    );
  }

  if (field.kind === 'number') {
    return (
      <NumberField
        label={field.label}
        value={Number(value) || 0}
        onCommit={(n) => write(String(n))}
      />
    );
  }

  return (
    <div className="field">
      <SpacingField
        label={field.label}
        value={value}
        suggestions={field.suggestions || []}
        overridden={overridden}
        onCommit={write}
      />
      <span className="field-hint">{field.hint}</span>
    </div>
  );
}

/**
 * A grid's column count is content on the base width (it lives in Props) and an
 * override above it — so this field appears only when you are editing one of
 * the wider breakpoints, where it means exactly that.
 */
function ColumnsField({ node, writers }: { node: ComponentNode; writers: StyleWriters }) {
  const value = Number(writers.valueOf('columns') || node.props.columns || 2);
  return (
    <div className="field">
      <NumberField
        label="Columns at this width"
        value={value}
        min={2}
        max={6}
        onCommit={(n) => writers.writeStyle('columns', String(n))}
      />
      <span className="field-hint">
        Overrides the grid’s column count on wider screens only.
      </span>
    </div>
  );
}

export function StyleTab({ node, tokens, isRoot, breakpoint, ...writers }: Props) {
  const sections = styleSectionsFor({
    container: isContainerType(node.type),
    isRoot,
    textish: isTextType(node.type),
  });
  const isGrid = node.type === 'grid';

  return (
    <>
      {sections.map((section) => (
        <div className="insp-section" key={section.group}>
          <div className="insp-section-head">
            <span className="eyebrow">{sectionHeading(section.group, node)}</span>
          </div>
          {section.group === 'Layout' && isGrid && breakpoint !== 'compact' && (
            <ColumnsField node={node} writers={writers} />
          )}
          {section.fields.map((field) => (
            <Field key={field.key} field={field} tokens={tokens} writers={writers} />
          ))}
        </div>
      ))}
      <p className="field-hint">
        Tokens first — the swatches are the theme, so one edit restyles everything that uses
        it. {isRoot ? 'This is the screen itself.' : spec(node.type)?.hint}
      </p>
    </>
  );
}

function sectionHeading(group: StyleGroup, node: ComponentNode): string {
  if (group === 'Layout') {
    return isContainerType(node.type) ? 'Layout · children' : 'Layout · in parent';
  }
  if (group === 'Size') return 'Size · match, hug or fixed';
  return group;
}
