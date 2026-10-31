import { shouldReadPath, type ProjectFile } from '@app-lens/core';
import { closeSync, lstatSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface FolderLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_FOLDER_LIMITS: FolderLimits = { maxFiles: 2000, maxFileBytes: 512 * 1024, maxTotalBytes: 32 * 1024 * 1024 };

export interface FolderScan {
  files: ProjectFile[];
  notes: string[];
}

/** Turns a .gitignore pattern into a matcher for paths relative to the root. Negation is ignored. */
export function gitignoreMatcher(text: string): (path: string) => boolean {
  const patterns = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'))
    .slice(0, 500)
    .map((line) => {
      const anchored = line.replace(/\/$/, '').includes('/');
      // \u0000 holds the place of ** while single * is expanded.
      // eslint-disable-next-line no-control-regex
      const body = line.replace(/^\//, '').replace(/\/$/, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*');
      return new RegExp(anchored ? `^${body}(/|$)` : `(^|/)${body}(/|$)`);
    });
  return (path) => patterns.some((pattern) => pattern.test(path));
}

function readLimited(path: string, limit: number): string | null {
  const descriptor = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(limit);
    const bytes = readSync(descriptor, buffer, 0, limit, 0);
    const content = buffer.subarray(0, bytes);
    return content.includes(0) ? null : content.toString('utf8').replace(/^\uFEFF/, '');
  } finally {
    closeSync(descriptor);
  }
}

/** Walks read-only. Symlinks are never followed, so nothing outside the root is reachable. */
export function scanFolder(root: string, limits: FolderLimits = DEFAULT_FOLDER_LIMITS): FolderScan {
  const notes: string[] = [];
  const files: ProjectFile[] = [];
  let total = 0;
  let ignored: (path: string) => boolean = () => false;
  try {
    ignored = gitignoreMatcher(readFileSync(join(root, '.gitignore'), 'utf8'));
  } catch {
    // No .gitignore is fine.
  }

  const queue = [root];
  while (queue.length > 0) {
    const folder = queue.shift() as string;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, entry.name);
      const path = relative(root, full).split(sep).join('/');
      if (entry.isSymbolicLink() || ignored(path)) continue;
      if (entry.isDirectory()) {
        if (shouldReadPath(`${path}/x.json`)) queue.push(full);
        continue;
      }
      if (!entry.isFile() || !shouldReadPath(path)) continue;
      if (files.length >= limits.maxFiles) {
        notes.push(`Stopped at the limit of ${limits.maxFiles} files.`);
        return { files, notes };
      }
      const size = lstatSync(full).size;
      if (size > limits.maxFileBytes) {
        notes.push(`Skipped ${path}: larger than ${limits.maxFileBytes} bytes.`);
        continue;
      }
      if (total + size > limits.maxTotalBytes) {
        notes.push(`Stopped at the limit of ${limits.maxTotalBytes} total bytes.`);
        return { files, notes };
      }
      const text = readLimited(full, limits.maxFileBytes);
      if (text === null) continue;
      total += size;
      files.push({ path, text });
    }
  }
  return { files, notes };
}
