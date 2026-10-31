import {
  diffManifests,
  draftManifest,
  importOpenApi,
  importPrisma,
  importReadme,
  lintManifest,
  parseManifest,
  renderMarkdown,
  renderPdf,
  type Manifest,
  type ProjectSignals,
} from '@app-lens/core';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { aiDraft, type DraftClient } from './ai';
import { CliError, readManifestFile, writeJson } from './commands';

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

interface Options {
  out?: string;
  force?: boolean;
  report?: string;
  'min-score'?: string;
  ai?: boolean;
}

function readText(file: string): string {
  if (!existsSync(file)) throw new CliError(`File not found: ${file}`);
  const stat = statSync(file);
  if (stat.isDirectory()) throw new CliError(`${file} is a folder. Pass a file.`);
  if (stat.size > MAX_INPUT_BYTES) throw new CliError(`${file} is larger than 10 MB.`);
  return readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

function validManifest(file: string): Manifest {
  const result = parseManifest(readManifestFile(file));
  if (!result.ok) throw new CliError(`${file} has ${result.issues.length} problem(s). Run "app-lens validate ${file}".`);
  return result.manifest;
}

/** Parses JSON or YAML. YAML anchors are capped so a small file cannot expand into a huge one. */
export function parseSpec(text: string, file: string): unknown {
  try {
    return extname(file).toLowerCase() === '.json' ? JSON.parse(text) : parseYaml(text, { maxAliasCount: 100 });
  } catch (error) {
    throw new CliError(`${file} could not be parsed: ${(error as Error).message}`);
  }
}

export function signalsFromFile(type: string, file: string): ProjectSignals {
  const text = readText(file);
  const source = basename(file);
  switch (type) {
    case 'openapi':
      try {
        return importOpenApi(parseSpec(text, file), source);
      } catch (error) {
        throw error instanceof CliError ? error : new CliError((error as Error).message);
      }
    case 'prisma':
      return importPrisma(text, source);
    case 'readme':
      return importReadme(text, source);
    default:
      throw new CliError(`Unknown ingest type "${type}". Use openapi, prisma or readme.`);
  }
}

export async function ingest(type: string, file: string | undefined, options: Options = {}, client?: DraftClient): Promise<void> {
  if (!file) throw new CliError('"ingest" needs a type and a file, e.g. "app-lens ingest openapi spec.yaml".');
  const out = options.out ?? 'app-lens.json';
  if (existsSync(out) && !options.force) throw new CliError(`${out} already exists. Use --force to overwrite it.`);
  if (options.ai) {
    // Parsing first means an unknown type or a broken spec fails before anything is sent.
    signalsFromFile(type, file);
    const result = await aiDraft(readText(file), type === 'openapi' ? 'OpenAPI spec' : type === 'prisma' ? 'Prisma schema' : 'README', client, (message) => console.log(message));
    writeJson(out, result.manifest);
    console.log(`Drafted ${out} with Claude. Review it before you publish it, for example in "app-lens studio ${out}".`);
    return;
  }
  const { manifest, report } = draftManifest(signalsFromFile(type, file), { fallbackName: basename(file, extname(file)) });
  writeJson(out, manifest);
  if (options.report) writeJson(options.report, report);
  console.log(`Drafted ${out} from ${file}: ${report.items.length} items. Review it before you publish it.`);
  for (const note of report.notes) console.log(`  note: ${note}`);
}

export function exportManifest(format: string, file: string | undefined, options: Options = {}): void {
  if (!file) throw new CliError('"export" needs a format and a file, e.g. "app-lens export pdf app-lens.json".');
  if (format !== 'md' && format !== 'pdf') throw new CliError(`Unknown export format "${format}". Use md or pdf.`);
  const manifest = validManifest(file);
  const out = options.out ?? `${basename(file, extname(file))}.${format}`;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  if (format === 'md') writeFileSync(out, renderMarkdown(manifest));
  else writeFileSync(out, renderPdf(manifest));
  console.log(`Wrote ${out}`);
}

export function lint(file: string, options: Options = {}): boolean {
  const { score, findings } = lintManifest(validManifest(file));
  console.log(`${file} scores ${score}/100.`);
  for (const finding of findings) console.log(`  ${finding.severity === 'warning' ? 'warn' : 'tip '} ${finding.path}: ${finding.message}`);
  const minimum = options['min-score'];
  if (minimum === undefined) return true;
  const required = Number(minimum);
  if (!Number.isFinite(required)) throw new CliError(`Invalid --min-score "${minimum}".`);
  return score >= required;
}

export function diff(before: string, after: string | undefined): void {
  if (!after) throw new CliError('"diff" needs two files.');
  const changes = diffManifests(validManifest(before), validManifest(after));
  if (changes.length === 0) {
    console.log('No differences.');
    return;
  }
  const marks = { added: '+', removed: '-', changed: '~' };
  for (const change of changes) console.log(`${marks[change.type]} ${change.section}: ${change.name}`);
}
