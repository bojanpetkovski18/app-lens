import { diffManifests, parseManifest, starterManifest, type Manifest, type ManifestInput } from '@app-lens/core';
import { AppLensView, IssuesView, useDialog } from '@app-lens/ui';
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { analyze, createEditor, editorReducer, locatePath, serialize } from './editor';
import { FormEditor } from './FormEditor';

const AttachDialog = lazy(() => import('@app-lens/ui/attach'));

const STORAGE_KEY = 'app-lens-studio';
const PREVIEW_DELAY_MS = 250;

function loadDraft(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? serialize(starterManifest('My App'));
  } catch {
    return serialize(starterManifest('My App'));
  }
}

function storeDraft(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Autosave is a convenience, and storage can be unavailable.
  }
}

async function post(path: string, body: unknown, method = 'POST'): Promise<Record<string, unknown>> {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (response.status === 404 || response.status === 405) throw new Error('This needs the local server. Run: app-lens studio');
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(result.error ?? `HTTP ${response.status}`));
  return result;
}

function AiDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="al-root al-dialog-root">
      <div ref={dialog} className="al-card al-dialog" role="dialog" aria-modal="true" aria-label="Draft with AI" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

interface Proposal {
  text: string;
  changes: ReturnType<typeof diffManifests>;
}

export function App() {
  const [editor, dispatch] = useReducer(editorReducer, undefined, () => createEditor(loadDraft()));
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [dialog, setDialog] = useState<'attach' | 'ai' | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState('');
  const [aiKind, setAiKind] = useState<'readme' | 'openapi'>('readme');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLInputElement>(null);

  const { text } = editor;
  const analysis = useMemo(() => analyze(text), [text]);

  // The preview keeps the last valid manifest, so it does not disappear in the middle of an edit.
  const [preview, setPreview] = useState<Manifest | null>(analysis.manifest);
  useEffect(() => {
    const timer = setTimeout(() => {
      storeDraft(text);
      if (analysis.manifest) setPreview(analysis.manifest);
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, analysis.manifest]);

  useEffect(() => {
    let active = true;
    fetch('/__app-lens/manifest')
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { file: string | null; text: string | null } | null) => {
        if (!active || !result?.file) return;
        setFile(result.file);
        if (result.text) dispatch({ type: 'load', text: result.text });
      })
      .catch(() => {
        // Without the local server, Studio works from browser storage.
      });
    return () => { active = false; };
  }, []);

  const update = useCallback((change: (draft: ManifestInput) => void) => {
    const draft = structuredClone(analysis.value) as ManifestInput;
    change(draft);
    dispatch({ type: 'edit', text: serialize(draft) });
  }, [analysis.value]);

  const replace = (next: string) => {
    dispatch({ type: 'replace', text: next });
    setProposal(null);
  };

  const propose = (manifest: ManifestInput) => {
    const next = parseManifest(manifest);
    if (!next.ok) throw new Error('The draft did not validate.');
    setProposal({ text: serialize(manifest), changes: preview ? diffManifests(preview, next.manifest) : [] });
    setDialog(null);
  };

  const jumpTo = (path: string) => {
    setMode('json');
    requestAnimationFrame(() => {
      const element = textarea.current;
      if (!element) return;
      const position = locatePath(text, path);
      element.focus();
      element.setSelectionRange(position, position);
      element.scrollTop = (text.slice(0, position).split('\n').length - 3) * 18;
    });
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'app-lens.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const save = async () => {
    try {
      const result = await post('/__app-lens/manifest', { text }, 'PUT');
      setMessage(`Saved ${String(result.saved)}`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const openFile = async (selected: File | undefined) => {
    if (selected) replace(await selected.text());
  };

  const draftWithAi = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await post('/__app-lens/draft', { source: aiSource, kind: aiKind });
      propose(result.manifest as ManifestInput);
    } catch (error) {
      setAiError((error as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  const problems = analysis.jsonError
    ? [{ path: 'JSON', message: analysis.jsonError }]
    : analysis.issues;
  const score = analysis.lint?.score;

  return (
    <div className="al-root al-studio" data-theme="light">
      <header className="al-studio-bar">
        <strong className="al-brand">AppLens Studio</strong>
        <div className="al-row">
          <button type="button" className="al-btn al-btn-ghost" disabled={editor.past.length === 0} onClick={() => dispatch({ type: 'undo' })}>Undo</button>
          <button type="button" className="al-btn al-btn-ghost" disabled={editor.future.length === 0} onClick={() => dispatch({ type: 'redo' })}>Redo</button>
          <button type="button" className="al-btn al-btn-ghost" onClick={() => replace(serialize(starterManifest('My App')))}>New</button>
          <button type="button" className="al-btn al-btn-ghost" onClick={() => opener.current?.click()}>Open</button>
          <input ref={opener} type="file" accept=".json,application/json" hidden aria-label="Open manifest" onChange={(event) => void openFile(event.target.files?.[0])} />
          <button type="button" className="al-btn" onClick={() => setDialog('attach')}>Attach project</button>
          <button type="button" className="al-btn" onClick={() => setDialog('ai')}>Draft with AI</button>
          {file ? <button type="button" className="al-btn al-btn-primary" disabled={!analysis.manifest} onClick={() => void save()}>Save</button> : null}
          <button type="button" className={`al-btn${file ? '' : ' al-btn-primary'}`} onClick={download}>Download</button>
        </div>
      </header>
      {message ? <p className="al-studio-message" role="status">{message}</p> : null}

      {proposal ? (
        <section className="al-alert al-alert-info al-studio-review" aria-label="Review draft">
          <strong>Review this draft before you apply it.</strong>
          {proposal.changes.length > 0 ? (
            <ul className="al-issues">
              {proposal.changes.slice(0, 40).map((change, index) => <li key={index}>{change.type} {change.section}: {change.name}</li>)}
            </ul>
          ) : <p>No differences.</p>}
          <div className="al-row">
            <button type="button" className="al-btn al-btn-primary" onClick={() => replace(proposal.text)}>Apply draft</button>
            <button type="button" className="al-btn" onClick={() => setProposal(null)}>Discard</button>
          </div>
        </section>
      ) : null}

      <main className="al-studio-main">
        <section className="al-studio-editor" aria-label="Editor">
          <div className="al-toolbar">
            <div className="al-segmented" role="group" aria-label="Editor mode">
              <button type="button" aria-pressed={mode === 'form'} disabled={!analysis.value} onClick={() => setMode('form')}>Form</button>
              <button type="button" aria-pressed={mode === 'json'} onClick={() => setMode('json')}>JSON</button>
            </div>
            <span className="al-muted" role="status">
              {problems.length > 0 ? `${problems.length} problem${problems.length === 1 ? '' : 's'}` : `Quality score ${score ?? 0}/100`}
            </span>
          </div>

          {problems.length > 0 ? (
            <div className="al-studio-issues">
              {analysis.jsonError ? <IssuesView issues={problems} /> : (
                <div className="al-alert al-alert-error" role="alert">
                  <ul className="al-issues">
                    {problems.map((issue, index) => (
                      <li key={index}><button type="button" className="al-link" onClick={() => jumpTo(issue.path)}>{issue.path}</button> {issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          {mode === 'form' && analysis.value ? (
            <FormEditor value={analysis.value as ManifestInput} onUpdate={update} />
          ) : (
            <textarea
              ref={textarea}
              className="al-studio-json"
              aria-label="Manifest JSON"
              spellCheck={false}
              value={text}
              onChange={(event) => dispatch({ type: 'edit', text: event.target.value })}
            />
          )}

          {analysis.lint && analysis.lint.findings.length > 0 ? (
            <details className="al-card al-form-section">
              <summary>Suggestions<span className="al-tab-count">{analysis.lint.findings.length}</span></summary>
              <ul className="al-issues">
                {analysis.lint.findings.map((finding, index) => (
                  <li key={index}><button type="button" className="al-link" onClick={() => jumpTo(finding.path)}>{finding.path}</button> {finding.message}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section className="al-studio-preview" aria-label="Live preview">
          {preview ? <AppLensView manifest={preview} embedded stateKey="studio" /> : <p className="al-muted">Fix the problems to see a preview.</p>}
        </section>
      </main>

      {dialog === 'attach' ? (
        <Suspense fallback={null}>
          <AttachDialog onClose={() => setDialog(null)} onDraft={(_label, manifest) => propose(manifest)} />
        </Suspense>
      ) : null}

      {dialog === 'ai' ? (
        <AiDialog onClose={() => setDialog(null)}>
          <h2>Draft with AI</h2>
          <p className="al-muted">Claude drafts a manifest from your text, and you review it before anything changes. This sends the text to the Claude API and needs ANTHROPIC_API_KEY set where <code>app-lens studio</code> runs.</p>
          <div className="al-segmented" role="group" aria-label="Source type">
            <button type="button" aria-pressed={aiKind === 'readme'} onClick={() => setAiKind('readme')}>README</button>
            <button type="button" aria-pressed={aiKind === 'openapi'} onClick={() => setAiKind('openapi')}>OpenAPI spec</button>
          </div>
          <textarea className="al-input" rows={10} aria-label="Source text" value={aiSource} onChange={(event) => setAiSource(event.target.value)} />
          {aiError ? <div className="al-alert al-alert-error" role="alert">{aiError}</div> : null}
          <div className="al-row">
            <button type="button" className="al-btn al-btn-primary" disabled={aiBusy || !aiSource.trim()} onClick={() => void draftWithAi()}>{aiBusy ? 'Drafting…' : 'Draft manifest'}</button>
            <button type="button" className="al-btn al-btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
          </div>
        </AiDialog>
      ) : null}
    </div>
  );
}
