import type { PageForm, PageSummary, WebManifestInfo } from '@app-lens/core';
import { Parser } from 'htmlparser2';
import { safeFetch, type SafeFetchOptions } from './net';

const MAX_LINKS = 60;
const MAX_FORMS = 10;
const MAX_FIELDS = 30;

/** Normalises a bare host such as "www.reddit.com" to https://www.reddit.com/. */
export function normalizeSiteUrl(value: string): URL | null {
  const text = value.trim();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

interface RobotsRules {
  disallow: string[];
  allow: string[];
  sitemaps: string[];
}

/** Applies the group for our agent, otherwise the "*" group. */
export function parseRobots(text: string, agent = 'applens'): RobotsRules {
  const sitemaps: string[] = [];
  const groups = new Map<string, { disallow: string[]; allow: string[] }>();
  let current: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'sitemap') sitemaps.push(value);
    else if (key === 'user-agent') {
      if (inRules) current = [];
      inRules = false;
      current.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      inRules = true;
      for (const name of current) {
        const group = groups.get(name) ?? { disallow: [], allow: [] };
        if (value) group[key].push(value);
        groups.set(name, group);
      }
    }
  }
  const group = [...groups.entries()].find(([name]) => name !== '*' && agent.includes(name))?.[1] ?? groups.get('*') ?? { disallow: [], allow: [] };
  return { ...group, sitemaps };
}

function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith('$');
  const pattern = (anchored ? rule.slice(0, -1) : rule).split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path);
}

/** The longest matching rule wins, and allow wins ties. */
export function isAllowedByRobots(rules: RobotsRules, path: string): boolean {
  const longest = (list: string[]) => Math.max(-1, ...list.filter((rule) => ruleMatches(rule, path)).map((rule) => rule.length));
  return longest(rules.allow) >= longest(rules.disallow);
}

export function parsePage(html: string, pageUrl: string): PageSummary & { manifestHref?: string } {
  const page: PageSummary & { manifestHref?: string } = { url: pageUrl, navLinks: [], forms: [] };
  const origin = new URL(pageUrl).origin;
  let inTitle = false;
  let inH1 = false;
  let navDepth = 0;
  let linkHref: string | null = null;
  let linkText = '';
  let form: PageForm | null = null;
  let title = '';
  let h1 = '';

  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === 'title') inTitle = true;
      else if (name === 'h1' && !page.h1) inH1 = true;
      else if (name === 'nav' || (name === 'header' && navDepth === 0)) navDepth++;
      else if (name === 'meta') {
        const key = (attrs.name ?? attrs.property ?? '').toLowerCase();
        if (key === 'description' || key === 'og:description') page.description ??= attrs.content;
        else if (key === 'og:site_name') page.siteName ??= attrs.content;
        else if (key === 'theme-color') page.themeColor ??= attrs.content;
      } else if (name === 'link' && (attrs.rel ?? '').toLowerCase() === 'manifest' && attrs.href) {
        page.manifestHref = attrs.href;
      } else if (name === 'a' && navDepth > 0 && attrs.href) {
        linkHref = attrs.href;
        linkText = '';
      } else if (name === 'form' && page.forms.length < MAX_FORMS) {
        form = { fields: [] };
      } else if ((name === 'input' || name === 'select' || name === 'textarea') && form && form.fields.length < MAX_FIELDS) {
        const type = (attrs.type ?? name).toLowerCase();
        if (attrs.name && type !== 'hidden' && type !== 'submit' && type !== 'button') form.fields.push({ name: attrs.name, type });
      }
    },
    ontext(text) {
      if (inTitle) title += text;
      if (inH1) h1 += text;
      if (linkHref !== null) linkText += text;
    },
    onclosetag(name) {
      if (name === 'title') inTitle = false;
      else if (name === 'h1') inH1 = false;
      else if (name === 'nav' || name === 'header') navDepth = Math.max(0, navDepth - 1);
      else if (name === 'form' && form) {
        page.forms.push(form);
        form = null;
      } else if (name === 'a' && linkHref !== null) {
        try {
          const target = new URL(linkHref, pageUrl);
          if (target.origin === origin && page.navLinks.length < MAX_LINKS) {
            target.hash = '';
            page.navLinks.push({ text: linkText.trim(), href: target.href });
          }
        } catch {
          // Invalid links are ignored.
        }
        linkHref = null;
      }
    },
  }, { decodeEntities: true });
  parser.write(html);
  parser.end();
  page.title = title.trim() || undefined;
  page.h1 = h1.trim() || undefined;
  return page;
}

export function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]{1,2000})\s*<\/loc>/g)].flatMap((match) => (match[1] ? [match[1]] : []));
}

export interface CrawlResult {
  pages: PageSummary[];
  manifest?: WebManifestInfo;
  notes: string[];
}

export interface CrawlOptions extends SafeFetchOptions {
  maxPages?: number;
  delayMs?: number;
}

const DEFAULT_MAX_PAGES = 12;
const HTML = /text\/html|application\/xhtml/i;

/** Crawls same-origin pages. No cookies, no login, no scripts, and robots.txt is respected. */
export async function crawlSite(start: URL, options: CrawlOptions = {}): Promise<CrawlResult> {
  const notes: string[] = [];
  const { maxPages = DEFAULT_MAX_PAGES, delayMs = 250 } = options;
  const rootUrl = new URL('/', start).href;

  let rules: RobotsRules = { allow: [], disallow: [], sitemaps: [] };
  const robots = await safeFetch(new URL('/robots.txt', start).href, options).catch(() => null);
  if (robots?.status === 200) rules = parseRobots(robots.text);
  if (!isAllowedByRobots(rules, start.pathname)) {
    throw new Error(`robots.txt does not allow crawling ${start.href}.`);
  }

  const queue = [start.href];
  const seen = new Set(queue);
  const enqueue = (href: string) => {
    if (seen.has(href) || seen.size > maxPages * 20) return;
    const url = new URL(href);
    if (url.origin !== start.origin) return;
    seen.add(href);
    if (isAllowedByRobots(rules, url.pathname + url.search)) queue.push(href);
    else notes.push(`Skipped ${href}: disallowed by robots.txt.`);
  };

  const pages: (PageSummary & { manifestHref?: string })[] = [];
  while (queue.length > 0 && pages.length < maxPages) {
    const href = queue.shift() as string;
    const response = await safeFetch(href, options).catch((error: Error) => {
      if (pages.length === 0) throw error;
      notes.push(`Skipped ${href}: ${error.message}`);
      return null;
    });
    if (response && response.status === 200 && HTML.test(response.contentType)) {
      const page = parsePage(response.text, response.url);
      // A disallowed page stays out of the draft, not only out of the crawl.
      page.navLinks = page.navLinks.filter((link) => {
        const { pathname, search } = new URL(link.href);
        return isAllowedByRobots(rules, pathname + search);
      });
      pages.push(page);
      page.navLinks.forEach((link) => enqueue(link.href));
      if (pages.length === 1) {
        const sitemaps = rules.sitemaps.length > 0 ? rules.sitemaps : [new URL('/sitemap.xml', rootUrl).href];
        const sitemap = await safeFetch(sitemaps[0] as string, options).catch(() => null);
        if (sitemap?.status === 200) sitemapUrls(sitemap.text).slice(0, 200).forEach((url) => { try { enqueue(url); } catch { /* invalid entry */ } });
      }
    } else if (response && pages.length === 0) {
      throw new Error(`${href} responded with HTTP ${response.status}.`);
    }
    if (delayMs > 0 && queue.length > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const manifestHref = pages[0]?.manifestHref;
  let manifest: WebManifestInfo | undefined;
  if (manifestHref) {
    const file = await safeFetch(new URL(manifestHref, pages[0]?.url).href, options).catch(() => null);
    try {
      const parsed = file?.status === 200 ? (JSON.parse(file.text) as Record<string, unknown>) : null;
      const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
      if (parsed) manifest = { name: text(parsed.name) ?? text(parsed.short_name), description: text(parsed.description), themeColor: text(parsed.theme_color) };
    } catch {
      notes.push('The web app manifest is not valid JSON.');
    }
  }
  return { pages, manifest, notes };
}
