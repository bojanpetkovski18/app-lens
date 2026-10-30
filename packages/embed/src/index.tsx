import { AppLensView, Frame, sanitizeTheme, TABS, type Tab } from '@app-lens/ui';
import styles from '@app-lens/ui/styles.css?inline';
import { createRoot, type Root } from 'react-dom/client';

type State = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

const HOST_STYLES = ':host { display: block; } :host([hidden]) { display: none; }';

class AppLensElement extends HTMLElement {
  static observedAttributes = ['src', 'theme', 'primary', 'accent', 'radius', 'font', 'tab', 'persona'];

  #root: Root | null = null;
  #manifest: unknown = undefined;
  #state: State = { status: 'loading' };
  #request = 0;

  get manifest(): unknown {
    return this.#manifest;
  }

  set manifest(value: unknown) {
    this.#request++;
    this.#manifest = value;
    this.#state = { status: 'ready' };
    this.#render();
    this.#emit('app-lens:ready');
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
      const style = document.createElement('style');
      style.textContent = styles + HOST_STYLES;
      const mount = document.createElement('div');
      shadow.replaceChildren(style, mount);
      this.#root = createRoot(mount);
    }

    if (this.#manifest === undefined) void this.#load();
    else this.#render();
  }

  disconnectedCallback(): void {
    // Unmount in a microtask so moving the element within the page does not tear it down.
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.#root?.unmount();
      this.#root = null;
    });
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (previous === next || !this.#root) return;
    if (name === 'src') void this.#load();
    else this.#render();
  }

  async #load(): Promise<void> {
    const request = ++this.#request;
    const inline = this.querySelector('script[type="application/json"]');
    try {
      if (inline) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(inline.textContent ?? '');
        } catch {
          throw new Error('The inline manifest is not valid JSON.');
        }
        this.#finish(request, parsed);
        return;
      }
      const src = this.getAttribute('src');
      if (!src) {
        this.#state = { status: 'loading' };
        this.#render();
        return;
      }
      const url = new URL(src, document.baseURI);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) manifest URLs are allowed.');
      this.#state = { status: 'loading' };
      this.#render();
      const response = await fetch(url.href, { credentials: 'omit' });
      if (!response.ok) throw new Error(`Could not load manifest (HTTP ${response.status}).`);
      const manifest: unknown = await response.json();
      this.#finish(request, manifest);
    } catch (error) {
      if (request !== this.#request) return;
      const message = error instanceof Error ? error.message : String(error);
      this.#state = { status: 'error', message };
      this.#render();
      this.#emit('app-lens:error', { message });
    }
  }

  #finish(request: number, manifest: unknown): void {
    if (request !== this.#request) return;
    this.#manifest = manifest;
    this.#state = { status: 'ready' };
    this.#render();
    this.#emit('app-lens:ready');
  }

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
      this.#root.render(
        <AppLensView key={`${tab}|${persona}`} manifest={this.#manifest} theme={theme} embedded initialTab={tab} initialPersona={persona} />,
      );
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
