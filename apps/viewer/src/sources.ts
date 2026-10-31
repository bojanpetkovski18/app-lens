export interface ManifestSource {
  key: string;
  label: string;
  group: string;
  load: (signal?: AbortSignal) => Promise<unknown>;
}

interface SampleModule {
  app?: { name?: string };
}

export function sampleSources(): ManifestSource[] {
  const samples = import.meta.glob<SampleModule>('../../../samples/*.app-lens.json', { eager: true, import: 'default' });
  return Object.entries(samples)
    .map(([path, manifest]): ManifestSource => {
      const file = path.split('/').pop() ?? path;
      return {
        key: `sample:${file}`,
        label: manifest.app?.name ?? file,
        group: 'Samples',
        load: () => Promise.resolve(manifest),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { credentials: 'omit', signal });
  if (!response.ok) throw new Error(`Could not load manifest (HTTP ${response.status}).`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The manifest is not valid JSON.');
  }
}

/** Only http(s) manifests can be loaded from a URL. */
export function sourceFromUrl(value: string): ManifestSource | null {
  let url: URL;
  try {
    url = new URL(value, window.location.href);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return { key: `url:${url.href}`, label: url.href, group: 'From URL', load: (signal) => fetchJson(url.href, signal) };
}

/**
 * A pinned site shows its own manifest. Letting ?manifest= override the pin would let a crafted
 * link display arbitrary content on the site's own domain.
 */
export function resolveManifestUrl(param: string | null, pinned: string | null): string | null {
  return pinned ?? param;
}

export function pinnedManifestUrl(): string | null {
  return document.querySelector<HTMLMetaElement>('meta[name="app-lens-manifest"]')?.content ?? null;
}
