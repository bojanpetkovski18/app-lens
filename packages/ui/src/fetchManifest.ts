const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;

function tooLarge(): Error {
  return new Error(`The manifest is too large. The limit is ${MAX_MANIFEST_BYTES / (1024 * 1024)} MB.`);
}

/** Content-Length can be missing or wrong, so the limit is also enforced while reading. */
async function readLimited(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0) > MAX_MANIFEST_BYTES) throw tooLarge();
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    total += value.length;
    if (total > MAX_MANIFEST_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** Loads a manifest from an untrusted URL, without cookies and with a size limit. */
export async function fetchManifest(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { credentials: 'omit', signal });
  if (!response.ok) throw new Error(`Could not load manifest (HTTP ${response.status}).`);
  const text = await readLimited(response);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The manifest is not valid JSON.');
  }
}
