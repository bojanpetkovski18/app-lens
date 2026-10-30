import { importOpenApi, importPrisma, importReadme } from './importers';
import { emptySignals, mergeSignals, toFieldName, type EntitySignal, type FeatureSignal, type ProjectSignals } from './intake';

export interface ProjectFile {
  /** Relative to the project root, with forward slashes. */
  path: string;
  text: string;
}

const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.nuxt', '.svelte-kit', 'coverage', 'vendor', 'target', '__pycache__', '.venv', 'venv', 'out', '.turbo', '.cache']);
const SECRET_FILE = /^\.env(\..*)?$|\.(pem|key|p12|pfx|crt|cer|der|keystore|jks|asc|gpg)$|^id_(rsa|dsa|ecdsa|ed25519)$|^\.?(npmrc|netrc|pypirc)$|credentials|secrets?\.(json|ya?ml|toml)$/i;
const TEXT_FILE = /\.(json|ya?ml|md|markdown|prisma|tsx|jsx|vue|svelte|html?|css|scss|js|ts|mjs|cjs)$/i;

/** Decides what intake may read, in the CLI and in the browser alike. Secrets are never read. */
export function shouldReadPath(path: string): boolean {
  const parts = path.split('/');
  if (parts.slice(0, -1).some((part) => SKIPPED_FOLDERS.has(part))) return false;
  const name = parts[parts.length - 1] ?? '';
  return !SECRET_FILE.test(name) && TEXT_FILE.test(name);
}

const OPENAPI_FILE = /(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$/i;
const README_FILE = /^readme(\.[a-z]+)?$/i;
const PRISMA_FILE = /(^|\/)schema\.prisma$/i;
const ROUTE_FILE = /(?:^|\/)(?:src\/)?(pages|app|routes|views)\/(.+?)\.(tsx|jsx|vue|svelte|html?)$/i;
const FORM_FILE = /\.(tsx|jsx|vue|svelte|html?)$/i;
const SKIPPED_ROUTE = /^(_|\[|index$|layout$|page$|loading$|error$|not-found$|404$|500$|api\/|login|logout|signin|signup|sign-in|sign-up|register$|auth|privacy|terms)/i;

const KNOWN_INTEGRATIONS: [RegExp, string][] = [
  [/^stripe$|^@stripe\//, 'Stripe'],
  [/^@sendgrid\//, 'SendGrid'],
  [/^twilio$/, 'Twilio'],
  [/^@slack\//, 'Slack'],
  [/^@sentry\//, 'Sentry'],
  [/^aws-sdk$|^@aws-sdk\//, 'AWS'],
  [/^firebase/, 'Firebase'],
  [/^@supabase\//, 'Supabase'],
  [/^next-auth$|^@auth\//, 'Auth.js'],
  [/^@clerk\//, 'Clerk'],
  [/^nodemailer$/, 'Email delivery'],
  [/^redis$|^ioredis$/, 'Redis'],
  [/^@octokit\//, 'GitHub'],
  [/^algoliasearch$/, 'Algolia'],
  [/^@anthropic-ai\//, 'Claude'],
];

function title(value: string): string {
  const text = value.replace(/[-_/]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function readPackageJson(file: ProjectFile, signals: ProjectSignals): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    signals.notes.push(`${file.path}: not valid JSON.`);
    return;
  }
  if (typeof parsed !== 'object' || parsed === null) return;
  const pkg = parsed as { name?: unknown; description?: unknown; version?: unknown; homepage?: unknown; dependencies?: unknown };
  if (typeof pkg.name === 'string') signals.appName = title(pkg.name.replace(/^@[^/]+\//, ''));
  if (typeof pkg.description === 'string') signals.tagline = pkg.description;
  if (typeof pkg.version === 'string') signals.version = pkg.version;
  if (typeof pkg.homepage === 'string') signals.website = pkg.homepage;
  if (typeof pkg.dependencies === 'object' && pkg.dependencies !== null) {
    for (const dependency of Object.keys(pkg.dependencies)) {
      const match = KNOWN_INTEGRATIONS.find(([pattern]) => pattern.test(dependency));
      if (match && !signals.integrations.includes(match[1])) signals.integrations.push(match[1]);
    }
  }
}

function routeFeature(path: string): FeatureSignal | null {
  const match = ROUTE_FILE.exec(path);
  if (!match?.[2]) return null;
  const route = match[2].replace(/\/(index|page)$/i, '').replace(/\([^)]*\)\//g, '');
  if (SKIPPED_ROUTE.test(route)) return null;
  const first = route.split('/').find((segment) => !segment.startsWith('[') && !segment.startsWith(':'));
  return first ? { title: title(first), evidence: [{ source: path, detail: 'route' }], confidence: 'low' } : null;
}

const INPUT_NAME = /<(?:input|select|textarea|Input|Select|Textarea)\b[^>]{0,300}?\bname=["']([A-Za-z][\w.-]{0,50})["'][^>]{0,300}?>/g;
const INPUT_TYPE = /\btype=["']([a-z-]+)["']/;
const TYPE_KINDS: Record<string, string> = { email: 'email', tel: 'phone', date: 'date', 'datetime-local': 'datetime', number: 'int:0..1000', checkbox: 'bool', url: 'words', password: '' };

function kindFromInput(tag: string, name: string): string {
  const type = INPUT_TYPE.exec(tag)?.[1];
  return (type !== undefined ? TYPE_KINDS[type] : undefined) ?? fieldKindByName(name);
}

const FIELD_NAME_KINDS: [RegExp, string][] = [
  [/name$/i, 'fullName'],
  [/email/i, 'email'],
  [/phone/i, 'phone'],
  [/company/i, 'company'],
  [/city/i, 'city'],
  [/country/i, 'country'],
  [/message|description|comment/i, 'sentence'],
  [/title/i, 'title'],
];

function fieldKindByName(name: string): string {
  return FIELD_NAME_KINDS.find(([pattern]) => pattern.test(name))?.[1] ?? 'words';
}

/** Form fields map to an entity named after the file. Password fields are ignored. */
function formEntity(file: ProjectFile): EntitySignal | null {
  const fields: Record<string, string> = {};
  for (const match of file.text.matchAll(INPUT_NAME)) {
    const name = toFieldName(match[1] ?? '');
    const kind = kindFromInput(match[0], name);
    if (name && kind) fields[name] = kind;
  }
  if (Object.keys(fields).length < 2) return null;
  const base = (file.path.split('/').pop() ?? '').replace(/\.[^.]+$/, '').replace(/(form|page|view|modal|dialog)$/i, '') || 'Record';
  return { name: base, fields, evidence: [{ source: file.path, detail: 'form fields' }], confidence: 'low' };
}

const COLOR_RULE = /(?:--(?:color-)?|["']?)(primary|accent|brand|secondary)(?:-500|-600)?["']?\s*:\s*["']?(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g;

function readColors(text: string, signals: ProjectSignals): void {
  for (const [, name, color] of text.matchAll(COLOR_RULE)) {
    signals.theme ??= {};
    if (name === 'primary' || name === 'brand') signals.theme.primary ??= color;
    else signals.theme.accent ??= color;
  }
}

function rolePersonas(file: ProjectFile, signals: ProjectSignals): void {
  const roles = /enum\s+(?:User)?Role\s*\{([^}]*)\}/.exec(file.text)?.[1];
  for (const role of (roles ?? '').split(/\s+/).filter((value) => /^[A-Za-z_]+$/.test(value))) {
    const label = title(role.toLowerCase());
    signals.personas.push({ label, evidence: [{ source: file.path, detail: 'role enum' }], confidence: 'medium' });
  }
}

export interface FileSignalOptions {
  /** YAML parsing is injected so core stays free of dependencies that only intake needs. */
  parseYaml?: (text: string) => unknown;
}

/** Maps a project's files to signals. Nothing in a project is ever executed. */
export function signalsFromFiles(files: readonly ProjectFile[], options: FileSignalOptions = {}): ProjectSignals {
  const parts: ProjectSignals[] = [];
  const base = emptySignals();
  const ordered = [...files].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
  const seenFeatures = new Set<string>();

  for (const file of ordered) {
    const name = file.path.split('/').pop() ?? file.path;
    try {
      if (name === 'package.json' && !file.path.includes('/')) {
        readPackageJson(file, base);
      } else if (OPENAPI_FILE.test(file.path)) {
        const doc = /\.json$/i.test(file.path) ? JSON.parse(file.text) : options.parseYaml?.(file.text);
        if (doc === undefined) base.notes.push(`${file.path}: YAML is not available here, so the spec was skipped.`);
        else parts.push(importOpenApi(doc, file.path));
      } else if (PRISMA_FILE.test(file.path)) {
        parts.push(importPrisma(file.text, file.path));
        rolePersonas(file, base);
      } else if (README_FILE.test(name) && !file.path.includes('/')) {
        parts.push(importReadme(file.text, file.path));
      }
    } catch (error) {
      base.notes.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const feature = routeFeature(file.path);
    if (feature && !seenFeatures.has(feature.title)) {
      seenFeatures.add(feature.title);
      base.features.push(feature);
    }
    if (FORM_FILE.test(file.path)) {
      const entity = formEntity(file);
      if (entity) base.entities.push(entity);
    }
    if (/tailwind\.config|\.(css|scss)$/i.test(file.path)) readColors(file.text, base);
  }
  // Specs outrank what routes and forms suggest.
  return mergeSignals(...parts.filter((part) => part.entities.length > 0), base, ...parts.filter((part) => part.entities.length === 0));
}

export interface PageForm {
  name?: string;
  fields: { name: string; type?: string }[];
}

/** Only page structure. Body text is never collected, so posts and people cannot reach a draft. */
export interface PageSummary {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  themeColor?: string;
  h1?: string;
  navLinks: { text: string; href: string }[];
  forms: PageForm[];
}

export interface WebManifestInfo {
  name?: string;
  description?: string;
  themeColor?: string;
}

const NAV_SKIP = /^(log ?in|log ?out|sign ?(in|up|out)|register|privacy|terms|cookies?|help|contact|about|home|careers?|jobs|legal|accessibility|imprint|settings|account|profile|skip to|menu|search|more|language)\b/i;
const PERSONAL = /@|\bu\/|\d{4,}/;
const USER_PATH = /\/(user|users|u|profile|people|member|members|author|@[^/]+)(\/|$)/i;
const MAX_NAV_TEXT = 40;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function safeLabel(text: string): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length >= 2 && clean.length <= MAX_NAV_TEXT && !PERSONAL.test(clean) && !NAV_SKIP.test(clean) ? clean : null;
}

function cleanTitle(value: string | undefined, site: string | undefined): string | undefined {
  const first = value?.split(/\s[|–—-]\s/)[0]?.trim();
  return site?.trim() || first || undefined;
}

/** Maps crawled page structure to signals, dropping anything that looks personal. */
export function signalsFromPages(pages: readonly PageSummary[], manifest?: WebManifestInfo): ProjectSignals {
  const signals = emptySignals();
  const home = pages[0];
  if (!home) return signals;
  signals.appName = manifest?.name ?? cleanTitle(home.title, home.siteName);
  signals.tagline = home.description ?? manifest?.description;
  signals.website = home.url;
  const color = manifest?.themeColor ?? home.themeColor;
  if (color && HEX.test(color)) signals.theme = { primary: color };

  const seen = new Set<string>();
  for (const page of pages) {
    for (const link of page.navLinks) {
      const label = safeLabel(link.text);
      if (!label || USER_PATH.test(link.href) || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      const target = pages.find((candidate) => candidate.url === link.href);
      signals.features.push({ title: label, description: target?.description, evidence: [{ source: link.href, detail: `navigation on ${page.url}` }], confidence: 'medium' });
    }
    for (const [index, form] of page.forms.entries()) {
      if (form.fields.some((field) => field.type === 'password')) continue;
      const fields: Record<string, string> = {};
      for (const field of form.fields) {
        const name = toFieldName(field.name);
        const kind = field.type && field.type in TYPE_KINDS ? TYPE_KINDS[field.type] : fieldKindByName(name);
        if (name && kind) fields[name] = kind;
      }
      if (Object.keys(fields).length < 2) continue;
      const path = new URL(page.url).pathname.split('/').filter(Boolean).pop();
      signals.entities.push({ name: form.name ?? `${path ?? 'Home'} form ${index + 1}`, fields, evidence: [{ source: page.url, detail: 'form' }], confidence: 'low' });
    }
  }
  return signals;
}
