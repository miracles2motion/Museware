import type { Action, ComponentNode, ScreenDoc } from '../types/tree';
import { useUi } from '../store/useUi';
import { useRunState } from '../store/useRunState';

function bindings(screen: ScreenDoc): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const visit = (node: ComponentNode) => {
    const keys = new Set<string>();
    if (node.props.bindKey) keys.add(String(node.props.bindKey));
    if (node.visibleWhen?.key) keys.add(node.visibleWhen.key);
    const action = (item: Action) => {
      if (item.type === 'setState' || item.type === 'toggle' || item.type === 'when')
        keys.add(item.key);
      if (item.type === 'when') item.then.forEach(action);
    };
    Object.values(node.events || {}).forEach((items) => items?.forEach(action));
    keys.forEach((key) => result.set(key, [...(result.get(key) || []), node.id]));
    node.children.forEach(visit);
  };
  visit(screen.root);
  return result;
}

export function Bindings({
  screen,
  running = false,
}: {
  screen: ScreenDoc;
  running?: boolean;
}) {
  const values = useRunState((s) => s.values);
  const entries = bindings(screen);
  return (
    <div className="insp-section bindings-section">
      <div className="insp-section-head">
        <span className="eyebrow">Bindings on this screen</span>
        <span className="faint mw-shell-util-12">{entries.size}</span>
      </div>
      {!entries.size ? (
        <p className="field-hint">
          No state yet. Add a <span className="mono">bindKey</span> to an input to make the
          screen stateful.
        </p>
      ) : (
        <div className="mw-shell-util-13">
          {[...entries].map(([key, nodes]) => (
            <button
              type="button"
              className="chip mono"
              key={key}
              onClick={() => {
                useUi.getState().setActiveScreen(screen.id);
                useUi.getState().select(nodes[0]);
                if (running) useUi.getState().setRunMode(false);
              }}
            >
              {key} ·{' '}
              {running
                ? values[key] === undefined
                  ? '—'
                  : typeof values[key] === 'string'
                    ? values[key]
                    : JSON.stringify(values[key])
                : `used by ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
