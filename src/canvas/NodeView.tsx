import { useMemo } from 'react';
import type { ProjectDoc, ScreenDoc } from '../types/tree';
import { NodeBody } from './NodeBody';
import { generateFullCss } from './cssGen';
import { materializeCss } from '../design/materialize';
import { useResolvedCanvasTheme } from '../design/theme';
import { RuntimeContext, type RuntimeApi } from '../preview/runtime';

export function CanvasStyle({ doc, scope }: { doc: ProjectDoc; scope?: string }) {
  const css = useMemo(
    () => `${materializeCss(doc.tokens, scope)}\n${generateFullCss(doc)}`,
    [doc, scope],
  );
  return <style data-museware-css>{css}</style>;
}

export function NodeView({
  doc,
  screen,
  mode = 'edit',
  runtime,
}: {
  doc: ProjectDoc;
  screen: ScreenDoc;
  mode?: 'edit' | 'run';
  runtime?: RuntimeApi | null;
}) {
  const theme = useResolvedCanvasTheme();
  return (
    <div className="mw-app" data-theme={theme} data-screen-id={screen.id}>
      {mode === 'run' && runtime ? (
        <RuntimeContext.Provider value={runtime}>
          <NodeBody node={screen.root} doc={doc} mode="run" screenId={screen.id} />
        </RuntimeContext.Provider>
      ) : (
        <NodeBody node={screen.root} doc={doc} mode="edit" screenId={screen.id} />
      )}
    </div>
  );
}
