import { draftManifest, shouldReadPath, signalsFromFiles, type ManifestInput, type ProjectFile } from '@app-lens/core';
import { useId, useState, type FormEvent } from 'react';
import { parse as parseYaml } from 'yaml';
import { useDialog } from './useDialog';

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

interface AttachDialogProps {
  onClose: () => void;
  onDraft: (label: string, manifest: ManifestInput) => void;
}

type Tab = 'folder' | 'github' | 'url';
const TABS: { id: Tab; label: string }[] = [
  { id: 'folder', label: 'Folder' },
  { id: 'github', label: 'GitHub link' },
  { id: 'url', label: 'Website URL' },
];

export async function readSelectedFiles(list: FileList | File[]): Promise<ProjectFile[]> {
  const files: ProjectFile[] = [];
  let total = 0;
  for (const file of Array.from(list)) {
    // Selected paths start with the folder's own name.
    const path = (file.webkitRelativePath || file.name).split('/').slice(1).join('/') || file.name;
    if (files.length >= MAX_FILES || file.size > MAX_FILE_BYTES || total + file.size > MAX_TOTAL_BYTES || !shouldReadPath(path)) continue;
    total += file.size;
    files.push({ path, text: await file.text() });
  }
  return files;
}

export default function AttachDialog({ onClose, onDraft }: AttachDialogProps) {
  const [tab, setTab] = useState<Tab>('folder');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const dialog = useDialog<HTMLDivElement>(onClose);

  const onFolder = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const name = list[0]?.webkitRelativePath.split('/')[0] || 'Project';
      const files = await readSelectedFiles(list);
      const { manifest } = draftManifest(signalsFromFiles(files, { parseYaml: (text) => parseYaml(text, { maxAliasCount: 100 }) }), { fallbackName: name });
      onDraft(name, manifest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/__app-lens/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: value.trim() }),
      });
      // Static hosts answer 404 or 405, and error pages are not always JSON.
      if (response.status === 404 || response.status === 405) {
        throw new Error(`This needs a server. Run: app-lens attach ${value.trim()}`);
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string; manifest?: ManifestInput };
      if (!response.ok || !body.manifest) throw new Error(body.error ?? `HTTP ${response.status}`);
      onDraft(value.trim(), body.manifest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  return (
    <div className="al-root al-dialog-root" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} className="al-card al-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>Attach project</h2>
        <p className="al-muted">AppLens drafts a manifest from what it finds. Check the draft before you use it. No project code is run.</p>
        <div className="al-segmented" role="group" aria-label="Project source">
          {TABS.map((item) => (
            <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => { setTab(item.id); setError(null); }}>{item.label}</button>
          ))}
        </div>
        {tab === 'folder' ? (
          <label className="al-stack">
            <span>Choose a folder. Files stay in this browser. Secrets and dependencies are skipped.</span>
            <input
              type="file"
              disabled={busy}
              onChange={(event) => void onFolder(event.target.files)}
              ref={(node) => node?.setAttribute('webkitdirectory', '')}
            />
          </label>
        ) : (
          <form className="al-stack" onSubmit={(event) => void onSubmit(event)}>
            <label className="al-stack">
              <span>{tab === 'github' ? 'Repository link' : 'Website address'}</span>
              <input
                className="al-input"
                required
                value={value}
                placeholder={tab === 'github' ? 'https://github.com/owner/repo' : 'www.example.com'}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            <button type="submit" className="al-btn al-btn-primary" disabled={busy}>{busy ? 'Working…' : 'Draft manifest'}</button>
          </form>
        )}
        {error ? <div className="al-alert al-alert-error" role="alert">{error}</div> : null}
        <button type="button" className="al-btn al-btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
