import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { useProject } from '../../store/useProject';
import { useUi } from '../../store/useUi';
import { downloadZip, downloadTextFile } from '../../export/zip';
import { installInstructions, manifestFor, serviceWorkerTemplate } from '../../export/pwa';

const CORE_FILES = [
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'index.html',
  'src/main.tsx',
  'src/App.tsx',
  'src/runtime.tsx',
  'src/types.ts',
  'src/screens.ts',
  'src/tokens.ts',
  'src/styles.css',
];

export function ExportModal({ onClose }: { onClose: () => void }) {
  const doc = useProject((s) => s.doc);
  const toast = useUi((s) => s.toast);
  const [copied, setCopied] = useState<string | null>(null);
  const install = useMemo(() => installInstructions(doc), [doc]);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast('Clipboard is blocked in this browser.', 'warn');
    }
  };

  return (
    <Modal
      title="Export the app"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              toast('Zipping the project…');
              await downloadZip(doc);
              toast('Downloaded — npm install && npm run dev', 'ok');
            }}
          >
            <Download size={13} /> Download .zip
          </Button>
        </>
      }
    >
      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">What ships</span>
          <span className="faint mono" style={{ fontSize: 10 }}>
            React 18 + Vite
          </span>
        </div>
        <p className="field-hint">
          The export is the same tree, the same token sheet and the same generated CSS the
          canvas renders — no second styling system, no runtime dependency on Museware.
        </p>
        <div className="palette-grid" style={{ marginTop: 8 }}>
          {CORE_FILES.map((file) => (
            <span
              className="chip chip-static mono"
              key={file}
              style={{ fontSize: 10, justifyContent: 'flex-start' }}
            >
              <FileCode2 size={11} /> {file}
            </span>
          ))}
        </div>
        <p className="field-hint">
          Plus <span className="mono">public/manifest.webmanifest</span>,{' '}
          <span className="mono">public/sw.js</span>, icons and a README with the install
          steps. The bundle contains no API key — it is a static app.
        </p>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">PWA pieces</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadTextFile('manifest.webmanifest', manifestFor(doc), 'application/json')
            }
          >
            <Download size={12} /> manifest
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadTextFile('sw.js', serviceWorkerTemplate(), 'text/javascript')
            }
          >
            <Download size={12} /> service worker
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copy('manifest', manifestFor(doc))}
          >
            {copied === 'manifest' ? <Check size={12} /> : <Copy size={12} />} copy manifest
          </Button>
        </div>
        <pre className="blueprint-text" style={{ maxHeight: 160 }}>
          {install}
        </pre>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">Run it</span>
        </div>
        <pre className="blueprint-text">
          {`npm install
npm run dev     # Vite prints the local URL
npm run build   # static files in dist/`}
        </pre>
        <p className="field-hint">
          {doc.screens.length} screen{doc.screens.length === 1 ? '' : 's'} ·{' '}
          {doc.screens.length} routes · tokens {doc.tokens.title}
        </p>
      </div>
    </Modal>
  );
}
