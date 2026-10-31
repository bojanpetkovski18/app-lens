import { draftManifest, parseManifest, signalsFromFiles, signalsFromPages, toId, type DraftResult, type ProjectSignals } from '@app-lens/core';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CliError, writeJson } from '../commands';
import { DEFAULT_FOLDER_LIMITS, scanFolder } from './folder';
import { parseGithubUrl, withGithubSource, type FetchLike, type GithubSource } from './github';
import { FetchBlockedError, type SafeFetchOptions } from './net';
import { crawlSite, normalizeSiteUrl } from './site';

export type AttachSource = { type: 'folder'; path: string } | { type: 'github'; repo: GithubSource; url: string } | { type: 'site'; url: URL };

export function detectSource(value: string): AttachSource {
  if (existsSync(value)) {
    if (!statSync(value).isDirectory()) throw new CliError(`${value} is a file. Use "app-lens ingest" for a single file.`);
    return { type: 'folder', path: value };
  }
  if (/^https?:\/\/(www\.)?github\.com(\/|$)/i.test(value)) {
    const repo = parseGithubUrl(value);
    if (!repo) throw new CliError('Use a link like https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/folder.');
    return { type: 'github', repo, url: value };
  }
  const url = normalizeSiteUrl(value);
  if (!url || /^[./\\]/.test(value)) throw new CliError(`${value} is not a folder, a GitHub link or a website.`);
  return { type: 'site', url };
}

export interface AttachOptions {
  out?: string;
  report?: string;
  dryRun?: boolean;
  force?: boolean;
  maxFiles?: number;
  maxPages?: number;
  /** Declares that a URL or repo is the user's own project. */
  own?: boolean;
  /** Declares that a folder is someone else's project. */
  thirdParty?: boolean;
  net?: SafeFetchOptions;
  fetchImpl?: FetchLike;
}

async function collect(source: AttachSource, options: AttachOptions): Promise<{ signals: ProjectSignals; fallbackName: string }> {
  const limits = { ...DEFAULT_FOLDER_LIMITS, ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}) };
  const fromFolder = (folder: string) => {
    if (!existsSync(folder)) throw new CliError(`${folder} does not exist in that repository.`);
    const { files, notes } = scanFolder(folder, limits);
    const signals = signalsFromFiles(files, { parseYaml: (text) => parseYaml(text, { maxAliasCount: 100 }) });
    signals.notes.push(...notes);
    return signals;
  };
  switch (source.type) {
    case 'folder':
      return { signals: fromFolder(source.path), fallbackName: basename(resolve(source.path)) };
    case 'github':
      return {
        signals: await withGithubSource(source.repo, fromFolder, options.fetchImpl),
        fallbackName: source.repo.repo,
      };
    case 'site': {
      try {
        const { pages, manifest, notes } = await crawlSite(source.url, { ...options.net, maxPages: options.maxPages });
        const signals = signalsFromPages(pages, manifest);
        signals.notes.push(...notes);
        return { signals, fallbackName: source.url.hostname.replace(/^www\./, '') };
      } catch (error) {
        throw new CliError(error instanceof FetchBlockedError ? `Refused: ${error.message}` : (error as Error).message);
      }
    }
  }
}

function sourceLabel(source: AttachSource): string {
  if (source.type === 'folder') return basename(resolve(source.path));
  return source.type === 'github' ? source.url : source.url.href;
}

/** Third-party drafts may not go where they could reach a build or the repository. */
function assertSafeOutput(out: string): void {
  // Measured from here, because the folder above a project may have any name.
  const parts = relative(process.cwd(), resolve(out)).split(sep);
  if (parts.includes('samples')) throw new CliError('A draft of a third-party project must never go into samples/. Use the drafts/ folder.');
  const relativeToDrafts = relative(resolve('drafts'), resolve(out));
  if (relativeToDrafts.startsWith('..') || isAbsolute(relativeToDrafts)) {
    throw new CliError('A draft of a third-party project stays in the gitignored drafts/ folder.');
  }
}

export interface AttachResult extends DraftResult {
  thirdParty: boolean;
  out: string;
  reportPath: string;
}

export async function attach(value: string, options: AttachOptions = {}): Promise<AttachResult> {
  const source = detectSource(value);
  const thirdParty = source.type === 'folder' ? !!options.thirdParty : !options.own;
  const { signals, fallbackName } = await collect(source, options);
  const label = sourceLabel(source);
  const draft = draftManifest(signals, {
    fallbackName,
    ...(thirdParty
      ? {
          thirdParty: { source: label },
          attribution: {
            text: `Independent draft based on the public structure of ${label}. Not affiliated with or endorsed by its owner. All sample data is fictional.`,
            ...(source.type === 'site' ? { url: source.url.href } : source.type === 'github' ? { url: source.url } : {}),
          },
        }
      : {}),
  });

  const result = parseManifest(draft.manifest);
  if (!result.ok) throw new Error('The draft manifest did not validate.');

  const slug = toId(result.manifest.app.name) || 'draft';
  const out = options.out ?? (thirdParty ? join('drafts', `${slug}.app-lens.json`) : 'app-lens.json');
  if (thirdParty) assertSafeOutput(out);
  const reportPath = options.report ?? join(dirname(out), 'app-lens.intake.json');
  if (!options.dryRun) {
    if (!options.force) {
      for (const path of [out, reportPath]) {
        if (existsSync(path)) throw new CliError(`${path} already exists. Use --force to overwrite it.`);
      }
    }
    writeJson(out, draft.manifest);
    writeJson(reportPath, { source: label, thirdParty, ...draft.report });
  }
  return { ...draft, thirdParty, out, reportPath };
}
