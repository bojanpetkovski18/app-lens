import { parseManifest } from '@app-lens/core';
import { AppLensView, Frame, sanitizeTheme, TABS, type AppLensEvent, type Tab } from '@app-lens/ui';
import styles from '@app-lens/ui/styles.css?inline';
import { createRoot, type Root } from 'react-dom/client';

type State = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

const HOST_STYLES = ':host { display: block; } :host([hidden]) { display: none; }';
const INLINE_MANIFEST = 'script[type="application/json"]';

// One stylesheet shared by every instance on the page.
let sharedSheet: CSSStyleSheet | undefined;

function applyStyles(shadow: ShadowRoot): void {
  if ('replaceSync' in CSSStyleSheet.prototype && 'adoptedStyleSheets' in Document.prototype) {
    if (!sharedSheet) {
      sharedSheet = new CSSStyleSheet();
      sharedSheet.replaceSync(styles + HOST_STYLES);
    }
    shadow.adoptedStyleSheets = [sharedSheet];
    return;
  }
  const style = document.createElement('style');
  style.textContent = styles + HOST_STYLES;
  shadow.prepend(style);
}

class AppLensElement extends HTMLElement {
  static observedAttributes = ['src', 'theme', 'primary', 'accent', 'radius', 'font', 'tab', 'persona'];

  #root: Root | null = null;
  #manifest: unknown = undefined;
  #state: State = { status: 'loading' };
  #request = 0;
  #abort: AbortController | null = null;
  #observer: MutationObserver | null = null;

  get manifest(): unknown {
    return this.#manifest;
  }

  set manifest(value: unknown) {
    this.#cancelLoad();
    this.#apply(value);
  }

  connectedCallback(): void {
    // A value assigned before the element was upgraded shadows the setter.
    if (Object.prototype.hasOwnProperty.call(this, 'manifest')) {
      const value = (this as { manifest?: unknown }).manifest;
      delete (this as { manifest?: unknown }).manifest;
      this.manifest = value;
    }

    if (!this.#root) {
      const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      const mount = document.createElement('div');
      shadow.replaceChildren(mount);
      applyStyles(shadow);
      this.#root = createRoot(mount);
    }

    if (this.#manifest === undefined) void this.#load();
    else this.#render();
  }

  disconnectedCallback(): void {
    // Unmount in a microtask so moving the element within the page does not tear it down.
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.#cancelLoad();
      this.#root?.unmount();
      this.#root = null;
    });
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (previous === next || !this.#root) return;
    if (name === 'src') void this.#load();
    else this.#render();
  }

  #cancelLoad(): void {
    this.#request++;
    this.#abort?.abort();
    this.#abort = null;
    this.#observer?.disconnect();
    this.#observer = null;
  }

  /** While the page is parsing, this element can exist before its children do. */
  #waitForMarkup(): void {
    if (!this.#observer) {
      this.#observer = new MutationObserver(() => void this.#load());
      this.#observer.observe(this, { childList: true, subtree: true, characterData: true });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => void this.#load(), { once: true });
    }
  }

  #parseInline(inline: Element): { value: unknown } | null {
    try {
      return { value: JSON.parse(inline.textContent ?? '') };
    } catch {
      // The parser may have delivered only part of the script so far.
      if (document.readyState === 'loading') return null;
      throw new Error('The inline manifest is not valid JSON.');
    }
  }

  async #load(): Promise<void> {
    if (this.#manifest !== undefined && !this.hasAttribute('src')) return;
    this.#cancelLoad();
    const request = this.#request;
    try {
      const inline = this.querySelector(INLINE_MANIFEST);
      const parsed = inline ? this.#parseInline(inline) : null;
      if (parsed) {
        this.#apply(parsed.value);
        return;
      }
      const src = this.getAttribute('src');
      if (!src) {
        this.#state = { status: 'loading' };
        this.#render();
        this.#waitForMarkup();
        return;
      }
      const url = new URL(src, document.baseURI);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) manifest URLs are allowed.');
      this.#state = { status: 'loading' };
      this.#render();
      const controller = new AbortController();
      this.#abort = controller;
      const response = await fetch(url.href, { credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error(`Could not load manifest (HTTP ${response.status}).`);
      const manifest: unknown = await response.json();
      if (request === this.#request) this.#apply(manifest);
    } catch (error) {
      if (request !== this.#request) return;
      const message = error instanceof Error ? error.message : String(error);
      this.#state = { status: 'error', message };
      this.#render();
      this.#emit('app-lens:error', { message });
    }
  }

  #apply(manifest: unknown): void {
    this.#manifest = manifest;
    this.#state = { status: 'ready' };
    this.#render();
    const result = parseManifest(manifest);
    if (result.ok) {
      this.#emit('app-lens:ready');
    } else {
      this.#emit('app-lens:error', { message: `This manifest has ${result.issues.length} problem(s).`, issues: result.issues });
    }
  }

  #onEvent = (event: AppLensEvent): void => this.#emit('app-lens:event', event);

  #emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }

  #render(): void {
    if (!this.#root) return;
    const theme = sanitizeTheme({
      mode: this.getAttribute('theme'),
      primary: this.getAttribute('primary'),
      accent: this.getAttribute('accent'),
      radius: this.getAttribute('radius'),
      font: this.getAttribute('font'),
    });
    const tabAttribute = this.getAttribute('tab') as Tab | null;
    const tab = tabAttribute && TABS.includes(tabAttribute) ? tabAttribute : undefined;
    const persona = this.getAttribute('persona') ?? undefined;

    if (this.#state.status === 'ready') {
      this.#root.render(<AppLensView manifest={this.#manifest} theme={theme} embedded initialTab={tab} initialPersona={persona} onEvent={this.#onEvent} />);
    } else {
      this.#root.render(
        <Frame overrides={theme} embedded>
          {this.#state.status === 'error' ? (
            <div className="al-alert al-alert-error" role="alert">{this.#state.message}</div>
          ) : (
            <p className="al-muted">Loading…</p>
          )}
        </Frame>,
      );
    }
  }
}

if (!customElements.get('app-lens')) customElements.define('app-lens', AppLensElement);

declare global {
  interface HTMLElementTagNameMap {
    'app-lens': AppLensElement;
  }
}

export { AppLensElement };
