import JSZip from 'jszip';
import type { ProjectDoc } from '../types/tree';
import { generateProjectFiles } from './reactCodegen';
import { manifestFor, serviceWorkerTemplate } from './pwa';

export async function buildExportFiles(doc: ProjectDoc): Promise<Record<string, string>> {
  const files = generateProjectFiles(doc);
  files['manifest.webmanifest'] = manifestFor(doc);
  files['sw.js'] = serviceWorkerTemplate();
  return files;
}

function safeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'museware-project'
  );
}

export async function downloadZip(doc: ProjectDoc): Promise<void> {
  const files = await buildExportFiles(doc);
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(doc.name)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function downloadTextFile(name: string, content: string, type = 'text/plain'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadFilesAsText(files: Record<string, string>): void {
  const bundle = Object.entries(files)
    .map(([path, content]) => `/* ===== ${path} ===== */\n\n${content}`)
    .join('\n\n');
  downloadTextFile('museware-export.txt', bundle, 'text/plain');
}
